/* ===== export-bar.js — زراير تصدير Excel + PDF في كل تبويب =====
   بدل ما كل تبويب يعمل أزراره بنفسه، ده يحقن شريط واحد ثابت
   فوق محتوى أي تبويب فيه جدول.

   الشريط بيقرأ window._yahmaCurrentPdfData() — وهي دالة موجودة في
   كل التبويبات فيها جدول وبترجّع {title, subtitle, headers, rows}.
   فلو تبويب معرّفهاش، الشريط بيختفي بدل ما يظهر زرار مكسور.

   العربي: Excel بيفتح RTL، وPDF بيتبنى من رسم المتصفح للمحتوى
   (html2canvas) فالتشكيل والـRTL بيطلعوا زي ما هما. */
(function (global) {
  'use strict';

  /* مفيش استثناءات — الرئيسية كمان ليها تصدير (ملخص تنفيذي). */
  var SKIP_TABS = {};
  var ID = 'yahma-export-bar';

  function tab() {
    try {
      if (typeof global.yahmaGetTab === 'function') return global.yahmaGetTab();
    } catch (_) {}
    return '';
  }

  function clean(v) {
    return String(v == null ? '' : v)
      .replace(/\s+/g, ' ')
      .trim() || '—';
  }

  /* مصدر البيانات واحد مع YahmaExport.currentTabData() — مش نسخة تانية.
     لو الشرط اتكرر هنا كان ممكن الزرار يتفعّل والضغط يطلع «غير مدعوم». */
  function data() {
    try {
      if (global.YahmaExport && typeof global.YahmaExport.currentTabData === 'function') {
        return global.YahmaExport.currentTabData();
      }
    } catch (_) {}
    try {
      if (typeof global._yahmaCurrentPdfData === 'function') {
        var d = global._yahmaCurrentPdfData();
        if (d && Array.isArray(d.headers) && Array.isArray(d.rows)) return d;
      }
    } catch (_) {}
    return null;
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-busy');
      btn.innerHTML = '<span class="yx-spin"></span>' + label;
    } else {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  function build() {
    if (document.getElementById(ID)) return;
    var bar = document.createElement('div');
    bar.id = ID;
    bar.className = 'yx-bar';
    bar.innerHTML =
      '<div class="yx-info">'
      + '<span class="yx-title" id="yx-title"></span>'
      + '<span class="yx-count" id="yx-count"></span>'
      + '</div>'
      + '<div class="yx-actions">'
      + '<button type="button" class="yx-btn yx-xlsx" id="yx-excel" title="تصدير Excel (عربي RTL)">'
      + '<span class="yx-ico">📊</span><span class="yx-txt">Excel</span>'
      + '<span class="yx-shine" aria-hidden="true"></span>'
      + '</button>'
      + '<button type="button" class="yx-btn yx-pdf" id="yx-pdf" title="تصدير PDF (عربي)">'
      + '<span class="yx-ico">📄</span><span class="yx-txt">PDF</span>'
      + '<span class="yx-shine" aria-hidden="true"></span>'
      + '</button>'
      + '</div>';
    document.body.appendChild(bar);

    bar.querySelector('#yx-excel').addEventListener('click', async function () {
      var btn = this;
      setBusy(btn, true, 'جارِ التصدير...');
      try { await global.YahmaExport.exportTabExcel(); } catch (e) { console.error(e); }
      setBusy(btn, false);
    });

    bar.querySelector('#yx-pdf').addEventListener('click', async function () {
      var btn = this;
      setBusy(btn, true, 'جارِ التصدير...');
      try { await global.YahmaExport.exportTabPdf({ buttonId: 'yx-pdf' }); } catch (e) { console.error(e); }
      setBusy(btn, false);
    });
  }

  /* الشريط بيتحط جنب أول زرار «رفع/تصدير» في الشاشة — عشان يبقى
     في نفس الصف اللي المستخدم متعوّد عليه بدل ما يبقى لوحده فوق.
     لو مفيش زرار مناسب، بيرجع لأول المحتوى. */
  var ANCHOR_RE = /(upload|import|export|template)/i;
  function findAnchor() {
    var content = document.getElementById('content');
    if (!content) return null;
    var buttons = content.querySelectorAll('button[id]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.closest('#' + ID)) continue;
      if (!ANCHOR_RE.test(b.id || '')) continue;
      if (b.offsetParent === null) continue;                 /* مخفي */
      var p = b.parentNode;
      if (!p || p === content) continue;
      /* لازم الأب يكون صف مرن (flex) — لو grid أو block، الشريط
         هيتلخبط جوّههار ويفصل التصميم. */
      try {
        if (getComputedStyle(p).display.indexOf('flex') < 0) continue;
      } catch (_) { continue; }
      return b;
    }
    return null;
  }

  function place(bar) {
    var content = document.getElementById('content');
    if (!content) return;
    var anchor = findAnchor();
    if (anchor && anchor.parentNode && anchor.parentNode !== bar.parentNode) {
      if (bar.parentNode !== anchor.parentNode || bar.previousElementSibling !== anchor) {
        anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      }
      bar.classList.add('is-inline');
      return;
    }
    if (bar.parentNode !== content) content.insertBefore(bar, content.firstChild);
    bar.classList.remove('is-inline');
  }

  /* بتتنادى في نهاية كل render.
     القاعدة: الشريط ظاهر في كل التبويبات بلا استثناء، حتى لو الجدول
     فاضي — الزراير بتتظبط معطّلة وقتها. */
  function sync() {
    var t = tab();
    if (!t) return;
    var bar = document.getElementById(ID);
    /* التبويبات بتعمل content.innerHTML = ... فبتنسخ الشريط —
       لازم نرجّعوه في مكانه كل مرة. */
    if (!bar) { build(); bar = document.getElementById(ID); }
    if (!bar) return;
    place(bar);

    var d = data();
    bar.hidden = false;
    var title = document.getElementById('yx-title');
    var count = document.getElementById('yx-count');
    var fallback = (document.getElementById('topbar-title') || {}).textContent || '';
    if (title) title.textContent = (d && d.title) || clean(fallback) || 'تصدير';
    if (count) count.textContent = d && d.rows.length ? (d.rows.length + ' سجل') : '';
    var off = !(d && d.rows.length);
    bar.querySelectorAll('.yx-btn').forEach(function (b) { b.disabled = off; });
  }

  global.YahmaExportBar = { sync: sync, build: build };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})(typeof window !== 'undefined' ? window : globalThis);