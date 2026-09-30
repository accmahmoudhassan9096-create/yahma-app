/* Supabase data access and vehicle row mapping. */
(function (global) {
  'use strict';

  const PAGE_SIZE = 1000;
  const STORAGE_KEY = 'fleet-data-v2';
  const LAST_SYNC_KEY = 'fleet-last-sync-v1';
  const normalizeDateValue = value => global.YahmaUtils
    ? global.YahmaUtils.normalizeDateValue(value)
    : value;
  const nullable = value => value === '' || value === undefined || value === null ? null : value;
  const numberOrNull = value => {
    const number = parseFloat(value);
    return Number.isNaN(number) ? null : number;
  };
  const dateOrNull = value => normalizeDateValue(value) || null;

  function toVehicleRow(car) {
    const full = JSON.parse(JSON.stringify(car));
    const checklist = car.prepChecklist || {};
    return {
      car_id: String(car.id),
      plate: String(car.plate || '').trim(),
      brand: nullable(car.brand), type: nullable(car.type), model: nullable(car.model),
      year: numberOrNull(car.year), serial: nullable(car.serial), cardnumber: nullable(car.cardNumber),
      cardstatus: nullable(car.cardStatus), cardexpiry: dateOrNull(car.cardExpiry),
      licensestatus: nullable(car.licenseStatus), licenseexpiry: dateOrNull(car.licenseExpiry),
      inspection: nullable(car.inspectionStatus), insurance: nullable(car.insuranceStatus),
      owner: nullable(car.owner), ownernumber: nullable(car.ownerNumber), branch: nullable(car.branch),
      carstatus: nullable(car.carStatus), odometer: numberOrNull(car.odometer),
      nextservice: dateOrNull(car.nextService), dailyrate: numberOrNull(car.dailyRate),
      renteddays: numberOrNull(car.rentedDaysMonth), lastmaintenance: dateOrNull(car.lastMaintenance),
      maintenancecost: numberOrNull(car.maintenanceCost), workshop: nullable(car.workshop),
      documenturl: nullable(car.documentUrl), maintenancenotes: nullable(car.maintenanceNotes),
      notes: nullable(car.notes),
      prep_final: !!checklist.finalReview, prep_final_note: nullable(checklist.finalNote),
      prep_tasks: Array.isArray(car.prepTasks) ? car.prepTasks : [],
      data: full
    };
  }

  function fromVehicleRow(row) {
    const base = {
      plate: row.plate || '', brand: row.brand || '', type: row.type || '', model: row.model || '', year: row.year || '',
      serial: row.serial || '', cardNumber: row.cardnumber || '',
      cardStatus: row.cardstatus || '', cardExpiry: row.cardexpiry || '',
      licenseStatus: row.licensestatus || '', licenseExpiry: row.licenseexpiry || '',
      inspectionStatus: row.inspection || '', insuranceStatus: row.insurance || '',
      owner: row.owner || '', ownerNumber: row.ownernumber || '', branch: row.branch || '',
      carStatus: row.carstatus || '', odometer: row.odometer ?? '',
      nextService: row.nextservice || '', dailyRate: row.dailyrate ?? '',
      rentedDaysMonth: row.renteddays ?? '', lastMaintenance: row.lastmaintenance || '',
      maintenanceCost: row.maintenancecost ?? '', workshop: row.workshop || '',
      documentUrl: row.documenturl || '', maintenanceNotes: row.maintenancenotes || '',
      notes: row.notes || '',
      prepChecklist: { finalReview: !!row.prep_final, finalNote: row.prep_final_note || '' },
      prepTasks: Array.isArray(row.prep_tasks) ? row.prep_tasks : [],
      updatedAt: (row.updated_at || '').slice(0, 10)
    };
    const extra = row.data && typeof row.data === 'object' ? row.data : {};
    const car = Object.assign(base, extra);
    car.id = String(row.car_id || ('cloud-' + row.id));
    return car;
  }

  async function fetchAllVehicles(client, table = 'vehicles') {
    if (!client) throw new Error('عميل Supabase غير جاهز');
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError) throw authError;
    if (!authData?.session?.user) throw new Error('انتهت جلسة الدخول؛ سجّل الدخول مجددًا لمزامنة السيارات');

    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client.from(table).select('*')
        .order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (data?.length) rows.push(...data);
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  function stableString(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableString(value[key])).join(',') + '}';
  }

  function setFleet(context, rows) { context.setFleet(rows); }

  let loadInFlight = null;
  function loadData(forceCloud, context) {
    if (loadInFlight) return loadInFlight;
    loadInFlight = loadDataImpl(!!forceCloud, context);
    return loadInFlight.finally(() => { loadInFlight = null; });
  }

  async function loadDataImpl(forceCloud, context) {
    let usedCache = false;
    let renderedOnce = false;
    let fleet = context.getFleet();

    try {
      if (!forceCloud && global.YahmaDB && (global._demoMode || !global.supabaseReady || global.currentRole === 'admin')) {
        await global.YahmaDB.ready;
        const cached = await global.YahmaDB.loadFleet();
        if (Array.isArray(cached) && cached.length) {
          setFleet(context, cached); fleet = cached; usedCache = true;
          context.render(); renderedOnce = true;
        }
      }
    } catch (error) { console.warn('YahmaDB load', error); }

    try {
      if (!usedCache && (global._demoMode || !global.supabaseReady || global.currentRole === 'admin')) {
        const local = global.localStorage.getItem(STORAGE_KEY);
        if (local && !forceCloud) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length) {
            setFleet(context, parsed); fleet = parsed; usedCache = true;
            context.render(); renderedOnce = true;
            if (global.YahmaDB?.saveFleet) {
              try { await global.YahmaDB.saveFleet(fleet); } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    if (global._demoMode) {
      if (!usedCache || !fleet.length) {
        try {
          if (global.YahmaDB) {
            const cached = await global.YahmaDB.loadFleet();
            if (cached?.length) { fleet = cached; setFleet(context, fleet); }
          }
          if (!fleet.length) {
            fleet = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '[]');
            setFleet(context, fleet);
          }
        } catch (_) { fleet = []; setFleet(context, fleet); }
        if (!fleet.length) { fleet = context.seedData(); setFleet(context, fleet); }
        try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet)); } catch (_) {}
        if (global.YahmaDB?.saveFleet) try { await global.YahmaDB.saveFleet(fleet); } catch (_) {}
      }
      global.syncMessage = 'وضع محلي (تجريبي)';
      context.normalizeFleetDates();
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(context.getFleet()));
      context.render();
      return;
    }

    const cloudMode = !!(global.supabaseReady && global.supabaseClient);
    if (!usedCache && !forceCloud && !cloudMode) {
      fleet = context.seedData(); setFleet(context, fleet);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
      context.render(); renderedOnce = true;
    }

    const needsCloudFetch = forceCloud || !usedCache || cloudMode;
    const beforeSnapshot = renderedOnce ? stableString(context.getFleet()) : null;
    if (needsCloudFetch) {
      try {
        if (global.supabaseReady && global.supabaseClient) {
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ Supabase بعد 30 ثانية')), 30000));
          const cloudRows = await Promise.race([fetchAllVehicles(global.supabaseClient), timeout]);
          if (cloudRows?.length) {
            fleet = (typeof scopeFleetToUser==='function') ? scopeFleetToUser(cloudRows.map(fromVehicleRow)) : cloudRows.map(fromVehicleRow);
            setFleet(context, fleet);
            context.setCloudVehicleIds(fleet.map(car => String(car.id)));
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
            global.localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            global.syncMessage = forceCloud ? 'تم التحديث من Supabase' : 'متصل بـ Supabase';
          } else {
            let cached=context.getFleet();
            if (!Array.isArray(cached) || !cached.length) cached=[];
            if (!cached.length) {
              try { cached=JSON.parse(global.localStorage.getItem(STORAGE_KEY)||'[]'); } catch (_) {}
            }
            if (Array.isArray(cached) && cached.length) {
              fleet=cached; setFleet(context,fleet);
              global.syncMessage='تعذر جلب السيارات؛ تم الإبقاء على النسخة المحفوظة';
              console.warn('Supabase returned no vehicles; preserving the local fleet cache');
            } else {
              fleet=[]; setFleet(context,fleet); context.setCloudVehicleIds([]);
              global.localStorage.setItem(STORAGE_KEY,'[]');
              global.syncMessage='متصل بـ Supabase — لا توجد سيارات بعد';
            }
          }
          if (global.YahmaDB?.saveFleet) try { await global.YahmaDB.saveFleet(fleet); } catch (_) {}
        } else if (!usedCache) {
          let value = global.localStorage.getItem(STORAGE_KEY) || '';
          if (value) { try { fleet = JSON.parse(value); } catch (_) { fleet = []; } }
          if (!fleet.length) fleet = context.seedData();
          setFleet(context, fleet);
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
        }
      } catch (error) {
        console.warn('تعذر التحديث من Supabase:', error);
        global.syncMessage = 'وضع محلي (تعذر الاتصال)';
        if (!usedCache || !fleet.length) {
          try { fleet = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_) { fleet = []; }
          if (!fleet.length && !cloudMode) fleet = context.seedData();
          setFleet(context, fleet);
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
        }
        const syncEl = global.document.getElementById('sync-status');
        if (syncEl) {
          syncEl.textContent = global.currentUser
            ? '⚠️ تعذر تحديث السيارات من Supabase — اضغط تحديث أو سجّل الدخول مجددًا'
            : '⚠️ تعذر الاتصال بالسحابة — تعمل ببيانات محلية';
          syncEl.className = 'sync-status offline';
          syncEl.title = error?.message || 'تعذر جلب السيارات من Supabase';
        }
      }
    }

    fleet = context.getFleet();
    if (!Array.isArray(fleet)) { fleet = []; setFleet(context, fleet); }
    if (!fleet.length && !cloudMode) {
      fleet = context.seedData(); setFleet(context, fleet);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
    }
    try { context.normalizeFleetDates(); } catch (_) {}
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(context.getFleet()));
    const changed = beforeSnapshot === null || stableString(context.getFleet()) !== beforeSnapshot;
    if (!renderedOnce || changed) {
      try { context.render(); }
      catch (error) {
        console.error('final render failed', error);
        context.renderEmergencyFleet(global.document.getElementById('content'));
      }
    }
    try { context.attachRealtimeSync(); } catch (_) {}
  }

  async function saveData(idsToSave, context) {
    let fleet = context.getFleet();
    if (!global._demoMode && global.currentRole === 'view') {
      console.warn('رفض حفظ البيانات: صلاحية المستخدم للعرض فقط');
      return false;
    }
    const value = JSON.stringify(fleet);
    try { global.localStorage.setItem(STORAGE_KEY, value); }
    catch (error) { console.warn('localStorage full', error); }
    if (global.YahmaDB && typeof global.YahmaDB.saveFleet === 'function') {
      try { await global.YahmaDB.saveFleet(fleet); }
      catch (error) { console.warn('YahmaDB.saveFleet', error); }
    }
    try {
      if (global._demoMode) { global.syncMessage = 'محفوظ محليًا (تجريبي)'; return true; }
      if (global.supabaseReady && global.supabaseClient) {
        const idSet = Array.isArray(idsToSave) && idsToSave.length ? new Set(idsToSave.map(String)) : null;
        const toWrite = idSet ? fleet.filter(car => idSet.has(String(car.id))) : fleet;
        const rows = toWrite.map(toVehicleRow).filter(row => row.plate);
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await global.supabaseClient.from('vehicles')
            .upsert(rows.slice(i, i + 200), { onConflict: 'car_id' });
          if (error) throw error;
        }
        context.addCloudVehicleIds(toWrite.map(car => String(car.id)));
        global.syncMessage = 'تم الحفظ على Supabase';
        try { global.localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); } catch (_) {}
      } else if (global.storage && typeof global.storage.set === 'function') {
        await global.storage.set(STORAGE_KEY, value, true);
      }
      return true;
    } catch (error) {
      console.error('تعذر الحفظ على Supabase، تم الحفظ محليًا', error);
      global.syncMessage = 'محفوظ محليًا';
      return false;
    }
  }

  global.YahmaData = Object.assign(global.YahmaData || {}, {
    toVehicleRow,
    fromVehicleRow,
    fetchAllVehicles,
    loadData,
    saveData
  });
})(typeof window !== 'undefined' ? window : globalThis);
