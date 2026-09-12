// ===========================================================================
// أدوات الواجهة العامة: تنبيهات، طباعة، ترقيم صفحات، تنقل، حماية XSS
// (نفس أسلوب الواجهة الأصلية مع إضافة الحماية عند عرض البيانات)
// ===========================================================================
import { state } from './state.js';
import { canEdit, canDelete, isAdmin, canExport } from './state.js';

/** تهريب أي نص قبل إدراجه في HTML — حماية من XSS */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showAlert(elementId, message, type = 'error') {
  const alert = document.getElementById(elementId);
  if (!alert) return;
  alert.textContent = message;
  alert.className = `alert alert-${type === 'warning' ? 'warning' : type} show`;
  if (type === 'warning') {
    alert.style.background = '#fef3c7';
    alert.style.color = '#92400e';
    alert.style.border = '1px solid #fde68a';
  }
  clearTimeout(alert._timer);
  alert._timer = setTimeout(() => alert.classList.remove('show'), 6000);
}

export function hideAlert(elementId) {
  const alert = document.getElementById(elementId);
  if (alert) alert.classList.remove('show');
}

/** تنبيه عائم عام (Toast) */
export function showToast(message, type = 'success') {
  const div = document.createElement('div');
  div.className = `alert alert-${type === 'warning' ? 'warning' : type} show`;
  div.style.cssText =
    'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;min-width:280px;text-align:center;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);background:#fff;border:1px solid #e2e8f0;color:#1e293b;padding:14px 22px;border-radius:10px;font-weight:600;';
  if (type === 'error') { div.style.borderColor = '#fecaca'; div.style.color = '#991b1b'; }
  if (type === 'success') { div.style.borderColor = '#a7f3d0'; div.style.color = '#065f46'; }
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

export function showOverlay() {
  document.getElementById('overlay')?.classList.add('show');
}

export function hideOverlay() {
  document.getElementById('overlay')?.classList.remove('show');
}

// ------------------------------------------------------------- تأكيد عام ---
let confirmResolve = null;

/**
 * نافذة تأكيد عامة تعيد Promise
 * @param {object} opts {title, message, okText, requireText}
 */
export function confirmDialog({ title = 'تأكيد', message = '', okText = 'تأكيد', requireText = null, danger = true } = {}) {
  return new Promise((resolve) => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const okBtn = document.getElementById('confirmOkBtn');
    okBtn.textContent = okText;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    const inputGroup = document.getElementById('confirmInputGroup');
    const input = document.getElementById('confirmInput');
    if (requireText) {
      inputGroup.classList.remove('hidden');
      document.getElementById('confirmInputLabel').textContent =
        `اكتب «${requireText}» للتأكيد:`;
      input.value = '';
    } else {
      inputGroup.classList.add('hidden');
    }
    document.getElementById('confirmModal').classList.add('show');
    if (requireText) setTimeout(() => input.focus(), 50);

    confirmResolve = (val) => {
      document.getElementById('confirmModal').classList.remove('show');
      confirmResolve = null;
      resolve(val);
    };
  });
}

export function okConfirm() {
  if (!confirmResolve) return;
  const requireText = document.getElementById('confirmInputGroup').classList.contains('hidden')
    ? null
    : document.getElementById('confirmInputLabel').textContent.match(/«(.+?)»/)?.[1];
  if (requireText) {
    const val = document.getElementById('confirmInput').value.trim();
    if (val !== requireText) {
      showToast('يرجى كتابة كلمة التأكيد بشكل صحيح.', 'error');
      return;
    }
  }
  confirmResolve(true);
}

export function cancelConfirm() {
  if (confirmResolve) confirmResolve(false);
}

// --------------------------------------------------------------- تنقلات ---
const PAGE_TITLES = {
  dashboard: 'الرئيسية',
  orphans: 'الأيتام',
  families: 'الأسر',
  assistance: 'المساعدات',
  followup: 'المتابعة',
  reports: 'التقارير',
  statistics: 'الإحصاءات',
  logs: 'سجل النشاط',
  backup: 'النسخ الاحتياطي والبيانات',
  settings: 'إعدادات الحساب والإدارة',
};

export function navigateTo(page, action = null) {
  // حماية التنقل حسب الصلاحيات
  if (page === 'logs' && !isAdmin()) {
    showToast('ليس لديك صلاحية لعرض سجل النشاط.', 'error');
    return;
  }
  if (page === 'backup' && !isAdmin()) {
    showToast('صفحة النسخ الاحتياطي متاحة للمدير فقط.', 'error');
    return;
  }
  if (page === 'reports' && !canExport()) {
    showToast('التقارير والتصدير متاحة للموظفين والمديرين فقط.', 'error');
    return;
  }

  state.currentPage = page;
  document.querySelectorAll('.page-content').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.remove('active'));

  const targetPage = document.getElementById(page + 'Page');
  if (targetPage) targetPage.classList.remove('hidden');

  // تفعيل الرابط المناسب في القائمة الجانبية
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.getAttribute('onclick')?.includes(`'${page}'`)) link.classList.add('active');
  });

  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;

  // تحميل بيانات الصفحة (استيراد ديناميكي لتجنب التبعيات الدائرية)
  import('./loaders.js').then((m) => m.loadPage(page, action));

  document.getElementById('sidebar').classList.remove('show');
}

export function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
}

/** إظهار/إخفاء عناصر الواجهة حسب الدور — إضافة إلى الحماية على مستوى قاعدة البيانات */
export function applyRoleVisibility() {
  document.querySelectorAll('.perm-edit').forEach((el) => {
    el.style.display = canEdit() ? '' : 'none';
  });
  document.querySelectorAll('.perm-delete').forEach((el) => {
    el.style.display = canDelete() ? '' : 'none';
  });
  document.querySelectorAll('.perm-admin').forEach((el) => {
    el.style.display = isAdmin() ? '' : 'none';
  });
  const logsNav = document.getElementById('navLogs');
  const backupNav = document.getElementById('navBackup');
  const reportsNav = document.getElementById('navReports');
  if (logsNav) logsNav.style.display = isAdmin() ? '' : 'none';
  if (backupNav) backupNav.style.display = isAdmin() ? '' : 'none';
  if (reportsNav) reportsNav.style.display = canExport() ? '' : 'none';
  const userCard = document.getElementById('userManagementCard');
  if (userCard) userCard.classList.toggle('hidden', !isAdmin());
  const reportsNote = document.getElementById('reportsPermNote');
  const reportsCards = document.getElementById('reportsCards');
  if (reportsNote && reportsCards) {
    reportsNote.classList.toggle('hidden', canExport());
    reportsCards.style.display = canExport() ? '' : 'none';
  }
}

// ------------------------------------------------------ ترقيم الصفحات ---
export function renderPagination(containerId, { page, perPage, total, onPage, label = 'سجل' }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) { container.innerHTML = ''; return; }

  const pages = [];
  const window = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= window) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  let html = `
    <button class="btn btn-sm btn-secondary" ${page <= 1 ? 'disabled' : ''}
      onclick="${onPage}(${page - 1})">السابق</button>`;
  for (const p of pages) {
    if (p === '…') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}"
        onclick="${onPage}(${p})">${p}</button>`;
    }
  }
  html += `
    <button class="btn btn-sm btn-secondary" ${page >= totalPages ? 'disabled' : ''}
      onclick="${onPage}(${page + 1})">التالي</button>
    <span class="page-info">إجمالي ${total} ${label} — صفحة ${page} من ${totalPages}</span>`;
  container.innerHTML = html;
}

// ------------------------------------------------------------ مساعدات ---
export function calculateAgeFromDate(dateOfBirth) {
  if (!dateOfBirth) return '';
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

export const ORPHAN_STATUS_LABELS = { father: 'يتيم الأب', mother: 'يتيم الأم', both: 'يتيم الأب والأم' };
export const SPONSORSHIP_LABELS = { sponsored: 'مكفول', unsponsored: 'غير مكفول', needs: 'بحاجة إلى كفيل' };
export const HOUSING_LABELS = {
  house: 'منزل', rental: 'مستأجر', relatives: 'سكن أقارب',
  tent: 'خيمة', shelter: 'مركز إيواء', other: 'أخرى',
};
export const ECONOMIC_LABELS = { good: 'جيدة', medium: 'متوسطة', poor: 'ضعيفة', verypoor: 'ضعيفة جداً' };
export const EDUCATION_LABELS = {
  notstudying: 'لا يدرس', kindergarten: 'رياض الأطفال', school: 'مدرسة', other: 'أخرى',
};
export const HEALTH_LABELS = { healthy: 'سليم', ill: 'مريض', chronic: 'مريض مزمن' };
export const ASSISTANCE_TYPE_LABELS = {
  material: 'عينية', food: 'غذائية', cash: 'مالية',
  medical: 'طبية', education: 'تعليمية', housing: 'سكنية', other: 'أخرى',
};

export function sponsorshipBadge(status) {
  const map = {
    sponsored: '<span class="badge badge-success">مكفول</span>',
    unsponsored: '<span class="badge badge-danger">غير مكفول</span>',
    needs: '<span class="badge badge-warning">بحاجة إلى كفيل</span>',
  };
  return map[status] || '-';
}

export function displacedBadge(displaced) {
  return displaced === 'yes'
    ? '<span class="badge badge-danger">نازح</span>'
    : '<span class="badge badge-success">غير نازح</span>';
}

/** طباعة عنصر (نافذة) مع إخفاء بقية الصفحة */
export function printModal() {
  document.body.classList.add('print-mode');
  const cleanup = () => {
    document.body.classList.remove('print-mode');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 3000);
}

export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
