#!/usr/bin/env node
// ===========================================================================
// فحص سريع للنشر على Vercel (Smoke Test)
//   BASE_URL=https://your-app.vercel.app node tests/smoke-test.mjs
// ===========================================================================
const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error('حدد BASE_URL=https://your-app.vercel.app');
  process.exit(1);
}

let passed = 0, failed = 0;
async function check(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log(`\nفحص التطبيق المنشور: ${BASE}\n`);

// 1) الصفحة الرئيسية
const home = await fetch(BASE);
const html = await home.text();
check('الصفحة الرئيسية ترجع 200', home.status === 200);
check('الواجهة العربية موجودة', html.includes('قاعدة بيانات أيتام عائلة دلول'));
check('اتجاه RTL', html.includes('dir="rtl"'));
check('لا يحتوي على مفاتيح سرية', !html.includes('service_role') && !/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]eyJ/.test(html));

// 2) حزمة الجافاسكريبت
const jsMatch = html.match(/src="(\/assets\/[^"]+\.js)"/);
if (jsMatch) {
  const js = await fetch(BASE + jsMatch[1]);
  check('حزمة JavaScript تُخدم بنجاح', js.status === 200);
  const jsText = await js.text();
  check('الحزمة تحتوي عميل Supabase', jsText.includes('supabase'));
  // اسم المتغير قد يظهر في نص إرشادي — المهم ألا تظهر قيمته (JWT يبدأ بـ eyJ)
  check('الحزمة لا تكشف مفتاح الخدمة', !/SERVICE_ROLE_KEY[^"]*ey[A-Za-z0-9_-]{20,}/.test(jsText) && !/["']eyJ[A-Za-z0-9_-]{50,}["']/.test(jsText));
} else {
  check('وجد رابط حزمة JavaScript', false);
}

// 3) نقطة الفحص الصحية
const health = await fetch(BASE + '/api/health');
const healthJson = await health.json().catch(() => ({}));
check('‏/api/health تعمل', health.status === 200 && healthJson.ok === true);
check('الخادم مهيأ بمفتاح الخدمة', healthJson.supabase_server_configured === true);

// 4) حماية API للمستخدمين (بدون توكن يجب أن ترفض)
const usersGuard = await fetch(BASE + '/api/admin/users');
check('‏/api/admin/users ترفض بدون مصادقة (401)', usersGuard.status === 401);

// 5) رؤوس الأمان
check('رأس X-Content-Type-Options', (home.headers.get('x-content-type-options') || '') === 'nosniff');

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل\n`);
process.exit(failed > 0 ? 1 : 0);
