// ===========================================================================
// التحقق من صحة المدخلات (جهة العميل) — يُطبق أيضاً تحقق مطابق في قاعدة البيانات
// ===========================================================================

/**
 * تطبيع رقم جوال فلسطيني: يحذف الفراغات والشرطات والأقواس.
 * يقبل: 05XXXXXXXX أو 5XXXXXXXX أو +9705XXXXXXXX أو +9725XXXXXXXX
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[\s\-()]/g, '').trim();
}

export function isValidPalestinianPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return true; // حقل اختياري
  return /^(\+970|\+972|0)?5\d{8}$/.test(p);
}

export function isValidNationalId(id) {
  if (!id) return true; // حقل اختياري
  return /^[0-9]{9}$/.test(String(id).trim());
}

/** اسم شخصي صالح: حروف عربية/إنجليزية وفراغات ونقطة (للأسماء المركبة) */
export function isValidPersonName(name, minLength = 3) {
  if (!name) return false;
  const v = String(name).trim();
  return v.length >= minLength && v.length <= 300 &&
    /^[\u0600-\u06FF\u0750-\u077FA-Za-z\s.'ـ]+$/.test(v);
}

export function isFutureDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d.getTime() > today.getTime();
}

export function isValidDate(dateStr) {
  if (!dateStr) return true;
  return !Number.isNaN(new Date(dateStr + 'T00:00:00').getTime());
}

/** التحقق من بيانات اليتيم قبل الإرسال — يعيد رسالة خطأ أو null
 *  يقبل المفاتيح بصيغة snake_case (الاستيراد/قاعدة البيانات) أو camelCase (النموذج) */
export function validateOrphan(raw) {
  const data = {
    orphan_code: raw.orphan_code ?? raw.fileNumber,
    full_name: raw.full_name ?? raw.fullName,
    gender: raw.gender,
    birth_date: raw.birth_date ?? raw.dateOfBirth,
    status: raw.status ?? raw.orphanStatus,
    national_id: raw.national_id ?? raw.nationalId,
    primary_phone: raw.primary_phone ?? raw.primaryPhone,
    alternative_phone: raw.alternative_phone ?? raw.alternativePhone,
    family_name: raw.family_name ?? raw.familyName,
    family_members: raw.family_members ?? raw.familyMembers,
    father_death_date: raw.father_death_date ?? raw.fatherDeathDate,
    mother_death_date: raw.mother_death_date ?? raw.motherDeathDate,
    sponsorship_status: raw.sponsorship_status ?? raw.sponsorshipStatus,
  };
  if (!data.orphan_code || !String(data.orphan_code).trim()) return 'رقم ملف اليتيم مطلوب.';
  if (String(data.orphan_code).trim().length > 50) return 'رقم الملف طويل جداً.';
  if (!isValidPersonName(data.full_name)) return 'الاسم الرباعي مطلوب (أحرف فقط).';
  if (!['male', 'female'].includes(data.gender)) return 'يرجى اختيار الجنس.';
  if (!data.birth_date) return 'تاريخ الميلاد مطلوب.';
  if (!isValidDate(data.birth_date)) return 'تاريخ الميلاد غير صحيح.';
  if (isFutureDate(data.birth_date)) return 'لا يمكن إدخال تاريخ ميلاد في المستقبل.';
  if (!['father', 'mother', 'both'].includes(data.status)) return 'يرجى اختيار حالة اليتم.';
  if (!isValidNationalId(data.national_id)) return 'رقم الهوية يجب أن يكون 9 أرقام (أو اتركه فارغاً).';
  if (!isValidPalestinianPhone(data.primary_phone)) return 'رقم الجوال الأساسي غير صحيح. الصيغة: 05XXXXXXXX';
  if (!isValidPalestinianPhone(data.alternative_phone)) return 'رقم الجوال البديل غير صحيح. الصيغة: 05XXXXXXXX';
  if (!data.family_name || !String(data.family_name).trim()) return 'اسم الأسرة مطلوب.';
  if (String(data.family_name).trim().length < 2) return 'اسم الأسرة قصير جداً.';
  if (data.family_members != null && data.family_members !== '' && Number(data.family_members) < 1) return 'عدد أفراد الأسرة غير صحيح.';
  if (data.father_death_date && isFutureDate(data.father_death_date)) return 'تاريخ وفاة الأب لا يمكن أن يكون في المستقبل.';
  if (data.mother_death_date && isFutureDate(data.mother_death_date)) return 'تاريخ وفاة الأم لا يمكن أن يكون في المستقبل.';
  if (data.sponsorship_status && !['sponsored', 'unsponsored', 'needs'].includes(data.sponsorship_status)) return 'حالة الكفالة غير صحيحة.';
  return null;
}

/** التحقق من بيانات الأسرة */
export function validateFamily(data) {
  if (!data.name || String(data.name).trim().length < 2) return 'اسم الأسرة مطلوب (حرفان على الأقل).';
  if (String(data.name).trim().length > 200) return 'اسم الأسرة طويل جداً.';
  if (!isValidPalestinianPhone(data.phone)) return 'رقم الجوال غير صحيح. الصيغة: 05XXXXXXXX';
  if (data.family_members != null && data.family_members !== '' && Number(data.family_members) < 1) return 'عدد أفراد الأسرة غير صحيح.';
  return null;
}
