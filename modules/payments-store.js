/* ===== طابور دفعات تجديد الفحص =====
   تبويبان يشتغلوا على نفس البيانات:
     • «تحت الدفع» = status: 'pending'
     • «تم الدفع»  = status: 'paid'

   المصدر الأساسي هو جدول inspection_payments على Supabase عشان يشتغل
   على كل الأجهزة. لو الجدول غير موجود (لسه ما اشتغل الـ SQL)، بيرجع
   تلقائيًا للتخزين المحلي حتى ما يتعطّلش الشغل. */
(function (global) {
  'use strict';

  var LEGACY_KEY = 'yahma-inspection-payments-v1';
  var PENDING_KEY = 'yahma-payment-pending-v1';
  var PAID_KEY = 'yahma-payment-paid-v1';

  function readJSON(key, fallback) {
    try { var v = JSON.parse(global.localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function tableReady() {
    return !!(global.supabaseReady && global.supabaseClient);
  }

  /* ---------- الطابور القديم → الشكل الجديد ---------- */
  function migrateLegacy() {
    var legacy = readJSON(LEGACY_KEY, []);
    if (!legacy.length) return;
    var pending = readJSON(PENDING_KEY, []);
    var seen = new Set(pending.map(function (p) { return String(p.carId) + '|' + String(p.requestedAt); }));
    legacy.forEach(function (item) {
      var key = String(item.carId) + '|' + String(item.requestedAt);
      if (seen.has(key)) return;
      seen.add(key);
      pending.push({
        id: item.id || ('local-' + key),
        carId: String(item.carId),
        plate: item.plate || '',
        branch: item.branch || '',
        status: 'pending',
        requestedAt: item.requestedAt || new Date().toISOString(),
        paidAt: null
      });
    });
    writeJSON(PENDING_KEY, pending);
  }

  /* ---------- محلي (يعمل دايمًا) ---------- */
  function localAll() {
    var pending = readJSON(PENDING_KEY, []);
    var paid = readJSON(PAID_KEY, []);
    return pending
      .filter(function (p) { return p.status !== 'cancelled'; })
      .concat(paid.filter(function (p) { return p.status === 'paid'; }))
      .sort(function (a, b) { return String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')); });
  }

  function localByStatus(status) {
    return localAll().filter(function (p) { return String(p.status) === status; });
  }

  /* ---------- Supabase ---------- */
  async function fetchRemote() {
    if (!tableReady()) return null;
    try {
      var res = await global.supabaseClient
        .from('inspection_payments')
        .select('id,car_id,plate,branch,status,requested_at,paid_at,note')
        .in('status', ['pending', 'paid'])
        .order('requested_at', { ascending: false })
        .limit(2000);
      if (res.error) return null;
      var rows = (res.data || []).map(function (r) {
        return {
          id: r.id,
          carId: String(r.car_id),
          plate: r.plate || '',
          branch: r.branch || '',
          status: r.status,
          requestedAt: r.requested_at,
          paidAt: r.paid_at || null,
          note: r.note || ''
        };
      });
      return rows;
    } catch (_) { return null; }
  }

  /* يحمّل من السيرفر ويحدّث الكاش المحلي */
  async function sync() {
    migrateLegacy();
    var remote = await fetchRemote();
    if (!remote) return localAll();
    var pending = remote.filter(function (p) { return p.status === 'pending'; });
    var paid = remote.filter(function (p) { return p.status === 'paid'; });
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    return remote;
  }

  /* تسجيل طلب جديد (من زر «طلب دفع» في تبويب الفحص) */
  async function requestPayment(car) {
    if (!car) return { ok: false, error: 'السيارة غير موجودة' };
    var entry = {
      id: 'req-' + String(car.id) + '-' + Date.now(),
      carId: String(car.id),
      plate: car.plate || '',
      branch: car.branch || '',
      status: 'pending',
      requestedAt: new Date().toISOString(),
      paidAt: null
    };
    /* محلي أولاً عشانً يشتغل حتى لو الشبكة ضعيفة */
    var pending = readJSON(PENDING_KEY, []);
    if (!pending.some(function (p) { return String(p.carId) === entry.carId; })) {
      pending.unshift(entry);
      writeJSON(PENDING_KEY, pending);
    }
    if (!tableReady()) return { ok: true, local: true };
    try {
      var payload = {
        car_id: entry.carId,
        plate: entry.plate,
        branch: entry.branch,
        status: 'pending',
        requested_at: entry.requestedAt
      };
      var res = await global.supabaseClient.from('inspection_payments').insert(payload);
      if (res.error) return { ok: true, local: true, error: res.error.message };
      var created = Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
      if (created && created.id) {
        entry.id = created.id;
        var list = readJSON(PENDING_KEY, []).map(function (p) {
          return p.id === 'req-' + entry.carId ? null : p;
        }).filter(Boolean);
        var match = null;
        list.forEach(function (p) { if (String(p.carId) === entry.carId && String(p.requestedAt) === entry.requestedAt) match = p; });
        if (match) match.id = created.id;
        else list.unshift(entry);
        writeJSON(PENDING_KEY, list);
      }
      return { ok: true };
    } catch (err) {
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* تسجيل الدفع: pending ⇐ paid */
  async function markPaid(id) {
    var stamp = new Date().toISOString();
    var pending = readJSON(PENDING_KEY, []);
    var paid = readJSON(PAID_KEY, []);
    var found = null;
    for (var i = 0; i < pending.length; i++) {
      if (String(pending[i].id) === String(id)) { found = pending.splice(i, 1)[0]; break; }
    }
    if (found) {
      found.status = 'paid';
      found.paidAt = stamp;
      paid.unshift(found);
    }
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    if (!tableReady()) return { ok: true, local: true };
    try {
      var res = await global.supabaseClient
        .from('inspection_payments')
        .update({ status: 'paid', paid_at: stamp })
        .eq('id', id);
      if (res.error) return { ok: true, local: true, error: res.error.message };
      return { ok: true };
    } catch (err) {
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* إلغاء الطلب */
  async function cancel(id) {
    var pending = readJSON(PENDING_KEY, []);
    var before = pending.length;
    pending = pending.filter(function (p) { return String(p.id) !== String(id); });
    writeJSON(PENDING_KEY, pending);
    if (!tableReady()) return { ok: true, local: true };
    try {
      await global.supabaseClient.from('inspection_payments')
        .update({ status: 'cancelled' })
        .eq('id', id);
      return { ok: true };
    } catch (err) {
      return { ok: true, local: true, error: err && err.message };
    }
  }

  global.YahmaPayments = {
    sync: sync,
    localAll: localAll,
    localByStatus: localByStatus,
    requestPayment: requestPayment,
    markPaid: markPaid,
    cancel: cancel,
    PENDING_KEY: PENDING_KEY,
    PAID_KEY: PAID_KEY
  };

  /* مزامنة أولية: نحدّث العدادات بعد ما تتحدّث البيانات */
  function refreshCounts() {
    var pendingCount = document.getElementById('count-payments');
    var paidCount = document.getElementById('count-paid');
    try {
      if (pendingCount) pendingCount.textContent = localByStatus('pending').length;
      if (paidCount) paidCount.textContent = localByStatus('paid').length;
    } catch (_) {}
  }

  /* نجرّب المزامنة عند الإقلاع وكل ما يرجع المستخدم للتطبيق */
  var triedOnce = false;
  async function trySync() {
    if (!tableReady()) return;
    await sync();
    refreshCounts();
    /* نعيد الرسم لو الشاشة بتعرض تبويب الدفع */
    try {
      var tab = (typeof global.yahmaGetTab === 'function') ? global.yahmaGetTab() : '';
      if (tab === 'payments' || tab === 'paid') { if (typeof global.render === 'function') global.render(); }
    } catch (_) {}
  }

  function boot() {
    migrateLegacy();
    refreshCounts();
    if (!triedOnce && tableReady()) { triedOnce = true; setTimeout(trySync, 1500); }
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') setTimeout(trySync, 600);
      });
    }
    setTimeout(trySync, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);