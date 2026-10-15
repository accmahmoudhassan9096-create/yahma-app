/**
 * app.js — الإقلاع + IndexedDB عبر Dexie.js
 * يتحمل عشرات الآلاف من السجلات بدون ضغط localStorage
 */
(function (global) {
  'use strict';

  const DB_NAME = 'yahma-fleet-db';
  /* v2: جدول طابور الأوفلاين. v1 كان أقف عند 1.
     الترقية بتضيف جدول جديد وبتسيب جدول vehicles زي ما هو —
     IndexedDB بيفصل ترقيبات المخطط في store() متعدد. */
  const DB_VERSION = 2;
  const LEGACY_KEY = 'fleet-data-v2';
  const BRANCHES_KEY = 'fleet-branches-v1';

  function createDb() {
    if (typeof Dexie === 'undefined') {
      console.error('Dexie.js غير محمّلة');
      return null;
    }
    const db = new Dexie(DB_NAME);
    db.version(1).stores({
      // id هو المفتاح الأساسي للسيارة
      vehicles: 'id, plate, branch, owner, brand, carStatus, cardExpiry, licenseExpiry',
      meta: 'key',
      branches: 'id, name',
    });
    /* carId مفتاح أساسي عشان تعديل نفس السيارة 5 مرات وهوفلاين
       يبقى سطر واحد فيه آخر حالة، مش 5 سطور. الحفظ الطابوري
       بيضغط نفسه (coalescing) — ده اللي يمنع الطابور من Inflation. */
    db.version(2).stores({
      pendingWrites: 'carId, savedAt',
    });
    return db;
  }

  /* ===== طابور الأوفلاين =====
     الحفظ العادي بيكتب: localStorage ← Dexie ← Supabase.
     لو الخطوة التالتة فشلت (نت مقطوع، السيرفر واقع، جلسة منتهية)
     الداتا كانت بتفضل على الجهاز بس، وأول ما المستخدم يفتح
     التطبيق تاني loadData بيمسح المحلي بمحتوى السحابة — فالبيانات
     بتروح.

     الطابور بيخزّن صف السيارة كما هو بالظبط قبل ما الشبكة ترجع، وبعدين
     بيحاول يرسله تاني. المفتاح carId عشان آخر تعديل هو اللي بيفضل. */
  async function queuePending(rows, reason) {
    if (!db || !Array.isArray(rows) || !rows.length) return 0;
    try {
      const now = new Date().toISOString();
      const existing = new Set((await db.pendingWrites.toCollection().primaryKeys()).map(String));
      const fresh = [];
      rows.forEach(function (row) {
        if (!row || row.car_id === undefined || row.car_id === null) return;
        if (existing.has(String(row.car_id))) return;   /* الخط القديم أبقى بيفضل */
        fresh.push({ carId: String(row.car_id), row: row, savedAt: now, reason: String(reason || '') });
      });
      if (fresh.length) await db.pendingWrites.bulkPut(fresh);
      return fresh.length;
    } catch (e) {
      console.error('[YahmaDB] queuePending error:', e);
      return 0;
    }
  }
  async function listPending() {
    if (!db) return [];
    try { return await db.pendingWrites.toArray(); }
    catch (e) { console.error('[YahmaDB] listPending error:', e); return []; }
  }
  async function dropPending(carIds) {
    if (!db || !carIds || !carIds.length) return 0;
    try {
      await db.pendingWrites.bulkDelete(carIds.map(String));
      return carIds.length;
    } catch (e) { console.error('[YahmaDB] dropPending error:', e); return 0; }
  }
  async function pendingCount() {
    if (!db) return 0;
    try { return await db.pendingWrites.count(); }
    catch (_) { return 0; }
  }

  const db = createDb();

  async function saveFleet(list) {
    if (!db) return false;
    const rows = Array.isArray(list) ? list : [];
    try {
      await db.transaction('rw', db.vehicles, db.meta, async function () {
        await db.vehicles.clear();
        if (rows.length) {
          // bulkPut على دفعات؛ بلا setTimeout داخل المعاملة (يُنهيها تلقائيًا ويُفشل بقية الدفعات)
          const CHUNK = 500;
          for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK).map(function (c, idx) {
              const row = Object.assign({}, c);
              if (!row.id) row.id = 'v-' + Date.now() + '-' + (i + idx);
              return row;
            });
            await db.vehicles.bulkPut(slice);
          }
        }
        await db.meta.put({ key: 'fleet-meta', count: rows.length, updatedAt: new Date().toISOString() });
      });
      return true;
    } catch (e) {
      console.error('[YahmaDB] saveFleet error:', e);
      return false;
    }
  }

  async function loadFleet() {
    if (!db) return [];
    try {
      const rows = await db.vehicles.toArray();
      return rows || [];
    } catch (e) {
      console.error('[YahmaDB] loadFleet error:', e);
      return [];
    }
  }

  async function saveBranches(list) {
    if (!db) return false;
    const rows = Array.isArray(list) ? list : [];
    try {
      await db.transaction('rw', db.branches, async function () {
        await db.branches.clear();
        if (rows.length) await db.branches.bulkPut(rows);
      });
      return true;
    } catch (e) {
      console.error('[YahmaDB] saveBranches error:', e);
      return false;
    }
  }

  async function loadBranches() {
    if (!db) return [];
    try {
      return (await db.branches.toArray()) || [];
    } catch (e) {
      console.error('[YahmaDB] loadBranches error:', e);
      return [];
    }
  }

  async function migrateFromLocalStorage() {
    if (!db) return { migrated: false };
    try {
      const meta = await db.meta.get('fleet-meta');
      const count = await db.vehicles.count();
      if (count > 0) {
        return { migrated: false, reason: 'already-has-data', count: count };
      }
      let legacy = [];
      try {
        legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      } catch (e) {
        console.warn('[YahmaDB] localStorage parse error:', e);
        legacy = [];
      }
      if (!Array.isArray(legacy) || !legacy.length) {
        return { migrated: false, reason: 'no-legacy' };
      }
      console.info('[YahmaDB] Migrating', legacy.length, 'records from localStorage → IndexedDB');
      await saveFleet(legacy);
      // branches
      try {
        const br = JSON.parse(localStorage.getItem(BRANCHES_KEY) || '[]');
        if (Array.isArray(br) && br.length) await saveBranches(br);
      } catch (e) {
        console.warn('[YahmaDB] branches migration error:', e);
      }
      return { migrated: true, count: legacy.length };
    } catch (e) {
      console.error('[YahmaDB] migration error:', e);
      return { migrated: false, error: e.message };
    }
  }

  async function count() {
    if (!db) return 0;
    try {
      return await db.vehicles.count();
    } catch (e) {
      console.error('[YahmaDB] count error:', e);
      return 0;
    }
  }

  const ready = (async function () {
    if (!db) return { ok: false };
    try {
      await db.open();
      const mig = await migrateFromLocalStorage();
      if (mig.migrated) {
        console.info('[YahmaDB] Migration done:', mig.count);
      }
      return { ok: true, migration: mig };
    } catch (e) {
      console.error('[YahmaDB] initialization error:', e);
      return { ok: false, error: e.message };
    }
  })();

  global.YahmaDB = {
    db: db,
    ready: ready,
    saveFleet: saveFleet,
    loadFleet: loadFleet,
    saveBranches: saveBranches,
    loadBranches: loadBranches,
    migrateFromLocalStorage: migrateFromLocalStorage,
    count: count,
    queuePending: queuePending,
    listPending: listPending,
    dropPending: dropPending,
    pendingCount: pendingCount,
  };

  // بعد تحميل core: اربط saveData ليفضّل IndexedDB
  document.addEventListener('DOMContentLoaded', function () {
    ready.then(function () {
      console.info('[Yahma] IndexedDB ready');
    });
  });
})(typeof window !== 'undefined' ? window : this);
