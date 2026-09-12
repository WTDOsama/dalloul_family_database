// ===========================================================================
// النسخ الاحتياطي والترحيل:
//  - التصدير: تصدير بيانات التطبيق (JSON) — للمدير فقط، ليس نسخة DR كاملة
//  - الاستيراد: ترحيل آمن لملفات النسخة القديمة (IndexedDB) مع فحص وتجاهل المكرر
//  - الحذف الشامل: للمدير فقط مع تأكيد كتابة كلمة «حذف»
// ===========================================================================
import { canDelete } from './state.js';
import {
  fetchAllForExport, deleteAllBatched, logAction, findOrCreateFamily,
} from './data.js';
import { validateOrphan } from './validate.js';
import { esc, showToast, showOverlay, hideOverlay, confirmDialog, downloadBlob } from './ui.js';
import { friendlyError } from './errors.js';

// ------------------------------------------------------------- التصدير ---
export async function exportData() {
  if (!canDelete()) {
    showToast('التصدير الكامل متاح للمدير فقط.', 'error');
    return;
  }
  showOverlay();
  try {
    const [orphans, families, assistance, followUps] = await Promise.all([
      fetchAllForExport('orphans'),
      fetchAllForExport('families'),
      fetchAllForExport('assistance'),
      fetchAllForExport('follow_ups'),
    ]);

    const payload = {
      app: 'daloul-orphans-db',
      version: '2.0',
      exportDate: new Date().toISOString(),
      note: 'تصدير بيانات التطبيق من Supabase PostgreSQL — ليس بديلاً عن النسخ الاحتياطي الكامل لقاعدة البيانات.',
      counts: {
        orphans: orphans.length,
        families: families.length,
        assistance: assistance.length,
        followUps: followUps.length,
      },
      orphans,
      families,
      assistance,
      followUps,
    };

    const filename = `daloul_export_${new Date().toISOString().split('T')[0]}.json`;
    downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');

    await logAction('export_backup', null, null,
      `تصدير بيانات التطبيق (${orphans.length} يتيم، ${families.length} أسرة)`);
    showToast('تم تصدير بيانات التطبيق بنجاح.', 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// ------------------------------------------- استيراد/ترحيل النسخة القديمة ---
/**
 * يقبل ملفات JSON بالتنسيقين:
 *  - القديم (من النسخة المحلية بحقول camelCase): { orphans: [...], families: [...] }
 *  - الجديد (v2 من هذا التطبيق بحقول snake_case)
 * يتم التحقق من كل سجل وتجاهل المكرر (حسب رقم الملف / اسم الأسرة).
 */
export async function importData(event) {
  event.preventDefault();
  if (!canDelete()) {
    showToast('الاستيراد متاح للمدير فقط.', 'error');
    event.target.value = '';
    return;
  }

  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';

  const ok = await confirmDialog({
    title: 'ترحيل البيانات',
    message: 'سيتم فحص الملف واستيراد السجلات الصالحة فقط (مع تجاهل المكرر). هل تريد المتابعة؟',
    okText: 'بدء الاستيراد',
    danger: false,
  });
  if (!ok) return;

  showOverlay();
  try {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('الملف غير صالح: تعذر قراءة صيغة JSON.');
    }
    if (!data || typeof data !== 'object' || (!data.orphans && !data.families)) {
      throw new Error('الملف لا يحتوي على بيانات يتيم أو أسرة بصيغة معروفة.');
    }

    const result = await migrateLegacyData(data);
    await logAction('import_local_backup', null, null,
      `ترحيل بيانات: ${result.importedOrphans} يتيم، ${result.importedFamilies} أسرة، ` +
      `${result.skipped} مكرر/متجاهل، ${result.invalid} غير صالح`);
    showToast(
      `تم الترحيل: ${result.importedOrphans} يتيم و${result.importedFamilies} أسرة. ` +
      `تم تجاهل ${result.skipped} سجل مكرر و${result.invalid} سجل غير صالح.`,
      result.invalid > 0 ? 'warning' : 'success'
    );
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

/** ترحيل السجلات إلى قاعدة البيانات الأونلاين مع الفحص ومنع التكرار */
async function migrateLegacyData(data) {
  const { supabase } = await import('./env.js');
  const result = { importedOrphans: 0, importedFamilies: 0, skipped: 0, invalid: 0 };

  // 1) جلب المفاتيح الموجودة لمنع التكرار
  const existingOrphanCodes = new Set(
    (await fetchAllForExport('orphans', 'orphan_code')).map((r) => r.orphan_code)
  );
  const existingFamilyNames = new Set(
    (await fetchAllForExport('families', 'name')).map((r) => r.name.trim().toLowerCase())
  );

  // 2) الأسر أولاً (العلاقة المرجعية)
  const familiesRaw = Array.isArray(data.families) ? data.families : [];
  for (const f of familiesRaw) {
    const mapped = mapLegacyFamily(f);
    if (!mapped.name) { result.invalid++; continue; }
    const key = mapped.name.toLowerCase();
    if (existingFamilyNames.has(key)) { result.skipped++; continue; }

    const { error } = await supabase.from('families').insert({
      name: mapped.name,
      guardian: mapped.guardian || null,
      phone: mapped.phone || null,
      district: mapped.district || null,
      address: mapped.address || null,
      housing: mapped.housing || null,
      income: mapped.income || null,
      family_members: mapped.familyMembers || null,
      economic_status: mapped.economicStatus || null,
      displaced: mapped.displaced === 'yes' ? 'yes' : 'no',
      notes: mapped.notes || null,
    });
    if (error) {
      if (error.code === '23505') result.skipped++;
      else result.invalid++;
    } else {
      existingFamilyNames.add(key);
      result.importedFamilies++;
    }
  }

  // 3) الأيتام
  const orphansRaw = Array.isArray(data.orphans) ? data.orphans : [];
  for (const o of orphansRaw) {
    const mapped = mapLegacyOrphan(o);
    // فحص صحة السجل بنفس قواعد النموذج (يُعاد فحصها في قاعدة البيانات أيضاً)
    if (!validateOrphan({ ...mapped, family_name: mapped.familyName })) {
      result.invalid++;
      continue;
    }
    if (existingOrphanCodes.has(mapped.fileNumber)) { result.skipped++; continue; }

    try {
      // ربط الأسرة بالاسم (إيجاد أو إنشاء)
      const familyId = await findOrCreateFamily(mapped.familyName, {
        guardian: mapped.guardianName,
        phone: mapped.primaryPhone,
        district: mapped.governorate || mapped.area,
        members: mapped.familyMembers,
        economic: mapped.economicStatus,
        displaced: mapped.displaced,
      });

      const { error } = await supabase.from('orphans').insert({
        orphan_code: mapped.fileNumber,
        full_name: mapped.fullName,
        gender: mapped.gender,
        birth_date: mapped.dateOfBirth || null,
        national_id: mapped.nationalId || null,
        status: mapped.orphanStatus,
        education: mapped.educationStatus || null,
        health: mapped.healthStatus || null,
        notes: mapped.notes || null,
        father_name: mapped.fatherName || null,
        mother_name: mapped.motherName || null,
        father_death_date: mapped.fatherDeathDate || null,
        father_death_cause: mapped.fatherDeathCause || null,
        mother_death_date: mapped.motherDeathDate || null,
        mother_death_cause: mapped.motherDeathCause || null,
        original_address: mapped.originalAddress || null,
        current_address: mapped.currentAddress || null,
        governorate: mapped.governorate || null,
        city: mapped.city || null,
        area: mapped.area || null,
        housing_status: mapped.housingStatus || null,
        displaced: mapped.displaced === 'yes' ? 'yes' : 'no',
        guardian_name: mapped.guardianName || null,
        guardian_relationship: mapped.guardianRelationship || null,
        primary_phone: mapped.primaryPhone || null,
        alternative_phone: mapped.alternativePhone || null,
        income_source: mapped.incomeSource || null,
        family_members: mapped.familyMembers || null,
        economic_status: mapped.economicStatus || null,
        general_needs: mapped.generalNeeds || null,
        school_name: mapped.schoolName || null,
        grade: mapped.grade || null,
        health_condition: mapped.healthCondition || null,
        has_disability: mapped.hasDisability === true,
        disability_type: mapped.disabilityType || null,
        required_treatment: mapped.requiredTreatment || null,
        sponsorship_status: mapped.sponsorshipStatus || null,
        needs: Array.isArray(mapped.needs) ? mapped.needs : [],
        qr_id: mapped.qrId || undefined,
        family_id: familyId,
      });

      if (error) {
        if (error.code === '23505') result.skipped++;
        else result.invalid++;
      } else {
        existingOrphanCodes.add(mapped.fileNumber);
        result.importedOrphans++;
      }
    } catch {
      result.invalid++;
    }
  }

  return result;
}

/** تحويل سجل أسرة من التنسيق القديم/الجديد إلى موحد */
function mapLegacyFamily(f) {
  if ('name' in f) {
    // تنسيق v2 (snake_case)
    return {
      name: String(f.name || '').trim(),
      guardian: f.guardian, phone: f.phone, district: f.district,
      address: f.address, housing: f.housing, income: f.income,
      familyMembers: f.family_members, economicStatus: f.economic_status,
      displaced: f.displaced, notes: f.notes,
    };
  }
  // تنسيق قديم (camelCase)
  return {
    name: String(f.familyName || f.name || '').trim(),
    guardian: f.guardianName || f.guardian || null,
    phone: f.primaryPhone || f.phone || null,
    district: f.governorate || f.district || null,
    address: f.currentAddress || f.address || null,
    housing: f.housingStatus || f.housing || null,
    income: f.incomeSource || f.income || null,
    familyMembers: f.familyMembers || null,
    economicStatus: f.economicStatus || null,
    displaced: f.displaced || 'no',
    notes: f.generalNeeds || f.notes || null,
  };
}

/** تحويل سجل يتيم من التنسيق القديم/الجديد إلى موحد */
function mapLegacyOrphan(o) {
  if ('full_name' in o || 'orphan_code' in o) {
    // تنسيق v2
    return {
      fileNumber: o.orphan_code, fullName: o.full_name, gender: o.gender,
      dateOfBirth: o.birth_date, nationalId: o.national_id,
      orphanStatus: o.status, educationStatus: o.education, healthStatus: o.health,
      notes: o.notes, fatherName: o.father_name, motherName: o.mother_name,
      fatherDeathDate: o.father_death_date, fatherDeathCause: o.father_death_cause,
      motherDeathDate: o.mother_death_date, motherDeathCause: o.mother_death_cause,
      originalAddress: o.original_address, currentAddress: o.current_address,
      governorate: o.governorate, city: o.city, area: o.area,
      housingStatus: o.housing_status, displaced: o.displaced,
      guardianName: o.guardian_name, guardianRelationship: o.guardian_relationship,
      primaryPhone: o.primary_phone, alternativePhone: o.alternative_phone,
      incomeSource: o.income_source, familyMembers: o.family_members,
      economicStatus: o.economic_status, generalNeeds: o.general_needs,
      schoolName: o.school_name, grade: o.grade, healthCondition: o.health_condition,
      hasDisability: o.has_disability, disabilityType: o.disability_type,
      requiredTreatment: o.required_treatment, sponsorshipStatus: o.sponsorship_status,
      needs: o.needs || [], qrId: o.qr_id,
      familyName: o.familyName || (familiesByNameCache[o.family_id]) || o.orphan_code,
    };
  }
  // تنسيق قديم — نفس أسماء حقول النموذج الأصلي
  return {
    fileNumber: o.fileNumber, fullName: o.fullName, gender: o.gender,
    dateOfBirth: o.dateOfBirth, nationalId: null,
    orphanStatus: o.orphanStatus, educationStatus: o.educationStatus,
    healthStatus: o.healthStatus, notes: o.notes || null,
    fatherName: o.fatherName, motherName: o.motherName,
    fatherDeathDate: o.fatherDeathDate, fatherDeathCause: o.fatherDeathCause,
    motherDeathDate: o.motherDeathDate, motherDeathCause: o.motherDeathCause,
    originalAddress: o.originalAddress, currentAddress: o.currentAddress,
    governorate: o.governorate, city: o.city, area: o.area,
    housingStatus: o.housingStatus, displaced: o.displaced,
    guardianName: o.guardianName, guardianRelationship: o.guardianRelationship,
    primaryPhone: o.primaryPhone, alternativePhone: o.alternativePhone,
    incomeSource: o.incomeSource, familyMembers: o.familyMembers,
    economicStatus: o.economicStatus, generalNeeds: o.generalNeeds,
    schoolName: o.schoolName, grade: o.grade, healthCondition: o.healthCondition,
    hasDisability: o.hasDisability === true, disabilityType: o.disabilityType,
    requiredTreatment: o.requiredTreatment, sponsorshipStatus: o.sponsorshipStatus,
    needs: o.needs || [], qrId: o.qrId,
    familyName: o.familyName,
  };
}

// خريطة مساعدة لأسماء الأسر حسب المعرف (تُملأ عند استيراد ملفات v2)
const familiesByNameCache = {};

// ------------------------------------------------------- حذف جميع السجلات ---
export async function confirmClearAll() {
  if (!canDelete()) {
    showToast('هذه العملية متاحة للمدير فقط.', 'error');
    return;
  }

  const ok = await confirmDialog({
    title: 'حذف جميع السجلات',
    message: 'سيتم حذف جميع سجلات الأيتام والأسر والمساعدات والمتابعات نهائياً من قاعدة البيانات. لن يُحذف سجل النشاط ولا حسابات المستخدمين. لا يمكن التراجع!',
    okText: 'متابعة',
    requireText: 'حذف',
  });
  if (!ok) return;

  const ok2 = await confirmDialog({
    title: 'تأكيد نهائي',
    message: 'هل أخذت نسخة تصدير احتياطية؟ هذه آخر فرصة قبل الحذف النهائي لكل السجلات.',
    okText: 'نعم، احذف كل شيء',
  });
  if (!ok2) return;

  showOverlay();
  try {
    // حسب ترتيب العلاقات: المتابعات ثم المساعدات ثم الأيتام ثم الأسر
    await deleteAllBatched('follow_ups');
    await deleteAllBatched('assistance');
    await deleteAllBatched('orphans');
    await deleteAllBatched('families');

    await logAction('clear_all_data', null, null, 'حذف جميع سجلات الأيتام والأسر والمساعدات والمتابعات');
    showToast('تم حذف جميع السجلات. سجل النشاط محفوظ.', 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}
