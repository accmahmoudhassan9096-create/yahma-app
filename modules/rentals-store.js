/* ===== modules/rentals-store.js — سجل الاستئجارات =====

   كل استئجار = صف بتاريخاته. التقارير بتحسب منه، مش من عمود
   مصقول في `vehicles` — دي المشكلة اللي كانت بتخلي التقارير
   تقول «0% استغلال» لأسطول 3,984 سيارة حالته كلها صفر.

   النمط متطابق مع `payments-store.js`: محلي الأول (عشان
   يشتغل حتى لو الشبكة ضعيفة)، ومزامنة للسحابة بعدين، وأي
   فشل سحابي بيتسجّل في `__yahmaRentalsCloudError` بدل ما
   يرمي أو يقفل الشاشة. المستخدم بيشتغل دايمًا. */

(function (global) {
  'use strict';

  var KEY = 'yahma-rentals-v1';

  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(global.localStorage.getItem(key) || 'null');
      return Array.isArray(v) ? v : fallback;
    } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { yahmaErr(_, 'rentals-store.js:write'); }
  }
  function tableReady() {
    return !!(global.supabaseReady && global.supabaseClient);
  }

  /* ===== التاريخ: كل حاجة بتاريخ موحّد، مش نص عشوائي =====

     التقارير بتقارن وتطرح تواريخ، فلازم المقارنة النصية على
     صيغة YYYY-MM-DD تشتغل. أي تاريخ يدخل من حقل تاريخ بييجي
     بنفس الصيغة، بس لو أحد بعت تاريخ كامل بالتوقيت أو
     MM/DD/YYYY من مسار تاني، الترتيب بيخرب والأرقام في
     التقرير بتطلع غلط من غير أي رسالة. فبنطبّع عند الباب. */
  function normDate(v) {
    if (!v) return '';
    var s = String(v).trim();
    if (!s) return '';
    /* ISO كامل: 2026-10-17T09:12:00.000Z */
    var iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
    if (iso) return iso[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    /* MM/DD/YYYY — بعض البيئات بتسلّمها بهالصيغة */
    var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (us) {
      return us[3] + '-' + String(us[1]).padStart(2, '0') + '-' + String(us[2]).padStart(2, '0');
    }
    return '';
  }

  /* عدد الأيام بين تاريخين، شامل الطرفين — زي عدّ ليالي الفاتورة:
     فاتورة من 1 إلى 3 = 3 أيام مش يومين. الاستئجار بيحسب أيام
     فعلية مش فرق تاريخ، فلو حسبنا (النهاية − البداية) هنقص
     يوم من كل استئجار. */
  function daysBetween(a, b) {
    var ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
    if (isNaN(ms)) return 0;
    return Math.round(ms / 86400000) + 1;
  }

  function toNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  /* ⭐ المدة بحد أقصى — بيتحقق منه كمان في القاعدة، بس الواجهة
     لازم ترفض قبل الحفظ. مستخدم بيدخل تاريخ نهاية 5 سنين في
     المستقبل ويكتشف الغلط بعد شهر، ويبقى التقرير كله غلط. */
  var MAX_DAYS = 400;

  /* أيام استئجار بتتقاطع مع فترة. ده قلب حساب التقرير:
     تقدر تختار أي شهر أو ربع سنة، والنتيجة تبقى صح لأننا
     بنعدّ الجزء المتقاطع بس — مش كل مدة الاستئجار. */
  function overlapDays(rental, from, to) {
    var s = normDate(rental.startDate), e = normDate(rental.endDate);
    if (!s) return 0;
    /* لسه شغّال: نعدّ لحد النهاردة (مش لآخر العمر — ده اللي
       كان بيضخّم الإيراد في المستقبل بلا حدود) */
    if (!e) e = todayStr();
    if (from && e < from) return 0;
    if (to && s > to) return 0;
    if (from && s < from) s = from;
    if (to && e > to) e = to;
    if (e < s) return 0;
    return daysBetween(s, e);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ===== محلي ===== */

  function localAll() {
    return readJSON(KEY, []).slice().sort(function (a, b) {
      return String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
  }

  function isOpen(r) { return !normDate(r.endDate); }

  function localOpen() { return localAll().filter(isOpen); }

  function byCar(carId) {
    var id = String(carId);
    return localAll().filter(function (r) { return String(r.carId) === id; });
  }

  /* استئجار شغّال لِد السيارة دي (مفيش غيره) — عشان نمنع
     تسجيل استئجار تاني فوق واحد شغّال. */
  function openForCar(carId) {
    var id = String(carId);
    return localOpen().filter(function (r) { return String(r.carId) === id; })[0] || null;
  }

  function newId(carId) {
    return 'rent-' + String(carId) + '-' + Date.now();
  }

  /* ===== السجلات المرحَّلة =====

     ترحيل 2026-10: 2,859 سيارة حالتها «مؤجرة» ماكانش عندها أي سجل
     تأجير، فبنينا لها سجل من الحالة + السعر + 30 يوم. السجل ده
     **مش تاريخ حقيقي** — لازم يتمسح أول ما المستخدم يسجّل استئجار
     حقيقي لنفس السيارة، عشان ماتفوتش عليه أيام مرتين. */
  var MIGRATED_MARK = 'ترحيل تلقائي';

  function isMigrated(r) {
    return !!(r && typeof r.note === 'string' && r.note.indexOf(MIGRATED_MARK) === 0);
  }

  /* حذف السجل المرحَّل من المحلي + السحابة (بصمت — لو فشل السحابة
     السجل بيفضل محلي ويتشال في المزامنة الجاية) */
  function removeMigrated(r) {
    try {
      writeJSON(KEY, localAll().filter(function (x) { return String(x.id) !== String(r.id); }));
    } catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'rentals-store.js:removeMigrated:local'); }
    if (!tableReady()) return;
    try {
      var del = global.supabaseClient.from('rentals').delete().eq('id', r.id);
      if (del && typeof del.then === 'function') {
        del.then(function (res) {
          if (res && res.error) {
            global.__yahmaRentalsCloudError = String(res.error.message || res.error);
          }
        }, function (err) {
          global.__yahmaRentalsCloudError = String((err && err.message) || err);
        });
      }
    } catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'rentals-store.js:removeMigrated:cloud'); }
  }

  /* ===== حارس الصلاحية جوّه الوحدة نفسها =====

     نفس الفكرة في payments-store: الأزرار محمية في الواجهة،
     بس أي مسار تاني (سجل نشاط، سكربت، console) يقدر ينادي
     الدالة مباشرة. RLS بيحمي البيانات، وده طبقة تانية قبل
     ما نكتب على السحابة أصلاً. */
  function canMutate() {
    var P = global.YahmaPerms;
    if (P && typeof P.canEditNow === 'function') return !!P.canEditNow();
    return global.currentRole !== 'view';
  }

  function actorName() {
    if (global.currentUserName) return global.currentUserName;
    if (global.YahmaPayments && typeof global.YahmaPayments.getCurrentActorName === 'function') {
      try { return global.YahmaPayments.getCurrentActorName(); } catch (_) { }
    }
    return '';
  }

  /* ===== تسجيل استئجار =====

     يومل محلي الأول. الترتيب مقصود: نكتب المحلي قبل السحابة
     عشان لو الشبكة لبطت المستخدم مايفتتحش الشاشة، ولو
     السحابة رفضت يفضل الشغل شغّال والعلم local=true.

     ⚠️ daily_rate بينتسخ من السيارة وقت التسجيل. ده مقصود:
     لو غيرنا السعر بعدين، إيراد الشهور اللي فاتت ما يتغيّرش.
     لو سرنا نقرا السعر الحالي وقت التقرير، التقرير هيتعاد
     حسابه بالأسعار الجديدة — وده بالظبط اللي `renteddays`
     كان بيعمله. */
  async function startRental(car, opts) {
    opts = opts || {};
    if (!car) return { ok: false, error: 'السيارة غير موجودة' };
    if (!canMutate()) return { ok: false, error: 'permission' };

    var start = normDate(opts.startDate) || todayStr();
    var end = normDate(opts.endDate);

    if (end) {
      if (end < start) return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' };
      if (daysBetween(start, end) > MAX_DAYS) {
        return { ok: false, error: 'المدة أطول من الحد المسموح (' + MAX_DAYS + ' يوم)' };
      }
    }
    var clash = openForCar(car.id);
    if (clash) {
      return { ok: false, error: 'في استئجار شغّال بالفعل لهذه السيارة (بدأ ' + clash.startDate + ')' };
    }

    /* ⭐ السجلات المرحَّلة (note يبدأ بـ «ترحيل تلقائي») استنتجناها
       من حالة «مؤجرة» — مش تاريخ حقيقي. أول ما المستخدم يسجّل استئجار
       حقيقي لنفس السيارة، لازم نمسح السجل التلقائي عشان ماتفوتش
       عليه أيام مرتين (double-count في التقارير).
       ملاحظة: السجل المرحَّل ليه end_date، فمش هيعمل clash — فالفحص
       هنا ضروري ومش بديل عن فحص openForCar. */
    var migrated = localAll().filter(function (r) {
      return String(r.carId) === String(car.id) && isMigrated(r);
    });
    if (migrated.length) {
      migrated.forEach(function (r) { removeMigrated(r); });
    }

    var entry = {
      id: newId(car.id),
      carId: String(car.id),
      plate: car.plate || '',
      branch: car.branch || '',
      startDate: start,
      endDate: end || null,
      dailyRate: opts.dailyRate !== undefined && opts.dailyRate !== null && opts.dailyRate !== ''
        ? toNum(opts.dailyRate) : toNum(car.dailyRate),
      note: opts.note || '',
      prevStatus: car.carStatus || '',
      userName: actorName(),
      createdAt: new Date().toISOString()
    };

    var list = localAll();
    list.unshift(entry);
    writeJSON(KEY, list);

    if (!tableReady()) return { ok: true, local: true, entry: entry };

    try {
      var res = await global.supabaseClient.from('rentals')
        .insert({
          car_id: entry.carId,
          plate: entry.plate,
          branch: entry.branch,
          start_date: entry.startDate,
          end_date: entry.endDate,
          daily_rate: entry.dailyRate,
          note: entry.note,
          prev_status: entry.prevStatus || null
        })
        .select('id')
        .single();
      if (res.error) {
        global.__yahmaRentalsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, entry: entry, error: res.error.message };
      }
      global.__yahmaRentalsCloudError = '';
      /* بناخد الـUUID الحقيقي عشان التحديثات الجاية تفشلش
         بـ invalid input syntax for type uuid */
      if (res.data && res.data.id) {
        entry.id = res.data.id;
        writeJSON(KEY, localAll().map(function (r) {
          return (r.createdAt === entry.createdAt && String(r.carId) === entry.carId) ? entry : r;
        }));
      }
      return { ok: true, entry: entry };
    } catch (err) {
      global.__yahmaRentalsCloudError = String((err && err.message) || err);
      return { ok: true, local: true, entry: entry, error: err && err.message };
    }
  }

  /* إنهاء استئجار: حط تاريخ النهاية. date=null معناه لسه شغّال. */
  async function endRental(id, endDate) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    var list = localAll();
    var hit = null;
    list.forEach(function (r) { if (String(r.id) === String(id)) hit = r; });
    if (!hit) return { ok: false, error: 'السجل مش موجود' };

    var end = normDate(endDate);
    if (end && end < normDate(hit.startDate)) {
      return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' };
    }
    hit.endDate = end || null;
    writeJSON(KEY, list);

    if (!tableReady()) return { ok: true, local: true, entry: hit };
    return patchCloud(id, hit.carId, { end_date: hit.endDate }, hit);
  }

  /* ⭐ كل الكتابة البعيدة من هنا — مسار واحد.
     زي patchCloud في payments-store: لو المفتاح نصّي (سجل اتعمل
     محلي والسحابة رجعتش) بندور على الـUUID الحقيقي بـcar_id. */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isCloudId(id) { return UUID_RE.test(String(id || '')); }

  async function resolveCloudId(id, carId) {
    if (isCloudId(id)) return id;
    if (!tableReady()) return null;
    try {
      var q = await global.supabaseClient.from('rentals').select('id')
        .eq('car_id', String(carId || '')).order('start_date', { ascending: false }).limit(1);
      if (q.error || !q.data || !q.data.length) return null;
      var realId = q.data[0].id;
      writeJSON(KEY, localAll().map(function (r) {
        return String(r.id) === String(id) ? Object.assign({}, r, { id: realId }) : r;
      }));
      return realId;
    } catch (_) { return null; }
  }

  async function patchCloud(id, carId, fields) {
    if (!tableReady()) return { ok: true, local: true };
    var cloudId = await resolveCloudId(id, carId);
    if (!cloudId) { global.__yahmaRentalsCloudError = ''; return { ok: true, local: true }; }
    try {
      var res = await global.supabaseClient.from('rentals').update(fields).eq('id', cloudId);
      if (res && res.error) {
        global.__yahmaRentalsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      global.__yahmaRentalsCloudError = '';
      return { ok: true };
    } catch (err) {
      global.__yahmaRentalsCloudError = String((err && err.message) || err);
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* تعديل حقول (تاريخ/سعر/ملاحظة) — نفس المسار */
  async function updateRental(id, carId, opts) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    opts = opts || {};
    var list = localAll();
    var hit = null;
    list.forEach(function (r) { if (String(r.id) === String(id)) hit = r; });
    if (!hit) return { ok: false, error: 'السجل مش موجود' };

    var start = normDate(opts.startDate) || normDate(hit.startDate);
    var end = normDate(opts.endDate);
    if (end && end < start) return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' };
    if (end && daysBetween(start, end) > MAX_DAYS) {
      return { ok: false, error: 'المدة أطول من الحد المسموح (' + MAX_DAYS + ' يوم)' };
    }

    hit.startDate = start;
    hit.endDate = end || null;
    if (opts.dailyRate !== undefined && opts.dailyRate !== '') hit.dailyRate = toNum(opts.dailyRate);
    if (opts.note !== undefined) hit.note = opts.note;
    writeJSON(KEY, list);

    if (!tableReady()) return { ok: true, local: true, entry: hit };
    return patchCloud(id, hit.carId, {
      start_date: hit.startDate, end_date: hit.endDate,
      daily_rate: hit.dailyRate, note: hit.note
    }, hit);
  }

  async function removeRental(id, carId) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    writeJSON(KEY, localAll().filter(function (r) { return String(r.id) !== String(id); }));
    if (!tableReady()) return { ok: true, local: true };
    var cloudId = await resolveCloudId(id, carId);
    if (!cloudId) { global.__yahmaRentalsCloudError = ''; return { ok: true, local: true }; }
    try {
      var res = await global.supabaseClient.from('rentals').delete().eq('id', cloudId);
      if (res && res.error) {
        global.__yahmaRentalsCloudError = String(res.error.message || res.error);
        return { ok: true, local: true, error: res.error.message };
      }
      global.__yahmaRentalsCloudError = '';
      return { ok: true };
    } catch (err) {
      global.__yahmaRentalsCloudError = String((err && err.message) || err);
      return { ok: true, local: true, error: err && err.message };
    }
  }

  /* ===== السحابة ===== */

  async function fetchRemote() {
    if (!tableReady()) return null;
    try {
      var res = await global.supabaseClient.from('rentals')
        .select('id,car_id,plate,branch,start_date,end_date,daily_rate,note,prev_status,created_at')
        .order('start_date', { ascending: false })
        .limit(2000);
      if (res.error) return null;
      return (res.data || []).map(function (r) {
        return {
          id: r.id,
          carId: String(r.car_id),
          plate: r.plate || '',
          branch: r.branch || '',
          startDate: r.start_date || '',
          endDate: r.end_date || null,
          dailyRate: toNum(r.daily_rate),
          note: r.note || '',
          prevStatus: r.prev_status || '',
          userName: '',
          createdAt: r.created_at || ''
        };
      });
    } catch (_) { return null; }
  }

  /* ندمج البعيد فوق المحلي. ⚠️ مش بنمسح المحلي — لو السحابة
     رفضت القراءة (RLS) fetchRemote بترجع null وسينتهي الـsync
     فورًا وميحصلش مسح. ده اللي خلّى المتجر الأول يمسح كل
     السجلات المحلية لما RLS رفض. */
  async function sync() {
    var remote = await fetchRemote();
    if (!remote) return localAll();
    var byId = new Map();
    remote.forEach(function (r) { byId.set(String(r.id), r); });
    var local = localAll();
    var merged = [];
    var seen = Object.create(null);
    local.forEach(function (r) {
      var hit = byId.get(String(r.id));
      if (hit) {
        hit.userName = r.userName || '';
        hit.createdAt = r.createdAt || hit.createdAt;
        merged.push(hit);
        seen[String(hit.id)] = true;
      } else {
        merged.push(r);   /* لسه ماوصلش للسحابة — نخليه */
      }
    });
    remote.forEach(function (r) { if (!seen[String(r.id)]) merged.push(r); });

    /* ⭐ تنظيف السجلات المرحَّلة لما المستخدم يسجّل استئجاراً حقيقياً
       لنفس السيارة. لو سجّل استئجاراً يدوي، السجل التلقائي لازم
       يتشال من السحابة كمان — مش بس من المحلي — وإلا countdown
       اتحسب مرتين في التقارير.

       القاعدة: لو فيه سيارة عندها سجل حقيقي (مش مرحَّل)، امسح كل
       السجلات المرحَّلة ليها. */
    var carsWithReal = Object.create(null);
    merged.forEach(function (r) {
      if (!isMigrated(r)) carsWithReal[String(r.carId)] = true;
    });
    var toDelete = merged.filter(function (r) {
      return isMigrated(r) && carsWithReal[String(r.carId)];
    });
    if (toDelete.length) {
      merged = merged.filter(function (r) {
        return toDelete.indexOf(r) === -1;
      });
      toDelete.forEach(function (r) { deleteMigratedCloud(r); });
    }

    merged.sort(function (a, b) {
      return String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
    writeJSON(KEY, merged);
    return merged;
  }

  /* حذف سجل مرحَّل من السحابة (best-effort) */
  function deleteMigratedCloud(r) {
    if (!tableReady() || !r || !r.id) return;
    try {
      var del = global.supabaseClient.from('rentals').delete().eq('id', r.id);
      if (del && typeof del.then === 'function') {
        del.then(function (res) {
          if (res && res.error) {
            global.__yahmaRentalsCloudError = String(res.error.message || res.error);
          }
        }, function (err) {
          global.__yahmaRentalsCloudError = String((err && err.message) || err);
        });
      }
    } catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'rentals-store.js:deleteMigratedCloud'); }
  }

  /* ===== تجميع للتقارير =====

     ⭐ ده اللي بيغذّي صفحة التقارير بدل renteddays.
        المتجر بيدّي أرقام مجردة (أيام، إيراد)، والصفحة بتقرا
        منها. لازم يكون في مصدر واحد، وإلا التقريرين هيختلفوا.

     from/to تاريخان اختياريين؛ لو ما اتحددوش بنستخدم الشهر
     الحالي (دي الفترة اللي التقرير بيبدأ بيها). */
  function revenueBetween(from, to) {
    var list = localAll();
    var days = 0, revenue = 0;
    var perCar = new Map();
    list.forEach(function (r) {
      var d = overlapDays(r, from, to);
      if (d <= 0) return;
      var amount = d * toNum(r.dailyRate);
      days += d;
      revenue += amount;
      var k = String(r.carId);
      var prev = perCar.get(k) || { carId: r.carId, plate: r.plate, days: 0, revenue: 0 };
      prev.days += d;
      prev.revenue += amount;
      perCar.set(k, prev);
    });
    var cars = Array.from(perCar.values());
    cars.sort(function (a, b) { return b.revenue - a.revenue; });
    return {
      days: days,
      revenue: Math.round(revenue),
      carsRented: cars.length,
      perCar: cars
    };
  }

  function rentalDaysForCar(carId, from, to) {
    var id = String(carId);
    var total = 0;
    localAll().forEach(function (r) {
      if (String(r.carId) !== id) return;
      total += overlapDays(r, from, to);
    });
    return total;
  }

  /* ===== تصدير ===== */
  global.YahmaRentals = {
    KEY: KEY,
    MAX_DAYS: MAX_DAYS,
    localAll: localAll,
    localOpen: localOpen,
    byCar: byCar,
    openForCar: openForCar,
    isOpen: isOpen,
    normDate: normDate,
    daysBetween: daysBetween,
    overlapDays: overlapDays,
    todayStr: todayStr,
    startRental: startRental,
    endRental: endRental,
    updateRental: updateRental,
    removeRental: removeRental,
    revenueBetween: revenueBetween,
    rentalDaysForCar: rentalDaysForCar,
    sync: sync
  };

  /* مزامنة عند الإقلاع وكل ما المستخدم يرجع للتطبيق */
  var triedOnce = false;
  function refreshCounts() {
    try {
      var el = document.getElementById('count-rentals');
      if (el) el.textContent = localOpen().length;
    } catch (_) { yahmaErr(_, 'rentals-store.js:refreshCounts'); }
  }
  async function trySync() {
    if (!tableReady()) return;
    await sync();
    refreshCounts();
    try {
      var tab = (typeof global.yahmaGetTab === 'function') ? global.yahmaGetTab() : '';
      if (tab === 'rentals' || tab === 'reports') {
        if (typeof global.render === 'function') global.render();
      }
    } catch (_) { yahmaErr(_, 'rentals-store.js:trySync'); }
  }

  function boot() {
    refreshCounts();
    if (!triedOnce && tableReady()) { triedOnce = true; setTimeout(trySync, 1600); }
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') setTimeout(trySync, 700);
      });
    }
    setTimeout(trySync, 6500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);