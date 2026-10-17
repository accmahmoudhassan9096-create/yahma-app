/* ===== modules/reports-core.js — أساس التقارير =====
 *
 * الحالة المحفوظة (الفلاتر والفترة)، حساب التواريخ والفترات،
 * المؤشرات المحاسبية، والتجميع. كله حساب صافي — مالوش DOM.
 *
 * ملف القوالب بياخد periodBounds/periodLabel من هنا، وملف الرسم
 * بياخد من الاتنين. الترتيب لازم: core -> templates -> reports.
 */
(function (global) {
  'use strict';

  const FILTERS_KEY = 'yahma-report-filters-v1';
  const PRESETS_KEY = 'yahma-report-presets-v1';
  const PERIOD_PRESETS = [
    { key: 'today', label: 'اليوم' },
    { key: 'thisWeek', label: 'هذا الأسبوع' },
    { key: 'thisMonth', label: 'هذا الشهر' },
    { key: 'lastMonth', label: 'الشهر الماضي' },
    { key: 'last30', label: 'آخر 30 يوم' },
    { key: 'last90', label: 'آخر 90 يوم' },
    { key: 'ytd', label: 'من أول السنة' },
    { key: 'all', label: 'كل الفترات' },
    { key: 'custom', label: 'فترة مخصصة' }
  ];

  function storageRead(key, fallback) {
    try {
      const value = JSON.parse(global.localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }

  const savedState = storageRead(FILTERS_KEY, {});
  global.periodRange = global.periodRange || savedState.period || { preset: 'thisMonth', from: '', to: '' };
  global.reportFilters = global.reportFilters || savedState.filters || { branch: 'all', owner: 'all', status: 'all', issue: 'all', range: '30' };

  function persistState() {
    try { global.localStorage.setItem(FILTERS_KEY, JSON.stringify({ period: global.periodRange, filters: global.reportFilters })); }
    catch (error) { console.warn('Could not save report filters', error); }
  }

  function getPresets() {
    const presets = storageRead(PRESETS_KEY, []);
    return Array.isArray(presets) ? presets.filter(preset => preset && typeof preset.name === 'string' && preset.filters && preset.period) : [];
  }

  function isoLocal(date) {
    const value = new Date(date);
    if (isNaN(value)) return '';
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }

  /* ===== ⭐ مصدر واحد لأيام الاستئجار في التقرير =====

     التقارير كانت بتقرأ `car.rentedDaysMonth` — رقم يدوي للمستخدم
     يكتبه مرة في الشهر. المشكلة مش ناقص بيانات، المشكلة إن الرقم
     ده **مصفوف على حاله**: 3,984 سيارة عندها صفر، فالتقرير بيقول
     «0% استغلاط · 0 إيراد» وكأنه بيقيس فعلاً. ولو حد غيّر سعر
     اليوم بعد ما كتب الرقم، إيراد الشهر اللي فات بيتغيّر — يعني
     التقرير بيتعاد كتابته.

     دلوقتي الأرقام بتتجيب من سجل الاستئجارات (تاريخ فعلي).
     والعمود القديم لسه موجود في الفورم والإكسل (مش بنمسحه —
     ده حقBackward compatibility)، بس مش بيغذّي التقرير.

     ⚠️ لو مفيش ولا استئجار مسجّل، رجّع hasStore=false — والصفحة
     بتقول «لسه محدّدش استئجارات» بدل ما تعرض 0% كأنه إجابة. */
  function rentalsPeriod(cars, bounds) {
    const out = { days: 0, revenue: 0, carsRented: 0, hasStore: false, perCar: new Map() };
    if (!global.YahmaRentals || typeof global.YahmaRentals.revenueBetween !== 'function') return out;
    let all;
    try { all = global.YahmaRentals.localAll() || []; }
    catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'reports.js:rentalsPeriod'); return out; }
    out.hasStore = all.length > 0;
    if (!out.hasStore) return out;

    /* ⭐ فلتر الأسطول: التقرير بيشتغل على قائمة مفلترة، فلازم
       الأرقام تتحسب على نفس القائمة. لو حسبنا كل السجلات
       وضفناها، الأرقام مش بتطابق عدد السيارات المعروض —
       وده بالظبط اللي صinality كان بيفصله. */
    const wanted = new Set((cars || []).map(c => String(c.id)));
    let days = 0, revenue = 0;
    all.forEach(r => {
      if (!wanted.has(String(r.carId))) return;
      const d = global.YahmaRentals.overlapDays(r, bounds.from, bounds.to);
      if (d <= 0) return;
      const amount = d * (parseFloat(r.dailyRate) || 0);
      days += d;
      revenue += amount;
      out.perCar.set(String(r.carId), (out.perCar.get(String(r.carId)) || 0) + d);
    });
    out.days = days;
    out.revenue = revenue;
    out.carsRented = out.perCar.size;
    return out;
  }

  /* أيام الاستئجار لِد السيارة في الفترة — بديل rentedDaysMonth */
  function rentedDaysFor(carId, bounds) {
    const n = rentalsPeriod([{ id: carId }], bounds).days;
    return n || 0;
  }

  /* كل سجلات سيارة معيّنة — للتقرير التفصيلي ولأعلى إيراد.
     بترجع مصفوفة فاضية بدل ما ترمي: نداءات التقرير بتحصل جوه
     رسم الصفحة، وترمي هنا = شاشة بيضاء. */
  function allRentalsForCar(carId) {
    try {
      if (global.YahmaRentals && typeof global.YahmaRentals.byCar === 'function') {
        return global.YahmaRentals.byCar(carId) || [];
      }
    } catch (e) { if (typeof yahmaErr === 'function') yahmaErr(e, 'reports.js:allRentalsForCar'); }
    return [];
  }

  /* ⚠️ رسالة صريحة لما مفيش استئجارات مسجّلة.
     بدل «0% استغلال» اللي بيقول للمستخدم «أسطولك مش بيأجّر»
     وهو في الحقيقة «لسه محدّدش».
     الرد التلقائي ده هو اللي خلّى صفر الـ3,984 يفضل months
     والحدش ياخد باله. */
  function noRentalsNotice(count) {
    return '<div class="panel" style="border-inline-start:4px solid var(--gold,#C9A227)">'
      + '<h3>لسه محدّدش استئجارات</h3>'
      + '<p>مفيش ولا عملية استئجار مسجّلة، فمفيش أرقام استغلال ولا إيراد نحسبها.</p>'
      + '<p class="muted-small">الرقم 0% اللي كان بيظهر مكان ده كان غلط — كان يعني «مفيش بيانات»، مش «مفيش تأجير».</p>'
      + '<button type="button" class="btn btn-primary btn-small" data-goto-rentals="1">افتح تبويب الاستئجارات</button>'
      + '</div>';
  }

  function periodBounds() {
    const period = global.periodRange || { preset: 'thisMonth' };
    const now = new Date();
    if (period.preset === 'custom') {
      let from = period.from || '', to = period.to || '';
      if (from && to && from > to) { const swap = from; from = to; to = swap; }
      return { from: from || '1900-01-01', to: to || isoLocal(now) };
    }
    const year = now.getFullYear(), month = now.getMonth();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 1) % 7));
    switch (period.preset) {
      case 'today': return { from: isoLocal(now), to: isoLocal(now) };
      case 'thisWeek': return { from: isoLocal(weekStart), to: isoLocal(now) };
      case 'thisMonth': return { from: isoLocal(new Date(year, month, 1)), to: isoLocal(new Date(year, month + 1, 0)) };
      case 'lastMonth': return { from: isoLocal(new Date(year, month - 1, 1)), to: isoLocal(new Date(year, month, 0)) };
      case 'last30': { const from = new Date(now); from.setDate(from.getDate() - 29); return { from: isoLocal(from), to: isoLocal(now) }; }
      case 'last90': { const from = new Date(now); from.setDate(from.getDate() - 89); return { from: isoLocal(from), to: isoLocal(now) }; }
      case 'ytd': return { from: isoLocal(new Date(year, 0, 1)), to: isoLocal(new Date(year, 11, 31)) };
      default: return { from: '1900-01-01', to: isoLocal(new Date(year, 11, 31)) };
    }
  }

  function periodLabel() {
    if ((global.periodRange || {}).preset === 'all') return 'كل الفترات';
    const bounds = periodBounds();
    return 'من ' + (bounds.from || '—') + ' إلى ' + (bounds.to || '—');
  }

  function periodDate(record) {
    const value = field => {
      if (!field) return '';
      const text = String(field);
      return text.length >= 10 ? text.slice(0, 10) : '';
    };
    return value(record.updatedAt) || value(record.lastMaintenance) || value(record.createdAt) || value(record.prepCompletedAt) || value(record.nextService) || '';
  }

  function inPeriod(record) {
    const bounds = periodBounds();
    const date = periodDate(record);
    return !date || (date >= bounds.from && date <= bounds.to);
  }

  function accountingIndicators(list) {
    const bounds = periodBounds();
    let days = Math.round((new Date(bounds.to) - new Date(bounds.from)) / 86400000) + 1;
    if (!(days > 0)) days = 30;
    let active = 0, dailySum = 0, dailyCount = 0, maintenanceCost = 0;
    /* ⭐ الأيام والإيراد يجوا من سجل الاستئجارات للفترة دي،
       مش من `rentedDaysMonth`. */
    const rp = rentalsPeriod(list, bounds);
    const estimateSum = rp.revenue;
    (list || []).forEach(car => {
      const status = String(car.carStatus || '').trim();
      if (!status.includes('خارج') && !status.includes('مسروق') && !status.includes('محول') && !status.includes('مفقود') && !status.includes('مؤرشفة') && !status.includes('مباعة')) active++;
      const dailyRate = parseFloat(car.dailyRate);
      if (!isNaN(dailyRate) && dailyRate > 0) { dailySum += dailyRate; dailyCount++; }
      const cost = parseFloat(car.maintenanceCost);
      if (!isNaN(cost)) maintenanceCost += cost;
    });
    const averageDaily = dailyCount ? dailySum / dailyCount : 0;
    const monthlyPotential = dailyCount ? averageDaily * active * 30 : 0;
    const estimatedRevenue = estimateSum;
    return {
      days, active,
      avgDaily: Math.round(averageDaily),
      monthPotential: Math.round(monthlyPotential),
      estMonthRev: Math.round(estimatedRevenue),
      revPerCar: active ? Math.round((estimatedRevenue || monthlyPotential) / active) : 0,
      maintCost: Math.round(maintenanceCost),
      netEst: Math.round((estimatedRevenue || monthlyPotential) - maintenanceCost),
      hasData: dailyCount > 0,
      /* ⭐ الاستغلال = أيام الاستئجار ÷ (سيارات نشطة × أيام الفترة).
         المقام أيام الفترة الحقيقية مش 30 ثابتة — مع فترة 90 يوم
         أو شهر 31 يوم الرقم القديم كان بيبقى غلط دايمًا. */
      rentedDays: rp.days,
      carsRented: rp.carsRented,
      hasRentals: rp.hasStore
    };
  }

  function aggregateReport(list, readiness) {
    const rows = Array.isArray(list) ? list : [];
    let ready = 0, notReady = 0, maintenance = 0, out = 0, prepOpen = 0, prepOverdue = 0;
    const failures = {}, branchMap = {}, ownerMap = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysFrom = value => {
      if (!value) return null;
      const date = new Date(value);
      return isNaN(date) ? null : Math.round((date - today) / 86400000);
    };
    const expBuckets = { overdue: 0, d7: 0, d30: 0, d90: 0 };
    const expFields = ['cardExpiry', 'licenseExpiry', 'insuranceExpiry', 'inspectionExpiry', 'nextService'];

    const fleetRows = [];
    rows.forEach(car => {
      let isReady = false;
      let resultLabel = 'غير جاهزة';
      try {
        const result = typeof readiness === 'function' ? readiness(car) : null;
        if (result) {
          isReady = !!result.ready;
          resultLabel = result.label || resultLabel;
          if (!isReady) (result.failed || []).forEach(item => {
            const label = (item && (item.label || item.name || item)) || 'أخرى';
            failures[label] = (failures[label] || 0) + 1;
          });
        }
      } catch(_){yahmaErr(_,'reports.js:151');}
      if (isReady) ready++; else notReady++;
      if (String(car.carStatus || '').includes('صيانة')) maintenance++;
      if (String(car.carStatus || '').includes('خارج') || String(car.carStatus || '').includes('مسروق') || String(car.carStatus || '').includes('محول') || String(car.carStatus || '').includes('مفقود')) out++;

      const branch = String(car.branch || 'غير محدد').trim() || 'غير محدد';
      if (!branchMap[branch]) branchMap[branch] = { t: 0, r: 0, ov: 0 };
      branchMap[branch].t++;
      if (isReady) branchMap[branch].r++;
      (Array.isArray(car.prepTasks) ? car.prepTasks : []).forEach(task => {
        if (task.status === 'done') return;
        prepOpen++;
        const due = task.dueDate ? new Date(task.dueDate) : null;
        if (due && !isNaN(due) && due < today) { prepOverdue++; branchMap[branch].ov++; }
      });
      expFields.forEach(field => {
        const left = daysFrom(car[field]);
        if (left === null) return;
        if (left < 0) expBuckets.overdue++;
        else if (left <= 7) expBuckets.d7++;
        else if (left <= 30) expBuckets.d30++;
        else if (left <= 90) expBuckets.d90++;
      });
      const owner = String(car.owner || 'غير محدد').trim() || 'غير محدد';
      ownerMap[owner] = (ownerMap[owner] || 0) + 1;
      fleetRows.push({
        plate: car.plate, brand: car.brand, type: car.type, model: car.model,
        odometer: car.odometer, color: car.color, city: car.city,
        serial: car.serial, insuranceStatus: car.insuranceStatus,
        branch: car.branch, owner: car.owner, carStatus: car.carStatus,
        readyLabel: isReady ? 'جاهزة' : (resultLabel || 'غير جاهزة'),
        dailyRate: car.dailyRate, minDailyRate: car.minDailyRate,
        monthlyRate: car.monthlyRate, minMonthlyRate: car.minMonthlyRate
      });
    });

    const total = rows.length;
    const branches = Object.entries(branchMap).map(([name, values]) => ({ name, ...values, pct: values.t ? Math.round(values.r / values.t * 100) : 0 })).sort((a, b) => b.t - a.t);
    return {
      total, ready, notReady, maint: maintenance, out, prepOpen, prepOverdue, expBuckets,
      readyPct: total ? Math.round(ready / total * 1000) / 10 : 0,
      fails: Object.entries(failures).sort((a, b) => b[1] - a[1]).slice(0, 8),
      branches,
      owners: Object.entries(ownerMap).sort((a, b) => b[1] - a[1]),
      acc: accountingIndicators(rows),
      fleetRows
    };
  }


  /* التصدير: بس Shorthand — الأسماء معرّفة فوق. */
  const Core = {
    FILTERS_KEY, PRESETS_KEY, PERIOD_PRESETS,
    storageRead, persistState, getPresets, isoLocal,
    rentalsPeriod, rentedDaysFor, allRentalsForCar, noRentalsNotice,
    periodBounds, periodLabel, periodDate, inPeriod,
    accountingIndicators, aggregateReport
  };

  global.YahmaReportsCore = Core;
})(typeof window !== 'undefined' ? window : this);
