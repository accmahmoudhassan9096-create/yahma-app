/* ===== يهماء: حارس الإقلاع + التنقّل بين التبويبات =====
   1) نسجّل أول أخطاء الإقلاع ونعرضها داخل القائمة، بدل ما نخسرها في الـ console
      (الـ console على الموبايل غالبًا مش متاح للمستخدم).
   2) نربط التبويبات بـ event delegation على document — فبتشتغل حتى لو
      المعالج لكل تبويب (في pdf-share.js) متربطش لأي سبب.
   3) لو بعد الضغط القسم ما اتغيّرش، نفرضه ونقول للمستخدم إن فيه خلل. */
(function (global) {
  'use strict';

  /* ---------- 1) تسجيل الأخطاء ---------- */
  var errors = [];
  global.__yahmaErrors = errors;

  function push(kind, message, extra) {
    if (errors.length >= 12) return;
    errors.push({
      kind: kind,
      message: String(message || '').slice(0, 220),
      extra: extra ? String(extra).slice(0, 160) : '',
      time: new Date().toISOString()
    });
    try { renderErrorHint(); } catch (_) {}
  }

  global.addEventListener('error', function (e) {
    push('error', e.message, (e.filename || '') + ':' + (e.lineno || ''));
  });
  global.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    push('promise', (r && (r.message || r)) || 'رفض غير معالج');
  });

  /* أخطاء تحميل السكربتات (404/شبكة) — دي اللي بتوقف التطبيق بصمت */
  var failedScripts = [];
  global.__yahmaFailedScripts = failedScripts;

  function renderErrorHint() {
    var host = document.getElementById('yahma-error-hint');
    if (!host) {
      var sb = document.querySelector('.sidebar');
      if (!sb) return;
      host = document.createElement('div');
      host.id = 'yahma-error-hint';
      host.className = 'yahma-error-hint';
      var badge = document.getElementById('yahma-version-badge');
      if (badge && badge.parentNode) badge.parentNode.insertBefore(host, badge.nextSibling);
      else sb.appendChild(host);
    }
    var list = errors.slice(-3).map(function (e) {
      return '<span>• ' + e.message + '</span>';
    });
    var scripts = failedScripts.length
      ? '<span>• ملفات لم تُحمّل: ' + failedScripts.slice(0, 4).join('، ') + '</span>' : '';
    host.innerHTML = '<b>تحذير: أخطاء أثناء التشغيل (' + errors.length + ')</b>' + list.join('') + scripts;
  }

  /* أخطاء تحميل السكربتات (404/شبكة) — دي اللي بتوقف التطبيق بصمت */
  document.addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t === global || !t.tagName) return;
    var name = String(t.src || t.href || t.tagName);
    if (failedScripts.indexOf(name) < 0) failedScripts.push(name);
    push('load', 'تعذّر تحميل ملف: ' + name);
  }, true);

  /* ---------- 2) التنقّل بالتفويض ---------- */
  var switching = false;

  function closeMobileSidebar() {
    var sb = document.querySelector('.sidebar');
    if (!sb) return;
    if (global.innerWidth > 700) return;
    sb.classList.remove('open');
    sb.style.zIndex = '';
    var bd = document.querySelector('.sidebar-backdrop');
    if (bd) bd.classList.remove('show');
  }

  function goTab(tab) {
    if (!tab || switching) return;
    switching = true;
    try {
      if (typeof global.canAccessYahmaTab === 'function' && !global.canAccessYahmaTab(tab)) {
        try { global.alert('هذا القسم غير متاح لحسابك. كلّم المدير لتفعيله.'); } catch (_) {}
        return;
      }
      document.querySelectorAll('.nav-item').forEach(function (i) {
        i.classList.toggle('active', i.dataset.tab === tab);
      });
      /* نغيّر التبويب من داخل نطاق window جوا المتصفح */
      try { global.currentTab = tab; } catch (_) {}
      if (typeof global.render === 'function') global.render();
      else if (typeof global.yahmaRender === 'function') global.yahmaRender();
    } catch (e) {
      push('tab', 'تعذر فتح القسم: ' + (e && e.message), e && e.stack);
      try { global.alert('تعذر فتح القسم: ' + (e && e.message ? e.message : 'خطأ غير متوقع')); } catch (_) {}
    } finally {
      closeMobileSidebar();
      setTimeout(function () { switching = false; }, 250);
      /* تأكيد: لو التبويب ما اتغيّرش نعيد المحاولة مرة واحدة */
      setTimeout(function () {
        try {
          if (typeof global.currentTab !== 'undefined' && global.currentTab !== tab) {
            global.currentTab = tab;
            if (typeof global.render === 'function') global.render();
          }
        } catch (_) {}
      }, 300);
    }
  }
  global.yahmaGoTab = goTab;

  function onTap(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var item = target.closest('.nav-item[data-tab]');
    if (!item) return;
    var tab = item.dataset.tab;
    if (!tab) return;
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    /* نجاوب بسرعة: بعد 400ms لوحنا لسه في نفس التبويب، ننفّذ مباشرة.
       لو المعالج الأصلي شغال، ما هيحصلش تعارض حقيقي. */
    try { e.stopPropagation(); } catch (_) {}
    try { e.preventDefault(); } catch (_) {}
    var already = false;
    try { already = (typeof global.currentTab !== 'undefined' && global.currentTab === tab); } catch (_) {}
    goTab(tab);
  }

  /* نلتقط حتى لو المستمع الأصلي أُوقف بـ stopPropagation */
  document.addEventListener('click', onTap, true);
  document.addEventListener('touchend', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('.nav-item[data-tab]')) onTap(e);
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('.nav-item[data-tab]')) onTap(e);
  }, true);

  global.addEventListener('load', function () {
    try { if (errors.length || failedScripts.length) renderErrorHint(); } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);