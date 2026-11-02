/* ===== وضع الشاشة الكبيرة (TV Mode) =====
   شاشة استقبال/مكبّرة فالمكتب: يخفي الشريط الجانبي والأزرار الزايدة،
   يكبّر الخط ويفرض الوضع الليلي (أنسب للشاشات)، ويعرض الرئيسية
   بتحديث تلقائي كل 30 ثانية + ساعة وتاريخ ثابتين فوق.
   زر 📺 في الشريط العلوي · خروج: نفس الزر أو Esc أو خروج ملء الشاشة. */
(function (global) {
  'use strict';

  var autoTimer = null;      /* تحديث البيانات كل 30 ثانية */
  var clockTimer = null;     /* عقارب الساعة تُحدّث كل ثانية */
  var clockEl = null;

  function active() { return document.body.classList.contains('tv-mode'); }

  function buildClock() {
    clockEl = document.createElement('div');
    clockEl.id = 'tv-clock';
    clockEl.innerHTML = '<b id="tv-clock-time">—</b><small id="tv-clock-date"></small>';
    document.body.appendChild(clockEl);
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  function tick() {
    if (!clockEl) return;
    var now = new Date();
    var time = document.getElementById('tv-clock-time');
    var date = document.getElementById('tv-clock-date');
    try {
      if (time) time.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      if (date) date.textContent = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) {
      if (time) time.textContent = now.toLocaleTimeString();
    }
  }

  function enter() {
    /* TV بيتفضل دايمًا داكن — أريح للعين على الشاشات */
    if (localStorage.getItem('fleet-theme') !== 'dark') {
      localStorage.setItem('fleet-theme', 'dark');
      document.body.classList.add('dark-mode');
      var icon = document.getElementById('theme-icon');
      var label = document.getElementById('theme-label');
      if (icon) icon.textContent = '☀';
      if (label) label.textContent = 'الوضع النهاري';
    }
    try {
      var p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      if (p && typeof p.catch === 'function') p.catch(function () { /* بدون ملء الشاشة أيضًا نكمل */ });
    } catch (_) {}
    buildClock();
    document.body.classList.add('tv-mode');
    var tvBtn = document.getElementById('btn-tv');
    if (tvBtn) tvBtn.classList.add('active');
    /* نفتح الرئيسية لو مش مفتوحة */
    var curTab = null;
    try { curTab = typeof window.yahmaGetTab === 'function' ? window.yahmaGetTab() : global.currentTab; } catch (_) {}
    if (curTab !== 'dashboard') {
      var nav = document.querySelector('.nav-item[data-tab="dashboard"]');
      if (nav) nav.click();
    }
    autoTimer = setInterval(function () {
      try { var b = document.getElementById('btn-refresh'); if (b && !b.disabled) b.click(); } catch (_) {}
    }, 30000);
  }

  function exit() {
    document.body.classList.remove('tv-mode');
    var tvBtn = document.getElementById('btn-tv');
    if (tvBtn) tvBtn.classList.remove('active');
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (clockEl) { clockEl.remove(); clockEl = null; }
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    } catch (_) {}
    try { if (typeof render === 'function') render(); } catch (_) {}
  }

  function toggle() { active() ? exit() : enter(); }

  function init() {
    var btn = document.getElementById('btn-tv');
    if (btn && !btn._tvBound) {
      btn._tvBound = true;
      btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    }
    if (!window._tvGlobals) {
      window._tvGlobals = true;
      /* Esc = خروج من TV (حتى لو ملء الشاشة مش مفعّل) */
      document.addEventListener('keydown', function (e) {
        if (active() && e.key === 'Escape') exit();
      });
      /* لو المستخدم خرج من ملء الشاشة (Esc أو زر المتصفح) نخرج من الوضع كله */
      document.addEventListener('fullscreenchange', function () {
        if (active() && !document.fullscreenElement) exit();
      });
    }
  }

  window.YahmaTV = { toggle: toggle, enter: enter, exit: exit, active: active };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
