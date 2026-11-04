/* ===== modules/finance.js — تبويب «المالية» v342 =====
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
    period: 'all', // 'all' | 'latest' | 'month:YYYY-MM' | 'date:YYYY-MM-DD'
    search: '',    // نص بحث سريع في الحركات (لوحة / عميل / عقد)
    darkMode: (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode')) || false,
    cloudStatus: 'checking', // 'online' | 'offline' | 'checking'
    cloudCount: 0,
    modalBranch: null,
    compareBranchA: '',
    compareBranchB: ''
  };

  var VIEWS = [
    { id: 'summary',          label: 'الملخص والرسوم البيانية'    },
    { id: 'branches',         label: 'تحليل ومقارنة الفروع'       },
    { id: 'payments',         label: 'طرق الدفع والحسابات'       },
    { id: 'movements',        label: 'أنواع الحركات والعقود'     },
    { id: 'users',            label: 'كشف المستخدمين والمحصلين' },
    { id: 'contracts_report', label: '📊 كشف دورة العقود والتصفية' },
    { id: 'journal',          label: '📋 إدارة الحركات اليومية'   }
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
  function stripHtml(html) {
    return String(html || '').replace(/<[^>]*>/g, '').trim();
  }
  function formatMonthName(mStr) {
    if (!mStr || mStr.length < 7) return mStr;
    var parts = mStr.split('-');
    var yr = parts[0];
    var mo = parseInt(parts[1], 10);
    var arMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    return (arMonths[mo - 1] || mo) + ' ' + yr;
  }
  function normPlate(p) {
    return String(p || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase();
  }
  function extractDateFromFilename(name) {
    if (!name) return '';
    var s = String(name);
    var mYMD = s.match(/(20\d\d)[-_/.](\d{1,2})[-_/.](\d{1,2})/);
    if (mYMD) return mYMD[1] + '-' + (mYMD[2].length === 1 ? '0' : '') + mYMD[2] + '-' + (mYMD[3].length === 1 ? '0' : '') + mYMD[3];
    var mDMY = s.match(/(\d{1,2})[-_/.](\d{1,2})[-_/.]?(20\d\d)?/);
    if (mDMY) {
      var d = mDMY[1].length === 1 ? '0' + mDMY[1] : mDMY[1];
      var m = mDMY[2].length === 1 ? '0' + mDMY[2] : mDMY[2];
      var y = mDMY[3] || '2026';
      return y + '-' + m + '-' + d;
    }
    return '';
  }
  function excelDateToISO(val, fallbackDate) {
    if (!val) return fallbackDate || '';
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
    var str = String(val).trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(str)) {
      var parts = str.split(/[-/.]/);
      var y = parts[0];
      var m = parts[1].length === 1 ? '0' + parts[1] : parts[1];
      var d = parts[2].slice(0, 2);
      d = d.length === 1 ? '0' + d : d;
      return y + '-' + m + '-' + d;
    }
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(str)) {
      var parts = str.split(/[-/.]/);
      var d = parts[0].length === 1 ? '0' + parts[0] : parts[0];
      var m = parts[1].length === 1 ? '0' + parts[1] : parts[1];
      var y = parts[2].slice(0, 4);
      return y + '-' + m + '-' + d;
    }
    var n = Number(str);
    if (!isNaN(n) && n > 20000 && n < 60000) {
      var dObj = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(dObj.getTime())) {
        return dObj.toISOString().slice(0, 10);
      }
    }
    return fallbackDate || '';
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

  function getAllRows(store, branchFilter, periodFilter, searchFilter) {
    var all = [];
    var dates = Object.keys(store).sort().reverse();
    var targetDates = dates;

    var p = periodFilter !== undefined ? periodFilter : state.period;

    if (p === 'latest' && dates.length > 0) {
      targetDates = [dates[0]];
    } else if (p && p.indexOf('month:') === 0) {
      var mo = p.slice(6);
      targetDates = dates.filter(function (d) { return d.slice(0, 7) === mo; });
    } else if (p && p.indexOf('date:') === 0) {
      var dt = p.slice(5);
      targetDates = dates.filter(function (d) { return d === dt; });
    }

    var s = (searchFilter || state.search || '').trim().toLowerCase();

    targetDates.forEach(function (d) {
      (store[d] || []).forEach(function (r) {
        if (!branchFilter || String(r[F_BRANCH] || '').trim() === branchFilter) {
          if (s && ![
              String(r[F_PLATE] || ''),
              String(r[F_CLIENT] || ''),
              String(r[F_CONTRACT] || ''),
              String(r[F_DESC] || ''),
              String(r[F_USER] || '')
            ].join(' | ').toLowerCase().includes(s)) {
            return;
          }
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
          console.warn('[FinanceCloud] sync error (الجدول غير منشأ بعد أو خطأ صلاحيات):', res.error);
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
      .catch(function (err) {
        console.warn('[FinanceCloud] catch error:', err);
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
    var p = (typeof global.ensureXlsxReady === 'function')
      ? Promise.resolve(global.ensureXlsxReady())
      : Promise.resolve(true);

    p.then(function () {
      doParseFile(file, callback);
    }).catch(function (err) {
      console.warn('[Finance] ensureXlsxReady error:', err);
      doParseFile(file, callback);
    });
  }

  function doParseFile(file, callback) {
    if (!global.XLSX || typeof global.XLSX.read !== 'function') {
      callback(new Error('مكتبة الإكسيل غير محملة في الصفحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.'), null, 0);
      return;
    }

    function processBuffer(buffer) {
      try {
        var data = new Uint8Array(buffer);
        var wb;
        try {
          wb = global.XLSX.read(data, { type: 'array', cellDates: false });
        } catch (e1) {
          try {
            var text = new TextDecoder('utf-8').decode(data);
            wb = global.XLSX.read(text, { type: 'string' });
          } catch (e2) {
            throw e1;
          }
        }

        if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
          callback(new Error('الملف فارغ أو لا يحتوي على صفحات'), null, 0);
          return;
        }

        var ws = wb.Sheets[wb.SheetNames[0]];
        var raw = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!raw || !raw.length) {
          callback(new Error('الملف لا يحتوي على صفوف بيانات'), null, 0);
          return;
        }

        var fileFallbackDate = extractDateFromFilename(file && file.name) || DEMO_DATE;

        /* البحث عن صف العناوين في أول 25 صف */
        var headerRow = -1;
        for (var i = 0; i < Math.min(25, raw.length); i++) {
          var row = raw[i];
          if (!row || !Array.isArray(row)) continue;
          var joined = row.map(function (c) { return String(c || ''); }).join(' ');
          if (/رقم السند|اسم الفرع|نوع الحركة|العملية|طريقة الدفع|رقم العقد|المقبوض|قبض|صرف/i.test(joined)) {
            headerRow = i;
            break;
          }
        }

        /* مطابقة مرنة للأعمدة */
        var colMap = {};
        if (headerRow >= 0) {
          raw[headerRow].forEach(function (h, ci) {
            var hh = String(h || '').trim().replace(/\s+/g, '');
            if (!hh) return;
            if (/سند|رقمالسند/i.test(hh)) colMap[F_ID] = ci;
            else if (/تسلسل|تسلسلالفرع/i.test(hh)) colMap[F_SEQ] = ci;
            else if (/فرع|اسمالفرع/i.test(hh)) colMap[F_BRANCH] = ci;
            else if (/تاريخ|التاريخ|الوقت/i.test(hh)) colMap[F_DATE] = ci;
            else if (/هوية|رقمالهوية/i.test(hh)) colMap[F_CID] = ci;
            else if (/عميل|اسمالعميل/i.test(hh)) colMap[F_CLIENT] = ci;
            else if (/لوحة|رقماللوحة|سيارة/i.test(hh)) colMap[F_PLATE] = ci;
            else if (/نوعالحركة|حركة/i.test(hh)) colMap[F_MOVEMENT] = ci;
            else if (/نوعالعملية/i.test(hh)) colMap[F_OPTYPE] = ci;
            else if (/العملية|تصنيف/i.test(hh)) colMap[F_CATEGORY] = ci;
            else if (/قبض|مقبوض|إيراد|دائن/i.test(hh)) colMap[F_IN] = ci;
            else if (/صرف|مصروف|مدين|خصم/i.test(hh)) colMap[F_OUT] = ci;
            else if (/عقد|رقمالعقد/i.test(hh)) colMap[F_CONTRACT] = ci;
            else if (/ورقي|عقدورقي/i.test(hh)) colMap[F_PAPER] = ci;
            else if (/بيان|بيـان|وصف/i.test(hh)) colMap[F_DESC] = ci;
            else if (/دفع|طريقةالدفع|سداد/i.test(hh)) colMap[F_PAYMETHOD] = ci;
            else if (/حساب|منحساب/i.test(hh)) colMap[F_ACCOUNT] = ci;
            else if (/معتمد|اعتماد/i.test(hh)) colMap[F_APPROVED] = ci;
            else if (/موافقة|رقمالموافقة/i.test(hh)) colMap[F_AUTHNO] = ci;
            else if (/مستخدم|أضيفبواسطة|محصل/i.test(hh)) colMap[F_USER] = ci;
          });
        }

        for (var fi = 0; fi < 20; fi++) {
          if (colMap[fi] == null) colMap[fi] = fi;
        }

        var dataStart = headerRow >= 0 ? headerRow + 1 : 1;
        var rows = [];
        for (var ri = dataStart; ri < raw.length; ri++) {
          var src = raw[ri];
          if (!src || !Array.isArray(src) || src.every(function (c) { return c === '' || c == null; })) continue;
          var mapped = [];
          for (var fi = 0; fi < 20; fi++) {
            var ci = colMap[fi];
            mapped.push(src[ci] != null ? src[ci] : '');
          }
          rows.push(mapped);
        }

        if (!rows.length) {
          callback(new Error('لم يتم العثور على حركات صالحة في الشيت المرفوع'), null, 0);
          return;
        }

        var byDate = {};
        rows.forEach(function (r) {
          var key = excelDateToISO(r[F_DATE], fileFallbackDate) || fileFallbackDate;
          if (!byDate[key]) byDate[key] = [];
          byDate[key].push(r);
        });

        callback(null, byDate, rows.length);
      } catch (err) {
        callback(err, null, 0);
      }
    }

    if (file && typeof file.arrayBuffer === 'function') {
      file.arrayBuffer().then(processBuffer).catch(function () {
        var reader = new FileReader();
        reader.onload = function (e) { processBuffer(e.target.result); };
        reader.onerror = function () { callback(new Error('فشل قراءة الملف من الجهاز'), null, 0); };
        reader.readAsArrayBuffer(file);
      });
    } else {
      var reader = new FileReader();
      reader.onload = function (e) { processBuffer(e.target.result); };
      reader.onerror = function () { callback(new Error('فشل قراءة الملف من الجهاز'), null, 0); };
      reader.readAsArrayBuffer(file);
    }
  }

  /* ─── قراءة شيت اليومية لا تعدل أسطول المنصة، بل التبويبات الأخرى هي التي تغذي المالية ─── */

  /* ─── تحليل دورة العقود والعمليات (مفتوحة / تمديد / مغلقة / مصروفات) ─── */
  function analyzeContracts(rows) {
    var opened = [];
    var extended = [];
    var closed = [];
    var cancelled = [];
    var discounts = [];
    var other = [];

    rows.forEach(function (r) {
      var mov = String(r[F_MOVEMENT] || '').trim();

      if (/مقدم عقد|عقد جديد|فتح عقد|افتتاح/.test(mov)) {
        opened.push(r);
      } else if (/تمديد/.test(mov)) {
        extended.push(r);
      } else if (/تصفية|إغلاق|اغلاق/.test(mov)) {
        closed.push(r);
      } else if (/إلغاء|الغاء/.test(mov)) {
        cancelled.push(r);
      } else if (/خصم/.test(mov) || r[F_CATEGORY] === 'مصروفات') {
        discounts.push(r);
      } else {
        other.push(r);
      }
    });

    var totalIn = sumField(rows, F_IN);
    var totalOut = sumField(rows, F_OUT);
    var net = totalIn - totalOut;

    return {
      opened: { count: opened.length, amountIn: sumField(opened, F_IN), rows: opened },
      extended: { count: extended.length, amountIn: sumField(extended, F_IN), rows: extended },
      closed: { count: closed.length, amountIn: sumField(closed, F_IN), amountOut: sumField(closed, F_OUT), rows: closed },
      cancelled: { count: cancelled.length, rows: cancelled },
      discounts: { count: discounts.length, amountOut: sumField(discounts, F_OUT), rows: discounts },
      other: { count: other.length, rows: other },
      totalMoves: rows.length,
      totalIn: totalIn,
      totalOut: totalOut,
      net: net
    };
  }

  /* ─── كروت خط أنابيب العقود (كم عقد فُتح، كام تمديد، كام عقد أُغلق) ─── */
  function buildPipelineCards(analytics) {
    return '<div class="fn-pipeline">'
      + '<div class="fn-pipe-card pipe-open">'
      + '  <div class="fn-pipe-head"><span class="fn-pipe-title">عقود جديدة (مفتوحة)</span><span class="fn-pipe-icon">📝</span></div>'
      + '  <div class="fn-pipe-count">' + num(analytics.opened.count) + ' <small style="font-size:12px;font-weight:600;color:var(--muted)">عقد</small></div>'
      + '  <div class="fn-pipe-sub"><span>إجمالي مقدّم:</span> <b>' + cur(analytics.opened.amountIn) + '</b></div>'
      + '</div>'
      + '<div class="fn-pipe-card pipe-renew">'
      + '  <div class="fn-pipe-head"><span class="fn-pipe-title">تمديد عقود</span><span class="fn-pipe-icon">🔄</span></div>'
      + '  <div class="fn-pipe-count">' + num(analytics.extended.count) + ' <small style="font-size:12px;font-weight:600;color:var(--muted)">تمديد</small></div>'
      + '  <div class="fn-pipe-sub"><span>إيراد التمديدات:</span> <b>' + cur(analytics.extended.amountIn) + '</b></div>'
      + '</div>'
      + '<div class="fn-pipe-card pipe-close">'
      + '  <div class="fn-pipe-head"><span class="fn-pipe-title">عقود أغلقت وتصفية</span><span class="fn-pipe-icon">🏁</span></div>'
      + '  <div class="fn-pipe-count">' + num(analytics.closed.count) + ' <small style="font-size:12px;font-weight:600;color:var(--muted)">عقد مغلق</small></div>'
      + '  <div class="fn-pipe-sub"><span>تحصيل التصفية:</span> <b>' + cur(analytics.closed.amountIn) + '</b></div>'
      + '</div>'
      + '<div class="fn-pipe-card pipe-out">'
      + '  <div class="fn-pipe-head"><span class="fn-pipe-title">المصروفات والسندات</span><span class="fn-pipe-icon">💸</span></div>'
      + '  <div class="fn-pipe-count">' + cur(analytics.totalOut) + '</div>'
      + '  <div class="fn-pipe-sub"><span>عدد السندات:</span> <b>' + num(analytics.discounts.count) + ' حركة</b></div>'
      + '</div>'
      + '<div class="fn-pipe-card pipe-net">'
      + '  <div class="fn-pipe-head"><span class="fn-pipe-title">صافي التدفق المالي</span><span class="fn-pipe-icon">📈</span></div>'
      + '  <div class="fn-pipe-count" style="color:' + (analytics.net >= 0 ? 'var(--green,#10b981)' : 'var(--red,#ef4444)') + '">' + cur(analytics.net) + '</div>'
      + '  <div class="fn-pipe-sub"><span>إجمالي القبض:</span> <b>' + cur(analytics.totalIn) + '</b></div>'
      + '</div>'
      + '</div>';
  }

  /* ─── دوال توليد الرسوم البيانية المتجهة الفائقة (SVG Vector Charts) ─── */

  /* 1. مخطط مساحي وخطي انسيابي (Area Chart & Line Chart) */
  function renderSvgAreaLineChart(dailyData) {
    if (!dailyData || !dailyData.length) {
      return '<div class="rp-muted" style="text-align:center;padding:40px">لا توجد بيانات كافية</div>';
    }
    var W = 520, H = 160, padL = 45, padR = 25, padT = 20, padB = 30;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var maxVal = dailyData.reduce(function (mx, d) { return Math.max(mx, d.in, d.out); }, 1);
    if (maxVal <= 0) maxVal = 1;

    var ptsIn = dailyData.map(function (d, idx) {
      var x = padL + (idx / Math.max(1, dailyData.length - 1)) * plotW;
      var y = padT + plotH - (d.in / maxVal) * plotH;
      return { x: x, y: y, data: d };
    });

    var ptsOut = dailyData.map(function (d, idx) {
      var x = padL + (idx / Math.max(1, dailyData.length - 1)) * plotW;
      var y = padT + plotH - (d.out / maxVal) * plotH;
      return { x: x, y: y, data: d };
    });

    function smoothPath(pts) {
      if (!pts.length) return '';
      if (pts.length === 1) return 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[i === 0 ? i : i - 1];
        var p1 = pts[i];
        var p2 = pts[i + 1];
        var p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
        var cp1x = p1.x + (p2.x - p0.x) / 6;
        var cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6;
        var cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C ' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    }

    var lineIn = smoothPath(ptsIn);
    var baselineY = (padT + plotH).toFixed(1);
    var areaIn = lineIn + ' L ' + ptsIn[ptsIn.length - 1].x.toFixed(1) + ' ' + baselineY + ' L ' + ptsIn[0].x.toFixed(1) + ' ' + baselineY + ' Z';
    var lineOut = smoothPath(ptsOut);

    var gridLines = [0.25, 0.5, 0.75, 1.0].map(function (r) {
      var gy = (padT + plotH - r * plotH).toFixed(1);
      var val = (Math.round((r * maxVal) / 100) / 10) + 'k';
      return '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--line,#e2e8f0)" stroke-dasharray="3 3" stroke-width="1" opacity="0.6"/>'
        + '<text x="' + (padL - 6) + '" y="' + (Number(gy) + 3) + '" text-anchor="end" font-size="9" fill="var(--muted,#64748b)" font-weight="600">' + val + '</text>';
    }).join('');

    var dotsIn = ptsIn.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#10b981" stroke="#fff" stroke-width="2"><title>' + esc(p.data.fullDate) + ' | مقبوض: ' + cur(p.data.in) + '</title></circle>';
    }).join('');

    var dotsOut = ptsOut.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="#ef4444" stroke="#fff" stroke-width="1.5"><title>' + esc(p.data.fullDate) + ' | مصروف: ' + cur(p.data.out) + '</title></circle>';
    }).join('');

    var datesLabels = dailyData.map(function (d, idx) {
      var x = padL + (idx / Math.max(1, dailyData.length - 1)) * plotW;
      return '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="var(--muted,#64748b)" font-weight="700">' + esc(d.date) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:175px;display:block">'
      + '<defs>'
      + '  <linearGradient id="fnAreaInGrad" x1="0" y1="0" x2="0" y2="1">'
      + '    <stop offset="0%" stop-color="#10b981" stop-opacity="0.38"/>'
      + '    <stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/>'
      + '  </linearGradient>'
      + '</defs>'
      + gridLines
      + '<path d="' + areaIn + '" fill="url(#fnAreaInGrad)" />'
      + '<path d="' + lineIn + '" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="' + lineOut + '" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>'
      + dotsIn
      + dotsOut
      + datesLabels
      + '</svg>';
  }

  /* 2. مؤشر العداد المالي (Gauge Chart - Speedometer) */
  function renderSvgGaugeChart(netMarginPct) {
    var pct = Math.min(100, Math.max(0, netMarginPct || 0));
    var cx = 110, cy = 95, r = 70;
    var circum = Math.PI * r;
    var dashOffset = circum * (1 - pct / 100);

    var angleDeg = 180 + (pct / 100) * 180;
    var rad = (Math.PI * angleDeg) / 180;
    var needleLen = r - 16;
    var nx = (cx + needleLen * Math.cos(rad)).toFixed(1);
    var ny = (cy + needleLen * Math.sin(rad)).toFixed(1);

    var ratingText = pct >= 85 ? 'هامش ربح ممتاز' : (pct >= 65 ? 'أداء ربحي جيد' : 'هامش بحاجة لمتابعة');
    var ratingColor = pct >= 85 ? '#10b981' : (pct >= 65 ? '#f59e0b' : '#ef4444');

    return '<svg viewBox="0 0 220 135" style="width:100%;max-width:250px;height:140px;margin:0 auto;display:block">'
      + '<defs>'
      + '  <linearGradient id="fnGaugeGrad" x1="0" y1="0" x2="1" y2="0">'
      + '    <stop offset="0%" stop-color="#ef4444"/>'
      + '    <stop offset="50%" stop-color="#f59e0b"/>'
      + '    <stop offset="85%" stop-color="#10b981"/>'
      + '  </linearGradient>'
      + '</defs>'
      + '<path d="M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="14" stroke-linecap="round" />'
      + '<path d="M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" fill="none" stroke="url(#fnGaugeGrad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + circum.toFixed(1) + '" stroke-dashoffset="' + dashOffset.toFixed(1) + '" />'
      + '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx + '" y2="' + ny + '" stroke="var(--ink,#1e293b)" stroke-width="3" stroke-linecap="round"/>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="var(--ink,#1e293b)"/>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="#fff"/>'
      + '<text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" font-size="22" font-weight="900" fill="var(--ink,#0f172a)">' + pct.toFixed(1) + '%</text>'
      + '<text x="' + cx + '" y="' + (cy + 22) + '" text-anchor="middle" font-size="11" font-weight="700" fill="' + ratingColor + '">' + ratingText + '</text>'
      + '<text x="' + (cx - r - 4) + '" y="' + (cy + 16) + '" text-anchor="start" font-size="9" fill="var(--muted,#64748b)" font-weight="700">0%</text>'
      + '<text x="' + (cx + r + 4) + '" y="' + (cy + 16) + '" text-anchor="end" font-size="9" fill="var(--muted,#64748b)" font-weight="700">100%</text>'
      + '</svg>';
  }

  /* 3. المخطط الحلقي لدورة العقود (Doughnut Chart) */
  function renderSvgDoughnutChart(slices, totalCount) {
    var cx = 85, cy = 85, r = 58, strokeW = 22;
    var circum = 2 * Math.PI * r;
    var offset = 0;

    var circlesHtml = slices.map(function (s) {
      var len = (s.pct / 100) * circum;
      var circle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="' + strokeW + '" '
        + 'stroke-dasharray="' + len.toFixed(1) + ' ' + (circum - len).toFixed(1) + '" '
        + 'stroke-dashoffset="' + (-offset).toFixed(1) + '" '
        + 'transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(s.label) + ': ' + num(s.count) + ' (' + s.pct + '%)</title></circle>';
      offset += len;
      return circle;
    }).join('');

    var legendHtml = slices.map(function (s) {
      return '<div class="fn-doughnut-legend-item">'
        + '<span class="fn-doughnut-dot" style="background:' + s.color + '"></span>'
        + '<span class="fn-doughnut-label">' + esc(s.label) + '</span>'
        + '<b class="fn-doughnut-val">' + num(s.count) + ' <small>(' + s.pct + '%)</small></b>'
        + '</div>';
    }).join('');

    return '<div class="fn-doughnut-container">'
      + '<div class="fn-doughnut-svg-wrap">'
      + '  <svg viewBox="0 0 170 170" style="width:150px;height:150px;display:block">'
      + '    <circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="' + strokeW + '"/>'
      +      circlesHtml
      + '    <text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="18" font-weight="900" fill="var(--ink,#0f172a)">' + num(totalCount) + '</text>'
      + '    <text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--muted,#64748b)">حركة</text>'
      + '  </svg>'
      + '</div>'
      + '<div class="fn-doughnut-legend">' + legendHtml + '</div>'
      + '</div>';
  }

  /* ===== رسوم بيانية إضافية للمقارنة ===== */

  /* مخطط التреваMap (Treemap) - 비교 الفروع بالحجم واللون */
  function renderSvgTreemapChart(items, title) {
    if (!items || !items.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 420, H = 280, pad = 8;
    var total = items.reduce(function (s, it) { return s + (it.value || 0); }, 0);
    if (total <= 0) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var colors = ['#0284c7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
    var html = '<div class="fn-chart-card"><div class="fn-chart-title">' + esc(title) + '</div><div style="display:flex;flex-wrap:wrap">';
    var x = 0, y = 0, rowH = 0, colW = 0, used = 0;
    items.forEach(function (it, i) {
      var w = Math.max(60, (it.value / total) * (W - pad * 2));
      var h = Math.max(40, rowH || 100);
      var pct = Math.round((it.value / total) * 100);
      html += '<div style="position:relative;width:' + w + 'px;height:' + h + 'px;background:' + colors[i % colors.length] + ';border-radius:6px;margin:' + pad + 'px;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1)">';
      html += '<div style="font-size:13px">' + esc(it.label || '—') + '</div>';
      html += '<div style="font-size:10px;opacity:0.85">' + cur(it.value) + ' (' + pct + '%)</div>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  /* مخطط الشمس المشرقة (Sunburst) - 비교 الفروع والفترات hierarchic */
  function renderSvgSunburstChart(items, title) {
    if (!items || !items.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var total = items.reduce(function (s, it) { return s + (it.value || 0); }, 0);
    if (total <= 0) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 300, H = 300, cx = 150, cy = 150, rOuter = 130, rInner = 70;
    var colors = ['#0284c7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
    var start = -90, slices = '', legend = '';
    items.forEach(function (it, i) {
      var pct = (it.value / total) * 360;
      var end = start + pct;
      var x1 = cx + rOuter * Math.cos(start * Math.PI / 180);
      var y1 = cy + rOuter * Math.sin(start * Math.PI / 180);
      var x2 = cx + rOuter * Math.cos(end * Math.PI / 180);
      var y2 = cy + rOuter * Math.sin(end * Math.PI / 180);
      var xi1 = cx + rInner * Math.cos(start * Math.PI / 180);
      var yi1 = cy + rInner * Math.sin(start * Math.PI / 180);
      var xi2 = cx + rInner * Math.cos(end * Math.PI / 180);
      var yi2 = cy + rInner * Math.sin(end * Math.PI / 180);
      var large = pct > 180 ? 1 : 0;
      slices += '<path d="M ' + x1 + ' ' + y1 + ' A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' L ' + xi2 + ' ' + yi2 + ' A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + xi1 + ' ' + yi1 + ' Z" fill="' + colors[i % colors.length] + '" opacity="0.9" stroke="#fff" stroke-width="2"><title>' + esc(it.label) + ': ' + cur(it.value) + ' (' + Math.round(it.value / total * 100) + '%)</title></path>';
      legend += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px"><span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:' + colors[i % colors.length] + '"></span><span>' + esc(it.label) + '</span><b style="margin-left:auto">' + Math.round(it.value / total * 100) + '%</b></div>';
      start = end;
    });
    return '<div class="fn-chart-card"><div class="fn-chart-title">' + esc(title) + '</div><div style="display:flex;gap:12px"><div style="flex:1"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:280px;display:block;margin:0 auto"><circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="none" stroke="#e2e8f0" stroke-width="2"/>' + slices + '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="16" font-weight="800" fill="#1e293b">' + num(total) + '</text></svg></div><div style="flex:1">' + legend + '</div></div></div>';
  }

  /* مخطط الفقاعات (Bubble Chart) - مقارنة الفروع بعدد الحركات والقيمة */
  function renderSvgBubbleChart(items, title) {
    if (!items || !items.length) return '<div class="rp-empty">لا توجد بيانات للرسم البياني.</div>';
    var W = 520, H = 300, padL = 60, padR = 40, padT = 40, padB = 50;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxVal = Math.max.apply(null, items.map(function (it) { return it.value || 0; }).concat([1]));
    var maxCount = Math.max.apply(null, items.map(function (it) { return it.count || 0; }).concat([1]));
    var colors = ['#0284c7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    var bubbles = '', labels = '', maxSize = 40;
    items.forEach(function (it, i) {
      var valPct = (it.value || 0) / maxVal;
      var cntPct = (it.count || 0) / maxCount;
      var r = 12 + valPct * maxSize;
      var x = padL + (i / Math.max(1, items.length - 1)) * plotW;
      var y = padT + plotH - cntPct * plotH;
      bubbles += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + colors[i % colors.length] + '" opacity="0.7" stroke="#fff" stroke-width="2"><title>' + esc(it.label) + '\nقبض: ' + cur(it.value) + '\nحركات: ' + num(it.count) + '</title></circle>';
      labels += '<text x="' + x + '" y="' + (H - padB + 15) + '" text-anchor="middle" font-size="9" fill="#64748b" font-weight="600">' + esc(String(it.label).slice(0, 12)) + '</text>';
    });
    return '<div class="fn-chart-card"><div class="fn-chart-title">' + esc(title) + '</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:280px;display:block"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/><line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#94a3b8" stroke-width="1"/><text x="' + padL + '" y="' + (H - padB + 30) + '" font-size="10" fill="#64748b">عدد الحركات ↓</text><text x="10" y="' + padT + '" font-size="10" fill="#64748b" transform="rotate(-90 10 ' + padT + ')">المقبوضات ↓</text>' + bubbles + labels + '</svg></div>';
  }

  /* 4. شلال التدفق المالي (Waterfall Chart) */
  function renderSvgWaterfallChart(totalIn, totalOut, discountsOut, net) {
    var W = 360, H = 165, padL = 20, padR = 20, padT = 20, padB = 30;
    var baseY = H - padB;
    var maxVal = Math.max(totalIn, totalOut + discountsOut + net, 1);
    var scale = (baseY - padT) / maxVal;

    var colW = 54;
    var gap = (W - padL - padR - 4 * colW) / 3;

    var h1 = Math.max(4, totalIn * scale);
    var x1 = padL;
    var y1 = baseY - h1;

    var h2 = Math.max(4, totalOut * scale);
    var x2 = x1 + colW + gap;
    var y2 = y1;

    var h3 = Math.max(4, discountsOut * scale);
    var x3 = x2 + colW + gap;
    var y3 = y2 + h2;

    var h4 = Math.max(4, net * scale);
    var x4 = x3 + colW + gap;
    var y4 = baseY - h4;

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:165px;display:block">'
      + '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY + '" stroke="var(--line,#e2e8f0)" stroke-width="1"/>'
      + '<line x1="' + (x1 + colW) + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y1 + '" stroke="var(--muted,#94a3b8)" stroke-dasharray="3 2" stroke-width="1.2"/>'
      + '<line x1="' + (x2 + colW) + '" y1="' + (y2 + h2) + '" x2="' + x3 + '" y2="' + (y2 + h2) + '" stroke="var(--muted,#94a3b8)" stroke-dasharray="3 2" stroke-width="1.2"/>'
      + '<line x1="' + (x3 + colW) + '" y1="' + (y3 + h3) + '" x2="' + x4 + '" y2="' + y4 + '" stroke="var(--muted,#94a3b8)" stroke-dasharray="3 2" stroke-width="1.2"/>'
      + '<rect x="' + x1 + '" y="' + y1 + '" width="' + colW + '" height="' + h1 + '" rx="4" fill="#10b981"><title>إجمالي المقبوضات: ' + cur(totalIn) + '</title></rect>'
      + '<text x="' + (x1 + colW / 2) + '" y="' + Math.max(12, y1 - 4) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#059669">+' + (totalIn >= 1000 ? Math.round(totalIn/1000) + 'k' : num(totalIn)) + '</text>'
      + '<text x="' + (x1 + colW / 2) + '" y="' + (baseY + 16) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--muted,#64748b)">مقبوضات</text>'
      + '<rect x="' + x2 + '" y="' + y2 + '" width="' + colW + '" height="' + h2 + '" rx="4" fill="#ef4444"><title>المصروفات: ' + cur(totalOut) + '</title></rect>'
      + '<text x="' + (x2 + colW / 2) + '" y="' + Math.max(12, y2 - 4) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#dc2626">-' + (totalOut >= 1000 ? Math.round(totalOut/1000) + 'k' : num(totalOut)) + '</text>'
      + '<text x="' + (x2 + colW / 2) + '" y="' + (baseY + 16) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--muted,#64748b)">مصروفات</text>'
      + '<rect x="' + x3 + '" y="' + y3 + '" width="' + colW + '" height="' + h3 + '" rx="4" fill="#f59e0b"><title>سندات الخصم: ' + cur(discountsOut) + '</title></rect>'
      + '<text x="' + (x3 + colW / 2) + '" y="' + Math.max(12, y3 - 4) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#d97706">-' + (discountsOut >= 1000 ? Math.round(discountsOut/1000) + 'k' : num(discountsOut)) + '</text>'
      + '<text x="' + (x3 + colW / 2) + '" y="' + (baseY + 16) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--muted,#64748b)">خصومات</text>'
      + '<rect x="' + x4 + '" y="' + y4 + '" width="' + colW + '" height="' + h4 + '" rx="4" fill="#0284c7"><title>صافي الربح: ' + cur(net) + '</title></rect>'
      + '<text x="' + (x4 + colW / 2) + '" y="' + Math.max(12, y4 - 4) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#0369a1">' + (net >= 1000 ? Math.round(net/1000) + 'k' : num(net)) + '</text>'
      + '<text x="' + (x4 + colW / 2) + '" y="' + (baseY + 16) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--muted,#64748b)">الصافي</text>'
      + '</svg>';
  }

  /* 5. المخطط الراداري الخماسي (Radar Chart) */
  function renderSvgRadarChart(metrics) {
    var cx = 110, cy = 95, maxR = 64;
    var levels = [0.25, 0.5, 0.75, 1.0];
    var n = metrics.length;

    function getCoord(idx, val) {
      var angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      var r = (val / 100) * maxR;
      return {
        x: (cx + r * Math.cos(angle)).toFixed(1),
        y: (cy + r * Math.sin(angle)).toFixed(1)
      };
    }

    var gridsHtml = levels.map(function (lvl) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var pt = getCoord(i, lvl * 100);
        pts.push(pt.x + ',' + pt.y);
      }
      return '<polygon points="' + pts.join(' ') + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="1" opacity="0.7"/>';
    }).join('');

    var axesHtml = metrics.map(function (m, i) {
      var end = getCoord(i, 100);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + end.x + '" y2="' + end.y + '" stroke="var(--line,#cbd5e1)" stroke-width="1" opacity="0.7"/>';
    }).join('');

    var dataPts = metrics.map(function (m, i) {
      return getCoord(i, m.value);
    });
    var dataPolyStr = dataPts.map(function (p) { return p.x + ',' + p.y; }).join(' ');

    var dotsHtml = dataPts.map(function (p, i) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#6366f1" stroke="#fff" stroke-width="1.5"><title>' + esc(metrics[i].label) + ': ' + metrics[i].value + '%</title></circle>';
    }).join('');

    var labelsHtml = metrics.map(function (m, i) {
      var angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      var lx = (cx + (maxR + 18) * Math.cos(angle)).toFixed(1);
      var ly = (cy + (maxR + 14) * Math.sin(angle)).toFixed(1);
      var anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
      return '<text x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '" font-size="8.5" font-weight="700" fill="var(--muted,#64748b)">' + esc(m.label) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 220 195" style="width:100%;max-width:240px;height:170px;margin:0 auto;display:block">'
      + '<defs>'
      + '  <linearGradient id="fnRadarGrad" x1="0" y1="0" x2="0" y2="1">'
      + '    <stop offset="0%" stop-color="#6366f1" stop-opacity="0.38"/>'
      + '    <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.12"/>'
      + '  </linearGradient>'
      + '</defs>'
      + gridsHtml
      + axesHtml
      + '<polygon points="' + dataPolyStr + '" fill="url(#fnRadarGrad)" stroke="#6366f1" stroke-width="2" stroke-linejoin="round"/>'
      + dotsHtml
      + labelsHtml
      + '</svg>';
  }

  /* ─── شبكة الرسوم البيانية المتطورة (Modern Visualizations Grid) ─── */
  function buildChartsGrid(allRows, store) {
    if (!allRows.length) return '';

    var analytics = analyzeContracts(allRows);
    var dates = Object.keys(store).sort();
    var recentDates = dates.slice(-8);

    /* 1. بيانات التدفق اليومي للرسم البياني المساحي والخطي */
    var dailyData = recentDates.map(function (d) {
      var dRows = (store[d] || []).filter(function (r) {
        return !state.branch || String(r[F_BRANCH] || '').trim() === state.branch;
      });
      var dIn = sumField(dRows, F_IN);
      var dOut = sumField(dRows, F_OUT);
      return { date: d.slice(5), fullDate: d, in: dIn, out: dOut, count: dRows.length };
    });

    /* 2. شرائح المخطط الحلقي (Doughnut Chart) */
    var totalOperations = analytics.totalMoves || 1;
    var extPct = Math.round((analytics.extended.count / totalOperations) * 100);
    var openPct = Math.round((analytics.opened.count / totalOperations) * 100);
    var closePct = Math.round((analytics.closed.count / totalOperations) * 100);
    var discPct = Math.round((analytics.discounts.count / totalOperations) * 100);
    var otherPct = Math.max(0, 100 - extPct - openPct - closePct - discPct);

    var doughnutSlices = [
      { label: 'تمديدات العقود', count: analytics.extended.count, pct: extPct, color: '#10b981' },
      { label: 'عقود جديدة ومقدمات', count: analytics.opened.count, pct: openPct, color: '#0ea5e9' },
      { label: 'تصفيات وعقود مغلقة', count: analytics.closed.count, pct: closePct, color: '#f59e0b' },
      { label: 'سندات خصم ومصروف', count: analytics.discounts.count, pct: discPct, color: '#ef4444' }
    ];
    if (otherPct > 0) {
      doughnutSlices.push({ label: 'عمليات أخرى', count: analytics.other.count, pct: otherPct, color: '#94a3b8' });
    }

    /* 3. مؤشر الربحية وهامش التحصيل للعداد (Gauge Chart) */
    var totalIn = analytics.totalIn || 1;
    var marginPct = totalIn > 0 ? (analytics.net / totalIn) * 100 : 0;

    /* 4. بيانات شلال التدفق المالي (Waterfall Chart) */
    var discountsOut = analytics.discounts.amountOut || Math.round(analytics.totalOut * 0.35);
    var operationalOut = Math.max(0, analytics.totalOut - discountsOut);

    /* 5. أعلى الفروع تحقيقاً للدخل (مخطط الأشرطة الأفقية - Bar Chart) */
    var byBranch = groupBy(allRows, function (r) { return String(r[F_BRANCH] || '').trim() || 'غير محدد'; });
    var branchList = sortedKeys(byBranch).map(function (b) {
      var bRows = byBranch[b];
      var bIn = sumField(bRows, F_IN);
      var pct = Math.round((bIn / totalIn) * 100);
      return { name: b, in: bIn, count: bRows.length, pct: pct };
    }).sort(function (a, b) { return b.in - a.in; }).slice(0, 5);

    /* 6. مؤشرات التوازن الخماسي للمخطط الراداري (Radar Chart) */
    var byMethod = groupBy(allRows, function (r) { return String(r[F_PAYMETHOD] || '').trim(); });
    var digitalIn = 0;
    Object.keys(byMethod).forEach(function (m) {
      if (/شبكة|مدى|فيزا|ماستر|تحويل|سداد|stc|apple/i.test(m)) {
        digitalIn += sumField(byMethod[m], F_IN);
      }
    });
    var digitalScore = Math.min(100, Math.max(25, Math.round((digitalIn / totalIn) * 100)));
    var collectionScore = Math.min(100, Math.max(20, Math.round(marginPct)));
    var renewalScore = Math.min(100, Math.max(20, Math.round(extPct * 1.3)));
    var costControlScore = Math.min(100, Math.max(20, Math.round(100 - (analytics.totalOut / totalIn) * 100)));
    var volumeScore = Math.min(100, Math.max(20, Math.round((openPct + closePct) * 1.8)));

    var radarMetrics = [
      { label: 'كفاءة التحصيل', value: collectionScore },
      { label: 'حصة التمديد', value: renewalScore },
      { label: 'الدفع الإلكتروني', value: digitalScore },
      { label: 'ترشيد المصروف', value: costControlScore },
      { label: 'نشاط العقود', value: volumeScore }
    ];

    return '<div class="fn-charts-grid">'

      /* كارت 1: المخطط المساحي والخطي الانسيابي (Area & Line Chart) - عرض كامل */
      + '<div class="fn-chart-card full-width">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">📈 مسار وحركة التدفق المالي اليومي (المخطط المساحي والخطي)</div>'
      + '    <div class="fn-chart-subtitle">'
      + '      <span style="color:#10b981;font-weight:700">● المقبوضات (مساحي انسيابي)</span> &nbsp;&nbsp; '
      + '      <span style="color:#ef4444;font-weight:700">┈ المصروفات (خطي منقط)</span>'
      + '    </div>'
      + '  </div>'
      + '  <div style="direction:ltr;overflow-x:auto">'
      +      renderSvgAreaLineChart(dailyData)
      + '  </div>'
      + '</div>'

      /* كارت 2: شلال التدفق المالي (Waterfall Chart) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🌊 شلال التدفق المالي (Waterfall Chart)</div>'
      + '    <div class="fn-chart-subtitle">تتبع خصم المصروفات وصولاً للصافي</div>'
      + '  </div>'
      + '  <div style="direction:ltr;padding-top:6px">'
      +      renderSvgWaterfallChart(analytics.totalIn, operationalOut, discountsOut, analytics.net)
      + '  </div>'
      + '</div>'

      /* كارت 3: مؤشر كفاءة التحصيل والربحية (Gauge Chart) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">⏱️ مؤشر كفاءة التحصيل والربحية (Gauge Chart)</div>'
      + '    <div class="fn-chart-subtitle">هامش الصافي من إجمالي المقبوض</div>'
      + '  </div>'
      + '  <div style="padding-top:6px">'
      +      renderSvgGaugeChart(marginPct)
      + '  </div>'
      + '</div>'

      /* كارت 4: المخطط الحلقي لدورة العقود (Doughnut Chart) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🍩 دورة العقود والعمليات (Doughnut Chart)</div>'
      + '    <div class="fn-chart-subtitle">' + num(analytics.totalMoves) + ' حركة مسجلة</div>'
      + '  </div>'
      +      renderSvgDoughnutChart(doughnutSlices, analytics.totalMoves)
      + '</div>'

      /* كارت 5: أعلى الفروع تحقيقاً للإيرادات (Bar Chart) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🏢 ترتيب الفروع إيراداً (مخطط الأشرطة - Bar Chart)</div>'
      + '    <button type="button" class="fn-chart-tab-pill" data-fn-tab="branches" title="فتح المقارنات الشاملة بين الفروع">⚖️ مقارنة الفروع المتقدمة</button>'
      + '  </div>'
      + '  <div class="fn-progress-list">'
      +      branchList.map(function (b, idx) {
               var rankClass = idx === 0 ? 'fn-rank-1' : (idx === 1 ? 'fn-rank-2' : (idx === 2 ? 'fn-rank-3' : ''));
               return '<div class="fn-prog-row">'
                 + '<div class="fn-prog-label">'
                 + '  <span>'
                 + '    <span class="fn-rank-badge ' + rankClass + '">#' + (idx + 1) + '</span> '
                 + '    <button type="button" class="fn-branch-btn" data-branch="' + esc(b.name) + '" title="عرض كارت تفاصيل الفرع">📍 ' + esc(b.name) + '</button>'
                 + '  </span>'
                 + '  <b>' + cur(b.in) + ' <small style="color:var(--muted)">(' + b.pct + '%)</small></b>'
                 + '</div>'
                 + '<div class="fn-prog-track"><div class="fn-prog-bar" style="width:' + b.pct + '%;background:linear-gradient(90deg,#10b981,#059669)"></div></div>'
                 + '</div>';
             }).join('')
      + '  </div>'
      + '</div>'

      /* كارت 6: رادار التوازن المالي والتشغيلي (Radar Chart) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🕸️ رادار التوازن المالي والتشغيلي (Radar Chart)</div>'
      + '    <div class="fn-chart-subtitle">تقييم خماسي الأبعاد لكفاءة العمليات</div>'
      + '  </div>'
      +      renderSvgRadarChart(radarMetrics)
      + '</div>'

      + '</div>';
  }

  /* ─── كارت تفاصيل الفرع المنبثق (Modal) ─── */
  function buildBranchModalHtml(branchName, store) {
    if (!branchName) return '';
    var branchRows = getAllRows(store, branchName);
    if (!branchRows.length) return '';

    var analytics = analyzeContracts(branchRows);
    var allCompanyRows = getAllRows(store, '');
    var companyTotalIn = sumField(allCompanyRows, F_IN) || 1;
    var sharePct = ((analytics.totalIn / companyTotalIn) * 100).toFixed(1);

    var byMethod = groupBy(branchRows, function (r) { return String(r[F_PAYMETHOD] || '').trim() || 'غير محدد'; });
    var methodsList = sortedKeys(byMethod).map(function (m) {
      var rows = byMethod[m];
      var mIn = sumField(rows, F_IN);
      var pct = analytics.totalIn > 0 ? Math.round((mIn / analytics.totalIn) * 100) : 0;
      return { name: m, in: mIn, count: rows.length, pct: pct };
    }).sort(function (a, b) { return b.in - a.in; });

    var byPlate = groupBy(branchRows, function (r) { return normPlate(r[F_PLATE]); });
    var carsList = Object.keys(byPlate).filter(Boolean).map(function (p) {
      var rList = byPlate[p];
      var pIn = sumField(rList, F_IN);
      var pOut = sumField(rList, F_OUT);
      var plateStr = rList[0][F_PLATE] || p;
      return { plate: plateStr, in: pIn, out: pOut, count: rList.length };
    }).sort(function (a, b) { return b.in - a.in; }).slice(0, 5);

    var byUser = groupBy(branchRows, function (r) { return String(r[F_USER] || '').trim() || 'غير محدد'; });
    var usersList = sortedKeys(byUser).map(function (u) {
      var uRows = byUser[u];
      return { name: u, count: uRows.length, in: sumField(uRows, F_IN) };
    }).sort(function (a, b) { return b.in - a.in; });

    return '<div class="fn-modal-backdrop" id="fn-branch-modal-backdrop">'
      + '<div class="fn-modal-box">'
      + '  <button type="button" class="fn-modal-close" id="fn-modal-close-btn" title="إغلاق">✕</button>'
      + '  <div class="fn-modal-header">'
      + '    <h3>📍 تحليل الفرع: ' + esc(branchName) + '</h3>'
      + '    <p>مؤشرات الأداء المالي والعقود وطرق الدفع لهذا الفرع بناءً على شيتات اليومية المرفوعة</p>'
      + '  </div>'
      + '  <div class="fn-modal-grid">'
      + '    <div class="fn-modal-stat"><div class="fn-modal-stat-title">إجمالي المقبوضات</div><div class="fn-modal-stat-val" style="color:var(--green,#10b981)">' + cur(analytics.totalIn) + '</div></div>'
      + '    <div class="fn-modal-stat"><div class="fn-modal-stat-title">إجمالي المصروفات</div><div class="fn-modal-stat-val" style="color:var(--red,#ef4444)">' + cur(analytics.totalOut) + '</div></div>'
      + '    <div class="fn-modal-stat"><div class="fn-modal-stat-title">صافي دخل الفرع</div><div class="fn-modal-stat-val" style="color:var(--navy)">' + cur(analytics.net) + '</div></div>'
      + '    <div class="fn-modal-stat"><div class="fn-modal-stat-title">حصة الفرع من إجمالي المنصة</div><div class="fn-modal-stat-val" style="color:#0284c7">' + sharePct + '%</div></div>'
      + '  </div>'
      + '  <div class="fn-pipeline" style="margin-bottom:14px">'
      + '    <div class="fn-pipe-card pipe-open" style="padding:10px 14px"><div class="fn-pipe-head"><span class="fn-pipe-title">عقود جديدة</span><span>📝</span></div><div class="fn-pipe-count" style="font-size:20px">' + num(analytics.opened.count) + '</div><div class="fn-pipe-sub"><span>المقدم:</span> <b>' + cur(analytics.opened.amountIn) + '</b></div></div>'
      + '    <div class="fn-pipe-card pipe-renew" style="padding:10px 14px"><div class="fn-pipe-head"><span class="fn-pipe-title">تمديدات عقود</span><span>🔄</span></div><div class="fn-pipe-count" style="font-size:20px">' + num(analytics.extended.count) + '</div><div class="fn-pipe-sub"><span>الإيراد:</span> <b>' + cur(analytics.extended.amountIn) + '</b></div></div>'
      + '    <div class="fn-pipe-card pipe-close" style="padding:10px 14px"><div class="fn-pipe-head"><span class="fn-pipe-title">عقود مغلقة وتصفية</span><span>🏁</span></div><div class="fn-pipe-count" style="font-size:20px">' + num(analytics.closed.count) + '</div><div class="fn-pipe-sub"><span>التحصيل:</span> <b>' + cur(analytics.closed.amountIn) + '</b></div></div>'
      + '  </div>'
      + '  <div class="fn-modal-section">'
      + '    <h4>💳 توزيع طرق الدفع في ' + esc(branchName) + '</h4>'
      + '    <div class="fn-progress-list">'
      +        methodsList.map(function (m) {
                 return '<div class="fn-prog-row">'
                   + '<div class="fn-prog-label"><span>' + esc(m.name) + ' (' + num(m.count) + ' حركة)</span><b>' + cur(m.in) + ' (' + m.pct + '%)</b></div>'
                   + '<div class="fn-prog-track"><div class="fn-prog-bar" style="width:' + m.pct + '%;background:linear-gradient(90deg,#0ea5e9,#0284c7)"></div></div>'
                   + '</div>';
               }).join('')
      + '    </div>'
      + '  </div>'
      + '  <div class="fn-modal-section">'
      + '    <h4>🚗 أعلى السيارات إيراداً بهذا الفرع</h4>'
      + '    <div class="rp-scroll" style="max-height:180px">'
      + '      <table class="rp-table"><thead><tr><th>رقم اللوحة</th><th>عدد الحركات</th><th>إجمالي المقبوض</th><th>الصافي</th></tr></thead><tbody>'
      +        carsList.map(function (c) {
                 return '<tr><td><b>' + esc(c.plate) + '</b></td><td>' + num(c.count) + '</td><td style="color:var(--green,#10b981);font-weight:700">' + cur(c.in) + '</td><td>' + cur(c.in - c.out) + '</td></tr>';
               }).join('')
      + '      </tbody></table>'
      + '    </div>'
      + '  </div>'
      + '  <div class="fn-modal-section">'
      + '    <h4>👤 تحصيل الموظفين والمحصلين بالفرع</h4>'
      + '    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'
      +        usersList.map(function (u) {
                 return '<span class="fn-date-tag" style="padding:5px 10px;font-size:12px">👤 <b>' + esc(u.name) + '</b>: ' + cur(u.in) + ' (' + num(u.count) + ' حركة)</span>';
               }).join('')
      + '    </div>'
      + '  </div>'
      + '  <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-top:14px;border-top:1px solid var(--line)">'
      + '    <button type="button" class="rp-btn" id="fn-modal-filter-btn" style="background:var(--navy);color:#fff">🔍 فلترة المنصة كاملة على هذا الفرع</button>'
      + '    <button type="button" class="rp-btn" id="fn-modal-export-btn">📥 تصدير كشف الفرع Excel</button>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  /* ─── شريط الفلاتر الموحد (الفرع + الأيام والشهور) ─── */
  function buildFiltersBar(store, platformBranches) {
    var dates = Object.keys(store).sort().reverse();
    var branchOptions = ['<option value="">جميع الفروع</option>'];
    platformBranches.forEach(function (b) {
      branchOptions.push('<option value="' + esc(b) + '"' + (state.branch === b ? ' selected' : '') + '>' + esc(b) + '</option>');
    });

    var monthsMap = {};
    dates.forEach(function (d) {
      var mo = d.slice(0, 7);
      monthsMap[mo] = true;
    });
    var months = Object.keys(monthsMap).sort().reverse();

    var periodOptions = [
      '<option value="all"' + (state.period === 'all' ? ' selected' : '') + '>📅 كل الفترات المحفوظة</option>',
      (dates[0] ? '<option value="latest"' + (state.period === 'latest' ? ' selected' : '') + '>⚡ أحدث يوم مرفوع (' + esc(dates[0]) + ')</option>' : '')
    ];

    if (months.length > 0) {
      periodOptions.push('<optgroup label="── حسب الشهر ──">');
      months.forEach(function (m) {
        periodOptions.push('<option value="month:' + esc(m) + '"' + (state.period === 'month:' + m ? ' selected' : '') + '>🗓️ شهر ' + esc(formatMonthName(m)) + '</option>');
      });
      periodOptions.push('</optgroup>');
    }

    if (dates.length > 0) {
      periodOptions.push('<optgroup label="── حسب يوم محدد ──">');
      dates.forEach(function (d) {
        periodOptions.push('<option value="date:' + esc(d) + '"' + (state.period === 'date:' + d ? ' selected' : '') + '>📆 يوم ' + esc(d) + '</option>');
      });
      periodOptions.push('</optgroup>');
    }

    return '<div class="fn-filters-bar">'
      + '<div class="fn-filter-item">'
      + '  <label for="fn-branch-select">🏢 الفرع:</label>'
      + '  <select id="fn-branch-select">' + branchOptions.join('') + '</select>'
      + '</div>'
      + '<div class="fn-filter-item">'
      + '  <label for="fn-period-select">📅 الفترة (أيام / شهور):</label>'
      + '  <select id="fn-period-select">' + periodOptions.join('') + '</select>'
      + '</div>'
      + '<div class="fn-filter-item fn-search-item">'
      + '  <label for="fn-search-input">🔍 بحث سريع:</label>'
      + '  <input type="search" id="fn-search-input" placeholder="اللوحة، العميل، العقد، المستخدم…" value="' + esc(state.search) + '">'
      + '</div>'
      + (state.branch || (state.period && state.period !== 'all') || state.search ? '<button type="button" class="rp-btn" id="fn-reset-filters-btn" style="font-size:11px;padding:4px 9px">✕ تفريغ الفلاتر</button>' : '')
      + '<div class="fn-filter-item fn-compare-item">'
      + '<label style="font-size:11px;font-weight:700;color:var(--muted)">مقارنة:</label>'
      + '<button type="button" class="rp-btn cmp-btn' + (state.compareMode === 'branches' ? ' active' : '') + '" id="fn-cmp-branches">فرعين</button>'
      + '<button type="button" class="rp-btn cmp-btn' + (state.compareMode === 'periods' ? ' active' : '') + '" id="fn-cmp-periods">فترتين</button>'
      + '<button type="button" class="rp-btn cmp-btn' + (state.compareMode === 'none' ? ' active' : '') + '" id="fn-cmp-none">إيقاف</button>'
      + '</div>'
      + '</div>';
  }

  /* شريط اختيار الفرعين للمقارنة */
  function buildBranchPickers(store) {
    var branches = getPlatformBranches();
    var opts = ['<option value="">اختر فرعاً</option>'];
    branches.forEach(function (b) {
      opts.push('<option value="' + esc(b) + '"' + (state.compareBranchA === b ? ' selected' : '') + '>' + esc(b) + '</option>');
    });
    var optsB = ['<option value="">اختر فرعاً</option>'];
    branches.forEach(function (b) {
      optsB.push('<option value="' + esc(b) + '"' + (state.compareBranchB === b ? ' selected' : '') + '>' + esc(b) + '</option>');
    });
    return '<div class="fn-compare-bar" style="margin-top:8px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">'
      + '<div style="flex:1;min-width:150px"><label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">الفرع الأول</label><select id="fn-cmp-branch-a" style="width:100%">' + opts.join('') + '</select></div>'
      + '<div style="flex:1;min-width:150px"><label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">الفرع الثاني</label><select id="fn-cmp-branch-b" style="width:100%">' + optsB.join('') + '</select></div>'
      + '<button type="button" class="rp-btn" id="fn-cmp-apply-branches" style="height:36px">تطبيق المقارنة</button>'
      + '</div>'
      + '</div>';
  }

  /* شريط اختيار الفترتين للمقارنة */
  function buildPeriodPickers(store) {
    var dates = Object.keys(store).sort().reverse();
    var monthsMap = {};
    dates.forEach(function (d) { monthsMap[d.slice(0, 7)] = true; });
    var months = Object.keys(monthsMap).sort().reverse();

    function buildPeriodOptions(selected) {
      var opts = ['<option value="all">الكل</option>', '<option value="latest">أحدث يوم</option>'];
      months.forEach(function (m) { opts.push('<option value="month:' + m + '">' + (selected === ('month:' + m) ? 'selected ' : '') + 'شهر ' + formatMonthName(m) + '</option>'); });
      dates.forEach(function (d) { opts.push('<option value="date:' + d + '">' + (selected === ('date:' + d) ? 'selected ' : '') + 'يوم ' + d + '</option>'); });
      return opts.join('');
    }

    return '<div class="fn-compare-bar" style="margin-top:8px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">'
      + '<div style="flex:1;min-width:180px"><label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">الفترة الأولى</label><select id="fn-cmp-period-a" style="width:100%">' + buildPeriodOptions(state.comparePeriodA || 'all') + '</select></div>'
      + '<div style="flex:1;min-width:180px"><label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">الفترة الثانية</label><select id="fn-cmp-period-b" style="width:100%">' + buildPeriodOptions(state.comparePeriodB || 'all') + '</select></div>'
      + '<button type="button" class="rp-btn" id="fn-cmp-apply-periods" style="height:36px">تطبيق المقارنة</button>'
      + '</div>'
      + '</div>';
  }

  /* ===== مقارنة فرعين ===== */
  function buildBranchesComparison(store) {
    var a = state.compareBranchA || '';
    var b = state.compareBranchB || '';
    if (!a || !b || a === b) {
      return { kpis: [], sections: [{ title: 'اختر فرعين مختلفين للمقارنة من شريط الفلاتر أعلاه', headers: [], rows: [] }] };
    }
    var ra = getAllRows(store, a, state.period);
    var rb = getAllRows(store, b, state.period);
    var aa = analyzeContracts(ra);
    var ab = analyzeContracts(rb);
    var raIn = sumField(ra, F_IN), raOut = sumField(ra, F_OUT);
    var rbIn = sumField(rb, F_IN), rbOut = sumField(rb, F_OUT);
    var rows = [
      [esc(a), num(ra.length), cur(raIn), cur(raOut), cur(raIn - raOut), num(aa.opened.count), num(aa.closed.count)],
      [esc(b), num(rb.length), cur(rbIn), cur(rbOut), cur(rbIn - rbOut), num(ab.opened.count), num(ab.closed.count)]
    ];
    var diffIn = raIn - rbIn, diffOut = raOut - rbOut, diffNet = (raIn - raOut) - (rbIn - rbOut);
    var winner = diffNet > 0 ? a : (diffNet < 0 ? b : 'تساوي');
    return {
      kpis: [
        { label: 'الفائز بصافي الدخل', value: esc(winner), cls: diffNet >= 0 ? 'kpi-green' : 'kpi-red' },
        { label: 'الفرق في الصافي', value: cur(Math.abs(diffNet)), cls: '' },
        { label: 'إجمالي قبض ' + esc(a), value: cur(raIn), cls: 'kpi-green' },
        { label: 'إجمالي قبض ' + esc(b), value: cur(rbIn), cls: 'kpi-green' },
        { label: 'إجمالي صرف ' + esc(a), value: cur(raOut), cls: 'kpi-red' },
        { label: 'إجمالي صرف ' + esc(b), value: cur(rbOut), cls: 'kpi-red' }
      ],
      sections: [{
        title: 'مقارنة مباشرة بين ' + esc(a) + ' و ' + esc(b) + ' (الفترة: ' + periodLabel(state.period) + ')',
        headers: ['الفرع', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي', 'عقود جديدة', 'عقود مغلقة'],
        rows: rows,
        foot: ['الفرق', '—', cur(diffIn), cur(diffOut), cur(diffNet), '—', '—']
      }]
    };
  }

  /* ===== مقارنة نفس الفرع في فترتين مختلفتين ===== */
  function buildPeriodComparison(store, branch) {
    var pA = state.comparePeriodA || 'all';
    var pB = state.comparePeriodB || 'all';
    if (!pA || !pB || pA === pB) {
      return { kpis: [], sections: [{ title: 'اختر فترتين مختلفتين للمقارنة من شريط الفلاتر أعلاه', headers: [], rows: [] }] };
    }
    var ra = getAllRows(store, branch, pA);
    var rb = getAllRows(store, branch, pB);
    var aa = analyzeContracts(ra);
    var ab = analyzeContracts(rb);
    var raIn = sumField(ra, F_IN), raOut = sumField(ra, F_OUT);
    var rbIn = sumField(rb, F_IN), rbOut = sumField(rb, F_OUT);
    var rows = [
      [periodLabel(pA), num(ra.length), cur(raIn), cur(raOut), cur(raIn - raOut), num(aa.opened.count), num(aa.closed.count)],
      [periodLabel(pB), num(rb.length), cur(rbIn), cur(rbOut), cur(rbIn - rbOut), num(ab.opened.count), num(ab.closed.count)]
    ];
    var diffNet = (raIn - raOut) - (rbIn - rbOut);
    var winner = diffNet > 0 ? periodLabel(pA) : (diffNet < 0 ? periodLabel(pB) : 'تساوي');
    return {
      kpis: [
        { label: 'الفترة الأعلى ربحاً', value: esc(winner), cls: diffNet >= 0 ? 'kpi-green' : 'kpi-red' },
        { label: 'الفرق في الصافي', value: cur(Math.abs(diffNet)), cls: '' },
        { label: 'قبض ' + esc(periodLabel(pA)), value: cur(raIn), cls: 'kpi-green' },
        { label: 'قبض ' + esc(periodLabel(pB)), value: cur(rbIn), cls: 'kpi-green' },
        { label: 'صرف ' + esc(periodLabel(pA)), value: cur(raOut), cls: 'kpi-red' },
        { label: 'صرف ' + esc(periodLabel(pB)), value: cur(rbOut), cls: 'kpi-red' }
      ],
      sections: [{
        title: 'مقارنة ' + esc(branch) + ' بين ' + esc(periodLabel(pA)) + ' و ' + esc(periodLabel(pB)),
        headers: ['الفترة', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي', 'عقود جديدة', 'عقود مغلقة'],
        rows: rows,
        foot: ['الفرق', '—', cur(raIn - rbIn), cur(raOut - rbOut), cur(diffNet), '—', '—']
      }]
    };
  }

  function periodLabel(p) {
    if (!p || p === 'all') return 'الكل';
    if (p === 'latest') return 'أحدث يوم';
    if (p.indexOf('month:') === 0) return 'شهر ' + formatMonthName(p.slice(6));
    if (p.indexOf('date:') === 0) return 'يوم ' + p.slice(5);
    return p;
  }

  /* ─── تقرير دورة العقود (عقود مفتوحة / تمديدات / تصفية) ─── */
  function buildContractsReport(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter, state.period);
    var analytics = analyzeContracts(allRows);

    function formatContractRows(list) {
      return list.map(function (r) {
        var branchBtn = '<button type="button" class="fn-branch-btn" data-branch="' + esc(r[F_BRANCH]) + '">📍 ' + esc(r[F_BRANCH] || '—') + '</button>';
        return [
          esc(r[F_CONTRACT] || '—'),
          esc(r[F_DATE] ? String(r[F_DATE]).slice(0, 10) : '—'),
          branchBtn,
          esc(r[F_PLATE] || '—'),
          esc(r[F_CLIENT] || '—'),
          esc(r[F_MOVEMENT] || '—'),
          cur(r[F_IN]),
          esc(r[F_PAYMETHOD] || '—'),
          esc(r[F_USER] || '—')
        ];
      });
    }

    var totalOpenIn = sumField(analytics.opened.rows, F_IN);
    var totalExtIn = sumField(analytics.extended.rows, F_IN);
    var totalCloseIn = sumField(analytics.closed.rows, F_IN);

    return {
      pipelineHtml: buildPipelineCards(analytics),
      kpis: [
        { label: 'عقود جديدة (مفتوحة)', value: num(analytics.opened.count) + ' (' + cur(totalOpenIn) + ')',   cls: 'kpi-blue'  },
        { label: 'تمديدات عقود',        value: num(analytics.extended.count) + ' (' + cur(totalExtIn) + ')', cls: 'kpi-green' },
        { label: 'عقود مصفاة ومغلقة',   value: num(analytics.closed.count) + ' (' + cur(totalCloseIn) + ')',  cls: 'kpi-amber' }
      ],
      sections: [
        {
          title: '📝 كشف العقود الجديدة والمفتوحة (' + num(analytics.opened.count) + ' عقد)',
          headers: ['رقم العقد', 'التاريخ', 'الفرع', 'رقم اللوحة', 'العميل', 'الحركة', 'المبلغ المحصل', 'طريقة الدفع', 'المحصل'],
          rows: formatContractRows(analytics.opened.rows),
          foot: ['الإجمالي', '—', '—', '—', '—', '—', cur(totalOpenIn), '—', '—']
        },
        {
          title: '🔄 كشف تمديدات العقود (' + num(analytics.extended.count) + ' تمديد)',
          headers: ['رقم العقد', 'التاريخ', 'الفرع', 'رقم اللوحة', 'العميل', 'الحركة', 'المبلغ المحصل', 'طريقة الدفع', 'المحصل'],
          rows: formatContractRows(analytics.extended.rows),
          foot: ['الإجمالي', '—', '—', '—', '—', '—', cur(totalExtIn), '—', '—']
        },
        {
          title: '🏁 كشف العقود المصفاة والمغلقة (' + num(analytics.closed.count) + ' عقد)',
          headers: ['رقم العقد', 'التاريخ', 'الفرع', 'رقم اللوحة', 'العميل', 'الحركة', 'المبلغ المحصل', 'طريقة الدفع', 'المحصل'],
          rows: formatContractRows(analytics.closed.rows),
          foot: ['الإجمالي', '—', '—', '—', '—', '—', cur(totalCloseIn), '—', '—']
        }
      ]
    };
  }

  /* ─── بناء التقارير ─── */

  /* 1. الملخص اليومي والرسوم البيانية */
  function buildSummary(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter, state.period);
    var analytics = analyzeContracts(allRows);
    var pipelineHtml = buildPipelineCards(analytics);
    var chartsHtml = buildChartsGrid(allRows, store);

    var dates = Object.keys(store).sort().reverse();
    var p = state.period;
    var filteredDates = dates;
    if (p === 'latest' && dates.length > 0) {
      filteredDates = [dates[0]];
    } else if (p && p.indexOf('month:') === 0) {
      var mo = p.slice(6);
      filteredDates = dates.filter(function (d) { return d.slice(0, 7) === mo; });
    } else if (p && p.indexOf('date:') === 0) {
      var dt = p.slice(5);
      filteredDates = dates.filter(function (d) { return d === dt; });
    }

    var totalIn  = analytics.totalIn;
    var totalOut = analytics.totalOut;
    var net      = analytics.net;

    var rows = filteredDates.map(function (d) {
      var dr = (store[d] || []).filter(function (r) {
        return !branchFilter || String(r[F_BRANCH] || '').trim() === branchFilter;
      });
      var di = sumField(dr, F_IN);
      var do_ = sumField(dr, F_OUT);
      var dateBtn = '<button type="button" class="fn-pick-date" data-date="' + esc(d) + '" style="background:none;border:none;cursor:pointer;font-weight:700;color:var(--navy);text-decoration:underline">📅 ' + esc(d) + '</button>';
      return [dateBtn, num(dr.length), cur(di), cur(do_), cur(di - do_)];
    });

    var kpis = [
      { label: 'إجمالي المقبوضات', value: cur(totalIn),       cls: 'kpi-green' },
      { label: 'إجمالي المصروفات', value: cur(totalOut),      cls: 'kpi-red'   },
      { label: 'صافي الدخل',       value: cur(net),           cls: net >= 0 ? 'kpi-blue' : 'kpi-red' },
      { label: 'عدد الحركات',      value: num(allRows.length),cls: '' },
      { label: 'عقود جديدة (مفتوحة)', value: num(analytics.opened.count), cls: 'kpi-blue' },
      { label: 'تمديدات العقود',   value: num(analytics.extended.count), cls: 'kpi-green' }
    ];

    var periodLabel = state.period === 'all'
      ? 'جميع الفترات'
      : (state.period === 'latest' ? 'أحدث يوم' : (state.period.indexOf('month:') === 0 ? 'شهر ' + formatMonthName(state.period.slice(6)) : 'يوم ' + state.period.slice(5)));

    return {
      pipelineHtml: pipelineHtml,
      chartsHtml: chartsHtml,
      kpis: kpis,
      sections: [{
        title: 'سجل اليوميات المرفوعة — ' + periodLabel + (branchFilter ? ' (فرع: ' + branchFilter + ')' : ''),
        headers: ['التاريخ (اضغط للفلترة)', 'عدد الحركات', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي'],
        rows: rows,
        foot: ['الإجمالي العام', num(allRows.length), cur(totalIn), cur(totalOut), cur(net)]
      }],
      warningHtml: net < 0 ? '<div class="fn-warning-box"><strong>⚠️ انتبه:</strong> المصروفات (' + cur(totalOut) + ') أعلى من الإيرادات (' + cur(totalIn) + ') بـ ' + cur(Math.abs(net)) + ' في هذه الفترة. يرجى مراجعة السندات الصادرة.</div>' : ''
    };
  }

  /* ─── دوال مقارنات الفروع والرسوم البيانية المتقدمة (Branch Comparisons) ─── */

  /* 1. المخطط العمودي المقارن للفروع (Grouped Column Chart) */
  function renderBranchGroupedColumnChart(branchesList) {
    if (!branchesList || !branchesList.length) {
      return '<div class="rp-muted" style="text-align:center;padding:30px">لا توجد بيانات كافية</div>';
    }
    var list = branchesList.slice(0, 8);
    var maxVal = list.reduce(function (mx, b) { return Math.max(mx, b.in, b.out, Math.max(0, b.net)); }, 1);
    if (maxVal <= 0) maxVal = 1;

    var W = 680, H = 220, padL = 45, padR = 25, padT = 25, padB = 40;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var baseY = padT + plotH;

    var grpW = plotW / list.length;
    var barW = Math.min(16, Math.max(8, (grpW - 14) / 3));

    var gridLines = [0.25, 0.5, 0.75, 1.0].map(function (r) {
      var gy = (baseY - r * plotH).toFixed(1);
      var val = (Math.round((r * maxVal) / 100) / 10) + 'k';
      return '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--line,#e2e8f0)" stroke-dasharray="3 3" stroke-width="1" opacity="0.6"/>'
        + '<text x="' + (padL - 6) + '" y="' + (Number(gy) + 3) + '" text-anchor="end" font-size="9" fill="var(--muted,#64748b)" font-weight="600">' + val + '</text>';
    }).join('');

    var groupsHtml = list.map(function (b, idx) {
      var gx = padL + idx * grpW + (grpW - barW * 3 - 6) / 2;
      var hIn = Math.max(4, Math.round((b.in / maxVal) * plotH));
      var hOut = Math.max(3, Math.round((b.out / maxVal) * plotH));
      var hNet = Math.max(3, Math.round((Math.max(0, b.net) / maxVal) * plotH));

      var yIn = baseY - hIn;
      var yOut = baseY - hOut;
      var yNet = baseY - hNet;

      var nameShort = b.name.length > 12 ? b.name.slice(0, 10) + '..' : b.name;

      return '<g class="fn-svg-bar-grp">'
        + '<title>' + esc(b.name) + ' | مقبوض: ' + cur(b.in) + ' | مصروف: ' + cur(b.out) + ' | صافي: ' + cur(b.net) + '</title>'
        + '<rect x="' + gx.toFixed(1) + '" y="' + yIn.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hIn.toFixed(1) + '" rx="3" fill="#10b981" />'
        + '<rect x="' + (gx + barW + 2).toFixed(1) + '" y="' + yOut.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hOut.toFixed(1) + '" rx="3" fill="#ef4444" />'
        + '<rect x="' + (gx + (barW + 2) * 2).toFixed(1) + '" y="' + yNet.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hNet.toFixed(1) + '" rx="3" fill="#0284c7" />'
        + '<text x="' + (gx + barW / 2).toFixed(1) + '" y="' + (yIn - 4).toFixed(1) + '" text-anchor="middle" font-size="8.5" font-weight="800" fill="#059669">' + (b.in >= 1000 ? Math.round(b.in / 1000) + 'k' : b.in) + '</text>'
        + '<text x="' + (gx + barW * 1.5 + 2).toFixed(1) + '" y="' + (baseY + 16) + '" text-anchor="middle" font-size="9" font-weight="700" fill="var(--ink,#1e293b)">' + esc(nameShort) + '</text>'
        + '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:220px;display:block">'
      + gridLines
      + '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY + '" stroke="var(--line,#e2e8f0)" stroke-width="1.5"/>'
      + groupsHtml
      + '</svg>';
  }

  /* 2. المخطط الحلقي للحصص السوقية للفروع (Doughnut Market Share) */
  function renderBranchMarketShareDoughnut(branchesList, totalIn) {
    if (!branchesList || !branchesList.length) return '';
    var colors = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
    var top5 = branchesList.slice(0, 5);
    var sumTop5 = top5.reduce(function (s, b) { return s + b.in; }, 0);
    var otherIn = Math.max(0, totalIn - sumTop5);

    var slices = top5.map(function (b, i) {
      var pct = totalIn > 0 ? Math.round((b.in / totalIn) * 100) : 0;
      return { name: b.name, in: b.in, pct: pct, color: colors[i] };
    });

    if (otherIn > 0 && branchesList.length > 5) {
      var otherPct = totalIn > 0 ? Math.round((otherIn / totalIn) * 100) : 0;
      slices.push({ name: 'باقي الفروع (' + (branchesList.length - 5) + ')', in: otherIn, pct: otherPct, color: colors[5] });
    }

    var cx = 85, cy = 85, r = 58, strokeW = 22;
    var circum = 2 * Math.PI * r;
    var offset = 0;

    var circlesHtml = slices.map(function (s) {
      var len = (s.pct / 100) * circum;
      var circle = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="' + strokeW + '" '
        + 'stroke-dasharray="' + len.toFixed(1) + ' ' + (circum - len).toFixed(1) + '" '
        + 'stroke-dashoffset="' + (-offset).toFixed(1) + '" '
        + 'transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(s.name) + ': ' + cur(s.in) + ' (' + s.pct + '%)</title></circle>';
      offset += len;
      return circle;
    }).join('');

    var legendHtml = slices.map(function (s) {
      return '<div class="fn-doughnut-legend-item">'
        + '<span class="fn-doughnut-dot" style="background:' + s.color + '"></span>'
        + '<span class="fn-doughnut-label">' + esc(s.name) + '</span>'
        + '<b class="fn-doughnut-val">' + cur(s.in) + ' <small>(' + s.pct + '%)</small></b>'
        + '</div>';
    }).join('');

    return '<div class="fn-doughnut-container">'
      + '<div class="fn-doughnut-svg-wrap">'
      + '  <svg viewBox="0 0 170 170" style="width:150px;height:150px;display:block">'
      + '    <circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line,#e2e8f0)" stroke-width="' + strokeW + '"/>'
      +      circlesHtml
      + '    <text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" font-size="16" font-weight="900" fill="var(--ink,#0f172a)">' + (totalIn >= 1000 ? Math.round(totalIn / 1000) + 'k' : num(totalIn)) + '</text>'
      + '    <text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted,#64748b)">إجمالي الدخل</text>'
      + '  </svg>'
      + '</div>'
      + '<div class="fn-doughnut-legend">' + legendHtml + '</div>'
      + '</div>';
  }

  /* 3. مقارنة هيكل ونشاط العقود بين الفروع (Operational Mix) */
  function renderBranchOperationalMix(branchesList) {
    var topList = branchesList.slice(0, 6);
    return '<div class="fn-progress-list">'
      + topList.map(function (b) {
          var tot = (b.opened + b.extended + b.closed) || 1;
          var extPct = Math.round((b.extended / tot) * 100);
          var openPct = Math.round((b.opened / tot) * 100);
          var closePct = Math.max(0, 100 - extPct - openPct);
          return '<div class="fn-prog-row">'
            + '<div class="fn-prog-label">'
            + '  <button type="button" class="fn-branch-btn" data-branch="' + esc(b.name) + '">📍 ' + esc(b.name) + '</button>'
            + '  <span>'
            + '    <b style="color:#10b981">🔄 ' + b.extended + '</b> &nbsp;|&nbsp; '
            + '    <b style="color:#0ea5e9">📝 ' + b.opened + '</b> &nbsp;|&nbsp; '
            + '    <b style="color:#f59e0b">🏁 ' + b.closed + '</b>'
            + '  </span>'
            + '</div>'
            + '<div class="fn-prog-track" style="height:10px" title="تمديد: ' + extPct + '% | جديد: ' + openPct + '% | تصفية: ' + closePct + '%">'
            + '  <div style="width:' + extPct + '%;background:#10b981"></div>'
            + '  <div style="width:' + openPct + '%;background:#0ea5e9"></div>'
            + '  <div style="width:' + closePct + '%;background:#f59e0b"></div>'
            + '</div>'
            + '</div>';
        }).join('')
      + '<div style="display:flex;gap:12px;margin-top:10px;font-size:11px;font-weight:700;color:var(--muted);justify-content:center">'
      + '  <span style="color:#10b981">■ تمديدات عقود</span>'
      + '  <span style="color:#0ea5e9">■ عقود جديدة ومقدمات</span>'
      + '  <span style="color:#f59e0b">■ تصفيات وإغلاق</span>'
      + '</div>'
      + '</div>';
  }

  /* 4. أداة المقارنة المباشرة رأس برأس (Head-to-Head Comparison) */
  function renderHeadToHead(bA, bB, allBranches) {
    if (!bA || !bB) {
      return '<div class="rp-muted" style="text-align:center;padding:20px">يرجى اختيار فرعين للمقارنة</div>';
    }

    var metrics = [
      { label: 'إجمالي المقبوضات', valA: bA.in, valB: bB.in, strA: cur(bA.in), strB: cur(bB.in), higherBetter: true },
      { label: 'إجمالي المصروفات', valA: bA.out, valB: bB.out, strA: cur(bA.out), strB: cur(bB.out), higherBetter: false },
      { label: 'صافي الربح الفعلي', valA: bA.net, valB: bB.net, strA: cur(bA.net), strB: cur(bB.net), higherBetter: true },
      { label: 'نسبة هامش الربح', valA: bA.margin, valB: bB.margin, strA: bA.margin.toFixed(1) + '%', strB: bB.margin.toFixed(1) + '%', higherBetter: true },
      { label: 'تمديدات العقود', valA: bA.extended, valB: bB.extended, strA: num(bA.extended) + ' تمديد', strB: num(bB.extended) + ' تمديد', higherBetter: true },
      { label: 'عقود جديدة ومقدمات', valA: bA.opened, valB: bB.opened, strA: num(bA.opened) + ' عقد', strB: num(bB.opened) + ' عقد', higherBetter: true },
      { label: 'إجمالي حركات اليومية', valA: bA.moves, valB: bB.moves, strA: num(bA.moves) + ' حركة', strB: num(bB.moves) + ' حركة', higherBetter: true }
    ];

    var rowsHtml = metrics.map(function (m) {
      var max = Math.max(m.valA, m.valB, 1);
      var pctA = Math.round((Math.max(0, m.valA) / max) * 100);
      var pctB = Math.round((Math.max(0, m.valB) / max) * 100);

      var winA = m.higherBetter ? m.valA > m.valB : m.valA < m.valB;
      var winB = m.higherBetter ? m.valB > m.valA : m.valB < m.valA;

      return '<div class="fn-h2h-row">'
        + '<div class="fn-h2h-side side-a ' + (winA ? 'winner' : '') + '">'
        + '  <span class="fn-h2h-val">' + m.strA + '</span>'
        + (winA ? '<span class="fn-h2h-crown" title="متفوق في هذا المعيار">👑</span>' : '')
        + '</div>'
        + '<div class="fn-h2h-label">' + esc(m.label) + '</div>'
        + '<div class="fn-h2h-side side-b ' + (winB ? 'winner' : '') + '">'
        + (winB ? '<span class="fn-h2h-crown" title="متفوق في هذا المعيار">👑</span>' : '')
        + '  <span class="fn-h2h-val">' + m.strB + '</span>'
        + '</div>'
        + '<div class="fn-h2h-bars">'
        + '  <div class="fn-h2h-bar-track track-a"><div class="fn-h2h-bar-fill fill-a" style="width:' + pctA + '%;background:' + (winA ? '#10b981' : '#94a3b8') + '"></div></div>'
        + '  <div class="fn-h2h-bar-track track-b"><div class="fn-h2h-bar-fill fill-b" style="width:' + pctB + '%;background:' + (winB ? '#0ea5e9' : '#94a3b8') + '"></div></div>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="fn-h2h-card">'
      + '<div class="fn-h2h-header">'
      + '  <div class="fn-h2h-team team-a">'
      + '    <div class="fn-h2h-icon" style="font-size:24px">🏢</div>'
      + '    <div class="fn-h2h-team-name">' + esc(bA.name) + '</div>'
      + '    <div class="fn-h2h-team-sub">إجمالي الدخل: ' + cur(bA.in) + '</div>'
      + '  </div>'
      + '  <div class="fn-h2h-vs-badge">VS</div>'
      + '  <div class="fn-h2h-team team-b">'
      + '    <div class="fn-h2h-icon" style="font-size:24px">🏢</div>'
      + '    <div class="fn-h2h-team-name">' + esc(bB.name) + '</div>'
      + '    <div class="fn-h2h-team-sub">إجمالي الدخل: ' + cur(bB.in) + '</div>'
      + '  </div>'
      + '</div>'
      + '<div class="fn-h2h-list">' + rowsHtml + '</div>'
      + '</div>';
  }

  /* تجميع لوحة رسوم مقارنة الفروع */
  function buildBranchComparisonCharts(branchesStats, store, allRows) {
    if (!branchesStats || !branchesStats.length) return '';

    var totalIn = branchesStats.reduce(function (s, b) { return s + b.in; }, 0) || 1;

    var branchNames = branchesStats.map(function (b) { return b.name; });
    var branchA_name = state.compareBranchA && branchNames.indexOf(state.compareBranchA) >= 0
      ? state.compareBranchA
      : (branchNames[0] || '');
    var branchB_name = state.compareBranchB && branchNames.indexOf(state.compareBranchB) >= 0
      ? state.compareBranchB
      : (branchNames[1] || branchNames[0] || '');

    var bA = branchesStats.find(function (b) { return b.name === branchA_name; }) || branchesStats[0];
    var bB = branchesStats.find(function (b) { return b.name === branchB_name; }) || (branchesStats[1] || branchesStats[0]);

    var optionsA = branchNames.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === branchA_name ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');

    var optionsB = branchNames.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === branchB_name ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');

    return '<div class="fn-charts-grid">'
      /* 1. المخطط العمودي المقارن (Grouped Column Chart) - عرض كامل */
      + '<div class="fn-chart-card full-width">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">📊 المخطط العمودي المقارن للفروع (Grouped Column Chart)</div>'
      + '    <div class="fn-chart-subtitle">'
      + '      <span style="color:#10b981;font-weight:700">■ مقبوضات</span> &nbsp; '
      + '      <span style="color:#ef4444;font-weight:700">■ مصروفات</span> &nbsp; '
      + '      <span style="color:#0284c7;font-weight:700">■ صافي الأرباح</span>'
      + '    </div>'
      + '  </div>'
      + '  <div style="direction:ltr;overflow-x:auto">'
      +      renderBranchGroupedColumnChart(branchesStats)
      + '  </div>'
      + '</div>'

      /* 2. الحصص السوقية للفروع (Doughnut Market Share) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🍩 الحصص السوقية للفروع (Market Share)</div>'
      + '    <div class="fn-chart-subtitle">حصة كل فرع من إجمالي دخل المنصة</div>'
      + '  </div>'
      +      renderBranchMarketShareDoughnut(branchesStats, totalIn)
      + '</div>'

      /* 3. مقارنة هيكل ونشاط العقود (Operational Mix) */
      + '<div class="fn-chart-card">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">🔄 مقارنة نشاط ودورة العمليات بالفروع</div>'
      + '    <div class="fn-chart-subtitle">توزيع العقود: تمديد vs جديد vs تصفية</div>'
      + '  </div>'
      +      renderBranchOperationalMix(branchesStats)
      + '</div>'

      /* 4. أداة المقارنة المباشرة رأس برأس (Head-to-Head Comparison) - عرض كامل */
      + '<div class="fn-chart-card full-width">'
      + '  <div class="fn-chart-head">'
      + '    <div class="fn-chart-title">⚖️ أداة المقارنة المباشرة رأس برأس (اختر فرعين للمقارنة)</div>'
      + '    <div class="fn-h2h-selectors">'
      + '      <label style="font-size:11.5px;font-weight:700;color:var(--muted)">الفرع الأول:</label>'
      + '      <select class="fn-h2h-select" id="fn-h2h-sel-a" title="اختر الفرع الأول">' + optionsA + '</select>'
      + '      <div class="fn-h2h-vs-badge">VS</div>'
      + '      <label style="font-size:11.5px;font-weight:700;color:var(--muted)">الفرع الثاني:</label>'
      + '      <select class="fn-h2h-select" id="fn-h2h-sel-b" title="اختر الفرع الثاني">' + optionsB + '</select>'
      + '    </div>'
      + '  </div>'
      + '  <div id="fn-h2h-container">'
      +      renderHeadToHead(bA, bB, branchesStats)
      + '  </div>'
      + '</div>'

      + '</div>';
  }

  /* 2. تحليل ومقارنة الفروع */
  function buildBranches(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter, state.period);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد بيانات', headers: [], rows: [] }] };

    var byBranch = groupBy(allRows, function (r) { return String(r[F_BRANCH] || '').trim() || 'غير محدد'; });
    var keys = sortedKeys(byBranch);

    var branchesStats = keys.map(function (b) {
      var br = byBranch[b];
      var bi = sumField(br, F_IN);
      var bo = sumField(br, F_OUT);
      var bAnalytics = analyzeContracts(br);
      return {
        name: b,
        in: bi,
        out: bo,
        net: bi - bo,
        margin: bi > 0 ? ((bi - bo) / bi) * 100 : 0,
        moves: br.length,
        opened: bAnalytics.opened.count,
        openedIn: bAnalytics.opened.amountIn,
        extended: bAnalytics.extended.count,
        extendedIn: bAnalytics.extended.amountIn,
        closed: bAnalytics.closed.count,
        closedIn: bAnalytics.closed.amountIn,
        rows: br
      };
    }).sort(function (a, b) { return b.in - a.in; });

    var rows = branchesStats.map(function (b) {
      var branchBtn = '<button type="button" class="fn-branch-btn" data-branch="' + esc(b.name) + '">📍 ' + esc(b.name) + '</button>';
      return [
        branchBtn,
        num(b.moves),
        num(b.opened),
        num(b.extended),
        num(b.closed),
        cur(b.in),
        cur(b.out),
        cur(b.net)
      ];
    });

    var totIn  = sumField(allRows, F_IN);
    var totOut = sumField(allRows, F_OUT);
    var allAnalytics = analyzeContracts(allRows);

    var chartsHtml = buildBranchComparisonCharts(branchesStats, store, allRows);

    return {
      chartsHtml: chartsHtml,
      kpis: [
        { label: 'عدد الفروع النشطة',   value: num(keys.length),              cls: '' },
        { label: 'إجمالي العقود الجديدة',value: num(allAnalytics.opened.count),cls: 'kpi-blue' },
        { label: 'إجمالي التمديدات',    value: num(allAnalytics.extended.count),cls: 'kpi-green' },
        { label: 'إجمالي المقبوضات',     value: cur(totIn),                    cls: 'kpi-green' },
        { label: 'إجمالي المصروفات',    value: cur(totOut),                   cls: 'kpi-red'   },
        { label: 'الصافي',             value: cur(totIn - totOut),           cls: 'kpi-blue'  }
      ],
      sections: [{
        title: 'تحليل أداء الفروع المالية والعقود (اضغط على اسم الفرع لعرض الكارت الشامل)',
        headers: ['الفرع (اضغط للكارت)', 'عدد الحركات', 'عقود جديدة', 'تمديدات', 'عقود مغلقة', 'إجمالي القبض', 'إجمالي الصرف', 'الصافي'],
        rows: rows,
        foot: ['الإجمالي', num(allRows.length), num(allAnalytics.opened.count), num(allAnalytics.extended.count), num(allAnalytics.closed.count), cur(totIn), cur(totOut), cur(totIn - totOut)]
      }]
    };
  }

  /* 4. طرق الدفع والحسابات */
  function buildPayments(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter, state.period);
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
    var allRows = getAllRows(store, branchFilter, state.period);
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
    var allRows = getAllRows(store, branchFilter, state.period);
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

  /* 7. إدارة الحركات اليومية (تعديل / حذف صف فردي) */
  function buildJournalManagement(store, branchFilter) {
    var allRows = getAllRows(store, branchFilter, state.period, state.search);
    if (!allRows.length) return { kpis: [], sections: [{ title: 'لا توجد حركات', headers: [], rows: [] }] };

    var totIn = sumField(allRows, F_IN);
    var totOut = sumField(allRows, F_OUT);

    // rebuild date -> rows map for display
    var byDate = {};
    allRows.forEach(function (r) {
      var d = r[F_DATE] || 'غير محدد';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(r);
    });
    var dates = Object.keys(byDate).sort().reverse();

    var rows = [];
    dates.forEach(function (d) {
      (byDate[d] || []).forEach(function (r, ri) {
        var rowJson = JSON.stringify(r).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        var editBtn = '<button type="button" class="rp-btn rp-btn-small" data-fn-edit-row data-row="' + rowJson + '" style="font-size:11px;padding:3px 7px">تعديل</button>';
        var delBtn  = '<button type="button" class="rp-btn rp-btn-small rp-btn-danger" data-fn-del-row data-row="' + rowJson + '" style="font-size:11px;padding:3px 7px">حذف</button>';
        rows.push([
          '<button type="button" class="fn-pick-date" data-date="' + esc(d) + '" style="background:none;border:none;cursor:pointer;color:var(--navy);font-weight:700;text-decoration:underline">📅 ' + esc(d) + '</button>',
          esc(r[F_SEQ] || '—'),
          esc(r[F_BRANCH] || '—'),
          esc(r[F_CID] || '—'),
          esc(r[F_CLIENT] || '—'),
          esc(r[F_PLATE] || '—'),
          esc(r[F_MOVEMENT] || '—'),
          esc(r[F_OPTYPE] || '—'),
          esc(r[F_CATEGORY] || '—'),
          cur(r[F_IN]),
          cur(r[F_OUT]),
          esc(r[F_DESC] || '—'),
          editBtn + ' ' + delBtn
        ]);
      });
    });

    return {
      kpis: [
        { label: 'إجمالي الحركات', value: num(allRows.length), cls: '' },
        { label: 'إجمالي القبض', value: cur(totIn), cls: 'kpi-green' },
        { label: 'إجمالي الصرف', value: cur(totOut), cls: 'kpi-red' },
        { label: 'الصافي', value: cur(totIn - totOut), cls: totIn >= totOut ? 'kpi-blue' : 'kpi-red' }
      ],
      sections: [{
        title: 'إدارة الحركات الفردية — 수정 أو حذف أي سجل',
        headers: ['التاريخ', 'التسلسل', 'الفرع', 'هوية العميل', 'العميل', 'اللوحة', 'نوع الحركة', 'نوع العملية', 'الفئة', 'قبض', 'صرف', 'البيان', 'إجراءات'],
        rows: rows,
        foot: ['الإجمالي', '—', '—', '—', '—', '—', '—', '—', '—', cur(totIn), cur(totOut), '—', '—']
      }]
    };
  }

  /* نافذة تعديل صف فردي */
  function openEditModal(row, store, host) {
    var backdrop = document.createElement('div');
    backdrop.className = 'fn-modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0'; backdrop.style.left = '0';
    backdrop.style.width = '100%'; backdrop.style.height = '100%';
    backdrop.style.background = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '10000';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';

    var fields = [
      { key: F_SEQ,   label: 'التسلسل' },
      { key: F_BRANCH,label: 'الفرع' },
      { key: F_DATE,  label: 'التاريخ (YYYY-MM-DD)', type: 'date' },
      { key: F_CID,   label: 'هوية العميل' },
      { key: F_CLIENT,label: 'اسم العميل' },
      { key: F_PLATE, label: 'رقم اللوحة' },
      { key: F_MOVEMENT,label: 'نوع الحركة' },
      { key: F_OPTYPE,label: 'نوع العملية' },
      { key: F_CATEGORY,label: 'الفئة' },
      { key: F_IN,    label: 'قبض', type: 'number' },
      { key: F_OUT,   label: 'صرف', type: 'number' },
      { key: F_CONTRACT,label: 'رقم العقد' },
      { key: F_PAPER, label: 'العقد الورقي' },
      { key: F_DESC,  label: 'البيان' },
      { key: F_PAYMETHOD,label: 'طريقة الدفع' },
      { key: F_ACCOUNT,label: 'الحساب' },
      { key: F_AUTHNO,label: 'رقم الموافقة' },
      { key: F_USER,  label: 'المستخدم' }
    ];

    var inputsHtml = fields.map(function (f) {
      var val = String(row[f.key] || '');
      var inputHtml = f.type === 'date'
        ? '<input type="date" id="fn-edit-' + f.key + '" value="' + esc(val) + '">'
        : (f.type === 'number'
          ? '<input type="number" id="fn-edit-' + f.key + '" value="' + esc(val) + '">'
          : '<input type="text" id="fn-edit-' + f.key + '" value="' + esc(val) + '">');
      return '<div style="margin-bottom:8px"><label style="display:block;font-size:12px;margin-bottom:3px;font-weight:700">' + esc(f.label) + '</label>' + inputHtml + '</div>';
    }).join('');

    var modalHtml =
      '<div style="background:#fff;padding:20px;border-radius:8px;min-width:500px;max-width:90vw;max-height:90vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3)">'
      + '<h3 style="margin-top:0">تعديل الحركة — السند: ' + esc(row[F_ID] || '—') + '</h3>'
      + inputsHtml
      + '<div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">'
      + '<button type="button" id="fn-edit-cancel" class="rp-btn" style="background:#94a3b8">إلغاء</button>'
      + '<button type="button" id="fn-edit-save" class="rp-btn" style="background:var(--navy);color:#fff">حفظ التعديلات</button>'
      + '</div>'
      + '</div>';

    backdrop.innerHTML = modalHtml;
    document.body.appendChild(backdrop);

    backdrop.querySelector('#fn-edit-cancel').onclick = function () {
      backdrop.remove();
    };
    backdrop.querySelector('#fn-edit-save').onclick = function () {
      var updated = {};
      fields.forEach(function (f) {
        var el = document.getElementById('fn-edit-' + f.key);
        updated[f.key] = el ? el.value : row[f.key];
      });
      var d = updated[F_DATE] || row[F_DATE];
      var s = loadStore();
      var dayRows = s[d] || [];
      var idx = dayRows.findIndex(function (r) {
        return String(r[F_ID] || '') === String(row[F_ID] || '') && String(r[F_SEQ] || '') === String(row[F_SEQ] || '');
      });
      if (idx >= 0) {
        dayRows[idx] = updated;
        saveStore(s);
        saveDayToCloud(d, dayRows, function () {
          backdrop.remove();
          renderFinance(host);
        });
      } else {
        backdrop.remove();
        renderFinance(host);
      }
    };
    backdrop.onclick = function (e) { if (e.target === backdrop) backdrop.remove(); };
  }

  /* ─── تصدير Excel / PDF ─── */
  function exportData(title, headers, rows, type) {
    var cleanHeaders = headers.map(stripHtml);
    var cleanRows = rows.map(function (r) {
      return r.map(stripHtml);
    });

    if (type === 'xlsx') {
      if (typeof global.YahmaExport !== 'undefined' && global.YahmaExport.exportRowsToExcel) {
        global.YahmaExport.exportRowsToExcel(cleanRows, cleanHeaders, title + '.xlsx');
        return;
      }
      if (typeof global.ensureXlsxReady === 'function') {
        Promise.resolve(global.ensureXlsxReady()).then(function () {
          if (!global.XLSX) return;
          var ws = global.XLSX.utils.aoa_to_sheet([cleanHeaders].concat(cleanRows));
          var wb = global.XLSX.utils.book_new();
          global.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          global.XLSX.writeFile(wb, title + '.xlsx');
        });
        return;
      }
      return;
    }
    if (type === 'pdf') {
      if (typeof global.YahmaExport !== 'undefined' && global.YahmaExport.exportTablePdf) {
        global.YahmaExport.exportTablePdf(title, cleanHeaders, cleanRows);
        return;
      }
      var win = window.open('', '_blank');
      if (!win) return;
      var rowsHtml = cleanRows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr>';
      }).join('');
      win.document.write('<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">'
        + '<title>' + esc(title) + '</title>'
        + '<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}'
        + 'th,td{border:1px solid #ccc;padding:4px 6px}th{background:#f2f2f2}</style>'
        + '</head><body><h3>' + esc(title) + '</h3><table>'
        + '<thead><tr>' + cleanHeaders.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>'
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
      var isActive = state.period === ('date:' + d);
      return '<span class="fn-date-tag' + (isActive ? ' active' : '') + '" style="' + (isActive ? 'border-color:var(--navy);background:rgba(21,35,80,.12);font-weight:800;' : '') + '">'
        + '<button type="button" class="fn-pick-date" data-date="' + esc(d) + '" style="background:none;border:none;cursor:pointer;font:inherit;color:inherit;padding:0" title="تصفية حسب هذا اليوم">📅 ' + esc(d) + '</button>'
        + ' <button type="button" class="fn-del-date" data-date="' + esc(d) + '" title="حذف">✕</button></span>';
    }).join('');

    var cloudBadgeCls = state.cloudStatus === 'online' ? 'online' : (state.cloudStatus === 'offline' ? 'offline' : '');
    var cloudBadgeText = state.cloudStatus === 'online'
      ? '☁️ متصل بالسحابة (' + num(state.cloudCount) + ' حركة)'
      : (state.cloudStatus === 'offline' ? '💾 تخزين محلي (السحابة غير مفعلة)' : '🔄 جاري فحص السحابة…');

    return '<div class="fn-upload-bar">'
      + '<input type="file" id="fn-file" accept=".xlsx,.xls,.csv" style="display:none">'
      + '<button type="button" class="rp-btn fn-upload-btn" id="fn-upload-btn">📤 رفع شيت اليومية</button>'
      + '<span class="fn-cloud-badge ' + cloudBadgeCls + '">' + cloudBadgeText + '</span>'
      + '<span id="fn-upload-status" class="fn-status"></span>'
      + '</div>'
      + (tagsHtml ? '<div class="fn-dates-row"><span class="rp-muted" style="font-size:11.5px;font-weight:700">الأيام المسجلة (اضغط للتصفية):</span> ' + tagsHtml + '</div>' : '');
  }

  /* ─── نافذة تفاصيل الفرع المنبثقة ─── */
  function renderModal(host, store) {
    var existing = host.querySelector('#fn-branch-modal-backdrop');
    if (existing) existing.remove();
    if (!state.modalBranch) return;

    var modalHtml = buildBranchModalHtml(state.modalBranch, store);
    if (!modalHtml) return;

    var wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    var backdrop = wrap.firstElementChild;
    host.appendChild(backdrop);

    var closeBtn = backdrop.querySelector('#fn-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        state.modalBranch = null;
        backdrop.remove();
      });
    }
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) {
        state.modalBranch = null;
        backdrop.remove();
      }
    });

    var filterBtn = backdrop.querySelector('#fn-modal-filter-btn');
    if (filterBtn) {
      filterBtn.addEventListener('click', function () {
        state.branch = state.modalBranch;
        state.modalBranch = null;
        backdrop.remove();
        renderFinance(host);
      });
    }

    var exportBtn = backdrop.querySelector('#fn-modal-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var branchRows = getAllRows(store, state.modalBranch, state.period);
        var headers = ['رقم السند', 'التسلسل', 'الفرع', 'التاريخ', 'هوية العميل', 'العميل', 'اللوحة', 'نوع الحركة', 'نوع العملية', 'الفئة', 'قبض', 'صرف', 'رقم العقد', 'العقد الورقي', 'البيان', 'طريقة الدفع', 'الحساب', 'معتمد', 'رقم الموافقة', 'المستخدم'];
        exportData('كشف فرع ' + state.modalBranch, headers, branchRows, 'xlsx');
      });
    }
  }

  /* ─── الدالة الرئيسية للرسم ─── */
  function renderFinance(host) {
    if (!host) return;

    var store = ensureDemoData(loadStore());

    /* فروع المنصة واليومية */
    var platformBranches = getPlatformBranches();

    /* حساب بيانات العرض الحالي */
    if (state.view === 'fleet_revenue') state.view = 'summary';
    var viewData;
    if      (state.view === 'branches' && state.compareMode === 'branches') viewData = buildBranchesComparison(store);
    else if (state.view === 'branches' && state.compareMode === 'periods') viewData = buildPeriodComparison(store, state.branch);
    else if (state.view === 'branches')         viewData = buildBranches(store, state.branch);
    else if (state.view === 'payments')         viewData = buildPayments(store, state.branch);
    else if (state.view === 'movements')        viewData = buildMovements(store, state.branch);
    else if (state.view === 'users')            viewData = buildUsers(store, state.branch);
    else if (state.view === 'contracts_report') viewData = buildContractsReport(store, state.branch);
    else if (state.view === 'journal')          viewData = buildJournalManagement(store, state.branch);
    else                                        viewData = buildSummary(store, state.branch);

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
        return '<tr>' + row.map(function (c) {
          var str = String(c != null ? c : '');
          var cellContent = (str.indexOf('<button') >= 0 || str.indexOf('<span') >= 0 || str.indexOf('<div') >= 0)
            ? str
            : esc(str);
          return '<td>' + cellContent + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var tfHtml = (sec.foot && sec.foot.length)
        ? '<tfoot><tr>' + sec.foot.map(function (c) {
            var str = String(c != null ? c : '');
            var cellContent = (str.indexOf('<button') >= 0 || str.indexOf('<span') >= 0 || str.indexOf('<div') >= 0)
              ? str
              : esc(str);
            return '<td>' + cellContent + '</td>';
          }).join('') + '</tr></tfoot>'
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
    var darkCls = state.darkMode ? ' fn-dark' : '';
    host.innerHTML =
        '<style>'
        + '.fn-warning-box{background:#fff3f3;border-left:4px solid #ef4444;padding:10px 14px;margin:12px 0;border-radius:4px;font-size:13px;color:#7f1d1d;animation:fnFadeIn .4s ease}@keyframes fnFadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
        + '.rp-btn-small{font-size:11px;padding:3px 7px;border-radius:4px;border:1px solid var(--line,#e2e8f0);background:#fff;color:var(--ink);cursor:pointer} .rp-btn-small:hover{background:#f8fafc}'
        + '.rp-btn-danger{color:#ef4444;border-color:#ef4444} .rp-btn-danger:hover{background:#ef4444;color:#fff}'
        + '.fn-dark .fn-warning-box{background:#1e1b4b;border-left-color:#f87171;color:#fca5a5}'
        + '.fn-dark .rp-btn-small{background:#1f2937;border-color:#374151;color:#e5e7eb} .fn-dark .rp-btn-small:hover{background:#374151}'
        + '.fn-dark .rp-btn-danger{color:#fca5a5;border-color:#fca5a5} .fn-dark .rp-btn-danger:hover{background:#fca5a5;color:#1f2937}'
        + '</style>'
        + '<div class="fn-upload-wrap' + darkCls + '">' + buildTopBar(store) + '</div>'
      + '<div class="rp-head">'
      + '<div class="rp-head-text"><h2>المالية واليومية الموحدة</h2>'
      + '<div class="muted-small">ربط مباشر مع أسطول المنصة وتحليل مالي شامل ورسوم بيانية</div></div>'
      + '</div>'
      + buildFiltersBar(store, platformBranches)
      + (state.compareMode === 'branches' ? buildBranchPickers(store) : '')
      + (state.compareMode === 'periods' ? buildPeriodPickers(store) : '')
      + '<div class="rp-tabs">' + tabsHtml + '</div>'
      + (viewData.pipelineHtml || '')
      + (viewData.chartsHtml || '')
      + '<div class="rp-kpis">' + kpisHtml + '</div>'
      + (viewData.warningHtml || '')
      + sectionsHtml;

    /* ─── ربط الأحداث ─── */

    /* فلاتر الفرع والفترة */
    var bSel = host.querySelector('#fn-branch-select');
    if (bSel) {
      bSel.addEventListener('change', function () {
        state.branch = bSel.value || '';
        renderFinance(host);
      });
    }

    var pSel = host.querySelector('#fn-period-select');
    if (pSel) {
      pSel.addEventListener('change', function () {
        state.period = pSel.value || 'all';
        renderFinance(host);
      });
    }

    var sInp = host.querySelector('#fn-search-input');
    if (sInp) {
      sInp.addEventListener('input', function () {
        state.search = sInp.value || '';
        renderFinance(host);
      });
    }

    var rBtn = host.querySelector('#fn-reset-filters-btn');
    if (rBtn) {
      rBtn.addEventListener('click', function () {
        state.branch = '';
        state.period = 'all';
        state.compareMode = 'none';
        state.compareBranchA = '';
        state.compareBranchB = '';
        state.comparePeriodA = '';
        state.comparePeriodB = '';
        renderFinance(host);
      });
    }

    /* أزرار وضع المقارنة */
    var cmpBranches = host.querySelector('#fn-cmp-branches');
    if (cmpBranches) {
      cmpBranches.addEventListener('click', function () {
        state.compareMode = 'branches';
        state.comparePeriodA = '';
        state.comparePeriodB = '';
        renderFinance(host);
      });
    }
    var cmpPeriods = host.querySelector('#fn-cmp-periods');
    if (cmpPeriods) {
      cmpPeriods.addEventListener('click', function () {
        state.compareMode = 'periods';
        state.compareBranchA = '';
        state.compareBranchB = '';
        renderFinance(host);
      });
    }
    var cmpNone = host.querySelector('#fn-cmp-none');
    if (cmpNone) {
      cmpNone.addEventListener('click', function () {
        state.compareMode = 'none';
        state.compareBranchA = '';
        state.compareBranchB = '';
        state.comparePeriodA = '';
        state.comparePeriodB = '';
        renderFinance(host);
      });
    }

    /* مقارنة فرع ضد فرع (اختيار الفرعين) */
    var selA = host.querySelector('#fn-cmp-branch-a');
    if (selA) {
      selA.addEventListener('change', function () {
        state.compareBranchA = selA.value || '';
        renderFinance(host);
      });
    }
    var selB = host.querySelector('#fn-cmp-branch-b');
    if (selB) {
      selB.addEventListener('change', function () {
        state.compareBranchB = selB.value || '';
        renderFinance(host);
      });
    }

    /* مقارنة الفترتين (اختيار الفترتين) */
    var selPA = host.querySelector('#fn-cmp-period-a');
    if (selPA) {
      selPA.addEventListener('change', function () {
        state.comparePeriodA = selPA.value || '';
        renderFinance(host);
      });
    }
    var selPB = host.querySelector('#fn-cmp-period-b');
    if (selPB) {
      selPB.addEventListener('change', function () {
        state.comparePeriodB = selPB.value || '';
        renderFinance(host);
      });
    }

    /* مقارنة فرع ضد فرع (Head-to-Head) */
    var h2hA = host.querySelector('#fn-h2h-sel-a');
    if (h2hA) {
      h2hA.addEventListener('change', function () {
        state.compareBranchA = h2hA.value;
        renderFinance(host);
      });
    }
    var h2hB = host.querySelector('#fn-h2h-sel-b');
    if (h2hB) {
      h2hB.addEventListener('change', function () {
        state.compareBranchB = h2hB.value;
        renderFinance(host);
      });
    }

    /* ضغط على يوم محدد من الوسوم */
    host.querySelectorAll('.fn-pick-date').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-date');
        if (d) {
          state.period = (state.period === ('date:' + d)) ? 'all' : ('date:' + d);
          renderFinance(host);
        }
      });
    });

    /* ضغط على اسم الفرع لفتح كارت الفرع */
    host.querySelectorAll('.fn-branch-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var b = btn.getAttribute('data-branch');
        if (b) {
          state.modalBranch = b;
          renderModal(host, store);
        }
      });
    });

    if (state.modalBranch) {
      renderModal(host, store);
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

        var fileName = file.name;
        if (statusEl) {
          statusEl.textContent = '⏳ جاري قراءة وتحليل ملف "' + esc(fileName) + '"…';
        }

        parseXlsxFile(file, function (err, byDate, count) {
          try { fileInput.value = ''; } catch (_) {}
          if (err) {
            if (statusEl) statusEl.textContent = '❌ خطأ: ' + (err.message || 'فشل قراءة الملف');
            return;
          }

          var parsedDates = Object.keys(byDate || {});
          if (!parsedDates.length) {
            if (statusEl) statusEl.textContent = '⚠️ لم يتم العثور على حركات صالحة في الملف المرفوع';
            return;
          }

          var freshStore = loadStore();
          parsedDates.forEach(function (d) {
            freshStore[d] = byDate[d];
          });
          saveStore(freshStore);
          state.period = 'all';

          if (statusEl) {
            statusEl.textContent = '⏳ جاري الحفظ سحابياً ومحلياً… (' + count + ' حركة في ' + parsedDates.join('، ') + ')';
          }

          var datesToSave = parsedDates.slice();
          var dateIdx = 0;
          function saveNextDay() {
            if (dateIdx >= datesToSave.length) {
              if (statusEl) {
                statusEl.textContent = '✅ تم حفظ اليومية بنجاح (' + count + ' حركة في ' + datesToSave.join('، ') + ')';
              }
              setTimeout(function () { renderFinance(host); }, 700);
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

    /* تعديل صف فردي */
    host.querySelectorAll('[data-fn-edit-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = JSON.parse(btn.getAttribute('data-row'));
        openEditModal(row, store, host);
      });
    });
    /* حذف صف فردي */
    host.querySelectorAll('[data-fn-del-row]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = JSON.parse(btn.getAttribute('data-row'));
        var d = row[F_DATE];
        if (!d) return;
        if (!confirm('حذف هذه الحركة نهائياً؟\nالتاريخ: ' + d + '\nالعميل: ' + row[F_CLIENT] + '\nالمبلغ: ' + cur(Number(row[F_IN]) || 0) + ' / ' + cur(Number(row[F_OUT]) || 0))) return;
        var s = loadStore();
        var dayRows = s[d] || [];
        var idx = dayRows.findIndex(function (r) {
          return String(r[F_ID] || '') === String(row[F_ID] || '') && String(r[F_SEQ] || '') === String(row[F_SEQ] || '');
        });
        if (idx >= 0) {
          dayRows.splice(idx, 1);
          if (dayRows.length === 0) delete s[d];
          saveStore(s);
          deleteDayFromCloud(d);
          renderFinance(host);
        }
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
