/* ===== modules/finance.js — تبويب «المالية» v338 =====
   يومية مالية مستقلة:
   - رفع ملف اليومية (XLS/XLSX/CSV) يوميًا
   - تخزين البيانات في localStorage بمفتاح التاريخ
   - تقارير تفصيلية: ملخص يومي / فروع / دفع وحسابات / حركات / مستخدمون
   - تصدير Excel / PDF
*/
(function (global) {
  'use strict';

  /* ─── ثوابت ─── */
  var STORE_KEY = 'yahma-finance-journal-v1';
  var DEMO_DATE = '2026-11-03';

  /* حقول الصف بحسب الترتيب في finance-sample.js */
  var F_ID       = 0;
  var F_SEQ      = 1;
  var F_BRANCH   = 2;
  var F_DATE     = 3;
  var F_CID      = 4;
  var F_CLIENT   = 5;
  var F_PLATE    = 6;
  var F_MOVEMENT = 7;
  var F_OPTYPE   = 8;
  var F_CATEGORY = 9;
  var F_IN       = 10;
  var F_OUT      = 11;
  var F_CONTRACT = 12;
  var F_PAPER    = 13;
  var F_DESC     = 14;
  var F_PAYMETHOD= 15;
  var F_ACCOUNT  = 16;
  var F_APPROVED = 17;
  var F_AUTHNO   = 18;
  var F_USER     = 19;

  /* ─── حالة التبويب ─── */
  var state = { view: 'summary' };

  var VIEWS = [
    { id: 'summary',   label: 'الملخص اليومي'          },
    { id: 'branches',  label: 'تحليل الفروع'            },
    { id: 'payments',  label: 'طرق الدفع والحسابات'     },
    { id: 'movements', label: 'أنواع الحركات'           },
    { id: 'users',     label: 'كشف المستخدمين'         }
  ];

  /* ─── أدوات مساعدة ─── */
  function num(val) {
    var n = Number(val);
    return isFinite(n) ? n.toLocaleString('en-US') : '0';
  }
  function cur(val) {
    return num(Math.round(Number(val) || 0)) + ' ر.س';
  }
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function excelDateToISO(serial) {
    if (!serial || isNaN(serial)) return '';
    var n = Math.floor(Number(serial));
    var d = new Date((n - 25569) * 86400 * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  function groupBy(rows, keyFn) {
    var map = {};
    rows.forEach(function (r) {
      var k = keyFn(r) || 'غير محدد';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }
  function sortedKeys(map) {
    return Object.keys(map).sort();
  }
  function sumField(rows, idx) {
    return rows.reduce(function (s, r) { return s + (Number(r[idx]) || 0); }, 0);
  }
  function netOf(rows) {
    return sumField(rows, F_IN) - sumField(rows, F_OUT);
  }

  /* ─── خزن البيانات ─── */
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function getAllRows(store) {
    var all = [];
    Object.keys(store).forEach(function (d) {
      (store[d] || []).forEach(function (r) { all.push(r); });
    });
    return all;
  }

  /* تحميل البيانات التجريبية إن كان المخزن فارغًا */
  function ensureDemoData(store) {
    if (Object.keys(store).length > 0) return store;
    if (!global.yahmaFinanceSample || !global.yahmaFinanceSample.length) return store;
    store[DEMO_DATE] = global.yahmaFinanceSample;
    saveStore(store);
    return store;
  }

  /* ─── تحليل ملف Excel ─── */
  /* أسماء الأعمدة المتوقعة (28 عمود) */
  var COLS = [
    'رقم السند','تسلسل الفرع','اسم الفرع','التاريخ والوقت',
    'هوية العميل','اسم العميل','رقم اللوحة','نوع الحركة',
    'نوع العملية','العملية','قبض','صرف',
    'رقم العقد','العقد الورقي','البـيـان','طريقة الدفع',
    'من حساب','معتمد','رقم الموافقة','أضيف بواسطة',
    'تاريخ الإضافة','عُدل بواسطة','تاريخ التعديل','معلومات الجهاز',
    'اسم المورد','الرقم الضريبي','مركز التكلفة','فرع العقد'
  ];

  function parseXlsxFile(file, callback) {
    if (typeof global.ensureXlsxReady === 'function') {
      global.ensureXlsxReady(function () { doParseFile(file, callback); });
    } else {
      doParseFile(file, callback);
    }
  }

  function doParseFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = global.XLSX.read(data, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var raw = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        /* إيجاد صف الرأس */
        var headerRow = -1;
        for (var i = 0; i < Math.min(10, raw.length); i++) {
          var row = raw[i];
          if (row && (String(row[0]).indexOf('رقم السند') !== -1 || String(row[2]).indexOf('اسم الفرع') !== -1)) {
            headerRow = i;
            break;
          }
        }

        /* بناء خريطة الأعمدة */
        var colMap = {};
        if (headerRow >= 0) {
          raw[headerRow].forEach(function (h, ci) {
            var hh = String(h).trim();
            COLS.forEach(function (col, fi) {
              if (hh === col || hh.replace(/\s+/g,'') === col.replace(/\s+/g,'')) {
                colMap[fi] = ci;
              }
            });
          });
        } else {
          COLS.forEach(function (_, fi) { colMap[fi] = fi; });
        }

        var dataStart = headerRow >= 0 ? headerRow + 1 : 1;
        var rows = [];
        for (var ri = dataStart; ri < raw.length; ri++) {
          var src = raw[ri];
          if (!src || src.every(function (c) { return c === '' || c == null; })) continue;
          var mapped = [];
          for (var fi = 0; fi < 20; fi++) {
            var ci = (colMap[fi] != null) ? colMap[fi] : fi;
            mapped.push(src[ci] != null ? src[ci] : '');
          }
          rows.push(mapped);
        }

        /* تجميع حسب التاريخ */
        var byDate = {};
        rows.forEach(function (r) {
          var key = excelDateToISO(r[F_DATE]) || DEMO_DATE;
          if (!byDate[key]) byDate[key] = [];
          byDate[key].push(r);
        });

        callback(null, byDate, rows.length);
      } catch (err) {
        callback(err, null, 0);
      }
    };
    reader.onerror = function () { callback(new Error('فشل قراءة الملف'), null, 0); };
    reader.readAsArrayBuffer(file);
  }

  /* ─── بناء واجهة الرفع ─── */
  function buildUploadBar(store) {
    var dates = Object.keys(store).sort().reverse();
    var tagsHtml = dates.map(function (d) {
      return '<span class="fn-date-tag">' + esc(d)
        + ' <button type="button" class="fn-del-date" data-date="' + esc(d) + '" title="حذف">✕</button></span>';
    }).join('');

    return '<div class="fn-upload-bar">'
      + '<input type="file" id="fn-file" accept=".xlsx,.xls,.csv" style="display:none">'
      + '<button type="button" class="rp-btn fn-upload-btn" id="fn-upload-btn">📤 رفع اليومية</button>'
      + '<span id="fn-upload-status" class="fn-status"></span>'
      + '</div>'
      + (tagsHtml ? '<div class="fn-dates-row">' + tagsHtml + '</div>' : '');
  }

  /* ─── الملخص اليومي ─── */
  function buildSummary(store) {
    var dates = Object.keys(store).sort().reverse();
    if (!dates.length) {
      return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };
    }

    var allRows = getAllRows(store);
    var totalIn  = sumField(allRows, F_IN);
    var totalOut = sumField(allRows, F_OUT);
    var net      = totalIn - totalOut;

    var kpis = [
      { label: 'إجمالي القبض',   value: cur(totalIn),       cls: 'kpi-green' },
      { label: 'إجمالي الصرف',   value: cur(totalOut),      cls: 'kpi-red'   },
      { label: 'الصافي',         value: cur(net),           cls: net >= 0 ? 'kpi-blue' : 'kpi-red' },
      { label: 'عدد الحركات',    value: num(allRows.length),cls: '' },
      { label: 'عدد الأيام',     value: num(dates.length),  cls: '' },
      { label: 'آخر يوم مرفوع', value: esc(dates[0]),      cls: '' }
    ];

    var rows = dates.map(function (d) {
      var dr = store[d] || [];
      var di = sumField(dr, F_IN);
      var do_ = sumField(dr, F_OUT);
      return [d, num(dr.length), cur(di), cur(do_), cur(di - do_)];
    });

    return {
      kpis: kpis,
      sections: [{
        title: 'ملخص الأيام المرفوعة',
        headers: ['التاريخ', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي'],
        rows: rows
      }]
    };
  }

  /* ─── تحليل الفروع ─── */
  function buildBranches(store) {
    var allRows = getAllRows(store);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byBranch = groupBy(allRows, function (r) { return String(r[F_BRANCH] || '').trim() || 'غير محدد'; });
    var keys = sortedKeys(byBranch);

    var rows = keys.map(function (b) {
      var br = byBranch[b];
      var bi = sumField(br, F_IN);
      var bo = sumField(br, F_OUT);
      return [esc(b), num(br.length), cur(bi), cur(bo), cur(bi - bo)];
    });

    var totIn  = sumField(allRows, F_IN);
    var totOut = sumField(allRows, F_OUT);

    return {
      kpis: [
        { label: 'عدد الفروع',   value: num(keys.length),  cls: '' },
        { label: 'إجمالي القبض', value: cur(totIn),         cls: 'kpi-green' },
        { label: 'إجمالي الصرف', value: cur(totOut),        cls: 'kpi-red'   },
        { label: 'الصافي',       value: cur(totIn - totOut),cls: 'kpi-blue'  }
      ],
      sections: [{
        title: 'تقرير الفروع',
        headers: ['الفرع', 'عدد الحركات', 'قبض', 'صرف', 'صافي'],
        rows: rows,
        foot: ['الإجمالي', num(allRows.length), cur(totIn), cur(totOut), cur(totIn - totOut)]
      }]
    };
  }

  /* ─── طرق الدفع والحسابات ─── */
  function buildPayments(store) {
    var allRows = getAllRows(store);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byMethod  = groupBy(allRows, function (r) { return String(r[F_PAYMETHOD] || '').trim() || 'غير محدد'; });
    var byAccount = groupBy(allRows, function (r) { return String(r[F_ACCOUNT]   || '').trim() || 'غير محدد'; });

    function mkRows(map) {
      return sortedKeys(map).map(function (k) {
        var gr = map[k];
        var gi = sumField(gr, F_IN);
        var go = sumField(gr, F_OUT);
        return [esc(k), num(gr.length), cur(gi), cur(go)];
      });
    }

    var totIn = sumField(allRows, F_IN);
    var totOut= sumField(allRows, F_OUT);

    return {
      kpis: [
        { label: 'عدد طرق الدفع',  value: num(Object.keys(byMethod).length),  cls: '' },
        { label: 'عدد الحسابات',   value: num(Object.keys(byAccount).length), cls: '' },
        { label: 'إجمالي القبض',   value: cur(totIn),                         cls: 'kpi-green' },
        { label: 'إجمالي الصرف',   value: cur(totOut),                        cls: 'kpi-red'   }
      ],
      sections: [
        { title: 'طرق الدفع',  headers: ['الطريقة','عدد الحركات','قبض','صرف'], rows: mkRows(byMethod)  },
        { title: 'الحسابات',   headers: ['الحساب', 'عدد الحركات','قبض','صرف'], rows: mkRows(byAccount) }
      ]
    };
  }

  /* ─── أنواع الحركات ─── */
  function buildMovements(store) {
    var allRows = getAllRows(store);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byMovement = groupBy(allRows, function (r) { return String(r[F_MOVEMENT] || '').trim() || 'غير محدد'; });
    var byCategory = groupBy(allRows, function (r) { return String(r[F_CATEGORY] || '').trim() || 'غير محدد'; });

    function mkRows(map) {
      return sortedKeys(map).map(function (k) {
        var gr = map[k];
        var gi = sumField(gr, F_IN);
        var go = sumField(gr, F_OUT);
        return [esc(k), num(gr.length), cur(gi), cur(go), cur(gi - go)];
      });
    }

    return {
      kpis: [
        { label: 'أنواع الحركات', value: num(Object.keys(byMovement).length), cls: '' },
        { label: 'فئات العمليات', value: num(Object.keys(byCategory).length), cls: '' }
      ],
      sections: [
        { title: 'حسب نوع الحركة', headers: ['نوع الحركة','عدد','قبض','صرف','صافي'], rows: mkRows(byMovement)  },
        { title: 'حسب فئة العملية', headers: ['الفئة',     'عدد','قبض','صرف','صافي'], rows: mkRows(byCategory) }
      ]
    };
  }

  /* ─── كشف المستخدمين ─── */
  function buildUsers(store) {
    var allRows = getAllRows(store);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byUser = groupBy(allRows, function (r) { return String(r[F_USER] || '').trim() || 'غير محدد'; });

    var rows = sortedKeys(byUser).map(function (u) {
      var ur = byUser[u];
      var ui = sumField(ur, F_IN);
      var uo = sumField(ur, F_OUT);
      return [esc(u), num(ur.length), cur(ui), cur(uo), cur(ui - uo)];
    });

    rows.sort(function (a, b) {
      return (parseFloat(String(b[2]).replace(/[^0-9.]/g,'')) || 0)
           - (parseFloat(String(a[2]).replace(/[^0-9.]/g,'')) || 0);
    });

    return {
      kpis: [
        { label: 'عدد المستخدمين', value: num(Object.keys(byUser).length), cls: '' }
      ],
      sections: [{
        title: 'كشف المستخدمين',
        headers: ['المستخدم', 'عدد الحركات', 'قبض', 'صرف', 'صافي'],
        rows: rows
      }]
    };
  }

  /* ─── تصدير ─── */
  function exportData(title, headers, rows, type) {
    if (type === 'xlsx') {
      if (typeof global.YahmaExport !== 'undefined' && global.YahmaExport.exportRowsToExcel) {
        global.YahmaExport.exportRowsToExcel(rows, headers, title + '.xlsx');
        return;
      }
      if (typeof global.ensureXlsxReady === 'function') {
        global.ensureXlsxReady(function () {
          var ws = global.XLSX.utils.aoa_to_sheet([headers].concat(rows));
          var wb = global.XLSX.utils.book_new();
          global.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          global.XLSX.writeFile(wb, title + '.xlsx');
        });
      }
      return;
    }
    if (type === 'pdf') {
      if (typeof global.YahmaExport !== 'undefined' && global.YahmaExport.exportTablePdf) {
        global.YahmaExport.exportTablePdf(title, headers, rows);
        return;
      }
      var win = window.open('', '_blank');
      if (!win) return;
      var rowsHtml = rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      win.document.write('<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">'
        + '<title>' + esc(title) + '</title>'
        + '<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}'
        + 'th,td{border:1px solid #ccc;padding:4px 6px}th{background:#f2f2f2}</style>'
        + '</head><body><h3>' + esc(title) + '</h3><table>'
        + '<thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>'
        + '<tbody>' + rowsHtml + '</tbody></table></body></html>');
      win.document.close();
      win.focus();
      win.print();
    }
  }

  /* ─── الدالة الرئيسية ─── */
  function renderFinance(host) {
    if (!host) return;

    var store = ensureDemoData(loadStore());

    /* حساب بيانات العرض الحالي */
    var viewData;
    if      (state.view === 'branches')  viewData = buildBranches(store);
    else if (state.view === 'payments')  viewData = buildPayments(store);
    else if (state.view === 'movements') viewData = buildMovements(store);
    else if (state.view === 'users')     viewData = buildUsers(store);
    else                                 viewData = buildSummary(store);

    /* تبويبات */
    var tabsHtml = VIEWS.map(function (v) {
      return '<button type="button" class="rp-tab' + (v.id === state.view ? ' active' : '')
        + '" data-fn-tab="' + v.id + '">' + esc(v.label) + '</button>';
    }).join('');

    /* مؤشرات KPI */
    var kpisHtml = (viewData.kpis || []).map(function (k) {
      return '<div class="rp-kpi ' + esc(k.cls || '') + '">'
        + '<span>' + esc(k.label) + '</span><b>' + esc(k.value) + '</b>'
        + (k.hint ? '<small>' + esc(k.hint) + '</small>' : '')
        + '</div>';
    }).join('');

    /* جداول التقارير */
    var sectionsHtml = (viewData.sections || []).map(function (sec, idx) {
      var thHtml = (sec.headers || []).map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('');
      var tbHtml = (sec.rows    || []).map(function (row) {
        return '<tr>' + row.map(function (c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      var tfHtml = (sec.foot && sec.foot.length)
        ? '<tfoot><tr>' + sec.foot.map(function (c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr></tfoot>'
        : '';

      return '<div class="rp-card">'
        + '<div class="rp-card-head">'
        + '<div class="rp-card-title"><h3>' + esc(sec.title) + '</h3></div>'
        + '<div class="rp-card-actions">'
        + '<button type="button" class="rp-btn" data-fn-xlsx="' + idx + '">تصدير Excel</button>'
        + '<button type="button" class="rp-btn" data-fn-pdf="'  + idx + '">تصدير PDF</button>'
        + '</div></div>'
        + '<div class="rp-scroll"><table class="rp-table">'
        + '<thead><tr>' + thHtml + '</tr></thead>'
        + '<tbody>' + tbHtml + '</tbody>'
        + tfHtml
        + '</table></div></div>';
    }).join('');

    /* ─── HTML الكامل ─── */
    host.innerHTML =
        '<div class="fn-upload-wrap">' + buildUploadBar(store) + '</div>'
      + '<div class="rp-head">'
      + '<div class="rp-head-text"><h2>المالية — اليومية</h2>'
      + '<div class="muted-small">بيانات مستقلة من ملفات اليومية المرفوعة</div></div>'
      + '</div>'
      + '<div class="rp-tabs">' + tabsHtml + '</div>'
      + '<div class="rp-kpis">' + kpisHtml + '</div>'
      + sectionsHtml;

    /* ─── ربط الأحداث ─── */

    /* زر رفع الملف */
    var uploadBtn = host.querySelector('#fn-upload-btn');
    var fileInput = host.querySelector('#fn-file');
    var statusEl  = host.querySelector('#fn-upload-status');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        statusEl.textContent = '⏳ جاري المعالجة…';
        parseXlsxFile(file, function (err, byDate, count) {
          if (err) {
            statusEl.textContent = '❌ خطأ: ' + (err.message || 'فشل القراءة');
            return;
          }
          var freshStore = loadStore();
          Object.keys(byDate).forEach(function (d) {
            freshStore[d] = byDate[d];
          });
          saveStore(freshStore);
          statusEl.textContent = '✅ تم رفع ' + count + ' حركة بنجاح';
          setTimeout(function () { renderFinance(host); }, 800);
        });
      });
    }

    /* حذف يوم */
    host.querySelectorAll('.fn-del-date').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-date');
        if (!d) return;
        if (!confirm('حذف بيانات يوم ' + d + '؟')) return;
        var s = loadStore();
        delete s[d];
        saveStore(s);
        renderFinance(host);
      });
    });

    /* تبويبات */
    host.querySelectorAll('[data-fn-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fn-tab');
        if (id && id !== state.view) { state.view = id; renderFinance(host); }
      });
    });

    /* تصدير */
    host.querySelectorAll('[data-fn-xlsx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-fn-xlsx')) || 0;
        var sec = (viewData.sections || [])[idx];
        if (sec) exportData(sec.title, sec.headers || [], sec.rows || [], 'xlsx');
      });
    });
    host.querySelectorAll('[data-fn-pdf]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-fn-pdf')) || 0;
        var sec = (viewData.sections || [])[idx];
        if (sec) exportData(sec.title, sec.headers || [], sec.rows || [], 'pdf');
      });
    });

    /* مزود PDF للشريط العلوي */
    var primary = (viewData.sections || [])[0];
    if (primary) {
      global._yahmaCurrentPdfData = function () {
        return { title: 'المالية — ' + primary.title, headers: primary.headers || [], rows: primary.rows || [] };
      };
    }
  }

  /* ─── تسجيل عمومي ─── */
  global.YahmaFinance  = { render: renderFinance };
  global.renderFinance = renderFinance;

})(typeof window !== 'undefined' ? window : globalThis);
