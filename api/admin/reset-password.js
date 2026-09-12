// ===========================================================================
// /api/admin/reset-password — توليد رابط استعادة كلمة مرور لمستخدم (للمدير)
// الرابط يُعاد للمدير ليشاركه مع المستخدم بطريقة آمنة.
// ===========================================================================
import { requireAdmin, jsonError, isValidEmail, getClientIP, logAdminAction } from '../_lib/admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return jsonError(res, 405, 'طريقة طلب غير مدعومة.');
  }

  const guard = await requireAdmin(req);
  if (guard.error) return jsonError(res, guard.status, guard.error);
  const { svc, profile: callerProfile } = guard;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { email } = body;

    if (!isValidEmail(email)) return jsonError(res, 400, 'البريد الإلكتروني غير صحيح.');

    const { data, error } = await svc.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    if (error) {
      if (/user not found/i.test(error.message)) {
        return jsonError(res, 404, 'لا يوجد حساب بهذا البريد الإلكتروني.');
      }
      throw error;
    }

    await logAdminAction(
      svc, callerProfile, 'password_reset_request', 'auth', null,
      `توليد رابط استعادة كلمة مرور للحساب: ${email}`,
      { email }, getClientIP(req)
    );

    return res.status(200).json({ link: data?.properties?.action_link || null });
  } catch (err) {
    console.error('reset-password error:', err.message);
    return jsonError(res, 500, 'تعذر توليد الرابط، حاول مرة أخرى.');
  }
}
