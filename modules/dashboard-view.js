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
  const { activity, available, branchFull, colors, conicParts, dFinal, dNeed, dPrep, dReady, expiringCars, fmtTime, gaugeSvg, histBase, idleCount, idleLossRounded, topIdleBranchName, topIdleBranchCount, leastIdleBranchName, leastIdleBranchCount, isToday, mapMode, pReady, pRenCard, pRenIns, pRenInsp, pRenLic, pct, ready, reasonRows, regionById, regionStats, renCard, renIns, renInsp, renLic, rented, stOf, todayCount, todayIso, todayTasks, topBranches, total, trend, trendSvg, availableCount, occupancyRate, topAvailableCars, mostOccupiedBranchName, mostOccupiedBranchPct, leastOccupiedBranchName, leastOccupiedBranchPct, occupancyTrend } = state;
  return `
  <style>
    /* ===== كروت لوحة التحكم — ستايل الصورة (توهج خفيف + أرقام وسط + بار نحيف) ===== */
    .home-kpis{gap:12px}
    .home-kpi {
      position: relative;
      overflow: visible;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      cursor: pointer;
      border-radius: 16px;
      background: #ffffff;
      border: 1px solid #E6EAF2;
      box-shadow: 0 1px 3px rgba(15,25,60,.05), 0 8px 24px rgba(15,25,60,.06);
      padding: 16px 12px 14px;
      min-height: 112px;
      display: flex;
      flex-direction: column;
    }
    .home-kpi:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(15,25,60,.10), 0 12px 32px rgba(15,25,60,.08);
      border-color: #D5DCE8;
    }
    .home-kpi-icon {
      position: absolute;
      top: 12px;
      inset-inline-end: 12px;
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      transition: transform .18s ease, box-shadow .18s ease;
      box-shadow: 0 0 0 4px rgba(255,255,255,.9), 0 8px 20px rgba(15,25,60,.14);
    }
    .home-kpi:hover .home-kpi-icon {
      transform: scale(1.06);
    }
    .home-kpi-body {
      position: relative;
      z-index: 2;
      padding: 28px 6px 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .home-kpi-body span.home-kpi-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #6B7490;
      margin-bottom: 6px;
      display: block;
      line-height: 1.4;
    }
    .home-kpi-num {
      font-size: 26px;
      font-weight: 900;
      color: #111827;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }
    .home-kpi-bar{width:100%;height:5px;background:#EEF2F7;border-radius:999px;overflow:visible;margin-top:8px}
    .home-kpi-bar i{display:block;height:100%;border-radius:999px;position:relative;transition:width .7s cubic-bezier(.2,.8,.2,1)}
    .home-kpi-bar i::after{content:'';position:absolute;inset-inline-end:-4px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:inherit;box-shadow:0 0 0 2px #fff}
    .home-kpi-pct {
      font-size: 11px;
      font-weight: 800;
      color: #64748b;
      margin-top: 6px;
      font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .home-kpi-link{font-size:11px;font-weight:700;color:#0E8A68;margin-top:4px;text-decoration:none}
    .home-kpi-link:hover{text-decoration:underline}
    /* أيقونات ملونة بتوهج زي الصورة */
    .home-kpi-icon.blue { background: #E7F0FE; color: #1e40af; box-shadow: 0 0 0 4px rgba(219,234,254,.45), 0 8px 20px rgba(30,64,175,.18); }
    .home-kpi-icon.green { background: #E6F7EE; color: #0E8A68; box-shadow: 0 0 0 4px rgba(16,185,129,.14), 0 8px 20px rgba(16,185,129,.22); }
    .home-kpi-icon.amber { background: #FFF3D6; color: #A86F00; box-shadow: 0 0 0 4px rgba(245,158,11,.14), 0 8px 20px rgba(245,158,11,.25); }
    .home-kpi-icon.red { background: #FFE8E8; color: #DC2626; box-shadow: 0 0 0 4px rgba(220,38,38,.12), 0 8px 20px rgba(220,38,38,.20); }
    .home-kpi-icon.purple { background: #E0E7FF; color: #4f46e5; box-shadow: 0 0 0 4px rgba(99,102,241,.12), 0 8px 20px rgba(99,102,241,.18); }
    .home-kpi.warn .home-kpi-pct { color: #d97706; }
    .home-kpi.good .home-kpi-pct { color: #15803d; }

    /* رؤوس التقارير — زي الصورة: عمود جانبي في الخلية الأولى على اليمين */
    .home-kpis.report-card{gap:12px}
    .home-report-header {
      margin-bottom: 12px;
      padding: 14px 12px;
      border-bottom: 1px solid #E6EAF2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      align-self: stretch;
    }
    .home-report-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 900;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: center;
      line-height: 1.5;
    }
    .home-report-header p {
      margin: 6px 0 0 0;
      font-size: 11px;
      color: #6B7490;
      line-height: 1.6;
    }
    @media (max-width: 900px) {
      .home-kpis{grid-template-columns:repeat(2,minmax(0,1fr)) !important}
      .home-report-header{grid-column:1/-1}
    }

    /* تأثير النبض للسيارات الراكدة */
    @keyframes idlePulse {
      0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.25); }
      70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
      100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    }
    .home-kpi-warn-pulse { animation: idlePulse 2.4s infinite; }
    .home-kpi::before { display:none; }
    .home-kpi:active { transform: scale(0.98); }
    /* بطاقة أقل ركوداً — أخضر لامع */
    .home-kpi-least-idle {
      background: linear-gradient(145deg, #f0fdf4, #ffffff);
      border-color: rgba(16, 185, 129, 0.3);
    }
    .home-kpi-least-idle .home-kpi-icon { background: #dcfce7; color: #15803d; }
    /* بطاقة أكثر ركوداً — أحمر أنيق */
    .home-kpi-most-idle {
      background: linear-gradient(145deg, #fef2f2, #ffffff);
      border-color: rgba(248, 113, 113, 0.3);
    }
    .home-kpi-most-idle .home-kpi-icon { background: #fee2e2; color: #dc2626; }
  </style>
  <div class="home-dash">
    <style>
    .yahma-priority{display:grid;grid-template-columns:minmax(190px,.9fr) repeat(4,minmax(125px,1fr));gap:10px;margin:0 0 16px;padding:13px;border:1px solid #DDE9EC;border-radius:18px;background:linear-gradient(110deg,#F7FBFC 0%,#FFFFFF 58%,#F0FAF9 100%);box-shadow:0 5px 18px rgba(16,36,58,.045)}
    .yahma-priority-intro{display:flex;flex-direction:column;justify-content:center;padding:5px 10px}
    .yahma-priority-kicker{font-size:10px;font-weight:900;letter-spacing:.4px;color:#0B928D}
    .yahma-priority-intro strong{font-size:16px;color:#102A40;margin-top:4px}
    .yahma-priority-intro span:last-child{font-size:10px;color:#6A7E8D;margin-top:3px;line-height:1.5}
    .yahma-priority-item{display:flex;align-items:center;gap:10px;min-width:0;padding:11px 12px;border:1px solid #E5ECEF;border-radius:13px;background:#fff;text-align:right;cursor:pointer;color:#17364C;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
    .yahma-priority-item:hover{transform:translateY(-2px);border-color:#9DD9D5;box-shadow:0 6px 14px rgba(16,36,58,.07)}
    .yahma-priority-count{display:grid;place-items:center;flex:none;width:37px;height:37px;border-radius:11px;background:#FFF4DE;color:#A66A00;font-size:17px;font-weight:900;font-variant-numeric:tabular-nums}
    .yahma-priority-item[data-priority="urgent"] .yahma-priority-count{background:#FDECEC;color:#C24141}
    .yahma-priority-copy{display:flex;flex-direction:column;min-width:0}.yahma-priority-copy b{font-size:11px;line-height:1.45}.yahma-priority-copy small{font-size:9px;color:#82919D;margin-top:3px}
    .yahma-priority-empty{grid-column:span 4;display:flex;align-items:center;gap:10px;padding:12px 15px;border:1px solid #CDEBE2;border-radius:13px;background:#F3FBF8;color:#14745E;font-size:12px;font-weight:800}
    @media(max-width:1050px){.yahma-priority{grid-template-columns:repeat(2,minmax(0,1fr))}.yahma-priority-intro{grid-column:1/-1}}
    @media(max-width:560px){.yahma-priority{grid-template-columns:1fr;padding:10px}.yahma-priority-intro{grid-column:auto}.yahma-priority-empty{grid-column:auto}}
    body.dark-mode .yahma-priority{background:linear-gradient(110deg,#14283A,#172F42);border-color:#30485B}
    body.dark-mode .yahma-priority-intro strong,body.dark-mode .yahma-priority-item{color:#E4EEF3}
    body.dark-mode .yahma-priority-intro span:last-child,body.dark-mode .yahma-priority-copy small{color:#A9BBC8}
    body.dark-mode .yahma-priority-item{background:#1A3246;border-color:#344B5F}
    body.dark-mode .yahma-priority-empty{background:#153A37;border-color:#285D56;color:#9DE1D4}
    </style>
    <section class="yahma-priority" aria-label="أولويات تجهيز الأسطول">
      <div class="yahma-priority-intro"><span class="yahma-priority-kicker">YAHMAA · COMMAND CENTER <span class="dash-cloud-badge" id="dash-cloud-badge"><span class="dash-cloud-dot"></span><span class="dash-cloud-text">متصل بـ Supabase</span></span></span><strong>أولويات التجهيز الآن</strong><span>${todayCount ? 'متابعة ' + todayCount.toLocaleString('en') + ' بندًا يحتاج إلى إجراء' : 'لا توجد مهام عاجلة مسجلة حاليًا'}</span></div>      ${todayTasks.filter(t => (t.n || 0) > 0).slice(0,4).map(t => { const urgent = /متأخرة|منتهية/.test(t.label || ''); return '<button type="button" class="yahma-priority-item" data-go="' + t.go + '" data-priority="' + (urgent ? 'urgent' : 'normal') + '"><span class="yahma-priority-count">' + Number(t.n).toLocaleString('en') + '</span><span class="yahma-priority-copy"><b>' + escapeHtml(t.label) + '</b><small>عرض التفاصيل والإجراء ←</small></span></button>'; }).join('') || '<button type="button" class="yahma-priority-empty" data-go="preparation"><span>✓</span><span>ممتاز! لا توجد أولويات عاجلة — افتح قائمة التجهيز لمراجعة الحالة الكاملة</span></button>'}
    </section>
    <!-- تنبيه تدخل فوري: أيقونة زجاجية صغيرة على الشمال (مش بانر) -->
    ${leastOccupiedBranchName && leastOccupiedBranchName !== '—' && leastOccupiedBranchPct < 20 ? `<div style="display:flex;justify-content:flex-end;margin:6px 0 12px">
      <button type="button" id="dash-immediate-alert" title="فرع ${escapeHtml(leastOccupiedBranchName)} يحتاج تدخل فوري — ${leastOccupiedBranchPct}% تشغيل — أقل فرع تشغيلاً في التقرير، مع ${leastIdleBranchCount || 0} سيارات راقدة غير مؤجرة. راجع توزيع الفروع ورفع جاهزية الفرع." style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;background:rgba(211,47,47,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(211,47,47,0.28);color:#d32f2f;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(211,47,47,0.12)">
        <span style="font-size:14px">⚠️</span><span>${leastOccupiedBranchPct}%</span>
      </button>
    </div>` : ''}
    <!-- Hero زي الصورة: كرت داكن + لوحة خضرا بنفس درجات القسم الداكن -->
    <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:14px;margin-bottom:14px" class="mock-hero-grid">
      <div class="home-hero-card" style="background:#0F2A24;border:1px solid #1E3D34;border-radius:18px;padding:22px 24px;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25),0 8px 24px rgba(0,0,0,.25)">
        <p style="display:flex;align-items:center;gap:6px;color:#2DD4A0;font-weight:800;font-size:13px;margin:0 0 12px">✨ نظرة عامة تشغيلية</p>
        <div style="display:flex;align-items:flex-end;gap:10px"><h2 style="margin:0;font-size:56px;font-weight:900;line-height:.95;letter-spacing:-.02em;color:#fff">${total.toLocaleString('en')}</h2><span style="padding-bottom:6px;font-weight:800;color:#fff">سيارة</span></div>
        <h3 style="margin:6px 0 8px;font-size:18px;font-weight:900;color:#fff">إجمالي الأسطول</h3>
        <p style="margin:0 0 18px;color:#8AA99E;line-height:1.7;font-size:13px">صورة تشغيلية موحّدة لحركة الأسطول والركود والتوفر الفوري، من دون تشتيت بين التقارير.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="background:#0A1F1A;border:1px solid #1E3A32;border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#fff">↗ مؤجرة</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff">${rented.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#8AA99E">سيارة ضمن التشغيل</p></div>
          <div style="background:#0A1F1A;border:1px solid #1E3A32;border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#fff">✓ متاحة فوراً</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff">${availableCount.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#8AA99E">جاهزة للإيجار الآن</p></div>
          <div style="background:rgba(223,79,79,.10);border:1px solid rgba(223,79,79,.22);border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#FF8A8A">↘ راقدة</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff">${idleCount.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#8AA99E">غير مؤجرة</p></div>
        </div>
      </div>
      <div style="background:#0E8A68;border-radius:18px;padding:22px;color:#fff;position:relative;overflow:hidden">
        <div style="position:absolute;inset-inline-start:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
        <p style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#A7F3D0">📈 مؤشر التشغيل</p>
        <p style="margin:18px 0 0;font-size:56px;font-weight:900;line-height:1">${occupancyRate}%</p>
        <p style="margin:8px 0 0;font-weight:800">نسبة التشغيل الإجمالية</p>
        <p style="margin:4px 0 0;font-size:12px;color:#A7F3D0">${rented} من ${total} سيارة مؤجرة</p>
        <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.2);font-size:12px;line-height:1.7;color:#D1FAE5">التركيز التشغيلي الحالي: تقليل الركود، ورفع جاهزية السيارات المتاحة فوراً.</p>
      </div>
    </div>
    <style>@media(max-width:900px){.mock-hero-grid{grid-template-columns:1fr !important}}</style>

    <style>
    .dark-sec{background:#071A14;border-radius:20px;padding:20px;margin-bottom:14px;color:#fff}
    .dark-sec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
    .dark-sec-label{margin:0;color:#2DD4A0;font-size:11px;font-weight:800}
    .dark-sec-title{margin:4px 0 0;font-size:24px;font-weight:900;color:#fff}
    .dark-sec-pill{background:#0E3A2E;color:#2DD4A0;font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px;white-space:nowrap}
    .dark-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    @media(max-width:900px){.dark-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.dark-grid-3{grid-template-columns:1fr}}
    .dark-card{background:#0F2A24;border:1px solid #1E3D34;border-radius:16px;padding:16px;color:#fff;min-height:150px}
    .dark-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .dark-tile{width:42px;height:42px;border-radius:12px;background:#F5EDD6;display:grid;place-items:center;font-size:20px;flex:none}
    .dark-tile.green{background:#145A44;color:#A7F3D0}
    .dark-pct{font-size:11px;font-weight:900;padding:4px 8px;border-radius:999px;white-space:nowrap}
    .dark-label{margin:14px 0 4px;color:#8AA99E;font-size:12px;font-weight:700;line-height:1.5}
    .dark-num{margin:0;font-size:30px;font-weight:900;color:#fff;line-height:1.1;text-align:center}
    .dark-bar{margin-top:12px;height:6px;background:#1B3530;border-radius:999px;overflow:hidden}
    .dark-bar i{display:block;height:100%;border-radius:999px;position:relative}
    .dark-bar i::after{content:'';position:absolute;inset-inline-end:-4px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:inherit;box-shadow:0 0 0 2px #0F2A24}
    .dark-note{margin:8px 0 0;color:#8AA99E;font-size:11px;line-height:1.6;text-align:left}
    .dark-summary{background:#0E2A24;border:1px solid #1E3D34;border-radius:16px;padding:16px;color:#fff;min-height:150px}
    .dark-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:900px){.dark-2col{grid-template-columns:1fr}}
    .dark-big{font-size:54px;font-weight:900;line-height:1;color:#fff}
    .dark-sub{color:#8AA99E;font-size:12px;line-height:1.7}
    .dark-inner{background:#0A1F1A;border:1px solid #1E3A32;border-radius:14px;padding:14px}
    .dark-inner-label{margin:0;color:#8AA99E;font-size:11px;font-weight:700}
    .dark-inner-num{margin:6px 0 0;font-size:22px;font-weight:900;color:#fff}
    .dark-cmp{background:#0A1F1A;border:1px solid #1E3A32;border-radius:14px;padding:14px;margin-top:12px}
    .dark-cmp-title{margin:0;font-size:13px;font-weight:800;color:#fff}
    .dark-row{margin-top:12px}
    .dark-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:800;color:#fff}
    .dark-row-track{margin-top:7px;height:6px;background:#1B3530;border-radius:999px;overflow:hidden}
    .dark-row-fill{height:100%;border-radius:999px;position:relative}
    .dark-row-note{margin:4px 0 0;text-align:left;color:#8AA99E;font-size:11px}
    .dark-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;justify-content:center}
    .dark-foot span{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px}
    .dark-summary-title{margin:0;color:#2DD4A0;font-size:12px;font-weight:800}
    .dark-summary-big{margin:10px 0 0;font-size:24px;font-weight:900;line-height:1.5;color:#fff}
    .dark-summary-desc{margin:8px 0 0;color:#8AA99E;font-size:12px;line-height:1.7}
    .dark-summary-foot{display:flex;align-items:center;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #1E3D34;color:#fff;font-size:12px;font-weight:800}
    </style>
    <!-- قسم 01 — حالة الأسطول (نسخة الصورة الداكنة) -->
    <div class="dark-sec">
      <div class="dark-sec-head">
        <div>
          <p class="dark-sec-label">01 · حالة الأسطول</p>
          <h2 class="dark-sec-title">حالة الأسطول</h2>
        </div>
        <span class="dark-sec-pill">توزيع الأسطول الكلي</span>
      </div>
      <div class="dark-grid-3">
        <div class="dark-card" data-go="fleet" data-filter="ready" style="cursor:pointer">
          <div class="dark-card-top"><span class="dark-pct" style="background:rgba(31,169,113,.18);color:#2DD4A0">${pReady}%</span><div class="dark-tile green">✓</div></div>
          <p class="dark-label">سيارات جاهزة للتأجير</p>
          <p class="dark-num">${ready.toLocaleString('en')}</p>
          <div class="dark-bar"><i style="width:${pReady}%;background:#1FA971"></i></div>
          <p class="dark-note">جاهزة للحركة · ${pReady}% من الأسطول</p>
        </div>
        <div class="dark-card" data-go="renewals" style="cursor:pointer">
          <div class="dark-card-top"><span class="dark-pct" style="background:rgba(232,165,44,.16);color:#F5B545">${pRenInsp}%</span><div class="dark-tile">🔧</div></div>
          <p class="dark-label">تجديد فحص</p>
          <p class="dark-num">${renInsp.toLocaleString('en')}</p>
          <div class="dark-bar"><i style="width:${pRenInsp}%;background:#E8A52C"></i></div>
          <p class="dark-note">بحاجة إلى متابعة · ${pRenInsp}% من الأسطول</p>
        </div>
        <div class="dark-card" data-go="license-renewals" style="cursor:pointer">
          <div class="dark-card-top"><span class="dark-pct" style="background:rgba(232,165,44,.16);color:#F5B545">${pRenLic}%</span><div class="dark-tile">📄</div></div>
          <p class="dark-label">تجديد رخصة</p>
          <p class="dark-num">${renLic.toLocaleString('en')}</p>
          <div class="dark-bar"><i style="width:${pRenLic}%;background:#E8A52C"></i></div>
          <p class="dark-note">بحاجة إلى متابعة · ${pRenLic}% من الأسطول</p>
        </div>
        <div class="dark-summary">
          <p class="dark-summary-title">الخلاصة التشغيلية</p>
          <p class="dark-summary-big">${pReady >= 50 ? 'أكثر من نصف الأسطول جاهز للتأجير.' : 'أقل من نصف الأسطول جاهز للتأجير.'}</p>
          <p class="dark-summary-desc">الجاهزية عند ${pReady}%، بينما تتوزع بقية الحالات على تجديدات الفحص والرخصة والتأمين وبطاقة التشغيل.</p>
          <div class="dark-summary-foot">↗ حالة الأسطول الحالية</div>
        </div>
        <div class="dark-card" data-go="insurance-renewals" style="cursor:pointer">
          <div class="dark-card-top"><span class="dark-pct" style="background:rgba(238,116,52,.16);color:#F0A06A">${pRenIns}%</span><div class="dark-tile">🛡️</div></div>
          <p class="dark-label">تجديد تأمين</p>
          <p class="dark-num">${renIns.toLocaleString('en')}</p>
          <div class="dark-bar"><i style="width:${pRenIns}%;background:#EE7434"></i></div>
          <p class="dark-note">أولوية متوسطة · ${pRenIns}% من الأسطول</p>
        </div>
        <div class="dark-card" data-go="inspections" style="cursor:pointer">
          <div class="dark-card-top"><span class="dark-pct" style="background:rgba(223,79,79,.16);color:#FF8A8A">${pRenCard}%</span><div class="dark-tile">🔑</div></div>
          <p class="dark-label">تجديد بطاقة تشغيل</p>
          <p class="dark-num">${renCard.toLocaleString('en')}</p>
          <div class="dark-bar"><i style="width:${pRenCard}%;background:#DF4F4F"></i></div>
          <p class="dark-note">أولوية متابعة · ${pRenCard}% من الأسطول</p>
        </div>
      </div>
    </div>

    <!-- قسما 02 و 03 الداكنان جنب بعض زي الصورة -->
    <div class="dark-2col">
      <!-- 02 — راقدة -->
      <div class="dark-sec" style="margin-bottom:0">
        <div class="dark-sec-head">
          <div>
            <p class="dark-sec-label">02 · تقرير التشغيل</p>
            <h2 class="dark-sec-title">سيارات راقدة غير مؤجرة</h2>
          </div>
          <span class="dark-sec-pill" style="background:rgba(223,79,79,.16);color:#FF8A8A">ركود</span>
        </div>
        <div style="display:flex;align-items:flex-end;gap:10px;margin-top:6px"><p class="dark-big">${idleCount.toLocaleString('en')}</p><span style="padding-bottom:8px;font-weight:800;color:#fff">سيارة</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div class="dark-inner"><p class="dark-inner-label">الخسارة من الركود</p><p class="dark-inner-num">${idleLossRounded.toLocaleString('en')} <span style="font-size:13px;color:#8AA99E">ر.س</span></p></div>
          <div class="dark-inner"><p class="dark-inner-label">إجمالي الراكد</p><p class="dark-inner-num">${idleCount.toLocaleString('en')}</p></div>
        </div>
        <div class="dark-cmp">
          <p class="dark-cmp-title">مقارنة ركود الفروع</p>
          <div class="dark-row">
            <div class="dark-row-head"><span>${escapeHtml(topIdleBranchName)} · ${topIdleBranchCount} سيارة</span><span style="color:#2DD4A0">☐</span></div>
            <div class="dark-row-track"><div class="dark-row-fill" style="width:${Math.min(100, Number(topIdleBranchCount) || 0)}%;background:#1FA971"></div></div>
            <p class="dark-row-note">${topIdleBranchCount} من أصل 100</p>
          </div>
          <div class="dark-row">
            <div class="dark-row-head"><span>${escapeHtml(leastIdleBranchName)} · ${leastIdleBranchCount} سيارة</span><span style="color:#FF8A8A">●</span></div>
            <div class="dark-row-track"><div class="dark-row-fill" style="width:${Math.max(3, Math.min(100, Number(leastIdleBranchCount) || 0))}%;background:#DF4F4F"></div></div>
            <p class="dark-row-note">${leastIdleBranchCount} من أصل 100</p>
          </div>
        </div>
        <div class="dark-foot">
          <span style="background:rgba(223,79,79,.16);color:#FF8A8A">أكثر فرع ركوداً: ${escapeHtml(topIdleBranchName)}</span>
          <span style="background:rgba(31,169,113,.16);color:#2DD4A0">أقل فرع ركوداً: ${escapeHtml(leastIdleBranchName)}</span>
        </div>
      </div>

      <!-- 03 — تشغيل إجمالي -->
      <div class="dark-sec" style="margin-bottom:0">
        <div class="dark-sec-head">
          <div>
            <p class="dark-sec-label">03 · تقرير التشغيل</p>
            <h2 class="dark-sec-title">التشغيل الإجمالي</h2>
          </div>
          <span class="dark-sec-pill">تشغيل ${occupancyRate}%</span>
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <div style="flex:1;min-width:180px">
            <p class="dark-sub" style="margin:0">متاحة للإيجار فوراً</p>
            <p style="margin:6px 0 0;font-size:44px;font-weight:900;color:#fff;line-height:1">${availableCount.toLocaleString('en')}</p>
            <p class="dark-sub" style="margin:8px 0 0">${rented} من ${total} سيارة مؤجرة ضمن نسبة التشغيل الإجمالية.</p>
          </div>
          <div style="position:relative;width:150px;height:150px;flex:none;margin-inline:auto">
            <svg viewBox="0 0 160 160" style="width:100%;height:100%;transform:rotate(-90deg)">
              <circle cx="80" cy="80" r="68" fill="none" stroke="#1B3530" stroke-width="16"></circle>
              <circle cx="80" cy="80" r="68" fill="none" stroke="#1FA971" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 68).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 68 * (1 - Math.min(100, Number(occupancyRate) || 0) / 100)).toFixed(1)}"></circle>
            </svg>
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#fff">
              <div><p style="margin:0;font-size:30px;font-weight:900;line-height:1">${occupancyRate}%</p><p style="margin:4px 0 0;font-size:11px;color:#8AA99E;font-weight:700">التشغيل</p></div>
            </div>
          </div>
        </div>
        <div class="dark-cmp">
          <p class="dark-cmp-title">مقارنة تشغيل الفروع</p>
          <div class="dark-row">
            <div class="dark-row-head"><span>${escapeHtml(mostOccupiedBranchName)} · تشغيل ${mostOccupiedBranchPct}%</span><span style="color:#2DD4A0">☐</span></div>
            <div class="dark-row-track"><div class="dark-row-fill" style="width:${mostOccupiedBranchPct}%;background:#1FA971"></div></div>
            <p class="dark-row-note">${mostOccupiedBranchPct} من أصل 100</p>
          </div>
          <div class="dark-row">
            <div class="dark-row-head"><span>${escapeHtml(leastOccupiedBranchName)} · تشغيل ${leastOccupiedBranchPct}%</span><span style="color:#FF8A8A">●</span></div>
            <div class="dark-row-track"><div class="dark-row-fill" style="width:${Math.max(3, Math.min(100, Number(leastOccupiedBranchPct) || 0))}%;background:#DF4F4F"></div></div>
            <p class="dark-row-note">${leastOccupiedBranchPct} من أصل 100</p>
          </div>
        </div>
        <div class="dark-foot" style="justify-content:center">
          <span style="background:rgba(31,169,113,.14);color:#2DD4A0">↗ أكثر فرع تشغيلاً: ${escapeHtml(mostOccupiedBranchName)} · أقل فرع تشغيلاً: ${escapeHtml(leastOccupiedBranchName)}</span>
        </div>
      </div>
    </div>

    <!-- رسم بياني لتريند نسبة التشغيل -->
    <div class="home-card">
      <div class="home-card-head">
        <h3>📈 اتجاه نسبة التشغيل (آخر 7 أيام)</h3>
      </div>
      <div class="home-trend-card" style="padding:16px">
        <svg viewBox="0 0 600 200" style="width:100%;height:180px;display:block">
          <defs>
            <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0284c7" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="#0284c7" stop-opacity="0.05"/>
            </linearGradient>
          </defs>
          <!-- محور Y -->
          <line x1="40" y1="20" x2="40" y2="170" stroke="#e2e8f0" stroke-width="1"/>
          <line x1="40" y2="170" x2="580" y2="170" stroke="#e2e8f0" stroke-width="1"/>
          <!-- Linien الشبكة -->
          <g stroke="#e2e8f0" stroke-dasharray="4 4" stroke-width="0.5">
            <line x1="40" y1="40" x2="580" y2="40"/>
            <line x1="40" y1="105" x2="580" y2="105"/>
            <line x1="40" y1="170" x2="580" y2="170"/>
          </g>
          <text x="10" y="45" font-size="11" fill="#6b7280">100%</text>
          <text x="10" y="110" font-size="11" fill="#6b7280">50%</text>
          <text x="10" y="175" font-size="11" fill="#6b7280">0%</text>
          <!-- الخط البياني -->
          ${(() => {
            const W = 540, H = 150, padL = 40, padT = 20, padB = 30;
            const points = occupancyTrend;
            const maxP = Math.max(...points.map(p => p.pct), 100);
            const stepX = W / (points.length - 1);
            const linePoints = points.map((p, i) => {
              const x = padL + i * stepX;
              const y = padT + H - (p.pct / maxP) * H;
              return `${x},${y}`;
            }).join(' ');
            const areaPoints = `M ${padL},${padT + H} ${linePoints} L ${padL + W},${padT + H} Z`;
            return `<path d="${areaPoints}" fill="url(#occGrad)"/>
                    <polyline points="${linePoints}" fill="none" stroke="#0284c7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    ${points.map((p, i) => {
                      const x = padL + i * stepX;
                      const y = padT + H - (p.pct / maxP) * H;
                      return `<circle cx="${x}" cy="${y}" r="4" fill="#0284c7" stroke="#fff" stroke-width="2"/>`;
                    }).join('')}
                    ${points.map((p, i) => {
                      const x = padL + i * stepX;
                      return `<text x="${x}" y="185" font-size="10" text-anchor="middle" fill="#6b7280">${p.date.slice(5)}</text>`;
                    }).join('')}`;
          })()}
        </svg>
        <div class="muted-small" style="text-align:center;margin-top:8px">نسبة التشغيل اليومية المقدرة بناءً على البيانات الحالية</div>
      </div>
    </div>

    <!-- أكثر السيارات المتاحة للإيجار -->
    <div class="home-card">
      <div class="home-card-head">
        <h3>🅿️ أكثر السيارات المتاحة للإيجار (الأقل استخداماً)</h3>
        <span class="home-badge">${topAvailableCars.length}</b> سيارة</span>
      </div>
      <div class="home-tasks">
        ${topAvailableCars.map(c => `
          <div class="home-task-row">
            <button type="button" class="home-task" data-go="fleet">
              <span class="home-task-n alert">${c.daysIdle} يوم</span>
              <span class="home-task-label">${escapeHtml(c.plate)} - ${escapeHtml(c.model)}</span>
              <span class="home-task-arrow">←</span>
            </button>
            <span class="home-kpi-pct warn">فرع: ${escapeHtml(c.branch)}</span>
          </div>
        `).join('')}
        ${topAvailableCars.length === 0 ? '<div style="text-align:center;padding:20px;color:#6b7280">لا توجد سيارات متاحة للإيجار حالياً</div>' : ''}
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
          <button type="button" class="home-task-history-btn" id="btn-wa-history" title="سجل التنبيهات المرسلة عبر واتساب">🕘 سجل التنبيهات</button>
          <span class="home-badge">${todayCount || todayTasks.length}</span>
        </div>
        <div class="home-tasks">
          ${todayTasks.map(t => `
            <div class="home-task-row">
              <button type="button" class="home-task" data-go="${t.go}">
                <span class="home-task-n ${t.alert ? 'alert' : ''}">${t.n}</span>
                <span class="home-task-label">${escapeHtml(t.label)}</span>
                <span class="home-task-arrow">←</span>
              </button>
              ${t.kind ? `<button type="button" class="home-task-wa" data-wa-task="${t.kind}" title="واتساب + PDF — تنبيه المستلمين بالسيارات دي" aria-label="واتساب ${escapeHtml(t.label)}">💬</button>` : ''}
            </div>`).join('')}
        </div>
        <button type="button" class="home-link-all" data-go="preparation">عرض كل المهام ←</button>
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
    <!-- Fleet history -->
    <div class="home-churn-grid">
      <div class="home-card home-trend-card">
        <div class="home-card-head">
          <h3>📈 تاريخ الأسطول</h3>
          <span class="muted-small">${trend.length >= 2 ? 'عدد السيارات + نسبة الجاهزية — آخر ' + trend.length + ' يوم' : 'بيبدأ التسجيل من اليوم — افتح المنصة يوميًا ليتراكم التاريخ'}</span>
        </div>
        ${trendSvg ? `<div class="home-trend-legend"><span><i style="background:#C6952E"></i>عدد السيارات (${trend[trend.length-1].total})</span><span><i style="background:#0BAA86"></i>الجاهزية (${trend[trend.length-1].pct || 0}%)</span></div>${trendSvg}`
          : `<div class="home-trend-empty"><div class="home-trend-now"><b>${total.toLocaleString('en')}</b><span>سيارة اليوم</span><b>${pReady}%</b><span>الجاهزية</span></div><div class="muted-small">المنحنى بيظهر من يومينمختلفين — افتح المنصة كل يوم وسجل يومي تتراكم تلقائيًا.</div></div>`}
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
  </div>`;}

/* ===== ربط الأحداث ===== */
function bindDashboardEvents(content, context, state) {
  const { setCurrentTab } = context;
  const { branchFull, mapMode, regionById, regionStats } = state;
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
                  /* نفس مبدأ دليل الفروع: pendingFleetBranch + نقرة
                     ملاحة الأسطول ويكفي — مفيش render() إضافي،
                     لأن الرسم الثاني بيتم بعد استهلاك الـpending
                     فيعيد بناء الأسطول بفلاتر فاضية ويظهر كل السيارات. */
                  window.pendingFleetBranch = btn.dataset.regionBranch;
                  const nav = document.querySelector('.nav-item[data-tab="fleet"]');
                  if (nav) nav.click();
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
        s.onerror=fail;
        document.head.appendChild(s);
      }catch(e){yahmaErr(e,'dashboard.js:774');}
    }, 300);
  })();

  content.querySelectorAll('.map-mode-btn').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem('yahma-map-mode', b.dataset.mapMode); } catch(e){yahmaErr(e,'dashboard.js:779');}
    if (typeof render === 'function') render();
  }));

  /* ===== توقّع الدوران: الانتقال للأسطول بالفلتر المناسب ===== */

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

  /* زر واتساب جنب كل تنبيه — نفس تسلسل sharePdfOnWhatsApp
     اللي بيستعمله تبويب بطاقات التشغيل: PDF مرفق + رسالة نصية
     fallback لو مشاركة الملف فشلت. */
  content.querySelectorAll('[data-wa-task]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (typeof sharePdfOnWhatsApp !== 'function' || typeof fleetForTab !== 'function' || typeof fleet === 'undefined') return;
      const kind = btn.getAttribute('data-wa-task');
      const fmt = (v) => (typeof fmtDate === 'function' ? fmtDate(v) : (v || '—'));
      const today = (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10));
      const cfg = {
        card: { tab: 'inspections', head: '🪪 *كروت منتهية — مطلوب الفحص في أسرع وقت — مسؤولية مشرف الفرع*', file: 'كروت-' + today, cap: '🪪 تقرير الكروت (', title: 'تقرير الكروت التي تحتاج متابعة',
          headers: ['رقم اللوحة', 'الماركة', 'الفرع', 'حالة السيارة', 'حالة الكارت', 'انتهاء الكارت'],
          row: c => [c.plate || '—', c.brand || '—', c.branch || '—', c.carStatus || '—', (c.cardExpiry || c.cardStatus ? (typeof cardDisplayStatus === 'function' ? cardDisplayStatus(c.cardExpiry, c.cardStatus).label : '—') : '—'), c.cardExpiry ? fmt(c.cardExpiry) : '—'],
          line: c => (c.plate || '—') + ' | الكارت: ' + (typeof cardDisplayStatus === 'function' ? cardDisplayStatus(c.cardExpiry, c.cardStatus).label : '—') + (c.cardExpiry ? ' | ينتهي: ' + fmt(c.cardExpiry) : '') + ' | الفرع: ' + (c.branch || '—') },
        inspection: { tab: 'renewals', head: '🔍 *سيارات تحتاج فحص — مطلوب في أسرع وقت*', file: 'فحص-' + today, cap: '🔍 تقرير الفحص (', title: 'تقرير السيارات التي تحتاج فحص',
          headers: ['رقم اللوحة', 'الماركة', 'الفرع', 'حالة السيارة', 'حالة الفحص'],
          row: c => [c.plate || '—', c.brand || '—', c.branch || '—', c.carStatus || '—', c.inspectionStatus || '—'],
          line: c => (c.plate || '—') + ' | الفحص: ' + (c.inspectionStatus || '—') + ' | الفرع: ' + (c.branch || '—') },
        license: { tab: 'license-renewals', head: '📄 *رخص سير منتهية — مطلوب التجديد فورًا*', file: 'رخص-' + today, cap: '📄 تقرير الرخص (', title: 'تقرير الرخص المنتهية',
          headers: ['رقم اللوحة', 'الماركة', 'الفرع', 'حالة السيارة', 'انتهاء الرخصة', 'حالة الرخصة'],
          row: c => [c.plate || '—', c.brand || '—', c.branch || '—', c.carStatus || '—', c.licenseExpiry ? fmt(c.licenseExpiry) : '—', (typeof dateStatus === 'function' ? dateStatus(c.licenseExpiry).label : '—')],
          line: c => (c.plate || '—') + ' | الرخصة: ' + (c.licenseExpiry ? fmt(c.licenseExpiry) : '—') + ' | الفرع: ' + (c.branch || '—') },
        insurance: { tab: 'insurance-renewals', head: '🛡️ *تأمين غير ساري — مطلوب المتابعة*', file: 'تأمين-' + today, cap: '🛡️ تقرير التأمين (', title: 'تقرير التأمين غير الساري',
          headers: ['رقم اللوحة', 'الماركة', 'الفرع', 'المالك', 'حالة السيارة', 'التأمين'],
          row: c => [c.plate || '—', c.brand || '—', c.branch || '—', c.owner || '—', c.carStatus || '—', (typeof textTag === 'function' ? textTag(c.insuranceStatus).label : '—')],
          line: c => (c.plate || '—') + ' | التأمين: ' + (typeof textTag === 'function' ? textTag(c.insuranceStatus).label : '—') + ' | الفرع: ' + (c.branch || '—') }
      }[kind];
      if (!cfg) return;
      const list = fleetForTab(cfg.tab, fleet);
      const phone = (prompt('رقم واتساب المستلم (اختياري)\nمثال: 2010xxxxxxxx\nاتركه فارغًا لاختيار جهة الاتصال:', '') || '').trim();
      const lines = [cfg.head, 'التاريخ: ' + fmt(new Date()), 'العدد: *' + list.length + '* سيارة', '————————————'];
      if (!list.length) lines.push('✅ لا توجد سيارات تحتاج متابعة في هذا البند.');
      else list.forEach((c, i) => lines.push((i + 1) + ') ' + cfg.line(c)));
      lines.push('————————————', 'مرسل من نظام إدارة الأسطول');
      await sharePdfOnWhatsApp({
        title: cfg.title,
        subtitle: 'إجمالي: ' + list.length + ' سيارة',
        headers: cfg.headers,
        rows: list.map(cfg.row),
        phone: phone,
        filename: cfg.file,
        caption: cfg.cap + list.length + ') — مرفق PDF',
        fallbackText: lines.join('\n')
      });
    });
  });

  /* سجل التنبيهات المرسلة عبر واتساب — يقرأ من YahmaWAHistoryLog
     (بيتسجل تلقائيًا داخل sharePdfOnWhatsApp من كل شاشة). */
  content.querySelector('#btn-wa-history')?.addEventListener('click', () => {
    const esc2 = (v) => escapeHtml(v == null ? '' : String(v));
    const rows = (window.YahmaWAHistoryLog && window.YahmaWAHistoryLog.list()) || [];
    let ov = document.createElement('div');
    ov.className = 'wa-history-overlay';
    const fmtWhen = (iso) => {
      try { return new Date(iso).toLocaleString('ar-EG', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }); }
      catch (_) { return iso || '—'; }
    };
    const buildRows = (list) => list.length ? list.map(r => {
      const confirmed = r.confirmedBy || r.confirmedAt;
      return `
      <tr${confirmed ? ' class="wh-confirmed-row"' : ''}>
        <td class="wh-when">${esc2(fmtWhen(r.at))}</td>
        <td>${esc2(r.title || '—')}</td>
        <td class="wh-count">${r.count == null ? '—' : esc2(r.count)}</td>
        <td>${r.by ? esc2(r.by) : '—'}</td>
        <td>${r.phone ? esc2(r.phone) : 'اختيار جهة اتصال'}</td>
        <td class="${r.pdfOk ? 'wh-ok' : 'wh-bad'}">${r.pdfOk ? '✅ مرفق PDF' : '⚠️ نص فقط'}</td>
        <td class="wh-confirm-cell">${
          confirmed
            ? '<span class="wh-confirmed" title="' + esc2(r.confirmedNote || '') + '">✔ استلم: ' + esc2(r.confirmedBy || '—') + (r.confirmedAt ? ' · ' + esc2(fmtWhen(r.confirmedAt)) : '') + '</span>'
              + '<button type="button" class="wh-unconfirm-btn" data-wa-unconfirm="' + esc2(r.at || '') + '" title="إلغاء التوثيق (لو اتسجل بالغلط)">↩</button>'
            : '<button type="button" class="wh-confirm-btn" data-wa-confirm="' + esc2(r.at || '') + '" title="توثيق مستلم التنبيه">✔ تأكيد الاستلام</button>'
        }</td>
      </tr>`;
    }).join('')
      : `<tr><td colspan="7" class="wh-empty">لم تُرسل أي تنبيهات واتساب بعد — سجّل أول تنبيه من زر 💬 جنب المهام أو من تبويب بطاقات التشغيل.</td></tr>`;
    const buildModal = (list) => `
      <div class="wa-history-modal" dir="rtl">
        <div class="wa-history-head">
          <h3>🕘 سجل التنبيهات المرسلة</h3>
          <div class="wa-history-actions">
            ${list.length ? '<button type="button" class="btn btn-ghost btn-small" id="btn-wa-history-clear">مسح السجل</button>' : ''}
            <button type="button" class="btn btn-ghost btn-small" id="btn-wa-history-close">إغلاق ✕</button>
          </div>
        </div>
        <p class="muted-small">التنبيهات المرسلة عبر واتساب من كل الشاشات — المحلي على هذا الجهاز (آخر 200). «تأكيد الاستلام» بتوثّق مين استلم التقرير وامتى.</p>
        <div class="table-scroll" style="max-height:55vh">
          <table class="fleet-table wa-history-table">
            <thead><tr><th>التاريخ والوقت</th><th>التقرير</th><th>العدد</th><th>المرسل</th><th>المستلم على الواتساب</th><th>الحالة</th><th>اعتماد الاستلام</th></tr></thead>
            <tbody>${buildRows(list)}</tbody>
          </table>
        </div>
      </div>`;
    ov.innerHTML = buildModal(rows);
    document.body.appendChild(ov);
    const redraw = () => {
      const fresh = (window.YahmaWAHistoryLog && window.YahmaWAHistoryLog.list()) || [];
      ov.innerHTML = buildModal(fresh);
      bind();
    };
    const confirmOne = (atIso) => {
      const entry = ((window.YahmaWAHistoryLog && window.YahmaWAHistoryLog.list()) || []).find(r => r && r.at === atIso);
      const who = prompt('مين اللي أكد استلام التنبيه؟\nاسم المسؤول المستلم:', (entry && entry.confirmedBy) || '') || '';
      if (!who.trim()) return;
      const note = prompt('ملاحظة (اختياري):\nمثال: استلم التقرير في الجروب وأقر بالفرشلة', '') || '';
      if (window.YahmaWAHistoryLog.confirm(atIso, { by: who.trim(), note: note.trim() })) redraw();
      else alert('تعذر توثيق الاستلام — الحركة مش موجودة.');
    };
    const bind = () => {
      ov.querySelector('#btn-wa-history-close')?.addEventListener('click', () => ov.remove());
      ov.querySelector('#btn-wa-history-clear')?.addEventListener('click', () => {
        if (!confirm('مسح سجل التنبيهات كله من هذا الجهاز؟')) return;
        if (window.YahmaWAHistoryLog) window.YahmaWAHistoryLog.clear();
        ov.remove();
      });
      ov.querySelectorAll('[data-wa-confirm]').forEach(b => b.addEventListener('click', () => confirmOne(b.getAttribute('data-wa-confirm'))));
      ov.querySelectorAll('[data-wa-unconfirm]').forEach(b => b.addEventListener('click', () => {
        if (!confirm('إلغاء توثيق الاستلام لهذا التنبيه؟')) return;
        if (window.YahmaWAHistoryLog.unconfirm(b.getAttribute('data-wa-unconfirm'))) redraw();
      }));
    };
    bind();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
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
