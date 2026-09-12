// ===========================================================================
// صفحة الإعدادات — معلومات الحساب والنظام (متصلة بقاعدة البيانات الفعلية)
// ===========================================================================
import { supabase } from './env.js';
import { state, isAdmin, ROLE_LABELS } from './state.js';
import { getDashboardStats } from './data.js';
import { esc, formatDateTime, formatDate } from './ui.js';

export async function loadSettingsPage() {
  renderAccountInfo();
  renderSystemInfo();

  if (isAdmin()) {
    // تحميل لوحة إدارة المستخدمين (داخل الإعدادات)
    import('./users.js').then((m) => m.loadUsersPanel());
  }
}

function renderAccountInfo() {
  const info = document.getElementById('accountInfo');
  const p = state.profile;
  const u = state.user;
  if (!info || !p) return;

  const roleBadge = {
    admin: '<span class="badge badge-danger">مدير النظام</span>',
    staff: '<span class="badge badge-info">موظف تسجيل</span>',
    viewer: '<span class="badge badge-secondary">مشاهد</span>',
  }[p.role] || '<span class="badge badge-secondary">—</span>';

  info.innerHTML = `
    <div class="info-item">
      <div class="info-label">الاسم</div>
      <div class="info-value">${esc(p.full_name || '—')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">البريد الإلكتروني</div>
      <div class="info-value" dir="ltr" style="text-align:right;">${esc(u?.email || '—')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">الدور / الصلاحية</div>
      <div class="info-value">${roleBadge}</div>
    </div>
    <div class="info-item">
      <div class="info-label">حالة الحساب</div>
      <div class="info-value">${p.is_active ? 'نشط ✓' : 'موقوف'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">تاريخ الإنشاء</div>
      <div class="info-value">${esc(formatDate(p.created_at))}</div>
    </div>
    <div class="info-item">
      <div class="info-label">آخر تحديث للملف</div>
      <div class="info-value">${esc(formatDateTime(p.updated_at))}</div>
    </div>`;

  const nameInput = document.getElementById('displayNameInput');
  if (nameInput && !nameInput.value) nameInput.value = p.full_name || '';
}

async function renderSystemInfo() {
  const el = document.getElementById('storageInfo');
  if (!el) return;
  try {
    const stats = await getDashboardStats();
    el.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">قاعدة البيانات</div>
          <div class="info-value">Supabase PostgreSQL — متصلة ✓</div>
        </div>
        <div class="info-item">
          <div class="info-label">إجمالي الأيتام</div>
          <div class="info-value">${Number(stats.totalOrphans ?? 0).toLocaleString('ar')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">إجمالي الأسر</div>
          <div class="info-value">${Number(stats.totalFamilies ?? 0).toLocaleString('ar')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">سجلات المساعدات</div>
          <div class="info-value">${Number(stats.totalAssistance ?? 0).toLocaleString('ar')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">سجلات المتابعة</div>
          <div class="info-value">${Number(stats.totalFollowUps ?? 0).toLocaleString('ar')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">الحماية</div>
          <div class="info-value">RLS مفعّلة — صلاحيات حسب الدور</div>
        </div>
      </div>`;
  } catch {
    el.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">قاعدة البيانات</div>
          <div class="info-value" style="color:var(--danger-color);">تعذر الاتصال حالياً</div>
        </div>
      </div>`;
  }
}
