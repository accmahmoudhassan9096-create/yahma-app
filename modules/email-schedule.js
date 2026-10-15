/* Local recipient/send history and persisted schedule settings. */
(function (global) {
  'use strict';

  const RECIPIENTS_KEY = 'fleet-recipients-v1';
  const SEND_LOG_KEY = 'fleet-sendlog-v1';
  const SCHEDULE_KEY = 'fleet-schedule-v1';
  const DEFAULT_SCHEDULE = { enabled: false, dailyTime: '07:00', weeklyDay: 0, weeklyTime: '08:00' };

  function readList(key) {
    try {
      const value = JSON.parse(global.localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function writeList(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); }
    catch (error) { console.warn('تعذر حفظ إعدادات البريد محليًا', error); }
  }

  function loadSchedule() {
    try {
      return Object.assign({}, DEFAULT_SCHEDULE, JSON.parse(global.localStorage.getItem(SCHEDULE_KEY) || '{}'));
    } catch (_) { return Object.assign({}, DEFAULT_SCHEDULE); }
  }

  async function saveSchedule(schedule) {
    try { global.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule)); } catch(_){yahmaErr(_,'email-schedule.js:29');}
    if (!global.supabaseReady || !global.supabaseClient) throw new Error('اتصال Supabase غير متاح');
    const { error } = await global.supabaseClient.from('email_schedule').upsert({
      id: 1,
      enabled: schedule.enabled,
      daily_time: schedule.dailyTime,
      weekly_day: schedule.weeklyDay,
      weekly_time: schedule.weeklyTime,
      updated_by: global.currentUser?.id || null,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  function markSent(name, kind, channel) {
    const entries = readList(SEND_LOG_KEY);
    entries.unshift({ at: new Date().toISOString(), name, kind, channel });
    writeList(SEND_LOG_KEY, entries.slice(0, 60));
    try {
      if (typeof global.log === 'function') {
        global.log('إرسال مجدول', name + ' — ' + (kind === 'daily' ? 'تقرير يومي' : 'تنبيه مستندات') + (channel === 'mail' ? ' عبر الإيميل' : ' عبر واتساب'));
      }
    } catch(_){yahmaErr(_,'email-schedule.js:51');}
  }

  global.YahmaEmailSchedule = {
    recipientsKey: RECIPIENTS_KEY,
    sendLogKey: SEND_LOG_KEY,
    scheduleKey: SCHEDULE_KEY,
    loadRecipients: () => readList(RECIPIENTS_KEY),
    saveRecipients: value => writeList(RECIPIENTS_KEY, value),
    loadSendLog: () => readList(SEND_LOG_KEY),
    saveSendLog: value => writeList(SEND_LOG_KEY, value),
    loadSchedule,
    saveSchedule,
    markSent
  };
})(typeof window !== 'undefined' ? window : globalThis);
