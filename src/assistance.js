// ===========================================================================
// المساعدات والمتابعة — سجلات مرتبطة بالأيتام (علاقات مرجعية حقيقية)
// ===========================================================================
import { canEdit, canDelete } from './state.js';
import {
  listAssistance, insertAssistance, updateAssistance, deleteAssistance,
  listFollowUps, insertFollowUp, updateFollowUp, deleteFollowUp,
  searchOrphansLight, getOrphanByCode,
} from './data.js';
import {
  esc, showToast, showOverlay, hideOverlay, confirmDialog, renderPagination,
  ASSISTANCE_TYPE_LABELS, formatDate, sponsorshipBadge, ORPHAN_STATUS_LABELS,
} from './ui.js';
import { friendlyError } from './errors.js';

// ---------------------------------------------------------- المساعدات ---
const assistanceState = { page: 1, perPage: 20, search: '' };
let editingAssistanceId = null;

export async function loadAssistance() {
  assistanceState.search = document.getElementById('assistanceSearch').value;
  const type = document.getElementById('assistanceTypeFilter').value;
  try {
    const { rows, count } = await listAssistance({
      page: assistanceState.page, perPage: assistanceState.perPage,
      search: assistanceState.search, type,
    });
    const tbody = document.getElementById('assistanceTableBody');
    const table = document.getElementById('assistanceTable');
    const empty = document.getElementById('assistanceEmptyState');

    if (rows.length === 0 && count === 0) {
      table.style.display = 'none';
      empty.classList.remove('hidden');
      renderPagination('assistancePagination', { page: 1, perPage: assistanceState.perPage, total: 0, onPage: 'goToAssistancePage' });
      return;
    }
    table.style.display = 'table';
    empty.classList.add('hidden');

    tbody.innerHTML = rows.map((a) => `
      <tr>
        <td>${esc(a.orphans?.full_name || '-')}</td>
        <td>${esc(a.orphans?.orphan_code || '-')}</td>
        <td>${esc(formatDate(a.date))}</td>
        <td><span class="badge badge-info">${esc(ASSISTANCE_TYPE_LABELS[a.type] || a.type)}</span></td>
        <td>${a.amount != null ? Number(a.amount).toLocaleString('ar') : '-'}</td>
        <td>${esc(a.notes || '-')}</td>
        <td class="action-buttons">
          ${canEdit() ? `<button class="btn btn-sm btn-secondary" onclick="openAssistanceForm('${a.id}')">تعديل</button>` : ''}
          ${canDelete() ? `<button class="btn btn-sm btn-danger" onclick="deleteAssistanceRecord('${a.id}')">حذف</button>` : ''}
        </td>
      </tr>
    `).join('');

    renderPagination('assistancePagination', {
      page: assistanceState.page, perPage: assistanceState.perPage, total: count,
      onPage: 'goToAssistancePage', label: 'مساعدة',
    });
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

export function goToAssistancePage(p) {
  if (p < 1) return;
  assistanceState.page = p;
  loadAssistance();
}

export function searchAssistance() {
  assistanceState.page = 1;
  clearTimeout(searchAssistance._t);
  searchAssistance._t = setTimeout(loadAssistance, 250);
}

export function clearAssistanceFilters() {
  document.getElementById('assistanceSearch').value = '';
  document.getElementById('assistanceTypeFilter').value = '';
  assistanceState.page = 1;
  loadAssistance();
}

export async function openAssistanceForm(id = null) {
  if (!canEdit()) {
    showToast('ليس لديك صلاحية لتسجيل المساعدات.', 'error');
    return;
  }
  editingAssistanceId = id;
  document.getElementById('assistanceModalTitle').textContent = id ? 'تعديل مساعدة' : 'إضافة مساعدة';
  document.getElementById('assistanceForm').reset();
  document.getElementById('as_date').value = new Date().toISOString().slice(0, 10);
  await loadOrphanDatalist();

  if (id) {
    showOverlay();
    try {
      const { supabase } = await import('./env.js');
      const { data, error } = await supabase
        .from('assistance')
        .select('*, orphans(full_name, orphan_code)')
        .eq('id', id)
        .single();
      if (error) throw error;
      document.getElementById('as_orphan').value =
        `${data.orphans?.orphan_code} — ${data.orphans?.full_name}`;
      document.getElementById('as_date').value = data.date;
      document.getElementById('as_type').value = data.type;
      document.getElementById('as_amount').value = data.amount ?? '';
      document.getElementById('as_notes').value = data.notes || '';
    } catch (error) {
      showToast(friendlyError(error), 'error');
      hideOverlay();
      return;
    } finally {
      hideOverlay();
    }
  }

  document.getElementById('assistanceModal').classList.add('show');
}

export function closeAssistanceModal() {
  document.getElementById('assistanceModal').classList.remove('show');
  editingAssistanceId = null;
}

/** تحميل قائمة أيتام خفيفة لقائمة الاقتراحات */
async function loadOrphanDatalist() {
  try {
    const orphans = await searchOrphansLight('', 300);
    const datalist = document.getElementById('orphanDatalist');
    if (datalist) {
      datalist.innerHTML = orphans
        .map((o) => `<option value="${esc(o.orphan_code)} — ${esc(o.full_name)}"></option>`)
        .join('');
    }
  } catch { /* قائمة الاقتراحات ليست حرجة */ }
}

/** تحويل نص «الرقم — الاسم» إلى معرف يتيم */
async function resolveOrphanPicker(value) {
  const code = String(value || '').split('—')[0].trim();
  if (!code) return null;
  const orphan = await getOrphanByCode(code);
  return orphan;
}

export async function saveAssistance(e) {
  e.preventDefault();
  if (!canEdit()) return;

  const orphan = await resolveOrphanPicker(document.getElementById('as_orphan').value);
  if (!orphan) {
    showToast('يرجى اختيار يتيم صحيح من القائمة.', 'error');
    return;
  }

  const record = {
    orphanId: orphan.id,
    date: document.getElementById('as_date').value,
    type: document.getElementById('as_type').value,
    amount: document.getElementById('as_amount').value,
    notes: document.getElementById('as_notes').value,
  };
  if (!record.date || !record.type) {
    showToast('التاريخ والنوع مطلوبان.', 'error');
    return;
  }

  showOverlay();
  try {
    if (editingAssistanceId) {
      await updateAssistance(editingAssistanceId, record);
      showToast('تم تحديث المساعدة.', 'success');
    } else {
      await insertAssistance(record);
      showToast('تمت إضافة المساعدة.', 'success');
    }
    closeAssistanceModal();
    await loadAssistance();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

export async function deleteAssistanceRecord(id) {
  if (!canDelete()) {
    showToast('الحذف متاح للمدير فقط.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'حذف مساعدة',
    message: 'هل أنت متأكد من حذف سجل المساعدة؟',
    okText: 'حذف',
  });
  if (!ok) return;
  try {
    await deleteAssistance(id);
    showToast('تم الحذف.', 'success');
    await loadAssistance();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

// ----------------------------------------------------------- المتابعة ---
const followupState = { page: 1, perPage: 20, search: '' };
let editingFollowupId = null;

export async function loadFollowups() {
  followupState.search = document.getElementById('followupSearch').value;
  const upcoming = document.getElementById('followupFilter').value === 'upcoming';
  try {
    const { rows, count } = await listFollowUps({
      page: followupState.page, perPage: followupState.perPage,
      search: followupState.search, upcoming,
    });
    const tbody = document.getElementById('followupsTableBody');
    const table = document.getElementById('followupsTable');
    const empty = document.getElementById('followupsEmptyState');

    if (rows.length === 0 && count === 0) {
      table.style.display = 'none';
      empty.classList.remove('hidden');
      renderPagination('followupsPagination', { page: 1, perPage: followupState.perPage, total: 0, onPage: 'goToFollowupPage' });
      return;
    }
    table.style.display = 'table';
    empty.classList.add('hidden');

    const today = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = rows.map((f) => `
      <tr>
        <td>${esc(f.orphans?.full_name || '-')}</td>
        <td>${esc(f.orphans?.orphan_code || '-')}</td>
        <td>${esc(formatDate(f.date))}</td>
        <td>${esc(f.notes || '-')}</td>
        <td>${f.next_follow_up_date
          ? `<span class="badge ${f.next_follow_up_date >= today ? 'badge-warning' : 'badge-danger'}">${esc(formatDate(f.next_follow_up_date))}</span>`
          : '-'}</td>
        <td class="action-buttons">
          ${canEdit() ? `<button class="btn btn-sm btn-secondary" onclick="openFollowupForm('${f.id}')">تعديل</button>` : ''}
          ${canDelete() ? `<button class="btn btn-sm btn-danger" onclick="deleteFollowupRecord('${f.id}')">حذف</button>` : ''}
        </td>
      </tr>
    `).join('');

    renderPagination('followupsPagination', {
      page: followupState.page, perPage: followupState.perPage, total: count,
      onPage: 'goToFollowupPage', label: 'متابعة',
    });
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

export function goToFollowupPage(p) {
  if (p < 1) return;
  followupState.page = p;
  loadFollowups();
}

export function searchFollowup() {
  followupState.page = 1;
  clearTimeout(searchFollowup._t);
  searchFollowup._t = setTimeout(loadFollowups, 250);
}

export function clearFollowupFilters() {
  document.getElementById('followupSearch').value = '';
  document.getElementById('followupFilter').value = '';
  followupState.page = 1;
  loadFollowups();
}

export async function openFollowupForm(id = null) {
  if (!canEdit()) {
    showToast('ليس لديك صلاحية لتسجيل المتابعات.', 'error');
    return;
  }
  editingFollowupId = id;
  document.getElementById('followupModalTitle').textContent = id ? 'تعديل متابعة' : 'إضافة متابعة';
  document.getElementById('followupForm').reset();
  document.getElementById('fu_date').value = new Date().toISOString().slice(0, 10);
  await loadOrphanDatalist();

  if (id) {
    showOverlay();
    try {
      const { supabase } = await import('./env.js');
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*, orphans(full_name, orphan_code)')
        .eq('id', id)
        .single();
      if (error) throw error;
      document.getElementById('fu_orphan').value =
        `${data.orphans?.orphan_code} — ${data.orphans?.full_name}`;
      document.getElementById('fu_date').value = data.date;
      document.getElementById('fu_notes').value = data.notes || '';
      document.getElementById('fu_next_date').value = data.next_follow_up_date || '';
    } catch (error) {
      showToast(friendlyError(error), 'error');
      hideOverlay();
      return;
    } finally {
      hideOverlay();
    }
  }

  document.getElementById('followupModal').classList.add('show');
}

export function closeFollowupModal() {
  document.getElementById('followupModal').classList.remove('show');
  editingFollowupId = null;
}

export async function saveFollowup(e) {
  e.preventDefault();
  if (!canEdit()) return;

  const orphan = await resolveOrphanPicker(document.getElementById('fu_orphan').value);
  if (!orphan) {
    showToast('يرجى اختيار يتيم صحيح من القائمة.', 'error');
    return;
  }

  const record = {
    orphanId: orphan.id,
    date: document.getElementById('fu_date').value,
    notes: document.getElementById('fu_notes').value,
    nextDate: document.getElementById('fu_next_date').value,
  };
  if (!record.date || !record.notes) {
    showToast('التاريخ والملاحظات مطلوبة.', 'error');
    return;
  }
  if (record.nextDate && record.nextDate < record.date) {
    showToast('تاريخ المتابعة القادمة يجب أن يكون بعد تاريخ المتابعة الحالي.', 'error');
    return;
  }

  showOverlay();
  try {
    if (editingFollowupId) {
      await updateFollowUp(editingFollowupId, record);
      showToast('تم تحديث المتابعة.', 'success');
    } else {
      await insertFollowUp(record);
      showToast('تمت إضافة المتابعة.', 'success');
    }
    closeFollowupModal();
    await loadFollowups();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

export async function deleteFollowupRecord(id) {
  if (!canDelete()) {
    showToast('الحذف متاح للمدير فقط.', 'error');
    return;
  }
  const ok = await confirmDialog({
    title: 'حذف متابعة',
    message: 'هل أنت متأكد من حذف سجل المتابعة؟',
    okText: 'حذف',
  });
  if (!ok) return;
  try {
    await deleteFollowUp(id);
    showToast('تم الحذف.', 'success');
    await loadFollowups();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}
