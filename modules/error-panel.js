/* ===== error-panel.js — نافذة «سجل الأخطاء» =====

   التقاط الأخطاء من غير ما حد يشوفها = إنك مبلّغتش الخطأ.
   ده 202 catch كان ممكن يفضل يبلعوا failures—at the end of the day
   you open this and see exactly which one is doing it.

   الوصول للمدير النظام بس: السجل بيحتوي على أسماء ملفات وسطور
   ورسائل أخطاء، ومفيش داعي حد تاني يشوفها.

   ===== ليه التجميع اللي في error-bus مهم هنا =====

   عرض 202 خطأ واحد ورا التاني مش بيساعد حد. المتكرر بيقول
   «فيه خلل في X بيحصل 47 مرة» — وده كل اللي محتاجين نعرفه.
   فالنافذة مرتبة بالعدد، وكل سطر بيقول: كم مرة، إمتى آخر مرة،
   إيه الخطأ، وفين بالظبط. */
(function (global) {
  'use strict';

  var S = () => global.YahmaErrors;

  /* عدّاد صغير في قائمة المستخدم — يخليك تعرف إن في أخطاء من غير
     ما تفتح النافذة. نفس نمط شارة الإشعارات. */
  function badge() {
    if (!S()) return null;
    var sum = S().summary();
    var el = global.document.getElementById('yh-errors-badge');
    if (el) {
      if (!sum.signatures) { el.hidden = true; el.textContent = ''; }
      else {
        el.hidden = false;
        el.textContent = sum.total > 99 ? '99+' : String(sum.total);
        el.title = sum.signatures + ' خطأ مختلف · ' + sum.total + ' مرة إجمالاً';
      }
    }
    /* شارة زر «تقرير السريع» — متاح لكل الأدوار، فبيديه العدّاد كمان */
    var qb = global.document.getElementById('yh-quick-errors-badge');
    if (qb) {
      if (!sum.signatures) { qb.hidden = true; qb.textContent = ''; }
      else {
        qb.hidden = false;
        qb.textContent = sum.total > 99 ? '99+' : String(sum.total);
        qb.title = sum.signatures + ' خطأ مختلف · ' + sum.total + ' مرة إجمالاً';
      }
    }
    return sum;
  }

  function fmtAgo(ts) {
    var d = Date.now() - (ts || 0);
    if (d < 60000) return 'الآن';
    if (d < 3600000) return 'منذ ' + Math.floor(d / 60000) + ' دقيقة';
    if (d < 86400000) return 'منذ ' + Math.floor(d / 3600000) + ' ساعة';
    return 'منذ ' + Math.floor(d / 86400000) + ' يوم';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function levelClass(count) {
    /* أزرق لا ودي عند التكرار، أحمر عند الخطأ الواحد الطويل — العكس
       بيبعّد الناس عن الفكرة: المتكرر مش خطر، المختلف هو. */
    if (count >= 10) return 'err-panel-row-blue';
    if (count >= 3) return 'err-panel-row-amber';
    return 'err-panel-row-red';
  }

  function renderBody(host, list) {
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="err-panel-empty">'
        + '<b>لا توجد أخطاء مسجّلة</b>'
        + '<span>كل الـ catch في التطبيق بتبلّغ هنا بدل ما تبتلع الخطأ.</span></div>';
      return;
    }
    host.innerHTML = list.map(function (e) {
      var stacks = (e.stacks || []).map(function (s) {
        return '<pre class="err-panel-stack">' + esc(s.text) + '</pre>';
      }).join('');
      return '<div class="err-panel-row ' + levelClass(e.count) + '">'
        + '<div class="err-panel-top">'
        + '<span class="err-panel-count">×' + e.count + '</span>'
        + '<code class="err-panel-where">' + esc(e.label) + '</code>'
        + '<span class="err-panel-ago">' + fmtAgo(e.last) + '</span>'
        + '</div>'
        + '<div class="err-panel-msg">' + esc(e.message) + '</div>'
        + stacks
        + (e.restored ? '<div class="err-panel-note">محفوظ من جلسة سابقة</div>' : '')
        + '</div>';
    }).join('');
  }

  function open() {
    var bus = S();
    if (!bus) { try { global.alert('سجل الأخطاء غير محمّل.'); } catch (_) {} return; }
    var sum = bus.summary();
    var list = bus.recent(120);

    var overlay = global.document.createElement('div');
    overlay.className = 'overlay err-panel-overlay';
    overlay.innerHTML =
      '<div class="modal err-panel-modal">'
      + '<div class="err-panel-head">'
      + '<div>'
      + '<h2>سجل الأخطاء</h2>'
      + '<p>' + sum.signatures + ' خطأ مختلف · ' + sum.total + ' مرة إجمالاً · '
      + sum.lastHourTotal + ' في آخر ساعة</p>'
      + '</div>'
      + '<button type="button" class="btn btn-ghost btn-small" id="yh-err-close">إغلاق</button>'
      + '</div>'
      + '<div class="err-panel-legend">'
      + '<span class="err-panel-chip err-panel-chip-red">أحمر = خطأ مختلف مرة واحدة</span>'
      + '<span class="err-panel-chip err-panel-chip-amber">كهرماني = بيتكرر</span>'
      + '<span class="err-panel-chip err-panel-chip-blue">أزرق = متكرر كتير (غالباً مشكلق مش حقيقي)</span>'
      + '</div>'
      + '<div class="err-panel-list" id="yh-err-list"></div>'
      + '<div class="modal-actions">'
      + '<span class="muted-small">مرتّبة حسب التكرار — العادي فوق، والمخيف تحت</span>'
      + '<div class="modal-actions-right">'
      + '<button type="button" class="btn btn-ghost" id="yh-err-copy">نسخ التقرير</button>'
      + '<button type="button" class="btn btn-danger" id="yh-err-clear">مسح السجل</button>'
      + '</div></div>'
      + '</div>';

    global.document.body.appendChild(overlay);

    var listEl = overlay.querySelector('#yh-err-list');
    renderBody(listEl, list);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      global.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    overlay.querySelector('#yh-err-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    global.addEventListener('keydown', onKey);

    overlay.querySelector('#yh-err-clear').addEventListener('click', function () {
      if (!global.confirm('مسح كل الأخطاء المسجّلة؟\nمش هتأثر على أي بيانات.')) return;
      bus.clear();
      renderBody(listEl, []);
      badge();
    });

    overlay.querySelector('#yh-err-copy').addEventListener('click', function () {
      var text = ['# سجل أخطاء يهماء', new Date().toISOString(), ''];
      list.forEach(function (e) {
        text.push('×' + e.count + '  ' + e.label + '  (' + fmtAgo(e.last) + ')');
        text.push('   ' + e.message);
        (e.stacks || []).forEach(function (s) { text.push('   ' + s.text.split('\n').join('\n   ')); });
        text.push('');
      });
      var blob = new Blob([text.join('\n')], { type: 'text/plain;charset=utf-8' });
      var a = global.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yahma-errors-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  /* بتتصلّص مرة واحدة عند الإقلاع وبتتحدّث مع كل خطأ جديد */
  function install() {
    var bus = S();
    if (!bus) return;
    bus.on(function () { badge(); });
    global.setInterval(function () { badge(); syncVisibility(); }, 2500);
    badge();
    syncVisibility();
  }

  /* ===== تقرير سريع — متاح لكل الأدوار =====
     زر «سجل الأخطاء» مخفي لغير الأدمن (فيه أسماء ملفات وسطور). بس
     لما حاجة غلط، المستخدم لازم يعرف من غير ما يبقى عنده
     صلاحيات إدارية. فبنضيف «تقرير سريع» بيعرض آخر 10 أخطاء
     (الرسالة والمكان) من غير الـstacks الكاملة. */
  function quickReport() {
    var bus = S();
    if (!bus) { try { global.alert('سجل الأخطاء غير محمّل.'); } catch (_) {} return; }
    var list = bus.recent(10);
    var overlay = global.document.createElement('div');
    overlay.className = 'overlay err-panel-overlay';
    overlay.innerHTML =
      '<div class="modal err-panel-modal">'
      + '<div class="err-panel-head">'
      + '<div>'
      + '<h2>تقرير سريع</h2>'
      + '<p>آخر ' + list.length + ' خطأ — لو فيه خطأ متكرر، افتح «سجل الأخطاء» من نفس القائمة (للمدير النظام)</p>'
      + '</div>'
      + '<button type="button" class="btn btn-ghost btn-small" id="yh-qr-close">إغلاق</button>'
      + '</div>'
      + '<div class="err-panel-list" id="yh-qr-list"></div>'
      + '<div class="modal-actions">'
      + '<div class="modal-actions-right">'
      + '<button type="button" class="btn btn-ghost" id="yh-qr-copy">نسخ التقرير</button>'
      + '<button type="button" class="btn btn-danger" id="yh-qr-clear">مسح السجل</button>'
      + '</div></div>'
      + '</div>';
    global.document.body.appendChild(overlay);

    var listEl = overlay.querySelector('#yh-qr-list');
    if (!list.length) {
      listEl.innerHTML = '<div class="err-panel-empty">'
        + '<b>لا توجد أخطاء مسجّلة</b>'
        + '<span>كل الـ catch في التطبيق بتبلّغ هنا بدل ما تبتلع الخطأ.</span></div>';
    } else {
      listEl.innerHTML = list.map(function (e) {
        return '<div class="err-panel-row ' + levelClass(e.count) + '">'
          + '<div class="err-panel-top">'
          + '<span class="err-panel-count">×' + e.count + '</span>'
          + '<code class="err-panel-where">' + esc(e.label) + '</code>'
          + '<span class="err-panel-ago">' + fmtAgo(e.last) + '</span>'
          + '</div>'
          + '<div class="err-panel-msg">' + esc(e.message) + '</div>'
          + '</div>';
      }).join('');
    }

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      global.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    overlay.querySelector('#yh-qr-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    global.addEventListener('keydown', onKey);

    overlay.querySelector('#yh-qr-clear').addEventListener('click', function () {
      if (!global.confirm('مسح كل الأخطاء المسجّلة؟\nمش هتأثر على أي بيانات.')) return;
      bus.clear();
      close();
      badge();
    });

    overlay.querySelector('#yh-qr-copy').addEventListener('click', function () {
      var text = ['# تقرير أخطاء يهماء', new Date().toISOString(), ''];
      list.forEach(function (e) {
        text.push('×' + e.count + '  ' + e.label + '  (' + fmtAgo(e.last) + ')');
        text.push('   ' + e.message);
        text.push('');
      });
      var blob = new Blob([text.join('\n')], { type: 'text/plain;charset=utf-8' });
      var a = global.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yahma-errors-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  /* العنصر للمدير النظام بس. بيتحدّث فوراً لما الدور يتغيّر
     (showAppScreen) وكمان كل 2.5 ثانية، عشان ما يبقاش ظاهر
     لحساب «مشاهدة» حتى لثواني. */
  function syncVisibility() {
    var item = global.document && global.document.getElementById('umt-errors');
    if (!item) return;
    var perms = global.YahmaPerms;
    var isAdmin = (typeof perms !== 'object' || typeof perms.canAdminister !== 'function')
      ? true
      : !!perms.canAdminister();
    item.hidden = !isAdmin;
    if (!isAdmin) { var b = global.document.getElementById('yh-errors-badge'); if (b) b.hidden = true; }
    else badge();
  }

  global.YahmaErrorPanel = { open: open, quickReport: quickReport, badge: badge, syncVisibility: syncVisibility, install: install };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);