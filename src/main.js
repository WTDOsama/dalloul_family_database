// ===========================================================================
// نقطة الدخول — تجميع واجهة التطبيق وتشغيل نظام المصادقة
// قاعدة بيانات أيتام عائلة دلول — النسخة الإلكترونية (Supabase + Vercel)
// ===========================================================================
import './env.js';
import { initApp } from './auth.js';
import { navigateTo } from './ui.js';

import * as auth from './auth.js';
import * as ui from './ui.js';
import * as stats from './stats.js';
import * as orphansMod from './orphans.js';
import * as familiesMod from './families.js';
import * as assistanceMod from './assistance.js';
import * as logsMod from './logs.js';
import * as usersMod from './users.js';
import * as settingsMod from './settings.js';
import * as backupMod from './backup.js';
import * as reportsMod from './reports.js';
import * as qrMod from './qr.js';

// -------------------------------------------------- ربط النماذج بالمعالجات ---
function bindForms() {
  document.getElementById('orphanForm').addEventListener('submit', orphansMod.saveOrphan);
  document.getElementById('familyForm').addEventListener('submit', familiesMod.saveFamily);
  document.getElementById('assistanceForm').addEventListener('submit', assistanceMod.saveAssistance);
  document.getElementById('followupForm').addEventListener('submit', assistanceMod.saveFollowup);
  document.getElementById('userForm').addEventListener('submit', usersMod.saveUser);
  // loginForm / setupForm / forgotForm تُربط في auth.bindAuthEvents()
}

// --------------------------------------- كشف الدوال لمعالجات HTML الموجودة ---
// (الحفاظ على أسلوب الواجهة الأصلية: onclick="..." داخل الصفحة)
const api = {
  // المصادقة
  login: null, // يُربط عبر addEventListener
  logout: auth.logout,
  showLogin: auth.showLogin,
  showForgotPassword: auth.showForgotPassword,
  retryPending: auth.retryPending,
  togglePassword: auth.togglePassword,
  changePassword: auth.changePassword,
  updateDisplayName: auth.updateDisplayName,

  // التنقل والواجهة
  navigateTo,
  toggleSidebar: ui.toggleSidebar,
  cancelConfirm: ui.cancelConfirm,
  okConfirm: ui.okConfirm,

  // الأيتام
  loadOrphans: orphansMod.loadOrphans,
  goToOrphansPage: orphansMod.goToOrphansPage,
  changeOrphansPerPage: orphansMod.changeOrphansPerPage,
  searchOrphans: orphansMod.searchOrphans,
  filterOrphans: orphansMod.filterOrphans,
  clearFilters: orphansMod.clearFilters,
  openOrphanForm: orphansMod.openOrphanForm,
  closeOrphanModal: orphansMod.closeOrphanModal,
  changeStep: orphansMod.changeStep,
  calculateAge: orphansMod.calculateAge,
  toggleDisabilityType: orphansMod.toggleDisabilityType,
  viewOrphan: orphansMod.viewOrphan,
  deleteOrphan: orphansMod.deleteOrphan,
  closeViewOrphanModal: orphansMod.closeViewOrphanModal,
  editFromView: orphansMod.editFromView,
  showQRFromView: orphansMod.showQRFromView,
  printOrphanView: orphansMod.printOrphanView,
  pdfOrphanView: orphansMod.pdfOrphanView,

  // الأسر
  loadFamilies: familiesMod.loadFamilies,
  goToFamiliesPage: familiesMod.goToFamiliesPage,
  changeFamiliesPerPage: familiesMod.changeFamiliesPerPage,
  searchFamilies: familiesMod.searchFamilies,
  clearFamilyFilters: familiesMod.clearFamilyFilters,
  openFamilyForm: familiesMod.openFamilyForm,
  closeFamilyModal: familiesMod.closeFamilyModal,
  viewFamily: familiesMod.viewFamily,
  deleteFamily: familiesMod.deleteFamily,
  closeViewFamilyModal: familiesMod.closeViewFamilyModal,
  editFamilyFromView: familiesMod.editFamilyFromView,
  printFamilyView: familiesMod.printFamilyView,
  showFamilyQRFromView: familiesMod.showFamilyQRFromView,

  // المساعدات والمتابعة
  loadAssistance: assistanceMod.loadAssistance,
  goToAssistancePage: assistanceMod.goToAssistancePage,
  searchAssistance: assistanceMod.searchAssistance,
  clearAssistanceFilters: assistanceMod.clearAssistanceFilters,
  openAssistanceForm: assistanceMod.openAssistanceForm,
  closeAssistanceModal: assistanceMod.closeAssistanceModal,
  deleteAssistanceRecord: assistanceMod.deleteAssistanceRecord,
  loadFollowups: assistanceMod.loadFollowups,
  goToFollowupPage: assistanceMod.goToFollowupPage,
  searchFollowup: assistanceMod.searchFollowup,
  clearFollowupFilters: assistanceMod.clearFollowupFilters,
  openFollowupForm: assistanceMod.openFollowupForm,
  closeFollowupModal: assistanceMod.closeFollowupModal,
  deleteFollowupRecord: assistanceMod.deleteFollowupRecord,

  // سجل النشاط
  loadLogs: logsMod.loadLogs,
  goToLogsPage: logsMod.goToLogsPage,
  changeLogFilter: logsMod.changeLogFilter,

  // إدارة المستخدمين
  openUserModal: usersMod.openUserModal,
  closeUserModal: usersMod.closeUserModal,
  changeUserRole: usersMod.changeUserRole,
  toggleUserActive: usersMod.toggleUserActive,
  resetUserPassword: usersMod.resetUserPassword,
  deleteUserAccount: usersMod.deleteUserAccount,

  // النسخ الاحتياطي
  exportData: backupMod.exportData,
  importData: backupMod.importData,
  confirmClearAll: backupMod.confirmClearAll,

  // التقارير
  generateReport: reportsMod.generateReport,
  closePickOrphan: reportsMod.closePickOrphan,
  closePickFamily: reportsMod.closePickFamily,
  searchPickOrphan: reportsMod.searchPickOrphan,
  searchPickFamily: reportsMod.searchPickFamily,

  // QR
  showQR: qrMod.showQR,
  showFamilyQR: qrMod.showFamilyQR,
  scanQR: qrMod.scanQR,
  closeQRModal: qrMod.closeQRModal,
  downloadQR: qrMod.downloadQR,
  printQR: qrMod.printQR,

  // الإحصاءات
  loadStatistics: stats.loadStatistics,
};

Object.assign(window, api);

// --------------------------------------------------------------- التشغيل ---
document.addEventListener('DOMContentLoaded', () => {
  bindForms();
  initApp();
});
