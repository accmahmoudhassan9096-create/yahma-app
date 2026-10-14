/* ===== تشخيص المزامنة (يرجع وعد بنتيجة واضحة) =====
   بنجرّب INSERT ثم DELETE على نفس السجل عشان نعرف إن السياسات شغالة،
   من غير ما نأثر على أي بيانات حقيقية. */
function yahmaPaymentsTableReady() {
  return !!(typeof window !== 'undefined' && window.supabaseReady && window.supabaseClient);
}
function diagnose() {
  var result = {
    supabaseReady: yahmaPaymentsTableReady(),
    session: false,
    email: '',
    readOk: false,
    readCount: null,
    writeOk: false,
    writeError: '',
    verdict: ''
  };
  var chain = Promise.resolve();
  chain = chain.then(function () {
    if (!yahmaPaymentsTableReady()) return;
    return window.supabaseClient.auth.getSession().then(function (s) {
      if (s && s.data && s.data.session) {
        result.session = true;
        result.email = s.data.session.user.email || '';
      }
      return window.supabaseClient.from('inspection_payments').select('id').limit(1);
    }).then(function (q) {
      if (!q) return;
      result.readOk = !q.error;
      result.readCount = q.error ? null : (q.data || []).length;
      if (q.error) result.writeError = 'القراءة: ' + q.error.message;
    }).catch(function (e) {
      result.writeError = String((e && e.message) || e);
    });
  }).catch(function (e) {
    result.writeError = String((e && e.message) || e);
  });

  /* الكتابة بتنجح بس لو فيه جلسة صالحة ودور admin/ops */
  return chain.then(function () {
    if (!result.session) {
      if (!result.writeError) result.writeError = 'لا توجد جلسة دخول صالحة على هذا الجهاز';
      result.verdict = result.readOk
        ? 'القراءة شغالة، والكتابة متوقفة (لا توجد جلسة)'
        : 'الجدول غير متاح';
      return result;
    }
    var probe = 'diagnose-' + Date.now();
    return window.supabaseClient.from('inspection_payments')
      .insert({ car_id: probe, plate: 'DIAG', branch: '', status: 'pending' })
      .select('id')
      .single()
      .then(function (ins) {
        if (ins && ins.error) {
          result.writeError = ins.error.message;
        } else {
          result.writeOk = true;
          return window.supabaseClient.from('inspection_payments').delete().eq('car_id', probe);
        }
        return null;
      })
      .catch(function (e) {
        result.writeError = String((e && e.message) || e);
      })
      .then(function () {
        result.verdict = result.readOk && result.writeOk
          ? 'المزامنة شغالة بالكامل'
          : (result.readOk ? 'القراءة شغالة، والكتابة متوقفة' : 'الجدول غير متاح');
        return result;
      });
  });
}

/* ===== طابور دفعات تجديد الفحص =====
   تبويبان يشتغلوا على نفس البيانات:
     • «تحت الدفع» = status: 'pending'
     • «تم الدفع»  = status: 'paid'

   المصدر الأساسي هو جدول inspection_payments على Supabase عشان يشتغل
   على كل الأجهزة. لو الجدول غير موجود (لسه ما اشتغل الـ SQL)، بيرجع
   تلقائيًا للتخزين المحلي حتى ما يتعطّلش الشغل. */
(function (global) {
  'use strict';

  var DIAGNOSE = diagnose;

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
      /* نطلب الرجوع بالسجل نفسه عشان ناخد الـ UUID الحقيقي.
         بدون .select() الـ insert بيقبل بس مش بيرجّع id،
         فتبقى السجلات المحلية بمفاتيح نصية و الـ update بيفشل
         بـ invalid input syntax for type uuid. */
      var res = await global.supabaseClient.from('inspection_payments')
        .insert(payload)
        .select('id,car_id,requested_at')
        .single();
      if (res.error) {
        global.__yahmaPaymentsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      global.__yahmaPaymentsCloudError = '';
      var created = res.data || null;
      if (created && created.id) {
        var list = readJSON(PENDING_KEY, []);
        var found = false;
        list.forEach(function (p) {
          if (String(p.carId) === entry.carId && String(p.requestedAt) === entry.requestedAt) {
            p.id = created.id;
            found = true;
          }
        });
        if (!found) list.unshift(entry);
        writeJSON(PENDING_KEY, list);
      }
      return { ok: true };
    } catch (err) {
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* السجلات المخزّنة على السيرفر بمفاتيح UUID.
   لو كان المفتاح نصيًا (طلب قديم قبل المزامنة) نحدّث محليًا بس،
   عشان ما نطلعش خطأ «invalid input syntax for type uuid». */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isCloudId(id) {
    return UUID_RE.test(String(id || ''));
  }
  /* لو السجل لسه بمفتاح نصي، نجيب الـ UUID الحقيقي من السيرفر عبر car_id */
  async function resolveCloudId(id, fallbackCarId) {
    if (isCloudId(id)) return id;
    if (!tableReady()) return null;
    try {
      var q = await window.supabaseClient
        .from('inspection_payments')
        .select('id')
        .eq('car_id', String(fallbackCarId || ''))
        .eq('status', 'pending')
        .limit(1);
      if (q.error || !q.data || !q.data.length) return null;
      var realId = q.data[0].id;
      /* نحدّث المفتاح في الكاش المحلي عشان المرة الجاية يبقى صحيح */
      [PENDING_KEY, PAID_KEY].forEach(function (key) {
        var list = readJSON(key, []);
        var changed = false;
        list.forEach(function (p) {
          if (String(p.id) === String(id) && String(p.carId) === String(fallbackCarId)) {
            p.id = realId; changed = true;
          }
        });
        if (changed) writeJSON(key, list);
      });
      return realId;
    } catch (_) { return null; }
  }

  /* تسجيل الدفع: pending ⇐ paid */
  async function markPaid(id, carId) {
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
    /* لو المفتاح نصي (سجل قديم) نجيب الـ UUID الحقيقي الأول */
    var cloudId = isCloudId(id) ? id : await resolveCloudId(id, carId || (found && found.carId));
    if (!cloudId) {
      global.__yahmaPaymentsCloudError = '';
      return { ok: true, local: true };
    }
    try {
      var res = await window.supabaseClient
        .from('inspection_payments')
        .update({ status: 'paid', paid_at: stamp })
        .eq('id', cloudId);
      if (res.error) {
        global.__yahmaPaymentsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      global.__yahmaPaymentsCloudError = '';
      return { ok: true };
    } catch (err) {
      global.__yahmaPaymentsCloudError = String((err && err.message) || err);
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* إلغاء الطلب */
  async function cancel(id, carId) {
    var pending = readJSON(PENDING_KEY, []);
    var carOfRequest = carId || (pending.find(function (p) { return String(p.id) === String(id); }) || {}).carId;
    pending = pending.filter(function (p) { return String(p.id) !== String(id); });
    writeJSON(PENDING_KEY, pending);
    if (!tableReady()) return { ok: true, local: true };
    var cloudId = isCloudId(id) ? id : await resolveCloudId(id, carOfRequest);
    if (!cloudId) {
      global.__yahmaPaymentsCloudError = '';
      return { ok: true, local: true };
    }
    try {
      var res = await window.supabaseClient.from('inspection_payments')
        .update({ status: 'cancelled' })
        .eq('id', cloudId);
      if (res && res.error) {
        global.__yahmaPaymentsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      global.__yahmaPaymentsCloudError = '';
      return { ok: true };
    } catch (err) {
      global.__yahmaPaymentsCloudError = String((err && err.message) || err);
      return { ok: true, local: true, error: err && err.message };
    }
  }

  global.YahmaPayments = {
    sync: sync,
    diagnose: DIAGNOSE,
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
