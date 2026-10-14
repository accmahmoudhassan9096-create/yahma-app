(function (global) {
  'use strict';

function renderDashboard(content, context){
  const fleet = Array.isArray(context.fleet) ? context.fleet : [];
  const setCurrentTab = context.setCurrentTab;
  document.getElementById('topbar-title').textContent = 'يهماء لتأجير السيارات';
  document.getElementById('topbar-sub').textContent = 'منصة تحضير الأسطول للتأجير';

  const st = readinessStats();
  const reasons = readinessReasons(st);
  const total = st.total || 0;
  const ready = st.ready || 0;
  const notReady = Math.max(0, (st.out||0) + (st.other||0) + (st.inspection||0));
  const available = ready;
  const rented = fleet.filter(c => String(c.carStatus||'').includes('مؤجر')).length;
  // قيد التجهيز بالمعيار: أوراق ناقصة (كارت/رخصة/تأمين/فحص) — البطاقة تعرض الكل، والدونات يستبعد الصيانة والخارجة (لهما مواضعهما)
  const docFailing = c => vehicleReadiness(c).failed.some(x => x.key === 'card' || x.key === 'license' || x.key === 'insurance' || x.key === 'inspection');
  const outStatus = c => { const s = String(c.carStatus || ''); return s.includes('خارج') || s.includes('مسروق') || s.includes('محول') || s.includes('مفقود'); };
  const maintStatus = c => String(c.carStatus || '').includes('صيانة');
  const inPrepExcl = fleet.filter(c => docFailing(c) && !maintStatus(c) && !outStatus(c)).length;
  // بطاقات التجديد لكل وثيقة (قد تتداخل: السيارة الواحدة تُعد في كل وثيقة ناقصة)
  const renInsp = fleet.filter(c => inspectionDisplayStatus(c.inspectionStatus).level !== 'green').length;
  const renLic = fleet.filter(c => dateStatus(c.licenseExpiry).level !== 'green').length;
  const renIns = fleet.filter(c => textTag(c.insuranceStatus).level !== 'green').length;

  /* ===== تصدير الرئيسية =====
     مفيش جدول في الشاشة، فبن export مُلخّص تنفيذي + توزيع الفروع.
     ده اللي المستخدم محتاج ينسخه لما يطلب تقرير الحالة. */
  window._yahmaCurrentPdfData = () => {
    const rows = [];
    const summary = [
      ['إجمالي الأسطول', total],
      ['جاهزة للتأجير', ready],
      ['قيد التجهيز (أوراق ناقصة)', inPrepExcl],
      ['غير جاهزة', notReady],
      ['مؤجرة', rented],
      ['تحت الصيانة', fleet.filter(maintStatus).length],
      ['خارج الخدمة', fleet.filter(outStatus).length],
      ['فحص مطلوب', renInsp],
      ['رخص تحتاج متابعة', renLic],
      ['تأمين يحتاج متابعة', renIns],
      ['نسبة الجاهزية', (total ? Math.round(ready / total * 1000) / 10 : 0) + '%']
    ];
    summary.forEach(function (r) { rows.push([r[0], String(r[1])]); });

    /* توزيع الفروع — الجزء المفيد فعلًا في تقرير الحالة */
    const byBranch = new Map();
    fleet.forEach(function (c) {
      const b = String(c.branch || '').trim() || 'بدون فرع';
      const cur = byBranch.get(b) || { total: 0, ready: 0 };
      cur.total++;
      try { if (vehicleReadiness(c).ready) cur.ready++; } catch (_) {}
      byBranch.set(b, cur);
    });
    Array.from(byBranch.entries())
      .sort(function (a, b) { return b[1].total - a[1].total; })
      .forEach(function (e) {
        rows.push([e[0], String(e[1].total), String(e[1].ready), String(e[1].total - e[1].ready)]);
      });

    return {
      title: 'الملخص التنفيذي للأسطول',
      subtitle: 'إجمالي ' + total + ' سيارة — جاهزة ' + ready + ' — ' + new Date().toLocaleDateString('ar-EG'),
      headers: ['البند / الفرع', 'الإجمالي', 'جاهزة', 'غير جاهزة'],
      rows: rows
    };
  };
  const renCard = fleet.filter(c => cardDisplayStatus(c.cardExpiry, c.cardStatus).level !== 'green').length;
  let finalReview = 0;
  // مراجعة نهائية
  try {
    finalReview = fleet.filter(c => vehicleReadiness(c).ready && !(typeof prepChecklistForCar==='function' && prepChecklistForCar(c).final)).length;
  } catch(e) { finalReview = 0; }

  // نسب الكروت
  const pct = (n) => total ? Math.round(n / total * 1000) / 10 : 0;
  const pReady = pct(ready);
  const pRenInsp = pct(renInsp);
  const pRenLic = pct(renLic);
  const pRenIns = pct(renIns);
  const pRenCard = pct(renCard);

  // فروع
  const branch = {};
  fleet.forEach(c => {
    const b = c.branch || 'غير محدد';
    branch[b] = branch[b] || { total: 0, ready: 0, city: '' };
    if (!branch[b].city && c.city) branch[b].city = String(c.city).trim();
    branch[b].total++;
    if (vehicleReadiness(c).ready) branch[b].ready++;
  });
  const topBranches = Object.entries(branch)
    .map(([name, x]) => ({ name, ...x, notReady: x.total - x.ready, pct: x.total ? Math.round(x.ready / x.total * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  // خريطة الفروع: كل فرع بإحداثيات مدينته + نمو فرعي من اللقطات
  const branchFull = Object.entries(branch).map(([name, x]) => {
    const city = (typeof cityOfBranch === 'function') ? cityOfBranch(name, x.city) : { name: 'الرياض', lat: 24.63, lng: 46.68 };
    return { name, total: x.total, ready: x.ready, city: city.name, lat: city.lat, lng: city.lng };
  }).sort((a, b) => b.total - a.total);
  branchFull.forEach((b, i, arr) => {
    const same = arr.filter(x => x.lat === b.lat && x.lng === b.lng);
    const k = same.indexOf(b);
    const ang = k * 2.39996, dist = 0.022 * Math.sqrt(k + 1);
    b.mlat = b.lat + dist * Math.sin(ang);
    b.mlng = b.lng + dist * Math.cos(ang);
  });

  // حالة الأسطول — مستوى الشركة بالترتيب المعتمد
  const stOf = c => String(c.carStatus || '').trim();
  const statusRows = [
    { label: 'تحت الصيانة', color: '#E6A23C', match: s => s.includes('صيانة') },
    { label: 'حجز', color: '#D6952A', match: s => s === 'حجز' },
    { label: 'متاحة للايجار', color: '#0BAA86', match: s => { const n = normStatus(s); return n === 'متاحه للايجار' || n === 'موجوده' || n === 'نشط'; } },
    { label: 'محولة غير مستلمة', color: '#7C5CFF', match: s => s.includes('محول') },
    { label: 'مسروقة', color: '#991B1B', match: s => s.includes('مسروق') },
    { label: 'معروضة للبيع', color: '#3B82C4', match: s => normStatus(s) === 'معروضه للبيع' },
    { label: 'مؤجرة', color: '#2FA36B', match: s => s.includes('مؤجر') },
    { label: 'خدمة', color: '#0EA5E9', match: s => s === 'خدمة' },
    { label: 'مفقودة', color: '#4B5563', match: s => s.includes('مفقود') }
  ].map(r => ({ label: r.label, color: r.color, match: r.match, n: fleet.filter(c => r.match(stOf(c))).length }));
  const matchedIds = new Set();
  fleet.forEach(c => { const s = stOf(c); if (statusRows.some(r => r.match(s))) matchedIds.add(c.id); });
  const otherCars = fleet.filter(c => !matchedIds.has(c.id));
  statusRows.push({ label: 'أخرى', color: '#9AA5B1', n: otherCars.length, more: true });
  // خريطة المناطق: تجميع الفروع + لقطة يومية لمعدل النمو (يبدأ القياس من أول يوم)
  const regionStats = (typeof REGION_DEFS !== 'undefined' ? REGION_DEFS : []).map(r => ({ ...r, total: 0, branches: {} }));
  const regionById = {};
  regionStats.forEach(r => { regionById[r.id] = r; });
  fleet.forEach(c => {
    const b = (c.branch || 'غير محدد').trim() || 'غير محدد';
    const rid = (typeof regionOfBranch === 'function') ? regionOfBranch(b, c.city) : 'central';
    const r = regionById[rid] || regionById.central;
    r.total++;
    r.branches[b] = (r.branches[b] || 0) + 1;
  });
  const REG_HIST_KEY = 'yahma-region-history-v1';
  const readHist = () => { try { const a = JSON.parse(localStorage.getItem(REG_HIST_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e) { return []; } };
  const todayIso = new Date().toISOString().slice(0, 10);
  let regHist = readHist();
  const branchSnap = {};
  branchFull.forEach(b => { branchSnap[b.name] = b.total; });
  if (!regHist.length || regHist[regHist.length - 1].d !== todayIso) {
    regHist.push({ d: todayIso, west: (regionById.west || { total: 0 }).total, east: (regionById.east || { total: 0 }).total, central: (regionById.central || { total: 0 }).total, branches: branchSnap });
    regHist = regHist.slice(-90);
    try { localStorage.setItem(REG_HIST_KEY, JSON.stringify(regHist)); } catch(e) {}
  }
  const histBase = (() => {
    if (regHist.length < 2) return null;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const iso = weekAgo.toISOString().slice(0, 10);
    const found = regHist.filter(h => h.d <= iso);
    return (found.length ? found[found.length - 1] : regHist[0]);
  })();
  regionStats.forEach(r => {
    const base = histBase ? (+histBase[r.id] || 0) : null;
    r.delta = base === null ? null : r.total - base;
    r.growth = (base === null || !base) ? null : Math.round((r.total - base) / base * 1000) / 10;
    r.since = histBase ? histBase.d : null;
    r.topBranches = Object.entries(r.branches).sort((a, b) => b[1] - a[1]).slice(0, 5);
  });
  const mapMode = (() => { try { return localStorage.getItem('yahma-map-mode') || 'regions'; } catch(e) { return 'regions'; } })();
  branchFull.forEach(b => {
    const base = (histBase && histBase.branches) ? (+histBase.branches[b.name] || 0) : null;
    b.delta = base === null ? null : b.total - base;
    b.growth = (base === null || !base) ? null : Math.round((b.total - base) / base * 1000) / 10;
    b.pct = b.total ? Math.round(b.ready / b.total * 100) : 0;
  });
  /* ===== قائمة عمل الفروع: نواقص الأوراق مجمّعة لكل فرع + رسالة واتساب بضغطة ===== */
  const DOC_KEYS = [
    { key: 'card', label: 'الكارت', icon: '🪪' },
    { key: 'license', label: 'الرخصة', icon: '📄' },
    { key: 'insurance', label: 'التأمين', icon: '🛡️' },
    { key: 'inspection', label: 'الفحص', icon: '🔍' }
  ];
  const wqOut = c => { const s = String(c.carStatus || ''); return s.includes('خارج') || s.includes('مسروق') || s.includes('مفقود') || s.includes('محول'); };
  const wqLabel = (k) => (DOC_KEYS.find(d => d.key === k) || {}).label || k;
  const workMap = {};
  fleet.forEach(c => {
    const r = vehicleReadiness(c);
    if (r.ready || wqOut(c)) return;
    const keys = r.failed.filter(x => DOC_KEYS.some(d => d.key === x.key)).map(x => x.key);
    if (!keys.length) return;
    const name = (c.branch || 'غير محدد').trim() || 'غير محدد';
    const w = workMap[name] || (workMap[name] = { name, total: 0, gap: [], byDoc: { card: 0, license: 0, insurance: 0, inspection: 0 } });
    w.total++;
    w.gap.push({ plate: c.plate || '—', docs: keys.map(wqLabel), id: c.id });
    DOC_KEYS.forEach(d => { if (keys.includes(d.key)) w.byDoc[d.key]++; });
  });
  const workQueue = Object.values(workMap)
    .map(w => ({ ...w, pctReady: w.total ? Math.round((w.total - w.gap.length) / w.total * 100) : 0 }))
    .sort((a, b) => b.gap.length - a.gap.length);
  const wqCars = workQueue.reduce((s, w) => s + w.gap.length, 0);
  const wqDocTotals = DOC_KEYS.map(d => ({ ...d, n: workQueue.reduce((s, w) => s + w.byDoc[d.key], 0) }));
  const wqDate = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
  const wqMessage = (w) => {
    const L = [];
    L.push('⛔ طلب استكمال أوراق — ' + w.name);
    L.push('التاريخ: ' + wqDate);
    L.push('');
    L.push('السيارات الناقصة: ' + w.gap.length + ' من ' + w.total + ' (الجاهزية ' + w.pctReady + '%)');
    const top = DOC_KEYS.filter(d => w.byDoc[d.key] > 0).map(d => d.icon + ' ' + d.label + ': ' + w.byDoc[d.key]).join(' · ');
    if (top) L.push('النواقص: ' + top);
    L.push('');
    w.gap.slice(0, 40).forEach((g, i) => { L.push((i + 1) + ') ' + g.plate + ' — ناقص: ' + g.docs.join(' + ')); });
    if (w.gap.length > 40) L.push('… و' + (w.gap.length - 40) + ' سيارة أخرى (القائمة كاملة في التطبيق)');
    L.push('');
    L.push('برجاء الإجراء وإبلاغ الإدارة فور الانتهاء. شكرًا تعاونكم.');
    return L.join('\n');
  };
  const wqMessageAll = () => {
    const L = ['⛔ طلب استكمال أوراق — كل الفروع', 'التاريخ: ' + wqDate, '', 'إجمالي السيارات الناقصة: ' + wqCars, ''];
    workQueue.slice(0, 25).forEach(w => {
      L.push('■ ' + w.name + ' — ' + w.gap.length + '/' + w.total + ' ناقصة');
      w.gap.slice(0, 8).forEach(g => L.push('   • ' + g.plate + ' — ' + g.docs.join(' + ')));
      if (w.gap.length > 8) L.push('   … و' + (w.gap.length - 8) + ' أخرى');
      L.push('');
    });
    return L.join('\n');
  };
  // أسباب عدم الجاهزية بنسب
  /* ===== توقّع دوران الأسطول + المنحنى التاريخي ===== */
  const churn = (typeof churnStats === 'function') ? churnStats(fleet)
    : { total: 0, buckets: {}, docs: {}, riskList: [], risk30: 0 };
  const churnRows = (typeof CHURN_BUCKETS !== 'undefined' ? CHURN_BUCKETS : [])
    .map(b => ({ ...b, cars: (churn.buckets[b.id] || {}).cars || 0, docs: (churn.buckets[b.id] || {}).docs || 0 }));
  const churnSum = churnRows.reduce((s, r) => s + r.cars, 0) || 1;
  const churnQuick = { expired: 'exp_now', d30: 'exp_30', d60: 'exp_60', d90: 'exp_90' };
  const docStats = (typeof CHURN_DOCS !== 'undefined' ? CHURN_DOCS : []).map(d => ({ ...d, ...(churn.docs[d.key] || { expired: 0, d30: 0, d90: 0, total: 0 }) }));
  /* لقطة يومية ب Gesamt العدد والجاهزية (تغذّي المنحنى) */
  if (!regHist.length || regHist[regHist.length - 1].d !== todayIso) {
    const last = regHist[regHist.length - 1];
    if (!last || last.total === undefined) {
      regHist.push(Object.assign({}, last || {}, {
        d: todayIso, west: (regionById.west || { total: 0 }).total, east: (regionById.east || { total: 0 }).total,
        central: (regionById.central || { total: 0 }).total, branches: branchSnap,
        total: fleet.length, ready: ready, pct: pReady
      }));
      regHist = regHist.slice(-90);
      try { localStorage.setItem(REG_HIST_KEY, JSON.stringify(regHist)); } catch(e) {}
    }
  }
  const trend = regHist.filter(h => h && typeof h.total === 'number').slice(-30);
  const trendSvg = (() => {
    if (trend.length < 2) return '';
    const W = 620, H = 152, PL = 36, PR = 38, PT = 12, PB = 22;
    const iw = W - PL - PR, ih = H - PT - PB;
    const totals = trend.map(h => h.total);
    const pcts = trend.map(h => h.pct || 0);
    const tMax = Math.max(...totals), tMin = Math.min(...totals);
    const tPad = Math.max(1, Math.round((tMax - tMin) * 0.25));
    const lo = Math.max(0, tMin - tPad), hi = tMax + tPad;
    const x = (i) => PL + (trend.length === 1 ? iw / 2 : (i / (trend.length - 1)) * iw);
    const yT = (v) => PT + ih - ((v - lo) / (hi - lo || 1)) * ih;
    const yP = (v) => PT + ih - (v / 100) * ih;
    const line = (arr, yf) => arr.map((v, i) => (i ? 'L ' : 'M ') + x(i).toFixed(1) + ' ' + yf(v).toFixed(1)).join(' ');
    const area = line(totals, yT) + ' L ' + x(trend.length - 1).toFixed(1) + ' ' + (PT + ih) + ' L ' + x(0).toFixed(1) + ' ' + (PT + ih) + ' Z';
    let grid = '';
    [0, 50, 100].forEach(p => { grid += '<line x1="' + PL + '" y1="' + yP(p).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + yP(p).toFixed(1) + '" stroke="rgba(21,35,80,.10)" stroke-width="1" stroke-dasharray="3 4"/>'; });
    const dots = trend.map((h, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + yT(h.total).toFixed(1) + '" r="2.6" fill="#C6952E"><title>' + escapeHtml(h.d + ' — ' + h.total + ' سيارة · جاهزية ' + (h.pct || 0) + '%') + '</title></circle>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="منحنى عدد السيارات ونسبة الجاهزية" style="display:block;width:100%;height:auto">' +
      grid +
      '<path d="' + area + '" fill="rgba(198,149,46,.12)"/>' +
      '<path d="' + line(pcts, yP) + '" fill="none" stroke="#0BAA86" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="' + line(totals, yT) + '" fill="none" stroke="#C6952E" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      '<text x="' + PL + '" y="' + (PT + 9) + '" font-size="10" fill="#8A93AD">100%</text>' +
      '<text x="' + PL + '" y="' + (PT + ih) + '" font-size="10" fill="#8A93AD">0%</text>' +
      '<text x="' + (W - PR - 30) + '" y="' + (PT + 9) + '" font-size="10" fill="#8A93AD">' + hi + '</text>' +
      '<text x="' + (W - PR - 30) + '" y="' + (PT + ih) + '" font-size="10" fill="#8A93AD">' + lo + '</text>' +
      '<text x="' + PL + '" y="' + (H - 6) + '" font-size="10" fill="#8A93AD">' + escapeHtml(trend[0].d) + '</text>' +
      '<text x="' + (W - PR - 44) + '" y="' + (H - 6) + '" font-size="10" fill="#8A93AD" text-anchor="end">' + escapeHtml(trend[trend.length - 1].d) + '</text>' +
      '</svg>';
  })();

  const reasonTotal = reasons.reduce((s, [, v]) => s + v, 0) || 1;
  const reasonRows = reasons.slice(0, 5).map(([k, v]) => ({
    label: k, count: v, pct: Math.round(v / reasonTotal * 1000) / 10
  }));

  // مقياس الجاهزية (SVG): مناطق أحمر/كهرمان/أخضر + إبرة عند النسبة (عتبة 70% كالتقارير)
  const gF = total ? Math.min(1, Math.max(0, ready / total)) : 0;
  const gP = (f) => { const a = Math.PI * (1 - f); return [100 + 78 * Math.cos(a), 106 - 78 * Math.sin(a)]; };
  const gArc = (f0, f1) => { const p0 = gP(f0), p1 = gP(f1); return 'M ' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A 78 78 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); };
  const gA = Math.PI * (1 - gF);
  const gNx = 100 + 56 * Math.cos(gA), gNy = 106 - 56 * Math.sin(gA);
  let gTicks = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    const a = Math.PI * (1 - f);
    gTicks += '<line x1="' + (100 + 60 * Math.cos(a)).toFixed(1) + '" y1="' + (106 - 60 * Math.sin(a)).toFixed(1) +
      '" x2="' + (100 + 68 * Math.cos(a)).toFixed(1) + '" y2="' + (106 - 68 * Math.sin(a)).toFixed(1) +
      '" stroke="var(--ink)" stroke-width="2" opacity=".35"/>';
  });
  const gaugeSvg = '<svg viewBox="0 0 200 128" role="presentation" style="display:block;width:200px;height:auto">'
    + '<path d="' + gArc(0, 0.5) + '" fill="none" stroke="#E64B4B" stroke-width="18" stroke-linecap="round"/>'
    + '<path d="' + gArc(0.5, 0.7) + '" fill="none" stroke="#E6A23C" stroke-width="18"/>'
    + '<path d="' + gArc(0.7, 1) + '" fill="none" stroke="#0BAA86" stroke-width="18" stroke-linecap="round"/>'
    + gTicks
    + '<line x1="100" y1="106" x2="' + gNx.toFixed(1) + '" y2="' + gNy.toFixed(1) + '" style="stroke:var(--ink)" stroke-width="5" stroke-linecap="round"/>'
    + '<circle cx="100" cy="106" r="9" style="fill:var(--ink)"/>'
    + '<text x="100" y="74" text-anchor="middle" font-size="23" font-weight="800" style="fill:var(--ink)">' + pReady + '%</text></svg>';

  // مهامي اليوم من مهام التجهيز
  const today = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
  let todayTasks = [];
  try {
    const tasks = getPrepTasks();
    const needInsp = fleet.filter(c => vehicleReadiness(c).label === 'تحتاج فحص').length;
    const cardSoon = fleet.filter(c => dateStatus(c.cardExpiry).level !== 'green').length;
    const licSoon = fleet.filter(c => dateStatus(c.licenseExpiry).level !== 'green').length;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;
    todayTasks = [
      { n: needInsp, label: 'سيارات تحتاج فحص', go: 'inspections', alert: false },
      { n: cardSoon, label: 'تجديد كارت قريب الانتهاء', go: 'inspections', alert: false },
      { n: licSoon, label: 'تجديد رخصة قريب الانتهاء', go: 'license-renewals', alert: false },
      { n: overdue, label: 'مهام متأخرة', go: 'preparation', alert: true }
    ].filter(x => x.n > 0);
    if (!todayTasks.length) {
      todayTasks = [{ n: 0, label: 'لا توجد مهام عاجلة اليوم', go: 'preparation', alert: false }];
    }
  } catch(e) {
    todayTasks = [{ n: 0, label: 'لا توجد مهام', go: 'preparation', alert: false }];
  }
  const todayCount = todayTasks.reduce((s, t) => s + (t.n || 0), 0);

  // أحدث النشاطات من audit + prepEvents
  let activity = [];
  try {
    const audit = JSON.parse(localStorage.getItem('fleet-audit-v1') || '[]');
    activity = audit.slice(0, 8).map(a => ({
      time: a.displayAt || a.at || '',
      title: a.action || 'نشاط',
      detail: a.detail || a.user || '',
      icon: '•'
    }));
  } catch(e) {}
  if (activity.length < 4) {
    try {
      const events = [];
      fleet.forEach(c => {
        (c.prepEvents || []).forEach(ev => events.push({
          time: ev.at || '',
          title: ev.title || 'حدث تجهيز',
          detail: (c.plate || '') + (ev.details ? ' — ' + ev.details : ''),
          icon: '✓'
        }));
      });
      events.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      activity = activity.concat(events.slice(0, 8 - activity.length));
    } catch(e) {}
  }
  if (!activity.length) {
    activity = [
      { time: '—', title: 'لا توجد نشاطات مسجلة بعد', detail: 'ستظهر هنا التحديثات والاعتمادات', icon: '•' }
    ];
  }

  // Donut SVG — segments: ready, inPrep, notReady, finalReview
  // Use ready, inPrep-ish, notReady, finalReview for legend matching image
  const dReady = ready;
  const dPrep = Math.max(0, inPrepExcl);
  const dNeed = Math.max(0, notReady - inPrepExcl);
  const dFinal = finalReview;
  const dSum = dReady + dPrep + dNeed + dFinal || 1;
  const colors = ['#0BAA86', '#E6A23C', '#E64B4B', '#3B82C4'];
  const segs = [
    { v: dReady, c: colors[0], label: 'جاهزة للتأجير' },
    { v: dPrep, c: colors[1], label: 'قيد التجهيز' },
    { v: dNeed, c: colors[2], label: 'تحتاج إجراء' },
    { v: dFinal, c: colors[3], label: 'مراجعة نهائية' }
  ];
  // build conic-gradient style
  let acc = 0;
  const conicParts = segs.map(s => {
    const start = acc;
    acc += (s.v / dSum) * 100;
    return `${s.c} ${start}% ${acc}%`;
  }).join(', ');

  const fmtTime = (t) => {
    if (!t) return '—';
    try {
      const d = new Date(t);
      if (isNaN(d)) return String(t).slice(0, 16);
      return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    } catch(e) { return String(t).slice(0, 10); }
  };
  const isToday = (t) => {
    if (!t) return false;
    try { return new Date(t).toISOString().slice(0, 10) === today; } catch(e) { return false; }
  };

  content.innerHTML = `
  <div class="home-dash">
    <!-- Hero -->
    <div class="home-hero hero-executive">
      <div class="home-hero-skyline" aria-hidden="true"></div>
      <div class="home-hero-text hero-welcome-card">
        <div class="hero-welcome-kicker"><span class="hero-live-dot"></span> لوحة التحكم التنفيذية</div>
        <div class="home-hero-title-row">
          <span class="home-hero-accent" aria-hidden="true"></span>
          <div class="home-hero-title-copy">
            <h2>مرحباً بك في منصة إدارة الأسطول</h2>
            <p>نظرة سريعة على جاهزية سياراتك وحالة التشغيل اليوم.</p>
          </div>
        </div>
        <div class="hero-summary-stats" aria-label="ملخص الأسطول">
          <div class="hero-summary-stat"><b>${total}</b><span>إجمالي السيارات</span></div>
          <div class="hero-summary-stat"><b>${available}</b><span>السيارات المتاحة</span></div>
          <div class="hero-summary-stat"><b>${rented}</b><span>السيارات المؤجرة</span></div>
        </div>
      </div>
      <div class="home-hero-gauge hero-gauge" role="img" aria-label="مقياس جاهزية الأسطول ${pReady}%">
        <div class="hero-gauge-title">مقياس الجاهزية</div>
        ${gaugeSvg}
        <div class="hero-gauge-sub">${ready.toLocaleString('en')} من ${total.toLocaleString('en')} سيارة</div>
      </div>
      <div class="home-hero-car hero-car-clean" aria-hidden="true"><video class="home-hero-car-img home-hero-video" autoplay muted loop playsinline preload="metadata" poster="assets/dashboard-hero.png"><source src="assets/hero-video.mp4" type="video/mp4"></video></div>
    </div>

    <!-- KPI row -->
    <div class="home-kpis">
      <div class="home-kpi" data-go="fleet">
        <div class="home-kpi-icon blue">🚗</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">إجمالي الأسطول</span>
          <b class="home-kpi-num">${total.toLocaleString('en')}</b>
          <a class="home-kpi-link" data-go="fleet">عرض التفاصيل ←</a>
        </div>
      </div>
      <div class="home-kpi good" data-go="fleet" data-filter="ready">
        <div class="home-kpi-icon green">✓</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">سيارات جاهزة للتأجير</span>
          <b class="home-kpi-num">${ready.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--green)" data-w="${pReady}%"></i></div>
          <span class="home-kpi-pct good">${pReady}%</span>
        </div>
      </div>
      <div class="home-kpi warn" data-go="renewals">
        <div class="home-kpi-icon amber">🔍</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">تجديد فحص</span>
          <b class="home-kpi-num">${renInsp.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--amber)" data-w="${pRenInsp}%"></i></div>
          <span class="home-kpi-pct warn">${pRenInsp}%</span>
        </div>
      </div>
      <div class="home-kpi warn" data-go="license-renewals">
        <div class="home-kpi-icon amber">📄</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">تجديد رخصة</span>
          <b class="home-kpi-num">${renLic.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--amber)" data-w="${pRenLic}%"></i></div>
          <span class="home-kpi-pct warn">${pRenLic}%</span>
        </div>
      </div>
      <div class="home-kpi warn" data-go="insurance-renewals">
        <div class="home-kpi-icon amber">🛡️</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">تجديد تأمين</span>
          <b class="home-kpi-num">${renIns.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--amber)" data-w="${pRenIns}%"></i></div>
          <span class="home-kpi-pct warn">${pRenIns}%</span>
        </div>
      </div>
      <div class="home-kpi warn" data-go="inspections">
        <div class="home-kpi-icon amber">🪪</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">تجديد بطاقة تشغيل</span>
          <b class="home-kpi-num">${renCard.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--amber)" data-w="${pRenCard}%"></i></div>
          <span class="home-kpi-pct warn">${pRenCard}%</span>
        </div>
      </div>
    </div>

    <!-- Middle row -->
    <div class="home-mid">
      <div class="home-card">
        <h3>حالة التجهيز</h3>
        <div class="home-donut-wrap">
          <div class="home-donut" style="background:conic-gradient(${conicParts})">
            <div class="home-donut-hole">
              <b>${total.toLocaleString('en')}</b>
              <span>سيارة</span>
            </div>
          </div>
          <div class="home-legend">
            <div class="home-leg"><i style="background:${colors[0]}"></i><span>جاهزة للتأجير</span><b>${dReady.toLocaleString('en')}</b><em>${pct(dReady)}%</em></div>
            <div class="home-leg"><i style="background:${colors[1]}"></i><span>قيد التجهيز</span><b>${dPrep.toLocaleString('en')}</b><em>${pct(dPrep)}%</em></div>
            <div class="home-leg"><i style="background:${colors[2]}"></i><span>تحتاج إجراء</span><b>${dNeed.toLocaleString('en')}</b><em>${pct(dNeed)}%</em></div>
            <div class="home-leg"><i style="background:${colors[3]}"></i><span>مراجعة نهائية</span><b>${dFinal.toLocaleString('en')}</b><em>${pct(dFinal)}%</em></div>
          </div>
        </div>
      </div>

      <div class="home-card">
        <div class="home-card-head">
          <h3>مهامي اليوم</h3>
          <span class="home-badge">${todayCount || todayTasks.length}</span>
        </div>
        <div class="home-tasks">
          ${todayTasks.map(t => `
            <button type="button" class="home-task" data-go="${t.go}">
              <span class="home-task-n ${t.alert ? 'alert' : ''}">${t.n}</span>
              <span class="home-task-label">${escapeHtml(t.label)}</span>
              <span class="home-task-arrow">←</span>
            </button>`).join('')}
        </div>
        <button type="button" class="home-link-all" data-go="preparation">عرض كل المهام ←</button>
      </div>
    <div class="home-avail">
      <div class="home-avail-head">
        <h3>🚗 حالة الأسطول — مستوى الشركة</h3>
        <span class="home-avail-total">${total} سيارة</span>
      </div>
      <div class="home-avail-legend">
        ${statusRows.map(r => r.more
          ? `<div class="home-avail-leg home-avail-more" role="button" tabindex="0" aria-label="سيارات أخرى غير مصنفة: ${r.n} — اضغط لعرضها"><i style="background:${r.color}"></i><span>${r.label} · اضغط للعرض</span><b>${r.n}</b><em>${pct(r.n)}%</em></div><div class="home-avail-bar"><i style="width:${total ? Math.round(r.n / total * 100) : 0}%;background:${r.color}"></i></div>`
          : `<div class="home-avail-leg"><i style="background:${r.color}"></i><span>${r.label}</span><b>${r.n}</b><em>${pct(r.n)}%</em></div><div class="home-avail-bar"><i style="width:${total ? Math.round(r.n / total * 100) : 0}%;background:${r.color}"></i></div>`).join('')}
        <div class="home-avail-other-detail" id="home-avail-other-detail" style="display:none">
          ${otherCars.slice(0, 100).map(c => `<div><span>${escapeHtml(c.plate || '—')} · ${escapeHtml(c.branch || '—')}</span><b>${escapeHtml(stOf(c) || 'فارغة')}</b></div>`).join('') || '<div class="rd-empty">—</div>'}
          ${otherCars.length > 100 ? `<div class="muted-small">+ ${otherCars.length - 100} أخرى</div>` : ''}
        </div>
      </div>
    </div>
    </div>
    <!-- Regions map -->
    <div class="home-card home-map-card">
      <div class="home-card-head">
        <h3>🗺 خريطة المناطق</h3>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="muted-small">حجم الدائرة = عدد السيارات · ${histBase ? 'النمو منذ ' + histBase.d : 'بداية قياس النمو: اليوم'}</span>
          <button type="button" class="btn btn-ghost btn-small map-mode-btn${mapMode === 'regions' ? ' active' : ''}" data-map-mode="regions">المناطق</button>
          <button type="button" class="btn btn-ghost btn-small map-mode-btn${mapMode === 'branches' ? ' active' : ''}" data-map-mode="branches">الفروع</button>
        </div>
      </div>
      <div class="home-map-wrap">
        <div id="region-map" role="img" aria-label="خريطة توزيع السيارات حسب المنطقة"></div>
        <div class="home-map-legend">
          ${mapMode === 'branches' ? `
          <div class="muted-small" style="margin-bottom:2px">${branchFull.length} فرعًا — اضغط أي نقطة لعرض سيارات الفرع</div>
          ${branchFull.slice(0, 8).map(b => `
          <div class="home-map-leg"><i style="background:${(regionById[(typeof regionOfBranch === 'function' ? regionOfBranch(b.name, b.city) : 'central')] || {}).color || '#E6A23C'}"></i>
            <div class="home-map-leg-body"><b>${escapeHtml(b.name)} — ${b.total.toLocaleString('en')} سيارة</b>
              <span>جاهزية ${b.pct}%${b.delta === null ? ' · نمو: —' : ' · ' + (b.delta >= 0 ? '+' : '') + b.delta + (b.growth === null ? '' : ' (' + b.growth + '%)')}</span>
            </div>
          </div>`).join('')}
          ${branchFull.length > 8 ? `<div class="muted-small">+ ${branchFull.length - 8} فروع أخرى على الخريطة</div>` : ''}` : `
          ${regionStats.map(r => `
          <div class="home-map-leg"><i style="background:${r.color}"></i>
            <div class="home-map-leg-body"><b>${r.label} — ${r.total.toLocaleString('en')} سيارة</b>
              <span>${r.delta === null ? 'نمو: — (أول يوم قياس)' : r.since === todayIso ? 'نمو اليوم: ' + (r.delta >= 0 ? '+' : '') + r.delta : 'النمو: ' + (r.delta >= 0 ? '+' : '') + r.delta + (r.growth === null ? '' : ' (' + (r.growth >= 0 ? '+' : '') + r.growth + '%)') + ' منذ ' + r.since}</span>
              <span class="muted-small">${r.topBranches.map(([b, n]) => escapeHtml(b) + ' (' + n + ')').join(' · ') || '—'}</span>
            </div>
          </div>`).join('')}`}
        </div>
      </div>
    </div>
    <!-- Churn forecast + history -->
    <div class="home-churn-grid">
      <div class="home-card home-churn-card">
        <div class="home-card-head">
          <h3>⏳ توقّع دوران الأسطول</h3>
          <span class="muted-small">أقرب انتهاء بين الكارت والرخصة والتأمين · اضغط أي شريحة لعرض السيارات</span>
        </div>
        <div class="home-churn-bar" role="img" aria-label="توزيع السيارات حسب أقرب تاريخ انتهاء">
          ${churnRows.filter(r => r.cars > 0).map(r => `<button type="button" class="home-churn-seg" data-churn-seg="${r.id}" style="width:${(r.cars / churnSum * 100).toFixed(2)}%;background:${r.color}" title="${escapeHtml(r.label)}: ${r.cars} سيارة"><span>${r.cars}</span></button>`).join('')}
        </div>
        <div class="home-churn-legend">
          ${churnRows.filter(r => r.cars > 0).map(r => `<button type="button" class="home-churn-leg" data-churn-seg="${r.id}"><i style="background:${r.color}"></i><span>${escapeHtml(r.label)}</span><b>${r.cars}</b><em>${Math.round(r.cars / churnSum * 100)}%</em><u>${r.docs} ورقة</u></button>`).join('')}
        </div>
        <div class="home-churn-docs">
          ${docStats.map(d => `<div class="home-churn-doc"><span>${d.icon} ${escapeHtml(d.label)}</span><b>${d.expired}</b><em>منتهية</em><b>${d.d30}</b><em>خلال 30 يوم</em><b>${d.d90}</b><em>خلال 90 يوم</em></div>`).join('')}
        </div>
        ${churn.riskList && churn.riskList.length ? `<div class="home-churn-risk"><span class="muted-small">أعلى الفروع 위험 (منتهية + خلال 30 يوم):</span>${churn.riskList.slice(0, 6).map(([b, n]) => `<button type="button" class="quick-filter" data-churn-branch="${escapeHtml(b)}">${escapeHtml(b)} <b>${n}</b></button>`).join('')}</div>` : ''}
      </div>
      <div class="home-card home-trend-card">
        <div class="home-card-head">
          <h3>📈 تاريخ الأسطول</h3>
          <span class="muted-small">${trend.length >= 2 ? 'عدد السيارات + نسبة الجاهزية — آخر ' + trend.length + ' يوم' : 'بيبدأ التسجيل من اليوم — افتح المنصة يوميًا ليتراكم التاريخ'}</span>
        </div>
        ${trendSvg ? `<div class="home-trend-legend"><span><i style="background:#C6952E"></i>عدد السيارات (${trend[trend.length-1].total})</span><span><i style="background:#0BAA86"></i>الجاهزية (${trend[trend.length-1].pct || 0}%)</span></div>${trendSvg}`
          : `<div class="home-trend-empty"><div class="home-trend-now"><b>${total.toLocaleString('en')}</b><span>سيارة اليوم</span><b>${pReady}%</b><span>الجاهزية</span></div><div class="muted-small">المنحنى بيظهر من يومين不同的 — افتح المنصة كل يوم وسجل يومي تتراكم تلقائيًا.</div></div>`}
      </div>
    </div>
    <!-- Branch work queue -->
    <div class="home-card home-wq-card">
      <div class="home-card-head">
        <h3>⚡ قائمة عمل الفروع</h3>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="muted-small">النواقص = الأوراق الناقصة فقط (لا تشمل خارج/مفقود/مسروب) · رسالة جاهزة بضغطة</span>
          <button type="button" class="btn btn-ghost btn-small" data-wq-all-copy>📋 نسخ الكل</button>
          <button type="button" class="btn btn-primary btn-small" data-wq-all-wa>📲 واتساب (الكل)</button>
        </div>
      </div>
      ${workQueue.length ? `
      <div class="home-wq-chips">
        <span class="home-wq-chip"><b>${workQueue.length}</b> فرع به نواقص</span>
        <span class="home-wq-chip alert"><b>${wqCars}</b> سيارة ناقصة</span>
        ${wqDocTotals.filter(d => d.n).map(d => `<span class="home-wq-chip">${d.icon} ${d.label} <b>${d.n}</b></span>`).join('')}
      </div>
      <div class="home-wq-filters">
        <button type="button" class="quick-filter active" data-wq-doc="">الكل</button>
        ${DOC_KEYS.map(d => `<button type="button" class="quick-filter" data-wq-doc="${d.key}">${d.icon} ${d.label}</button>`).join('')}
      </div>
      <div class="home-wq-list" id="home-wq-list">
        ${workQueue.map((w, i) => `
        <div class="home-wq-row${i >= 10 ? ' wq-more' : ''}" data-wq-row data-wq-name="${escapeHtml(w.name)}"
             data-wq-card="${w.byDoc.card}" data-wq-license="${w.byDoc.license}" data-wq-insurance="${w.byDoc.insurance}" data-wq-inspection="${w.byDoc.inspection}">
          <div class="home-wq-row-head">
            <span class="home-wq-name">${escapeHtml(w.name)}</span>
            <span class="home-wq-count">${w.gap.length} <em>من ${w.total}</em></span>
          </div>
          <div class="home-wq-docs">
            ${DOC_KEYS.filter(d => w.byDoc[d.key] > 0).map(d => `<span class="home-wq-doc">${d.icon} ${d.label} <b>${w.byDoc[d.key]}</b></span>`).join('')}
            <span class="home-wq-ready">جاهزية ${w.pctReady}%</span>
          </div>
          <div class="home-wq-row-actions">
            <button type="button" class="btn btn-primary btn-small" data-wq-wa="${escapeHtml(w.name)}">📲 واتساب</button>
            <button type="button" class="btn btn-ghost btn-small" data-wq-copy="${escapeHtml(w.name)}">📋 نسخ</button>
            <button type="button" class="btn btn-ghost btn-small" data-wq-view="${escapeHtml(w.name)}">عرض السيارات ←</button>
          </div>
          <details class="home-wq-details">
            <summary>قائمة اللوحات (${w.gap.length})</summary>
            <div class="home-wq-plates">
              ${w.gap.map(g => `<div><span>${escapeHtml(g.plate)}</span><em>${escapeHtml(g.docs.join(' + '))}</em></div>`).join('')}
            </div>
          </details>
        </div>`).join('')}
      </div>
      ${workQueue.length > 10 ? `<button type="button" class="home-link-all" data-wq-toggle>عرض كل الفروع (${workQueue.length}) ←</button>` : ''}
      ` : '<div class="empty">كل أوراق الأسطول مستوفية 👍 لا يوجد عمل مطلوب على الفروع.</div>'}
    </div>
    <!-- Bottom row -->
    <div class="home-bottom">
      <div class="home-card">
        <h3>⚠ أعلى سبب عدم الجاهزية</h3>
        <div class="home-reasons">
          ${reasonRows.length ? reasonRows.map(r => `
            <div class="home-reason" data-tip="${escapeHtml(r.label)}: ${r.count} (${r.pct}%)">
              <div class="home-reason-top">
                <span>${escapeHtml(r.label)}</span>
                <b>${r.count}</b>
                <em>${r.pct}%</em>
              </div>
              <div class="home-reason-bar"><i style="width:0%" data-w="${Math.min(100, r.pct)}%"></i></div>
            </div>`).join('') : '<div class="empty">كل السيارات مستوفية للشروط 👍</div>'}
          <div class="home-chart-bars" id="home-reason-chart">
            ${reasonRows.length ? reasonRows.map(r => {
              const maxR = Math.max(...reasonRows.map(x=>x.count),1);
              const h = Math.max(6, Math.round(r.count/maxR*90));
              return `<div class="home-chart-col" data-tip="${escapeHtml(r.label)}: ${r.count}" data-go="fleet">
                <span class="bar-n">${r.count}</span>
                <div class="bar" style="height:0px" data-h="${h}px"></div>
                <span class="bar-l">${escapeHtml(r.label)}</span>
              </div>`;
            }).join('') : ''}
          </div>
        </div>
      </div>

      <div class="home-card">
        <h3>📍 جاهزية الفروع</h3>
        <div class="home-branches">
          <div class="home-br-head"><span>الفرع</span><span>إجمالي</span><span>جاهز</span><span>غير جاهز</span><span>النسبة</span></div>
          ${topBranches.length ? topBranches.map(b => `
            <div class="home-br-row">
              <span class="home-br-name">${escapeHtml(b.name)}</span>
              <span>${b.total}</span>
              <span class="good-text">${b.ready}</span>
              <span class="bad-text">${b.notReady}</span>
              <span class="home-br-pct"><em style="width:0%" data-w="${b.pct}%"></em><b>${b.pct}%</b></span>
            </div>`).join('') : '<div class="empty">لا توجد فروع</div>'}
        </div>
        <button type="button" class="home-link-all" data-go="branches">عرض جميع الفروع ←</button>
      </div>

      <div class="home-card">
        <h3>🕐 أحدث النشاطات</h3>
        <div class="home-activity">
          ${activity.slice(0, 5).map(a => `
            <div class="home-act">
              <div class="home-act-time">
                <b>${escapeHtml(fmtTime(a.time))}</b>
                <span>${isToday(a.time) ? 'اليوم' : (a.time ? String(a.time).slice(0, 10) : '')}</span>
              </div>
              <div class="home-act-body">
                <b>${escapeHtml(a.title)}</b>
                <span>${escapeHtml(a.detail)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;

  // خريطة المناطق (Leaflet تحميل كسول — تعمل أونلاين، والأرقام محفوظة بدونه)
  (function initRegionMap(){
    const el = content.querySelector('#region-map');
    if(!el) return;
    try{ if(window._regionMap){ window._regionMap.remove(); window._regionMap=null; } }catch(_){}
    const drawMap = () => {
      try{
        if(!el.isConnected) return;
        if(typeof L==='undefined'||!L.map) throw new Error('leaflet');
        const dark = document.body.classList.contains('dark-mode');
        const map = L.map(el,{scrollWheelZoom:false}).setView([24.2,45.3],5);
        map.attributionControl.setPrefix(false);
        /* Esri World Street Map: يعمل مباشرة من المتصفح بلا مفاتيح + بلاطة بديلة إن فشل التحميل */
        const errTile = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#E8F1F1"/></svg>');
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          {maxZoom:12,attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',errorTileUrl:errTile,className:dark?'esri-dark-tiles':''}).addTo(map);
        const max = Math.max(1, ...regionStats.map(r=>r.total));
        const branchGrowth = (b) => b.delta === null ? 'النمو: —' : ('النمو ' + (b.delta >= 0 ? '+' : '') + b.delta + (b.growth === null ? '' : ' (' + b.growth + '%)'));
        if (mapMode === 'branches') {
          const bounds = [];
          const maxB = Math.max(1, ...branchFull.map(b=>b.total));
          branchFull.forEach(b => {
            const rid = (typeof regionOfBranch === 'function') ? regionOfBranch(b.name, b.city) : 'central';
            const col = ((regionById[rid]) || {}).color || '#E6A23C';
            const rad = 7 + Math.min(20, Math.sqrt(b.total / maxB) * 22);
            const m = L.circleMarker([b.mlat, b.mlng], { radius: rad, color: col, weight: 2, fillColor: col, fillOpacity: .85 }).addTo(map);
            m.bindTooltip('<b>' + escapeHtml(b.name) + '</b><br>' + b.total + ' سيارة', { direction: 'top', className: 'region-tip' });
            m.bindPopup('<b>' + escapeHtml(b.name) + ' (' + b.total + ')</b><br>جاهزية ' + b.pct + '% · ' + escapeHtml(branchGrowth(b)) +
              '<br><button type="button" class="btn btn-primary btn-small" data-region-branch="' + escapeHtml(b.name) + '" style="margin-top:8px">عرض السيارات ←</button>');
            bounds.push([b.mlat, b.mlng]);
          });
          if (bounds.length > 1) { try { map.fitBounds(bounds, { padding: [30, 30] }); } catch(e) {} }
          map.on('popupopen', e => {
            try {
              const btn = e.popup.getElement().querySelector('[data-region-branch]');
              if (btn && !btn._bound) {
                btn._bound = true;
                btn.onclick = () => {
                  try { map.closePopup(); } catch(_){}
                  window.pendingFleetBranch = btn.dataset.regionBranch;
                  const nav = document.querySelector('.nav-item[data-tab="fleet"]');
                  if (nav) nav.click();
                  if (typeof render === 'function') render();
                };
              }
            } catch(_){}
          });
        } else {
        regionStats.forEach(r=>{
          if(!(r.total>0)) return;
          const rad = 25000 + Math.sqrt(r.total/max)*90000;
          const c = L.circle([r.lat,r.lng],{radius:rad,color:r.color,weight:2,fillColor:r.color,fillOpacity:.35}).addTo(map);
          const g = r.delta===null ? 'بداية القياس اليوم' : ('النمو '+(r.delta>=0?'+':'')+r.delta+(r.growth===null?'':' ('+r.growth+'%)'));
          c.bindTooltip('<b>'+escapeHtml(r.label)+'</b><br>'+r.total+' سيارة<br>'+escapeHtml(g),{permanent:true,direction:'top',className:'region-tip'});
          c.bindPopup('<b>'+escapeHtml(r.label)+' ('+r.total+')</b><br>'+r.topBranches.map(([b,n])=>escapeHtml(b)+': '+n).join('<br>'));
        });
        }
        setTimeout(()=>{ try{ map.invalidateSize(); }catch(_){} }, 200);
        window._regionMap = map;
      }catch(e){
        el.innerHTML = '<div class="empty">تعذر تحميل الخريطة (تحقق من الإنترنت) — الأرقام بجانبها محدثة.</div>';
      }
    };
    setTimeout(()=>{
      try{
        if(typeof L!=='undefined' && L.map){ drawMap(); return; }
        const css='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        if(!document.querySelector('link[data-leaflet]')){
          const l=document.createElement('link'); l.rel='stylesheet'; l.href=css; l.setAttribute('data-leaflet','1'); document.head.appendChild(l);
        }
        const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.async=true;
        s.onload=drawMap;
        s.onerror=()=>{ el.innerHTML='<div class="empty">تعذر تحميل الخريطة (تحقق من الإنترنت) — الأرقام بجانبها محدثة.</div>'; };
        document.head.appendChild(s);
      }catch(e){}
    }, 300);
  })();

  content.querySelectorAll('.map-mode-btn').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem('yahma-map-mode', b.dataset.mapMode); } catch(e) {}
    if (typeof render === 'function') render();
  }));

  /* ===== توقّع الدوران: الانتقال للأسطول بالفلتر المناسب ===== */
  const churnGo = (bucketId, branch) => {
    window.pendingFleetQuickFilter = churnQuick[bucketId] || '';
    window.pendingFleetBranch = branch || '';
    window.pendingFleetPlates = null;
    const nav = document.querySelector('.nav-item[data-tab="fleet"]');
    if (nav) nav.click();
    if (typeof render === 'function') render();
  };
  content.querySelectorAll('[data-churn-seg]').forEach(b => b.addEventListener('click', () => churnGo(b.dataset.churnSeg, '')));
  content.querySelectorAll('[data-churn-branch]').forEach(b => b.addEventListener('click', () => churnGo('d30', b.dataset.churnBranch)));

  /* ===== قائمة عمل الفروع: واتساب/نسخ/عرض ===== */
  const wqFind = (name) => workQueue.find(w => w.name === name);
  const wqToast = (msg) => { try { if (typeof toastKbd === 'function') toastKbd(msg); } catch(e) {} };
  const wqCopy = (text, okMsg) => {
    const done = () => wqToast(okMsg || 'تم نسخ القائمة');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => prompt('انسخ النص يدويًا:', text));
      } else prompt('انسخ النص يدويًا:', text);
    } catch(e) { prompt('انسخ النص يدويًا:', text); }
  };
  const wqOpenWa = (phone, text) => {
    const num = String(phone || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    const digits = num.length >= 10 ? num : '';
    const url = digits
      ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text)
      : 'https://wa.me/?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
  };
  const wqBranchPhone = (name) => {
    try {
      if (typeof getBranchByName === 'function') {
        const b = getBranchByName(name);
        if (b && b.phone) return b.phone;
      }
    } catch(e) {}
    return '';
  };
  const wqAskPhone = (label) => {
    try {
      return window.prompt(label + '\nرقم واتساب (مثال: 2010xxxxxxxx) — اتركه فارغًا لفتح محادثة جديدة للاختيار اليدوي:', '') || '';
    } catch(e) { return ''; }
  };
  content.querySelectorAll('[data-wq-wa]').forEach(b => b.addEventListener('click', () => {
    const w = wqFind(b.dataset.wqWa);
    if (!w) return;
    const phone = wqBranchPhone(w.name) || wqAskPhone(w.name);
    wqOpenWa(phone, wqMessage(w));
  }));
  content.querySelectorAll('[data-wq-copy]').forEach(b => b.addEventListener('click', () => {
    const w = wqFind(b.dataset.wqCopy);
    if (!w) return;
    wqCopy(wqMessage(w), 'تم نسخ نواقص ' + w.name);
  }));
  content.querySelectorAll('[data-wq-view]').forEach(b => b.addEventListener('click', () => {
    const w = wqFind(b.dataset.wqView);
    window.pendingFleetBranch = b.dataset.wqView;
    window.pendingFleetQuickFilter = '';
    window.pendingFleetPlates = w ? w.gap.map(g => g.plate) : null;
    const nav = document.querySelector('.nav-item[data-tab="fleet"]');
    if (nav) nav.click();
    if (typeof render === 'function') render();
  }));
  const wqAllCopy = content.querySelector('[data-wq-all-copy]');
  if (wqAllCopy) wqAllCopy.addEventListener('click', () => wqCopy(wqMessageAll(), 'تم نسخ نواقص كل الفروع'));
  const wqAllWa = content.querySelector('[data-wq-all-wa]');
  if (wqAllWa) wqAllWa.addEventListener('click', () => wqOpenWa(wqAskPhone('مسؤول الإدارة'), wqMessageAll()));
  const wqToggle = content.querySelector('[data-wq-toggle]');
  let wqDocFilter = '';
  let wqShowAll = false;
  const wqApply = () => {
    content.querySelectorAll('[data-wq-row]').forEach(row => {
      const n = wqDocFilter ? (+row.dataset['wq' + wqDocFilter.charAt(0).toUpperCase() + wqDocFilter.slice(1)] || 0) : 1;
      const hideByDoc = wqDocFilter && n === 0;
      const hideByMore = !wqShowAll && row.classList.contains('wq-more');
      row.style.display = (hideByDoc || hideByMore) ? 'none' : '';
    });
    if (wqToggle) wqToggle.textContent = wqShowAll ? 'إخفاء باقي الفروع' : 'عرض كل الفروع (' + workQueue.length + ') ←';
  };
  if (wqToggle) wqToggle.addEventListener('click', () => { wqShowAll = !wqShowAll; wqApply(); });
  content.querySelectorAll('[data-wq-doc]').forEach(b => b.addEventListener('click', () => {
    wqDocFilter = b.dataset.wqDoc || '';
    content.querySelectorAll('[data-wq-doc]').forEach(x => x.classList.toggle('active', x === b));
    wqShowAll = wqShowAll || !!wqDocFilter;
    wqApply();
  }));
  wqApply();

  // فيديو الواجهة: يعمل تلقائيًا بدون صوت — وإن غاب الملف يرجع لصورة السيارة
  const heroVideo = content.querySelector('.home-hero-video');
  if (heroVideo) {
    const heroFallback = () => {
      if (!heroVideo.isConnected || heroVideo.dataset.fbk) return;
      heroVideo.dataset.fbk = '1';
      const img = document.createElement('img');
      img.src = 'assets/dashboard-hero.png'; img.alt = ''; img.decoding = 'async';
      img.className = 'home-hero-car-img'; img.width = 720; img.height = 353;
      heroVideo.replaceWith(img);
    };
    const heroSrc = heroVideo.querySelector('source');
    if (heroSrc) heroSrc.addEventListener('error', heroFallback);
    heroVideo.addEventListener('error', heroFallback);
    setTimeout(() => { if (heroVideo.isConnected && heroVideo.networkState === 3) heroFallback(); }, 3000);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      heroVideo.autoplay = false; heroVideo.pause && heroVideo.pause();
    } else {
      heroVideo.addEventListener('canplay', () => { heroVideo.play && heroVideo.play().catch(() => {}); }, { once: true });
    }
  }

  // Navigation helpers
  const goTab = (tab, filter) => {    if (filter) window.pendingFleetQuickFilter = filter;
    setCurrentTab(tab);
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');
    render();
  };

  content.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = el.getAttribute('data-go');
      const filter = el.getAttribute('data-filter') || null;
      if (tab) goTab(tab, filter);
    });
  });
  // صف «أخرى» يفتح تفاصيل السيارات غير المصنفة
  content.querySelectorAll('.home-avail-more').forEach(el => {
    el.style.cursor = 'pointer';
    const toggle = () => {
      const det = document.getElementById('home-avail-other-detail');
      if (det) det.style.display = det.style.display === 'none' ? '' : 'none';
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  // Animate bars after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      content.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.getAttribute('data-w'); });
      content.querySelectorAll('[data-h]').forEach(el => { el.style.height = el.getAttribute('data-h'); });
    }, 40);
  });

  // Interactive legend / donut highlight
  const legs = content.querySelectorAll('.home-leg');
  legs.forEach((leg, idx) => {
    leg.addEventListener('mouseenter', () => {
      legs.forEach((l, i) => l.classList.toggle('dim', i !== idx));
      leg.classList.add('active');
    });
    leg.addEventListener('mouseleave', () => {
      legs.forEach(l => { l.classList.remove('dim','active'); });
    });
    leg.addEventListener('click', () => {
      const map = ['ready','other','other','other'];
      goTab('fleet', map[idx] || null);
    });
  });

  // Tooltip
  let tip = document.getElementById('chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chart-tip';
    tip.className = 'chart-tip';
    document.body.appendChild(tip);
  }
  content.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      tip.style.display = 'block';
      tip.innerHTML = '<b>' + (el.getAttribute('data-tip') || '') + '</b>';
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY + 12) + 'px';
    });
    el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });

  // Global search -> fleet
  const gs = document.getElementById('global-search');
  if (gs && !gs._bound) {
    gs._bound = true;
    gs.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = gs.value.trim();
        if (!q) return;
        window.pendingFleetSearch = q;
        // التنقل لازم يعدي على نفس مسار النقر العادي (حدّث currentTab داخل
        // معالج nav-item ثم render) — الدالة goTab() اللي كانت هنا مش موجودة
        // أصلًا في الكود، فكان الضغط على Enter يرمي ReferenceError والبحث يضيع.
        const nav = document.querySelector('.nav-item[data-tab="fleet"]');
        if (nav) nav.click();
      }
    });
  }

  // Sync user chip from auth if available
  try {
    const u = window.currentUser;
    const nameEl = document.getElementById('topbar-user-name');
    const roleEl = document.getElementById('topbar-user-role');
    const av = document.getElementById('topbar-user-avatar');
    if (u && nameEl) {
      const nm = window.currentUserName || u.user_metadata?.full_name || u.user_metadata?.name || 'مستخدم';
      nameEl.textContent = nm;
      if (av) av.textContent = (nm.trim()[0] || 'م').toUpperCase();
    }
    if (window.currentRole && roleEl) {
      const map = { admin: 'مدير النظام', ops: 'تشغيل', view: 'عرض' };
      roleEl.textContent = map[window.currentRole] || window.currentRole;
    }
  } catch (e) {}
}


  global.YahmaDashboard = { render: renderDashboard };
})(typeof window !== 'undefined' ? window : this);
