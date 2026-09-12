// ===========================================================================
// سجل النشاط (Audit Trail) — للمدير فقط، محمي أيضاً بسياسات RLS
// ===========================================================================
import { listLogs } from './data.js';
import { isAdmin } from './state.js';
import { esc, showToast, renderPagination, formatDateTime } from './ui.js';
import { friendlyError } from './errors.js';

const logsState = { page: 1, perPage: 30, action: '' };

const ACTION_LABELS = {
  login: ['تسجيل دخول', 'badge-success'],
  logout: ['تسجيل خروج', 'badge-secondary'],
  create: ['إضافة', 'badge-primary'],
  update: ['تعديل', 'badge-warning'],
  delete: ['حذف', 'badge-danger'],
  user_create: ['إنشاء مستخدم', 'badge-info'],
  user_update: ['تعديل مستخدم', 'badge-info'],
  user_delete: ['حذف مستخدم', 'badge-danger'],
  password_reset_request: ['طلب استعادة كلمة مرور', 'badge-warning'],
  password_change: ['تغيير كلمة مرور', 'badge-warning'],
  admin_initialized: ['تهيئة المدير الأول', 'badge-info'],
  signup: ['تسجيل مستخدم جديد', 'badge-secondary'],
  export_backup: ['تصدير نسخة', 'badge-primary'],
  export_csv_orphans: ['تصدير CSV أيتام', 'badge-primary'],
  export_csv_assistance: ['تصدير CSV مساعدات', 'badge-primary'],
  export_pdf_orphan: ['تصدير PDF يتيم', 'badge-primary'],
  export_pdf_family: ['تصدير PDF أسرة', 'badge-primary'],
  import_local_backup: ['استيراد نسخة قديمة', 'badge-warning'],
  clear_all_data: ['حذف جميع السجلات', 'badge-danger'],
};

const ENTITY_LABELS = {
  orphans: 'يتيم',
  families: 'أسرة',
  assistance: 'مساعدة',
  follow_ups: 'متابعة',
  profile: 'مستخدم',
  auth: 'جلسة',
};

export async function loadLogs() {
  if (!isAdmin()) {
    showToast('سجل النشاط متاح للمدير فقط.', 'error');
    return;
  }
  try {
    const { rows, count } = await listLogs({
      page: logsState.page, perPage: logsState.perPage, action: logsState.action,
    });

    const tbody = document.getElementById('logsTableBody');
    const table = document.getElementById('logsTable');
    const empty = document.getElementById('logsEmptyState');

    if (rows.length === 0 && count === 0) {
      table.style.display = 'none';
      empty.classList.remove('hidden');
      renderPagination('logsPagination', { page: 1, perPage: logsState.perPage, total: 0, onPage: 'goToLogsPage' });
      return;
    }
    table.style.display = 'table';
    empty.classList.add('hidden');

    tbody.innerHTML = rows.map((l) => {
      const [label, badgeClass] = ACTION_LABELS[l.action] || [l.action, 'badge-secondary'];
      return `
        <tr>
          <td>${esc(formatDateTime(l.created_at))}</td>
          <td>${esc(l.user_name || 'النظام')}</td>
          <td><span class="badge ${badgeClass}">${esc(label)}</span></td>
          <td>${esc(ENTITY_LABELS[l.entity_type] || l.entity_type || '-')}</td>
          <td>${esc(l.description || '-')}</td>
        </tr>`;
    }).join('');

    renderPagination('logsPagination', {
      page: logsState.page, perPage: logsState.perPage, total: count,
      onPage: 'goToLogsPage', label: 'سجل',
    });
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

export function goToLogsPage(p) {
  if (p < 1) return;
  logsState.page = p;
  loadLogs();
}

export function changeLogFilter(v) {
  logsState.action = v;
  logsState.page = 1;
  loadLogs();
}
