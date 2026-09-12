// ===========================================================================
// المزامنة الفورية (Supabase Realtime)
// أي تعديل من أي مستخدم ينعكس على بقية الأجهزة المتصلة بعد لحظات.
// الاستراتيجية: إشعار بالتغيير ثم إعادة جلب الصفحة الحالية من المصدر —
// لا تُعدَّل البيانات محلياً، فتُمنع حالات التعارض.
// ===========================================================================
import { supabase } from './env.js';
import { state, isActive } from './state.js';

let channel = null;
let refreshTimer = null;
let loaders = null;

export function refreshRealtime() {
  if (!supabase || channel || !isActive()) return;

  import('./loaders.js').then((m) => { loaders = m; });

  channel = supabase.channel('daloul-db-changes');

  for (const table of ['orphans', 'families', 'assistance', 'follow_ups']) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => scheduleRefresh(table)
    );
  }

  channel.subscribe();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!loaders || !state.user || !isActive()) return;
    // تحديث الصفحة الحالية فقط (وبطريقة هادئة بدون overlay)
    loaders.refreshCurrentPage(state.currentPage);
  }, 800);
}

export function stopRealtime() {
  if (channel) {
    supabase?.removeChannel(channel);
    channel = null;
  }
}
