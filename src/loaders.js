// ===========================================================================
// موجّه تحميل الصفحات — يُستدعى من التنقل ومن المزامنة الفورية
// ===========================================================================
import { isAdmin } from './state.js';
import * as stats from './stats.js';
import * as orphans from './orphans.js';
import * as families from './families.js';
import * as assistance from './assistance.js';
import * as logs from './logs.js';
import * as settings from './settings.js';

export function loadPage(page, action = null) {
  switch (page) {
    case 'dashboard':
      stats.loadDashboard();
      break;
    case 'orphans':
      orphans.loadOrphans();
      if (action === 'add') orphans.openOrphanForm();
      break;
    case 'families':
      families.loadFamilies();
      break;
    case 'assistance':
      assistance.loadAssistance();
      break;
    case 'followup':
      assistance.loadFollowups();
      break;
    case 'statistics':
      stats.loadStatistics();
      break;
    case 'logs':
      if (isAdmin()) logs.loadLogs();
      break;
    case 'settings':
      settings.loadSettingsPage();
      break;
    // reports و backup ثابتتان — لا تحتاجان تحميل بيانات
  }
}

/** إعادة تحديث هادئة للصفحة الحالية (بدون overlay) — تستخدمها المزامنة الفورية */
export function refreshCurrentPage(page) {
  loadPage(page);
}
