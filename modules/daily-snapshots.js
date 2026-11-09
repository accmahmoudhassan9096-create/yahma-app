/*
 * modules/daily-snapshots.js — لقطات يومية (معدل التشغيل + الركود)
 *
 * كل لقطة = إجماليات مجمّعة في يوم معيّن:
 *   total, rented, idle (غير مؤجرة), available, ready
 *   occupancy_rate, avg_idle_days, max_idle_days, idle_loss
 * تُحفظ لكل فرع + سطر إجمالي الشركة branch='ALL'.
 *
 * مدة الركود لكل سيارة = النهاردة - idleSince.
 * idleSince هي تاريخ بداية عدم التأجير، وتُسجَّل تلقائياً عند تحوّل الحالة
 * من مؤجرة → غير مؤجرة. للأسطول القديم: نراجع daysSinceMovement أو
 * lastMovementDate كتقدير مبدئي، وإلا صفر من النهاردة.
 *
 * التخزين: Supabase (جدول fleet_daily_snapshots) — ولو الجدول مش مدفوع
 * لسه (الـ SQL لم يُشغَّل) بنقع على localStorage عشان التقرير يفضل شغال محلياً.
 */
(function (global) {
  'use strict';

  const KEY_LOCAL = 'yahma-daily-snapshots-v1';
  const CAP_LOCAL = 400; // عدد الأيام المحفوظة محلياً (≈ 13 شهر)

  function todayIso(d) {
    var x = d ? new Date(d) : new Date();
    if (isNaN(x.getTime())) x = new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function daysBetween(fromIso, toIso) {
    if (!fromIso || !toIso) return null;
    var a = new Date(String(fromIso).slice(0, 10) + 'T00:00:00');
    var b = new Date(String(toIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    var d = Math.floor((b.getTime() - a.getTime()) / 86400000);
    return d >= 0 ? d : 0;
  }

  function isRentedStatus(status) {
    return String(status || '').includes('مؤجر');
  }

  function isAvailableStatus(status) {
    if (typeof global.carStatusReady === 'function') {
      try { return global.carStatusReady(status); } catch (_) {}
    }
    var s = String(status || '');
    return s.includes('متاحة') || s.includes('متاحه') || s === 'موجودة' || s === 'نشط';
  }

  /* مدة الركود بالايام لسيارة واحدة في يوم مرجعي (اقصى حد اليوم) */
  function idleDaysFor(car, refDateIso) {
    if (!car || isRentedStatus(car.carStatus)) return 0;
    var ref = refDateIso || todayIso();
    // 1) idleSince المسجلة
    var days = daysBetween(car.idleSince, ref);
    if (days !== null) return days;
    // 2) daysSinceMovement الجاهزة
    if (car.daysSinceMovement !== undefined && car.daysSinceMovement !== null && car.daysSinceMovement !== '') {
      var n = Number(car.daysSinceMovement);
      if (isFinite(n) && n >= 0) return Math.round(n);
    }
    // 3) lastMovementDate
    if (car.lastMovementDate) {
      var d = daysBetween(String(car.lastMovementDate).slice(0, 10), ref);
      if (d !== null) return d;
    }
    return 0;
  }

  function idleSinceFor(car, refDateIso) {
    if (!car || isRentedStatus(car.carStatus)) return '';
    if (car.idleSince) return String(car.idleSince).slice(0, 10);
    var days = idleDaysFor(car, refDateIso);
    if (days <= 0) return refDateIso || todayIso();
    var x = new Date((refDateIso || todayIso()) + 'T00:00:00');
    x.setDate(x.getDate() - days);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  /* تحديث idleSince عند تغيير الحالة */
  function applyIdleSince(car, previousStatus, nextStatus, refDateIso) {
    if (!car) return car;
    var wasRented = isRentedStatus(previousStatus);
    var nowRented = isRentedStatus(nextStatus);
    var ref = refDateIso || todayIso();
    if (nowRented) {
      car.idleSince = '';
    } else if (wasRented && !nowRented) {
      car.idleSince = ref;
    } else if (!nowRented && !car.idleSince) {
      // سيارة قديمة بقت غير مؤجرة من غير تاريخ: حاول التقدير من الأيام المسجلة
      var est = idleSinceFor(car, ref);
      car.idleSince = est || ref;
    }
    return car;
  }

  function computeSnapshot(fleetList, refDateIso) {
    var list = Array.isArray(fleetList) ? fleetList : [];
    var ref = refDateIso || todayIso();
    var byBranch = Object.create(null);
    function bucket(branchName) {
      var key = String(branchName || '').trim() || 'غير محدد';
      if (!byBranch[key]) byBranch[key] = { total: 0, rented: 0, idle: 0, available: 0, ready: 0, idleDaysSum: 0, idleDaysMax: 0, idleLoss: 0 };
      return byBranch[key];
    }
    list.forEach(function (car) {
      if (!car) return;
      var b = bucket(car.branch);
      b.total++;
      if (isRentedStatus(car.carStatus)) {
        b.rented++;
      } else {
        b.idle++;
        var days = idleDaysFor(car, ref);
        b.idleDaysSum += days;
        if (days > b.idleDaysMax) b.idleDaysMax = days;
        var rate = Number(car.dailyRate) || 0;
        if (rate > 0 && days > 0) b.idleLoss += rate * days;
      }
      if (!isRentedStatus(car.carStatus) && isAvailableStatus(car.carStatus)) b.available++;
      try {
        if (global.vehicleReadiness && global.vehicleReadiness(car).ready) b.ready++;
      } catch (_) {}
    });
    function finalize(key, agg) {
      var total = agg.total || 0;
      var rented = agg.rented || 0;
      var idle = agg.idle || 0;
      return {
        snapshot_date: ref,
        branch: key,
        total_cars: total,
        rented_cars: rented,
        idle_cars: idle,
        available_cars: agg.available || 0,
        ready_cars: agg.ready || 0,
        occupancy_rate: total ? Math.round((rented / total) * 1000) / 10 : 0,
        avg_idle_days: idle ? Math.round((agg.idleDaysSum / idle) * 10) / 10 : 0,
        max_idle_days: idle ? (agg.idleDaysMax || 0) : 0,
        idle_loss: Math.round(agg.idleLoss || 0)
      };
    }
    var rows = Object.keys(byBranch).map(function (key) { return finalize(key, byBranch[key]); });
    var all = { total: 0, rented: 0, idle: 0, available: 0, ready: 0, idleDaysSum: 0, idleDaysMax: 0, idleLoss: 0 };
    Object.keys(byBranch).forEach(function (key) {
      var a = byBranch[key];
      all.total += a.total; all.rented += a.rented; all.idle += a.idle;
      all.available += a.available; all.ready += a.ready;
      all.idleDaysSum += a.idleDaysSum;
      if (a.idleDaysMax > all.idleDaysMax) all.idleDaysMax = a.idleDaysMax;
      all.idleLoss += a.idleLoss;
    });
    return { rows: rows, all: finalize('ALL', all) };
  }

  function readLocal() {
    try {
      var raw = global.localStorage.getItem(KEY_LOCAL);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function writeLocal(rows) {
    try {
      var arr = readLocal();
      var byKey = Object.create(null);
      arr.forEach(function (r) { byKey[r.snapshot_date + '|' + r.branch] = r; });
      rows.forEach(function (r) { byKey[r.snapshot_date + '|' + r.branch] = r; });
      Object.keys(byKey).forEach(function (key) {
        if (byKey[key].snapshot_date < todayIso(new Date(Date.now() - CAP_LOCAL * 86400000))) delete byKey[key];
      });
      var out = Object.keys(byKey).map(function (key) { return byKey[key]; })
        .sort(function (a, b) { return (a.snapshot_date < b.snapshot_date ? -1 : a.snapshot_date > b.snapshot_date ? 1 : (a.branch < b.branch ? -1 : 1)); });
      global.localStorage.setItem(KEY_LOCAL, JSON.stringify(out.slice(-CAP_LOCAL * 20)));
    } catch (_) {}
  }

  async function saveToday(fleetList, refDateIso) {
    var ref = refDateIso || todayIso();
    var snap = computeSnapshot(fleetList, ref);
    var rows = snap.rows.concat([snap.all]);
    writeLocal(rows);
    var client = global.supabaseClient;
    if (global.supabaseReady && client && typeof client.from === 'function') {
      try {
        var payload = rows.map(function (r) {
          return {
            snapshot_date: r.snapshot_date,
            branch: r.branch,
            total_cars: r.total_cars,
            rented_cars: r.rented_cars,
            idle_cars: r.idle_cars,
            available_cars: r.available_cars,
            ready_cars: r.ready_cars,
            occupancy_rate: r.occupancy_rate,
            avg_idle_days: r.avg_idle_days,
            max_idle_days: r.max_idle_days,
            idle_loss: r.idle_loss
          };
        });
        var res = await client.from('fleet_daily_snapshots')
          .upsert(payload, { onConflict: 'snapshot_date,branch' });
        if (res && res.error) {
          // الجدول مش موجود لسه (الـ SQL لم يُشغَّل) — يفضل المحلي شغال
          return { rows: rows, remote: false, error: res.error };
        }
      } catch (err) {
        return { rows: rows, remote: false, error: err };
      }
    }
    return { rows: rows, remote: true };
  }

  async function loadSnapshots(filters) {
    var opts = filters || {};
    var from = opts.from || null;
    var to = opts.to || null;
    var client = global.supabaseClient;
    if (global.supabaseReady && client && typeof client.from === 'function') {
      try {
        var q = client.from('fleet_daily_snapshots').select('*')
          .order('snapshot_date', { ascending: true });
        if (from) q = q.gte('snapshot_date', from);
        if (to) q = q.lte('snapshot_date', to);
        var res = await q.limit(5000);
        if (res && !res.error && Array.isArray(res.data) && res.data.length) {
          // اعرضها على المحلي كمان عشان تبقى متاحة offline بعد كده
          writeLocal(res.data.map(function (r) {
            return {
              snapshot_date: String(r.snapshot_date).slice(0, 10),
              branch: r.branch,
              total_cars: r.total_cars,
              rented_cars: r.rented_cars,
              idle_cars: r.idle_cars,
              available_cars: r.available_cars,
              ready_cars: r.ready_cars,
              occupancy_rate: Number(r.occupancy_rate) || 0,
              avg_idle_days: Number(r.avg_idle_days) || 0,
              max_idle_days: r.max_idle_days || 0,
              idle_loss: Number(r.idle_loss) || 0
            };
          }));
          return res.data.map(function (r) {
            return {
              snapshot_date: String(r.snapshot_date).slice(0, 10),
              branch: r.branch,
              total_cars: r.total_cars,
              rented_cars: r.rented_cars,
              idle_cars: r.idle_cars,
              available_cars: r.available_cars,
              ready_cars: r.ready_cars,
              occupancy_rate: Number(r.occupancy_rate) || 0,
              avg_idle_days: Number(r.avg_idle_days) || 0,
              max_idle_days: r.max_idle_days || 0,
              idle_loss: Number(r.idle_loss) || 0
            };
          });
        }
      } catch (_) {}
    }
    var local = readLocal();
    return local.filter(function (r) {
      if (from && r.snapshot_date < from) return false;
      if (to && r.snapshot_date > to) return false;
      return true;
    });
  }

  global.YahmaSnapshots = {
    todayIso: todayIso,
    daysBetween: daysBetween,
    idleDaysFor: idleDaysFor,
    idleSinceFor: idleSinceFor,
    applyIdleSince: applyIdleSince,
    computeSnapshot: computeSnapshot,
    saveToday: saveToday,
    loadSnapshots: loadSnapshots,
    readLocal: readLocal
  };
})(typeof window !== 'undefined' ? window : globalThis);
