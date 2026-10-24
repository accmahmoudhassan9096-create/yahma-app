/*
 * modules/fleet-core.js — دوال الأسطول النافعة النقية
 *
 * getFleet, readinessStats, uniqueFieldValues, optionList, createFilterEngine.
 * لا تلمس الـDOM. تُصدر على window.YahmaFleetCore.
 */
(function (global) {
  'use strict';

  function getFleet() {
    return Array.isArray(global.fleet) ? global.fleet : [];
  }

  // نتائج البحث الموحّد (الشريط العلوي) — نحفظها على مستوى الـ module لأن
  // renderFleet بتبني الـ input من جديد في كل رسم، فلو خزّناها جوه الدالة
  // كانت بتضيع مع أول إعادة رسم تانية (كان المستخدم يكتب في البحث، يتنقل،
  // ويرجع يلاقي الصندوق فاضي من غير ما الفلتر يتطبق أصلًا).
  let globalSearchValue = '';

  function readinessStats() {
    if (typeof global.readinessStats === 'function') return global.readinessStats();
    const list = getFleet();
    let ready = 0;
    list.forEach(function (c) {
      try {
        if (typeof global.vehicleReadiness === 'function' && global.vehicleReadiness(c).ready) ready++;
      } catch(e){yahmaErr(e,'fleet.js:24');}
    });
    const total = list.length;
    return { total: total, ready: ready, pct: total ? Math.round((ready / total) * 100) : 0 };
  }

  function uniqueFieldValues(cars, field) {
    const values = new Map();
    (Array.isArray(cars) ? cars : []).forEach(car => {
      const raw = String(car[field] == null ? '' : car[field]).trim();
      if (!raw) return;
      const key = raw.replace(/[يى]/g, 'ي').replace(/أ|إ|آ/g, 'ا');
      if (!values.has(key)) values.set(key, raw);
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
  }

  function optionList(items, placeholder, escape) {
    const safe = typeof escape === 'function' ? escape : value => String(value == null ? '' : value);
    return '<option value="">' + safe(placeholder) + '</option>' + (items || []).map(value => '<option value="' + safe(value) + '">' + safe(value) + '</option>').join('');
  }

  function createFilterEngine(options) {
    let cachedKey = null;
    let cachedRows = null;

    function matchesQuick(car, quick, helpers) {
      const hasCardIssue = helpers.cardState(car).level !== 'green';
      const hasLicenseIssue = helpers.licenseState(car).level !== 'green';
      const hasInspectionIssue = helpers.inspectionState(car).level !== 'green';
      const status = String(car.carStatus || '');
      if (quick === 'inspection_only') return hasInspectionIssue;
      if (quick === 'license_only') return hasLicenseIssue;
      if (quick === 'card_only') return hasCardIssue;
      if (quick === 'any_doc') return hasCardIssue || hasLicenseIssue || hasInspectionIssue;
      if (quick === 'ready') return helpers.vehicleReadiness(car).ready;
      if (quick === 'maintenance') return status.includes('صيانة');
      if (quick === 'out') return carStatusOut(status);
      if (quick === 'not_ready') return !helpers.vehicleReadiness(car).ready;
      return true;
    }

    function getRows() {
      const cars = options.getCars();
      const rawSearch = options.getSearch() || '';
      const query = rawSearch.trim().toLowerCase();
      const quick = options.getQuick() || '';
      const filters = options.getFilters();
      const values = [rawSearch, quick, ...Object.keys(filters).sort().map(key => filters[key]), cars.length];
      const key = values.join('\x1f');
      if (cachedKey === key && cachedRows) return cachedRows;

      const needsStatus = !!(filters.cardCondition || filters.licenseCondition || filters.inspectionCondition || filters.prepStatus || quick);
      const rows = [];
      for (const car of cars) {
        if (filters.brand && car.brand !== filters.brand) continue;
        if (filters.type && car.type !== filters.type) continue;
        if (filters.model && car.model !== filters.model) continue;
        if (filters.year && String(car.model || '') !== filters.year) continue;
        if (filters.cardStatus && String(car.cardStatus || '') !== filters.cardStatus) continue;
        if (filters.licenseStatus && String(car.licenseStatus || '') !== filters.licenseStatus) continue;
        if (filters.inspectionStatus && String(car.inspectionStatus || '') !== filters.inspectionStatus) continue;
        if (filters.owner && car.owner !== filters.owner) continue;
        if (filters.branch && car.branch !== filters.branch) continue;
        if (filters.carStatus && car.carStatus !== filters.carStatus) continue;
        if (query) {
          /* نفس منطق البحث في التبويب — اللوحة لوحدها للأرقام القصيرة.
             modules/utils.js: carMatchesSearch */
          if (typeof carMatchesSearch === 'function') {
            if (!carMatchesSearch(car, query)) continue;
          } else {
            if (!car._searchHay) {
              car._searchHay = [car.plate, car.brand, car.type, car.model, car.serial,
                car.cardNumber, car.owner, car.branch, car.carStatus]
                .map(value => String(value || '').toLowerCase()).join(' ');
            }
            if (!car._searchHay.includes(query)) continue;
          }
        }
        if (needsStatus) {
          if (filters.cardCondition && options.helpers.cardState(car).level !== filters.cardCondition) continue;
          if (filters.licenseCondition && options.helpers.licenseState(car).level !== filters.licenseCondition) continue;
          if (filters.inspectionCondition && options.helpers.inspectionState(car).level !== filters.inspectionCondition) continue;
          if (filters.prepStatus && options.helpers.prepStatus(car).level !== filters.prepStatus) continue;
          if (quick && !matchesQuick(car, quick, options.helpers)) continue;
        }
        rows.push(car);
      }
      cachedKey = key;
      cachedRows = rows;
      return rows;
    }

    return { getRows: getRows, invalidate: function () { cachedKey = null; cachedRows = null; } };
  }
  window.YahmaFleetCore = {
    getFleet,
    readinessStats,
    uniqueFieldValues,
    optionList,
    createFilterEngine
  };
})(window !== undefined ? window : this);
