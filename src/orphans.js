// ===========================================================================
// إدارة الأيتام — القائمة، البحث، الفلاتر، الترقيم، نموذج الخطوات الثماني،
// العرض، الحذف — كلها متصلة بقاعدة البيانات الأونلاين (نفس واجهة الأصل)
// ===========================================================================
import { supabase } from './env.js';
import { state, canEdit, canDelete } from './state.js';
import {
  listOrphans, getOrphan, insertOrphan, updateOrphan,
  deleteOrphan as deleteOrphanRow,
  findOrCreateFamily, loadFamilySuggestions,
} from './data.js';
import { validateOrphan } from './validate.js';
import {
  esc, showToast, showOverlay, hideOverlay, confirmDialog, renderPagination,
  calculateAgeFromDate, ORPHAN_STATUS_LABELS, sponsorshipBadge,
} from './ui.js';
import { friendlyError } from './errors.js';

const TOTAL_STEPS = 8;

// حالة القائمة الحالية
const listState = { page: 1, perPage: 20, search: '' };

let currentStep = 1;
let editingOrphanId = null;   // uuid
let editingOrphanRow = null;  // الصف المحمّل من قاعدة البيانات

// -------------------------------------------------------------- القائمة ---
export async function loadOrphans() {
  const filters = {
    gender: document.getElementById('filterGender').value,
    status: document.getElementById('filterOrphanStatus').value,
    sponsorship: document.getElementById('filterSponsorship').value,
  };
  listState.search = document.getElementById('searchInput').value;

  try {
    const { rows, count } = await listOrphans({
      page: listState.page,
      perPage: listState.perPage,
      search: listState.search,
      filters,
    });
    renderOrphans(rows, count);
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

function renderOrphans(rows, count) {
  const tbody = document.getElementById('orphansTableBody');
  const table = document.getElementById('orphansTable');
  const empty = document.getElementById('orphansEmptyState');

  if (rows.length === 0 && count === 0) {
    table.style.display = 'none';
    empty.classList.remove('hidden');
    renderPagination('orphansPagination', { page: 1, perPage: listState.perPage, total: 0, onPage: 'goToOrphansPage' });
    return;
  }

  table.style.display = 'table';
  empty.classList.add('hidden');

  tbody.innerHTML = rows.map((o) => `
    <tr>
      <td>${esc(o.fileNumber)}</td>
      <td>${esc(o.fullName)}</td>
      <td>${o.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
      <td>${o.dateOfBirth ? calculateAgeFromDate(o.dateOfBirth) : '-'}</td>
      <td>${esc(ORPHAN_STATUS_LABELS[o.orphanStatus] || '-')}</td>
      <td>${esc(o.family?.name || '-')}</td>
      <td>${esc(o.area || o.family?.district || '-')}</td>
      <td>${sponsorshipBadge(o.sponsorshipStatus)}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-primary" onclick="viewOrphan('${o.id}')">عرض</button>
        ${canEdit() ? `<button class="btn btn-sm btn-secondary" onclick="openOrphanForm('${o.id}')">تعديل</button>` : ''}
        <button class="btn btn-sm btn-info" onclick="showQR('${o.id}')">QR</button>
        ${canDelete() ? `<button class="btn btn-sm btn-danger" onclick="deleteOrphan('${o.id}')">حذف</button>` : ''}
      </td>
    </tr>
  `).join('');

  renderPagination('orphansPagination', {
    page: listState.page, perPage: listState.perPage, total: count,
    onPage: 'goToOrphansPage', label: 'يتيم/أيتام',
  });
}

export function goToOrphansPage(p) {
  if (p < 1) return;
  listState.page = p;
  loadOrphans();
}

export function changeOrphansPerPage(v) {
  listState.perPage = Number(v) || 20;
  listState.page = 1;
  loadOrphans();
}

export function searchOrphans() {
  listState.page = 1;
  clearTimeout(searchOrphans._t);
  searchOrphans._t = setTimeout(loadOrphans, 250);
}

export function filterOrphans() {
  listState.page = 1;
  loadOrphans();
}

export function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterGender').value = '';
  document.getElementById('filterOrphanStatus').value = '';
  document.getElementById('filterSponsorship').value = '';
  listState.page = 1;
  loadOrphans();
}

// ------------------------------------------------- نموذج الخطوات الثماني ---
export async function openOrphanForm(orphanId = null) {
  if (!canEdit()) {
    showToast('ليس لديك صلاحية لإضافة أو تعديل السجلات.', 'error');
    return;
  }

  editingOrphanId = orphanId;
  editingOrphanRow = null;
  currentStep = 1;

  document.getElementById('orphanModalTitle').textContent =
    orphanId ? 'تعديل بيانات اليتيم' : 'إضافة يتيم جديد';
  document.getElementById('orphanForm').reset();
  document.getElementById('disabilityTypeGroup').style.display = 'none';
  document.getElementById('age').value = '';
  updateStepIndicator();
  resetStepsUI();

  loadFamilySuggestions();

  if (orphanId) {
    showOverlay();
    try {
      editingOrphanRow = await getOrphan(orphanId);
      fillOrphanForm(editingOrphanRow);
    } catch (error) {
      showToast(friendlyError(error), 'error');
      hideOverlay();
      return;
    } finally {
      hideOverlay();
    }
  }

  document.getElementById('orphanModal').classList.add('show');
}

function resetStepsUI() {
  document.querySelectorAll('#orphanForm .step').forEach((s, i) => {
    s.classList.toggle('active', i === 0);
    s.classList.remove('completed');
  });
  document.querySelectorAll('#orphanForm .form-step').forEach((s, i) => {
    s.classList.toggle('active', i === 0);
  });
}

function fillOrphanForm(o) {
  const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
  set('fileNumber', o.fileNumber);
  set('fullName', o.fullName);
  set('gender', o.gender);
  set('dateOfBirth', o.dateOfBirth);
  set('orphanStatus', o.orphanStatus);
  set('nationalId', o.nationalId);
  set('orphanNotes', o.notes);
  set('fatherName', o.fatherName);
  set('motherName', o.motherName);
  set('fatherDeathDate', o.fatherDeathDate);
  set('fatherDeathCause', o.fatherDeathCause);
  set('motherDeathDate', o.motherDeathDate);
  set('motherDeathCause', o.motherDeathCause);
  set('originalAddress', o.originalAddress);
  set('currentAddress', o.currentAddress);
  set('governorate', o.governorate);
  set('city', o.city);
  set('area', o.area);
  set('housingStatus', o.housingStatus);
  set('guardianName', o.guardianName);
  set('guardianRelationship', o.guardianRelationship);
  set('primaryPhone', o.primaryPhone);
  set('alternativePhone', o.alternativePhone);
  set('incomeSource', o.incomeSource);
  set('familyName', o.family?.name || '');
  set('familyMembers', o.familyMembers);
  set('economicStatus', o.economicStatus);
  set('generalNeeds', o.generalNeeds);
  set('educationStatus', o.educationStatus);
  set('schoolName', o.schoolName);
  set('grade', o.grade);
  set('healthStatus', o.healthStatus);
  set('healthCondition', o.healthCondition);
  set('disabilityType', o.disabilityType);
  set('requiredTreatment', o.requiredTreatment);
  set('sponsorshipStatus', o.sponsorshipStatus);

  if (o.displaced === 'yes') document.getElementById('displacedYes').checked = true;
  else document.getElementById('displacedNo').checked = true;

  if (o.hasDisability) {
    document.getElementById('disabilityYes').checked = true;
    toggleDisabilityType(true);
  } else {
    document.getElementById('disabilityNo').checked = true;
    toggleDisabilityType(false);
  }

  setNeedsCheckboxes(o.needs || []);
  calculateAge();
}

export function closeOrphanModal() {
  document.getElementById('orphanModal').classList.remove('show');
  editingOrphanId = null;
  editingOrphanRow = null;
}

export function changeStep(direction) {
  const newStep = currentStep + direction;
  if (newStep >= 1 && newStep <= TOTAL_STEPS) {
    if (direction > 0 && !validateStep(currentStep)) {
      showToast('يرجى إكمال الحقول المطلوبة في هذه الخطوة.', 'error');
      return;
    }
    document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.remove('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('completed');

    currentStep = newStep;

    document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');
    updateStepIndicator();
  }
}

function updateStepIndicator() {
  document.getElementById('prevBtn').style.visibility = currentStep === 1 ? 'hidden' : 'visible';
  if (currentStep === TOTAL_STEPS) {
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('nextBtn').style.display = 'inline-flex';
    document.getElementById('saveBtn').style.display = 'none';
  }
}

function validateStep(step) {
  const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
  const requiredFields = stepEl.querySelectorAll('[required]');
  for (const field of requiredFields) {
    if (!field.value.trim()) {
      field.style.borderColor = 'var(--danger-color)';
      setTimeout(() => { field.style.borderColor = ''; }, 2000);
      field.focus();
      return false;
    }
  }
  // تحقق فوري من رقم الهوية والجوال في الخطوة الأولى
  if (step === 1) {
    const natId = document.getElementById('nationalId').value.trim();
    if (natId && !/^[0-9]{9}$/.test(natId)) {
      showToast('رقم الهوية يجب أن يكون 9 أرقام أو فارغاً.', 'error');
      return false;
    }
  }
  return true;
}

export function calculateAge() {
  const dob = document.getElementById('dateOfBirth').value;
  if (dob) {
    const age = calculateAgeFromDate(dob);
    document.getElementById('age').value = age + ' سنة';
  }
}

export function toggleDisabilityType(show) {
  document.getElementById('disabilityTypeGroup').style.display = show ? 'block' : 'none';
}

const NEED_IDS = {
  need1: 'food', need2: 'clothes', need3: 'shoes', need4: 'education',
  need5: 'health', need6: 'medicine', need7: 'housing', need8: 'furniture',
  need9: 'electronics', need10: 'transport', need11: 'training',
  need12: 'psychological', need13: 'special', need14: 'emergency', need15: 'other',
};

function getSelectedNeeds() {
  return Object.entries(NEED_IDS)
    .filter(([id]) => document.getElementById(id)?.checked)
    .map(([, value]) => value);
}

function setNeedsCheckboxes(needs) {
  Object.entries(NEED_IDS).forEach(([id, value]) => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = needs.includes(value);
  });
}

/** توليد معرف QR داخلي آمن — لا يحتوي على أي بيانات شخصية */
function generateQRId() {
  return 'ORPHAN:' + Date.now() + ':' +
    (crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11)).replace(/-/g, '').slice(0, 9);
}

// --------------------------------------------------------------- الحفظ ---
export async function saveOrphan(e) {
  e.preventDefault();
  if (!canEdit()) {
    showToast('ليس لديك صلاحية للحفظ.', 'error');
    return;
  }

  const formData = {
    fileNumber: document.getElementById('fileNumber').value,
    fullName: document.getElementById('fullName').value,
    gender: document.getElementById('gender').value,
    dateOfBirth: document.getElementById('dateOfBirth').value,
    nationalId: document.getElementById('nationalId').value,
    orphanStatus: document.getElementById('orphanStatus').value,
    notes: document.getElementById('orphanNotes').value,
    fatherName: document.getElementById('fatherName').value,
    motherName: document.getElementById('motherName').value,
    fatherDeathDate: document.getElementById('fatherDeathDate').value,
    fatherDeathCause: document.getElementById('fatherDeathCause').value,
    motherDeathDate: document.getElementById('motherDeathDate').value,
    motherDeathCause: document.getElementById('motherDeathCause').value,
    originalAddress: document.getElementById('originalAddress').value,
    currentAddress: document.getElementById('currentAddress').value,
    governorate: document.getElementById('governorate').value,
    city: document.getElementById('city').value,
    area: document.getElementById('area').value,
    housingStatus: document.getElementById('housingStatus').value,
    displaced: document.querySelector('input[name="displaced"]:checked')?.value || 'no',
    guardianName: document.getElementById('guardianName').value,
    guardianRelationship: document.getElementById('guardianRelationship').value,
    primaryPhone: document.getElementById('primaryPhone').value,
    alternativePhone: document.getElementById('alternativePhone').value,
    incomeSource: document.getElementById('incomeSource').value,
    familyName: document.getElementById('familyName').value,
    familyMembers: document.getElementById('familyMembers').value,
    economicStatus: document.getElementById('economicStatus').value,
    generalNeeds: document.getElementById('generalNeeds').value,
    educationStatus: document.getElementById('educationStatus').value,
    schoolName: document.getElementById('schoolName').value,
    grade: document.getElementById('grade').value,
    healthStatus: document.getElementById('healthStatus').value,
    healthCondition: document.getElementById('healthCondition').value,
    hasDisability: document.querySelector('input[name="disability"]:checked')?.value === 'yes',
    disabilityType: document.getElementById('disabilityType').value,
    requiredTreatment: document.getElementById('requiredTreatment').value,
    sponsorshipStatus: document.getElementById('sponsorshipStatus').value,
    needs: getSelectedNeeds(),
  };

  // التحقق من صحة البيانات (جهة العميل) — يُكرَّر في قاعدة البيانات
  const validationError = validateOrphan(formData);
  if (validationError) {
    showToast(validationError, 'error');
    return;
  }

  showOverlay();
  try {
    // ربط الأسرة: إيجاد الأسرة بالاسم أو إنشاؤها إن لم تكن موجودة
    const familyId = await findOrCreateFamily(formData.familyName, {
      guardian: formData.guardianName,
      phone: formData.primaryPhone,
      district: formData.governorate || formData.area,
      address: formData.currentAddress,
      housing: formData.housingStatus,
      income: formData.incomeSource,
      members: formData.familyMembers,
      economic: formData.economicStatus,
      displaced: formData.displaced,
      notes: formData.generalNeeds,
    });
    formData.familyId = familyId;

    if (editingOrphanId) {
      await updateOrphan(editingOrphanId, formData);
      showToast('تم تحديث بيانات اليتيم بنجاح.', 'success');
    } else {
      await insertOrphan(formData);
      showToast('تم حفظ بيانات اليتيم بنجاح.', 'success');
    }
    closeOrphanModal();
    await loadOrphans();
  } catch (error) {
    // أخطاء مثل تكرار رقم الملف تُعرض برسائل عربية واضحة
    const friendly = friendlyError(error);
    if (friendly.includes('رقم الملف مستخدم')) {
      showToast(friendly, 'error');
      currentStep = 1;
      resetStepsUI();
    } else {
      showToast(friendly, 'error');
    }
  } finally {
    hideOverlay();
  }
}

// --------------------------------------------------------------- الحذف ---
export async function deleteOrphan(id) {
  if (!canDelete()) {
    showToast('الحذف متاح للمدير فقط.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'حذف يتيم',
    message: 'هل أنت متأكد من حذف هذا السجل نهائياً؟ سيتم حذف مساعداته ومتابعاته المرتبطة أيضاً.',
    okText: 'حذف نهائي',
  });
  if (!ok) return;

  showOverlay();
  try {
    await deleteOrphanRow(id);
    showToast('تم حذف السجل.', 'success');
    await loadOrphans();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// ---------------------------------------------------------- عرض التفاصيل ---
export async function viewOrphan(id) {
  showOverlay();
  try {
    const o = await getOrphan(id);
    if (!o) return;

    document.getElementById('orphanViewTitle').textContent = o.fullName;

    const info = (label, value) => `
      <div class="info-item">
        <div class="info-label">${label}</div>
        <div class="info-value">${value === null || value === undefined || value === '' ? '-' : value}</div>
      </div>`;

    const needsLabels = {
      food: 'غذاء', clothes: 'ملابس', shoes: 'أحذية', education: 'تعليم',
      health: 'صحة', medicine: 'أدوية', housing: 'سكن', furniture: 'أثاث',
      electronics: 'أجهزة إلكترونية', transport: 'مواصلات', training: 'تدريب مهني',
      psychological: 'دعم نفسي واجتماعي', special: 'احتياجات خاصة',
      emergency: 'طارئ', other: 'أخرى',
    };
    const { HOUSING_LABELS, ECONOMIC_LABELS, EDUCATION_LABELS, HEALTH_LABELS, formatDate, formatDateTime } =
      await import('./ui.js');

    document.getElementById('orphanViewContent').innerHTML = `
      <h4 class="section-title">البيانات الأساسية</h4>
      <div class="info-grid">
        ${info('رقم الملف', esc(o.fileNumber))}
        ${info('الاسم الرباعي', esc(o.fullName))}
        ${info('الجنس', o.gender === 'male' ? 'ذكر' : 'أنثى')}
        ${info('تاريخ الميلاد / العمر', `${esc(formatDate(o.dateOfBirth))} (${o.dateOfBirth ? calculateAgeFromDate(o.dateOfBirth) + ' سنة' : '-'})`)}
        ${o.nationalId ? info('رقم الهوية', esc(o.nationalId)) : ''}
        ${info('حالة اليتم', esc(ORPHAN_STATUS_LABELS[o.orphanStatus] || '-'))}
      </div>

      <h4 class="section-title">الوالدان</h4>
      <div class="info-grid">
        ${info('اسم الأب', esc(o.fatherName))}
        ${info('اسم الأم', esc(o.motherName))}
        ${info('تاريخ وفاة الأب', esc(formatDate(o.fatherDeathDate)))}
        ${info('سبب وفاة الأب', esc(o.fatherDeathCause))}
        ${info('تاريخ وفاة الأم', esc(formatDate(o.motherDeathDate)))}
        ${info('سبب وفاة الأم', esc(o.motherDeathCause))}
      </div>

      <h4 class="section-title">السكن</h4>
      <div class="info-grid">
        ${info('المحافظة', esc(o.governorate))}
        ${info('المدينة', esc(o.city))}
        ${info('المنطقة', esc(o.area))}
        ${info('حالة السكن', esc(HOUSING_LABELS[o.housingStatus] || '-'))}
        ${info('العنوان الحالي', esc(o.currentAddress))}
        ${info('العنوان الأصلي', esc(o.originalAddress))}
        ${info('النزوح', o.displaced === 'yes' ? '<span class="badge badge-danger">نازح</span>' : '<span class="badge badge-success">غير نازح</span>')}
      </div>

      <h4 class="section-title">ولي الأمر والاتصال</h4>
      <div class="info-grid">
        ${info('اسم ولي الأمر', esc(o.guardianName))}
        ${info('صلة القرابة', esc(o.guardianRelationship))}
        ${info('الجوال الأساسي', esc(o.primaryPhone))}
        ${info('الجوال البديل', esc(o.alternativePhone))}
        ${info('مصدر الدخل', esc(o.incomeSource))}
      </div>

      <h4 class="section-title">الأسرة</h4>
      <div class="info-grid">
        ${info('اسم الأسرة', o.family ? `<a href="#" onclick="viewFamily('${o.family.id}'); return false;" style="color:var(--primary-color)">${esc(o.family.name)}</a>` : '-')}
        ${info('رمز الأسرة', esc(o.family?.family_code))}
        ${info('عدد أفراد الأسرة', o.familyMembers ?? '-')}
        ${info('الحالة الاقتصادية', esc(ECONOMIC_LABELS[o.economicStatus] || '-'))}
      </div>

      <h4 class="section-title">التعليم</h4>
      <div class="info-grid">
        ${info('الحالة التعليمية', esc(EDUCATION_LABELS[o.educationStatus] || '-'))}
        ${info('المدرسة', esc(o.schoolName))}
        ${info('الصف', esc(o.grade))}
      </div>

      <h4 class="section-title">الصحة</h4>
      <div class="info-grid">
        ${info('الحالة الصحية', esc(HEALTH_LABELS[o.healthStatus] || '-'))}
        ${info('المرض / الحالة', esc(o.healthCondition))}
        ${info('إعاقة', o.hasDisability ? `نعم — ${esc(o.disabilityType)}` : 'لا')}
        ${info('العلاج المطلوب', esc(o.requiredTreatment))}
      </div>

      <h4 class="section-title">الكفالة والاحتياجات</h4>
      <div class="info-grid">
        ${info('حالة الكفالة', sponsorshipBadge(o.sponsorshipStatus))}
        ${info('الاحتياجات', (o.needs || []).map((n) => needsLabels[n] || n).join('، ') || '-')}
        ${info('الاحتياجات العامة', esc(o.generalNeeds))}
        ${info('ملاحظات', esc(o.notes))}
      </div>

      <h4 class="section-title">بيانات السجل</h4>
      <div class="info-grid">
        ${info('تاريخ الإنشاء', esc(formatDateTime(o.createdAt)))}
        ${info('آخر تحديث', esc(formatDateTime(o.updatedAt)))}
      </div>`;

    document.getElementById('orphanViewModal')._orphan = o;
    document.getElementById('orphanViewModal').classList.add('show');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

export function closeViewOrphanModal() {
  document.getElementById('orphanViewModal').classList.remove('show');
}

export function editFromView() {
  const o = document.getElementById('orphanViewModal')._orphan;
  if (!o) return;
  closeViewOrphanModal();
  openOrphanForm(o.id);
}

export function showQRFromView() {
  const o = document.getElementById('orphanViewModal')._orphan;
  if (!o) return;
  closeViewOrphanModal();
  import('./qr.js').then((m) => m.showQR(o.id));
}

export function printOrphanView() {
  import('./ui.js').then((m) => m.printModal());
}

export async function pdfOrphanView() {
  const modal = document.getElementById('orphanViewModal');
  const o = modal._orphan;
  if (!o) return;
  import('./reports.js').then((m) => {
    m.exportElementToPdf(
      document.getElementById('orphanViewContent'),
      `orphan_${o.fileNumber || o.id}.pdf`,
      `تقرير اليتيم — ${o.fullName}`
    );
  });
}
