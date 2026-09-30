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
  const maintenance = st.maintenance || 0;
  const notReady = Math.max(0, (st.out||0) + (st.other||0) + (st.inspection||0));
  const available = ready;
  const rented = fleet.filter(c => String(c.carStatus||'').includes('مؤجر')).length;
  // قيد التجهيز: غير جاهزة لكن ليست «خارج الخدمة» ولا صيانة صرفة — نستخدم inspection+other كتقريب، أو مهام قيد التنفيذ
  let inPrep = 0, finalReview = 0;
  try {
    const tasks = typeof getPrepTasks === 'function' ? getPrepTasks() : [];
    inPrep = tasks.filter(t => t.status === 'progress' || t.status === 'open').length;
    // عدد سيارات لها مهام مفتوحة/قيد التنفيذ (فريدة)
    const carIds = new Set(tasks.filter(t => t.status !== 'done').map(t => t.carId));
    inPrep = carIds.size || Math.max(0, total - ready - maintenance);
  } catch(e) {
    inPrep = Math.max(0, total - ready - maintenance);
  }
  // مراجعة نهائية
  try {
    finalReview = fleet.filter(c => vehicleReadiness(c).ready && !(typeof prepChecklistForCar==='function' && prepChecklistForCar(c).final)).length;
  } catch(e) { finalReview = 0; }

  // نسب الكروت
  const pct = (n) => total ? Math.round(n / total * 1000) / 10 : 0;
  const pReady = pct(ready);
  const pPrep = pct(inPrep);
  const pNot = pct(notReady);
  const pMaint = pct(maintenance);

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

  // المتاح مقابل المؤجر — مستوى الشركة (تقرير واحد)
  const availN = available, rentN = rented;
  const otherN = Math.max(0, total - availN - rentN);
  const pAvail = pct(availN), pRent = pct(rentN), pOther = pct(otherN);
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
  const dPrep = Math.max(0, inPrep);
  const dNeed = Math.max(0, notReady);
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
      <div class="home-hero-car hero-car-clean" aria-hidden="true"><img src="assets/dashboard-hero.png" alt="Toyota Fortuner" class="home-hero-car-img" width="720" height="353" decoding="async"></div>
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
      <div class="home-kpi warn" data-go="preparation">
        <div class="home-kpi-icon amber">⏳</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">قيد التجهيز</span>
          <b class="home-kpi-num">${inPrep.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--amber)" data-w="${pPrep}%"></i></div>
          <span class="home-kpi-pct warn">${pPrep}%</span>
        </div>
      </div>
      <div class="home-kpi bad" data-go="fleet" data-filter="other">
        <div class="home-kpi-icon red">!</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">غير جاهزة</span>
          <b class="home-kpi-num">${notReady.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--red)" data-w="${pNot}%"></i></div>
          <span class="home-kpi-pct bad">${pNot}%</span>
        </div>
      </div>
      <div class="home-kpi" data-go="fleet" data-filter="maintenance">
        <div class="home-kpi-icon grey">🔧</div>
        <div class="home-kpi-body">
          <span class="home-kpi-label">صيانة</span>
          <b class="home-kpi-num">${maintenance.toLocaleString('en')}</b>
          <div class="home-kpi-bar"><i style="width:0%;background:var(--grey)" data-w="${pMaint}%"></i></div>
          <span class="home-kpi-pct">${pMaint}%</span>
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
        <h3>🚗 المتاح والمؤجر — مستوى الشركة</h3>
        <span class="home-avail-total">${total} سيارة</span>
      </div>
      <div class="home-avail-row">
        <div class="home-donut" style="background:conic-gradient(#0BAA86 0% ${pAvail}%, #3B82C4 ${pAvail}% ${pAvail + pRent}%, #E8EEF2 ${pAvail + pRent}% 100%)">
          <div class="home-donut-hole"><b>${pAvail}%</b><span>متاح</span></div>
        </div>
        <div class="home-avail-legend">
          <div class="home-avail-leg"><i style="background:#0BAA86"></i><span>متاحة للتأجير</span><b>${availN}</b><em>${pAvail}%</em></div>
          <div class="home-avail-leg"><i style="background:#3B82C4"></i><span>مؤجرة حاليًا</span><b>${rentN}</b><em>${pRent}%</em></div>
          <div class="home-avail-leg"><i style="background:#CBD5E1"></i><span>أخرى (صيانة/خارج الخدمة)</span><b>${otherN}</b><em>${pOther}%</em></div>
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

  // Navigation helpers
  const goTab = (tab, filter) => {
    if (filter) window.pendingFleetQuickFilter = filter;
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
