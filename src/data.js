// ===========================================================================
// طبقة البيانات — كل عمليات الإنتاج تجري على قاعدة بيانات Supabase PostgreSQL
// (لا يوجد IndexedDB/LocalStorage للبيانات — الجلسة فقط يدعمها Supabase Auth)
// ===========================================================================
import { supabase } from './env.js';
import { state } from './state.js';

// ---------------------------------------------------------- خرائط الحقول ---
/** تحويل أسماء أعمدة قاعدة البيانات (snake_case) إلى نموذج الواجهة (camelCase) */
export function rowToOrphan(r) {
  return {
    id: r.id,
    fileNumber: r.orphan_code,
    fullName: r.full_name,
    gender: r.gender,
    dateOfBirth: r.birth_date,
    nationalId: r.national_id,
    orphanStatus: r.status,
    educationStatus: r.education,
    healthStatus: r.health,
    notes: r.notes,
    fatherName: r.father_name,
    motherName: r.mother_name,
    fatherDeathDate: r.father_death_date,
    fatherDeathCause: r.father_death_cause,
    motherDeathDate: r.mother_death_date,
    motherDeathCause: r.mother_death_cause,
    originalAddress: r.original_address,
    currentAddress: r.current_address,
    governorate: r.governorate,
    city: r.city,
    area: r.area,
    housingStatus: r.housing_status,
    displaced: r.displaced,
    guardianName: r.guardian_name,
    guardianRelationship: r.guardian_relationship,
    primaryPhone: r.primary_phone,
    alternativePhone: r.alternative_phone,
    incomeSource: r.income_source,
    familyMembers: r.family_members,
    economicStatus: r.economic_status,
    generalNeeds: r.general_needs,
    schoolName: r.school_name,
    grade: r.grade,
    healthCondition: r.health_condition,
    hasDisability: r.has_disability,
    disabilityType: r.disability_type,
    requiredTreatment: r.required_treatment,
    sponsorshipStatus: r.sponsorship_status,
    needs: r.needs || [],
    qrId: r.qr_id,
    familyId: r.family_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    family: r.families,
  };
}

/** تحويل نموذج الواجهة إلى صف قاعدة بيانات */
export function orphanToRow(o) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  return {
    orphan_code: String(o.fileNumber || '').trim(),
    full_name: String(o.fullName || '').trim(),
    gender: o.gender,
    birth_date: o.dateOfBirth || null,
    national_id: (String(o.nationalId || '').trim() || null),
    status: o.orphanStatus,
    education: o.educationStatus || null,
    health: o.healthStatus || null,
    notes: (o.notes || '').trim() || null,
    father_name: o.fatherName?.trim() || null,
    mother_name: o.motherName?.trim() || null,
    father_death_date: o.fatherDeathDate || null,
    father_death_cause: o.fatherDeathCause?.trim() || null,
    mother_death_date: o.motherDeathDate || null,
    mother_death_cause: o.motherDeathCause?.trim() || null,
    original_address: o.originalAddress?.trim() || null,
    current_address: o.currentAddress?.trim() || null,
    governorate: o.governorate?.trim() || null,
    city: o.city?.trim() || null,
    area: o.area?.trim() || null,
    housing_status: o.housingStatus || null,
    displaced: o.displaced === 'yes' ? 'yes' : 'no',
    guardian_name: o.guardianName?.trim() || null,
    guardian_relationship: o.guardianRelationship?.trim() || null,
    primary_phone: normalizePhoneOrNull(o.primaryPhone),
    alternative_phone: normalizePhoneOrNull(o.alternativePhone),
    income_source: o.incomeSource?.trim() || null,
    family_members: o.familyMembers ? num(o.familyMembers) : null,
    economic_status: o.economicStatus || null,
    general_needs: o.generalNeeds?.trim() || null,
    school_name: o.schoolName?.trim() || null,
    grade: o.grade?.trim() || null,
    health_condition: o.healthCondition?.trim() || null,
    has_disability: o.hasDisability === true,
    disability_type: o.hasDisability ? (o.disabilityType?.trim() || null) : null,
    required_treatment: o.requiredTreatment?.trim() || null,
    sponsorship_status: o.sponsorshipStatus || null,
    needs: Array.isArray(o.needs) ? o.needs : [],
    family_id: o.familyId || null,
  };
}

function normalizePhoneOrNull(phone) {
  if (!phone) return null;
  const p = String(phone).replace(/[\s\-()]/g, '').trim();
  return p || null;
}

export function rowToFamily(r) {
  return {
    id: r.id,
    familyCode: r.family_code,
    name: r.name,
    guardian: r.guardian,
    phone: r.phone,
    district: r.district,
    address: r.address,
    housing: r.housing,
    income: r.income,
    familyMembers: r.family_members,
    economicStatus: r.economic_status,
    displaced: r.displaced,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    orphanCount: r.orphans?.[0]?.count ?? r.orphanCount ?? null,
  };
}

// ------------------------------------------------------- تعقيم البحث ---
/** تنظيف نص البحث لمنع كسر صيغة فلتر PostgREST أو حقن عوامل منطقية */
export function sanitizeSearch(q) {
  return String(q || '')
    .replace(/[(),%*"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ------------------------------------------------------------- الأيتام ---
export async function listOrphans({ page = 1, perPage = 20, search = '', filters = {} } = {}) {
  let q = supabase
    .from('orphans')
    .select('*, families(id, name, family_code, district)', { count: 'exact' });

  const s = sanitizeSearch(search);
  if (s) {
    q = q.or([
      `orphan_code.ilike.%${s}%`,
      `full_name.ilike.%${s}%`,
      `national_id.ilike.%${s}%`,
      `guardian_name.ilike.%${s}%`,
      `primary_phone.ilike.%${s}%`,
      `families.name.ilike.%${s}%`,
      `families.family_code.ilike.%${s}%`,
      `families.district.ilike.%${s}%`,
    ].join(','));
  }
  if (filters.gender) q = q.eq('gender', filters.gender);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.sponsorship) q = q.eq('sponsorship_status', filters.sponsorship);

  const from = (page - 1) * perPage;
  q = q.order('created_at', { ascending: false }).range(from, from + perPage - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data || []).map(rowToOrphan), count: count || 0 };
}

export async function getOrphan(id) {
  const { data, error } = await supabase
    .from('orphans')
    .select('*, families(id, name, family_code, district, guardian, phone)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return rowToOrphan(data);
}

export async function getOrphanByQR(qrId) {
  const { data, error } = await supabase
    .from('orphans')
    .select('*, families(id, name, family_code)')
    .eq('qr_id', qrId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToOrphan(data) : null;
}

export async function getOrphanByCode(code) {
  const { data, error } = await supabase
    .from('orphans')
    .select('*, families(id, name, family_code)')
    .ilike('orphan_code', String(code).trim())
    .maybeSingle();
  if (error) throw error;
  return data ? rowToOrphan(data) : null;
}

export async function insertOrphan(orphanForm) {
  const row = orphanToRow(orphanForm);
  const { data, error } = await supabase.from('orphans').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateOrphan(id, orphanForm) {
  const row = orphanToRow(orphanForm);
  const { error } = await supabase.from('orphans').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteOrphan(id) {
  const { error } = await supabase.from('orphans').delete().eq('id', id);
  if (error) throw error;
}

// -------------------------------------------------------------- الأسر ---
export async function listFamilies({ page = 1, perPage = 20, search = '' } = {}) {
  let q = supabase
    .from('families')
    .select('*, orphans(count)', { count: 'exact' });

  const s = sanitizeSearch(search);
  if (s) {
    q = q.or([
      `name.ilike.%${s}%`,
      `family_code.ilike.%${s}%`,
      `guardian.ilike.%${s}%`,
      `phone.ilike.%${s}%`,
      `district.ilike.%${s}%`,
    ].join(','));
  }

  const from = (page - 1) * perPage;
  q = q.order('name', { ascending: true }).range(from, from + perPage - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data || []).map(rowToFamily), count: count || 0 };
}

export async function getFamily(id) {
  const { data, error } = await supabase
    .from('families')
    .select('*, orphans(count)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return rowToFamily(data);
}

export async function getFamilyOrphans(familyId) {
  const { data, error } = await supabase
    .from('orphans')
    .select('id, orphan_code, full_name, gender, birth_date, status, sponsorship_status')
    .eq('family_id', familyId)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function insertFamily(family) {
  const { data, error } = await supabase
    .from('families')
    .insert(familyToRow(family))
    .select('id, family_code')
    .single();
  if (error) throw error;
  return data;
}

export async function updateFamily(id, family) {
  const { error } = await supabase.from('families').update(familyToRow(family)).eq('id', id);
  if (error) throw error;
}

export async function deleteFamily(id) {
  const { error } = await supabase.from('families').delete().eq('id', id);
  if (error) throw error;
}

function familyToRow(f) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  return {
    name: String(f.name || '').trim(),
    family_code: String(f.familyCode || '').trim() || undefined, // undefined = الافتراضي في قاعدة البيانات
    guardian: f.guardian?.trim() || null,
    phone: normalizePhoneOrNull(f.phone),
    district: f.district?.trim() || null,
    address: f.address?.trim() || null,
    housing: f.housing || null,
    income: f.income?.trim() || null,
    family_members: f.familyMembers ? num(f.familyMembers) : null,
    economic_status: f.economicStatus || null,
    displaced: f.displaced === 'yes' ? 'yes' : 'no',
    notes: f.notes?.trim() || null,
  };
}

/**
 * إيجاد أسرة بالاسم (مطابقة غير حساسة لحالة الأحرف) أو إنشاؤها إن لم توجد.
 * يمنع تكرار الأسر ويحافظ على العلاقة المرجعية السليمة للأيتام.
 */
export async function findOrCreateFamily(name, extra = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('اسم الأسرة مطلوب');

  const { data: existing, error: findErr } = await supabase
    .from('families')
    .select('id, name')
    .ilike('name', cleanName.replace(/[%_]/g, ''))
    .limit(20);
  if (findErr) throw findErr;

  const exact = (existing || []).find(
    (f) => f.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (exact) return exact.id;

  const created = await insertFamily({
    name: cleanName,
    guardian: extra.guardian || null,
    phone: extra.phone || null,
    district: extra.district || null,
    address: extra.address || null,
    housing: extra.housing || null,
    income: extra.income || null,
    familyMembers: extra.members || null,
    economicStatus: extra.economic || null,
    displaced: extra.displaced || 'no',
    notes: extra.notes || null,
  });
  return created.id;
}

/** تحميل قائمة أسماء الأسر لقائمة الاقتراحات (datalist) */
export async function loadFamilySuggestions() {
  const { data } = await supabase
    .from('families')
    .select('name')
    .order('name')
    .limit(500);
  const datalist = document.getElementById('familyDatalist');
  if (datalist) {
    datalist.innerHTML = (data || [])
      .map((f) => `<option value="${f.name.replace(/"/g, '&quot;')}"></option>`)
      .join('');
  }
}

// ---------------------------------------------------------- المساعدات ---
export async function listAssistance({ page = 1, perPage = 20, search = '', type = '' } = {}) {
  let q = supabase
    .from('assistance')
    .select('*, orphans(full_name, orphan_code)', { count: 'exact' });

  const s = sanitizeSearch(search);
  if (s) {
    q = q.or([
      `orphans.full_name.ilike.%${s}%`,
      `orphans.orphan_code.ilike.%${s}%`,
    ].join(','));
  }
  if (type) q = q.eq('type', type);

  const from = (page - 1) * perPage;
  q = q.order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + perPage - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function insertAssistance(a) {
  const { error } = await supabase.from('assistance').insert({
    orphan_id: a.orphanId,
    date: a.date,
    type: a.type,
    amount: a.amount === '' || a.amount == null ? null : Number(a.amount),
    notes: a.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function updateAssistance(id, a) {
  const { error } = await supabase.from('assistance').update({
    orphan_id: a.orphanId,
    date: a.date,
    type: a.type,
    amount: a.amount === '' || a.amount == null ? null : Number(a.amount),
    notes: a.notes?.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteAssistance(id) {
  const { error } = await supabase.from('assistance').delete().eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------- المتابعة ---
export async function listFollowUps({ page = 1, perPage = 20, search = '', upcoming = false } = {}) {
  let q = supabase
    .from('follow_ups')
    .select('*, orphans(full_name, orphan_code)', { count: 'exact' });

  const s = sanitizeSearch(search);
  if (s) {
    q = q.or([
      `orphans.full_name.ilike.%${s}%`,
      `orphans.orphan_code.ilike.%${s}%`,
    ].join(','));
  }
  if (upcoming) {
    q = q.gte('next_follow_up_date', new Date().toISOString().slice(0, 10));
  }

  const from = (page - 1) * perPage;
  q = q.order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + perPage - 1);

  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function insertFollowUp(f) {
  const { error } = await supabase.from('follow_ups').insert({
    orphan_id: f.orphanId,
    date: f.date,
    notes: String(f.notes || '').trim(),
    next_follow_up_date: f.nextDate || null,
  });
  if (error) throw error;
}

export async function updateFollowUp(id, f) {
  const { error } = await supabase.from('follow_ups').update({
    orphan_id: f.orphanId,
    date: f.date,
    notes: String(f.notes || '').trim(),
    next_follow_up_date: f.nextDate || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteFollowUp(id) {
  const { error } = await supabase.from('follow_ups').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------ سجل النشاط ---
/** تسجيل حدث في سجل النشاط (للأحداث التي تبدأ من المتصفح: دخول/خروج/تصدير...) */
export async function logAction(action, entityType = null, entityId = null, description = '', metadata = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from('activity_logs').insert({
      user_id: session.user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
    });
  } catch {
    // التسجيل لا يجب أن يكسر العملية الأساسية
  }
}

export async function listLogs({ page = 1, perPage = 30, action = '' } = {}) {
  let q = supabase.from('activity_logs').select('*', { count: 'exact' });

  if (action === 'user') {
    q = q.in('action', ['user_create', 'user_update', 'user_delete', 'password_reset_request', 'admin_initialized', 'signup']);
  } else if (action === 'export') {
    q = q.in('action', ['export_backup', 'export_csv_orphans', 'export_csv_assistance', 'export_pdf_orphan', 'export_pdf_family']);
  } else if (action === 'import') {
    q = q.in('action', ['import_local_backup', 'clear_all_data']);
  } else if (action === 'security') {
    q = q.in('action', ['password_change', 'admin_initialized']);
  } else if (action) {
    q = q.eq('action', action);
  }

  const from = (page - 1) * perPage;
  q = q.order('created_at', { ascending: false }).range(from, from + perPage - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  // دمج أسماء المستخدمين (يقرأ المدير جميع الملفات)
  const userIds = [...new Set((data || []).map((l) => l.user_id).filter(Boolean))];
  const names = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, username')
      .in('user_id', userIds);
    (profiles || []).forEach((p) => {
      names[p.user_id] = p.full_name || p.username || '—';
    });
  }
  return {
    rows: (data || []).map((l) => ({ ...l, user_name: names[l.user_id] || 'النظام' })),
    count: count || 0,
  };
}

// --------------------------------------------------------- إحصاءات ---
export async function getDashboardStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw error;
  return data;
}

export async function getStatistics() {
  const { data, error } = await supabase.rpc('get_statistics');
  if (error) throw error;
  return data;
}

// ------------------------------------------------ جلب كل السجلات (تصدير) ---
/** جلب صفحات متتالية من جدول (للتصدير والنسخ الاحتياطي فقط) */
export async function fetchAllForExport(table, select = '*', pageSize = 500) {
  const out = [];
  let from = 0;
  // سقف أمان 200 صفحة (100,000 سجل) لكل عملية
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** قائمة خفيفة بالأيتام لاختيار يتيم (الاسم + الرقم + المعرف) */
export async function searchOrphansLight(term, limit = 15) {
  const s = sanitizeSearch(term);
  let q = supabase
    .from('orphans')
    .select('id, orphan_code, full_name')
    .order('full_name')
    .limit(limit);
  if (s) {
    q = q.or(`orphan_code.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function searchFamiliesLight(term, limit = 15) {
  const s = sanitizeSearch(term);
  let q = supabase
    .from('families')
    .select('id, family_code, name')
    .order('name')
    .limit(limit);
  if (s) {
    q = q.or(`name.ilike.%${s}%,family_code.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** حذف دفعات من جدول (للعمليات الإدارية) */
export async function deleteAllBatched(table) {
  for (let i = 0; i < 2000; i++) {
    const { data } = await supabase.from(table).select('id').limit(500);
    if (!data || data.length === 0) return;
    const { error } = await supabase
      .from(table)
      .delete()
      .in('id', data.map((r) => r.id));
    if (error) throw error;
  }
}
