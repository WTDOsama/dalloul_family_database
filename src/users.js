// ===========================================================================
// إدارة المستخدمين (للمدير فقط) — تتم عبر نقاط API خادمية آمنة (api/admin/*)
// مفتاح الخدمة السري يبقى في الخادم ولا يصل للمتصفح أبداً.
// ===========================================================================
import { supabase } from './env.js';
import { state, isAdmin, ROLE_LABELS } from './state.js';
import { esc, showToast, showOverlay, hideOverlay, showAlert, hideAlert, confirmDialog, formatDateTime } from './ui.js';
import { friendlyError } from './errors.js';

// ------------------------------------------------------- استدعاء الخادم ---
async function apiCall(method, path, body = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى.');

  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'تعذر تنفيذ العملية.');
  }
  return json;
}

// -------------------------------------------------------- جدول المستخدمين ---
export async function loadUsersPanel() {
  if (!isAdmin()) return;
  const tbody = document.getElementById('usersTableBody');
  try {
    const data = await apiCall('GET', '/api/admin/users');
    const users = data.users || [];

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">لا يوجد مستخدمون بعد</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map((u) => {
      const isSelf = u.id === state.user?.id;
      const roleOptions = ['admin', 'staff', 'viewer']
        .map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`)
        .join('');
      return `
        <tr>
          <td>${esc(u.full_name || '—')}${isSelf ? ' <span class="badge badge-info">(أنت)</span>' : ''}</td>
          <td>${esc(u.username || '—')}</td>
          <td dir="ltr" style="text-align:right;">${esc(u.email || '—')}</td>
          <td>
            <select onchange="changeUserRole('${u.id}', this.value)" ${isSelf ? 'disabled title="لا يمكن تغيير دورك بنفسك"' : ''}>
              ${roleOptions}
            </select>
          </td>
          <td>
            <button class="btn btn-sm ${u.is_active ? 'btn-success' : 'btn-secondary'}"
              onclick="toggleUserActive('${u.id}', ${u.is_active ? 'false' : 'true'})"
              ${isSelf ? 'disabled' : ''}>
              ${u.is_active ? 'نشط ✓' : 'موقوف'}
            </button>
          </td>
          <td>${esc(formatDateTime(u.last_sign_in_at))}</td>
          <td class="action-buttons">
            <button class="btn btn-sm btn-warning" onclick="resetUserPassword('${esc(u.email || '')}')">🔑 استعادة</button>
            ${!isSelf ? `<button class="btn btn-sm btn-danger" onclick="deleteUserAccount('${u.id}', '${esc(u.email || '')}')">حذف</button>` : ''}
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
  }
}

// ------------------------------------------------------------ إضافة مستخدم ---
export function openUserModal() {
  if (!isAdmin()) return;
  document.getElementById('userForm').reset();
  hideAlert('userModalAlert');
  document.getElementById('userModal').classList.add('show');
}

export function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
}

export async function saveUser(e) {
  e.preventDefault();
  if (!isAdmin()) return;

  const payload = {
    full_name: document.getElementById('u_full_name').value.trim(),
    username: document.getElementById('u_username').value.trim() || null,
    email: document.getElementById('u_email').value.trim(),
    role: document.getElementById('u_role').value,
    password: document.getElementById('u_password').value || null,
  };

  if (!payload.full_name || !payload.email) {
    showAlert('userModalAlert', 'يرجى إكمال الحقول المطلوبة.', 'error');
    return;
  }

  showOverlay();
  try {
    const result = await apiCall('POST', '/api/admin/users', payload);
    closeUserModal();
    if (result.temp_password) {
      await showTempPassword(result.temp_password, payload.email);
    } else {
      showToast('تم إنشاء المستخدم بنجاح.', 'success');
    }
    await loadUsersPanel();
  } catch (error) {
    showAlert('userModalAlert', error.message || friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

/** عرض كلمة المرور المؤقتة لمرة واحدة ليشاركها المدير مع المستخدم */
async function showTempPassword(password, email) {
  const ok = await confirmDialog({
    title: 'تم إنشاء المستخدم',
    message: `كلمة المرور المؤقتة للحساب ${email} هي:\n\n${password}\n\nانسخها الآن وشاركها مع المستخدم بطريقة آمنة — لن تظهر مرة أخرى.`,
    okText: 'تم النسخ',
    danger: false,
  });
  if (ok && navigator.clipboard) {
    try { await navigator.clipboard.writeText(password); showToast('تم نسخ كلمة المرور.', 'success'); } catch { /* تجاهل */ }
  }
}

// ---------------------------------------------------- تعديل الدور/الحالة ---
export async function changeUserRole(userId, role) {
  if (!isAdmin()) return;
  try {
    await apiCall('PATCH', '/api/admin/users', { user_id: userId, role });
    showToast('تم تحديث الدور بنجاح.', 'success');
    await loadUsersPanel();
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
    await loadUsersPanel();
  }
}

export async function toggleUserActive(userId, active) {
  if (!isAdmin()) return;
  try {
    await apiCall('PATCH', '/api/admin/users', { user_id: userId, is_active: active });
    showToast(active ? 'تم تفعيل المستخدم.' : 'تم إيقاف المستخدم.', 'success');
    await loadUsersPanel();
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
    await loadUsersPanel();
  }
}

// ---------------------------------------------------- استعادة كلمة المرور ---
export async function resetUserPassword(email) {
  if (!isAdmin() || !email) return;
  const ok = await confirmDialog({
    title: 'استعادة كلمة المرور',
    message: `سيتم توليد رابط استعادة كلمة مرور للحساب ${email}. انسخ الرابط وشاركه مع المستخدم بطريقة آمنة.`,
    okText: 'توليد الرابط',
    danger: false,
  });
  if (!ok) return;

  showOverlay();
  try {
    const result = await apiCall('POST', '/api/admin/reset-password', { email });
    if (result.link) {
      await showResetLink(result.link, email);
    }
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

async function showResetLink(link, email) {
  const ok = await confirmDialog({
    title: 'رابط الاستعادة',
    message: `رابط استعادة كلمة المرور لـ ${email}:\n\n${link}\n\nانسخه الآن — لن يظهر مرة أخرى.`,
    okText: 'تم النسخ',
    danger: false,
  });
  if (ok && navigator.clipboard) {
    try { await navigator.clipboard.writeText(link); showToast('تم نسخ الرابط.', 'success'); } catch { /* تجاهل */ }
  }
}

// ------------------------------------------------------------ حذف مستخدم ---
export async function deleteUserAccount(userId, email) {
  if (!isAdmin()) return;
  const ok = await confirmDialog({
    title: 'حذف مستخدم',
    message: `سيتم حذف حساب ${email} نهائياً مع كل صلاحياته. هل أنت متأكد؟`,
    okText: 'حذف نهائي',
  });
  if (!ok) return;

  showOverlay();
  try {
    await apiCall('DELETE', '/api/admin/users', { user_id: userId });
    showToast('تم حذف المستخدم.', 'success');
    await loadUsersPanel();
  } catch (error) {
    showToast(error.message || friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}
