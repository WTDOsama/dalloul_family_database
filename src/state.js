// ===========================================================================
// حالة التطبيق: المستخدم الحالي ودوره والصلاحيات
// ===========================================================================

export const state = {
  /** مستخدم Supabase Auth */
  user: null,
  /** صف المستخدم من جدول profiles */
  profile: null,
  /** الصفحة الحالية */
  currentPage: 'dashboard',
};

export const ROLE_LABELS = {
  admin: 'مدير النظام',
  staff: 'موظف تسجيل',
  viewer: 'مشاهد',
  pending: 'بانتظار التفعيل',
};

export function currentRole() {
  return state.profile?.role || 'pending';
}

export function isActive() {
  return Boolean(state.profile?.is_active);
}

export function isAdmin() {
  return currentRole() === 'admin' && isActive();
}

export function canEdit() {
  return ['admin', 'staff'].includes(currentRole()) && isActive();
}

export function canDelete() {
  return isAdmin();
}

export function canExport() {
  return canEdit(); // التصدير للموظفين والمديرين فقط
}

export function setUser(user, profile) {
  state.user = user;
  state.profile = profile;
}

export function clearUser() {
  state.user = null;
  state.profile = null;
}
