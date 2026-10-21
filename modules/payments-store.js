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
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch(_){yahmaErr(_,'payments-store.js:96');}
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
        paidAt: null,
        userName: item.userName || ''
      });
    });
    writeJSON(PENDING_KEY, pending);
  }

  /* ---------- محلي (يعمل دايمًا) ---------- */
  function localAll() {
    var pending = readJSON(PENDING_KEY, []).filter(function (p) { return p.status === 'pending'; });
    var paid = readJSON(PAID_KEY, []).filter(function (p) { return p.status === 'paid'; });
    var all = pending.concat(paid).sort(function (a, b) {
      var ta = new Date(b.paidAt || b.requestedAt || 0).getTime();
      var tb = new Date(a.paidAt || a.requestedAt || 0).getTime();
      return ta - tb;
    });
    var seenCarIds = new Set();
    var out = [];
    all.forEach(function (p) {
      var cid = String(p.carId || '');
      if (cid && !seenCarIds.has(cid)) {
        seenCarIds.add(cid);
        out.push(p);
      }
    });
    return out;
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
        .select('id,car_id,plate,branch,status,requested_at,paid_at,note,prev_state')
        .in('status', ['pending', 'paid'])
        .order('requested_at', { ascending: false })
        .limit(2000);
      if (res.error) return null;
      var rows = (res.data || []).map(function (r) {
        var uName = (r.prev_state && r.prev_state.userName) || '';
        return {
          id: r.id,
          carId: String(r.car_id),
          plate: r.plate || '',
          branch: r.branch || '',
          status: r.status,
          requestedAt: r.requested_at,
          paidAt: r.paid_at || null,
          note: r.note || '',
          prevState: r.prev_state || null,
          userName: uName
        };
      });
      return rows;
    } catch (_) { return null; }
  }

  /* يحمّل من السيرفر ويحدّث الكاش المحلي دون مسح البيانات غير المرفوعة */
  async function sync() {
    migrateLegacy();
    var remote = await fetchRemote();
    var localPending = readJSON(PENDING_KEY, []);
    var localPaid = readJSON(PAID_KEY, []);

    // إذا فشل الاتصال بالسيرفر، نرجع البيانات المحلية فورًا
    if (remote === null) return localAll();

    // خريطة أسماء المستخدمين من السجلات المحلية للحفاظ عليها
    var localMap = new Map();
    localAll().forEach(function (p) {
      if (p.userName) localMap.set(String(p.id), p.userName);
      if (p.carId && p.userName) localMap.set('car-' + String(p.carId), p.userName);
    });

    // 1) إذا كان السيرفر فارغًا تمامًا ولكن يوجد بيانات محلية، نقوم برفع البيانات المحلية فورًا للسيرفر
    if (tableReady() && remote.length === 0 && (localPending.length > 0 || localPaid.length > 0)) {
      try {
        var toUpload = [];
        localPending.forEach(function (p) {
          toUpload.push({
            car_id: String(p.carId),
            plate: p.plate || '',
            branch: p.branch || '',
            status: 'pending',
            requested_at: p.requestedAt || new Date().toISOString(),
            prev_state: { userName: p.userName || '' }
          });
        });
        localPaid.forEach(function (p) {
          toUpload.push({
            car_id: String(p.carId),
            plate: p.plate || '',
            branch: p.branch || '',
            status: 'paid',
            requested_at: p.requestedAt || new Date().toISOString(),
            paid_at: p.paidAt || new Date().toISOString(),
            note: p.note || '',
            prev_state: { userName: p.userName || '' }
          });
        });
        if (toUpload.length > 0) {
          for (var c = 0; c < toUpload.length; c += 50) {
            await global.supabaseClient.from('inspection_payments')
              .insert(toUpload.slice(c, c + 50));
          }
          var reRemote = await fetchRemote();
          if (reRemote && reRemote.length) remote = reRemote;
        }
      } catch (uploadErr) {
        console.warn('Sync upload error:', uploadErr);
        // عند حدوث خطأ في الرفع، نحافظ على البيانات المحلية ولا نمسحها أبدًا
        return localAll();
      }
    }

    // 2) دمج العناصر المحلية التي لم تُسجل على السيرفر بعد
    var remoteCarIds = new Set(remote.map(function (r) { return String(r.carId); }));
    var unsyncedPending = localPending.filter(function (p) { return !remoteCarIds.has(String(p.carId)); });
    if (unsyncedPending.length && tableReady()) {
      try {
        var newUploads = unsyncedPending.map(function(p){
          return {
            car_id: String(p.carId),
            plate: p.plate || '',
            branch: p.branch || '',
            status: 'pending',
            requested_at: p.requestedAt || new Date().toISOString(),
            prev_state: { userName: p.userName || '' }
          };
        });
        await global.supabaseClient.from('inspection_payments').insert(newUploads);
        var ref = await fetchRemote();
        if (ref && ref.length) remote = ref;
      } catch(_){}
    }

    // ⭐ إزالة التكرار: نأخذ أحدث سجل فقط لكل سيارة لمنع ظهور السيارة في أكثر من تبويب
    // remote مرتب تنازلياً بـ requested_at من fetchRemote
    var latestByCar = new Map();
    remote.forEach(function (r) {
      var cid = String(r.carId || '');
      if (!cid) return;
      if (!latestByCar.has(cid)) {
        if (!r.userName) {
          r.userName = localMap.get(String(r.id)) || localMap.get('car-' + cid) || '';
        }
        latestByCar.set(cid, r);
      }
    });

    var deduped = Array.from(latestByCar.values());
    var pending = deduped.filter(function (p) { return p.status === 'pending'; });
    var paid = deduped.filter(function (p) { return p.status === 'paid'; });
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    return deduped;
  }

  function getCurrentActorName() {
    try {
      if (typeof window !== 'undefined') {
        if (window.currentUserName && String(window.currentUserName).trim()) {
          return String(window.currentUserName).trim();
        }
        var uid = (window.currentUser && window.currentUser.id) || window._bootedUid;
        if (uid) {
          var byUid = localStorage.getItem('fleet-user-name:' + uid);
          if (byUid && byUid.trim()) return byUid.trim();
        }
        var lastUser = localStorage.getItem('yahma_last_user_name');
        if (lastUser && lastUser.trim()) return lastUser.trim();
        var metaName = window.currentUser && window.currentUser.user_metadata && (window.currentUser.user_metadata.full_name || window.currentUser.user_metadata.name);
        if (metaName && String(metaName).trim()) return String(metaName).trim();
        var el = document.getElementById('topbar-user-name');
        if (el && el.textContent && el.textContent.trim() && el.textContent.trim() !== 'أحمد محمد' && el.textContent.trim() !== 'المدير') {
          return el.textContent.trim();
        }
        if (window.currentUser && window.currentUser.email) return String(window.currentUser.email).trim();
      }
    } catch (_) {}
    return '';
  }

  /* تسجيل دفعات طلبات جديدة مجمعة فائقة السرعة */
  async function requestPaymentBatch(cars) {
    if (!Array.isArray(cars) || !cars.length) return { ok: true, moved: 0 };
    var activeUser = getCurrentActorName();
    var toAddCids = new Set(cars.map(function(c){ return String(c.id); }));
    var pending = readJSON(PENDING_KEY, []).filter(function(p){ return !toAddCids.has(String(p.carId)); });
    var paid = readJSON(PAID_KEY, []).filter(function(p){ return !toAddCids.has(String(p.carId)); });
    var newEntries = [];
    var payloads = [];

    cars.forEach(function(car) {
      if (!car) return;
      var cid = String(car.id);
      var entry = {
        id: 'req-' + cid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        carId: cid,
        plate: car.plate || '',
        branch: car.branch || '',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        paidAt: null,
        userName: activeUser
      };
      newEntries.push(entry);
      payloads.push({
        car_id: entry.carId,
        plate: entry.plate,
        branch: entry.branch,
        status: 'pending',
        requested_at: entry.requestedAt,
        prev_state: { userName: activeUser }
      });
    });

    if (!newEntries.length) return { ok: true, moved: 0 };

    for (var i = newEntries.length - 1; i >= 0; i--) {
      pending.unshift(newEntries[i]);
    }
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);

    if (!tableReady()) return { ok: true, local: true, moved: newEntries.length };

    // إرسال الطلبات للسحابة بدفعات مجمعة في طلب واحد
    try {
      for (var c = 0; c < payloads.length; c += 50) {
        var chunk = payloads.slice(c, c + 50);
        var res = await global.supabaseClient.from('inspection_payments')
          .insert(chunk)
          .select('id,car_id');
        if (res.error) {
          console.warn('requestPaymentBatch cloud error:', res.error);
          global.__yahmaPaymentsCloudError = String(res.error.message || res.error);
        } else if (res.data && res.data.length) {
          global.__yahmaPaymentsCloudError = '';
          var mapCreated = new Map();
          res.data.forEach(function(row) { mapCreated.set(String(row.car_id), row.id); });
          var currentPending = readJSON(PENDING_KEY, []);
          currentPending.forEach(function(p) {
            if (mapCreated.has(String(p.carId))) p.id = mapCreated.get(String(p.carId));
          });
          writeJSON(PENDING_KEY, currentPending);
        }
      }
    } catch(err) {
      console.warn('requestPaymentBatch cloud sync error:', err);
    }
    return { ok: true, moved: newEntries.length };
  }

  /* تسجيل طلب جديد (من زر «طلب دفع» في تبويب الفحص) */
  async function requestPayment(car) {
    if (Array.isArray(car)) return requestPaymentBatch(car);
    if (!car) return { ok: false, error: 'السيارة غير موجودة' };
    var activeUser = getCurrentActorName();
    var cid = String(car.id);
    var entry = {
      id: 'req-' + cid + '-' + Date.now(),
      carId: cid,
      plate: car.plate || '',
      branch: car.branch || '',
      status: 'pending',
      requestedAt: new Date().toISOString(),
      paidAt: null,
      userName: activeUser
    };
    /* محلي أولاً — نضمن عدم تكرار السيارة في pending أو paid */
    var pending = readJSON(PENDING_KEY, []).filter(function (p) { return String(p.carId) !== cid; });
    var paid = readJSON(PAID_KEY, []).filter(function (p) { return String(p.carId) !== cid; });
    pending.unshift(entry);
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    if (!tableReady()) return { ok: true, local: true };
    try {
      var payload = {
        car_id: entry.carId,
        plate: entry.plate,
        branch: entry.branch,
        status: 'pending',
        requested_at: entry.requestedAt,
        prev_state: { userName: activeUser }
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

  /* بعد تجديد الرخصة: السطر يخرج من «تم الدفع» ويفضل محفوظ في
   «تم التجديد» مع تاريخ التنفيذ (note = 'license-renewed|<ISO>'). */
  var DONE_NOTE = 'license-renewed';
  function doneStamp(p) {
    var n = String(p.note || '');
    return n.indexOf(DONE_NOTE + '|') === 0 ? n.slice(DONE_NOTE.length + 1) : null;
  }
  function isRenewed(p) { return String(p.note || '').indexOf(DONE_NOTE) === 0; }

  async function markLicenseRenewed(id, carId, when) {
    var stamp = when || new Date().toISOString();
    var note = DONE_NOTE + '|' + stamp;
    var pending = readJSON(PENDING_KEY, []);
    var paid = readJSON(PAID_KEY, []);
    var targetCid = carId;
    [pending, paid].forEach(function (list) {
      list.forEach(function (p) {
        if (String(p.id) === String(id) || (carId && String(p.carId) === String(carId))) {
          p.note = note;
          p.licenseRenewedAt = stamp;
          if (!targetCid && p.carId) targetCid = p.carId;
        }
      });
    });
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    if (!tableReady()) return { ok: true, local: true };
    try {
      var cloudId = isCloudId(id) ? id : await resolveCloudId(id, targetCid);
      var query = window.supabaseClient.from('inspection_payments').update({ note: note });
      if (targetCid) {
        query = query.eq('car_id', String(targetCid)).in('status', ['pending', 'paid']);
      } else if (cloudId) {
        query = query.eq('id', cloudId);
      }
      var res = await query;
      if (res && res.error) {
        window.__yahmaPaymentsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      window.__yahmaPaymentsCloudError = '';
      return { ok: true };
    } catch (err) {
      window.__yahmaPaymentsCloudError = String((err && err.message) || err);
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
        .in('status', ['pending', 'paid'])
        .order('requested_at', { ascending: false })
        .limit(1);
      if (q.error || !q.data || !q.data.length) return null;
      var realId = q.data[0].id;
      /* نحدّث المفتاح في الكاش المحلي عشان المرة الجاية يبقى صحيح */
      [PENDING_KEY, PAID_KEY].forEach(function (key) {
        var list = readJSON(key, []);
        var changed = false;
        list.forEach(function (p) {
          if ((String(p.id) === String(id) || String(p.carId) === String(fallbackCarId)) && p.id !== realId) {
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
      if (String(pending[i].id) === String(id) || (carId && String(pending[i].carId) === String(carId))) {
        found = pending.splice(i, 1)[0]; break;
      }
    }
    var targetCid = carId || (found && found.carId);
    if (targetCid) {
      pending = pending.filter(function (p) { return String(p.carId) !== String(targetCid); });
      paid = paid.filter(function (p) { return String(p.carId) !== String(targetCid); });
    }
    if (found) {
      found.status = 'paid';
      found.paidAt = stamp;
      paid.unshift(found);
    } else if (targetCid) {
      paid.unshift({
        id: id || ('paid-' + targetCid + '-' + Date.now()),
        carId: String(targetCid),
        status: 'paid',
        paidAt: stamp,
        requestedAt: stamp
      });
    }
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paid);
    if (!tableReady()) return { ok: true, local: true };
    try {
      var cloudId = isCloudId(id) ? id : await resolveCloudId(id, targetCid);
      var query = window.supabaseClient.from('inspection_payments')
        .update({ status: 'paid', paid_at: stamp });
      if (targetCid) {
        query = query.eq('car_id', String(targetCid)).in('status', ['pending', 'paid']);
      } else if (cloudId) {
        query = query.eq('id', cloudId);
      }
      var res = await query;
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
    var paidList = readJSON(PAID_KEY, []);
    /* الطلب ممكن يكون في القائمتين — لازم نشوفهم كلهم */
    var matchInPending = pending.find(function (p) { return String(p.id) === String(id) || (carId && String(p.carId) === String(carId)); });
    var matchInPaid = paidList.find(function (p) { return String(p.id) === String(id) || (carId && String(p.carId) === String(carId)); });
    var carOfRequest = carId || (matchInPending || matchInPaid || {}).carId;
    pending = pending.filter(function (p) { return String(p.id) !== String(id) && !(carOfRequest && String(p.carId) === String(carOfRequest)); });
    paidList = paidList.filter(function (p) { return String(p.id) !== String(id) && !(carOfRequest && String(p.carId) === String(carOfRequest)); });
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paidList);
    if (!tableReady()) return { ok: true, local: true };
    try {
      var cloudId = isCloudId(id) ? id : await resolveCloudId(id, carOfRequest);
      var query = window.supabaseClient.from('inspection_payments').update({ status: 'cancelled' });
      if (carOfRequest) {
        query = query.eq('car_id', String(carOfRequest)).in('status', ['pending', 'paid']);
      } else if (cloudId) {
        query = query.eq('id', cloudId);
      }
      var res = await query;
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

  /* ===== الرجوع للمرحلة السابقة =====

     السلسلة: الفحص ← تحت الدفع ← تم الدفع ← تم التجديد

     كل انتقال أمامي بيكتب على السيارة (حالة الفحص، تاريخ الرخصة)،
     فلو رجعنا للوراء من غير ما نحفظ الحالة القديمة كانت هتفضل
     القيمة الجديدة في الأسطول: ترجع السيارة «سليم» مع رخصة
     متجددة حتى لو المستخدم طلب الرجوع لمرحلة الدفع.

     هنا بنحفظ الحالة قبل كل تعديل في `prev_state` (عمود jsonb على
     جدول inspection_payments)، والرجوع بيقرا منها بدل ما يخمّن.
     العمود بيتحدّث بالدمج (merge) مش بالاستبدال، عشان لو السيارة
     عدّت مرحلة تانية بعدين يفضل في الذاكرة_state تاني.

     صيغة الحفظ:
       { inspectionStatus, licenseExpiry, licenseStatus }
     الحقول الناقصة في اللقطة معناها إن المرحلة دي ما غيّرتهاش. */

  /* resolveCloudId بتدوّر على status='pending' بس — صح لمّا markPaid
     هي اللي نادية، بس غلط لمّا نرجع سجل مدفوع. الرجوع محتاج UUID
     لسجل في أي حالة، فبندوّر على الاتنين ونختار الأحدث. */
  async function resolveAnyCloudId(id, carId) {
    if (isCloudId(id)) return id;
    if (!tableReady()) return null;
    try {
      var q = await global.supabaseClient
        .from('inspection_payments')
        .select('id,status,requested_at')
        .eq('car_id', String(carId || ''))
        .in('status', ['pending', 'paid'])
        .order('requested_at', { ascending: false })
        .limit(1);
      if (q.error || !q.data || !q.data.length) return null;
      return q.data[0].id;
    } catch (_) { return null; }
  }

  /* تعديل الطلب على السحابة بمفتاح واحد — كل نداءات الرجوع
     بتمر من هنا عشان مسار واحد: البحث عن UUID لو المفتاح نصي،
     وكتابة الخطأ في نفس الرسالة اللي الواجهة بتقراها. */
  async function patchCloud(id, carId, fields) {
    if (!tableReady()) return { ok: true, local: true };
    try {
      var cloudId = await resolveAnyCloudId(id, carId);
      var query = global.supabaseClient.from('inspection_payments').update(fields);
      if (carId) {
        query = query.eq('car_id', String(carId)).in('status', ['pending', 'paid']);
      } else if (cloudId) {
        query = query.eq('id', cloudId);
      }
      var res = await query;
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

  /* حارس الصلاحية جوّه الوحدة نفسها، مش بس في الواجهة.

   الأزرار محمية بـ canRunPayments، بس أي مسار تاني يقدر ينادي
   الدالة دي مباشرة (سجل نشاط قديم، سكربت، console). RLS بيحمي
   البيانات فعلاً، بس ده طبقة تانية قبل ما نكتب على السحابة أصلاً
   — خصوصًا «مشاهدة» اللي المفروض ملوش أي كتابة. */
  function canMutate() {
    var P = global.YahmaPerms;
    if (P && typeof P.canEditNow === 'function') return !!P.canEditNow();
    return global.currentRole !== 'view';
  }

  /* حفظ الحالة القديمة قبل الانتقال للأمام. merge مش replace.
     مش محمي بصلاحية: ده مش تغيير في حالة العمل، هو مجرد تذكّر
     بالقيمة القديمة عشان الرجوع يقدر يرجّعها. لو قفلناه كان الرجوع
     هيفشل صامت. */
  async function rememberCarState(id, carId, fields) {
    if (!fields) return;
    var keys = Object.keys(fields);
    if (!keys.length) return;
    var merged = null;
    [PENDING_KEY, PAID_KEY].forEach(function (key) {
      var list = readJSON(key, []);
      list.forEach(function (p) {
        if (String(p.id) !== String(id) && !(carId && String(p.carId) === String(carId))) return;
        var base = (p.prevState && typeof p.prevState === 'object') ? p.prevState : {};
        Object.keys(fields).forEach(function (k) { base[k] = fields[k]; });
        p.prevState = base;
        merged = base;
      });
      writeJSON(key, list);
    });
    if (!merged) return;
    await patchCloud(id, carId, { prev_state: merged });
  }

  /* قراءة اللقطة المحفوظة للطلب — المفتاح ممكن يكون UUID أو نصي */
  function prevStateOf(id, carId) {
    var hit = null;
    [PENDING_KEY, PAID_KEY].forEach(function (key) {
      readJSON(key, []).forEach(function (p) {
        if (String(p.id) === String(id) || (carId && String(p.carId) === String(carId))) hit = p.prevState || hit;
      });
    });
    if (hit) return hit;
    /* مش في الكاش المحلي — نجيبه من السحابة */
    if (!tableReady()) return null;
    try {
      var chain = window.supabaseClient.from('inspection_payments')
        .select('prev_state')
        .eq('car_id', String(carId || ''))
        .in('status', ['pending', 'paid'])
        .limit(1);
      chain.then(function (res) {
        if (res && res.data && res.data[0]) {
          var list = readJSON(PAID_KEY, []).concat(readJSON(PENDING_KEY, []));
          var touched = false;
          list.forEach(function (p) {
            if (String(p.carId) === String(carId) && !p.prevState) { p.prevState = res.data[0].prev_state || null; touched = true; }
          });
          if (touched) writeJSON(PAID_KEY, readJSON(PAID_KEY, []));
        }
      }).catch(function(_){yahmaErr(_,'payments-store.js:516');});
    } catch(_){yahmaErr(_,'payments-store.js:517');}
    return null;
  }

  /* ===== 2 ← 3 : «تم التجديد» يرجع «تم الدفع» =====
     الطلب رجع حالته paid (من غير ما نمسح paid_at ولا note)، و تاريخ الرخصة
     يرجع للقيمة اللي كانت قبل التجديد. */
  async function revertRenewedToPaid(id, carId) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    var stamp = null;
    [PENDING_KEY, PAID_KEY].forEach(function (key) {
      var list = readJSON(key, []);
      list.forEach(function (p) {
        if (String(p.id) === String(id) || (carId && String(p.carId) === String(carId))) {
          var note = String(p.note || '');
          if (note.indexOf(DONE_NOTE) === 0) stamp = doneStamp(p);
          p.note = '';
          delete p.licenseRenewedAt;
        }
      });
      writeJSON(key, list);
    });
    return patchCloud(id, carId, { note: null });
  }

  /* ===== 1 ← 2 : «تم الدفع» يرجع «تحت الدفع» =====
     الطلب لازم يتحرّك من قائمة المدفوع لقائمة المنتظر، مش بس
     تتغيّر حالته: localAll() بيبني التبويبين من القائمتين، والقيمة
     status='pending' وهو مخزّن في PAID_KEY بتقع من الفلترين —
     يعني الطلب كان بيختفي من التبويبين كلهم. */
  async function revertPaidToPending(id, carId) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    var pending = readJSON(PENDING_KEY, []);
    var paidList = readJSON(PAID_KEY, []);
    var moved = null;
    paidList = paidList.filter(function (p) {
      var hit = String(p.id) === String(id) || (carId && String(p.carId) === String(carId));
      if (!hit) return true;
      p.status = 'pending';
      p.paidAt = null;
      p.note = '';
      delete p.licenseRenewedAt;
      moved = p;
      return false;                       /* بيخرج من PAID_KEY */
    });
    if (moved) {
      /* من غير ده كان هيتضاف مرتين لو الطلب لسه في PENDING_KEY */
      pending = pending.filter(function (p) { return String(p.id) !== String(moved.id); });
      pending.unshift(moved);
    }
    writeJSON(PENDING_KEY, pending);
    writeJSON(PAID_KEY, paidList);
    return patchCloud(id, carId, { status: 'pending', paid_at: null, note: null });
  }

  /* ===== 0 ← 1 : «تحت الدفع» يرجع «الفحص» =====
     الطلب بيتشال نهائيًا (cancel موجود من زمان)، والفرق الجديد
    prev_state بيتصفّر معاه عشان طلب قادم ما يورثش لقطة قديمة. */
  async function revertPendingToInspection(id, carId) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    var res = await cancel(id, carId);
    await patchCloud(id, carId, { prev_state: null });
    return res;
  }

  global.YahmaPayments = {
    sync: sync,
    diagnose: DIAGNOSE,
    localAll: localAll,
    localByStatus: localByStatus,
    requestPayment: requestPayment,
    markPaid: markPaid,
    markLicenseRenewed: markLicenseRenewed,
    isRenewed: isRenewed,
    doneStamp: doneStamp,
    renewedList: function () { return localByStatus('paid').filter(isRenewed); },
    pendingList: function () { return localByStatus('paid').filter(function (p) { return !isRenewed(p); }); },
    cancel: cancel,
    /* ===== الرجوع =====
       كل واحد بيرجع مرحلة واحدة للخلف وبيوصّل الحالة القديمة
       للمصوّر (render-router) عشان يرجّعها لبيانات السيارة. */
    rememberCarState: rememberCarState,
    prevStateOf: prevStateOf,
    revertRenewedToPaid: revertRenewedToPaid,
    revertPaidToPending: revertPaidToPending,
    revertPendingToInspection: revertPendingToInspection,
    DONE_NOTE: DONE_NOTE,
    PENDING_KEY: PENDING_KEY,
    PAID_KEY: PAID_KEY,
    getCurrentActorName: getCurrentActorName
  };

  /* مزامنة أولية: نحدّث العدادات بعد ما تتحدّث البيانات */
  function refreshCounts() {
    var pendingCount = document.getElementById('count-payments');
    var paidCount = document.getElementById('count-paid');
    try {
      if (pendingCount) pendingCount.textContent = localByStatus('pending').length;
      if (paidCount) paidCount.textContent = localByStatus('paid').length;
    } catch(_){yahmaErr(_,'payments-store.js:615');}
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
    } catch(_){yahmaErr(_,'payments-store.js:628');}
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
