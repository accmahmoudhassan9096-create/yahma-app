/* ===== إصدار التطبيق + التحديث التلقائي =====
   التطبيق كان بيعمل cache-first من غير ما يقول للمستخدم إن فيه نسخة جديدة،
   فالمستخدم يفضل يشغّل نسخة قديمة ويحتجب «لسه بردوا».
   هنا: نقرأ رقم النسخة من sw.js، نعرضه، ونقترح التحديث لما يتوفر جديد. */
(function (global) {
  'use strict';

  var CURRENT = '';
  var reloadTimer = null;
  var onUpdate = null;

  function setBadge(version) {
    CURRENT = version || '';
    var badge = document.getElementById('yahma-version-badge');
    if (!badge) return;
    var short = CURRENT ? CURRENT.replace('yahma-shell-v', 'v') : '—';
    badge.innerHTML = 'الإصدار <b>' + (short || '—') + '</b>';
    badge.title = 'إصدار التطبيق: ' + (CURRENT || 'غير معروف');
    try { global.__yahmaVersion = CURRENT; } catch (_) {}
  }

  async function readVersion() {
    if (typeof fetch !== 'function') return '';
    try {
      const res = await fetch('sw.js?ver=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return '';
      const text = await res.text();
      const m = text.match(/yahma-shell-v\d+/);
      return m ? m[0] : '';
    } catch (_) { return ''; }
  }

  /* لافتة التحديث: بتظهر فورًا، وبتتحدّث تلقائيًا بعد 6 ثواني
     ما دام مفيش نموذج مفتوح (عشان ما نضيعش أي بيانات مكتوبة). */
  function showUpdateBanner() {
    if (document.getElementById('yahma-update-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'yahma-update-toast';
    toast.className = 'yahma-update-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<div class="yut-ico">⟳</div>'
      + '<div class="yut-body"><b>فيه تحديث جديد للتطبيق</b>'
      + '<span>اضغط «تحديث الآن» لتشغيل آخر إصدار.</span></div>'
      + '<button type="button" class="btn btn-primary btn-small" id="yut-reload">تحديث الآن</button>';
    document.body.appendChild(toast);
    var go = function () {
      try { if (reloadTimer) clearTimeout(reloadTimer); } catch (_) {}
      try { location.reload(); } catch (_) {}
    };
    toast.querySelector('#yut-reload').addEventListener('click', go);
    /* تحديث تلقائي بعد 6 ثواني، لكن لو فيه نموذج مفتوح نستنى */
    reloadTimer = setInterval(function () {
      const busy = document.querySelector('.overlay:not(.hidden), .modal, input:focus, select:focus, textarea:focus');
      if (busy) return;
      try { clearInterval(reloadTimer); } catch (_) {}
      go();
    }, 6000);
    setTimeout(function () {
      const busy = document.querySelector('.overlay:not(.hidden), .modal, input:focus, select:focus, textarea:focus');
      if (!busy) { try { clearInterval(reloadTimer); } catch (_) {} go(); }
    }, 12000);
  }

  function compareVersions(a, b) {
    var na = parseInt(String(a).replace(/\D+/g, ''), 10) || 0;
    var nb = parseInt(String(b).replace(/\D+/g, ''), 10) || 0;
    return nb > na;
  }

  function watch(reg) {
    if (!reg) return;
    if (reg.waiting && navigator.serviceWorker.controller) {
      if (compareVersions(CURRENT, '')) showUpdateBanner();
    }
    reg.addEventListener('updatefound', function () {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', function () {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
  }

  async function init() {
    if (typeof location === 'undefined' || location.protocol === 'file:') return;
    const latest = await readVersion();
    if (latest) setBadge(latest);
    if (!('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      watch(reg);
      /* فحص التحديثات: عند فتح التطبيق وعند الرجوع من الخلفية */
      const check = function () {
        try { reg.update(); } catch (_) {}
      };
      check();
      setTimeout(check, 4000);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
      });
    } catch (_) {
      /* التطبيق يعمل بدون SW كمان — نسكت */
    }

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
    });
  }

  global.YahmaAppVersion = {
    init: init,
    setBadge: setBadge,
    readVersion: readVersion,
    showUpdateBanner: showUpdateBanner,
    get current() { return CURRENT; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);