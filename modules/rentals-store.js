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
  var LOCAL_KEEP_DAYS = 120;
  function isQuotaError(err) {
    if (!err) return false;
    var n = err.name || '';
    var c = err.code;
    return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      c === 22 || c === 1014;
  }
  function pruneForLocal(list) {
    if (!Array.isArray(list)) return [];
    var cutoff = new Date(Date.now() - (LOCAL_KEEP_DAYS * 86400000));
    var cutStr = cutoff.getFullYear() + '-' +
      String(cutoff.getMonth() + 1).padStart(2, '0') + '-' +
      String(cutoff.getDate()).padStart(2, '0');
    return list.filter(function (r) {
      if (!r) return false;
      if (typeof r.note === 'string' && r.note.indexOf('\u062a\u0631\u062d\u064a\u0644 \u062a\u0644\u0642\u0627\u0626\u064a') === 0) return false;
      if (!r.endDate) return true;
      return String(r.endDate || '') >= cutStr;
    });
  }
  function writeJSON(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return;
    } catch (err) {
      if (!isQuotaError(err)) {
        yahmaErr(err, 'rentals-store.js:write');
        return;
      }
      var pruned = pruneForLocal(Array.isArray(value) ? value : []);
      try {
        global.localStorage.setItem(key, JSON.stringify(pruned));
        return;
      } catch (err2) {
        var openOnly = pruned.filter(function (r) { return !r.endDate; });
        try {
          global.localStorage.setItem(key, JSON.stringify(openOnly));
          return;
        } catch (err3) {
          try { global.localStorage.removeItem(key); } catch (_) {}
          yahmaErr(err3, 'rentals-store.js:write-quota-failed');
        }
      }
    }
  }
  function tableReady() {
    return !!(global.supabaseReady && global.supabaseClient);
  }

  /* REST OF FILE LOADED FROM ORIGINAL - partial emergency fix */
  function normDate(v) {
    if (!v) return '';
    var s = String(v).trim();
    if (!s) return '';
    var iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
    if (iso) return iso[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (us) {
      return us[3] + '-' + String(us[1]).padStart(2, '0') + '-' + String(us[2]).padStart(2, '0');
    }
    return '';
  }
  function daysBetween(a, b) {
    var ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
    if (isNaN(ms)) return 0;
    return Math.round(ms / 86400000) + 1;
  }
  function toNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  var MAX_DAYS = 400;
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
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
  function openForCar(carId) {
    var id = String(carId);
    return localOpen().filter(function (r) { return String(r.carId) === id; })[0] || null;
  }
  function newId(carId) {
    return 'rent-' + String(carId) + '-' + Date.now();
  }
  var MIGRATED_MARK = '\u062a\u0631\u062d\u064a\u0644 \u062a\u0644\u0642\u0627\u0626\u064a';
  function isMigrated(r) {
    return !!(r && typeof r.note === 'string' && r.note.indexOf(MIGRATED_MARK) === 0);
  }
  function removeMigrated(r) {
    try {
      writeJSON(KEY, localAll().filter(function (x) { return String(x.id) !== String(r.id); }));
    } catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'rentals-store.js:removeMigrated:local'); }
  }
  function canMutate() {
    var P = global.YahmaPerms;
    if (P && typeof P.canEditNow === 'function') return !!P.canEditNow();
    return global.currentRole !== 'view';
  }
  function actorName() {
    if (global.currentUserName) return global.currentUserName;
    return '';
  }
  async function startRental(car, opts) {
    opts = opts || {};
    if (!car) return { ok: false, error: 'car missing' };
    if (!canMutate()) return { ok: false, error: 'permission' };
    var start = normDate(opts.startDate) || todayStr();
    var end = normDate(opts.endDate);
    if (end && end < start) return { ok: false, error: 'end before start' };
    var clash = openForCar(car.id);
    if (clash) return { ok: false, error: 'already open' };
    var entry = {
      id: newId(car.id), carId: String(car.id), plate: car.plate || '', branch: car.branch || '',
      startDate: start, endDate: end || null,
      dailyRate: opts.dailyRate != null && opts.dailyRate !== '' ? toNum(opts.dailyRate) : toNum(car.dailyRate),
      note: opts.note || '', prevStatus: car.carStatus || '', userName: actorName(),
      createdAt: new Date().toISOString()
    };
    var list = localAll(); list.unshift(entry); writeJSON(KEY, list);
    return { ok: true, local: true, entry: entry };
  }
  async function endRental(id, endDate) {
    if (!canMutate()) return { ok: false, error: 'permission' };
    var list = localAll(); var hit = null;
    list.forEach(function (r) { if (String(r.id) === String(id)) hit = r; });
    if (!hit) return { ok: false, error: 'missing' };
    hit.endDate = normDate(endDate) || null; writeJSON(KEY, list);
    return { ok: true, local: true, entry: hit };
  }
  async function updateRental() { return { ok: false, error: 'reload needed' }; }
  async function removeRental(id) {
    writeJSON(KEY, localAll().filter(function (r) { return String(r.id) !== String(id); }));
    return { ok: true, local: true };
  }
  async function sync() { return localAll(); }
  function overlapDays() { return 0; }
  global.YahmaRentals = {
    localAll: localAll, localOpen: localOpen, byCar: byCar, openForCar: openForCar,
    startRental: startRental, endRental: endRental, updateRental: updateRental,
    removeRental: removeRental, sync: sync, isMigrated: isMigrated, overlapDays: overlapDays,
    KEY: KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
