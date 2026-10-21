/*
 * modules/dashboard-view.js — عرض لوحة التحكم الرئيسية
 *
 * القالب (HTML) وربط الأحداث. كل دالة تتلقى `state` — كائن الحالة
 * الذي تختاره computeDashboardState — بالإضافة إلى `content` و`context`
 * عند الحاجة.
 */
(function (global) {
  'use strict';

/* ===== القالب ===== */
function dashboardTemplate(state) {
  const { DOC_KEYS, activity, available, branchFull, churn, churnQuick, churnRows, churnSum, colors, conicParts, dFinal, dNeed, dPrep, dReady, docStats, fmtTime, gaugeSvg, histBase, isToday, mapMode, otherCars, pReady, pRenCard, pRenIns, pRenInsp, pRenLic, pct, ready, reasonRows, regionById, regionStats, renCard, renIns, renInsp, renLic, rented, stOf, statusRows, todayCount, todayIso, todayTasks, topBranches, total, trend, trendSvg, workQueue, wqCars, wqDocTotals, wqMessage, wqMessageAll } = state;
  return `
  <div class="home-dash">
    <!-- Hero -->
    <div class="home-hero hero-executive">
      <div class="home-hero-skyline" aria-hidden="true"></div>
      <div class="home-hero-text hero-welcome-card">
        <div class="hero-welcome-kicker" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div><span class="hero-live-dot"></span> لوحة التحكم التنفيذية</div>
          <div class="dash-cloud-badge" id="dash-cloud-badge" title="حالة الاتصال السحابي">
            <span class="dash-cloud-dot"></span>
            <span class="dash-cloud-text">متصل بـ Supabase</span>
          </div>
        </div>
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
          : `<div class="home-trend-empty"><div class="home-trend-now"><b>${total.toLocaleString('en')}</b><span>سيارة اليوم</span><b>${pReady}%</b><span>الجاهزية</span></div><div class="muted-small">المنحنى بيظهر من يومينمختلفين — افتح المنصة كل يوم وسجل يومي تتراكم تلقائيًا.</div></div>`}
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
  </div>`;}

/* ===== ربط الأحداث ===== */
function bindDashboardEvents(content, context, state) {
  const { setCurrentTab } = context;
  const { branchFull, churnQuick, mapMode, regionById, regionStats, workQueue, wqMessage, wqMessageAll } = state;
  // خريطة المناطق (Leaflet تحميل كسول — تعمل أونلاين، والأرقام محفوظة بدونه)
  (function initRegionMap(){
    const el = content.querySelector('#region-map');
    if(!el) return;
    try{ if(window._regionMap){ window._regionMap.remove(); window._regionMap=null; } }catch(_){yahmaErr(_,'dashboard.js:704');}
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
          if (bounds.length > 1) { try { map.fitBounds(bounds, { padding: [30, 30] }); } catch(e){yahmaErr(e,'dashboard.js:731');} }
          map.on('popupopen', e => {
            try {
              const btn = e.popup.getElement().querySelector('[data-region-branch]');
              if (btn && !btn._bound) {
                btn._bound = true;
                btn.onclick = () => {
                  try { map.closePopup(); } catch(_){yahmaErr(_,'dashboard.js:738');}
                  window.pendingFleetBranch = btn.dataset.regionBranch;
                  const nav = document.querySelector('.nav-item[data-tab="fleet"]');
                  if (nav) nav.click();
                  if (typeof render === 'function') render();
                };
              }
            } catch(_){yahmaErr(_,'dashboard.js:745');}
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
        /* ⭐ invalidateSize بعد 200ms عشان الخريطة تاخد مقاسها الصح.
           بس لازم نتحقق إن الـmap لسه حي — الـdashboard بيترسم تاني
           أحياناً (سحب Fleet أو مزامنة)، وساعتها الـcontainer بتتشال
           والـmap بيبقى في حالة نص ميتة. invalidateSize على خريطة
           مش موجودة كان بيرمي «Cannot read properties of undefined
           (reading '_leaflet_pos')» — 75 مرة! */
        setTimeout(()=>{
          try{
            /* لسه متعلق بالـDOM؟ */
            if(!el.isConnected) return;
            /* الـmap لسه هو الحالي؟ (يبقى قديمة لو اترسم تاني) */
            if(window._regionMap && window._regionMap !== map) return;
            map.invalidateSize();
          }catch(_){ /* الخريطة اتشالت — مفيش حاجة نعملها */ }
        }, 200);
        window._regionMap = map;
      }catch(e){
        el.innerHTML = '<div class="empty">تعذر تحميل الخريطة (تحقق من الإنترنت) — الأرقام بجانبها محدثة.</div>';
      }
    };
    setTimeout(()=>{
      try{
        if(typeof L!=='undefined' && L.map){ drawMap(); return; }
        /* Leaflet محلي على نطاقنا. كان بيتحمّل من cdnjs، وده آخر
           اعتماد على طرف تالث وقت التشغيل في المشروع كله. نفس النمط
           اللي export.js بيستخدمه: المحلي الأساسي، وCDN fallback
           لو الملف المحلي تلف. */
        const local = 'vendor/leaflet';
        const fail = ()=>{ el.innerHTML='<div class="empty">تعذر تحميل الخريطة (تحقق من الإنترنت) — الأرقام بجانبها محدثة.</div>'; };
        if(!document.querySelector('link[data-leaflet]')){
          const l=document.createElement('link'); l.rel='stylesheet'; l.href=local+'.css'; l.setAttribute('data-leaflet','1'); document.head.appendChild(l);
        }
        const s=document.createElement('script'); s.src=local+'.js'; s.async=true;
        s.onload=drawMap;
        s.onerror=()=>{
          try{
            /* النسخة الاحتياطية المحلية — مفيش CDN. الاعتماد على شبكة
               خارجية كان بيخلّي الخريطة تفشل على أي شبكة بتقطع unpkg. */
            const f=document.createElement('script');
            f.src='vendor/fallback/leaflet.js'; f.async=true;
            f.onload=drawMap; f.onerror=fail;
            document.head.appendChild(f);
          }catch(_){ yahmaErr(_,'dashboard.js:leaflet-fallback'); }
        };
        document.head.appendChild(s);
      }catch(e){yahmaErr(e,'dashboard.js:774');}
    }, 300);
  })();

  content.querySelectorAll('.map-mode-btn').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem('yahma-map-mode', b.dataset.mapMode); } catch(e){yahmaErr(e,'dashboard.js:779');}
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
  const wqToast = (msg) => { try { if (typeof toastKbd === 'function') toastKbd(msg); } catch(e){yahmaErr(e,'dashboard.js:797');} };
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
    } catch(e){yahmaErr(e,'dashboard.js:820');}
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

  // ===== نظام البحث الموحد المتقدم وتحديد التبويب لكل سيارة =====
  function getCarTabInfo(car) {
    if (!car) return { tab: 'fleet', label: 'الأسطول', tagClass: 'gs-tab-fleet' };
    const cid = String(car.id || '');
    try {
      if (typeof window.loadRenewedInspections === 'function') {
        const ren = window.loadRenewedInspections();
        if (ren && ren.some(p => String(p.carId) === cid)) {
          return { tab: 'renewed', label: 'تم التجديد', tagClass: 'gs-tab-renewed' };
        }
      }
    } catch (_) {}
    try {
      if (typeof window.loadPaidInspections === 'function') {
        const paid = window.loadPaidInspections();
        if (paid && paid.some(p => String(p.carId) === cid)) {
          return { tab: 'paid', label: 'تم الدفع', tagClass: 'gs-tab-paid' };
        }
      }
    } catch (_) {}
    try {
      if (typeof window.loadInspectionPayments === 'function') {
        const pay = window.loadInspectionPayments();
        if (pay && pay.some(p => String(p.carId) === cid)) {
          return { tab: 'payments', label: 'تحت الدفع', tagClass: 'gs-tab-payments' };
        }
      }
    } catch (_) {}
    try {
      if (typeof window.inspectionDisplayStatus === 'function') {
        const st = window.inspectionDisplayStatus(car.inspectionStatus);
        if (st && st.level === 'red') {
          return { tab: 'renewals', label: 'الفحص', tagClass: 'gs-tab-renewals' };
        }
      }
    } catch (_) {}
    try {
      if (typeof window.dateStatus === 'function') {
        const lic = window.dateStatus(car.licenseExpiry);
        if (lic && lic.level === 'red') {
          return { tab: 'license-renewals', label: 'رخص منتهية', tagClass: 'gs-tab-license-renewals' };
        }
      }
    } catch (_) {}
    try {
      if (typeof window.textTag === 'function') {
        const ins = window.textTag(car.insuranceStatus);
        if (ins && ins.level === 'red') {
          return { tab: 'insurance-renewals', label: 'التأمين', tagClass: 'gs-tab-insurance-renewals' };
        }
      }
    } catch (_) {}
    return { tab: 'fleet', label: 'الأسطول', tagClass: 'gs-tab-fleet' };
  }

  function navigateToCarTab(tab, plate) {
    const nav = document.querySelector('.nav-item[data-tab="' + tab + '"]');
    if (nav) nav.click();
    setTimeout(() => {
      const inputMap = {
        'fleet': 'fleet-search',
        'renewals': 'ren-search',
        'license-renewals': 'ren-search',
        'insurance-renewals': 'ren-search',
        'payments': 'pay-search-payments',
        'paid': 'pay-search-paid',
        'renewed': 'pay-search-renewed'
      };
      const inpId = inputMap[tab];
      const targetInp = inpId ? document.getElementById(inpId) : null;
      if (targetInp) {
        targetInp.value = plate || '';
        targetInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 80);
  }

  // إعداد حقل البحث الموحد
  const gs = document.getElementById('global-search');
  if (gs && !gs._boundAdvanced) {
    gs._boundAdvanced = true;
    const wrap = gs.closest('.topbar-search-wrap') || gs.parentElement;
    let resBox = document.getElementById('global-search-results');
    if (!resBox && wrap) {
      resBox = document.createElement('div');
      resBox.id = 'global-search-results';
      resBox.className = 'global-search-results';
      resBox.style.display = 'none';
      wrap.appendChild(resBox);
    }

    function doSearch() {
      const q = (gs.value || '').trim().toLowerCase();
      if (!q || q.length < 1) {
        if (resBox) resBox.style.display = 'none';
        return;
      }
      const allCars = (typeof getFleet === 'function' ? getFleet() : window.fleet) || [];
      const matches = allCars.filter(c => {
        const hay = [c.plate, c.brand, c.model, c.owner, c.branch, c.serial, c.accountNo].map(v => String(v || '').toLowerCase()).join(' ');
        return hay.includes(q);
      }).slice(0, 12);

      if (!matches.length) {
        if (resBox) {
          resBox.innerHTML = '<div style="padding:10px;text-align:center;color:var(--muted);font-size:12px;">لا توجد سيارات مطابقة</div>';
          resBox.style.display = 'block';
        }
        return;
      }

      let html = '';
      matches.forEach(c => {
        const info = getCarTabInfo(c);
        const plateEsc = (c.plate || '—').replace(/"/g, '&quot;');
        html += '<div class="gs-item" data-tab="' + info.tab + '" data-plate="' + plateEsc + '">' +
          '<div class="gs-car-meta">' +
            '<span class="gs-plate">🚗 ' + plateEsc + '</span>' +
            '<span class="gs-sub">' + (c.brand || '') + ' ' + (c.model || '') + ' • فرع: ' + (c.branch || '—') + (c.owner ? (' • ' + c.owner) : '') + '</span>' +
          '</div>' +
          '<span class="gs-tab-badge ' + info.tagClass + '">' + info.label + '</span>' +
        '</div>';
      });

      if (resBox) {
        resBox.innerHTML = html;
        resBox.style.display = 'block';
        resBox.querySelectorAll('.gs-item').forEach(item => {
          item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tab = item.dataset.tab;
            const plate = item.dataset.plate;
            resBox.style.display = 'none';
            navigateToCarTab(tab, plate);
          };
        });
      }
    }

    let searchTimer = null;
    gs.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(doSearch, 150);
    });

    gs.addEventListener('focus', () => {
      if ((gs.value || '').trim()) doSearch();
    });

    gs.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = resBox?.querySelector('.gs-item');
        if (first) {
          first.click();
        } else {
          const q = (gs.value || '').trim();
          if (q) {
            window.pendingFleetSearch = q;
            const nav = document.querySelector('.nav-item[data-tab="fleet"]');
            if (nav) nav.click();
            if (resBox) resBox.style.display = 'none';
          }
        }
      } else if (e.key === 'Escape') {
        if (resBox) resBox.style.display = 'none';
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target) && resBox) {
        resBox.style.display = 'none';
      }
    });
  }

  // تحديث شارة Supabase والتنبيه عند فقدان الاتصال
  function updateCloudStatus() {
    const badge = document.getElementById('dash-cloud-badge');
    const isOnline = navigator.onLine && (!window.syncMessage || !/تعذر|محلي|لا يوجد/i.test(window.syncMessage));
    if (badge) {
      if (isOnline) {
        badge.classList.remove('offline');
        badge.querySelector('.dash-cloud-text').textContent = 'متصل بـ Supabase';
        badge.title = 'السحابة متصلة وتعمل بصورة سليمة';
      } else {
        badge.classList.add('offline');
        badge.querySelector('.dash-cloud-text').textContent = 'غير متصل بـ Supabase';
        badge.title = 'انقطع الاتصال بالسحابة أو تعمل بالوضع المحلي';
      }
    }
  }
  updateCloudStatus();

  // إشعار عائم فوري عند انقطاع أو عودة الاتصال
  function showConnectionNotice(online, msg) {
    let toast = document.getElementById('yahma-conn-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yahma-conn-toast';
      toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:999999;padding:11px 18px;border-radius:12px;font-family:inherit;font-size:12.5px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,0.22);display:flex;align-items:center;gap:10px;direction:rtl;transition:opacity 0.3s ease;';
      document.body.appendChild(toast);
    }
    if (!online) {
      toast.style.background = '#DC2626';
      toast.style.color = '#fff';
      toast.innerHTML = '<span>⚠️</span> <span>' + (msg || 'انقطع الاتصال بالسحابة (Supabase) — يعمل التطبيق محلياً وسيتم المزامنة فور عودة الاتصال') + '</span>';
      toast.style.display = 'flex';
      toast.style.opacity = '1';
    } else {
      toast.style.background = '#059669';
      toast.style.color = '#fff';
      toast.innerHTML = '<span>🟢</span> <span>' + (msg || 'تم استعادة الاتصال بـ Supabase بنجاح — البيانات متزامنة') + '</span>';
      toast.style.display = 'flex';
      toast.style.opacity = '1';
      setTimeout(() => { if (toast) { toast.style.opacity = '0'; setTimeout(() => { toast.style.display = 'none'; }, 300); } }, 4500);
    }
  }

  if (!window._cloudNoticeBound) {
    window._cloudNoticeBound = true;
    window.addEventListener('offline', () => {
      updateCloudStatus();
      showConnectionNotice(false);
    });
    window.addEventListener('online', () => {
      updateCloudStatus();
      showConnectionNotice(true);
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
  } catch(e){yahmaErr(e,'dashboard.js:996');}
}

  global.YahmaDashboardView = {
    dashboardTemplate, bindDashboardEvents
  };
})(typeof window !== 'undefined' ? window : this);
