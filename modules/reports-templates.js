/* ===== modules/reports-templates.js — قوالب الطباعة والتصدير =====
 *
 * التقرير الرسمي (A4) والإنفوجرافيك. بتاخد periodBounds وperiodLabel
 * من reports-core.js.
 */
(function (global) {
  'use strict';

  const Core = global.YahmaReportsCore;
  if (!Core) { console.error("reports-templates.js: reports-core.js مش محمّل قبله"); return; }
  const { periodBounds, periodLabel, PERIOD_PRESETS } = Core;

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
      '🕒 أُنشئ: ' + new Date().toLocaleString('ar-SA-u-ca-gregory'),
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
    const modelFilter = report.rf?.model && report.rf.model !== 'all' ? report.rf.model : 'الكل';
    const issueFilter = report.rf?.issue && report.rf.issue !== 'all' ? report.rf.issue : 'الكل';
    const reportNumber = 'YH-' + generated.getFullYear() + String(generated.getMonth() + 1).padStart(2, '0') + String(generated.getDate()).padStart(2, '0') + '-' + String(generated.getHours()).padStart(2, '0') + String(generated.getMinutes()).padStart(2, '0');

    return '<div class="fr-head"><div class="fr-brand"><div class="fr-logo">يهماء</div><div><h1>يهماء لتأجير السيارات</h1><p>تقرير رسمي بمؤشرات الأسطول والجاهزية</p></div></div><div class="fr-head-date">رقم التقرير: ' + reportNumber + '<br>تاريخ الإنشاء: ' + generated.toLocaleString('ar-SA-u-ca-gregory') + '</div></div>' +
      '<div class="fr-body"><div class="fr-meta"><div>فترة التقرير<b>' + range + (preset ? ' (' + preset + ')' : '') + '</b></div><div>نطاق الفلتر<b>الفرع: ' + escapeHtml(branchFilter) + ' · الموديل: ' + escapeHtml(modelFilter) + ' · المشكلات: ' + escapeHtml(issueFilter) + '</b></div><div>عدد السجلات المدروسة<b>' + report.total + ' سيارة</b></div></div>' +
      '<div class="fr-sec-title">أولًا: الملخص التنفيذي</div><div class="fr-kpis">' +
      kpi(report.total, 'إجمالي السيارات') + kpi(report.ready + ' (' + report.readyPct + '%)', 'جاهزة للتأجير', 'ok') + kpi(report.notReady, 'غير جاهزة', 'bad') + kpi(report.maint, 'تحت الصيانة', 'warn') + kpi(report.out, 'خارج الخدمة') + kpi(report.prepOpen, 'مهام تجهيز مفتوحة') + kpi(report.prepOverdue, 'مهام متأخرة', report.prepOverdue ? 'bad' : '') + kpi(report.readyPct + '%', 'نسبة الجاهزية العامة', report.readyPct >= 70 ? 'ok' : 'warn') + '</div>' +
      '<div class="fr-sec-title">ثانيًا: المؤشرات المحاسبية (تقديرية)</div><table class="fr-table"><tbody>' +
      row('الإيراد الشهري المتوقع (متوسط السعر اليومي × السيارات النشطة × 30 يوم)', formatCurrency(acc.monthPotential)) + row('الإيراد حسب أيام التأجير المسجلة فعليًا', formatCurrency(acc.estMonthRev)) + row('إجمالي تكاليف الصيانة المسجلة', formatCurrency(acc.maintCost)) + row('صافي الربح التقديري', formatCurrency(acc.netEst)) + row('متوسط الإيراد اليومي للسيارة', formatCurrency(acc.avgDaily)) + row('الإيراد الشهري لكل سيارة', formatCurrency(acc.revPerCar)) + row('السيارات النشطة (باستثناء الخارج والمؤرشفة والمباعة)', acc.active) + row('عدد أيام الفترة', acc.days) +
      '</tbody></table><div class="fr-sec-title">ثالثًا: أداء الفروع</div><table class="fr-table"><thead><tr><th>الفرع</th><th>الأسطول</th><th>جاهز</th><th>نسبة الجاهزية</th><th>مهام متأخرة</th></tr></thead><tbody>' + branchRows + '</tbody></table>' +
      '<div class="fr-sec-title">رابعًا: أسباب عدم الجاهزية</div><table class="fr-table"><thead><tr><th>السبب</th><th>عدد السيارات</th></tr></thead><tbody>' + failureRows + '</tbody></table>' +
      '<div class="fr-sec-title">خامسًا: توزيع الملاك (الأعلى 6)</div><table class="fr-table"><thead><tr><th>المالك</th><th>عدد السيارات</th></tr></thead><tbody>' + ownerRows + '</tbody></table>' +
      '<div class="fr-sec-title">سادسًا: حالة المستندات</div><div class="fr-kpis">' + kpi(buckets.overdue, 'مستندات منتهية', 'bad') + kpi(buckets.d7, 'تنتهي خلال 7 أيام', 'warn') + kpi(buckets.d30, 'تنتهي خلال 30 يوم') + kpi(buckets.d90, 'تنتهي خلال 90 يوم') + '</div>' +
      (function(){
        /* سابعًا: جدول الأسطول التفصيلي — الأعمدة التشغيلية والمالية في جدول واحد */
        try{
          const rows=(report.fleetRows||[]).slice(0,300);
          if(!rows.length) return '';
          const fmt = (d) => global.YahmaUtils ? global.YahmaUtils.fmtDate(d) : (d || '—');
          const head=['اللوحة','الماركة','النوع','الموديل','كم الحالي','اللون','المدينة','الرقم التسلسلي','حالة التأمين','انتهاء الرخصة','الفرع','المالك','الحالة','الجاهزية','سعر اليوم','أقل سعر','سعر الشهر','أقل شهري'];
          const body=rows.map(c=>'<tr>'+[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.odometer||'—',c.color||'—',c.city||'—',c.serial||'—',c.insuranceStatus||'—',fmt(c.licenseExpiry),c.branch||'—',c.owner||'—',c.carStatus||'—',c.readyLabel||'—',c.dailyRate||'—',c.minDailyRate||'—',c.monthlyRate||'—',c.minMonthlyRate||'—']
            .map((v,i)=>'<td'+(i>=14?' class="num"':'')+'>'+escapeHtml(String(v))+'</td>').join('')+'</tr>').join('');
          return '<div class="fr-sec-title">سابعًا: جدول الأسطول التفصيلي (أعلى ' + rows.length + ' سيارة' + ((report.fleetRows||[]).length>300 ? ' من ' + report.fleetRows.length :'') + ')</div>' +
            '<table class="fr-table fr-dense"><thead><tr>' + head.map((h,i)=>'<th'+(i>=11?' class="num"':'')+'>'+escapeHtml(h)+'</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
        }catch(e){ return ''; }
      })() +
      '<div class="fr-sign"><div><i></i>مسؤول الأسطول — الاسم والتوقيع</div><div><i></i>المدير المسؤول — الاسم والتوقيع</div></div><div class="fr-note">منهجية الإعداد: تُحتسب المؤشرات من بيانات المنصة ضمن الفترة المختارة (فلتر الفترة). المؤشرات المحاسبية تقديرية وتُحتسب من أسعار التأجير اليومية وأيام التأجير المسجلة وتكاليف الصيانة الفعلية المدخلة، والقيم غير المدخلة لا تُفترض. يُرجى مراجعة الأرقام قبل الاعتماد الرسمي.</div></div>' +
      '<div class="fr-foot"><span>منصة يهماء لتأجير السيارات — تقرير مولّد آليًا</span><span>الإصدار v11</span><span>' + generated.toLocaleDateString('ar-SA-u-ca-gregory') + '</span></div>';
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
      '🕒 ' + new Date().toLocaleString('ar-SA-u-ca-gregory'), '———',
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
    const modelFilter = report.rf?.model && report.rf.model !== 'all' ? ' · الموديل: ' + report.rf.model : '';
    const readyLabel = report.readyPct + '%';
    const file2 = buckets.d7 > 0 ? 'warn' : 'ok';

    return '<div class="inf-head"><div><h1>يهماء لتأجير السيارات</h1><div class="ptag">إنفوجرافيك مؤشرات الأداء الرئيسية</div><div class="crumbline">' + escapeHtml(preset) + ' · ' + escapeHtml(range) + ' · الفرع: ' + escapeHtml(branchFilter) + escapeHtml(modelFilter) + '</div></div><div class="badges"><div class="inf-badge">رقم <b>I-' + String(generated.getFullYear()).slice(-2) + String(generated.getMonth() + 1).padStart(2, '0') + String(generated.getDate()).padStart(2, '0') + '-' + String(generated.getHours()).padStart(2, '0') + String(generated.getMinutes()).padStart(2, '0') + '</b></div><div class="inf-badge">' + generated.toLocaleDateString('ar-SA-u-ca-gregory') + '</div></div></div>' +
      '<div class="inf-body"><div class="inf-hero"><div class="inf-hero-text"><h2>نسبة جاهزية الأسطول</h2><div class="big">' + readyLabel + '<small>جاهز فعليًا</small></div><div class="sub">من إجمالي ' + report.total + ' سيارة ضمن الفترة. ' + report.ready + ' عربية جاهزة للتأجير، ' + report.notReady + ' غير جاهزة، ' + report.maint + ' في الصيانة، ' + report.out + ' خارج الخدمة. مهام تجهيز مفتوحة: ' + report.prepOpen + '، منها ' + report.prepOverdue + ' متأخرة.</div></div><div><div style="display:flex;gap:14px;align-items:center">' + infographicDonut(report.total, report.ready, report.notReady, report.maint, report.out) + '<div style="display:flex;flex-direction:column;gap:6px;flex:1">' + infographicDonutLegend(report.ready, report.notReady, report.maint, report.out, report.total) + '</div></div></div></div>' +
      '<div class="inf-kpi-grid">' + tile('إيراد شهري متوقع', formatCurrency(acc.monthPotential), 'متوسط السعر اليومي × السيارات النشطة × 30 يوم', 'ok', '<span>تقديري</span>') + tile('إيراد فعلي مسجل', formatCurrency(acc.estMonthRev), 'مجموع (السعر × أيام التأجير الفعلية)', 'inf-tile-info', '<span>للفترة</span>') + tile('تكاليف صيانة', formatCurrency(acc.maintCost), 'مجموع تكاليف آخر صيانة المسجلة', 'bad') + tile('صافي تقديري', formatCurrency(acc.netEst), acc.netEst >= 0 ? 'إيراد − تكاليف' : 'انتبه: التكاليف أعلى من الإيراد', acc.netEst >= 0 ? 'ok' : 'bad') + tile('الإيراد لكل سيارة', formatCurrency(acc.revPerCar), 'شهريًا · ' + acc.active + ' نشطة', '') + tile('متوسط السعر اليومي', formatCurrency(acc.avgDaily), 'من أسعار السيارات المسجلة', 'warn') + tile('مهام متأخرة', report.prepOverdue, 'من إجمالي ' + report.prepOpen + ' مفتوحة', report.prepOverdue ? 'bad' : 'ok') + tile('مستندات منتهية', buckets.overdue, 'منتهي فعلًا', buckets.overdue ? 'bad' : 'ok') + '</div>' +
      '<div class="inf-row"><div class="inf-card"><div class="inf-section-title">أعلى أسباب عدم الجاهزية</div><div class="inf-fails">' + failBars + '</div></div><div class="inf-card"><div class="inf-section-title">أداء الفروع (أعلى 3)</div><div class="inf-fails">' + branchBars + '</div></div></div>' +
      '<div class="inf-card"><div class="inf-section-title">حالة المستندات</div><div class="inf-files"><div class="inf-file bad"><b>' + buckets.overdue + '</b><span>منتهية</span></div><div class="inf-file warn"><b>' + buckets.d7 + '</b><span>خلال 7 أيام</span></div><div class="inf-file ' + file2 + '"><b>' + buckets.d30 + '</b><span>خلال 30 يوم</span></div><div class="inf-file ok"><b>' + buckets.d90 + '</b><span>خلال 90 يوم</span></div></div></div></div>' +
      '<div class="inf-foot"><span>منصة يهماء لتأجير السيارات — إنفوجرافيك مولّد آليًا</span><span>الإصدار v12</span><span>' + generated.toLocaleString('ar-SA-u-ca-gregory') + '</span></div>';
  }


  global.YahmaReportsTemplates = {
    formatCurrency, escapeHtml,
    reportFileName, reportTextSummary, formalReportHtml,
    infographicFileName, infographicTextSummary, infographicDonut,
    infographicDonutLegend, infographicHtml
  };
})(typeof window !== 'undefined' ? window : this);
