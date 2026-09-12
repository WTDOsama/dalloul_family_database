#!/usr/bin/env node
// ===========================================================================
// اختبار شامل من طرف إلى طرف (E2E) للواجهة المبنية (dist/)
// يشغّل متصفحاً حقيقياً (Chromium) على التطبيق الفعلي مع محاكاة خادم Supabase
// على مستوى الشبكة — أي أن كود التطبيق الحقيقي هو الذي يعمل بالكامل.
//
//   node tests/e2e-ui-test.mjs
//
// ===========================================================================
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = 4599;

// ---------------------------------------------------- خادم ملفات ثابت ---
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

// ---------------------------------------------------------- بيانات المحاكاة ---
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const VIEWER_ID = '33333333-3333-3333-3333-333333333333';
const FAM_ID = 'aaaaaaa1-0000-0000-0000-000000000001';

const mock = {
  adminExists: true,
  userId: ADMIN_ID,
  role: 'admin',
  fullName: 'المدير التجريبي',
  orphanInsertFails: false,
  requests: [],
};

const ORPHAN_ROWS = [
  {
    id: 'bbbbbbb1-0000-0000-0000-000000000001',
    orphan_code: 'A-001', full_name: 'أحمد محمد خليل دلول', gender: 'male',
    birth_date: '2015-03-15', national_id: '123456789', status: 'father',
    education: 'school', health: 'healthy', notes: null,
    father_name: 'محمد خليل', mother_name: 'فاطمة علي',
    father_death_date: '2020-01-10', father_death_cause: 'مرض',
    mother_death_date: null, mother_death_cause: null,
    original_address: 'نابلس', current_address: 'نابلس - البلدة القديمة',
    governorate: 'نابلس', city: 'نابلس', area: 'المركز',
    housing_status: 'rental', displaced: 'yes',
    guardian_name: 'فاطمة علي', guardian_relationship: 'الأم',
    primary_phone: '0598111222', alternative_phone: null, income_source: 'أعمال موسمية',
    family_members: 6, economic_status: 'poor', general_needs: 'دعم غذائي',
    school_name: 'مدرسة الأمل', grade: 'الخامس', health_condition: null,
    has_disability: false, disability_type: null, required_treatment: null,
    sponsorship_status: 'sponsored', needs: ['food', 'clothes'],
    qr_id: 'ORPHAN:TEST:abc123', family_id: FAM_ID,
    created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-02T10:00:00Z',
    created_by: ADMIN_ID, updated_by: ADMIN_ID,
    families: { id: FAM_ID, name: 'عائلة دلول - خليل', family_code: 'FAM-1000', district: 'نابلس', guardian: 'فاطمة علي', phone: '0598111222' },
  },
  {
    id: 'bbbbbbb2-0000-0000-0000-000000000002',
    orphan_code: 'A-002', full_name: 'مريم أحمد عبد الله', gender: 'female',
    birth_date: '2012-07-20', national_id: null, status: 'both',
    education: 'school', health: 'chronic', notes: null,
    sponsorship_status: 'needs', needs: ['medicine'],
    displaced: 'no', housing_status: 'house', family_id: FAM_ID,
    guardian_name: 'سارة عبد الله',
    created_at: '2026-01-03T10:00:00Z', updated_at: '2026-01-03T10:00:00Z',
    families: { id: FAM_ID, name: 'عائلة دلول - خليل', family_code: 'FAM-1000', district: 'نابلس' },
  },
];

const DASHBOARD = {
  totalOrphans: 2, males: 1, females: 1, fatherOrphans: 1, motherOrphans: 0,
  bothOrphans: 1, sponsored: 1, unsponsored: 0, needsSponsor: 1,
  totalFamilies: 1, displaced: 1, totalAssistance: 3, totalFollowUps: 2, needsHelp: 1,
};

const STATS = {
  gender: { male: 1, female: 1 },
  orphanStatus: { father: 1, mother: 0, both: 1 },
  sponsorship: { sponsored: 1, unsponsored: 0, needs: 1 },
  ageGroups: { g0_5: 0, g6_12: 1, g13_18: 1, g18p: 0 },
  education: { notstudying: 0, kindergarten: 0, school: 2, other: 0 },
  health: { healthy: 1, ill: 0, chronic: 1 },
};

// ---------------------------------------------------------- معالجات الشبكة ---
let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✅ ${name}`); };
const bad = (name, extra = '') => { failed++; console.log(`  ❌ ${name} ${extra}`); };
async function check(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, `— ${e.message.split('\n')[0]}`); }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('  [pageerror]', err.message.slice(0, 100), '||', String(err.stack || '').split('\n')[1]?.trim().slice(0, 90)));

const json = (body, status = 200, headers = {}) => ({
  status, contentType: 'application/json', headers, body: JSON.stringify(body),
});

// --- مصادقة ---
await context.route('**/auth/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  if (url.includes('token')) {
    return route.fulfill(json({
      access_token: `mock-token-${mock.userId.slice(0, 8)}`,
      refresh_token: 'mock-refresh', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: mock.userId, email: mock.userId.startsWith('1111') ? 'admin@daloul.test' : 'viewer@daloul.test',
        aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }
  if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' });
  if (req.method() === 'GET' && url.includes('/user')) {
    return route.fulfill(json({ id: mock.userId, email: 'x@daloul.test', role: 'authenticated' }));
  }
  if (req.method() === 'PUT') return route.fulfill(json({ id: mock.userId, email: 'x@daloul.test' }));
  return route.fulfill(json({}, 200));
});

// --- REST (PostgREST) ---
await context.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const range = (arr, extra = {}) => {
    const total = arr.length;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: {
        'content-range': `0-${Math.max(total - 1, 0)}/${total}`,
        'access-control-expose-headers': 'content-range', // كما يفعل Supabase الحقيقي
        ...extra,
      },
      body: JSON.stringify(wantsObject ? arr[0] : arr),
    });
  };

  mock.requests.push(req.method() + ' ' + p + '?' + url.searchParams.toString().slice(0, 80));

  // RPC
  if (p.endsWith('/rpc/admin_exists')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.adminExists) });
  if (p.endsWith('/rpc/get_dashboard_stats')) return route.fulfill(json(DASHBOARD));
  if (p.endsWith('/rpc/get_statistics')) return route.fulfill(json(STATS));

  // profiles
  if (p.endsWith('/profiles')) {
    const row = {
      id: 'p-' + mock.userId.slice(0, 8), user_id: mock.userId,
      full_name: mock.fullName, username: 'tester', role: mock.role,
      is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    return range([row]);
  }

  // families
  if (p.endsWith('/families')) {
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      const row = { id: 'cccccc1-0000-0000-0000-00000000000c', family_code: 'FAM-2000', name: body.name };
      return route.fulfill(json(wantsObject ? row : [row], 201));
    }
    const select = url.searchParams.get('select') || '';
    if (select.startsWith('id,name')) return range([]); // بحث findOrCreate
    if (select.startsWith('name')) return range([]);    // datalist
    return range([
      { id: FAM_ID, family_code: 'FAM-1000', name: 'عائلة دلول - خليل', guardian: 'فاطمة علي', phone: '0598111222', district: 'نابلس', address: 'نابلس', housing: 'rental', income: 'أعمال موسمية', family_members: 6, economic_status: 'poor', displaced: 'yes', notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', orphans: [{ count: 2 }] },
    ]);
  }

  // orphans
  if (p.endsWith('/orphans')) {
    if (req.method() === 'POST') {
      if (mock.orphanInsertFails) {
        return route.fulfill(json({
          code: '23505',
          message: 'duplicate key value violates unique constraint "orphans_orphan_code_key"',
          details: 'Key (orphan_code)=(A-001) already exists.',
        }, 409));
      }
      const body = req.postDataJSON();
      const row = { id: 'dddddd1-0000-0000-0000-00000000000d', ...body };
      return route.fulfill(json(wantsObject ? row : [row], 201));
    }
    return range(ORPHAN_ROWS);
  }

  if (p.endsWith('/activity_logs') && req.method() === 'POST') return route.fulfill(json([], 201));

  return range([]);
});

// --- API الإدارية (نفس الأصل) ---
await context.route('**/api/admin/users*', async (route) => {
  if (route.request().method() === 'GET') {
    return route.fulfill(json({
      users: [
        { id: ADMIN_ID, email: 'admin@daloul.test', full_name: 'المدير التجريبي', username: 'admin', role: 'admin', is_active: true, created_at: '2026-01-01', last_sign_in_at: '2026-09-12T08:00:00Z' },
        { id: VIEWER_ID, email: 'viewer@daloul.test', full_name: 'مشاهد تجريبي', username: 'viewer', role: 'viewer', is_active: true, created_at: '2026-01-02', last_sign_in_at: null },
      ],
    }));
  }
  return route.fulfill(json({ ok: true }));
});

const BASE = `http://localhost:${PORT}`;

// ============================================================ الاختبارات ===
console.log('\n=== 1) شاشة تسجيل الدخول (نظام مُهيأ بمدير) ===');
await page.goto(BASE);
await check('صفحة الدخول ظاهرة بالعربية RTL', async () => {
  await page.waitForSelector('#loginPage', { state: 'visible', timeout: 8000 });
  const rtl = await page.evaluate(() => document.documentElement.dir === 'rtl');
  if (!rtl) throw new Error('not RTL');
});
await check('حقل البريد الإلكتروني موجود', async () => {
  await page.waitForSelector('#email');
});
await check('رابط «نسيت كلمة المرور؟» يعمل', async () => {
  await page.click('a:has-text("نسيت كلمة المرور")');
  await page.waitForSelector('#forgotForm:not(.hidden)', { state: 'visible' });
  await page.click('#forgotForm button:has-text("رجوع")');
});

console.log('\n=== 2) شاشة الإعداد الأولي (لا يوجد مدير) ===');
mock.adminExists = false;
await page.reload();
await check('شاشة إنشاء المدير الأول تظهر تلقائياً', async () => {
  await page.waitForSelector('#setupForm:not(.hidden)', { state: 'visible', timeout: 8000 });
});
await check('التحقق من عدم تطابق كلمتي المرور', async () => {
  await page.fill('#setupFullName', 'مدير النظام');
  await page.fill('#setupEmail', 'admin@daloul.test');
  await page.fill('#setupPassword', '123456');
  await page.fill('#setupConfirmPassword', '654321');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('#setupAlert.show');
  const text = await page.textContent('#setupAlert');
  if (!text.includes('غير متطابقتين')) throw new Error(text);
});
mock.adminExists = true;

console.log('\n=== 3) تسجيل دخول المدير ولوحة التحكم ===');
await page.reload();
await page.waitForSelector('#loginPage', { state: 'visible' });
await page.fill('#email', 'admin@daloul.test');
await page.fill('#password', 'secret123');
await page.click('#loginForm button[type="submit"]');
await check('التطبيق يفتح بعد الدخول', async () => {
  await page.waitForSelector('#appContainer', { state: 'visible', timeout: 8000 });
});
await check('اسم المستخدم ودوره يظهران', async () => {
  await page.waitForFunction(() => document.getElementById('userName').textContent.includes('المدير'));
});
await check('بطاقات لوحة التحكم محسوبة من قاعدة البيانات (12 بطاقة)', async () => {
  await page.waitForSelector('#dashboardStats .stat-card');
  const n = await page.locator('#dashboardStats .stat-card').count();
  if (n !== 12) throw new Error(`found ${n}`);
});
await check('إحصائية «إجمالي الأيتام» تعرض 2 من قاعدة البيانات', async () => {
  const txt = await page.locator('#dashboardStats .stat-card', { hasText: 'إجمالي الأيتام' }).locator('.stat-value').textContent();
  if (!txt.includes('٢') && !txt.includes('2')) throw new Error(txt);
});
await check('عناصر المدير ظاهرة (سجل النشاط + النسخ الاحتياطي)', async () => {
  const logs = await page.locator('#navLogs').isVisible();
  const backup = await page.locator('#navBackup').isVisible();
  if (!logs || !backup) throw new Error('nav items hidden');
});

console.log('\n=== 4) صفحة الأيتام: عرض/بحث/ترقيم ===');
await page.click('.nav-link:has-text("الأيتام")');
await check('صفحة الأيتام تعرض السجلات من قاعدة البيانات', async () => {
  await page.waitForSelector('#orphansTableBody tr');
  const n = await page.locator('#orphansTableBody tr').count();
  if (n !== 2) throw new Error(`rows=${n}`);
});
await check('معلومات الترقيم تعرض الإجمالي', async () => {
  await page.waitForSelector('#orphansPagination .page-info');
  const t = await page.textContent('#orphansPagination');
  if (!t.includes('2')) throw new Error(t);
});
await check('البحث يرسل استعلاماً خادمياً (or= ...)', async () => {
  mock.requests.length = 0;
  await page.click('#searchInput');
  // نص لاتيني: page.type لا يرسل أحداث keyup للأحرف غير اللاتينية (insertText)
  await page.type('#searchInput', 'A-00');
  await page.waitForTimeout(900);
  const hit = mock.requests.some((r) => r.startsWith('GET /rest/v1/orphans') && r.includes('or='));
  if (!hit) throw new Error('no or= query: ' + mock.requests.join(' | '));
  await page.fill('#searchInput', '');
});

console.log('\n=== 5) إضافة يتيم (نموذج الخطوات الثماني) ===');
await page.click('#orphansPage .card-header button:has-text("+ إضافة يتيم")');
await check('نموذج الخطوات الثماني يفتح', async () => {
  await page.waitForSelector('#orphanModal.show');
});
// الانتقال بين الخطوات بحسب الخطوة الحالية الفعلية
const goToStep = async (target) => {
  const cur = Number(await page.evaluate(
    () => document.querySelector('#orphanForm .form-step.active')?.dataset.step || '1'));
  const dir = target >= cur ? '#nextBtn' : '#prevBtn';
  for (let i = 0; i < Math.abs(target - cur); i++) await page.click(dir);
};
await page.fill('#fileNumber', 'TEST-9');
await page.fill('#fullName', 'يتيم اختبار آلي');
await page.selectOption('#gender', 'male');
await page.fill('#dateOfBirth', '2016-05-05');
await page.selectOption('#orphanStatus', 'father');
await page.fill('#nationalId', '987654321');
for (let s = 2; s <= 8; s++) {
  await page.click('#nextBtn');
  if (s === 4) await page.fill('#familyName', 'عائلة اختبار آلي');
  if (s === 8) await page.selectOption('#sponsorshipStatus', 'sponsored');
}
await check('رقم جوال خاطئ يُرفض قبل الإرسال', async () => {
  await goToStep(3);
  await page.fill('#primaryPhone', '12345');
  await goToStep(8);
  mock.requests.length = 0;
  await page.click('#saveBtn');
  await page.waitForTimeout(600);
  if ((await page.locator('#orphanModal.show').count()) === 0) throw new Error('modal closed despite invalid phone');
  if (mock.requests.some((r) => r.startsWith('POST /rest/v1/'))) throw new Error('invalid data reached the server!');
});
// نصلح الرقم ثم نحفظ
await goToStep(3);
await page.fill('#primaryPhone', '0599123456');
await goToStep(8);
await check('الحفظ ينجح ويُغلق النموذج', async () => {
  await page.click('#saveBtn');
  await page.waitForSelector('#orphanModal.show', { state: 'detached', timeout: 6000 });
});
await check('إنشاء الأسرة تلقائياً عند عدم وجودها (POST families)', async () => {
  const hit = mock.requests.some((r) => r.startsWith('POST /rest/v1/families'));
  if (!hit) throw new Error('families POST not found');
});

console.log('\n=== 6) منع التكرار برسالة عربية ===');
await page.click('#orphansPage .card-header button:has-text("+ إضافة يتيم")');
await page.fill('#fileNumber', 'A-001');
await page.fill('#fullName', 'اسم مكرر للاختبار');
await page.selectOption('#gender', 'male');
await page.fill('#dateOfBirth', '2016-05-05');
await page.selectOption('#orphanStatus', 'father');
mock.orphanInsertFails = true;
for (let s = 2; s <= 8; s++) {
  await page.click('#nextBtn');
  if (s === 4) await page.fill('#familyName', 'عائلة دلول - خليل');
  if (s === 8) await page.selectOption('#sponsorshipStatus', 'sponsored');
}
await page.click('#saveBtn');
await check('رسالة «رقم الملف مستخدم بالفعل» تظهر', async () => {
  await page.waitForSelector('body > .alert.show:has-text("رقم الملف مستخدم")', { timeout: 5000 });
});
await page.click('#orphanModal .modal-close');
mock.orphanInsertFails = false;

console.log('\n=== 7) عرض التفاصيل ورمز QR ===');
await page.click('#orphansTableBody tr:first-child button:has-text("عرض")');
await check('نافذة تفاصيل اليتيم تعرض البيانات', async () => {
  await page.waitForSelector('#orphanViewModal.show');
  const t = await page.textContent('#orphanViewContent');
  if (!t.includes('أحمد محمد خليل دلول') || !t.includes('عائلة دلول')) throw new Error('missing data');
});
// مكتبة QR تُحمَّل من CDN في الإنتاج — نعوّضها هنا لأن بيئة الاختبار دون إنترنت
await page.evaluate(() => {
  window.QRCode = {
    toCanvas(el, data, opts, cb) {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 200;
      el.innerHTML = '';
      el.appendChild(c);
      if (typeof cb === 'function') cb(null);
    },
  };
});
await page.click('#orphanViewModal button:has-text("QR")');
await check('رمز QR يُرسم (بدون بيانات حساسة داخل الرمز)', async () => {
  await page.waitForSelector('#qrModal.show');
  await page.waitForSelector('#qrcode canvas', { timeout: 8000 });
  const t = await page.textContent('#qrContent');
  if (t.includes('123456789')) throw new Error('national id visible in QR area');
});
await page.click('#qrModal .modal-close');

console.log('\n=== 8) الإعدادات + إدارة المستخدمين (مدير) ===');
await page.click('.nav-link:has-text("إعدادات")');
await check('لوحة إدارة المستخدمين تُعرض للمدير', async () => {
  await page.waitForSelector('#userManagementCard:not(.hidden)');
  await page.waitForSelector('#usersTableBody tr');
  const n = await page.locator('#usersTableBody tr').count();
  if (n !== 2) throw new Error(`users=${n}`);
});
await check('معلومات النظام تعرض اتصال قاعدة البيانات', async () => {
  await page.waitForFunction(() => document.getElementById('storageInfo').textContent.includes('PostgreSQL'));
});

console.log('\n=== 9) دور المشاهد: قراءة فقط (إخفاء + منع) ===');
await page.click('.user-menu button:has-text("خروج")');
await page.waitForSelector('#loginPage', { state: 'visible' });
mock.role = 'viewer';
mock.userId = VIEWER_ID;
mock.fullName = 'مشاهد تجريبي';
await page.fill('#email', 'viewer@daloul.test');
await page.fill('#password', 'secret123');
await page.click('#loginForm button[type="submit"]');
await check('المشاهد يدخل ويرى لوحة التحكم', async () => {
  await page.waitForSelector('#appContainer', { state: 'visible', timeout: 8000 });
});
await page.click('.nav-link:has-text("الأيتام")');
await check('زر «إضافة يتيم» مخفي عن المشاهد', async () => {
  // ننتظر إعادة العرض بعد جلب بيانات المشاهد (الصفوف القديمة قد تكون من جلسة المدير)
  await page.waitForTimeout(800);
  const btn = page.locator('#orphansPage button:has-text("+ إضافة يتيم")').first();
  if (await btn.isVisible()) throw new Error('add button visible to viewer');
});
await check('أزرار التعديل/الحذف مخفية عن المشاهد', async () => {
  const editCount = await page.locator('#orphansTableBody button:has-text("تعديل")').count();
  const deleteCount = await page.locator('#orphansTableBody button:has-text("حذف")').count();
  if (editCount > 0) throw new Error(`edit buttons rendered for viewer: ${editCount}`);
  if (deleteCount > 0) throw new Error(`delete buttons rendered for viewer: ${deleteCount}`);
});
await check('عناصر المدير مخفية عن المشاهد (سجل النشاط/النسخ/التقارير)', async () => {
  if (await page.locator('#navLogs').isVisible()) throw new Error('logs visible');
  if (await page.locator('#navBackup').isVisible()) throw new Error('backup visible');
  if (await page.locator('#navReports').isVisible()) throw new Error('reports visible');
});
// مكتبة Chart.js تُحمَّل من CDN — نعوّضها بصنف حقيقي يكشف النسيانَ new
await page.evaluate(() => {
  window.__chartInstances = 0;
  class FakeChart {
    constructor(el, config) { window.__chartInstances++; }
  }
  window.Chart = FakeChart;
});
await check('صفحة الإحصاءات تعمل للمشاهد (رسوم بيانية)', async () => {
  await page.click('.nav-link:has-text("الإحصاءات")');
  await page.waitForSelector('#chartsContainer .chart-container', { timeout: 8000 });
  const n = await page.locator('#chartsContainer .chart-container').count();
  if (n !== 4) throw new Error(`charts=${n}`);
  await page.waitForFunction(() => window.__chartInstances >= 4, undefined, { timeout: 5000 });
});

console.log('\n=== 10) تسجيل الخروج ===');
await check('الخروج يعيد لشاشة الدخول', async () => {
  await page.click('.user-menu button:has-text("خروج")');
  await page.waitForSelector('#loginPage', { state: 'visible', timeout: 8000 });
});

console.log('\n=== 11) الجوال (عرض ضيق) ===');
await page.setViewportSize({ width: 390, height: 844 });
await page.fill('#email', 'viewer@daloul.test');
await page.fill('#password', 'secret123');
await page.click('#loginForm button[type="submit"]');
await check('الواجهة تعمل على مقاس الهاتف والقائمة تُفتح', async () => {
  await page.waitForSelector('#appContainer', { state: 'visible', timeout: 8000 });
  await page.click('.mobile-menu-toggle');
  await page.waitForSelector('#sidebar.show');
});

// ============================================================ النتيجة ===
await browser.close();
server.close();
console.log('\n==========================================');
console.log(`النتيجة: ${passed} ناجح، ${failed} فاشل`);
console.log('==========================================\n');
process.exit(failed > 0 ? 1 : 0);
