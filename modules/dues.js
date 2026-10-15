/* ===== المستحقات الشهرية =====

   المصدر الوحيد لسعر اليوم هو dailyrate (3,914 من 3,984 سيارة معبّأة).
   مستحقات الشهر = سعر اليوم × عدد أيام الشهر المختار — وده بيتحسب
   من Gregorian التقويم، فشهر فبراير 28 أو 29 حسب السنة.

   ⚠️ ليش مش بنستخدم monthlyRate/rentedDays؟
   الحقلين دول موجودين كـ«أسماء استيراد» في fleet-excel.js بس — مفيش
   عمود لهم في جدول vehicles في القاعدة (تحققت من information_schema:
   31 عمود، مفيش monthlyrate ولا renteddays).
   وكمان renteddays و maintenancecost معبّيين **صفر** من 3,984.
   فلو بنينا عليه، الجدول هيطلع أصفار. هنا بنحسب من dailyrate
   اللي هو معبّ 98% ومصدر حقيقي.

   التصدير (Excel + PDF) بيشتغل أوتوماتيك من الـtable المعروض:
   export.js بيقرا أول <table> جوه #content — فأي جدول هنا بيتصدّر
   بنفس أزرار التصدير الموحّدة. */

(function (global) {
  'use strict';

  var MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                     'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  /* ===== منطق نقي — قابل للاختبار من tests/dues.test.js ===== */

  /* 'YYYY-MM' → عدد الأيام (28/29/30/31).
     new Date(y, mo, 0) هو آخر يوم في الشهر mo — فبيعرف السنة
     الكبيسة لوحده من غير ما نحسبها يدوي. */
  function daysInMonth(ym) {
    var s = String(ym == null ? '' : ym).trim();
    var m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (!m) return 30;
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return 30;
    return new Date(y, mo, 0).getDate();
  }

  /* الشهر الحالي بصيغة YYYY-MM */
  function currentMonth(d) {
    var t = d instanceof Date ? d : new Date();
    return t.getFullYear() + '-' + (t.getMonth() < 9 ? '0' : '') + (t.getMonth() + 1);
  }

  /* «2026-03» → «مارس 2026» */
  function monthLabel(ym) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(String(ym == null ? '' : ym).trim());
    if (!m) return String(ym || '');
    var mi = parseInt(m[2], 10) - 1;
    return (MONTH_NAMES[mi] || m[2]) + ' ' + m[1];
  }

  /* سعر اليوم كرقم. أي حاجة مش رقم أو ≤0 بتعتبر «بدون سعر». */
  function rateOf(car) {
    if (!car) return 0;
    var raw = car.dailyRate;
    if (raw === null || raw === undefined || raw === '') return 0;
    var n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* مستحقات الشهر للسيارة الواحدة */
  function monthlyDues(car, ym) {
    var r = rateOf(car);
    return r > 0 ? Math.round(r * daysInMonth(ym)) : 0;
  }

  /* رقم بفواصل — الأرقام لاتينية زي باقي التطبيق (التواريخ مثلا 11/08/2027) */
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return '0';
    return Math.round(v).toLocaleString('en-US');
  }

  function text(v, fallback) {
    var s = String(v == null ? '' : v).trim();
    return s || (fallback || '—');
  }

  /* بنتكلم مع الدوال اللي برّه بلطف — لو اتغيّر ترتيب التحميل
     مفيش سبب إن التبويب كله يقع.

     carStatusOut في utils.js **متعرّفة كـglobal** (سطر ~)، مش
     جوّه utils namespace — فتحققنا من الاتنين عشان ما نبقاش
     سايبينها تتقرا من غير ما تشتغل. */
  function carStatusOut(carStatus) {
    try {
      if (typeof global.carStatusOut === 'function') return !!global.carStatusOut(carStatus);
    } catch (_) { /* fallback تحت */ }
    try {
      if (global.utils && typeof global.utils.carStatusOut === 'function') return !!global.utils.carStatusOut(carStatus);
    } catch (_) { /* fallback تحت */ }
    return false;
  }

  function carStatusOf(car) {
    if (carStatusOut(car && car.carStatus)) {
      return { out: true, label: text(car && car.carStatus, 'خارج الأسطول') };
    }
    return { out: false, label: text(car && car.carStatus, '—') };
  }

  function readinessOf(car) {
    try {
      if (typeof global.vehicleReadiness === 'function') {
        var r = global.vehicleReadiness(car);
        if (r && typeof r.label === 'string') return { ready: !!r.ready, label: r.label };
      }
    } catch (_) { /* fallback تحت */ }
    var st = carStatusOf(car);
    return { ready: !st.out, label: st.out ? st.label : 'جاهزة للتأجير' };
  }

  /* ===== صفوف الجدول =====
     كل حقل بيتحسب مرة واحدة هنا، والعرض والتصدير بيقراوا نفس
     المصفوفة — فمفيش خطر إن اللي في الشاشة يخالف اللي في الملف. */
  function buildRows(cars, ym) {
    var days = daysInMonth(ym);
    var list = (Array.isArray(cars) ? cars : []).map(function (c) {
      var rate = rateOf(c);
      var st = carStatusOf(c);
      var rdy = readinessOf(c);
      return {
        id: String(c.id == null ? '' : c.id),
        plate: text(c.plate),
        branch: text(c.branch),
        city: text(c.city),
        owner: text(c.owner),
        status: st.label,
        out: st.out,
        rate: rate,
        priced: rate > 0,
        days: days,
        dues: rate > 0 ? Math.round(rate * days) : 0,
        ready: rdy.ready,
        readyLabel: rdy.label
      };
    });
    return list;
  }

  /* الأرقام الكبيرة. التصدير بيقرا نفس دالة الملخص، فالرقم اللي
     في الشاشة هو نفسه اللي في PDF. */
  function summarize(rows) {
    var priced = [], unpriced = [];
    (rows || []).forEach(function (r) { (r.priced ? priced : unpriced).push(r); });
    var total = priced.reduce(function (a, r) { return a + r.dues; }, 0);
    return {
      total: total,
      priced: priced.length,
      unpriced: unpriced.length,
      cars: (rows || []).length,
      avg: priced.length ? Math.round(total / priced.length) : 0,
      out: (rows || []).filter(function (r) { return r.out; }).length
    };
  }

  var HEADERS = ['رقم اللوحة', 'الفرع', 'المدينة', 'المالك', 'حالة السيارة',
                 'سعر اليوم', 'أيام الشهر', 'المستحق الشهري', 'الجاهزية'];

  /* نفس ترتيب الـthead بالظبط — التصدير بيقرا النص من الجدول
     المعروض، فلو الترتيب اختلف هنا هيتصدّر الملف بعناوين غلط. */
  function rowCells(r) {
    return [r.plate, r.branch, r.city, r.owner, r.status,
            r.priced ? money(r.rate) : 'بدون سعر',
            String(r.days),
            r.priced ? money(r.dues) : '—',
            r.readyLabel];
  }

  /* ===== حالة التبويب ===== */
  var state = { ym: '', branch: '', q: '', sort: 'dues', page: 0, rows: [] };

  function esc(v) {
    try {
      if (typeof global.escapeHtml === 'function') return global.escapeHtml(v);
    } catch (_) { /* fallback تحت */ }
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ⚠️ الأسطول مش متعرّف كـwindow.fleet — هو متغيّر في سكربت app.js
     وwindow.fleet بيفضل undefined. الطريق الصح هو
     window.yahmaGetFleet (core/branches-store.js:27)، وده اللي
     كل التابات التانية بتستخدمه. الـfallback للاختبارات. */
  function fleetOf() {
    try {
      if (typeof global.yahmaGetFleet === 'function') {
        var list = global.yahmaGetFleet();
        if (Array.isArray(list)) return list;
      }
    } catch (_) { /* fallback تحت */ }
    return Array.isArray(global.fleet) ? global.fleet : [];
  }

  /* آخر 18 شهر: 6 للخلف + الشهر الحالي + 11 للأمام.
     نبدأ بالخلف عشان التقرير المتأخر هو اللي بيتطلب فعلاً. */
  function monthOptions() {
    var out = [], base = new Date();
    base.setDate(1);
    for (var i = -6; i <= 11; i++) {
      var d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      var ym = currentMonth(d);
      out.push({ ym: ym, label: monthLabel(ym) });
    }
    return out;
  }

  /* opts اختياري عشان الاختبار يمرّر فلاتره من غير ما يلمس state
     بتاع التبويب. الافتراضي هو حالة الواجهة. */
  function applyFilters(rows, opts) {
    var o = opts || state;
    var q = String(o.q || '').trim().toLowerCase();
    var br = String(o.branch || '');
    var sort = o.sort || 'dues';
    var src = Array.isArray(rows) ? rows : [];
    var out = src.filter(function (r) {
      if (br && r.branch !== br) return false;
      if (!q) return true;
      return (r.plate + ' ' + r.branch + ' ' + r.city + ' ' + r.owner).toLowerCase().indexOf(q) >= 0;
    });
    if (sort === 'plate') out.sort(function (a, b) { return a.plate.localeCompare(b.plate, 'ar'); });
    else if (sort === 'branch') out.sort(function (a, b) { return a.branch.localeCompare(b.branch, 'ar') || a.plate.localeCompare(b.plate, 'ar'); });
    else if (sort === 'dues-asc') out.sort(function (a, b) { return a.dues - b.dues; });
    else out.sort(function (a, b) { return b.dues - a.dues; });
    return out;
  }

  var PAGE_SIZE = 50;

  function draw() {
    var body = global.document && global.document.getElementById('dues-body');
    if (!body) return;
    var all = applyFilters(state.rows);
    var pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (state.page >= pages) state.page = pages - 1;
    if (state.page < 0) state.page = 0;
    var slice = all.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);

    body.innerHTML = slice.length
      ? slice.map(function (r) {
          return '<tr>' + rowCells(r).map(function (cell, i) {
            /* العمود 7 (المستحق) هو الوحيد اللي بياخد تنسيق رقم
               ونقطة — والباقي نص عادي. */
            if (i === 7) return '<td class="dues-amount">' + esc(cell) + '</td>';
            if (i === 5) return '<td' + (r.priced ? '' : ' class="dues-norate"') + '>' + esc(cell) + '</td>';
            if (i === 8) return '<td><span class="readiness-pill ' + (r.ready ? 'ready' : 'grey') + '">' + esc(cell) + '</span></td>';
            return '<td>' + esc(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('')
      : '<tr><td colspan="' + HEADERS.length + '"><div class="empty-state">لا توجد سيارات مطابقة للفلاتر</div></td></tr>';

    var pager = global.document.getElementById('dues-pager');
    if (pager) {
      pager.innerHTML = pages > 1
        ? '<button type="button" class="btn btn-ghost btn-small" id="dues-prev"' + (state.page === 0 ? ' disabled' : '') + '>السابق</button>'
          + '<span class="pager-info">' + (state.page + 1) + ' / ' + pages + ' — ' + all.length + ' سيارة</span>'
          + '<button type="button" class="btn btn-ghost btn-small" id="dues-next"' + (state.page >= pages - 1 ? ' disabled' : '') + '>التالي</button>'
        : '<span class="pager-info">' + all.length + ' سيارة</span>';
      var pv = global.document.getElementById('dues-prev');
      var nx = global.document.getElementById('dues-next');
      if (pv) pv.addEventListener('click', function () { state.page--; draw(); });
      if (nx) nx.addEventListener('click', function () { state.page++; draw(); });
    }
  }

  function drawKpis(sum) {
    var host = global.document && global.document.getElementById('dues-kpis');
    if (!host) return;
    host.innerHTML =
      kpi(money(sum.total), 'إجمالي المستحقات (' + monthLabel(state.ym) + ')') +
      kpi(String(sum.priced), 'سيارة مسعّرة') +
      kpi(String(sum.unpriced), 'بدون سعر') +
      kpi(money(sum.avg), 'متوسط المستحق للسيارة');
  }

  function kpi(value, label) {
    return '<div class="dues-kpi"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  /* ===== الرسم الكامل للتبويب ===== */
  function render(content) {
    var doc = global.document;
    var title = doc.getElementById('topbar-title');
    var sub = doc.getElementById('topbar-sub');
    if (title) title.textContent = 'المستحقات الشهرية';
    if (sub) sub.textContent = 'مستحقات كل سيارة = سعر اليوم × أيام الشهر المختار';

    if (!state.ym) state.ym = currentMonth();

    /* ⚠️ لازم الصفوف تتحسب **قبل** الـmarkup.
       قائمة الفروع بتتبني من state.rows — فلو بنينا الـ<select>
       قبل recompute() كانت هتطلع «كل الفروع» بس والفلتر ميتجاهَل.
       هنا بنحسب مرة واحدة وبنستخدم نفس المصفوفة في الفلترة
       والعرض والـKPI. */
    state.rows = buildRows(fleetOf(), state.ym);
    state.page = 0;

    var branches = [];
    var seen = {};
    state.rows.forEach(function (r) { if (r.branch && !seen[r.branch]) { seen[r.branch] = 1; branches.push(r.branch); } });
    branches.sort(function (a, b) { return a.localeCompare(b, 'ar'); });

    /* لو الفرع المختار مش موجود في الأسطول دلوقتي (فرع اتشال)،
       نمسحه — وإلا الـ<select> هيعرض «كل الفروع» والفلتر يفضل
       مطبّق على فرع مش موجود والجدول يطلع فاضي من غير سبب. */
    if (state.branch && branches.indexOf(state.branch) < 0) state.branch = '';

    content.innerHTML =
      '<div class="dues-page-head"><div><h2 style="margin:0;font-size:18px">جدول المستحقات الشهرية</h2>'
      + '<div class="muted-small">الحساب من سعر اليوم (<span dir="ltr">dailyRate</span>) — لا يوجد عمود سعر شهري في القاعدة.</div></div>'
      + '<button class="btn btn-primary" id="dues-refresh" type="button">↻ تحديث</button></div>'
      + '<div class="dues-kpis" id="dues-kpis"></div>'
      + '<div class="panel">'
      + '<div class="dues-filter">'
      + '<select id="dues-month">' + monthOptions().map(function (o) {
          return '<option value="' + esc(o.ym) + '"' + (o.ym === state.ym ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>'
      + '<select id="dues-branch"><option value="">كل الفروع</option>' + branches.map(function (b) {
          var sel = b === state.branch ? ' selected' : '';
          return '<option value="' + esc(b) + '"' + sel + '>' + esc(b) + '</option>';
        }).join('') + '</select>'
      + '<select id="dues-sort">'
      + '<option value="dues"' + (state.sort === 'dues' ? ' selected' : '') + '>المستحق: الأعلى أولاً</option>'
      + '<option value="dues-asc"' + (state.sort === 'dues-asc' ? ' selected' : '') + '>المستحق: الأقل أولاً</option>'
      + '<option value="plate"' + (state.sort === 'plate' ? ' selected' : '') + '>رقم اللوحة</option>'
      + '<option value="branch"' + (state.sort === 'branch' ? ' selected' : '') + '>الفرع</option>'
      + '</select>'
      + '<input id="dues-search" placeholder="بحث باللوحة أو الفرع أو المالك" value="' + esc(state.q) + '">'
      + '</div>'
      + '<div style="overflow:auto"><table class="fleet-table dues-table"><thead><tr>'
      + HEADERS.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('')
      + '</tr></thead><tbody id="dues-body"></tbody></table></div>'
      + '<div class="pager" id="dues-pager"></div>'
      + '</div>';

    recompute();

    var byId = function (id) { return doc.getElementById(id); };
    var mSel = byId('dues-month');
    var bSel = byId('dues-branch');
    var sSel = byId('dues-sort');
    var qIn = byId('dues-search');
    var ref = byId('dues-refresh');

    if (mSel) mSel.addEventListener('change', function () { state.ym = mSel.value; state.page = 0; recompute(); });
    if (bSel) bSel.addEventListener('change', function () { state.branch = bSel.value; state.page = 0; draw(); drawKpis(summarize(applyFilters(state.rows))); });
    if (sSel) sSel.addEventListener('change', function () { state.sort = sSel.value; state.page = 0; draw(); });
    if (ref) ref.addEventListener('click', function () { state.page = 0; recompute(); });
    if (qIn) {
      var t = null;
      qIn.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () { state.q = qIn.value; state.page = 0; draw(); }, 220);
      });
    }
  }

  function recompute() {
    state.rows = buildRows(fleetOf(), state.ym);
    state.page = 0;
    draw();
    drawKpis(summarize(applyFilters(state.rows)));
  }

  global.YahmaDues = {
    daysInMonth: daysInMonth,
    currentMonth: currentMonth,
    monthLabel: monthLabel,
    rateOf: rateOf,
    monthlyDues: monthlyDues,
    money: money,
    buildRows: buildRows,
    summarize: summarize,
    rowCells: rowCells,
    applyFilters: applyFilters,
    HEADERS: HEADERS,
    render: render,
    recompute: recompute
  };
})(typeof window !== 'undefined' ? window : globalThis);