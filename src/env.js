// ===========================================================================
// إعدادات البيئة وعميل Supabase العام (الواجهة الأمامية)
// لا يحتوي هذا الملف على أي مفاتيح سرية — فقط المفاتيح العامة الآمنة.
// المفتاح السري (SUPABASE_SERVICE_ROLE_KEY) يُستخدم في الخادم فقط (api/).
// ===========================================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,     // استعادة الجلسة تلقائياً عند إعادة فتح الموقع
        autoRefreshToken: true,   // تجديد الرمز قبل انتهائه
        detectSessionInUrl: true, // استقبال روابط استعادة كلمة المرور
      },
    })
  : null;

/** يعرض شاشة خطأ عربية واضحة إذا لم تُضبط متغيرات البيئة على Vercel */
export function renderConfigError() {
  document.documentElement.innerHTML = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="background:#fff;border-radius:16px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);padding:40px;max-width:520px;text-align:center;">
        <div style="font-size:56px;margin-bottom:16px;">⚙️</div>
        <h1 style="color:#1e293b;font-size:22px;margin-bottom:12px;">لم يتم إعداد ربط قاعدة البيانات بعد</h1>
        <p style="color:#64748b;font-size:15px;line-height:1.8;">
          هذا التطبيق يعمل بقاعدة بيانات Supabase.
          يرجى إضافة متغيرات البيئة التالية في إعدادات Vercel ثم إعادة النشر:
        </p>
        <div dir="ltr" style="background:#f1f5f9;border-radius:8px;padding:14px;font-family:monospace;font-size:13px;text-align:left;margin:16px 0;color:#334155;">
          VITE_SUPABASE_URL<br>
          VITE_SUPABASE_ANON_KEY<br>
          SUPABASE_SERVICE_ROLE_KEY <span style="color:#ef4444;">(server only)</span>
        </div>
        <p style="color:#64748b;font-size:13px;">راجع ملف README.md داخل المشروع لخطوات الإعداد الكاملة.</p>
      </div>
    </div>`;
}
