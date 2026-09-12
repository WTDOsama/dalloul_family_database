// ===========================================================================
// /api/admin/users — إدارة المستخدمين (خادم فقط، للمدير النشط حصراً)
//   GET    → قائمة المستخدمين (بيانات + ملفات + آخر دخول)
//   POST   → إنشاء مستخدم جديد (مع كلمة مرور مؤقتة إن لم تُحدد)
//   PATCH  → تعديل الدور/التفعيل/الاسم
//   DELETE → حذف مستخدم نهائياً
// الحماية: تحقق JWT + دور المدير + منع تعطيل/حذف آخر مدير نشط
// ===========================================================================
import {
  requireAdmin, jsonError, getClientIP, isValidEmail,
  generateTempPassword, logAdminAction,
} from '../_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const guard = await requireAdmin(req);
  if (guard.error) return jsonError(res, guard.status, guard.error);
  const { svc, user: caller, profile: callerProfile } = guard;

  try {
    switch (req.method) {
      case 'GET':
        return await listUsers(svc, res);
      case 'POST':
        return await createUser(svc, req, res, callerProfile);
      case 'PATCH':
        return await updateUser(svc, req, res, caller, callerProfile);
      case 'DELETE':
        return await deleteUser(svc, req, res, caller, callerProfile);
      default:
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
        return jsonError(res, 405, 'طريقة طلب غير مدعومة.');
    }
  } catch (err) {
    console.error('admin/users error:', err.message);
    return jsonError(res, 500, 'تعذر تنفيذ العملية، حاول مرة أخرى.');
  }
}

// -------------------------------------------------------------- القائمة ---
async function listUsers(svc, res) {
  const users = [];
  let page = 1;
  // صفحات بحجم 500 حتى نجمع كل الحسابات
  for (let i = 0; i < 50; i++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if (!data?.users?.length || users.length >= (data.total || 0)) break;
    page++;
  }

  const { data: profiles } = await svc.from('profiles').select('*');
  const profileByUser = new Map((profiles || []).map((p) => [p.user_id, p]));

  const merged = users.map((u) => {
    const p = profileByUser.get(u.id) || {};
    return {
      id: u.id,
      email: u.email || '',
      full_name: p.full_name || u.user_metadata?.full_name || '',
      username: p.username || '',
      role: p.role || 'pending',
      is_active: Boolean(p.is_active),
      created_at: p.created_at || u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
    };
  });

  return res.status(200).json({ users: merged });
}

// ------------------------------------------------------------ إنشاء مستخدم ---
async function createUser(svc, req, res, callerProfile) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { email, password, full_name, username, role } = body;

  if (!isValidEmail(email)) return jsonError(res, 400, 'البريد الإلكتروني غير صحيح.');
  if (!full_name || String(full_name).trim().length < 2) {
    return jsonError(res, 400, 'الاسم الكامل مطلوب.');
  }
  if (!['admin', 'staff', 'viewer'].includes(role)) {
    return jsonError(res, 400, 'الدور غير صالح. يجب أن يكون admin أو staff أو viewer.');
  }
  const tempPassword = password && String(password).length >= 6 ? String(password) : generateTempPassword();
  if (password && String(password).length < 6) {
    return jsonError(res, 400, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  }

  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: String(full_name).trim(), username: username || null },
  });
  if (error) {
    if (/already registered/i.test(error.message)) {
      return jsonError(res, 409, 'البريد الإلكتروني مستخدم مسبقاً.');
    }
    throw error;
  }

  // الملف يُنشأ تلقائياً كـ pending عبر الـ trigger — نضبط الدور والتفعيل الآن
  const { error: profileError } = await svc
    .from('profiles')
    .update({
      role,
      is_active: true,
      full_name: String(full_name).trim(),
      username: username || null,
    })
    .eq('user_id', created.user.id);
  if (profileError) throw profileError;

  await logAdminAction(
    svc, callerProfile, 'user_create', 'profile', created.user.id,
    `إنشاء مستخدم جديد: ${email} بدور ${role}`,
    { email, role }, getClientIP(req)
  );

  return res.status(201).json({
    user_id: created.user.id,
    temp_password: password ? undefined : tempPassword,
  });
}

// ------------------------------------------------------------ تعديل مستخدم ---
async function updateUser(svc, req, res, caller, callerProfile) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { user_id, role, is_active, full_name, username } = body;

  if (!user_id) return jsonError(res, 400, 'معرف المستخدم مطلوب.');

  const { data: target } = await svc.from('profiles').select('*').eq('user_id', user_id).single();
  if (!target) return jsonError(res, 404, 'المستخدم غير موجود.');

  // لا يمكن للمدير تعديل دوره أو حالته بنفسه (منع فقدان السيطرة على النظام)
  if (user_id === caller.id && (role !== undefined || is_active !== undefined)) {
    return jsonError(res, 409, 'لا يمكنك تغيير دورك أو حالة حسابك بنفسك.');
  }

  if (role !== undefined && !['admin', 'staff', 'viewer'].includes(role)) {
    return jsonError(res, 400, 'الدور غير صالح.');
  }

  // حماية آخر مدير نشط
  const demotingAdmin = target.role === 'admin' &&
    ((role !== undefined && role !== 'admin') || is_active === false);
  if (demotingAdmin) {
    const { count } = await svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);
    if ((count || 0) <= 1) {
      return jsonError(res, 409, 'لا يمكن تعطيل أو تغيير دور آخر مدير نشط في النظام.');
    }
  }

  const updates = {};
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);
  if (full_name !== undefined && String(full_name).trim()) updates.full_name = String(full_name).trim();
  if (username !== undefined) updates.username = username || null;

  if (Object.keys(updates).length === 0) {
    return jsonError(res, 400, 'لا توجد تغييرات مطلوبة.');
  }

  const { error } = await svc.from('profiles').update(updates).eq('user_id', user_id);
  if (error) {
    if (error.code === '23505') return jsonError(res, 409, 'اسم المستخدم مستخدم مسبقاً.');
    throw error;
  }

  await logAdminAction(
    svc, callerProfile, 'user_update', 'profile', user_id,
    `تعديل مستخدم: ${target.full_name || user_id} — ${Object.keys(updates).join(', ')}`,
    { updates }, getClientIP(req)
  );

  return res.status(200).json({ ok: true });
}

// ------------------------------------------------------------ حذف مستخدم ---
async function deleteUser(svc, req, res, caller, callerProfile) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { user_id } = body;
  if (!user_id) return jsonError(res, 400, 'معرف المستخدم مطلوب.');
  if (user_id === caller.id) {
    return jsonError(res, 409, 'لا يمكنك حذف حسابك بنفسك.');
  }

  const { data: target } = await svc.from('profiles').select('*').eq('user_id', user_id).single();
  if (!target) return jsonError(res, 404, 'المستخدم غير موجود.');

  if (target.role === 'admin' && target.is_active) {
    const { count } = await svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);
    if ((count || 0) <= 1) {
      return jsonError(res, 409, 'لا يمكن حذف آخر مدير نشط في النظام.');
    }
  }

  // حذف حساب المصادقة (يُحذف ملفه تلقائياً عبر ON DELETE CASCADE)
  const { error } = await svc.auth.admin.deleteUser(user_id);
  if (error) throw error;

  await logAdminAction(
    svc, callerProfile, 'user_delete', 'profile', user_id,
    `حذف مستخدم: ${target.full_name || user_id}`,
    { email: null }, getClientIP(req)
  );

  return res.status(200).json({ ok: true });
}
