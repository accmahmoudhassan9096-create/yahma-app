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
    branch[b] = branch[b] || { total: 0, ready: 0 };
    branch[b].total++;
    if (vehicleReadiness(c).ready) branch[b].ready++;
  });
  const topBranches = Object.entries(branch)
    .map(([name, x]) => ({ name, ...x, notReady: x.total - x.ready, pct: x.total ? Math.round(x.ready / x.total * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

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
  // أسباب عدم الجاهزية بنسب
  const reasonTotal = reasons.reduce((s, [, v]) => s + v, 0) || 1;
  const reasonRows = reasons.slice(0, 5).map(([k, v]) => ({
    label: k, count: v, pct: Math.round(v / reasonTotal * 1000) / 10
  }));

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
