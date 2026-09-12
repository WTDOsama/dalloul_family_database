#!/usr/bin/env node
// ===========================================================================
// اختبار شامل للأمان والوظائف على مشروع Supabase الحقيقي
// يجب تشغيله بعد تطبيق الترحيلات وتفعيل المستخدمين.
//
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   STAFF_EMAIL=... STAFF_PASSWORD=... \
//   VIEWER_EMAIL=... VIEWER_PASSWORD=... \
//   node tests/rls-test.mjs
//
// إذا لم تتوفر حسابات staff/viewer سيتم تخطي اختباراتها.
// ===========================================================================
import { createClient } from '@supabase/supabase-js';
// Node 20 بلا WebSocket أصلي: مكتبة realtime تحتاج وسيلة نقل — نمرر ws
import ws from 'ws';

const OPTS = { realtime: { transport: ws } };

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

if (!URL || !ANON || !SERVICE) {
  console.error('المتغيرات المطلوبة: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const anon = createClient(URL, ANON, OPTS);
const service = createClient(URL, SERVICE, OPTS);

async function userClient(email, password) {
  const c = createClient(URL, ANON, OPTS);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) return null;
  return c;
}

console.log('\n=== 1) وصول مجهول (anon) — يجب أن يُمنع بالكامل ===');
{
  const { data: orphans } = await anon.from('orphans').select('*');
  check('anon لا يقرأ الأيتام', (orphans || []).length === 0);
  const { data: families } = await anon.from('families').select('*');
  check('anon لا يقرأ الأسر', (families || []).length === 0);
  const { data: logs } = await anon.from('activity_logs').select('*');
  check('anon لا يقرأ سجل النشاط', (logs || []).length === 0);
  const { data: profiles } = await anon.from('profiles').select('*');
  check('anon لا يقرأ ملفات المستخدمين', (profiles || []).length === 0);
  const { error: insErr } = await anon.from('orphans')
    .insert({ orphan_code: 'HACK-1', full_name: 'اسم اختراق وهمي', gender: 'male', status: 'father' });
  check('anon لا يضيف أيتاماً', Boolean(insErr));
  const { error: rpcErr } = await anon.rpc('get_dashboard_stats');
  check('anon لا يستدعي إحصاءات لوحة التحكم', Boolean(rpcErr));
}

console.log('\n=== 2) قيود قاعدة البيانات ===');
{
  const ts = Date.now();
  const fam = await service.from('families').insert({ name: `أسرة اختبار آلي ${ts}` }).select('id').single();
  check('إنشاء أسرة عبر service', !fam.error);
  const famId = fam.data?.id;

  const ok = await service.from('orphans').insert({
    orphan_code: `T-${ts}`, full_name: 'يتيم اختبار آلي', gender: 'male',
    birth_date: '2016-01-01', status: 'father', family_id: famId,
    sponsorship_status: 'sponsored', primary_phone: '0598765432',
  });
  check('إنشاء يتيم صحيح', !ok.error);

  const dup = await service.from('orphans').insert({
    orphan_code: `T-${ts}`, full_name: 'اسم مكرر آلي', gender: 'female', status: 'mother',
  });
  check('منع تكرار رقم الملف (23505)', dup.error?.code === '23505');

  const badPhone = await service.from('orphans').insert({
    orphan_code: `T-P-${ts}`, full_name: 'رقم جوال خاطئ', gender: 'male', status: 'father',
    primary_phone: '12345',
  });
  check('رفض جوال غير فلسطيني (23514)', badPhone.error?.code === '23514');

  const future = await service.from('orphans').insert({
    orphan_code: `T-F-${ts}`, full_name: 'تاريخ مستقبلي', gender: 'male', status: 'father',
    birth_date: '2100-01-01',
  });
  check('رفض تاريخ ميلاد مستقبلي (23514)', future.error?.code === '23514');

  const badFam = await service.from('orphans').insert({
    orphan_code: `T-X-${ts}`, full_name: 'أسرة غير موجودة', gender: 'male', status: 'father',
    family_id: '00000000-0000-0000-0000-000000000000',
  });
  check('رفض معرف أسرة غير موجود (23503)', badFam.error?.code === '23503');

  const delFam = await service.from('families').delete().eq('id', famId);
  check('منع حذف أسرة عليها أيتام (23503)', delFam.error?.code === '23503');

  // تنظيف
  await service.from('orphans').delete().eq('orphan_code', `T-${ts}`);
  await service.from('families').delete().eq('id', famId);
  const famGone = await service.from('families').select('id').eq('id', famId).maybeSingle();
  check('حذف أسرة بدون أيتام مسموح', !famGone.data);
}

console.log('\n=== 3) حساب المدير (ADMIN) ===');
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
let admin = null;
if (adminEmail && adminPassword) {
  admin = await userClient(adminEmail, adminPassword);
  check('تسجيل دخول المدير', Boolean(admin));

  if (admin) {
    const ts = Date.now();
    const fam = await admin.from('families').insert({ name: `أسرة مدير ${ts}` }).select('id, family_code').single();
    check('المدير ينشئ أسرة (RLS يسمح)', !fam.error && /^FAM-/.test(fam.data?.family_code || ''));

    const o = await admin.from('orphans').insert({
      orphan_code: `A-${ts}`, full_name: 'يتيم اختبار المدير', gender: 'male',
      status: 'father', family_id: fam.data?.id,
    }).select('id, qr_id, created_by').single();
    check('المدير ينشئ يتيماً', !o.error);
    check('created_by يُختم تلقائياً', Boolean(o.data?.created_by));
    check('qr_id فريد وآمن (ORPHAN:...)', /^ORPHAN:/.test(o.data?.qr_id || ''));

    const upd = await admin.from('orphans').update({ notes: 'تحديث اختباري' }).eq('id', o.data.id);
    check('المدير يعدل', !upd.error);

    const profiles = await admin.from('profiles').select('*');
    check('المدير يرى كل الملفات', (profiles.data || []).length >= 1);

    const logs = await admin.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(5);
    check('المدير يقرأ سجل النشاط', !logs.error && (logs.data || []).length > 0);
    const hasAudit = (logs.data || []).some((l) => ['create', 'update'].includes(l.action));
    check('سجل النشاط وثّق عمليات المدير تلقائياً', hasAudit);

    const stats = await admin.rpc('get_dashboard_stats');
    check('المدير يستدعي إحصاءات لوحة التحكم', !stats.error && stats.data?.totalOrphans !== undefined);

    // تنظيف (يجب أن ينجح الحذف)
    const del = await admin.from('orphans').delete().eq('id', o.data.id);
    check('المدير يحذف يتيماً', !del.error);
    await admin.from('families').delete().eq('id', fam.data?.id);

    // محاولة تعديل سجل النشاط يجب أن تفشل بصمت (لا سياسة UPDATE)
    const logRow = (logs.data || [])[0];
    if (logRow) {
      const tamper = await admin.from('activity_logs').update({ description: 'تلاعب' }).eq('id', logRow.id);
      const after = await admin.from('activity_logs').select('description').eq('id', logRow.id).single();
      check('لا يمكن تعديل سجل النشاط حتى للمدير', after.data?.description !== 'تلاعب');
    }
  }
} else {
  console.log('  ⏭️ تخطي (لم تُحدد ADMIN_EMAIL/ADMIN_PASSWORD)');
}

console.log('\n=== 4) حساب الموظف (STAFF) — إضافة/تعديل بدون حذف ===');
const staffEmail = process.env.STAFF_EMAIL;
const staffPassword = process.env.STAFF_PASSWORD;
if (staffEmail && staffPassword) {
  const staff = await userClient(staffEmail, staffPassword);
  check('تسجيل دخول الموظف', Boolean(staff));
  if (staff) {
    const ts = Date.now();
    const fam = await staff.from('families').insert({ name: `أسرة موظف ${ts}` }).select('id').single();
    check('الموظف ينشئ أسرة', !fam.error);

    const o = await staff.from('orphans').insert({
      orphan_code: `S-${ts}`, full_name: 'يتيم اختبار الموظف', gender: 'female',
      status: 'both', family_id: fam.data?.id,
    }).select('id').single();
    check('الموظف ينشئ يتيماً', !o.error);

    const upd = await staff.from('orphans').update({ notes: 'موظف عدّل' }).eq('id', o.data.id);
    check('الموظف يعدل', !upd.error);

    const del = await staff.from('orphans').delete().eq('id', o.data.id);
    const still = o.data ? await staff.from('orphans').select('id').eq('id', o.data.id).maybeSingle() : {};
    check('الموظف لا يحذف (RLS يمنع بصمت)', !del.error && !del.data && Boolean(still.data));

    const profiles = await staff.from('profiles').select('*');
    check('الموظف لا يرى ملفات الآخرين', (profiles.data || []).length === 1);

    const logs = await staff.from('activity_logs').select('*');
    check('الموظف لا يقرأ سجل النشاط', (logs.data || []).length === 0);

    const esc1 = await staff.from('profiles').update({ role: 'admin' });
    check('الموظف لا يستطيع ترقية نفسه', Boolean(esc1.error) || (await staff.from('profiles').select('role').single()).data?.role !== 'admin');

    // تنظيف عبر service
    await service.from('orphans').delete().eq('id', o.data?.id);
    await service.from('families').delete().eq('id', fam.data?.id);
  }
} else {
  console.log('  ⏭️ تخطي (لم تُحدد STAFF_EMAIL/STAFF_PASSWORD)');
}

console.log('\n=== 5) حساب المشاهد (VIEWER) — قراءة فقط ===');
const viewerEmail = process.env.VIEWER_EMAIL;
const viewerPassword = process.env.VIEWER_PASSWORD;
if (viewerEmail && viewerPassword) {
  const viewer = await userClient(viewerEmail, viewerPassword);
  check('تسجيل دخول المشاهد', Boolean(viewer));
  if (viewer) {
    const read = await viewer.from('orphans').select('id', { count: 'exact', head: true });
    check('المشاهد يقرأ عدد الأيتام', !read.error);

    const ins = await viewer.from('orphans').insert({
      orphan_code: `V-${Date.now()}`, full_name: 'محاولة مشاهد للإضافة', gender: 'male', status: 'father',
    });
    check('المشاهد لا يضيف (42501)', ins.error?.code === '42501');

    const stats = await viewer.rpc('get_dashboard_stats');
    check('المشاهد يستدعي الإحصاءات (قراءة)', !stats.error);
  }
} else {
  console.log('  ⏭️ تخطي (لم يُحدد VIEWER_EMAIL/VIEWER_PASSWORD)');
}

console.log(`\n==========================================`);
console.log(`النتيجة: ${passed} ناجح، ${failed} فاشل`);
console.log(`==========================================\n`);
process.exit(failed > 0 ? 1 : 0);
