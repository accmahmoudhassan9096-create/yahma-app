/* ===== modules/finance.js — تبويب «المالية» v339 =====
   يومية مالية متكاملة ومربوطة بأسطول المنصة وقاعدة بيانات Supabase:
   - رفع وتخزين ملفات اليومية (محلياً وسحابياً على Supabase)
   - ربط إيرادات الحركات مع أسطول سيارات المنصة وتحديث حالتها تلقائياً
   - فلترة حسب فروع المنصة وصلاحيات المستخدم
   - تقارير تفصيلية: ملخص يومي / أسطول المنصة / فروع / دفع وحسابات / حركات / محصلين
   - تصدير كامل إلى Excel و PDF
*/
(function (global) {
  'use strict';

  /* ─── ثوابت ─── */
  var STORE_KEY = 'yahma-finance-journal-v1';
  var DEMO_DATE = '2026-11-03';
  var CLOUD_TABLE = 'finance_daily_journal';

  /* حقول الصف بحسب الترتيب القياسي */
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
  var state = {
    view: 'summary',
    branch: '',
    cloudStatus: 'checking', // 'online' | 'offline' | 'checking'
    cloudCount: 0
  };

  var VIEWS = [
    { id: 'summary',       label: 'الملخص اليومي'            },
    { id: 'fleet_revenue', label: 'إيرادات أسطول المنصة'     },
    { id: 'branches',      label: 'تحليل الفروع'              },
    { id: 'payments',      label: 'طرق الدفع والحسابات'       },
    { id: 'movements',     label: 'أنواع الحركات والعقود'     },
    { id: 'users',         label: 'كشف المستخدمين والمحصلين' }
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
  function normPlate(p) {
    return String(p || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase();
  }
  function excelDateToISO(serial) {
    if (!serial) return '';
    if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serial)) {
      return serial.slice(0, 10);
    }
    var n = Math.floor(Number(serial));
    if (isNaN(n) || n < 1000) return '';
    var d = new Date((n - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
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

  /* ─── الربط مع أسطول المنصة ─── */
  function getFleet() {
    if (typeof global.yahmaGetFleet === 'function') {
      try { var f = global.yahmaGetFleet(); if (Array.isArray(f) && f.length) return f; } catch (_) {}
    }
    if (typeof fleet !== 'undefined' && Array.isArray(fleet) && fleet.length) return fleet;
    if (global.fleet && Array.isArray(global.fleet) && global.fleet.length) return global.fleet;
    if (global.YahmaAppContext && typeof global.YahmaAppContext.getFleet === 'function') {
      try { var af = global.YahmaAppContext.getFleet(); if (Array.isArray(af) && af.length) return af; } catch (_) {}
    }
    return [];
  }

  function getPlatformBranches() {
    var list = [];
    try {
      if (typeof global.loadBranches === 'function') {
        var b = global.loadBranches();
        if (Array.isArray(b) && b.length) list = b.map(function (x) { return x.name || x; });
      }
    } catch (_) {}
    if (!list.length) {
      var fl = getFleet();
      var bSet = {};
      fl.forEach(function (c) {
        var bn = String((c && c.branch) || '').trim();
        if (bn) bSet[bn] = true;
      });
      list = Object.keys(bSet);
    }
    return list.sort();
  }

  /* ─── خزن ومزامنة البيانات ─── */
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function getAllRows(store, branchFilter) {
    var all = [];
    Object.keys(store).forEach(function (d) {
      (store[d] || []).forEach(function (r) {
        if (!branchFilter || String(r[F_BRANCH] || '').trim() === branchFilter) {
          all.push(r);
        }
      });
    });
    return all;
  }

  function ensureDemoData(store) {
    if (Object.keys(store).length > 0) return store;
    if (!global.yahmaFinanceSample || !global.yahmaFinanceSample.length) return store;
    store[DEMO_DATE] = global.yahmaFinanceSample;
    saveStore(store);
    return store;
  }

  /* ─── المزامنة السحابية مع Supabase ─── */
  var syncInFlight = false;

  function syncWithCloud(onComplete) {
    if (!global.supabaseClient || !global.supabaseReady) {
      state.cloudStatus = 'offline';
      if (typeof onComplete === 'function') onComplete(false);
      return;
    }
    if (syncInFlight) return;
    syncInFlight = true;

    global.supabaseClient
      .from(CLOUD_TABLE)
      .select('*')
      .order('entry_date', { ascending: false })
      .limit(3000)
      .then(function (res) {
        syncInFlight = false;
        if (res.error) {
          /* الجدول غير منشأ بعد أو خطأ في الصلاحيات */
          state.cloudStatus = 'offline';
          if (typeof onComplete === 'function') onComplete(false);
          return;
        }

        var cloudRows = res.data || [];
        state.cloudStatus = 'online';
        state.cloudCount = cloudRows.length;

        if (cloudRows.length > 0) {
          var store = loadStore();
          cloudRows.forEach(function (row) {
            var d = row.entry_date;
            if (!d) return;
            if (!store[d]) store[d] = [];

            /* تحويل صف سوبابيس للصيغة الداخلية */
            var mapped = [
              row.entry_id || '',
              row.branch_seq || '',
              row.branch_name || '',
              row.entry_date || '',
              row.client_id || '',
              row.client_name || '',
              row.plate || '',
              row.movement_type || '',
              row.op_type || '',
              row.category || '',
              Number(row.amount_in) || 0,
              Number(row.amount_out) || 0,
              row.contract_no || '',
              row.paper_contract || '',
              row.description || '',
              row.pay_method || '',
              row.account_name || '',
              row.is_approved ? 1 : 0,
              row.auth_no || '',
              row.created_by_user || ''
            ];

            /* منع تكرار نفس السجل */
            var exists = store[d].some(function (er) {
              return String(er[F_ID]) === String(mapped[F_ID]) && String(er[F_SEQ]) === String(mapped[F_SEQ]);
            });
            if (!exists) store[d].push(mapped);
          });
          saveStore(store);
        }

        if (typeof onComplete === 'function') onComplete(true);
      })
      .catch(function () {
        syncInFlight = false;
        state.cloudStatus = 'offline';
        if (typeof onComplete === 'function') onComplete(false);
      });
  }

  function saveDayToCloud(dateKey, rows, callback) {
    if (!global.supabaseClient || !global.supabaseReady) {
      if (typeof callback === 'function') callback(null, false);
      return;
    }

    var payload = rows.map(function (r) {
      return {
        entry_id: String(r[F_ID] || ''),
        branch_seq: String(r[F_SEQ] || ''),
        branch_name: String(r[F_BRANCH] || ''),
        entry_date: dateKey,
        entry_datetime: String(r[F_DATE] || ''),
        client_id: String(r[F_CID] || ''),
        client_name: String(r[F_CLIENT] || ''),
        plate: String(r[F_PLATE] || ''),
        movement_type: String(r[F_MOVEMENT] || ''),
        op_type: String(r[F_OPTYPE] || ''),
        category: String(r[F_CATEGORY] || ''),
        amount_in: Number(r[F_IN]) || 0,
        amount_out: Number(r[F_OUT]) || 0,
        contract_no: String(r[F_CONTRACT] || ''),
        paper_contract: String(r[F_PAPER] || ''),
        description: String(r[F_DESC] || ''),
        pay_method: String(r[F_PAYMETHOD] || ''),
        account_name: String(r[F_ACCOUNT] || ''),
        is_approved: !!r[F_APPROVED],
        auth_no: String(r[F_AUTHNO] || ''),
        created_by_user: String(r[F_USER] || '')
      };
    });

    /* إرسال على دفعات لتجنب حدود حجم الطلب */
    var BATCH_SIZE = 100;
    var chunks = [];
    for (var i = 0; i < payload.length; i += BATCH_SIZE) {
      chunks.push(payload.slice(i, i + BATCH_SIZE));
    }

    var chunkIdx = 0;
    function sendNext() {
      if (chunkIdx >= chunks.length) {
        state.cloudStatus = 'online';
        if (typeof callback === 'function') callback(null, true);
        return;
      }
      global.supabaseClient
        .from(CLOUD_TABLE)
        .insert(chunks[chunkIdx])
        .then(function (res) {
          if (res.error) {
            console.warn('[FinanceCloud] insert error:', res.error);
            if (typeof callback === 'function') callback(res.error, false);
          } else {
            chunkIdx++;
            sendNext();
          }
        })
        .catch(function (err) {
          console.warn('[FinanceCloud] network error:', err);
          if (typeof callback === 'function') callback(err, false);
        });
    }
    sendNext();
  }

  function deleteDayFromCloud(dateKey) {
    if (global.supabaseClient && global.supabaseReady) {
      global.supabaseClient
        .from(CLOUD_TABLE)
        .delete()
        .eq('entry_date', dateKey)
        .then(function () {})
        .catch(function () {});
    }
  }

  /* ─── تحليل ملف Excel لليومية ─── */
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

        var headerRow = -1;
        for (var i = 0; i < Math.min(10, raw.length); i++) {
          var row = raw[i];
          if (row && (String(row[0]).indexOf('رقم السند') !== -1 || String(row[2]).indexOf('اسم الفرع') !== -1)) {
            headerRow = i;
            break;
          }
        }

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

  /* ─── تحديث أسطول المنصة بناءً على اليومية ─── */
  function syncFleetFromJournal(journalRows, onDone) {
    var fleetList = getFleet();
    if (!fleetList || !fleetList.length) {
      if (typeof onDone === 'function') onDone(0, 'لا توجد سيارات في أسطول المنصة');
      return;
    }

    var byPlate = {};
    fleetList.forEach(function (car) {
      var k = normPlate(car.plate);
      if (k) byPlate[k] = car;
    });

    var updatedCars = [];
    journalRows.forEach(function (r) {
      var p = normPlate(r[F_PLATE]);
      var mov = String(r[F_MOVEMENT] || '').trim();
      var car = byPlate[p];
      if (car) {
        /* إذا كانت الحركة تمديد أو مقدم عقد والسيارة ليست مؤجرة */
        if ((mov === 'تمديد عقد' || mov === 'مقدم عقد' || mov === 'عقد جديد') && car.carStatus !== 'مؤجرة') {
          car.carStatus = 'مؤجرة';
          if (!updatedCars.includes(car)) updatedCars.push(car);
        }
      }
    });

    if (updatedCars.length > 0) {
      if (typeof global.saveData === 'function') {
        try {
          var ctx = global.YahmaAppContext || { getFleet: function () { return fleetList; } };
          global.saveData(updatedCars.map(function (c) { return c.id; }), ctx);
        } catch (_) {}
      }
      if (typeof onDone === 'function') {
        onDone(updatedCars.length, 'تم تحديث حالة ' + updatedCars.length + ' سيارة إلى «مؤجرة» وحفظها بالمنصة والسحابة');
      }
    } else {
      if (typeof onDone === 'function') {
        onDone(0, 'جميع سيارات الأسطول متوافقة ومحدثة بالفعل مع عقود اليومية');
      }
    }
  }

  /* ─── بناء التقارير ─── */

  /* 1. الملخص اليومي */
  function buildSummary(store, branchFilter) {
    var dates = Object.keys(store).sort().reverse();
    var allRows = getAllRows(store, branchFilter);

    var totalIn  = sumField(allRows, F_IN);
    var totalOut = sumField(allRows, F_OUT);
    var net      = totalIn - totalOut;

    var kpis = [
      { label: 'إجمالي المقبوضات', value: cur(totalIn),       cls: 'kpi-green' },
      { label: 'إجمالي المصروفات', value: cur(totalOut),      cls: 'kpi-red'   },
      { label: 'صافي الدخل',       value: cur(net),           cls: net >= 0 ? 'kpi-blue' : 'kpi-red' },
      { label: 'عدد الحركات',      value: num(allRows.length),cls: '' },
      { label: 'الأيام المسجلة',   value: num(dates.length),  cls: '' },
      { label: 'آخر يوم مرفوع',   value: esc(dates[0] || '—'),cls: '' }
    ];

    var rows = dates.map(function (d) {
      var dr = (store[d] || []).filter(function (r) {
        return !branchFilter || String(r[F_BRANCH] || '').trim() === branchFilter;
      });
      var di = sumField(dr, F_IN);
      var do_ = sumField(dr, F_OUT);
      return [d, num(dr.length), cur(di), cur(do_), cur(di - do_)];
    });

    return {
      kpis: kpis,
      sections: [{
        title: 'سجل اليوميات المرفوعة' + (branchFilter ? ' (' + branchFilter + ')' : ''),
        headers: ['التاريخ', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي'],
        rows: rows,
        foot: ['الإجمالي العام', num(allRows.length), cur(totalIn), cur(totalOut), cur(net)]
      }]
    };
  }

  /* 2. إيرادات أسطول المنصة (ربط مباشر بالسيارات) */
  function buildFleetRevenue(store, branchFilter) {
    var cars = getFleet();
    var allRows = getAllRows(store, branchFilter);

    /* تجميع الحركات حسب اللوحة المعيارية */
    var txByPlate = {};
    allRows.forEach(function (r) {
      var p = normPlate(r[F_PLATE]);
      if (!p) return;
      if (!txByPlate[p]) txByPlate[p] = { rows: [], in: 0, out: 0, lastContract: '', lastMove: '' };
      txByPlate[p].rows.push(r);
      txByPlate[p].in  += Number(r[F_IN]) || 0;
      txByPlate[p].out += Number(r[F_OUT]) || 0;
      if (r[F_CONTRACT]) txByPlate[p].lastContract = r[F_CONTRACT];
      if (r[F_MOVEMENT]) txByPlate[p].lastMove = r[F_MOVEMENT];
    });

    /* دمج مع أسطول المنصة */
    var filteredCars = cars.filter(function (c) {
      return !branchFilter || String(c.branch || '').trim() === branchFilter;
    });

    var rows = filteredCars.map(function (car) {
      var pKey = normPlate(car.plate);
      var tx = txByPlate[pKey] || { rows: [], in: 0, out: 0, lastContract: '—', lastMove: '—' };
      var net = tx.in - tx.out;
      return [
        car.plate || '—',
        (car.brand || '') + ' ' + (car.model || ''),
        car.branch || 'غير محدد',
        car.carStatus || 'غير محدد',
        num(tx.rows.length),
        cur(tx.in),
        cur(tx.out),
        cur(net),
        tx.lastContract || '—',
        tx.lastMove || '—'
      ];
    });

    /* فرز حسب الأعلى إيراداً */
    rows.sort(function (a, b) {
      return (parseFloat(String(b[5]).replace(/[^0-9.]/g,'')) || 0)
           - (parseFloat(String(a[5]).replace(/[^0-9.]/g,'')) || 0);
    });

    var totalIn  = rows.reduce(function (s, r) { return s + (parseFloat(String(r[5]).replace(/[^0-9.]/g,'')) || 0); }, 0);
    var totalOut = rows.reduce(function (s, r) { return s + (parseFloat(String(r[6]).replace(/[^0-9.]/g,'')) || 0); }, 0);
    var matchedCount = rows.filter(function (r) { return r[4] !== '0'; }).length;

    return {
      kpis: [
        { label: 'سيارات الأسطول',      value: num(filteredCars.length), cls: '' },
        { label: 'سيارات لها حركات',    value: num(matchedCount),        cls: 'kpi-green' },
        { label: 'إجمالي دخل الأسطول',  value: cur(totalIn),             cls: 'kpi-green' },
        { label: 'إجمالي المصروفات',    value: cur(totalOut),            cls: 'kpi-red'   },
        { label: 'صافي أرباح الأسطول',  value: cur(totalIn - totalOut),  cls: 'kpi-blue'  }
      ],
      sections: [{
        title: 'تفاصيل إيرادات وعقود سيارات المنصة من اليومية',
        headers: ['رقم اللوحة', 'السيارة', 'الفرع', 'الحالة بالمنصة', 'الحركات', 'مقبوضات', 'مصروفات', 'الصافي', 'آخر عقد', 'آخر حركة'],
        rows: rows,
        foot: ['الإجمالي', '—', '—', '—', '—', cur(totalIn), cur(totalOut), cur(totalIn - totalOut), '—', '—']
      }]
    };
  }

  /* 3. تحليل الفروع */
  function buildBranches(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter);
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
        { label: 'عدد الفروع',   value: num(keys.length),   cls: '' },
        { label: 'إجمالي القبض', value: cur(totIn),          cls: 'kpi-green' },
        { label: 'إجمالي الصرف', value: cur(totOut),         cls: 'kpi-red'   },
        { label: 'الصافي',       value: cur(totIn - totOut), cls: 'kpi-blue'  }
      ],
      sections: [{
        title: 'تحليل أداء الفروع المالية',
        headers: ['الفرع', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي'],
        rows: rows,
        foot: ['الإجمالي', num(allRows.length), cur(totIn), cur(totOut), cur(totIn - totOut)]
      }]
    };
  }

  /* 4. طرق الدفع والحسابات */
  function buildPayments(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byMethod  = groupBy(allRows, function (r) { return String(r[F_PAYMETHOD] || '').trim() || 'غير محدد'; });
    var byAccount = groupBy(allRows, function (r) { return String(r[F_ACCOUNT]   || '').trim() || 'غير محدد'; });

    function mkRows(map) {
      return sortedKeys(map).map(function (k) {
        var gr = map[k];
        var gi = sumField(gr, F_IN);
        var go = sumField(gr, F_OUT);
        return [esc(k), num(gr.length), cur(gi), cur(go), cur(gi - go)];
      });
    }

    var totIn = sumField(allRows, F_IN);
    var totOut= sumField(allRows, F_OUT);

    return {
      kpis: [
        { label: 'طرق الدفع المستخدمة', value: num(Object.keys(byMethod).length),  cls: '' },
        { label: 'الحسابات المودع فيها', value: num(Object.keys(byAccount).length), cls: '' },
        { label: 'إجمالي المقبوضات',     value: cur(totIn),                         cls: 'kpi-green' },
        { label: 'إجمالي المصروفات',     value: cur(totOut),                        cls: 'kpi-red'   }
      ],
      sections: [
        { title: 'كشف طرق الدفع والتحصيل (نقداً / شبكة / تحويل...)', headers: ['طريقة الدفع','عدد الحركات','قبض','صرف','صافي'], rows: mkRows(byMethod)  },
        { title: 'كشف الحسابات البنكية والصناديق',                     headers: ['الحساب',    'عدد الحركات','قبض','صرف','صافي'], rows: mkRows(byAccount) }
      ]
    };
  }

  /* 5. أنواع الحركات والعقود */
  function buildMovements(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter);
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
        { title: 'تفصيل حسب نوع الحركة (تمديد عقد / تصفية / مقدم / خصم)', headers: ['نوع الحركة','عدد الحركات','قبض','صرف','صافي'], rows: mkRows(byMovement)  },
        { title: 'تصنيف حسب فئة العملية (إيرادات / مصروفات)',             headers: ['الفئة',     'عدد الحركات','قبض','صرف','صافي'], rows: mkRows(byCategory) }
      ]
    };
  }

  /* 6. كشف المستخدمين والمحصلين */
  function buildUsers(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter);
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
        { label: 'عدد المستخدمين والمحصلين', value: num(Object.keys(byUser).length), cls: '' }
      ],
      sections: [{
        title: 'كشف أداء الموظفين والمحصلين (مرتب بالأعلى تحصيلاً)',
        headers: ['المستخدم', 'عدد الحركات', 'إجمالي المقبوض', 'إجمالي المصروف', 'الصافي'],
        rows: rows
      }]
    };
  }

  /* ─── تصدير Excel / PDF ─── */
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

  /* ─── بناء شريط التحكم العلوي والرفع ─── */
  function buildTopBar(store) {
    var dates = Object.keys(store).sort().reverse();
    var tagsHtml = dates.map(function (d) {
      return '<span class="fn-date-tag">' + esc(d)
        + ' <button type="button" class="fn-del-date" data-date="' + esc(d) + '" title="حذف">✕</button></span>';
    }).join('');

    var cloudBadgeCls = state.cloudStatus === 'online' ? 'online' : (state.cloudStatus === 'offline' ? 'offline' : '');
    var cloudBadgeText = state.cloudStatus === 'online'
      ? '☁️ متصل بالسحابة (' + num(state.cloudCount) + ' حركة)'
      : (state.cloudStatus === 'offline' ? '💾 تخزين محلي (السحابة غير مفعلة)' : '🔄 جاري فحص السحابة…');

    return '<div class="fn-upload-bar">'
      + '<input type="file" id="fn-file" accept=".xlsx,.xls,.csv" style="display:none">'
      + '<button type="button" class="rp-btn fn-upload-btn" id="fn-upload-btn">📤 رفع شيت اليومية</button>'
      + '<button type="button" class="fn-sync-btn" id="fn-sync-fleet-btn" title="تحديث حالة سيارات الأسطول بالمنصة بناءً على عقود اليومية">🔄 مزامنة حالة الأسطول</button>'
      + '<span class="fn-cloud-badge ' + cloudBadgeCls + '">' + cloudBadgeText + '</span>'
      + '<span id="fn-upload-status" class="fn-status"></span>'
      + '</div>'
      + (tagsHtml ? '<div class="fn-dates-row"><span class="rp-muted" style="font-size:11.5px;font-weight:700">الأيام المحفوظة:</span> ' + tagsHtml + '</div>' : '');
  }

  /* ─── الدالة الرئيسية للرسم ─── */
  function renderFinance(host) {
    if (!host) return;

    var store = ensureDemoData(loadStore());

    /* فروع المنصة واليومية */
    var platformBranches = getPlatformBranches();
    var branchOptions = ['<option value="">جميع الفروع</option>'];
    platformBranches.forEach(function (b) {
      branchOptions.push('<option value="' + esc(b) + '"' + (state.branch === b ? ' selected' : '') + '>' + esc(b) + '</option>');
    });

    /* حساب بيانات العرض الحالي */
    var viewData;
    if      (state.view === 'fleet_revenue') viewData = buildFleetRevenue(store, state.branch);
    else if (state.view === 'branches')      viewData = buildBranches(store, state.branch);
    else if (state.view === 'payments')      viewData = buildPayments(store, state.branch);
    else if (state.view === 'movements')     viewData = buildMovements(store, state.branch);
    else if (state.view === 'users')         viewData = buildUsers(store, state.branch);
    else                                     viewData = buildSummary(store, state.branch);

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

    /* بناء الـ HTML كاملاً */
    host.innerHTML =
        '<div class="fn-upload-wrap">' + buildTopBar(store) + '</div>'
      + '<div class="rp-head">'
      + '<div class="rp-head-text"><h2>المالية واليومية الموحدة</h2>'
      + '<div class="muted-small">ربط مباشر مع أسطول المنصة وحفظ سحابي ومحلي</div></div>'
      + '<label class="rp-filter"><span>فرع المنصة</span>'
      + '<select id="fn-branch-select">' + branchOptions.join('') + '</select></label>'
      + '</div>'
      + '<div class="rp-tabs">' + tabsHtml + '</div>'
      + '<div class="rp-kpis">' + kpisHtml + '</div>'
      + sectionsHtml;

    /* ─── ربط الأحداث ─── */

    /* فلتر الفرع */
    var bSel = host.querySelector('#fn-branch-select');
    if (bSel) {
      bSel.addEventListener('change', function () {
        state.branch = bSel.value || '';
        renderFinance(host);
      });
    }

    /* زر رفع الملف */
    var uploadBtn = host.querySelector('#fn-upload-btn');
    var fileInput = host.querySelector('#fn-file');
    var statusEl  = host.querySelector('#fn-upload-status');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        statusEl.textContent = '⏳ جاري القراءة والحفظ…';

        parseXlsxFile(file, function (err, byDate, count) {
          if (err) {
            statusEl.textContent = '❌ خطأ: ' + (err.message || 'فشل قراءة الملف');
            return;
          }

          var freshStore = loadStore();
          var allImportedRows = [];
          Object.keys(byDate).forEach(function (d) {
            freshStore[d] = byDate[d];
            byDate[d].forEach(function (r) { allImportedRows.push(r); });
          });
          saveStore(freshStore);

          /* تحديث سيارات أسطول المنصة آلياً بناءً على اليومية */
          syncFleetFromJournal(allImportedRows, function (updatedCount) {
            var fleetMsg = updatedCount > 0 ? (' + تم تحديث ' + updatedCount + ' سيارة بالأسطول') : '';

            /* حفظ سحابي على Supabase */
            statusEl.textContent = '⏳ جاري الحفظ على السحابة… (' + count + ' حركة' + fleetMsg + ')';

            var datesToSave = Object.keys(byDate);
            var dateIdx = 0;
            function saveNextDay() {
              if (dateIdx >= datesToSave.length) {
                statusEl.textContent = '✅ تم الحفظ السحابي والمحلي بنجاح (' + count + ' حركة' + fleetMsg + ')';
                setTimeout(function () { renderFinance(host); }, 1000);
                return;
              }
              var dk = datesToSave[dateIdx];
              saveDayToCloud(dk, byDate[dk], function () {
                dateIdx++;
                saveNextDay();
              });
            }
            saveNextDay();
          });
        });
      });
    }

    /* زر مزامنة حالة الأسطول يدوياً */
    var syncFleetBtn = host.querySelector('#fn-sync-fleet-btn');
    if (syncFleetBtn) {
      syncFleetBtn.addEventListener('click', function () {
        var allRows = getAllRows(loadStore(), '');
        syncFleetFromJournal(allRows, function (cnt, msg) {
          alert(msg);
          if (cnt > 0) renderFinance(host);
        });
      });
    }

    /* حذف يوم */
    host.querySelectorAll('.fn-del-date').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-date');
        if (!d) return;
        if (!confirm('حذف بيانات يوم ' + d + ' من التخزين المحلي والسحابي؟')) return;
        var s = loadStore();
        delete s[d];
        saveStore(s);
        deleteDayFromCloud(d);
        renderFinance(host);
      });
    });

    /* تبويبات */
    host.querySelectorAll('[data-fn-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fn-tab');
        if (id && id !== state.view) {
          state.view = id;
          renderFinance(host);
        }
      });
    });

    /* تصدير Excel / PDF */
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

    /* بدء المزامنة الخلفية مع السحابة عند الحاجة */
    if (state.cloudStatus === 'checking') {
      syncWithCloud(function () {
        var badge = host.querySelector('.fn-cloud-badge');
        if (badge) {
          badge.className = 'fn-cloud-badge ' + (state.cloudStatus === 'online' ? 'online' : 'offline');
          badge.textContent = state.cloudStatus === 'online'
            ? '☁️ متصل بالسحابة (' + num(state.cloudCount) + ' حركة)'
            : '💾 تخزين محلي (السحابة غير مفعلة)';
        }
      });
    }
  }

  /* ─── تسجيل عمومي ─── */
  global.YahmaFinance  = { render: renderFinance };
  global.renderFinance = renderFinance;

})(typeof window !== 'undefined' ? window : globalThis);
