/*
 * modules/dashboard-view.js — عرض لوحة التحكم الرئيسية
 *
 * القالب (HTML) وربط الأحداث. كل دالة تتلقى `state` — كائن الحالة
 * الذي تختاره computeDashboardState — بالإضافة إلى `content` و`context`
 * عند الحاجة.
 */
(function (global) {
  'use strict';

function formatRelativeTime(timeStr) {
  if (!timeStr || timeStr === '—') return '';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return '';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'الآن';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return 'منذ ساعة';
    if (diffHours === 2) return 'منذ ساعتين';
    if (diffHours < 24) return `منذ ${diffHours} ساعات`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return String(timeStr).slice(0, 10);
  } catch (_) {
    return '';
  }
}

function getActivityIcon(title, detail) {
  const str = String(title || '') + ' ' + String(detail || '');
  if (/نقل|سيار|أسطول/i.test(str)) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`;
  }
  if (/حفظ|تحديث|تعديل/i.test(str)) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
  }
  if (/فحص|معاينة/i.test(str)) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

/* ===== القالب ===== */
function dashboardTemplate(state) {
  const { activity, available, branchFull, colors, conicParts, dFinal, dNeed, dPrep, dReady, expiringCars, fmtTime, gaugeSvg, histBase, idleCount, idleLossRounded, topIdleBranchName, topIdleBranchCount, leastIdleBranchName, leastIdleBranchCount, isToday, mapMode, pReady, pRenCard, pRenIns, pRenInsp, pRenLic, pct, ready, reasonRows, regionById, regionStats, renCard, renIns, renInsp, renLic, rented, stOf, todayCount, todayIso, todayTasks, topBranches, total, trend, trendSvg, availableCount, occupancyRate, topAvailableCars, mostOccupiedBranchName, mostOccupiedBranchPct, leastOccupiedBranchName, leastOccupiedBranchPct, occupancyTrend } = state;

  const reasonPalette = ['#E04F36', '#EA7C2E', '#F5A665', '#F8BD4F', '#2BB8A8'];
  let accReasonPct = 0;
  const reasonDonutConic = (reasonRows && reasonRows.length) ? reasonRows.map((r, i) => {
    const c = reasonPalette[i % reasonPalette.length];
    const start = accReasonPct;
    accReasonPct += (r.pct || 0);
    return `${c} ${start.toFixed(1)}% ${accReasonPct.toFixed(1)}%`;
  }).join(', ') : '#CBD5E1 0% 100%';
  const finalDonutConic = (reasonRows && reasonRows.length)
    ? (accReasonPct < 99.5 ? `${reasonDonutConic}, #E2E8F0 ${accReasonPct.toFixed(1)}% 100%` : reasonDonutConic)
    : '#E2E8F0 0% 100%';
  const topReasonCount = (reasonRows && reasonRows.length) ? reasonRows[0].count : Math.max(0, total - ready);

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

    /* ===== كروت التقارير السفلية — تصميم عصري حديث ===== */
    .home-bottom {
      display: grid !important;
      grid-template-columns: 1.15fr 1fr 1fr !important;
      gap: 14px !important;
      margin-top: 14px;
    }
    @media (max-width: 1080px) {
      .home-bottom {
        grid-template-columns: 1fr !important;
      }
    }
    .modern-dash-card {
      background: #ffffff !important;
      border: 1px solid #EAEFF5 !important;
      border-radius: 16px !important;
      padding: 18px 20px !important;
      box-shadow: 0 2px 10px rgba(15, 25, 60, 0.03) !important;
      display: flex;
      flex-direction: column;
    }
    .modern-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .modern-card-header h3 {
      margin: 0 !important;
      font-size: 15px !important;
      font-weight: 800 !important;
      color: #171C2E !important;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .modern-header-pill {
      background: #F4F7FB;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #4B5563;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all .15s ease;
      font-family: inherit;
    }
    .modern-header-pill:hover {
      background: #E8EEF5;
      color: #0F172A;
      border-color: #CBD5E1;
    }

    /* 1. أسباب عدم الجاهزية */
    .modern-reasons-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      flex: 1;
    }
    .modern-reasons-bars {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 11px;
    }
    .modern-reason-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .modern-reason-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12.5px;
    }
    .modern-reason-name {
      font-weight: 700;
      color: #1E293B;
    }
    .modern-reason-val {
      font-size: 12px;
      color: #64748B;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .modern-reason-val b {
      color: #1E293B;
      font-weight: 800;
    }
    .modern-reason-track {
      height: 8px;
      background: #F1F5F9;
      border-radius: 999px;
      overflow: hidden;
    }
    .modern-reason-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      transition: width .6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .modern-donut-col {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }
    .modern-donut-ring {
      width: 142px;
      height: 142px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    }
    .modern-donut-hole {
      width: 98px;
      height: 98px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 6px;
    }
    .modern-donut-num {
      font-size: 24px;
      font-weight: 900;
      color: #0F172A;
      line-height: 1;
    }
    .modern-donut-lbl {
      font-size: 10.5px;
      font-weight: 600;
      color: #64748B;
      margin-top: 4px;
    }

    /* 2. جاهزية الفروع */
    .modern-branches-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .modern-branch-card {
      background: #F8FAFC;
      border: 1px solid #EAEFF5;
      border-radius: 12px;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: transform .12s, box-shadow .12s, background .12s;
    }
    .modern-branch-card:hover {
      background: #FFFFFF;
      border-color: #CBD5E1;
      box-shadow: 0 3px 10px rgba(15, 25, 60, 0.04);
    }
    .modern-branch-main {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modern-branch-name {
      font-weight: 700;
      font-size: 12.5px;
      color: #1E293B;
    }
    .modern-branch-total {
      font-weight: 800;
      font-size: 13.5px;
      color: #0F172A;
    }
    .modern-branch-counts {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 11px;
    }
    .br-stat-ready {
      color: #059669;
      font-weight: 700;
    }
    .br-stat-ready b {
      font-weight: 800;
    }
    .br-stat-unready {
      color: #DC2626;
      font-weight: 700;
    }
    .br-stat-unready b {
      font-weight: 800;
    }
    .modern-branch-radial {
      position: relative;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .modern-radial-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .radial-text {
      position: absolute;
      font-size: 10.5px;
      font-weight: 800;
      color: #0F172A;
    }
    .modern-card-footer-btn {
      background: #0B918D;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 10px;
      transition: background .15s, transform .08s;
      box-shadow: 0 2px 8px rgba(11, 145, 141, 0.2);
      font-family: inherit;
    }
    .modern-card-footer-btn:hover {
      background: #087572;
      box-shadow: 0 4px 12px rgba(11, 145, 141, 0.28);
    }
    .modern-card-footer-btn:active {
      transform: scale(0.98);
    }

    /* 3. أحدث النشاطات */
    .modern-timeline-list {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 13px;
      flex: 1;
    }
    .modern-timeline-list::before {
      content: '';
      position: absolute;
      left: 18px;
      top: 14px;
      bottom: 14px;
      width: 2px;
      background: #D1E5E3;
      z-index: 0;
    }
    .modern-timeline-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      position: relative;
    }
    .modern-tl-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .modern-tl-title {
      font-size: 12.5px;
      font-weight: 800;
      color: #0F172A;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modern-tl-desc {
      font-size: 11px;
      color: #64748B;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modern-tl-time {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      font-size: 10.5px;
      color: #64748B;
      flex-shrink: 0;
    }
    .modern-tl-stamp {
      font-weight: 700;
      color: #334155;
    }
    .modern-tl-rel {
      color: #94A3B8;
    }
    .modern-tl-node-col {
      width: 38px;
      flex: 0 0 38px;
      display: flex;
      justify-content: center;
    }
    .modern-tl-node {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      background: #F0F8F8;
      border: 1.5px solid #C4E5E2;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;
      color: #0B918D;
      box-shadow: 0 1px 3px rgba(11, 145, 141, 0.08);
    }

    /* Dark mode styling */
    body.dark-mode .modern-dash-card {
      background: #142537 !important;
      border-color: #2A3C4D !important;
      box-shadow: none !important;
    }
    body.dark-mode .modern-card-header h3 {
      color: #F1F7FB !important;
    }
    body.dark-mode .modern-header-pill {
      background: #0D1926;
      border-color: #2A3C4D;
      color: #C9D7E2;
    }
    body.dark-mode .modern-header-pill:hover {
      background: #182C40;
      color: #FFFFFF;
    }
    body.dark-mode .modern-reason-name {
      color: #E2E8F0;
    }
    body.dark-mode .modern-reason-val {
      color: #94A3B8;
    }
    body.dark-mode .modern-reason-val b {
      color: #F1F7FB;
    }
    body.dark-mode .modern-reason-track {
      background: #1D3042;
    }
    body.dark-mode .modern-donut-hole {
      background: #142537;
    }
    body.dark-mode .modern-donut-num {
      color: #F1F7FB;
    }
    body.dark-mode .modern-donut-lbl {
      color: #8FA6B5;
    }
    body.dark-mode .modern-branch-card {
      background: #0D1926;
      border-color: #2A3C4D;
    }
    body.dark-mode .modern-branch-card:hover {
      background: #182C40;
    }
    body.dark-mode .modern-branch-name {
      color: #E2E8F0;
    }
    body.dark-mode .modern-branch-total {
      color: #F1F7FB;
    }
    body.dark-mode .radial-bg {
      stroke: #1D3042;
    }
    body.dark-mode .radial-text {
      color: #F1F7FB;
    }
    body.dark-mode .modern-timeline-list::before {
      background: #2A3C4D;
    }
    body.dark-mode .modern-tl-title {
      color: #F1F7FB;
    }
    body.dark-mode .modern-tl-desc {
      color: #8FA6B5;
    }
    body.dark-mode .modern-tl-stamp {
      color: #C9D7E2;
    }
    body.dark-mode .modern-tl-rel {
      color: #64748B;
    }
    body.dark-mode .modern-tl-node {
      background: #0D1926;
      border-color: #2A3C4D;
      color: #2DD4BF;
    }
  </style>
  <div class="home-dash">
    <!-- تم حذف قسم أولويات التجهيز (YAHMAA · COMMAND CENTER) بناءً على طلب المستخدم -->
    <!-- تم حذف شارة تنبيه التدخل الفوري (0% ⚠️) بناءً على طلب المستخدم -->
    <!-- Hero: كرت بتصميم موحّد مع باقي كروت الصفحة الرئيسية -->
    <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:14px;margin-bottom:14px" class="mock-hero-grid">
      <div class="home-hero-card" style="background:#FFFFFF;border:1px solid #E3EAF0;border-radius:18px;padding:22px 24px;color:#172B3D;box-shadow:0 4px 18px rgba(16,36,58,.04)">
        <p style="display:flex;align-items:center;gap:6px;color:#087C7A;font-weight:800;font-size:13px;margin:0 0 12px">✨ نظرة عامة تشغيلية</p>
        <div style="display:flex;align-items:flex-end;gap:10px"><h2 style="margin:0;font-size:56px;font-weight:900;line-height:.95;letter-spacing:-.02em;color:#10243A">${total.toLocaleString('en')}</h2><span style="padding-bottom:6px;font-weight:800;color:#6C7C8D">سيارة</span></div>
        <h3 style="margin:6px 0 8px;font-size:18px;font-weight:900;color:#10243A">إجمالي الأسطول</h3>
        <p style="margin:0 0 18px;color:#6C7C8D;line-height:1.7;font-size:13px">صورة تشغيلية موحّدة لحركة الأسطول والركود والتوفر الفوري، من دون تشتيت بين التقارير.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="background:#F8FAFB;border:1px solid #E3EAF0;border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#087C7A">↗ مؤجرة</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#10243A">${rented.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#6C7C8D">سيارة ضمن التشغيل</p></div>
          <div style="background:#F8FAFB;border:1px solid #E3EAF0;border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#16866F">✓ متاحة فوراً</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#10243A">${availableCount.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#6C7C8D">جاهزة للإيجار الآن</p></div>
          <div style="background:rgba(223,79,79,.08);border:1px solid rgba(223,79,79,.20);border-radius:14px;padding:12px 14px"><p style="margin:0;font-size:12px;font-weight:800;color:#C84C4C">↘ راقدة</p><p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#10243A">${idleCount.toLocaleString('en')}</p><p style="margin:2px 0 0;font-size:11px;color:#6C7C8D">غير مؤجرة</p></div>
        </div>
      </div>
      <div style="background:#FFFFFF;border:1px solid #E3EAF0;border-radius:18px;padding:22px;color:#172B3D;box-shadow:0 4px 18px rgba(16,36,58,.04);position:relative;overflow:hidden">
        <div style="position:absolute;inset-inline-start:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(8,124,122,.04)"></div>
        <p style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#087C7A">🩺 صحة الأسطول</p>
         <div style="margin:12px 0 6px">${gaugeSvg}</div>
         <p style="margin:0;font-size:12px;color:#6C7C8D">${rented} من ${total} سيارة مؤجرة</p>
         <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;margin-top:14px;padding-top:12px;border-top:1px solid #E3EAF0">
           <div><p style="margin:0;font-size:10px;color:#6C7C8D;font-weight:700">جاهزية</p><p style="margin:4px 0 0;font-size:18px;font-weight:900;color:#0BAA86">${pReady}%</p></div>
           <div><p style="margin:0;font-size:10px;color:#6C7C8D;font-weight:700">تشغيل</p><p style="margin:4px 0 0;font-size:18px;font-weight:900;color:#087C7A">${occupancyRate}%</p></div>
           <div><p style="margin:0;font-size:10px;color:#6C7C8D;font-weight:700">متاحة</p><p style="margin:4px 0 0;font-size:18px;font-weight:900;color:#10243A">${availableCount}</p></div>
         </div>
         <div style="width:100%;margin-top:10px">
           <svg viewBox="0 0 120 32" style="width:100%;height:32px;display:block">
             ${(() => { const pts = occupancyTrend.map((p,i) => (i*20) + "," + (32 - ( (Number(p.pct)||0) /100)*28).toFixed(1)).join(" "); return "<polyline points=\"" + pts + "\" fill=\"none\" stroke=\"#087C7A\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"; })()}
           </svg>
           <p style="margin:4px 0 0;font-size:10px;color:#6C7C8D;text-align:center">اتجاه التشغيل (7 أيام)</p>
         </div>
      </div>
    </div>
    <style>@media(max-width:900px){.mock-hero-grid{grid-template-columns:1fr !important}}</style>

    <style>
    .dark-sec{background:#FFFFFF;border:1px solid #E3EAF0;border-radius:20px;padding:20px;margin-bottom:14px;color:#172B3D;box-shadow:0 4px 18px rgba(16,36,58,.04)}
    .dark-sec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
    .dark-sec-label{margin:0;color:#087C7A;font-size:11px;font-weight:800}
    .dark-sec-title{margin:4px 0 0;font-size:24px;font-weight:900;color:#10243A}
    .dark-sec-pill{background:#E6F5F4;color:#087C7A;font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px;white-space:nowrap}
    .dark-grid-3{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    @media(max-width:900px){.dark-grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.dark-grid-3{grid-template-columns:1fr}}
    .dark-card{background:#F8FAFB;border:1px solid #E3EAF0;border-radius:16px;padding:16px;color:#172B3D;min-height:150px}
    .dark-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .dark-tile{width:42px;height:42px;border-radius:12px;background:#F8FAFB;border:1px solid #E3EAF0;display:grid;place-items:center;font-size:20px;flex:none}
    .dark-tile.green{background:#E8F5F3;color:#16866F;border-color:#CBE8DE}
    .dark-pct{font-size:11px;font-weight:900;padding:4px 8px;border-radius:999px;white-space:nowrap}
    .dark-label{margin:14px 0 4px;color:#6C7C8D;font-size:12px;font-weight:700;line-height:1.5}
    .dark-num{margin:0;font-size:30px;font-weight:900;color:#10243A;line-height:1.1;text-align:center}
    .dark-bar{margin-top:12px;height:6px;background:#E3EAF0;border-radius:999px;overflow:hidden}
    .dark-bar i{display:block;height:100%;border-radius:999px;position:relative}
    .dark-bar i::after{content:'';position:absolute;inset-inline-end:-4px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:inherit;box-shadow:0 0 0 2px #fff}
    .dark-note{margin:8px 0 0;color:#6C7C8D;font-size:11px;line-height:1.6;text-align:left}
    .dark-summary{background:#F8FAFB;border:1px solid #E3EAF0;border-radius:16px;padding:16px;color:#172B3D;min-height:150px}
    .dark-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:900px){.dark-2col{grid-template-columns:1fr}}
    .dark-big{font-size:54px;font-weight:900;line-height:1;color:#10243A}
    .dark-sub{color:#6C7C8D;font-size:12px;line-height:1.7}
    .dark-inner{background:#F8FAFB;border:1px solid #E3EAF0;border-radius:14px;padding:14px}
    .dark-inner-label{margin:0;color:#6C7C8D;font-size:11px;font-weight:700}
    .dark-inner-num{margin:6px 0 0;font-size:22px;font-weight:900;color:#10243A}
    .dark-cmp{background:#F8FAFB;border:1px solid #E3EAF0;border-radius:14px;padding:14px;margin-top:12px}
    .dark-cmp-title{margin:0;font-size:13px;font-weight:800;color:#10243A}
    .dark-row{margin-top:12px}
    .dark-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:800;color:#10243A}
    .dark-row-track{margin-top:7px;height:6px;background:#E3EAF0;border-radius:999px;overflow:hidden}
    .dark-row-fill{height:100%;border-radius:999px;position:relative}
    .dark-row-note{margin:4px 0 0;text-align:left;color:#6C7C8D;font-size:11px}
    .dark-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;justify-content:center}
    .dark-foot span{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;padding:5px 10px;border-radius:999px}
    .dark-summary-title{margin:0;color:#087C7A;font-size:12px;font-weight:800}
    .dark-summary-big{margin:10px 0 0;font-size:24px;font-weight:900;line-height:1.5;color:#10243A}
    .dark-summary-desc{margin:8px 0 0;color:#6C7C8D;font-size:12px;line-height:1.7}
    .dark-summary-foot{display:flex;align-items:center;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid #E3EAF0;color:#10243A;font-size:12px;font-weight:800}
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
        <div style="display:flex;align-items:flex-end;gap:10px;margin-top:6px"><p class="dark-big">${idleCount.toLocaleString('en')}</p><span style="padding-bottom:8px;font-weight:800;color:#6C7C8D">سيارة</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div class="dark-inner"><p class="dark-inner-label">الخسارة من الركود</p><p class="dark-inner-num">${idleLossRounded.toLocaleString('en')} <span style="font-size:13px;color:#6C7C8D">ر.س</span></p></div>
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
            <p style="margin:6px 0 0;font-size:44px;font-weight:900;color:#10243A;line-height:1">${availableCount.toLocaleString('en')}</p>
            <p class="dark-sub" style="margin:8px 0 0">${rented} من ${total} سيارة مؤجرة ضمن نسبة التشغيل الإجمالية.</p>
          </div>
          <div style="position:relative;width:150px;height:150px;flex:none;margin-inline:auto">
            <svg viewBox="0 0 160 160" style="width:100%;height:100%;transform:rotate(-90deg)">
              <circle cx="80" cy="80" r="68" fill="none" stroke="#E3EAF0" stroke-width="16"></circle>
              <circle cx="80" cy="80" r="68" fill="none" stroke="#0BAA86" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 68).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 68 * (1 - Math.min(100, Number(occupancyRate) || 0) / 100)).toFixed(1)}"></circle>
            </svg>
            <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#10243A">
              <div><p style="margin:0;font-size:30px;font-weight:900;line-height:1">${occupancyRate}%</p><p style="margin:4px 0 0;font-size:11px;color:#6C7C8D;font-weight:700">التشغيل</p></div>
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



    <!-- تم حذف تقرير أكثر السيارات المتاحة للإيجار بناءً على طلب المستخدم -->


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

    <!-- Bottom row: التقارير بنظام حديث وأشكال جديدة مطابقة للمعاينة -->
    <div class="home-bottom">
      <!-- 1. أعلى سبب عدم الجاهزية -->
      <div class="home-card modern-dash-card">
        <div class="home-card-head modern-card-header">
          <h3>أعلى سبب عدم الجاهزية 🚨</h3>
        </div>
        <div class="modern-reasons-wrap">
          <div class="modern-reasons-bars">
            ${reasonRows && reasonRows.length ? reasonRows.map((r, i) => {
              const col = reasonPalette[i % reasonPalette.length];
              return `
                <div class="modern-reason-row" data-tip="${escapeHtml(r.label)}: ${r.count} (${r.pct}%)" data-go="fleet" style="cursor:pointer">
                  <div class="modern-reason-top">
                    <span class="modern-reason-name">${escapeHtml(r.label)}</span>
                    <span class="modern-reason-val"><b>${r.pct}%</b> ${r.count.toLocaleString('en')}</span>
                  </div>
                  <div class="modern-reason-track">
                    <i class="modern-reason-fill" style="background:${col};width:0%" data-w="${Math.min(100, r.pct)}%"></i>
                  </div>
                </div>
              `;
            }).join('') : '<div class="empty">كل السيارات مستوفية للشروط 👍</div>'}
          </div>
          <div class="modern-donut-col">
            <div class="modern-donut-ring" style="background:conic-gradient(${finalDonutConic})">
              <div class="modern-donut-hole">
                <b class="modern-donut-num">${topReasonCount.toLocaleString('en')}</b>
                <span class="modern-donut-lbl">سيارة غير جاهزة</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. جاهزية الفروع -->
      <div class="home-card modern-dash-card">
        <div class="home-card-head modern-card-header">
          <h3>جاهزية الفروع 📍</h3>
          <button type="button" class="modern-header-pill" data-go="branches">≡ الكل</button>
        </div>
        <div class="modern-branches-list">
          ${topBranches && topBranches.length ? topBranches.slice(0, 5).map(b => `
            <div class="modern-branch-card" data-go="branches" style="cursor:pointer">
              <div class="modern-branch-main">
                <span class="modern-branch-name">${escapeHtml(b.name)}</span>
                <b class="modern-branch-total">${b.total}</b>
              </div>
              <div class="modern-branch-counts">
                <span class="br-stat-ready">جاهز: <b>${b.ready}</b></span>
                <span class="br-stat-unready">غير جاهز: <b>${b.notReady}</b></span>
              </div>
              <div class="modern-branch-radial">
                <svg viewBox="0 0 36 36" class="modern-radial-svg">
                  <path class="radial-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#EDF2F7" stroke-width="3.5" />
                  <path class="radial-progress" stroke-dasharray="${b.pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${b.pct >= 70 ? '#10B981' : b.pct >= 50 ? '#0B918D' : '#EF4444'}" stroke-width="3.5" stroke-linecap="round" />
                </svg>
                <span class="radial-text">${b.pct}%</span>
              </div>
            </div>
          `).join('') : '<div class="empty">لا توجد فروع</div>'}
        </div>
        <button type="button" class="modern-card-footer-btn" data-go="branches">
          <span>عرض جميع الفروع</span>
          <span>←</span>
        </button>
      </div>

      <!-- 3. أحدث النشاطات -->
      <div class="home-card modern-dash-card">
        <div class="home-card-head modern-card-header">
          <h3>أحدث النشاطات 🕘</h3>
          <button type="button" class="modern-header-pill" data-go="audit">رؤية الكل</button>
        </div>
        <div class="modern-timeline-list">
          ${activity && activity.length ? activity.slice(0, 4).map(a => `
            <div class="modern-timeline-row">
              <div class="modern-tl-main">
                <b class="modern-tl-title">${escapeHtml(a.title)}</b>
                <span class="modern-tl-desc">${escapeHtml(a.detail)}</span>
              </div>
              <div class="modern-tl-time">
                <span class="modern-tl-stamp">${escapeHtml(fmtTime(a.time))}</span>
                <span class="modern-tl-rel">${formatRelativeTime(a.time)}</span>
              </div>
              <div class="modern-tl-node-col">
                <div class="modern-tl-node">
                  ${getActivityIcon(a.title, a.detail)}
                </div>
              </div>
            </div>
          `).join('') : '<div class="empty">لا توجد نشاطات مسجلة بعد 👍</div>'}
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
