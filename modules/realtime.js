/* Realtime subscriptions and fleet refresh handling. */
(function (global) {
  'use strict';

  const TABLE = 'vehicles';
  const STORAGE_KEY = 'fleet-data-v2';
  const LAST_SYNC_KEY = 'fleet-last-sync-v1';
  let channel = null;
  let subscribedClient = null;
  let debounceTimer = null;
  let manualRefreshPromise = null;

  function stableString(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableString(value[key])).join(',') + '}';
  }

  function canSync() {
    return !global._demoMode && global.supabaseReady && global.supabaseClient;
  }

  function detach() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (channel && subscribedClient) {
      try { subscribedClient.removeChannel(channel); }
      catch (error) { console.warn('تعذر إنهاء اشتراك Realtime', error); }
    }
    channel = null;
    subscribedClient = null;
  }

  function attach(context) {
    if (!canSync()) return;
    if (channel && subscribedClient === global.supabaseClient) return;
    if (channel) detach();

    try {
      subscribedClient = global.supabaseClient;
      channel = subscribedClient
        .channel('yahma-vehicles-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => refresh(context), 3000);
        })
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('تعذر تفعيل التحديث المباشر (Realtime):', status);
          }
        });
    } catch (error) {
      channel = null;
      subscribedClient = null;
      console.warn('فشل تفعيل Realtime', error);
    }
  }

  async function refresh(context) {
    if (!canSync()) return;
    try {
      const rows = await context.fetchCloudVehicles();
      const nextFleet = rows.map(context.rowToCar);
      const currentFleet = context.getFleet();
      const ids = nextFleet.map(car => String(car.id));
      if (stableString(nextFleet) === stableString(currentFleet)) {
        context.setCloudVehicleIds(ids);
        return;
      }

      context.setFleet(nextFleet);
      context.setCloudVehicleIds(ids);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextFleet));
      global.localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      global.syncMessage = 'متصل بـ Supabase — تحديث مباشر';
      try {
        if (context.normalizeFleetDates()) {
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(context.getFleet()));
        }
      } catch (_) {}
      try { context.render(); }
      catch (error) { console.error('realtime render failed', error); }
    } catch (error) {
      console.warn('تعذر تحديث الأسطول من Supabase:', error);
    }
  }

  function manualRefresh(context) {
    if (manualRefreshPromise) return manualRefreshPromise;

    const button = global.document.getElementById('btn-refresh');
    const label = button?.querySelector('.btn-label');
    if (button) { button.disabled = true; if (label) label.textContent = 'جارِ التحديث...'; }
    global.syncMessage = 'جارِ التحديث...';
    const sync = global.document.getElementById('sync-status');
    if (sync) { sync.textContent = 'جارِ التحديث...'; sync.className = 'sync-status online'; }

    const operation = (async () => {
      try {
        await context.loadData(true);
        context.updateLastSyncLabel();
        try { context.render(); }
        catch (error) { console.error('refresh render failed', error); }
        const status = global.document.getElementById('sync-status');
        if (status) {
          status.textContent = global.syncMessage || 'تم التحديث';
          status.className = 'sync-status ' + (/تعذر|محلي/.test(global.syncMessage || '') ? 'offline' : 'online');
        }
      } catch (error) {
        console.warn('manual refresh failed', error);
        global.syncMessage = 'تعذر التحديث — البيانات الحالية محفوظة';
        const status = global.document.getElementById('sync-status');
        if (status) { status.textContent = global.syncMessage; status.className = 'sync-status offline'; }
      } finally {
        if (button) { button.disabled = false; if (label) label.textContent = 'تحديث'; }
        manualRefreshPromise = null;
      }
    })();

    manualRefreshPromise = operation;
    return Promise.race([operation, new Promise(resolve => setTimeout(resolve, 350))]);
  }

  global.YahmaRealtime = { attach, refresh, detach, manualRefresh };
})(typeof window !== 'undefined' ? window : globalThis);
