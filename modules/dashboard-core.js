/*
 * modules/dashboard-core.js — حساب حالة لوحة التحكم الرئيسية
 *
 * دالة واحدة صافية: تتلقى أسطول السيارات وتعيد كائن حالة يحتوي
 * على كل المؤشرات والفرز والصفوف التي تحتاجها طبقة العرض.
 * لا تلمس الـDOM.
 */
(function (global) {
  'use strict';

function computeDashboardState(fleet) {
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
  // بطاقات التجديد لكل وثيقة — مطابقة تمامًا للتبويبات والأرقام في الشريط الجانبي
  let pendingInspIds = new Set();
  try {
    if (typeof loadInspectionPayments === 'function') {
      pendingInspIds = new Set(loadInspectionPayments().map(item => String(item.carId)));
    }
  } catch(_) {}
  const tabCount = (tab, extra) => {
    try {
      const fn = typeof fleetForTab === 'function' ? fleetForTab : (typeof window !== 'undefined' ? window.fleetForTab : null);
      if (typeof fn === 'function') {
        const list = fn(tab, fleet);
        return extra ? list.filter(extra).length : list.length;
      }
    } catch(_) {}
    return null;
  };
  const countRenInsp = tabCount('renewals', c => !pendingInspIds.has(String(c.id)));
  const renInsp = countRenInsp !== null ? countRenInsp : fleet.filter(c => (typeof inspectionDisplayStatus === 'function' ? inspectionDisplayStatus(c.inspectionStatus).level === 'red' : c.inspectionStatus !== 'تم الفحص')).length;

  const countRenLic = tabCount('license-renewals');
  const renLic = countRenLic !== null ? countRenLic : fleet.filter(c => (typeof dateStatus === 'function' ? dateStatus(c.licenseExpiry).level === 'red' : false)).length;

  const countRenIns = tabCount('insurance-renewals');
  const renIns = countRenIns !== null ? countRenIns : fleet.filter(c => {
    if (c.insuranceExpiry && typeof dateStatus === 'function') {
      if (dateStatus(c.insuranceExpiry).level === 'red') return true;
    }
    return typeof textTag === 'function' ? textTag(c.insuranceStatus).level === 'red' : false;
  }).length;

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
      try { if (vehicleReadiness(c).ready) cur.ready++; } catch(_){yahmaErr(_,'dashboard.js:53');}
      byBranch.set(b, cur);
    });
    Array.from(byBranch.entries())
      .sort(function (a, b) { return b[1].total - a[1].total; })
      .forEach(function (e) {
        rows.push([e[0], String(e[1].total), String(e[1].ready), String(e[1].total - e[1].ready)]);
      });

    return {
      title: 'الملخص التنفيذي للأسطول',
      subtitle: 'إجمالي ' + total + ' سيارة — جاهزة ' + ready + ' — ' + (typeof fmtDate === 'function' ? fmtDate(new Date()) : new Date().toISOString().slice(0, 10)),
      headers: ['البند / الفرع', 'الإجمالي', 'جاهزة', 'غير جاهزة'],
      rows: rows
    };
  };
  const countRenCard = tabCount('inspections');
  const renCard = countRenCard !== null ? countRenCard : fleet.filter(c => (typeof cardDisplayStatus === 'function' ? cardDisplayStatus(c.cardExpiry, c.cardStatus).level === 'red' : false)).length;

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
    try { localStorage.setItem(REG_HIST_KEY, JSON.stringify(regHist)); } catch(e){yahmaErr(e,'dashboard.js:147');}
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
      try { localStorage.setItem(REG_HIST_KEY, JSON.stringify(regHist)); } catch(e){yahmaErr(e,'dashboard.js:241');}
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

  /* مؤشر الجاهزية: قوس ملوّن (أحمر ← أصفر ← أخضر) وإبرة على نسبة الجاهزية.
     كان اتشال في v292، ورجع في v298 بناءً على طلب المستخدم —
     دلوقتي مكانه في الهيرو: الفيديو أقصى اليسار والمقياس على يمينه. */
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
    const tasks = typeof getPrepTasks === 'function' ? getPrepTasks() : [];
    const needInsp = renInsp;
    const cardSoon = renCard;
    const licSoon = renLic;
    const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;
    todayTasks = [
      { n: needInsp, label: 'سيارات تحتاج فحص', go: 'renewals', alert: false, kind: 'inspection' },
      { n: cardSoon, label: 'بطاقات تشغيل منتهية', go: 'inspections', alert: false, kind: 'card' },
      { n: licSoon, label: 'رخص سير منتهية', go: 'license-renewals', alert: false, kind: 'license' },
      { n: countRenIns, label: 'تأمين منتهي', go: 'insurance-renewals', alert: false, kind: 'insurance' },
      { n: overdue, label: 'مهام متأخرة', go: 'preparation', alert: true, kind: null }
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
  } catch(e){yahmaErr(e,'dashboard.js:337');}
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
    } catch(e){yahmaErr(e,'dashboard.js:351');}
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
      return d.toLocaleTimeString('ar-SA-u-nu-latn-ca-gregory', { hour: '2-digit', minute: '2-digit' });
    } catch(e) { return String(t).slice(0, 10); }
  };
  const isToday = (t) => {
    if (!t) return false;
    try { return new Date(t).toISOString().slice(0, 10) === today; } catch(e) { return false; }
  };

  return {
 activity,
 available,
 branchFull,
 colors,
 conicParts,
 dFinal,
 dNeed,
 dPrep,
 dReady,
 fmtTime,
 gaugeSvg,
 histBase,
 isToday,
 mapMode,
 pReady,
 pRenCard,
 pRenIns,
 pRenInsp,
 pRenLic,
 pct,
 ready,
 reasonRows,
 regionById,
 regionStats,
 renCard,
 renIns,
 renInsp,
 renLic,
 rented,
 stOf,
 todayCount,
 todayIso,
 todayTasks,
 topBranches,
 total,
 trend,
 trendSvg,
  expiringCars,
  };
}

  global.YahmaDashboardCore = { computeDashboardState };
})(typeof window !== 'undefined' ? window : this);


