/**
 * modules/reports.js — واجهة التقارير، الفلاتر، المؤشرات، وقوالب التصدير
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
    let active = 0, dailySum = 0, dailyCount = 0, estimateSum = 0, maintenanceCost = 0;
    (list || []).forEach(car => {
      const status = String(car.carStatus || '').trim();
      if (!status.includes('خارج') && !status.includes('مؤرشفة') && !status.includes('مباعة')) active++;
      const dailyRate = parseFloat(car.dailyRate), rentedDays = parseFloat(car.rentedDaysMonth);
      if (!isNaN(dailyRate) && dailyRate > 0) { dailySum += dailyRate; dailyCount++; }
      if (!isNaN(dailyRate) && dailyRate > 0 && !isNaN(rentedDays) && rentedDays >= 0) {
        estimateSum += dailyRate * rentedDays;
      }
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
      hasData: dailyCount > 0
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

    rows.forEach(car => {
      let isReady = false;
      try {
        const result = typeof readiness === 'function' ? readiness(car) : null;
        if (result) {
          isReady = !!result.ready;
          (result.failed || []).forEach(item => {
            const label = (item && (item.label || item.name || item)) || 'أخرى';
            failures[label] = (failures[label] || 0) + 1;
          });
        }
      } catch (_) {}
      if (isReady) ready++; else notReady++;
      if (String(car.carStatus || '').includes('صيانة')) maintenance++;
      if (String(car.carStatus || '').includes('خارج')) out++;

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
    });

    const total = rows.length;
    const branches = Object.entries(branchMap).map(([name, values]) => ({ name, ...values, pct: values.t ? Math.round(values.r / values.t * 100) : 0 })).sort((a, b) => b.t - a.t);
    return {
      total, ready, notReady, maint: maintenance, out, prepOpen, prepOverdue, expBuckets,
      readyPct: total ? Math.round(ready / total * 1000) / 10 : 0,
      fails: Object.entries(failures).sort((a, b) => b[1] - a[1]).slice(0, 8),
      branches,
      owners: Object.entries(ownerMap).sort((a, b) => b[1] - a[1]).slice(0, 6),
      acc: accountingIndicators(rows)
    };
  }

  function formatCurrency(number) { return ((number || 0).toLocaleString('en-US')) + ' ر.س'; }

  // تُثبَّت عند أول استخدام: استدعاء global.YahmaUtils.escapeHtml لكل خلية في
  // جداول التقارير (آلاف الخلايا) يضيف فحص شرط + بحث خاصية في كل مرة.
  let _escapeCached = null;
  function escapeHtml(value) {
    if (!_escapeCached && global.YahmaUtils) _escapeCached = global.YahmaUtils.escapeHtml;
    if (_escapeCached) return _escapeCached(value);
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function reportFileName() {
    const bounds = periodBounds();
    const today = global.YahmaUtils ? global.YahmaUtils.todayStr() : new Date().toISOString().slice(0, 10);
    return global.periodRange?.preset === 'all' ? 'yahma-formal-report-' + today + '.pdf' : 'yahma-formal-report-' + bounds.from + '_to_' + bounds.to + '.pdf';
  }

  function reportTextSummary() {
    const report = global.__lastReportAgg;
    if (!report) return '';
    const lines = [
      '🏛 يهماء لتأجير السيارات — تقرير رسمي',
      '🗓 ' + periodLabel(),
      '🕒 أُنشئ: ' + new Date().toLocaleString('ar-SA'),
      '────────────────',
      '🚗 إجمالي السيارات: ' + report.total,
      '✅ جاهزة: ' + report.ready + ' (' + report.readyPct + '%)',
      '⚠️ غير جاهزة: ' + report.notReady + ' | 🔧 صيانة: ' + report.maint + ' | خارج الخدمة: ' + report.out,
      '📋 مهام مفتوحة: ' + report.prepOpen + ' | متأخرة: ' + report.prepOverdue,
      '📄 مستندات: منتهي ' + report.expBuckets.overdue + ' · خلال 7 أيام ' + report.expBuckets.d7 + ' · خلال 30 يوم ' + report.expBuckets.d30,
      '💰 إيراد شهري متوقع: ' + formatCurrency(report.acc.monthPotential) + ' | تكاليف صيانة: ' + formatCurrency(report.acc.maintCost) + ' | صافي تقديري: ' + formatCurrency(report.acc.netEst),
      '🏢 الفروع:'
    ];
    report.branches.forEach(branch => lines.push('• ' + branch.name + ': ' + branch.pct + '% جاهز (' + branch.r + '/' + branch.t + ')'));
    lines.push('———', '📡 المصدر: منصة يهماء — ملف التقرير الرسمي PDF مرفق');
    return lines.join('\n');
  }

  function formalReportHtml() {
    const report = global.__lastReportAgg;
    if (!report) return '';
    const bounds = periodBounds();
    const generated = new Date();
    const acc = report.acc, buckets = report.expBuckets;
    const kpi = (value, label, cls) => '<div class="fr-kpi ' + (cls || '') + '"><b>' + value + '</b><span>' + label + '</span></div>';
    const row = (label, value) => '<tr><td>' + label + '</td><td class="num">' + value + '</td></tr>';
    const branchRows = report.branches.map(item => '<tr><td>' + escapeHtml(item.name) + '</td><td class="num">' + item.t + '</td><td class="num">' + item.r + '</td><td class="num">' + item.pct + '%</td><td class="num">' + item.ov + '</td></tr>').join('') || '<tr><td colspan="5">لا بيانات ضمن الفترة</td></tr>';
    const failureRows = report.fails.length ? report.fails.map(item => '<tr><td>' + escapeHtml(item[0]) + '</td><td class="num">' + item[1] + '</td></tr>').join('') : '<tr><td colspan="2">لا أسباب مسجلة ضمن الفترة</td></tr>';
    const ownerRows = report.owners.map(item => '<tr><td>' + escapeHtml(item[0]) + '</td><td class="num">' + item[1] + '</td></tr>').join('') || '<tr><td colspan="2">—</td></tr>';
    const isAll = global.periodRange?.preset === 'all';
    const range = isAll ? 'كل الفترات' : bounds.from + ' إلى ' + bounds.to;
    const preset = PERIOD_PRESETS.find(item => item.key === global.periodRange?.preset)?.label || '';
    const branchFilter = report.rf?.branch && report.rf.branch !== 'all' ? report.rf.branch : 'كل الفروع';
    const issueFilter = report.rf?.issue && report.rf.issue !== 'all' ? report.rf.issue : 'الكل';
    const reportNumber = 'YH-' + generated.getFullYear() + String(generated.getMonth() + 1).padStart(2, '0') + String(generated.getDate()).padStart(2, '0') + '-' + String(generated.getHours()).padStart(2, '0') + String(generated.getMinutes()).padStart(2, '0');

    return '<div class="fr-head"><div class="fr-brand"><div class="fr-logo">يهماء</div><div><h1>يهماء لتأجير السيارات</h1><p>تقرير رسمي بمؤشرات الأسطول والجاهزية</p></div></div><div class="fr-head-date">رقم التقرير: ' + reportNumber + '<br>تاريخ الإنشاء: ' + generated.toLocaleString('ar-SA') + '</div></div>' +
      '<div class="fr-body"><div class="fr-meta"><div>فترة التقرير<b>' + range + (preset ? ' (' + preset + ')' : '') + '</b></div><div>نطاق الفلتر<b>الفرع: ' + escapeHtml(branchFilter) + ' · المشكلات: ' + escapeHtml(issueFilter) + '</b></div><div>عدد السجلات المدروسة<b>' + report.total + ' سيارة</b></div></div>' +
      '<div class="fr-sec-title">أولًا: الملخص التنفيذي</div><div class="fr-kpis">' +
      kpi(report.total, 'إجمالي السيارات') + kpi(report.ready + ' (' + report.readyPct + '%)', 'جاهزة للتأجير', 'ok') + kpi(report.notReady, 'غير جاهزة', 'bad') + kpi(report.maint, 'تحت الصيانة', 'warn') + kpi(report.out, 'خارج الخدمة') + kpi(report.prepOpen, 'مهام تجهيز مفتوحة') + kpi(report.prepOverdue, 'مهام متأخرة', report.prepOverdue ? 'bad' : '') + kpi(report.readyPct + '%', 'نسبة الجاهزية العامة', report.readyPct >= 70 ? 'ok' : 'warn') + '</div>' +
      '<div class="fr-sec-title">ثانيًا: المؤشرات المحاسبية (تقديرية)</div><table class="fr-table"><tbody>' +
      row('الإيراد الشهري المتوقع (متوسط السعر اليومي × السيارات النشطة × 30 يوم)', formatCurrency(acc.monthPotential)) + row('الإيراد حسب أيام التأجير المسجلة فعليًا', formatCurrency(acc.estMonthRev)) + row('إجمالي تكاليف الصيانة المسجلة', formatCurrency(acc.maintCost)) + row('صافي الربح التقديري', formatCurrency(acc.netEst)) + row('متوسط الإيراد اليومي للسيارة', formatCurrency(acc.avgDaily)) + row('الإيراد الشهري لكل سيارة', formatCurrency(acc.revPerCar)) + row('السيارات النشطة (باستثناء الخارج والمؤرشفة والمباعة)', acc.active) + row('عدد أيام الفترة', acc.days) +
      '</tbody></table><div class="fr-sec-title">ثالثًا: أداء الفروع</div><table class="fr-table"><thead><tr><th>الفرع</th><th>الأسطول</th><th>جاهز</th><th>نسبة الجاهزية</th><th>مهام متأخرة</th></tr></thead><tbody>' + branchRows + '</tbody></table>' +
      '<div class="fr-sec-title">رابعًا: أسباب عدم الجاهزية</div><table class="fr-table"><thead><tr><th>السبب</th><th>عدد السيارات</th></tr></thead><tbody>' + failureRows + '</tbody></table>' +
      '<div class="fr-sec-title">خامسًا: توزيع الملاك (الأعلى 6)</div><table class="fr-table"><thead><tr><th>المالك</th><th>عدد السيارات</th></tr></thead><tbody>' + ownerRows + '</tbody></table>' +
      '<div class="fr-sec-title">سادسًا: حالة المستندات</div><div class="fr-kpis">' + kpi(buckets.overdue, 'مستندات منتهية', 'bad') + kpi(buckets.d7, 'تنتهي خلال 7 أيام', 'warn') + kpi(buckets.d30, 'تنتهي خلال 30 يوم') + kpi(buckets.d90, 'تنتهي خلال 90 يوم') + '</div>' +
      '<div class="fr-sign"><div><i></i>مسؤول الأسطول — الاسم والتوقيع</div><div><i></i>المدير المسؤول — الاسم والتوقيع</div></div><div class="fr-note">منهجية الإعداد: تُحتسب المؤشرات من بيانات المنصة ضمن الفترة المختارة (فلتر الفترة). المؤشرات المحاسبية تقديرية وتُحتسب من أسعار التأجير اليومية وأيام التأجير المسجلة وتكاليف الصيانة الفعلية المدخلة، والقيم غير المدخلة لا تُفترض. يُرجى مراجعة الأرقام قبل الاعتماد الرسمي.</div></div>' +
      '<div class="fr-foot"><span>منصة يهماء لتأجير السيارات — تقرير مولّد آليًا</span><span>الإصدار v11</span><span>' + generated.toLocaleDateString('ar-SA') + '</span></div>';
  }

  const INFO_COLORS = { navy: '#152350', navy2: '#24356E', navyD: '#0D1836', gold: '#C6952E', goldL: '#E3B24E', goldSoft: '#FBF0D8', green: '#1E9C6B', teal: '#12AAA6', amber: '#D6952A', red: '#CE4B3D', ink: '#152350', muted: '#666E8C', paper: '#F7FBFA', line: '#E2E8F6' };

  function infographicFileName() {
    const bounds = periodBounds();
    const today = global.YahmaUtils ? global.YahmaUtils.todayStr() : new Date().toISOString().slice(0, 10);
    return global.periodRange?.preset === 'all' ? 'yahma-kpi-infographic-' + today + '.png' : 'yahma-kpi-infographic-' + bounds.from + '_to_' + bounds.to + '.png';
  }

  function infographicTextSummary() {
    const report = global.__lastReportAgg;
    if (!report) return '';
    const preset = PERIOD_PRESETS.find(item => item.key === global.periodRange?.preset)?.label || '';
    const lines = [
      '📊 *يهماء — إنفوجرافيك مؤشرات الفترة*',
      '🗓 ' + periodLabel() + (global.periodRange?.preset ? ' (' + preset + ')' : ''),
      '🕒 ' + new Date().toLocaleString('ar-SA'), '———',
      '🚗 إجمالي: ' + report.total + ' سيارة · جاهز ' + report.ready + ' (' + report.readyPct + '%)',
      '✅ جاهز ' + report.ready + ' · ⚠️ غير جاهز ' + report.notReady + ' · 🔧 صيانة ' + report.maint + ' · 🚫 خارج ' + report.out,
      '💰 صافي تقديري: ' + formatCurrency(report.acc.netEst) + ' (الإيراد المتوقع ' + formatCurrency(report.acc.monthPotential) + ' − التكاليف ' + formatCurrency(report.acc.maintCost) + ')'
    ];
    if (report.fails.length) lines.push('📝 أعلى أسباب عدم الجاهزية: ' + report.fails.slice(0, 3).map(item => item[0] + ' (' + item[1] + ')').join(' · '));
    if (report.branches.length) lines.push('🏢 أعلى الفروع جاهزية: ' + report.branches.slice(0, 3).map(item => item.name + ' ' + item.pct + '%').join(' · '));
    lines.push('📄 مستندات منتهية: ' + report.expBuckets.overdue + ' · خلال 7 أيام: ' + report.expBuckets.d7, '———', '📡 المصدر: منصة يهماء — ' + (report.acc.hasData ? 'الأرقام المحاسبية تقديرية من البيانات المسجلة.' : 'أكمل أسعار التأجير وأيامها من نافذة تعديل السيارة لعرض الأرقام المالية.'));
    return lines.join('\n');
  }

  function infographicDonut(total, ready, notReady, maintenance, out) {
    const colors = INFO_COLORS, radius = 62, centerX = 90, centerY = 90, stroke = 22, circumference = 2 * Math.PI * radius;
    const segment = (value, offset) => ({ length: value ? value / total * circumference : 0, offset });
    const readySegment = segment(ready, 0), notReadySegment = segment(notReady, readySegment.length);
    const maintenanceSegment = segment(maintenance, readySegment.length + notReadySegment.length);
    const outSegment = segment(out, readySegment.length + notReadySegment.length + maintenanceSegment.length);
    const arc = (length, offset, color) => '<circle cx="' + centerX + '" cy="' + centerY + '" r="' + radius + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-dasharray="' + length + ' ' + (circumference - length) + '" stroke-dashoffset="' + (-offset + circumference * 0.25) + '" stroke-linecap="butt"/>';
    return '<svg viewBox="0 0 180 180" width="180" height="180"><circle cx="' + centerX + '" cy="' + centerY + '" r="' + radius + '" fill="none" stroke="#EEF3FB" stroke-width="' + stroke + '"/>' + arc(readySegment.length, readySegment.offset, colors.green) + arc(notReadySegment.length, notReadySegment.offset, colors.red) + arc(maintenanceSegment.length, maintenanceSegment.offset, colors.amber) + arc(outSegment.length, outSegment.offset, '#6B7490') + '<text x="' + centerX + '" y="' + (centerY - 6) + '" text-anchor="middle" font-size="32" font-weight="800" fill="' + colors.green + '">' + Math.round(ready / Math.max(1, total) * 100) + '%</text><text x="' + centerX + '" y="' + (centerY + 18) + '" text-anchor="middle" font-size="11" fill="' + colors.muted + '">جاهز</text></svg>';
  }

  function infographicDonutLegend(ready, notReady, maintenance, out, total) {
    return [
      { label: 'جاهز', value: ready, color: '#1E9C6B' },
      { label: 'غير جاهز', value: notReady, color: '#CE4B3D' },
      { label: 'صيانة', value: maintenance, color: '#D6952A' },
      { label: 'خارج الخدمة', value: out, color: '#6B7490' }
    ].map(item => '<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 8px;border-radius:8px;background:#F7FBFA"><i style="width:10px;height:10px;border-radius:3px;background:' + item.color + '"></i><span style="color:#666E8C">' + item.label + '</span><b style="margin-inline-start:auto;color:#152350">' + item.value + '</b><span style="font-size:10.5px;color:#8A93AD">(' + Math.round(item.value / Math.max(1, total) * 100) + '%)</span></div>').join('');
  }

  function infographicHtml() {
    const report = global.__lastReportAgg;
    if (!report) return '';
    const acc = report.acc, buckets = report.expBuckets;
    const tile = (label, value, foot, cls, extra) => '<div class="inf-tile ' + (cls || '') + '"><div class="inf-tile-label"><span>' + label + '</span>' + (extra || '') + '</div><div class="inf-tile-value">' + value + '</div><div class="inf-tile-foot">' + foot + '</div></div>';
    const maxFailure = Math.max(1, ...report.fails.map(item => item[1]));
    const failBars = report.fails.slice(0, 3).map(item => '<div class="inf-fail"><b>' + escapeHtml(item[0]) + '</b><span>' + item[1] + ' سيارة</span><div class="inf-fail-bar"><i style="width:' + Math.round(item[1] / maxFailure * 100) + '%"></i></div></div>').join('') || '<div class="inf-empty" style="color:#8A93AD;font-size:12px">لا أسباب مسجلة في هذه الفترة</div>';
    const branchColors = ['#12AAA6', '#5A34AD', '#C6952E'];
    const branchBars = report.branches.slice(0, 3).map((branch, index) => '<div class="inf-fail"><i style="width:10px;height:10px;background:' + branchColors[index] + ';border-radius:3px"></i><b>' + escapeHtml(branch.name) + '</b><span>' + branch.pct + '% جاهز</span><div class="inf-fail-bar"><i style="width:' + branch.pct + '%;background:' + branchColors[index] + '"></i></div></div>').join('') || '<div style="color:#8A93AD;font-size:12px">لا فروع</div>';
    const bounds = periodBounds(), generated = new Date();
    const isAll = global.periodRange?.preset === 'all';
    const range = isAll ? 'كل الفترات' : bounds.from + ' ← ' + bounds.to;
    const preset = PERIOD_PRESETS.find(item => item.key === global.periodRange?.preset)?.label || 'فترة مخصصة';
    const branchFilter = report.rf?.branch && report.rf.branch !== 'all' ? report.rf.branch : 'كل الفروع';
    const readyLabel = report.readyPct + '%';
    const file2 = buckets.d7 > 0 ? 'warn' : 'ok';

    return '<div class="inf-head"><div><h1>يهماء لتأجير السيارات</h1><div class="ptag">إنفوجرافيك مؤشرات الأداء الرئيسية</div><div class="crumbline">' + escapeHtml(preset) + ' · ' + escapeHtml(range) + ' · الفرع: ' + escapeHtml(branchFilter) + '</div></div><div class="badges"><div class="inf-badge">رقم <b>I-' + String(generated.getFullYear()).slice(-2) + String(generated.getMonth() + 1).padStart(2, '0') + String(generated.getDate()).padStart(2, '0') + '-' + String(generated.getHours()).padStart(2, '0') + String(generated.getMinutes()).padStart(2, '0') + '</b></div><div class="inf-badge">' + generated.toLocaleDateString('ar-SA') + '</div></div></div>' +
      '<div class="inf-body"><div class="inf-hero"><div class="inf-hero-text"><h2>نسبة جاهزية الأسطول</h2><div class="big">' + readyLabel + '<small>جاهز فعليًا</small></div><div class="sub">من إجمالي ' + report.total + ' سيارة ضمن الفترة. ' + report.ready + ' عربية جاهزة للتأجير، ' + report.notReady + ' غير جاهزة، ' + report.maint + ' في الصيانة، ' + report.out + ' خارج الخدمة. مهام تجهيز مفتوحة: ' + report.prepOpen + '، منها ' + report.prepOverdue + ' متأخرة.</div></div><div><div style="display:flex;gap:14px;align-items:center">' + infographicDonut(report.total, report.ready, report.notReady, report.maint, report.out) + '<div style="display:flex;flex-direction:column;gap:6px;flex:1">' + infographicDonutLegend(report.ready, report.notReady, report.maint, report.out, report.total) + '</div></div></div></div>' +
      '<div class="inf-kpi-grid">' + tile('إيراد شهري متوقع', formatCurrency(acc.monthPotential), 'متوسط السعر اليومي × السيارات النشطة × 30 يوم', 'ok', '<span>تقديري</span>') + tile('إيراد فعلي مسجل', formatCurrency(acc.estMonthRev), 'مجموع (السعر × أيام التأجير الفعلية)', 'inf-tile-info', '<span>للفترة</span>') + tile('تكاليف صيانة', formatCurrency(acc.maintCost), 'مجموع تكاليف آخر صيانة المسجلة', 'bad') + tile('صافي تقديري', formatCurrency(acc.netEst), acc.netEst >= 0 ? 'إيراد − تكاليف' : 'انتبه: التكاليف أعلى من الإيراد', acc.netEst >= 0 ? 'ok' : 'bad') + tile('الإيراد لكل سيارة', formatCurrency(acc.revPerCar), 'شهريًا · ' + acc.active + ' نشطة', '') + tile('متوسط السعر اليومي', formatCurrency(acc.avgDaily), 'من أسعار السيارات المسجلة', 'warn') + tile('مهام متأخرة', report.prepOverdue, 'من إجمالي ' + report.prepOpen + ' مفتوحة', report.prepOverdue ? 'bad' : 'ok') + tile('مستندات منتهية', buckets.overdue, 'منتهي فعلًا', buckets.overdue ? 'bad' : 'ok') + '</div>' +
      '<div class="inf-row"><div class="inf-card"><div class="inf-section-title">أعلى أسباب عدم الجاهزية</div><div class="inf-fails">' + failBars + '</div></div><div class="inf-card"><div class="inf-section-title">أداء الفروع (أعلى 3)</div><div class="inf-fails">' + branchBars + '</div></div></div>' +
      '<div class="inf-card"><div class="inf-section-title">حالة المستندات</div><div class="inf-files"><div class="inf-file bad"><b>' + buckets.overdue + '</b><span>منتهية</span></div><div class="inf-file warn"><b>' + buckets.d7 + '</b><span>خلال 7 أيام</span></div><div class="inf-file ' + file2 + '"><b>' + buckets.d30 + '</b><span>خلال 30 يوم</span></div><div class="inf-file ok"><b>' + buckets.d90 + '</b><span>خلال 90 يوم</span></div></div></div></div>' +
      '<div class="inf-foot"><span>منصة يهماء لتأجير السيارات — إنفوجرافيك مولّد آليًا</span><span>الإصدار v12</span><span>' + generated.toLocaleString('ar-SA') + '</span></div>';
  }

function defaultReportFleet(){
  try{ return (typeof fleet!=='undefined' && Array.isArray(fleet)) ? fleet : []; }catch(_){ return []; }
}

function renderReports(content, context){
  // الاستدعاءات الداخلية (الفلاتر/التحديث/المحفوظ) لا تمرر سياقًا — وفّر الافتراضيات من النطاق العام
  const c = context || {};
  const fleet = Array.isArray(c.fleet) ? c.fleet : defaultReportFleet();
  const REPORT_PRESETS_KEY = c.presetsKey || PRESETS_KEY;
  const SND_SKEY = c.scheduleKey || ((window.YahmaEmailSchedule && window.YahmaEmailSchedule.scheduleKey) || 'fleet-schedule-v1');
  const today = new Date();
  today.setHours(0,0,0,0);
  const expFields = ['cardExpiry','licenseExpiry','insuranceExpiry','inspectionExpiry','nextService'];
  const daysFrom = value => {
    if(!value) return null;
    const date=new Date(value);
    if(isNaN(date)) return null;
    date.setHours(0,0,0,0);
    return Math.round((date-today)/86400000);
  };
  document.getElementById('topbar-title').textContent = 'التقارير';
  document.getElementById('topbar-sub').textContent = 'داشبورد تحليلي تفاعلي — ' + periodLabel();

  const rf = window.reportFilters || (window.reportFilters = {branch:'all', owner:'all', status:'all', issue:'all', range:'30'});
  const all = Array.isArray(fleet) ? fleet : [];
  const uniq = field => [...new Set(all.map(c => String(c[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));

  const issueMatch = (c, issue) => {
    if(!issue || issue==='all') return true;
    try{
      if(issue==='card') return (typeof dateStatus==='function' ? dateStatus(c.cardExpiry).level!=='green' : false) || ['ملغى','موقوف'].includes(String(c.cardStatus||'').trim());
      if(issue==='license') return typeof dateStatus==='function' && dateStatus(c.licenseExpiry).level!=='green';
      if(issue==='inspection') return typeof inspectionDisplayStatus==='function' && inspectionDisplayStatus(c.inspectionStatus).level!=='green';
      if(issue==='insurance') return typeof textTag==='function' && textTag(c.insuranceStatus).level!=='green';
      if(issue==='maintenance') return String(c.carStatus||'').includes('صيانة');
      if(issue==='out') return String(c.carStatus||'').includes('خارج');
      if(issue==='notready') return typeof vehicleReadiness==='function' ? !vehicleReadiness(c).ready : false;
    }catch(e){}
    return true;
  };

  const list = all.filter(c =>
    inPeriod(c) &&
    (!rf.branch || rf.branch==='all' || String(c.branch||'')===rf.branch) &&
    (!rf.owner || rf.owner==='all' || String(c.owner||'')===rf.owner) &&
    (!rf.status || rf.status==='all' || String(c.carStatus||'')===rf.status) &&
    issueMatch(c, rf.issue)
  );
  window._yahmaCurrentPdfData=()=>({title:'التقرير التحليلي المفلتر',subtitle:'الفترة: '+periodLabel()+' — عدد السيارات: '+list.length,headers:['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','الحالة','الجاهزية','انتهاء الرخصة','انتهاء الكارت'],rows:list.map(c=>{let ready='غير جاهزة';try{ready=vehicleReadiness(c).label}catch(e){}return[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',ready,c.licenseExpiry||'—',c.cardExpiry||'—']})});

  const {total, ready, notReady, maint, out, prepOpen, prepOverdue, expBuckets, readyPct, fails, branches, owners, acc} = window.YahmaReports.aggregateReport(list, vehicleReadiness);
  const pct = (n,d=total) => d ? Math.round(n/d*1000)/10 : 0;
  const activeCars=list.filter(c=>!String(c.carStatus||'').includes('صيانة')&&!String(c.carStatus||'').includes('خارج')&&!['مباعة','مؤرشفة'].includes(String(c.carStatus||'')));
  const rentedDaysTotal=list.reduce((sum,c)=>{const n=parseFloat(c.rentedDaysMonth);return sum+(isNaN(n)?0:Math.max(0,n));},0);
  const utilizationPct=activeCars.length?Math.round(rentedDaysTotal/(activeCars.length*30)*1000)/10:0;
  const serviceDue=list.filter(c=>{const d=daysFrom(c.nextService);return d!==null&&d<=30;}).length;
  const workshopMap={};
  list.filter(c=>String(c.carStatus||'').includes('صيانة')).forEach(c=>{const w=String(c.workshop||'غير محددة').trim()||'غير محددة';workshopMap[w]=(workshopMap[w]||0)+1;});
  const topWorkshops=Object.entries(workshopMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topRevenueCars=activeCars.map(c=>({car:c,revenue:(parseFloat(c.dailyRate)||0)*(parseFloat(c.rentedDaysMonth)||0)})).filter(x=>x.revenue>0).sort((a,b)=>b.revenue-a.revenue).slice(0,5);

  // ---- تقرير المستندات التفصيلي: حسب النوع والنطاق ----
  const DOC_TYPES=[
    {key:'cardExpiry',label:'البطاقة'},
    {key:'licenseExpiry',label:'الرخصة'},
    {key:'insuranceExpiry',label:'التأمين'},
    {key:'inspectionExpiry',label:'الفحص'}
  ];
  const DOC_BUCKETS=[
    {key:'over',label:'منتهي',cls:'bad'},
    {key:'d7',label:'خلال 7 أيام',cls:'warn'},
    {key:'d30',label:'خلال 30 يوم',cls:'info'},
    {key:'d90',label:'خلال 90 يوم',cls:''}
  ];
  function docBucketOf(days){
    if(days===null||days===undefined||isNaN(days)) return null;
    if(days<0) return 'over';
    if(days<=7) return 'd7';
    if(days<=30) return 'd30';
    if(days<=90) return 'd90';
    return null;
  }
  const docDetail=DOC_TYPES.map(dt=>{
    const buckets={over:[],d7:[],d30:[],d90:[]};
    list.forEach(c=>{ const b=docBucketOf(daysFrom(c[dt.key])); if(b) buckets[b].push(c); });
    return {key:dt.key,label:dt.label,buckets};
  });
  const docBranchMap={};
  list.forEach(c=>{
    const br=String(c.branch||'غير محدد').trim()||'غير محدد';
    DOC_TYPES.forEach(dt=>{ if(docBucketOf(daysFrom(c[dt.key]))==='over') docBranchMap[br]=(docBranchMap[br]||0)+1; });
  });
  const topDocBranches=Object.entries(docBranchMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxFail = Math.max(1, ...fails.map(x=>x[1]), 1);
  const maxBranch = Math.max(1, ...branches.map(x=>x.t), 1);

    const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ---- Weekly trend (from prep task dates) ----
  const weekStats = [];
  for(let w=7; w>=0; w--){
    const end = new Date(today); end.setDate(end.getDate() - w*7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    let done=0, late=0, expSoon=0;
    list.forEach(c=>{
      (c.prepTasks||[]).forEach(task=>{
        const completed = task.completedAt || task.doneDate || (task.status==='done' ? task.dueDate : null);
        if(completed){
          const d = new Date(completed);
          if(!isNaN(d) && d>=start && d<=end) done++;
        }
        if(task.status!=='done' && task.dueDate){
          const d = new Date(task.dueDate);
          if(!isNaN(d) && d>=start && d<=end && d < today) late++;
        }
      });
      ['cardExpiry','licenseExpiry','insuranceExpiry','inspectionExpiry'].forEach(f=>{
        if(!c[f]) return;
        const d = new Date(c[f]);
        if(!isNaN(d) && d>=start && d<=end) expSoon++;
      });
    });
    const label = start.toLocaleDateString('ar-SA', {month:'numeric', day:'numeric'});
    weekStats.push({label, done, late, expSoon});
  }
  const maxWeek = Math.max(1, ...weekStats.map(w => w.done + w.late + w.expSoon));
  const weekBars = weekStats.map(w => {
    const h = Math.max(4, Math.round(((w.done+w.late+w.expSoon)/maxWeek)*110));
    const dH = Math.round((w.done/maxWeek)*110);
    const lH = Math.round((w.late/maxWeek)*110);
    const eH = Math.round((w.expSoon/maxWeek)*110);
    return `<div class="rd-week-col" title="${esc(w.label)}: مكتمل ${w.done} · متأخر ${w.late} · مستندات ${w.expSoon}">
      <div class="rd-week-stack" style="height:${h}px">
        <i class="d" style="height:${dH}px"></i>
        <i class="l" style="height:${lH}px"></i>
        <i class="e" style="height:${eH}px"></i>
      </div>
      <span>${esc(w.label)}</span>
    </div>`;
  }).join('');

  window.__lastReportAgg = {total, ready, notReady, maint, out, prepOpen, prepOverdue, expBuckets, readyPct, fails, branches, owners, acc, rf};
  const topBranches = branches.slice(0, 5);
  const maxPct = Math.max(1, ...topBranches.map(b => b.pct));
  const branchCompare = topBranches.length ? topBranches.map(b => `
    <div class="rd-cmp-row">
      <div class="rd-cmp-label">${esc(b.name)}</div>
      <div class="rd-cmp-bars">
        <div class="rd-cmp-bar ready" style="width:${b.pct}%" title="جاهز ${b.pct}%"><span>${b.pct}%</span></div>
        <div class="rd-cmp-bar gap" style="width:${100-b.pct}%"></div>
      </div>
      <div class="rd-cmp-meta">${b.r}/${b.t} · متأخر ${b.ov}</div>
    </div>`).join('') : '<div class="rd-empty">لا فروع</div>';


  const branchOpts = uniq('branch').map(b=>`<option value="${esc(b)}" ${rf.branch===b?'selected':''}>${esc(b)}</option>`).join('');
  const ownerOpts = uniq('owner').map(b=>`<option value="${esc(b)}" ${rf.owner===b?'selected':''}>${esc(b)}</option>`).join('');
  const statusOpts = uniq('carStatus').map(b=>`<option value="${esc(b)}" ${rf.status===b?'selected':''}>${esc(b)}</option>`).join('');
  const reportPresets=getReportPresets();

  // SVG donut
  const r0=42, c0=2*Math.PI*r0;
  const readyLen = total ? (ready/total)*c0 : 0;
  const notLen = total ? (notReady/total)*c0 : 0;
  const donut = `<svg class="rd-donut-svg" viewBox="0 0 120 120" width="140" height="140">
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#E8EEF5" stroke-width="14"/>
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#12AAA6" stroke-width="14"
      stroke-dasharray="${readyLen} ${c0-readyLen}" stroke-dashoffset="${c0*0.25}" stroke-linecap="round"
      class="rd-arc" style="--len:${readyLen}"/>
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#CE4B3D" stroke-width="14"
      stroke-dasharray="${notLen} ${c0-notLen}" stroke-dashoffset="${c0*0.25 - readyLen}" stroke-linecap="round"
      class="rd-arc" style="--len:${notLen}"/>
    <text x="60" y="56" text-anchor="middle" font-size="18" font-weight="800" fill="#0A5F5D">${readyPct}%</text>
    <text x="60" y="74" text-anchor="middle" font-size="10" fill="#666E8C">جاهز</text>
  </svg>`;

  content.innerHTML = `
  <div class="rd-shell" id="reports-dashboard">
    <div class="rd-toolbar">
      <div class="rd-filters">
        <select id="rd-period" aria-label="فترة التقرير" title="فترة التقرير">${PERIOD_PRESETS.map(p=>`<option value="${p.key}" ${(window.periodRange.preset||'thisMonth')===p.key?'selected':''}>${p.label}</option>`).join('')}</select>
        <input type="date" id="rd-from" value="${esc((periodBounds().from==='1900-01-01'?'':periodBounds().from))}" style="display:none" title="من تاريخ">
        <input type="date" id="rd-to" value="${esc(periodBounds().to)}" style="display:none" title="إلى تاريخ">
        <select id="rd-wa-tpl" class="rd-wa-tpl" aria-label="قالب الرسالة" title="قالب الرسالة">
          <option value="daily">قالب: تقرير اليوم</option>
          <option value="monthly">قالب: الملخص الشهري</option>
          <option value="docs">قالب: تنبيه المستندات</option>
          <option value="branch">قالب: تقرير فرع</option>
        </select>
        <select id="rd-branch" aria-label="الفرع"><option value="all">كل الفروع</option>${branchOpts}</select>
        <select id="rd-owner" aria-label="المالك"><option value="all">كل الملاك</option>${ownerOpts}</select>
        <select id="rd-status" aria-label="الحالة"><option value="all">كل الحالات</option>${statusOpts}</select>
        <select id="rd-issue" aria-label="نوع المشكلة">
          <option value="all" ${rf.issue==='all'?'selected':''}>كل المشاكل</option>
          <option value="notready" ${rf.issue==='notready'?'selected':''}>غير جاهز</option>
          <option value="card" ${rf.issue==='card'?'selected':''}>البطاقة</option>
          <option value="license" ${rf.issue==='license'?'selected':''}>الرخصة</option>
          <option value="inspection" ${rf.issue==='inspection'?'selected':''}>الفحص</option>
          <option value="insurance" ${rf.issue==='insurance'?'selected':''}>التأمين</option>
          <option value="maintenance" ${rf.issue==='maintenance'?'selected':''}>صيانة</option>
          <option value="out" ${rf.issue==='out'?'selected':''}>خارج الخدمة</option>
        </select>
        <select id="rd-saved-filter" aria-label="استعادة فلتر محفوظ" title="استعادة فلتر محفوظ">
          <option value="">اختر فلترًا محفوظًا (${reportPresets.length})</option>
          ${reportPresets.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-ghost btn-small" id="rd-load-filter" ${reportPresets.length?'':'disabled'}>تطبيق المحفوظ</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-save-filter">حفظ الفلتر</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-delete-filter" ${reportPresets.length?'':'disabled'} title="حذف الفلتر المحدد">حذف المحفوظ</button>
      </div>
      <div class="rd-actions">
        <button type="button" class="btn btn-ghost btn-small" id="rd-refresh">↻ تحديث</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-audit">سجل النشاط</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-wa-copy">📋 نسخ</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-formal">📑 تقرير رسمي</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-infog">📊 إنفوجرافيك</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-wa">واتساب</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-mail">إيميل</button>
        ${window.currentRole==='admin'?'<button type="button" class="btn btn-primary btn-small" id="rd-broadcast">✉ تعميم للمستخدمين</button>':''}
        <button type="button" class="btn btn-ghost btn-small" id="rd-excel">Excel</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-pdf">PDF</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-shot">لقطة</button>
      </div>
    </div>
    <div class="rd-filter-status" id="rd-filter-status" aria-live="polite"></div>

    <div id="snd-banner"></div>

    <div class="rd-card rd-3d rd-acct-card">
      <div class="rd-card-h"><h3>مؤشرات محاسبية</h3><span class="rd-chip">تقديرية · ضمن الفترة</span></div>
      <div class="rd-acct">
        <div class="rd-acct-item ok"><b>${fmtSAR(acc.monthPotential)}</b><span>إيراد شهري متوقع</span><small>متوسط السعر اليومي × السيارات النشطة × 30 يوم</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.estMonthRev)}</b><span>إيراد حسب أيام التأجير</span><small>مجموع (السعر × الأيام المسجلة لكل سيارة)</small></div>
        <div class="rd-acct-item warn"><b>${fmtSAR(acc.maintCost)}</b><span>تكاليف صيانة مسجلة</span><small>مجموع «تكلفة آخر صيانة»</small></div>
        <div class="rd-acct-item ${acc.netEst>=0?'ok':'bad'}"><b>${fmtSAR(acc.netEst)}</b><span>صافي تقديري</span><small>الإيراد المتوقع − التكاليف</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.avgDaily)}</b><span>متوسط الإيراد اليومي</span><small>لكل سيارة</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.revPerCar)}</b><span>الإيراد لكل سيارة</span><small>شهريًا</small></div>
        <div class="rd-acct-item"><b>${acc.active}</b><span>سيارات نشطة</span><small>باستثناء خارج الخدمة/المؤرشفة/المباعة</small></div>
        <div class="rd-acct-item"><b>${acc.days}</b><span>أيام الفترة</span><small>${esc(periodLabel())}</small></div>
      </div>
      ${acc.hasData?'':'<div class="rd-empty" style="margin-top:8px">لأرقام أدق: أدخل «سعر التأجير اليومي» و«أيام التأجير هذا الشهر» من نافذة تعديل كل سيارة — الأرقام الحالية تقديرية من الأسعار المسجلة فقط.</div>'}
    </div>

    <div class="rd-grid rd-new-report-grid">
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>تقرير الاستغلال والإيراد المتوقع</h3><span class="rd-chip">جديد</span></div>
        <div class="rd-acct">
          <div class="rd-acct-item ok"><b>${activeCars.length}</b><span>سيارات نشطة</span><small>قابلة للتأجير ضمن الفلتر</small></div>
          <div class="rd-acct-item"><b>${utilizationPct}%</b><span>متوسط الاستغلال</span><small>${rentedDaysTotal} يوم تأجير مسجل</small></div>
          <div class="rd-acct-item warn"><b>${fmtSAR(acc.estMonthRev)}</b><span>إيراد مسجل</span><small>السعر × أيام التأجير</small></div>
        </div>
        <div class="rd-report-list">${topRevenueCars.length?topRevenueCars.map(x=>`<div><span>${esc(x.car.plate||'—')} · ${esc(x.car.branch||'—')}</span><b>${fmtSAR(x.revenue)}</b></div>`).join(''):'<div class="rd-empty">أدخل السعر وأيام التأجير لعرض أعلى السيارات إيرادًا.</div>'}</div>
      </div>
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>تقرير الصيانة</h3><span class="rd-chip">إجراءات قريبة</span></div>
        <div class="rd-acct">
          <div class="rd-acct-item warn"><b>${maint}</b><span>تحت الصيانة</span><small>ضمن الفترة الحالية</small></div>
          <div class="rd-acct-item bad"><b>${fmtSAR(acc.maintCost)}</b><span>تكلفة مسجلة</span><small>آخر صيانة</small></div>
          <div class="rd-acct-item ${serviceDue?'bad':'ok'}"><b>${serviceDue}</b><span>صيانة خلال 30 يوم</span><small>حسب الموعد القادم</small></div>
        </div>
        <div class="rd-report-list">${topWorkshops.length?topWorkshops.map(([name,count])=>`<div><span>${esc(name)}</span><b>${count} سيارة</b></div>`).join(''):'<div class="rd-empty">لا توجد سيارات تحت الصيانة ضمن الفلتر.</div>'}</div>
      </div>
    </div>

    <div class="rd-kpis">
      <div class="rd-kpi rd-3d" data-tip="إجمالي الأسطول ضمن الفلتر"><div class="rd-kpi-ico">🚗</div><b>${total}</b><span>إجمالي السيارات</span></div>
      <div class="rd-kpi rd-3d ok" data-tip="جاهزة للتأجير"><div class="rd-kpi-ico">✅</div><b>${ready}</b><span>جاهزة · ${readyPct}%</span></div>
      <div class="rd-kpi rd-3d bad" data-tip="غير جاهزة"><div class="rd-kpi-ico">⚠️</div><b>${notReady}</b><span>غير جاهزة · ${pct(notReady)}%</span></div>
      <div class="rd-kpi rd-3d warn" data-tip="قيد الصيانة"><div class="rd-kpi-ico">🔧</div><b>${maint}</b><span>صيانة</span></div>
      <div class="rd-kpi rd-3d" data-tip="مهام تجهيز مفتوحة"><div class="rd-kpi-ico">📋</div><b>${prepOpen}</b><span>مهام مفتوحة</span></div>
      <div class="rd-kpi rd-3d bad" data-tip="مهام متأخرة عن الاستحقاق"><div class="rd-kpi-ico">⏰</div><b>${prepOverdue}</b><span>مهام متأخرة</span></div>
    </div>

    <div class="rd-grid">
      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>الجاهزية</h3><span class="rd-chip">${total} سيارة</span></div>
        <div class="rd-donut-row">
          ${donut}
          <div class="rd-legend">
            <div class="rd-leg"><i style="background:#12AAA6"></i> جاهز <b>${ready}</b></div>
            <div class="rd-leg"><i style="background:#CE4B3D"></i> غير جاهز <b>${notReady}</b></div>
            <div class="rd-leg"><i style="background:#D6952A"></i> صيانة <b>${maint}</b></div>
            <div class="rd-leg"><i style="background:#6B7490"></i> خارج الخدمة <b>${out}</b></div>
            <div class="rd-meter"><span>نسبة الجاهزية</span><div class="rd-meter-track"><i style="width:${readyPct}%"></i></div><b>${readyPct}%</b></div>
          </div>
        </div>
      </div>

      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>انتهاء المستندات</h3></div>
        <div class="rd-exp">
          <div class="rd-exp-row bad"><span>منتهي</span><b>${expBuckets.overdue}</b></div>
          <div class="rd-exp-row warn"><span>خلال 7 أيام</span><b>${expBuckets.d7}</b></div>
          <div class="rd-exp-row info"><span>خلال 30 يوم</span><b>${expBuckets.d30}</b></div>
          <div class="rd-exp-row"><span>خلال 90 يوم</span><b>${expBuckets.d90}</b></div>
        </div>
      </div>

      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>تفاصيل المستندات</h3><span class="rd-chip">حسب النوع والنطاق — اضغط أي رقم للتفاصيل</span></div>
        <div class="rd-doc-table" role="table" aria-label="تفاصيل المستندات حسب النوع">
          <div class="rd-doc-h" role="row"><span>المستند</span><span>منتهي</span><span>7 أيام</span><span>30 يوم</span><span>90 يوم</span></div>
          ${docDetail.map(d=>`
          <div class="rd-doc-r" role="row">
            <span>${esc(d.label)}</span>
            ${DOC_BUCKETS.map(b=>`<button type="button" class="rd-doc-cell ${b.cls}" data-doc="${d.key}" data-bucket="${b.key}" aria-label="${esc(d.label)} — ${esc(b.label)}: ${d.buckets[b.key].length}">${d.buckets[b.key].length}</button>`).join('')}
          </div>`).join('')}
        </div>
        <div class="rd-report-list">${topDocBranches.length?topDocBranches.map(([name,count])=>`<div class="rd-doc-branch" data-branch="${esc(name)}" role="button" tabindex="0" aria-label="مستندات منتهية في فرع ${esc(name)}: ${count}"><span>مستندات منتهية · ${esc(name)}</span><b>${count}</b></div>`).join(''):'<div class="rd-empty">لا مستندات منتهية ضمن الفلتر.</div>'}</div>
      </div>

      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>أسباب عدم الجاهزية</h3></div>
        <div class="rd-bars">
          ${fails.length?fails.map(([lb,n])=>`
            <div class="rd-bar-row" title="${esc(lb)}">
              <span>${esc(lb)}</span>
              <div class="rd-bar-track"><i style="width:${Math.round(n/maxFail*100)}%"></i></div>
              <b>${n}</b>
            </div>`).join(''):'<div class="rd-empty">لا أسباب ضمن الفلتر</div>'}
        </div>
      </div>

      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>أداء الفروع</h3></div>
        <div class="rd-branch-table">
          <div class="rd-bt-h"><span>الفرع</span><span>الأسطول</span><span>الجاهز</span><span>النسبة</span><span>متأخر</span></div>
          ${branches.length?branches.map(b=>`
            <div class="rd-bt-r">
              <span>${esc(b.name)}</span>
              <span>${b.t}</span>
              <span>${b.r}</span>
              <span><div class="rd-mini"><i style="width:${b.pct}%"></i></div> ${b.pct}%</span>
              <span class="${b.ov?'rd-hot':''}">${b.ov}</span>
            </div>`).join(''):'<div class="rd-empty">لا بيانات</div>'}
        </div>
      </div>

      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>توزيع الملاك</h3></div>
        <div class="rd-bars">
          ${owners.map(([n,c])=>`
            <div class="rd-bar-row">
              <span>${esc(n)}</span>
              <div class="rd-bar-track"><i style="width:${Math.round(c/Math.max(1,owners[0][1])*100)}%;background:linear-gradient(90deg,#5a34ad,#7a4fd6)"></i></div>
              <b>${c}</b>
            </div>`).join('')||'<div class="rd-empty">—</div>'}
        </div>
      </div>
    </div>

    <div class="rd-grid rd-grid-bottom">
      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>الاتجاه الأسبوعي (تقريبي)</h3><span class="rd-chip">آخر 8 أسابيع</span></div>
        <div class="rd-week-chart" id="rd-week-chart">${weekBars}</div>
        <div class="rd-week-legend">
          <span><i style="background:#12AAA6"></i> مهام مكتملة</span>
          <span><i style="background:#CE4B3D"></i> مهام متأخرة</span>
          <span><i style="background:#D6952A"></i> مستندات قاربت</span>
        </div>
      </div>
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>مقارنة الفروع</h3><span class="rd-chip">جاهزية جنب بعض</span></div>
        <div class="rd-compare" id="rd-branch-compare">${branchCompare}</div>
      </div>
    </div>

    <div class="rd-card rd-3d rd-summary" id="rd-summary-card">
      <div class="rd-card-h"><h3>ملخص تنفيذي للمشاركة</h3><span class="rd-chip">واتساب / إيميل / PDF</span></div>
      <pre class="rd-summary-text" id="rd-summary-text">تقرير يهماء — منصة تحضير الأسطول
التاريخ: ${new Date().toLocaleString('ar-SA')}
الفترة: ${periodLabel()}
────────────────
إجمالي السيارات ضمن الفترة: ${total}
جاهزة: ${ready} (${readyPct}%)
غير جاهزة: ${notReady}
صيانة: ${maint} · خارج الخدمة: ${out}
مهام مفتوحة: ${prepOpen} · متأخرة: ${prepOverdue}
مستندات منتهية: ${expBuckets.overdue} · خلال 7 أيام: ${expBuckets.d7}
${acc.hasData?`مؤشرات محاسبية (تقديرية):
• إيراد شهري متوقع: ${fmtSAR(acc.estMonthRev||acc.monthPotential)}
• تكاليف صيانة: ${fmtSAR(acc.maintCost)}
• صافي تقديري: ${fmtSAR(acc.netEst)}`:'مؤشرات محاسبية: أدخل سعر التأجير اليومي وأيام التأجير من نافذة تعديل السيارة لعرض الأرقام'}
${branches.slice(0,5).map(b=>`• ${b.name}: ${b.pct}% جاهز (${b.r}/${b.t})`).join('\n')}
────────────────
فلتر: فرع=${rf.branch||'الكل'} · مشكلة=${rf.issue||'الكل'}
</pre>
    </div>
  </div>

    <div class="rd-card rd-3d snd-card">
      <div class="rd-card-h"><h3>📬 الإرسال المجدول وقائمة المستلمين</h3><span class="rd-chip">إرسال آلي من الخادم</span></div>
      <div class="snd-controls">
        <label><input type="checkbox" id="snd-en"> الجدولة مفعّلة</label>
        <label>تقرير يومي الساعة <input type="time" id="snd-daily-time" value="07:00"></label>
        <label>مستندات أسبوعي كل
          <select id="snd-weekly-day">
            <option value="0">الأحد</option><option value="1">الاثنين</option><option value="2">الثلاثاء</option><option value="3">الأربعاء</option><option value="4">الخميس</option><option value="5">الجمعة</option><option value="6">السبت</option>
          </select>
          الساعة <input type="time" id="snd-weekly-time" value="08:00"></label>
        <button type="button" class="btn btn-primary btn-small" id="snd-save-sched">حفظ الجدولة</button>
        <button type="button" class="btn btn-ghost btn-small" id="snd-mail-all">✉ فتح بريد للمستخدمين</button>
      </div>
      <div class="snd-form">
        <div class="fld"><label for="snd-name">الاسم</label><input id="snd-name" placeholder="مثال: مدير العمليات"></div>
        <div class="fld"><label for="snd-role">الدور</label><select id="snd-role"><option value="admin">مدير — كل الفروع</option><option value="branch">مشرف فرع</option></select></div>
        <div class="fld"><label for="snd-branch">الفرع (لمشرف الفرع)</label><input id="snd-branch" list="snd-branch-list" placeholder="اتركه فارغًا للمدير"><datalist id="snd-branch-list">${branchOpts}</datalist></div>
        <div class="fld"><label for="snd-phone">جوال واتساب</label><input id="snd-phone" dir="ltr" placeholder="9665xxxxxxxx"></div>
        <div class="fld"><label for="snd-email">البريد</label><input id="snd-email" dir="ltr" type="email" placeholder="name@company.com"></div>
        <div class="fld"><label>يستلم</label>
          <div style="display:flex;gap:10px">
            <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="snd-gets-daily" checked> يومي</label>
            <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="snd-gets-docs"> مستندات أسبوعي</label>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-small" id="snd-add">＋ إضافة مستلم</button>
      </div>
      <div class="snd-rows" id="snd-rows"></div>
      <div id="snd-batch" style="margin-top:12px"></div>
      <div class="rd-card-h" style="margin-top:14px"><h3>سجل الإرسال</h3><span class="rd-chip">آخر 20 عملية</span></div>
      <div class="snd-log" id="snd-log-rows"></div>
      <div class="snd-empty" id="snd-schedule-status">تصل التقارير المجدولة إلى جميع حسابات المنصة التي لديها بريد، حتى عند إغلاق المنصة. فعّل الجدولة واحفظها لبدء الإرسال. (الإرسال التلقائي يتطلب نشر دالة send-user-email وإعداد مفاتيح Resend — راجع README)</div>
    </div>`;

  const applyFilters = () => {
    window.periodRange.preset = document.getElementById('rd-period')?.value || 'thisMonth';
    if(window.periodRange.preset==='custom'){
      window.periodRange.from = document.getElementById('rd-from')?.value || '';
      window.periodRange.to   = document.getElementById('rd-to')?.value || '';
    }
    window.reportFilters = {
      branch: document.getElementById('rd-branch').value,
      owner: document.getElementById('rd-owner').value,
      status: document.getElementById('rd-status').value,
      issue: document.getElementById('rd-issue').value,
      range: rf.range||'30'
    };
    persistReportState();
    renderReports(content);
  };
  const activeFilterLabels=()=>{
    const labels=[];
    if(rf.branch&&rf.branch!=='all') labels.push('الفرع: '+rf.branch);
    if(rf.owner&&rf.owner!=='all') labels.push('المالك: '+rf.owner);
    if(rf.status&&rf.status!=='all') labels.push('الحالة: '+rf.status);
    if(rf.issue&&rf.issue!=='all') labels.push('المشكلة: '+({notready:'غير جاهز',card:'البطاقة',license:'الرخصة',inspection:'الفحص',insurance:'التأمين',maintenance:'صيانة',out:'خارج الخدمة'}[rf.issue]||rf.issue));
    if(window.periodRange.preset!=='thisMonth') labels.push('الفترة: '+(PERIOD_PRESETS.find(p=>p.key===window.periodRange.preset)?.label||'مخصصة'));
    return labels;
  };
  const updateFilterStatus=()=>{
    const box=document.getElementById('rd-filter-status');
    if(!box) return;
    const labels=activeFilterLabels();
    box.innerHTML=`<span>${list.length} سيارة${labels.length?' · '+labels.length+' فلاتر نشطة':''}</span>${labels.length?`<span class="rd-filter-chips">${labels.map(label=>`<span class="rd-filter-chip">${esc(label)}</span>`).join('')}</span>`:''}<button type="button" class="btn btn-ghost btn-small" id="rd-clear-filters" ${labels.length?'':'disabled'}>إعادة ضبط الفلاتر</button>`;
    box.querySelector('#rd-clear-filters')?.addEventListener('click',()=>{
      window.reportFilters={branch:'all',owner:'all',status:'all',issue:'all',range:'30'};
      window.periodRange={preset:'thisMonth',from:'',to:''};
      persistReportState();
      renderReports(content);
    });
  };
  updateFilterStatus();
  ['rd-branch','rd-owner','rd-status','rd-issue','rd-period'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.onchange=applyFilters;
  });
  const syncCustomDates = ()=>{
    const per=document.getElementById('rd-period'); const f=document.getElementById('rd-from'); const t=document.getElementById('rd-to');
    if(!per||!f||!t) return;
    if(per.value==='custom'){ f.style.display=''; t.style.display=''; if(!f.value) f.value=periodBounds().from; if(!t.value) t.value=periodBounds().to; }
    else { f.style.display='none'; t.style.display='none'; }
  };
  syncCustomDates();
  const perEl=document.getElementById('rd-period'); if(perEl) perEl.addEventListener('change', syncCustomDates);
  ['rd-from','rd-to'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change', ()=>{ if((window.periodRange.preset||'')==='custom') applyFilters(); }); });
  const savedFilterSelect=document.getElementById('rd-saved-filter');
  const applySavedFilter=()=>{
    if(!savedFilterSelect?.value){ alert('اختر فلترًا محفوظًا أولًا.'); return; }
    const index=Number(savedFilterSelect.value);
    const preset=getReportPresets()[index];
    if(!preset){ alert('الفلتر المحفوظ لم يعد متاحًا.'); return; }
    window.reportFilters={...preset.filters};
    window.periodRange={...preset.period};
    persistReportState();
    renderReports(content);
  };
  document.getElementById('rd-load-filter')?.addEventListener('click',applySavedFilter);
  document.getElementById('rd-save-filter')?.addEventListener('click',()=>{
    applyFiltersFromControls();
    const name=prompt('اكتب اسمًا واضحًا لهذا الفلتر:');
    if(!name||!name.trim()) return;
    const presets=getReportPresets();
    const entry={name:name.trim(),filters:{...window.reportFilters},period:{...window.periodRange}};
    const existing=presets.findIndex(p=>p.name.toLocaleLowerCase()===entry.name.toLocaleLowerCase());
    if(existing>=0) presets[existing]=entry; else presets.push(entry);
    try{ localStorage.setItem(REPORT_PRESETS_KEY,JSON.stringify(presets)); }
    catch(e){ alert('تعذر حفظ الفلتر في هذا المتصفح.'); return; }
    renderReports(content);
  });
  function applyFiltersFromControls(){
    window.periodRange.preset = document.getElementById('rd-period')?.value || 'thisMonth';
    if(window.periodRange.preset==='custom'){
      window.periodRange.from = document.getElementById('rd-from')?.value || '';
      window.periodRange.to = document.getElementById('rd-to')?.value || '';
    }
    window.reportFilters={
      branch:document.getElementById('rd-branch')?.value||'all',
      owner:document.getElementById('rd-owner')?.value||'all',
      status:document.getElementById('rd-status')?.value||'all',
      issue:document.getElementById('rd-issue')?.value||'all',
      range:rf.range||'30'
    };
    persistReportState();
  }
  document.getElementById('rd-delete-filter')?.addEventListener('click',()=>{
    if(!savedFilterSelect?.value){ alert('اختر فلترًا محفوظًا لحذفه أولًا.'); return; }
    const index=Number(savedFilterSelect?.value);
    const presets=getReportPresets();
    if(!Number.isInteger(index)||!presets[index]){ alert('اختر فلترًا محفوظًا لحذفه أولًا.'); return; }
    if(!confirm(`حذف الفلتر «${presets[index].name}»؟`)) return;
    presets.splice(index,1);
    try{ localStorage.setItem(REPORT_PRESETS_KEY,JSON.stringify(presets)); }
    catch(e){ alert('تعذر حذف الفلتر المحفوظ.'); return; }
    renderReports(content);
  });
  document.getElementById('rd-refresh').onclick=()=>renderReports(content);
  document.getElementById('rd-audit')?.addEventListener('click',()=>window.openAuditReport&&window.openAuditReport());

  const summaryText = () => (document.getElementById('rd-summary-text')?.textContent || '').trim();

  /* ===== v9: قوالب واتساب — نص عربي جاهز ببدائل محمية من encodeURIComponent ===== */
  const WA_TEMPLATES = {
    daily: d => `📊 *يهماء لتأجير السيارات* — تقرير يومي
🗓 ${d.date} · ${d.periodLabel}
────────────────
🚗 الأسطول ضمن الفلتر: ${d.total}
✅ جاهزة: ${d.ready} (${d.readyPct}%)
⚠️ غير جاهزة: ${d.notReady}
🔧 صيانة: ${d.maint} · 🚫 خارج الخدمة: ${d.out}
⏰ مهام متأخرة: ${d.prepOverdue} من إجمالي ${d.prepOpen} مفتوحة
📄 مستندات منتهية: ${d.overdue} · تنتهي خلال 7 أيام: ${d.d7}
${d.accLine}
🏢 الفروع:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    monthly: d => `📈 *يهماء لتأجير السيارات* — ملخص شهري
🗓 ${d.date} · ${d.periodLabel}
────────────────
🚗 إجمالي السيارات: ${d.total}
✅ نسبة الجاهزية: ${d.readyPct}% (${d.ready}/${d.total})
🔧 صيانة: ${d.maint} · 🚫 خارج الخدمة: ${d.out}
💰 إيراد شهري متوقع: ${d.monthPotential}
🧾 تكاليف صيانة مسجلة: ${d.maintCost}
💵 صافي تقديري: ${d.netEst}
🚗 متوسط الإيراد لكل سيارة: ${d.revPerCar}
⏰ مهام متأخرة: ${d.prepOverdue}
🏢 الفروع:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    docs: d => `📄 *يهماء لتأجير السيارات* — تنبيه المستندات
🗓 ${d.date} · ${d.periodLabel}
────────────────
🔴 مستندات منتهية: ${d.overdue}
🟡 تنتهي خلال 7 أيام: ${d.d7}
🔵 تنتهي خلال 30 يوم: ${d.d30}
⚪ تنتهي خلال 90 يوم: ${d.d90}
🏢 أدنى جاهزية:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    branch: d => `🏢 *يهماء لتأجير السيارات* — تقرير فرع
🗓 ${d.date} · ${d.periodLabel}
🏢 الفرع: ${d.branchName}
────────────────
🚗 إجمالي سيارات الفرع: ${d.branch.t}
✅ جاهزة: ${d.branch.r} (${d.branch.pct}%)
⏰ مهام متأخرة: ${d.branch.ov}
📄 مستندات منتهية: ${d.overdue} · خلال 7 أيام: ${d.d7}
${d.accLine}
———
📡 المصدر: منصة يهماء`
  };
  const buildWaData = () => {
    const acc2 = accountingIndicators(list);
    return {
      date: new Date().toLocaleDateString('ar-SA'),
      periodLabel: periodLabel(),
      total, ready, readyPct, notReady, maint, out, prepOpen, prepOverdue,
      overdue: expBuckets.overdue, d7: expBuckets.d7, d30: expBuckets.d30, d90: expBuckets.d90,
      monthPotential: fmtSAR(acc2.monthPotential),
      maintCost: fmtSAR(acc2.maintCost),
      netEst: fmtSAR(acc2.netEst),
      revPerCar: fmtSAR(acc2.revPerCar),
      accLine: acc2.hasData ? `💰 إيراد متوقع: ${fmtSAR(acc2.estMonthRev||acc2.monthPotential)} · صافي تقديري: ${fmtSAR(acc2.netEst)}` : '💰 أضف سعر التأجير اليومي لكل سيارة لعرض المؤشرات المالية',
      branches: branches.slice(0,5).map(b=>`• ${b.name}: ${b.pct}% جاهز (${b.r}/${b.t})`).join('\n'),
      branchName: (rf.branch && rf.branch!=='all') ? rf.branch : 'كل الفروع',
      branch: (()=>{ const n=(rf.branch && rf.branch!=='all')?rf.branch:null; const fb = n ? branches.find(b=>b.name===n) : branches[0]; return fb||{t:total,r:ready,pct:readyPct,ov:prepOverdue}; })()
    };
  };
  const waSelect = document.getElementById('rd-wa-tpl');
  const buildWaMsg = () => {
    const tpl = (waSelect && waSelect.value) || 'daily';
    const d = buildWaData();
    const msg = (WA_TEMPLATES[tpl] || WA_TEMPLATES.daily)(d);
    return (!msg || !msg.trim()) ? '' : msg;
  };
  const sendAllRecipientsByEmail = () => {
    const recipients = loadRecipients().filter(r=>String(r.email||'').trim());
    if(!recipients.length){ alert('أضف بريدًا إلكترونيًا لمستخدم واحد على الأقل أولًا.'); return; }
    const subject = 'تقرير يهماء — '+periodLabel();
    const body = buildWaMsg() || summaryText();
    const bcc = recipients.map(r=>String(r.email).trim()).join(',');
    location.href='mailto:?bcc='+encodeURIComponent(bcc)+'&subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    recipients.forEach(r=>markSent(r.name,'daily','mail'));
    sndRenderAll();
  };
  const sendAllMailBtn = document.getElementById('snd-mail-all');
  if(sendAllMailBtn) sendAllMailBtn.onclick = sendAllRecipientsByEmail;
  document.getElementById('rd-wa').onclick = () => {
    const msg = buildWaMsg();
    if(!msg){ alert('لا يوجد محتوى للمشاركة ضمن الفلتر الحالي.'); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  };
  const waCopyBtn = document.getElementById('rd-wa-copy');
  if(waCopyBtn) waCopyBtn.onclick = async () => {
    const msg = buildWaMsg();
    if(!msg){ alert('لا يوجد محتوى للنسخ ضمن الفلتر الحالي.'); return; }
    try{ await navigator.clipboard.writeText(msg); waCopyBtn.textContent='✓ تم النسخ'; setTimeout(()=>{waCopyBtn.textContent='📋 نسخ';},1500); }
    catch(e){ alert('تعذر النسخ التلقائي — انسخ النص يدويًا من الملخص التنفيذي بالأسفل.'); }
  };
  document.getElementById('rd-mail').onclick = () => {
    const msg = buildWaMsg() || summaryText();
    location.href = 'mailto:?subject=' + encodeURIComponent('تقرير يهماء — ' + periodLabel()) + '&body=' + encodeURIComponent(msg);
  };
  const broadcastBtn=document.getElementById('rd-broadcast');
  if(broadcastBtn) broadcastBtn.onclick=()=>{
    if(window.currentRole!=='admin'){alert('إرسال التعميم متاح للمدير فقط.');return;}
    document.getElementById('yahma-broadcast-modal')?.remove();
    const overlay=document.createElement('div');
    overlay.id='yahma-broadcast-modal';
    overlay.className='overlay';
    overlay.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="broadcast-title" style="width:min(620px,94vw)"><div class="modal-head"><h2 id="broadcast-title">إرسال تعميم أو تقرير</h2><button type="button" class="btn btn-ghost btn-small" id="broadcast-close">إغلاق</button></div><p class="muted-small">يرسل إلى بريد حسابات المنصة. المستخدمون الجدد سيظهرون تلقائيًا.</p><label class="fld">المستلمون<select id="broadcast-audience"><option value="all">كل المستخدمين</option><option value="admin">المديرون</option><option value="ops">فريق التشغيل</option><option value="view">مشاهدة فقط</option></select></label><label class="fld">عنوان الرسالة<input id="broadcast-subject" maxlength="180" value="تعميم يهماء — ${esc(periodLabel())}"></label><label class="fld">نص الرسالة<textarea id="broadcast-body" rows="10" maxlength="20000" placeholder="اكتب التعميم هنا"></textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn btn-ghost btn-small" id="broadcast-insert-report">إدراج ملخص التقرير الحالي</button><button type="button" class="btn btn-primary btn-small" id="broadcast-send">إرسال</button></div><div id="broadcast-status" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('#broadcast-close').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('#broadcast-insert-report').onclick=()=>{
      const body=overlay.querySelector('#broadcast-body');
      body.value=[body.value.trim(),buildWaMsg()||summaryText()].filter(Boolean).join('\n\n');
    };
    overlay.querySelector('#broadcast-send').onclick=async()=>{
      const subject=overlay.querySelector('#broadcast-subject').value.trim();
      const message=overlay.querySelector('#broadcast-body').value.trim();
      const status=overlay.querySelector('#broadcast-status');
      const send=overlay.querySelector('#broadcast-send');
      if(!subject||!message){status.textContent='اكتب عنوان الرسالة ونصها أولًا.';return;}
      if(!window.supabaseReady||!window.supabaseClient){status.textContent='الإرسال يحتاج اتصال المنصة السحابي.';return;}
      send.disabled=true;status.textContent='جارٍ إرسال الرسالة...';
      try{
        const {data,error}=await window.supabaseClient.functions.invoke('send-user-email',{body:{subject,message,audience:overlay.querySelector('#broadcast-audience').value}});
        if(error) throw error;
        if(data?.error) throw new Error(data.error);
        if(!data?.sent) throw new Error('لم يُرسل البريد لأي مستخدم');
        status.textContent=`تم قبول الإرسال إلى ${data.sent} مستخدم${data.failed?`، وتعذر ${data.failed}${data.error?' ('+data.error+')':''}`:''}.`;
        try{log('تعميم بالبريد',subject+' — '+data.sent+' مستلم');}catch(_){}
      }catch(err){status.textContent='تعذر الإرسال: '+(err.message||'تحقق من إعداد خدمة البريد');}
      finally{send.disabled=false;}
    };
    overlay.querySelector('#broadcast-subject').focus();
  };

  /* ===== v10: واجهة الإرسال المجدول ===== */
  const SND_KIND_LABEL = {daily:'تقرير يومي', weekly:'تنبيه مستندات أسبوعي', report:'تقرير رسمي PDF'};
  let sndEditing = null;
  const sndMsgFor = (r, kind) => {
    const d = buildWaData();
    if(kind==='weekly') return WA_TEMPLATES.docs(d);
    if(r.role==='branch' && r.branch){ d.branchName=r.branch; d.branch=branches.find(x=>x.name===r.branch)||d.branch; return WA_TEMPLATES.branch(d); }
    return WA_TEMPLATES.daily(d);
  };
  const sndRenderAll = () => {
    if(window.currentRole==='admin' && window.supabaseReady && !window.__sndScheduleLoaded){
      window.__sndScheduleLoaded=true;
      window.supabaseClient.from('email_schedule').select('enabled,daily_time,weekly_day,weekly_time,last_daily_date,last_weekly_date').eq('id',1).maybeSingle().then(({data,error})=>{
        if(data){
          try{localStorage.setItem(SND_SKEY,JSON.stringify({enabled:!!data.enabled,dailyTime:String(data.daily_time||'07:00').slice(0,5),weeklyDay:Number(data.weekly_day)||0,weeklyTime:String(data.weekly_time||'08:00').slice(0,5),lastDaily:data.last_daily_date||null,lastWeekly:data.last_weekly_date||null}));}catch(_){}
          sndRenderAll();
        }else if(!error){
          try{localStorage.setItem(SND_SKEY,JSON.stringify({enabled:false,dailyTime:'07:00',weeklyDay:0,weeklyTime:'08:00'}));}catch(_){}
          sndRenderAll();
        }else if(error){
          const status=document.getElementById('snd-schedule-status');
          if(status) status.textContent='شغّل تحديث مخطط قاعدة البيانات أولًا لتفعيل الجدولة السحابية.';
        }
      }).catch(()=>{});
    }
    const rec=loadRecipients(), lg=loadSendLog(), sc=sndSchedule(), due=sndDueKinds();
    const ban=document.getElementById('snd-banner');
    if(ban){
      if(due.length){
        const btns=due.map(k=>`<button type="button" class="btn btn-primary btn-small" onclick="window.sndPrep('${k}')">${k==='daily'?'📨 جهّز التقرير اليومي':'📄 جهّز تنبيه المستندات'}</button>`).join(' ');
        ban.innerHTML=`<b>⏰ موعد الإرسال المجدول حان — ${rec.filter(r=>r.daily||r.docs).length} مستلم في القائمة</b><div class="snd-banner-acts">${btns}${due.includes('weekly')?'<button type="button" class="btn btn-ghost btn-small" onclick="window.sndPdfDocs()">🖼 PDF المستندات</button>':''}</div>`;
        ban.style.display='flex';
      } else { ban.style.display='none'; ban.innerHTML=''; }
    }
    const rowsEl=document.getElementById('snd-rows');
    if(rowsEl){
      rowsEl.innerHTML = rec.length ? rec.map(r=>`
        <div class="snd-row">
          <div class="snd-who">
            <b>${esc(r.name)}${r.role==='admin'?' — مدير (كل الفروع)':' — مشرف '+esc(r.branch||'فرع')}</b>
            <span dir="ltr">${esc(r.phone||'—')}${r.email?' · '+esc(r.email):''}</span>
            <div class="snd-chips">${r.daily?`<span class="snd-chip2">يومي ${sc.dailyTime}</span>`:''}${r.docs?'<span class="snd-chip2 amber">مستندات أسبوعي</span>':''}</div>
          </div>
          <div class="snd-mini-acts">
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','daily','wa')">💬 واتساب</button>
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','daily','mail')">✉ إيميل</button>
            ${r.docs?`<button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','weekly','wa')">📄 مستندات</button>`:''}
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndEdit('${r.id}')">✏</button>
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndDel('${r.id}')">🗑</button>
          </div>
        </div>`).join('') : '<div class="snd-empty">لا مستلمين بعد — أضف المدير ومشرفي الفروع من النموذج أعلاه. المدير يستلم ملخص كل الفروع، ومشرف الفرع يستلم تقرير فرعه فقط.</div>';
    }
    const logEl=document.getElementById('snd-log-rows');
    if(logEl){
      logEl.innerHTML = lg.length ? lg.slice(0,20).map(e=>`<div class="snd-log-row"><span>${esc(e.name)} — ${SND_KIND_LABEL[e.kind]||e.kind} · ${e.channel==='mail'?'إيميل':'واتساب'}</span><time>${new Date(e.at).toLocaleString('ar-SA')}</time></div>`).join('') : '<div class="snd-empty">لا إرساليات مسجلة بعد — كل رسالة تُرسل ستُوثّق هنا تلقائيًا.</div>';
    }
    const batchEl=document.getElementById('snd-batch');
    if(batchEl && !batchEl.dataset.keep) batchEl.innerHTML='';
    const en=document.getElementById('snd-en'); if(en) en.checked=!!sc.enabled;
    const dt=document.getElementById('snd-daily-time'); if(dt) dt.value=sc.dailyTime;
    const wt=document.getElementById('snd-weekly-time'); if(wt) wt.value=sc.weeklyTime;
    const wd=document.getElementById('snd-weekly-day'); if(wd) wd.value=String(sc.weeklyDay);
    const status=document.getElementById('snd-schedule-status');
    if(status && sc.enabled){
      const fmtD=d=>{ try{ return d?new Date(d+'T00:00:00').toLocaleDateString('ar-SA'):'—'; }catch(_){ return d||'—'; } };
      status.textContent='الجدولة السحابية مفعّلة: تقرير يومي '+sc.dailyTime+'، وتنبيه مستندات أسبوعي يوم '+['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][sc.weeklyDay]+' '+sc.weeklyTime+' بتوقيت الرياض.'
        +' آخر إرسال تلقائي — يومي: '+fmtD(sc.lastDaily)+' · أسبوعي: '+fmtD(sc.lastWeekly)+'.';
    }
  };
  window.sndPrep = (kind) => {
    const rec=loadRecipients().filter(r=> kind==='daily' ? r.daily : r.docs);
    const box=document.getElementById('snd-batch'); if(!box) return;
    box.dataset.keep='1';
    box.innerHTML = rec.length ? `<div class="rd-card-h"><h3>رسائل جاهزة — ${SND_KIND_LABEL[kind]}</h3><span class="rd-chip">${rec.length} مستلم</span></div>` + rec.map(r=>`
      <div class="snd-row" style="flex-direction:column;align-items:stretch;margin-top:8px">
        <div class="snd-who"><b>${esc(r.name)}</b><span>${r.role==='admin'?'ملخص كل الفروع':'تقرير فرع: '+esc(r.branch||'—')}</span></div>
        <div class="snd-mini-acts" style="margin-top:6px">
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','${kind}','wa')">💬 واتساب</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','${kind}','mail')">✉ إيميل</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndCopy('${r.id}','${kind}')">📋 نسخ</button>
        </div>
      </div>`).join('') : '<div class="snd-empty">لا مستلمين مطابقين لهذا النوع — راجع قائمة المستلمين.</div>';
    box.scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.sndChannel = (id,kind,ch) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    const msg=sndMsgFor(r,kind);
    if(ch==='wa'){ const dg=String(r.phone||'').replace(/[^0-9]/g,''); window.open((dg?'https://wa.me/'+dg:'https://wa.me')+'?text='+encodeURIComponent(msg),'_blank'); }
    else { location.href='mailto:'+(r.email||'')+'?subject='+encodeURIComponent('تقرير يهماء — '+SND_KIND_LABEL[kind])+'&body='+encodeURIComponent(msg); }
    markSent(r.name,kind,ch);
    sndRenderAll();
  };
  window.sndCopy = async (id,kind) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    try{ await navigator.clipboard.writeText(sndMsgFor(r,kind)); alert('تم نسخ رسالة '+r.name); }catch(e){ alert('تعذر النسخ التلقائي.'); }
  };
  window.sndDel = (id) => {
    if(!confirm('حذف هذا المستلم؟')) return;
    saveRecipients(loadRecipients().filter(x=>x.id!==id));
    sndRenderAll();
  };
  window.sndEdit = (id) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    sndEditing=id;
    const g=x=>document.getElementById(x);
    g('snd-name').value=r.name||''; g('snd-role').value=r.role||'admin';
    g('snd-phone').value=r.phone||''; g('snd-email').value=r.email||'';
    g('snd-branch').value=r.branch||''; g('snd-gets-daily').checked=!!r.daily; g('snd-gets-docs').checked=!!r.docs;
    g('snd-add').textContent='تحديث المستلم';
    g('snd-name').scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.sndPdfDocs = () => { const b=document.getElementById('rd-pdf'); if(b) b.click(); };
  const sndAddBtn=document.getElementById('snd-add');
  if(sndAddBtn) sndAddBtn.onclick = () => {
    const g=x=>{ const el=document.getElementById(x); return el?el.value.trim():''; };
    const name=g('snd-name');
    if(!name){ alert('أدخل اسم المستلم'); return; }
    const rec=loadRecipients();
    const obj={ id: sndEditing || ('r'+Date.now()), name, role:g('snd-role'), phone:g('snd-phone'), email:g('snd-email'), branch:g('snd-branch'), daily:document.getElementById('snd-gets-daily').checked, docs:document.getElementById('snd-gets-docs').checked };
    if(sndEditing){ const i=rec.findIndex(x=>x.id===sndEditing); if(i>=0) rec[i]=obj; sndEditing=null; sndAddBtn.textContent='＋ إضافة مستلم'; }
    else rec.push(obj);
    saveRecipients(rec);
    ['snd-name','snd-phone','snd-email','snd-branch'].forEach(x=>{const el=document.getElementById(x); if(el) el.value='';});
    try{ log('إعداد الإرسال', 'حفظ مستلم: '+name); }catch(e){}
    sndRenderAll();
  };
  const sndSchedBtn=document.getElementById('snd-save-sched');
  if(sndSchedBtn) sndSchedBtn.onclick = async () => {
    const s={ enabled:document.getElementById('snd-en').checked, dailyTime:document.getElementById('snd-daily-time').value||'07:00', weeklyDay:parseInt(document.getElementById('snd-weekly-day').value,10)||0, weeklyTime:document.getElementById('snd-weekly-time').value||'08:00' };
    sndSchedBtn.disabled=true;
    try{ await saveSched(s); }
    catch(e){ alert('تعذر حفظ الجدولة على الخادم: '+(e.message||'تحقق من إعداد قاعدة البيانات')); sndSchedBtn.disabled=false; return; }
    sndSchedBtn.disabled=false;
    try{ log('إعداد الإرسال', 'تحديث الجدولة — يومي '+s.dailyTime); }catch(e){}
    alert(s.enabled?'تم حفظ الجدولة السحابية. سيتم الإرسال تلقائيًا حتى عند إغلاق المنصة.':'تم حفظ الجدولة وهي متوقفة.');
    sndRenderAll();
  };
  sndRenderAll();
  sndInitTimer();

  const frBtn=document.getElementById('rd-formal');
  if(frBtn) frBtn.onclick = () => {
    if(!window.__lastReportAgg){ alert('افتح شاشة التقارير أولًا لتوليد المؤشرات.'); return; }
    frEnsureRoot();
    document.getElementById('fr-sheet').innerHTML = frSheetHTML();
    document.getElementById('fr-root').style.display = 'flex';
  };
  const infBtn=document.getElementById('rd-infog');
  if(infBtn) infBtn.onclick = () => {
    if(!window.__lastReportAgg){ alert('افتح شاشة التقارير أولًا لتوليد المؤشرات.'); return; }
    infEnsureRoot();
    document.getElementById('inf-sheet').innerHTML = infSheetHTML();
    document.getElementById('inf-root').style.display = 'flex';
  };

  /* ---- Excel export (filtered list) ---- */
  const exportReportsExcel = async () => {
    if(!(await ensureXlsxReady())){
      alert('مكتبة Excel غير محمّلة. تأكد من الاتصال بالإنترنت.');
      return;
    }
    const rows = list.map(c => {
      let readyLabel = '—';
      try{ if(typeof vehicleReadiness==='function'){ const r=vehicleReadiness(c); readyLabel=r.ready?'جاهز':(r.label||'غير جاهز'); } }catch(e){}
      const openTasks = (c.prepTasks||[]).filter(t=>t.status!=='done').length;
      return {
        'اللوحة': c.plate||'',
        'الماركة': c.brand||'',
        'النوع': c.type||'',
        'الموديل': c.model||'',
        'الفرع': c.branch||'',
        'المالك': c.owner||'',
        'حالة السيارة': c.carStatus||'',
        'الجاهزية': readyLabel,
        'انتهاء البطاقة': c.cardExpiry||'',
        'انتهاء الرخصة': c.licenseExpiry||'',
        'التأمين': c.insuranceExpiry||c.insuranceStatus||'',
        'الفحص': c.inspectionStatus||'',
        'الصيانة القادمة': c.nextService||'',
        'مهام مفتوحة': openTasks
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows.length?rows:[{'اللوحة':'لا بيانات'}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    // branch sheet
    const br = branches.map(b=>({'الفرع':b.name,'الأسطول':b.t,'جاهز':b.r,'النسبة %':b.pct,'مهام متأخرة':b.ov}));
    if(br.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(br), 'الفروع');
    // docs sheet (تقرير المستندات التفصيلي)
    const docRows = list.map(c=>{
      const row={'اللوحة':c.plate||'','الفرع':c.branch||''};
      let worst=null;
      DOC_TYPES.forEach(dt=>{
        const d=daysFrom(c[dt.key]);
        row[dt.label]=c[dt.key]||'';
        row['متبقي '+dt.label]=(d===null||isNaN(d))?'':d;
        if(d!==null&&!isNaN(d)&&(worst===null||d<worst)) worst=d;
      });
      row['أخطر مستند (يوم)']=worst===null?'':worst;
      return row;
    });
    if(docRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows), 'المستندات');
    (()=>{ const pb=periodBounds(); const bsfx=(rf.branch&&rf.branch!=='all')?('_'+String(rf.branch).replace(/\s+/g,'-')):''; const fname=(window.periodRange.preset==='all')?('yahma-report-'+todayStr()+bsfx+'.xlsx'):('yahma-report-'+pb.from+'_to_'+pb.to+bsfx+'.xlsx'); XLSX.writeFile(wb, fname); })();
  };
  const excelBtn = document.getElementById('rd-excel');
  if(excelBtn) excelBtn.onclick = exportReportsExcel;

  /* ---- PDF from current dashboard ---- */
  document.getElementById('rd-pdf').onclick = async () => {
    const node = document.getElementById('reports-dashboard');
    if(!node){ alert('لا يوجد محتوى للتصدير'); return; }
    const btn = document.getElementById('rd-pdf');
    const old = btn ? btn.innerHTML : '';
    if(btn){ btn.disabled=true; btn.textContent='جارِ تجهيز PDF...'; }
    try{
      if(typeof html2canvas === 'undefined'){
        alert('مكتبة اللقطة غير محمّلة');
        window.print();
        return;
      }
      const canvas = await html2canvas(node, {scale:2, backgroundColor:'#ffffff', useCORS:true, logging:false});
      const img = canvas.toDataURL('image/png');
      if(window.jspdf && window.jspdf.jsPDF){
        const {jsPDF} = window.jspdf;
        const pdf = new jsPDF('p','mm','a4');
        const pageW=210, pageH=297, margin=8;
        const usableW=pageW-margin*2;
        const imgH = canvas.height * usableW / canvas.width;
        let hLeft = imgH, pos = margin;
        pdf.addImage(img, 'PNG', margin, pos, usableW, imgH);
        hLeft -= (pageH - margin*2);
        while(hLeft > 0){
          pdf.addPage();
          pos = margin - (imgH - hLeft);
          pdf.addImage(img, 'PNG', margin, pos, usableW, imgH);
          hLeft -= (pageH - margin*2);
        }
        pdf.save('yahma-report-'+Date.now()+'.pdf');
      } else {
        // fallback: download image
        const a=document.createElement('a'); a.download='yahma-report.png'; a.href=img; a.click();
        alert('مكتبة PDF غير متاحة — تم تنزيل صورة بدلًا منها');
      }
    }catch(err){
      console.error(err);
      alert('تعذر إنشاء PDF');
    }finally{
      if(btn){ btn.disabled=false; btn.innerHTML=old||'PDF'; }
    }
  };

  document.getElementById('rd-shot').onclick = async () => {
    const node = document.getElementById('reports-dashboard');
    if(!node) return;
    try{
      if(typeof html2canvas === 'undefined'){ window.print(); return; }
      const canvas = await html2canvas(node, {scale:2, backgroundColor:'#F3FAFA', useCORS:true});
      const a=document.createElement('a'); a.download='yahma-report-'+Date.now()+'.png'; a.href=canvas.toDataURL('image/png'); a.click();
    }catch(e){ alert('تعذر التقاط اللقطة'); }
  };

  /* ---- Drill-down: click KPI / rows to see cars ---- */
  function openDrill(title, cars, extraCol){
    let ov = document.getElementById('rd-drill-overlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'rd-drill-overlay';
      ov.className = 'rd-drill-overlay';
      document.body.appendChild(ov);
    }
    const rows = (cars||[]).map(c=>{
      let ready='—';
      try{ if(typeof vehicleReadiness==='function'){ const r=vehicleReadiness(c); ready=r.ready?'جاهز':(r.label||'غير جاهز'); } }catch(e){}
      const extra = extraCol ? `<td>${esc(extraCol.get(c))}</td>` : '';
      return `<tr data-id="${esc(c.id)}">
        <td class="plate">${esc(c.plate||'—')}</td>
        <td>${esc([c.brand,c.model].filter(Boolean).join(' '))}</td>
        <td>${esc(c.branch||'—')}</td>
        <td>${esc(c.carStatus||'—')}</td>
        <td>${esc(ready)}</td>
        <td>${esc(c.owner||'—')}</td>${extra}
      </tr>`;
    }).join('') || `<tr><td colspan="${extraCol?7:6}" style="text-align:center;color:#888;padding:20px">لا توجد سيارات في هذا التصنيف</td></tr>`;
    ov.innerHTML = `<div class="rd-drill-modal" role="dialog">
      <div class="rd-drill-head">
        <div><h3>${esc(title)}</h3><p>${(cars||[]).length} سيارة</p></div>
        <button type="button" class="rd-drill-x" id="rd-drill-close">×</button>
      </div>
      <div class="rd-drill-body">
        <table class="rd-drill-table"><thead><tr>
          <th>اللوحة</th><th>السيارة</th><th>الفرع</th><th>الحالة</th><th>الجاهزية</th><th>المالك</th>${extraCol?`<th>${esc(extraCol.label)}</th>`:''}
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="rd-drill-foot">
        <button type="button" class="btn btn-ghost btn-small" id="rd-drill-excel">تصدير Excel</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-drill-close2">إغلاق</button>
      </div>
    </div>`;
    ov.classList.add('open');
    const close = ()=>ov.classList.remove('open');
    ov.onclick = e => { if(e.target===ov) close(); };
    document.getElementById('rd-drill-close').onclick = close;
    document.getElementById('rd-drill-close2').onclick = close;
    ov.querySelectorAll('tbody tr[data-id]').forEach(tr=>{
      tr.onclick = ()=>{
        const id = tr.getAttribute('data-id');
        close();
        if(id && typeof openVehicle360==='function') openVehicle360(id);
        else if(id && typeof openModal==='function') openModal(id);
      };
    });
    document.getElementById('rd-drill-excel').onclick = async ()=>{
      if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة'); return; }
      const data = (cars||[]).map(c=>{
        const r={
          'اللوحة':c.plate||'','الفرع':c.branch||'','الحالة':c.carStatus||'',
          'الماركة':c.brand||'','الموديل':c.model||'','المالك':c.owner||''
        };
        if(extraCol) r[extraCol.label]=extraCol.get(c);
        return r;
      });
      const ws=XLSX.utils.json_to_sheet(data.length?data:[{'اللوحة':'لا بيانات'}]);
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'التفاصيل');
      XLSX.writeFile(wb, 'yahma-drill-'+Date.now()+'.xlsx');
    };
  }

  const carsReady = list.filter(c=>{ try{ return typeof vehicleReadiness==='function' && vehicleReadiness(c).ready; }catch(e){ return false; }});
  const carsNotReady = list.filter(c=>{ try{ return typeof vehicleReadiness==='function' ? !vehicleReadiness(c).ready : true; }catch(e){ return true; }});
  const carsMaint = list.filter(c=>String(c.carStatus||'').includes('صيانة'));
  const carsOut = list.filter(c=>String(c.carStatus||'').includes('خارج'));
  const carsPrepOpen = list.filter(c=>(c.prepTasks||[]).some(t=>t.status!=='done'));
  const carsPrepLate = list.filter(c=>(c.prepTasks||[]).some(t=>{
    if(t.status==='done'||!t.dueDate) return false;
    const d=new Date(t.dueDate); return !isNaN(d) && d<today;
  }));
  const carsExpOver = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left<0; }));
  const carsExp7 = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>=0 && left<=7; }));
  const carsExp30 = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>7 && left<=30; }));

  const kpis = content.querySelectorAll('.rd-kpi');
  // order matches render: total, ready, notReady, maint, prepOpen, prepOverdue
  const kpiMaps = [
    ['كل السيارات (الفلتر)', list],
    ['السيارات الجاهزة', carsReady],
    ['السيارات غير الجاهزة', carsNotReady],
    ['سيارات الصيانة', carsMaint],
    ['سيارات بمهام مفتوحة', carsPrepOpen],
    ['سيارات بمهام متأخرة', carsPrepLate]
  ];
  kpis.forEach((el, idx)=>{
    el.style.cursor = 'pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',`${el.querySelector('span')?.textContent||'مؤشر'}: عرض التفاصيل`);
    el.onclick = (e)=>{ e.stopPropagation(); const m=kpiMaps[idx]; if(m) openDrill(m[0], m[1]); };
    el.onkeydown = e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.click(); } };
  });

  content.querySelectorAll('.rd-exp-row').forEach((el, idx)=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    const maps=[
      ['مستندات منتهية', carsExpOver],
      ['تنتهي خلال 7 أيام', carsExp7],
      ['تنتهي خلال 30 يوم', carsExp30],
      ['تنتهي خلال 90 يوم', list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>30 && left<=90; }))]
    ];
    el.onclick = ()=>{ const m=maps[idx]; if(m) openDrill(m[0], m[1]); };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  // تقرير المستندات التفصيلي: خلايا الأنواع والنطاقات
  content.querySelectorAll('.rd-doc-cell').forEach(el=>{
    el.onclick = ()=>{
      const doc = DOC_TYPES.find(d=>d.key===el.dataset.doc);
      const b = DOC_BUCKETS.find(x=>x.key===el.dataset.bucket);
      if(!doc||!b) return;
      const cars = (docDetail.find(d=>d.key===doc.key)||{buckets:{}}).buckets[b.key]||[];
      openDrill(doc.label+' — '+b.label, cars, {label:'انتهاء '+doc.label, get:c=>c[doc.key]||'—'});
    };
  });
  content.querySelectorAll('.rd-doc-branch').forEach(el=>{
    const open=()=>{
      const br=el.dataset.branch;
      const cars=list.filter(c=>(String(c.branch||'غير محدد').trim()||'غير محدد')===br && DOC_TYPES.some(dt=>docBucketOf(daysFrom(c[dt.key]))==='over'));
      openDrill('مستندات منتهية — '+br, cars);
    };
    el.onclick = open;
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  });

  content.querySelectorAll('.rd-bar-row').forEach(el=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.onclick = ()=>{
      const label = (el.querySelector('span')||{}).textContent||'';
      // filter cars whose readiness failure includes this label
      const cars = list.filter(c=>{
        try{
          if(typeof vehicleReadiness!=='function') return false;
          const r=vehicleReadiness(c);
          return (r.failed||[]).some(f=>String((f&&(f.label||f.name||f))||'')===label);
        }catch(e){ return false; }
      });
      // if in owner section (purple bars) - check parent card title
      const card = el.closest('.rd-card');
      const h = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '';
      if(h && h.includes('ملاك')){
        const ownerCars = list.filter(c=>String(c.owner||'غير محدد').trim()===(label||'').trim() || String(c.owner||'غير محدد').trim()===label);
        openDrill('المالك: '+label, ownerCars.length?ownerCars:cars);
      } else {
        openDrill('سبب: '+label, cars);
      }
    };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  content.querySelectorAll('.rd-bt-r').forEach(el=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.onclick = ()=>{
      const name = el.querySelector('span') ? el.querySelector('span').textContent : '';
      openDrill('فرع: '+name, list.filter(c=>String(c.branch||'غير محدد').trim()===name));
    };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  // 3D tilt on cards
  content.querySelectorAll('.rd-3d').forEach(card=>{
    card.addEventListener('mousemove', e=>{
      if(e.target.closest('.rd-kpi, .rd-exp-row, .rd-bar-row, .rd-bt-r')) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const rx = (0.5 - y) * 8;
      const ry = (x - 0.5) * 10;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px)`;
    });
    card.addEventListener('mouseleave', ()=>{ card.style.transform = ''; });
  });
}




  const ReportsModule = {
    filtersKey: FILTERS_KEY,
    presetsKey: PRESETS_KEY,
    periodPresets: PERIOD_PRESETS,
    render: renderReports,
    storageRead,
    persistState,
    getPresets,
    isoLocal,
    periodBounds,
    periodLabel,
    periodDate,
    inPeriod,
    accountingIndicators,
    aggregateReport,
    formatCurrency,
    reportFileName,
    reportTextSummary,
    formalReportHtml,
    infographicFileName,
    infographicTextSummary,
    infographicDonut,
    infographicDonutLegend,
    infographicHtml,
    go() {
      try {
        global.currentTab = 'reports';
        document.querySelector('.nav-item[data-tab="reports"]')?.click();
        if (typeof global.render === 'function') global.render();
      } catch (e) {}
    },
    async exportExcel() {
      if (global.YahmaExport && global.YahmaExport.excel) {
        await global.YahmaExport.excel();
      }
    },
    async preparePdf() {
      if (global.YahmaExport && global.YahmaExport.pdfPrepare) {
        await global.YahmaExport.pdfPrepare();
      }
    },
  };

  global.YahmaReports = ReportsModule;
})(typeof window !== 'undefined' ? window : this);
