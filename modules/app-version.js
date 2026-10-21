/* ===== إصدار التطبيق + التحديث التلقائي =====
   التطبيق كان بيعمل cache-first من غير ما يقول للمستخدم إن فيه نسخة جديدة،
   فالمستخدم يفضل يشغّل نسخة قديمة ويحتجب «لسه بردوا».
   هنا: نقرأ رقم النسخة من sw.js، نعرضه، ونقترح التحديث لما يتوفر جديد. */
(function (global) {
  'use strict';

  var CURRENT = '';
  var reloadTimer = null;
  var onUpdate = null;
  var startedAt = Date.now();

  function setBadge(version) {
    CURRENT = version || '';
    var badge = document.getElementById('yahma-version-badge');
    if (!badge) return;
    var short = CURRENT ? CURRENT.replace('yahma-shell-v', 'v') : '—';
    badge.innerHTML = 'الإصدار <b>' + (short || '—') + '</b>';
    badge.title = 'إصدار التطبيق: ' + (CURRENT || 'غير معروف') + ' — اضغط لازمّاك على أحدث نسخة';
    try { global.__yahmaVersion = CURRENT; } catch(_){yahmaErr(_,'app-version.js:20');}
    try {
      if (!badge.getAttribute('role')) badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      badge.style.cursor = 'pointer';
      if (!badge.__yahmaBound) {
        badge.__yahmaBound = true;
        var hard = function (e) { if (e) e.preventDefault(); askHardRefresh(); };
        badge.addEventListener('click', hard);
        badge.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') hard(e); });
      }
    } catch(_){yahmaErr(_,'app-version.js:31');}
  }

  /* ===== تحديث قسري =====
     يمسح Service Worker والكاش كله ويعيد تحميل الصفحة من السيرفر.
     ده الضمان الوحيد إن المستخدم يقدر يخرج من نسخة قديمة.

     ⚠️ كمان بنمسح localStorage: كان بيسيب جلسة قديمة وكاش بيانات
     منتهية (بتخلي الأسطول يظهر 0 والتبويبات تختفي). المسح بيكسّر
     الجلسة المحلية — بس الـrefresh token في Supabase بيفضل، فالدخول
     بيحصل من جديد تلقائياً. */
  async function hardRefresh() {
    try { window.__yahmaWarnDismissed = false; } catch(_){yahmaErr(_,'app-version.js:38');}
    try { var t = document.getElementById('yahma-update-toast'); if (t) t.remove(); } catch(_){yahmaErr(_,'app-version.js:39');}
    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
    } catch(_){yahmaErr(_,'app-version.js:45');}
    try {
      if (global.caches && caches.keys) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
    } catch(_){yahmaErr(_,'app-version.js:51');}
    /* ⭐ مسح الكاش المحلي: كاش البيانات والجلسة المنتهية كان
       بيسبّب «الأسطول = 0» والتبويبات مخفية. */
    try {
      if (global.localStorage) {
        var drop = [];
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          /* نسيب مفاتيح اللغة والمظهر — مش دي بيانات */
          if (k && !/^yahma-(lang|theme|dir)/i.test(k)) drop.push(k);
        }
        drop.forEach(function (k) { try { global.localStorage.removeItem(k); } catch(_){} });
      }
    } catch(_){yahmaErr(_,'app-version.js:localStorage');}
    try { if (global.sessionStorage) global.sessionStorage.clear(); } catch(_){yahmaErr(_,'app-version.js:sessionStorage');}
    try { location.replace(location.pathname + '?hard=' + Date.now()); } catch(_){yahmaErr(_,'app-version.js:52');}
  }

  function askHardRefresh() {
    var msg = 'يعمل «تحديث قسري» بيمسح الكاش والنسخة المخزّنة بالكامل،'
            + ' وبيعيد تحميل التطبيق من السيرفر.\n\nمتأكد؟';
    try {
      if (typeof global.confirm === 'function' && global.confirm(msg)) hardRefresh();
    } catch (_) { hardRefresh(); }
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
      + '<button type="button" class="btn btn-ghost btn-small" id="yut-hard">تحديث قسري</button>'
      + '<button type="button" class="btn btn-primary btn-small" id="yut-reload">تحديث الآن</button>';
    document.body.appendChild(toast);
    var go = function () {
      try { if (reloadTimer) clearTimeout(reloadTimer); } catch(_){yahmaErr(_,'app-version.js:89');}
      try { location.reload(); } catch(_){yahmaErr(_,'app-version.js:90');}
    };
    toast.querySelector('#yut-reload').addEventListener('click', go);
    /* تحديث قسري: بيمسح الكاش كله — للمستخدم اللي شايف نسخة قديمة */
    toast.querySelector('#yut-hard').addEventListener('click', function () { askHardRefresh(); });
    /* تحديث تلقائي بعد 6 ثواني، لكن لو فيه نموذج مفتوح نستنى */
    reloadTimer = setInterval(function () {
      const busy = document.querySelector('.overlay:not(.hidden), .modal, input:focus, select:focus, textarea:focus');
      if (busy) return;
      try { clearInterval(reloadTimer); } catch(_){yahmaErr(_,'app-version.js:99');}
      go();
    }, 6000);
    setTimeout(function () {
      const busy = document.querySelector('.overlay:not(.hidden), .modal, input:focus, select:focus, textarea:focus');
      if (!busy) { try { clearInterval(reloadTimer); } catch(_){yahmaErr(_,'app-version.js:104');} go(); }
    }, 12000);
  }

  /* ⭐ النسخة اللي شغالة فعلياً.

     المشكلة: readVersion() بتجيب sw.js من السيرفر — وده **دايماً**
     أحدث نسخة. فالشارة كانت بتقول «v269» حتى لو الكود اللي شغال
     على الجهاز v264! والمستخدم مبيعرفش إنه على نسخة قديمة.

     الصح: نقرا sw.js من Cache Storage — دي النسخة اللي متخزّنة
     وشغالة فعلاً على الجهاز. */
  async function runningVersion() {
    try {
      if (!global.caches || !global.caches.keys) return '';
      var keys = await global.caches.keys();
      for (var i = 0; i < keys.length; i++) {
        try {
          var c = await global.caches.open(keys[i]);
          var res = await c.match('sw.js');
          if (!res) continue;
          var txt = await res.text();
          var m = txt.match(/yahma-shell-v\d+/);
          if (m) return m[0];
        } catch (_) { /* cache مش دي */ }
      }
    } catch (_) { }
    return '';
  }

  /* ⭐ مقارنة الإصدارات.
     كان فيها bug: الكود كان بيحذف كل الأرقام غير الصفرى من نص
     الإصدار، فـ 'yahma-shell-v269' كانت بتتحوّل لـ نص فاضي →
     parseInt فاضي = NaN → 0. يعني **كل الإصدارات بتصير 0**
     والمقارنة دايمًا false — فلافتة «فيه تحديث جديد» عمرها ما ظهرت.

     الصح: ناخد الرقم اللي بعد الـv مباشرة. */
  function versionNumber(v) {
    var m = String(v || '').match(/v(\d+)/);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function compareVersions(a, b) {
    return versionNumber(b) > versionNumber(a);
  }

  function watch(reg) {
    if (!reg) return;
    /* نسخة في انتظار التفعيل = نسخة أحدث جاهزة — اعرض اللافتة.
       الكود القديم كان بيقارن CURRENT بـ '' والنتيجة دايمًا false،
       فالمستخدم ماكانش بيشوف أي تنبيه. */
    if (reg.waiting && navigator.serviceWorker) showUpdateBanner();
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
    /* ⭐ الشارة بتعرض النسخة اللي **شغالة** على الجهاز، مش اللي على
       السيرفر. فرق مهم: كده المستخدم يشوف بعينه إنه على نسخة قديمة
       ويعرف إنه محتاج تحديث. */
    const running = await runningVersion();
    if (running) setBadge(running);
    else if (latest) setBadge(latest);
    if (latest && running && compareVersions(running, latest)) {
      /* فيه نسخة أحدث على السيرفر — نعرض اللافتة فوراً */
      try { showUpdateBanner(); } catch (_) { }
    }
    if (!('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      watch(reg);
      /* فحص التحديثات: عند فتح التطبيق وعند الرجوع من الخلفية */
      const check = function () {
        try { reg.update(); } catch(_){yahmaErr(_,'app-version.js:140');}
      };
      check();
      setTimeout(check, 4000);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
      });
    } catch (_) {
      /* التطبيق يعمل بدون SW كمان — نسكت */
    }

    /* ⭐ إعادة تحميل تلقائية لما نسخة جديدة تاخد التحكم.
       من غير السطر ده المستخدم بيفضل شغال على كود قديم — والـSW
       القديم (cache-first) بيوصّلملفات القديمة. أول ما الـSW الجديد
       ياخد control بنعمل reload مرة واحدة بس عشان ياخد الكود الجديد.
       الحماية: بنسجل إننا عملنا reload بالفعل عشان ما نعملش loop. */
    let refreshing = false;
    const RELOAD_FLAG = 'yahma-reloaded-for-sw';
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      /* لو الصفحة لسه بتعمل أول تحميل — متحملش دلوقتي */
      if (Date.now() - startedAt < 4000) return;
      if (sessionStorage.getItem(RELOAD_FLAG) === window.__yahmaVersion) return;
      /* لو فيه نموذج مفتوح أو مستخدم بيكتب — نستنى */
      var busy = document.querySelector('.overlay:not(.hidden), .modal, input:focus, select:focus, textarea:focus');
      if (busy) { showUpdateBanner(); return; }
      refreshing = true;
      try { sessionStorage.setItem(RELOAD_FLAG, window.__yahmaVersion || '1'); } catch(_){yahmaErr(_,'app-version.js:167');}
      try { location.reload(); } catch(_){yahmaErr(_,'app-version.js:168');}
    });
  }

  global.YahmaAppVersion = {
    init: init,
    setBadge: setBadge,
    readVersion: readVersion,
    runningVersion: runningVersion,
    showUpdateBanner: showUpdateBanner,
    hardRefresh: hardRefresh,
    askHardRefresh: askHardRefresh,
    compareVersions: compareVersions,
    versionNumber: versionNumber,
    get current() { return CURRENT; }
  };
  global.yahmaHardRefresh = hardRefresh;
  global.yahmaAskHardRefresh = askHardRefresh;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);