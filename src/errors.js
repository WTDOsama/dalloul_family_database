// ===========================================================================
// تحويل أخطاء قاعدة البيانات/الشبكة إلى رسائل عربية آمنة
// لا يتم أبداً عرض تفاصيل تقنية أو أسرار للمستخدم.
// ===========================================================================

/** خريطة أعمدة القيود الفريدة إلى رسائل عربية */
const UNIQUE_MESSAGES = [
  [/orphan_code/i, 'رقم الملف مستخدم بالفعل ليتيم آخر.'],
  [/national_id/i, 'رقم الهوية مسجل مسبقاً ليتيم آخر.'],
  [/qr_id/i, 'تعذر توليد معرف QR، يرجى المحاولة مرة أخرى.'],
  [/families_name_lower|families_name/i, 'اسم الأسرة موجود بالفعل.'],
  [/family_code/i, 'رمز الأسرة مستخدم بالفعل، جرب تركه فارغاً ليُنشأ تلقائياً.'],
  [/username/i, 'اسم المستخدم مستخدم مسبقاً.'],
  [/email/i, 'البريد الإلكتروني مستخدم مسبقاً.'],
];

export function friendlyError(error) {
  if (!error) return 'حدث خطأ غير متوقع.';

  const code = error.code || '';
  const message = String(error.message || '');
  const details = String(error.details || '');
  const hint = String(error.hint || '');

  // قيود فريدة — سجل مكرر
  if (code === '23505') {
    for (const [re, msg] of UNIQUE_MESSAGES) {
      if (re.test(details) || re.test(message) || re.test(hint)) return msg;
    }
    return 'هذا السجل موجود بالفعل.';
  }

  // قيود مرجعية
  if (code === '23503') {
    if (/still referenced from table "orphans"/i.test(details)) {
      return 'لا يمكن حذف الأسرة لوجود أيتام مرتبطين بها.';
    }
    if (/still referenced/i.test(details)) {
      return 'لا يمكن حذف السجل لوجود سجلات مرتبطة به.';
    }
    return 'القيمة المرجعية غير صحيحة (تأكد من صحة الأسرة المحددة).';
  }

  // قيود تحقق (check constraints)
  if (code === '23514') {
    if (/phone/i.test(message + details)) return 'رقم الجوال غير صحيح. الصيغة الصحيحة: 05XXXXXXXX أو +9705XXXXXXXX';
    if (/national_id/i.test(message + details)) return 'رقم الهوية يجب أن يكون 9 أرقام.';
    if (/birth_date|current_date/i.test(message + details)) return 'لا يمكن إدخال تاريخ ميلاد في المستقبل.';
    return 'إحدى القيم المدخلة غير صالحة، يرجى مراجعة الحقول.';
  }

  // صلاحيات
  if (code === '42501' || error.status === 403) {
    return 'ليس لديك صلاحية لتنفيذ هذه العملية.';
  }

  // جلسة منتهية
  if (code === 'PGRST301' || error.status === 401 ||
      /jwt|token/i.test(message) && /invalid|expired/i.test(message)) {
    return 'انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.';
  }

  // شبكة
  if (/fetch|network|Failed to fetch/i.test(message) || error.isNetworkError) {
    return 'تعذر الاتصال بقاعدة البيانات. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
  }

  return 'تعذر تنفيذ العملية، يرجى المحاولة مرة أخرى.';
}

/** رسائل أخطاء المصادقة (Supabase Auth) */
export function friendlyAuthError(error) {
  if (!error) return 'حدث خطأ غير متوقع.';
  const msg = String(error.message || error.error || '');
  if (/invalid login credentials/i.test(msg)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (/email not confirmed/i.test(msg)) return 'يرجى تأكيد البريد الإلكتروني أولاً من الرسالة المرسلة إليك.';
  if (/too many attempts|over_request_rate/i.test(msg)) return 'محاولات كثيرة جداً، يرجى الانتظار قليلاً ثم المحاولة.';
  if (/user already registered|already been registered/i.test(msg)) return 'البريد الإلكتروني مسجل مسبقاً.';
  if (/password should be at least/i.test(msg)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
  if (/fetch|network/i.test(msg)) return 'تعذر الاتصال بخادم تسجيل الدخول. تحقق من اتصال الإنترنت.';
  if (/rate limit/i.test(msg)) return 'محاولات كثيرة جداً، يرجى الانتظار قليلاً.';
  return 'تعذر تسجيل الدخول، يرجى المحاولة مرة أخرى.';
}
