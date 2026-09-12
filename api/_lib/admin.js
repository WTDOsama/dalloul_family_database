// ===========================================================================
// أدوات الخادم المشتركة (لدوال Vercel) — تحقق المدير + عميل خدمة Supabase
// ملاحظة أمنية: SUPABASE_SERVICE_ROLE_KEY يوجد في خادم Vercel فقط
// ولا يُسلَّم أبداً إلى المتصفح.
// ===========================================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

export function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || null;
}

export function isServerConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/** عميل بمفتاح الخدمة — يمرر RLS للعمليات الإدارية الخادمية فقط */
export function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * التحقق من أن الطلب صادر عن مدير نشط:
 *  1) يتحقق من توقيع JWT الخاص بالمستخدم عبر Supabase Auth
 *  2) يقرأ دوره من جدول profiles عبر عميل الخدمة
 */
export async function requireAdmin(req) {
  if (!isServerConfigured()) {
    return { status: 500, error: 'إعدادات الخادم غير مكتملة (SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { status: 401, error: 'انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.' };
  }

  const svc = serviceClient();
  const { data: userData, error: userError } = await svc.auth.getUser(token);
  if (userError || !userData?.user) {
    return { status: 401, error: 'انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.' };
  }

  const { data: profile } = await svc
    .from('profiles')
    .select('*')
    .eq('user_id', userData.user.id)
    .single();

  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return { status: 403, error: 'ليس لديك صلاحية لتنفيذ هذه العملية.' };
  }

  return { svc, user: userData.user, profile };
}

/** تسجيل حدث إداري في سجل النشاط (من الخادم مع عنوان IP) */
export async function logAdminAction(svc, actorProfile, action, entityType, entityId, description, metadata, ip) {
  try {
    await svc.from('activity_logs').insert({
      user_id: actorProfile.user_id,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description,
      metadata: metadata || {},
      ip_address: ip || null,
    });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 254;
}

/** كلمة مرور مؤقتة عشوائية قوية */
export function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}
