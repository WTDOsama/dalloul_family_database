// ===========================================================================
// إدارة الأسر — القائمة، البحث، نموذج الأسرة الكامل، العرض، الحذف المحمي
// (لا يمكن حذف أسرة عليها أيتام — مُطبق أيضاً على مستوى قاعدة البيانات)
// ===========================================================================
import { state, canEdit, canDelete } from './state.js';
import {
  listFamilies, getFamily, getFamilyOrphans, insertFamily, updateFamily,
  deleteFamily as deleteFamilyRow,
} from './data.js';
import { validateFamily } from './validate.js';
import {
  esc, showToast, showOverlay, hideOverlay, confirmDialog, renderPagination,
  displacedBadge, ECONOMIC_LABELS, formatDate, HOUSING_LABELS,
  ORPHAN_STATUS_LABELS, sponsorshipBadge,
} from './ui.js';
import { friendlyError } from './errors.js';

const listState = { page: 1, perPage: 20, search: '' };
let editingFamilyId = null;

// -------------------------------------------------------------- القائمة ---
export async function loadFamilies() {
  listState.search = document.getElementById('familySearchInput').value;
  try {
    const { rows, count } = await listFamilies({
      page: listState.page, perPage: listState.perPage, search: listState.search,
    });
    renderFamilies(rows, count);
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

function renderFamilies(rows, count) {
  const tbody = document.getElementById('familiesTableBody');
  const table = document.getElementById('familiesTable');
  const empty = document.getElementById('familiesEmptyState');

  if (rows.length === 0 && count === 0) {
    table.style.display = 'none';
    empty.classList.remove('hidden');
    renderPagination('familiesPagination', { page: 1, perPage: listState.perPage, total: 0, onPage: 'goToFamiliesPage' });
    return;
  }

  table.style.display = 'table';
  empty.classList.add('hidden');

  tbody.innerHTML = rows.map((f) => `
    <tr>
      <td>${esc(f.name)}</td>
      <td dir="ltr" style="text-align:right;">${esc(f.familyCode)}</td>
      <td>${esc(f.guardian || '-')}</td>
      <td dir="ltr" style="text-align:right;">${esc(f.phone || '-')}</td>
      <td>${esc(f.district || '-')}</td>
      <td>${f.orphanCount ?? 0}</td>
      <td>${esc(ECONOMIC_LABELS[f.economicStatus] || '-')}</td>
      <td>${displacedBadge(f.displaced)}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-primary" onclick="viewFamily('${f.id}')">عرض</button>
        ${canEdit() ? `<button class="btn btn-sm btn-secondary" onclick="openFamilyForm('${f.id}')">تعديل</button>` : ''}
        <button class="btn btn-sm btn-info" onclick="showFamilyQR('${f.id}')">QR</button>
        ${canDelete() ? `<button class="btn btn-sm btn-danger" onclick="deleteFamily('${f.id}')">حذف</button>` : ''}
      </td>
    </tr>
  `).join('');

  renderPagination('familiesPagination', {
    page: listState.page, perPage: listState.perPage, total: count,
    onPage: 'goToFamiliesPage', label: 'أسرة',
  });
}

export function goToFamiliesPage(p) {
  if (p < 1) return;
  listState.page = p;
  loadFamilies();
}

export function changeFamiliesPerPage(v) {
  listState.perPage = Number(v) || 20;
  listState.page = 1;
  loadFamilies();
}

export function searchFamilies() {
  listState.page = 1;
  clearTimeout(searchFamilies._t);
  searchFamilies._t = setTimeout(loadFamilies, 250);
}

export function clearFamilyFilters() {
  document.getElementById('familySearchInput').value = '';
  listState.page = 1;
  loadFamilies();
}

// ------------------------------------------------------ نموذج الأسرة ---
export async function openFamilyForm(familyId = null) {
  if (!canEdit()) {
    showToast('ليس لديك صلاحية لإضافة أو تعديل الأسر.', 'error');
    return;
  }

  editingFamilyId = familyId;
  document.getElementById('familyModalTitle').textContent =
    familyId ? 'تعديل بيانات الأسرة' : 'إضافة أسرة';
  document.getElementById('familyForm').reset();

  if (familyId) {
    showOverlay();
    try {
      const f = await getFamily(familyId);
      const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
      set('fam_name', f.name);
      set('fam_code', f.familyCode);
      set('fam_guardian', f.guardian);
      set('fam_phone', f.phone);
      set('fam_district', f.district);
      set('fam_address', f.address);
      set('fam_housing', f.housing);
      set('fam_income', f.income);
      set('fam_members', f.familyMembers);
      set('fam_economic', f.economicStatus);
      set('fam_displaced', f.displaced === 'yes' ? 'yes' : 'no');
      set('fam_notes', f.notes);
    } catch (error) {
      showToast(friendlyError(error), 'error');
      hideOverlay();
      return;
    } finally {
      hideOverlay();
    }
  }

  document.getElementById('familyModal').classList.add('show');
}

export function closeFamilyModal() {
  document.getElementById('familyModal').classList.remove('show');
  editingFamilyId = null;
}

export async function saveFamily(e) {
  e.preventDefault();
  if (!canEdit()) {
    showToast('ليس لديك صلاحية للحفظ.', 'error');
    return;
  }

  const family = {
    name: document.getElementById('fam_name').value,
    familyCode: document.getElementById('fam_code').value.trim(),
    guardian: document.getElementById('fam_guardian').value,
    phone: document.getElementById('fam_phone').value,
    district: document.getElementById('fam_district').value,
    address: document.getElementById('fam_address').value,
    housing: document.getElementById('fam_housing').value,
    income: document.getElementById('fam_income').value,
    familyMembers: document.getElementById('fam_members').value,
    economicStatus: document.getElementById('fam_economic').value,
    displaced: document.getElementById('fam_displaced').value,
    notes: document.getElementById('fam_notes').value,
  };

  const validationError = validateFamily(family);
  if (validationError) {
    showToast(validationError, 'error');
    return;
  }

  showOverlay();
  try {
    if (editingFamilyId) {
      await updateFamily(editingFamilyId, family);
      showToast('تم تحديث بيانات الأسرة بنجاح.', 'success');
    } else {
      await insertFamily(family);
      showToast('تمت إضافة الأسرة بنجاح.', 'success');
    }
    closeFamilyModal();
    await loadFamilies();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// -------------------------------------------------------------- الحذف ---
export async function deleteFamily(familyId) {
  if (!canDelete()) {
    showToast('الحذف متاح للمدير فقط.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'حذف أسرة',
    message: 'هل أنت متأكد من حذف هذه الأسرة؟ لا يمكن الحذف إذا كان هناك أيتام مرتبطون بها.',
    okText: 'حذف',
  });
  if (!ok) return;

  showOverlay();
  try {
    await deleteFamilyRow(familyId);
    showToast('تم حذف الأسرة.', 'success');
    await loadFamilies();
  } catch (error) {
    // رسالة مخصصة: لا يمكن حذف الأسرة لوجود أيتام مرتبطين بها
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// ------------------------------------------------------------- العرض ---
export async function viewFamily(id) {
  showOverlay();
  try {
    const f = await getFamily(id);
    const orphans = await getFamilyOrphans(id);

    document.getElementById('familyViewTitle').textContent = f.name;

    const info = (label, value) => `
      <div class="info-item">
        <div class="info-label">${label}</div>
        <div class="info-value">${value ?? '-'}</div>
      </div>`;

    const orphanRows = orphans.map((o) => `
      <tr>
        <td>${esc(o.orphan_code)}</td>
        <td><a href="#" onclick="viewOrphan('${o.id}'); return false;" style="color:var(--primary-color)">${esc(o.full_name)}</a></td>
        <td>${o.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
        <td>${esc(ORPHAN_STATUS_LABELS[o.status] || '-')}</td>
        <td>${sponsorshipBadge(o.sponsorship_status)}</td>
      </tr>`).join('');

    document.getElementById('familyViewContent').innerHTML = `
      <h4 class="section-title">بيانات الأسرة</h4>
      <div class="info-grid">
        ${info('اسم الأسرة', esc(f.name))}
        ${info('رمز الأسرة', esc(f.familyCode))}
        ${info('ولي الأمر', esc(f.guardian))}
        ${info('الجوال', esc(f.phone))}
        ${info('المنطقة', esc(f.district))}
        ${info('العنوان', esc(f.address))}
        ${info('حالة السكن', esc(HOUSING_LABELS[f.housing] || '-'))}
        ${info('مصدر الدخل', esc(f.income))}
        ${info('عدد الأفراد', f.familyMembers ?? '-')}
        ${info('الحالة الاقتصادية', esc(ECONOMIC_LABELS[f.economicStatus] || '-'))}
        ${info('النزوح', displacedBadge(f.displaced))}
        ${info('عدد الأيتام', orphans.length)}
        ${info('تاريخ التسجيل', esc(formatDate(f.createdAt)))}
      </div>
      ${f.notes ? `<h4 class="section-title">ملاحظات</h4><p>${esc(f.notes)}</p>` : ''}
      <h4 class="section-title">أيتام الأسرة (${orphans.length})</h4>
      ${orphans.length ? `
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>رقم الملف</th><th>الاسم</th><th>الجنس</th><th>حالة اليتم</th><th>الكفالة</th></tr></thead>
            <tbody>${orphanRows}</tbody>
          </table>
        </div>` : '<p class="muted">لا يوجد أيتام مرتبطون بهذه الأسرة.</p>'}`;

    document.getElementById('familyViewModal')._family = f;
    document.getElementById('familyViewModal').classList.add('show');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

export function closeViewFamilyModal() {
  document.getElementById('familyViewModal').classList.remove('show');
}

export function editFamilyFromView() {
  const f = document.getElementById('familyViewModal')._family;
  if (!f) return;
  closeViewFamilyModal();
  openFamilyForm(f.id);
}

export function printFamilyView() {
  import('./ui.js').then((m) => m.printModal());
}

export function showFamilyQRFromView() {
  const f = document.getElementById('familyViewModal')._family;
  if (!f) return;
  closeViewFamilyModal();
  import('./qr.js').then((m) => m.showFamilyQR(f.id));
}
