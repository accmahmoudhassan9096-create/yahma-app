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

  var SKIP_TABS = { dashboard: 1 };
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

  /* fallback: اقرأ الجدول المعروض على الصفحة نفسها.
     ده يضمن إن التصدير شغال في أي تبويب حتى لو مش معرّف
     _yahmaCurrentPdfData — بيصدّر بالظبط اللي المستخدم شايفه. */
  function dataFromTable() {
    var root = document.getElementById('content');
    if (!root) return null;
    var table = root.querySelector('table');
    if (!table) return null;
    var ths = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    if (!ths.length) return null;
    var headers = ths.map(function (th) { return clean(th.textContent); });
    /* شريط اختيار الكروت مالهاش عنوان — نشيله */
    var pickIdx = headers.findIndex(function (h) { return h === ''; });
    if (pickIdx >= 0) {
      headers.splice(pickIdx, 1);
    }
    var trs = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    var rows = [];
    trs.forEach(function (tr) {
      var tds = Array.prototype.slice.call(tr.children);
      if (tds.length <= 1 && clean(tr.textContent).indexOf('لا توجد') === 0) return;
      if (tds.length < 2) return;
      var cells = tds.map(function (td) { return clean(td.textContent); });
      if (pickIdx >= 0 && cells.length > pickIdx) cells.splice(pickIdx, 1);
      if (cells.length) rows.push(cells);
    });
    var title = (document.getElementById('topbar-title') || {}).textContent || 'تقرير';
    return {
      title: clean(title),
      subtitle: rows.length ? ('عدد السجلات: ' + rows.length) : '',
      headers: headers,
      rows: rows
    };
  }

  function data() {
    try {
      if (typeof global._yahmaCurrentPdfData === 'function') {
        var d = global._yahmaCurrentPdfData();
        if (d && Array.isArray(d.headers) && Array.isArray(d.rows)) return d;
      }
    } catch (_) {}
    try { return dataFromTable(); } catch (_) {}
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

  /* بتتنادى في نهاية كل render.
     القاعدة: الشريط ظاهر في كل تبويب غير الرئيسية، حتى لو الجدول
     فاضي — الزراير بتتظبط معطّلة وقتها. إخفاءه كان بيخلي بعض
     التبويبات تظهر زرار وبعضها لأ. */
  function sync() {
    var t = tab();
    if (!t) return;
    var bar = document.getElementById(ID);
    if (!bar) { build(); bar = document.getElementById(ID); }
    if (!bar) return;
    if (SKIP_TABS[t]) { bar.hidden = true; return; }

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