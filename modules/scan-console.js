/* ===== وحدة وضع المسح الشامل (Scan Console) =====
   داكنة كاملة زي تصميم الغرف: نسبة الإنجاز + عداد كبير،
   4 بطاقات عدّ (إجمالي/سليم/حتاج متابعة/غير محدد)، رادار
   بنقاط لكل سيارة (الثقل حسب الحالة — الضغط يفتح ملف 360)،
   بحث + شرائح ماركات، وجدول مسير بأخطر أولًا.
   بتشتغل كطبقة فوق التبويبات اللي ليها معنى: الفحص/الرخص/
   التأمين/بطاقات التشغيل. */
(function (global) {
  'use strict';

  var SESSION_KEY = 'yahma-scan-session-v1';
  var ov = null;
  var liveTimer = null;
  var state = { mode: 'inspection', branch: '', search: '', brand: '', scanning: false, startedAt: null };

  /* ===== إعدادات كل وضع ===== */
  var MODES = {
    inspection: {
      label: 'الفحص', head: 'غير المفحوصة', unit: 'فحص',
      classify: function (c) {
        var st = (typeof inspectionDisplayStatus === 'function') ? inspectionDisplayStatus(c.inspectionStatus) : { level: 'grey', label: '—' };
        return st.level === 'green' ? 'good' : st.level === 'red' ? 'bad' : 'unknown';
      },
      statusLabel: function (c) {
        var st = (typeof inspectionDisplayStatus === 'function') ? inspectionDisplayStatus(c.inspectionStatus) : null;
        return (st && st.label) || '—';
      }
    },
    license: {
      label: 'الرخص', head: 'غير المجددة', unit: 'تجديد',
      classify: function (c) {
        var d = String(c.licenseExpiry || '').trim();
        if (!d) return 'unknown';
        var st = (typeof dateStatus === 'function') ? dateStatus(d) : { level: 'grey', label: '—' };
        return st.level === 'green' ? 'good' : (st.level === 'red' || st.level === 'amber') ? 'bad' : 'unknown';
      },
      statusLabel: function (c) {
        var d = String(c.licenseExpiry || '').trim();
        if (!d) return 'غير محدد';
        var st = (typeof dateStatus === 'function') ? dateStatus(d) : null;
        return (st && st.label) || '—';
      }
    },
    insurance: {
      label: 'التأمين', head: 'غير المؤمّنة', unit: 'تأمين',
      classify: function (c) {
        var st = (typeof textTag === 'function') ? textTag(c.insuranceStatus) : { level: 'grey', label: '—' };
        return st.level === 'green' ? 'good' : st.level === 'red' ? 'bad' : 'unknown';
      },
      statusLabel: function (c) {
        var st = (typeof textTag === 'function') ? textTag(c.insuranceStatus) : null;
        return (st && st.label) || '—';
      }
    },
    card: {
      label: 'بطاقات التشغيل', head: 'بطاقات منتهية', unit: 'بطاقة',
      classify: function (c) {
        var st = (typeof cardDisplayStatus === 'function') ? cardDisplayStatus(c.cardExpiry, c.cardStatus) : { level: 'grey', label: '—' };
        return st.level === 'green' ? 'good' : (st.level === 'red' || st.level === 'amber') ? 'bad' : 'unknown';
      },
      statusLabel: function (c) {
        var st = (typeof cardDisplayStatus === 'function') ? cardDisplayStatus(c.cardExpiry, c.cardStatus) : null;
        return (st && st.label) || '—';
      }
    }
  };

  function esc(v) { return escapeHtml(v == null ? '' : String(v)); }
  function mode() { return MODES[state.mode] || MODES.inspection; }
  function branchScope() {
    try { if (global.currentRole === 'admin') return ''; } catch (_) {}
    return String(global.currentUserBranch || '').trim();
  }
  function hashAngle(plate) {
    var s = String(plate || ''), h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 100007; }
    return (h * 137) % 360;
  }
  function daysLeft(c) {
    var fields = { license: 'licenseExpiry', insurance: 'insuranceExpiry', card: 'cardExpiry' }[state.mode];
    var d = String((fields ? c[fields] : '') || '').trim();
    if (!d) return null;
    var t = new Date(d).getTime();
    if (isNaN(t)) return null;
    return Math.round((t - Date.now()) / 86400000);
  }

  function scopeCars() {
    var list = [];
    try { list = (typeof yahmaGetFleet === 'function') ? yahmaGetFleet() : (typeof fleet !== 'undefined' ? fleet : []); }
    catch (_) { list = []; }
    var scope = branchScope();
    if (scope && state.branch && state.branch !== scope) state.branch = scope;
    return list.filter(function (c) {
      if (scope) return String(c.branch || '').trim() === scope;
      if (!state.branch) return true;
      return String(c.branch || '').trim() === state.branch;
    });
  }

  function readSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.mode && MODES[s.mode] && s.startedAt) return s;
    } catch (_) {}
    return null;
  }

  /* ===== الرادار ===== */
  function radarSvg(cars, cls) {
    var cx = 130, cy = 130, rings = [32, 66, 100];
    var inner = rings.map(function (r) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#1B2A4A" stroke-width="1.4"/>'; }).join('');
    var cross = '<line x1="' + cx + '" y1="' + (cy - 100) + '" x2="' + cx + '" y2="' + (cy + 100) + '" stroke="#1B2A4A" stroke-width="1.2"/>'
      + '<line x1="' + (cx - 100) + '" y1="' + cy + '" x2="' + (cx + 100) + '" y2="' + cy + '" stroke="#1B2A4A" stroke-width="1.2"/>';
    var sweep = '<path d="M ' + cx + ' ' + cy + ' L ' + (cx + 100) + ' ' + cy + ' A 100 100 0 0 0 ' + (cx + 70.7) + ' ' + (cy - 70.7) + ' Z" fill="url(#scanWedge)" class="scan-sweep"/>';
    var dots = cars.map(function (item) {
      var a = (hashAngle(item.car.plate) * Math.PI) / 180;
      var rr = item.cls === 'good' ? 20 + (item.seed % 14) : item.cls === 'soon' ? 44 + (item.seed % 16) : 66 + (item.seed % 30);
      var x = (cx + rr * Math.cos(a)).toFixed(1), y = (cy - rr * Math.sin(a)).toFixed(1);
      var color = item.cls === 'good' ? '#22C55E' : item.cls === 'soon' ? '#F59E0B' : item.cls === 'unknown' ? '#64748B' : '#FBBF24';
      var pulse = item.cls !== 'good' ? ' scan-dot-live' : '';
      return '<circle class="scan-dot' + pulse + '" cx="' + x + '" cy="' + y + '" r="5" fill="' + color
        + '" data-scan-car="' + esc(item.car.id) + '"><title>' + esc(item.car.plate) + ' — ' + esc(item.statusLabel) + '</title></circle>';
    }).join('');
    return '<svg viewBox="0 0 260 260" class="scan-radar" role="img" aria-label="رادار سيارات الفرع">'
      + '<defs><radialGradient id="scanWedge" cx="100%" cy="100%" r="100%"><stop offset="0%" stop-color="#14B8A6" stop-opacity=".55"/><stop offset="100%" stop-color="#14B8A6" stop-opacity="0"/></radialGradient></defs>'
      + inner + cross + sweep + dots + '</svg>';
  }

  /* ===== الجدول ===== */
  var CLS_ORDER = { bad: 0, soon: 1, unknown: 2, good: 3 };
  function buildRows(cars, modeCfg) {
    var items = cars.map(function (c) {
      return { car: c, cls: modeCfg.classify(c), statusLabel: modeCfg.statusLabel(c), seed: (String(c.plate).length * 7 + (c.plate || '').length) % 40 };
    });
    items.sort(function (a, b) { return (CLS_ORDER[a.cls] - CLS_ORDER[b.cls]) || String(a.car.plate).localeCompare(String(b.car.plate), 'ar', { numeric: true }); });
    return items;
  }

  function draw() {
    if (!ov || !ov.isConnected) return;
    var modeCfg = mode();
    var cars = scopeCars();
    var totals = { total: cars.length, good: 0, bad: 0, unknown: 0 };
    cars.forEach(function (c) {
      var k = modeCfg.classify(c);
      if (k === 'good') totals.good++;
      else if (k === 'bad') totals.bad++;
      else totals.unknown++;
    });
    var pct = totals.total ? Math.round((totals.good / totals.total) * 100) : 0;
    var scope = branchScope();
    var branchNames = [];
    try { if (typeof branches !== 'undefined' && Array.isArray(branches)) branchNames = branches.map(function (b) { return String(b.name || '').trim(); }).filter(Boolean); } catch (_) {}
    Array.from((typeof fleet !== 'undefined' ? fleet : [])).forEach(function (c) { var b = String(c.branch || '').trim(); if (b && branchNames.indexOf(b) < 0) branchNames.push(b); });
    branchNames.sort(function (a, b) { return a.localeCompare(b, 'ar', { numeric: true }); });

    /* شرائح الماركات */
    var brandMap = new Map();
    cars.forEach(function (c) {
      var b = String(c.brand || '').trim();
      if (!b) return;
      if (typeof canonicalBrand === 'function') b = canonicalBrand(b);
      brandMap.set(b, (brandMap.get(b) || 0) + 1);
    });
    var brands = Array.from(brandMap.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8).map(function (e) { return e[0]; });

    /* بحث + فلتر ماركة */
    var q = state.search.trim().toLowerCase();
    var filtered = cars.filter(function (c) {
      if (state.brand && String(c.brand || '').trim().indexOf(state.brand) < 0 && String(c.brand || '').trim() !== state.brand) {
        var cb = (typeof canonicalBrand === 'function') ? canonicalBrand(String(c.brand || '').trim()) : String(c.brand || '').trim();
        if (cb !== state.brand) return false;
      }
      if (!q) return true;
      var hay = [c.plate, c.brand, c.branch, c.owner, c.model, c.color, c.serial].join(' ');
      return String(hay).toLowerCase().indexOf(q) >= 0;
    });
    var items = buildRows(filtered, modeCfg);
    /* رادار بنفس الفلترة لكن بلا شرائح الماركة، وترتيب الأحدث:
       الرادار يعرض كل السيارات في النطاق (زي الغرفة كوحدة رصد)، والبحث يقلّص الجدول بس. */
    var radarCars = buildRows(cars.filter(function (c) { return !q || ([c.plate, c.brand, c.branch, c.owner].join(' ').toLowerCase().indexOf(q) >= 0); }), modeCfg);

    var elapsed = '';
    if (state.scanning && state.startedAt) {
      var mins = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 60000);
      elapsed = '<span class="scan-elapsed">⏱ ' + (mins < 1 ? 'أقل من دقيقة' : mins + ' دقيقة') + '</span>';
    }

    var branchSel = '<select id="scan-branch" dir="rtl"' + (scope ? ' disabled title="مقيد على فرعك: ' + esc(scope) + '"' : '') + '>'
      + '<option value="">كل الفروع</option>'
      + branchNames.map(function (b) { return '<option value="' + esc(b) + '"' + (state.branch === b ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('')
      + '</select>';

    var chips = '<button type="button" class="scan-chip' + (state.brand === '' ? ' active' : '') + '" data-scan-brand="">الكل</button>'
      + brands.map(function (b) { return '<button type="button" class="scan-chip' + (state.brand === b ? ' active' : '') + '" data-scan-brand="' + esc(b) + '">' + esc(b) + '</button>'; }).join('');

    var headTitle = modeCfg.head + (state.branch ? ' — فرع ' + state.branch : '');
    var today = new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });

    var rowsHtml = items.length ? items.map(function (item) {
      var c = item.car;
      return '<tr>'
        + '<td><span class="scan-plate"><b>' + esc(c.plate || '—') + '</b><i>SAU</i></span></td>'
        + '<td>' + esc((c.brand || '—')) + '</td>'
        + '<td><span class="scan-state s-' + item.cls + '"><i></i>' + esc(item.statusLabel) + '</span></td>'
        + '<td>' + esc(c.notes || '—') + '</td>'
        + '<td class="scan-actions"><button type="button" class="scan-view-btn" data-scan-view="' + esc(c.id) + '">عرض 👁</button></td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="5" class="scan-empty">لا سيارات مطابقة — ' + esc(modeCfg.head) + ' في هذا النطاق.</td></tr>';

    ov.innerHTML = ''
      + '<div class="scan-console" dir="rtl">'
      + '<div class="scan-top">'
      + '<div class="scan-head-left">'
      + '<h2>' + esc(headTitle) + '</h2>'
      + '<p class="scan-sub">فرع ' + esc(modeCfg.label) + ' — ' + esc(today) + '</p>'
      + '</div>'
      + '<div class="scan-head-right">'
      + (state.scanning ? '<span class="scan-live"><i></i> مباشر' + elapsed + '</span>' : '')
      + '<button type="button" class="scan-start-btn' + (state.scanning ? ' ending' : '') + '" id="btn-scan-start">' + (state.scanning ? 'إنهاء المسح الشامل ✕' : 'بدأ المسح الشامل') + '</button>'
      + '<button type="button" class="scan-close-btn" id="btn-scan-close" title="إغلاق (Esc)">✕</button>'
      + '</div>'
      + '</div>'
      + '<div class="scan-body">'
      + '<div class="scan-main">'
      + '<div class="scan-pct-card">'
      + '<div class="scan-pct-row"><small>نسبة ال' + esc(modeCfg.unit) + ' المنجز</small><b>' + pct + '<span>%</span></b></div>'
      + '<div class="scan-bar"><i style="width:' + pct + '%"></i></div>'
      + '</div>'
      + '<div class="scan-counts">'
      + '<div class="scan-count c-cyan"><b>' + totals.total + '</b><small>إجمالي السيارات</small></div>'
      + '<div class="scan-count c-orange"><b>' + totals.bad + '</b><small>' + esc(modeCfg.head) + '</small></div>'
      + '<div class="scan-count c-green"><b>' + totals.good + '</b><small>جاهز / منجز</small></div>'
      + '<div class="scan-count c-pink"><b>' + totals.unknown + '</b><small>' + esc(modeCfg.unit) + ' غير محدد</small></div>'
      + '</div>'
      + '</div>'
      + '<div class="scan-radar-card">' + radarSvg(radarCars) + '<p class="scan-radar-hint">اضغط على أي نقطة لعرض السيارة — الأخضر منجز · الأصفر عاجل · الرمادي غير محدد</p></div>'
      + '</div>'
      + '<div class="scan-toolbar">'
      + '<div class="scan-chips">' + chips + '</div>'
      + '<div class="scan-search"><input id="scan-search" placeholder="ابحث برقم اللوحة أو الماركة أو المالك..." value="' + esc(state.search) + '" dir="rtl">' + branchSel + '</div>'
      + '</div>'
      + '<div class="scan-table-wrap">'
      + '<table class="scan-table"><thead><tr><th>رقم اللوحة</th><th>الماركة</th><th>حالة ' + esc(modeCfg.label) + '</th><th>النتائج</th><th></th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table>'
      + '</div>'
      + '</div>';

    /* ===== ربط الأحداث ===== */
    ov.querySelector('#btn-scan-close').addEventListener('click', close);
    ov.querySelector('#btn-scan-start').addEventListener('click', function () {
      if (state.scanning) {
        state.scanning = false; state.startedAt = null;
        try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
      } else {
        state.scanning = true; state.startedAt = new Date().toISOString();
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: state.mode, branch: state.branch, startedAt: state.startedAt })); } catch (_) {}
      }
      draw();
    });
    ov.querySelector('#scan-search')?.addEventListener('input', function (e) {
      state.search = e.target.value; draw(); restoreFocus('scan-search');
    });
    ov.querySelector('#scan-branch')?.addEventListener('change', function (e) {
      state.branch = e.target.value; state.search = ''; draw(); restoreFocus('scan-branch');
    });
    ov.querySelectorAll('[data-scan-brand]').forEach(function (b) {
      b.addEventListener('click', function () { state.brand = b.getAttribute('data-scan-brand'); draw(); });
    });
    ov.querySelectorAll('[data-scan-view],[data-scan-car]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-scan-view') || el.getAttribute('data-scan-car');
        if (id && typeof openVehicle360 === 'function') openVehicle360(id);
      });
    });
  }

  function restoreFocus(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (id === 'scan-search') { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  }

  function open(modeName) {
    if (!MODES[modeName]) modeName = 'inspection';
    state.mode = modeName;
    state.search = ''; state.brand = '';
    var s = readSession();
    if (s && s.mode === modeName) { state.scanning = true; state.branch = s.branch || ''; state.startedAt = s.startedAt; }
    ov = document.createElement('div');
    ov.className = 'scan-overlay';
    document.body.appendChild(ov);
    draw();
    if (!liveTimer) liveTimer = setInterval(function () { if (!ov || !ov.isConnected) { stopTimer(); return; } draw(); }, 10000);
    document.addEventListener('keydown', escClose);
  }
  function stopTimer() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
  function escClose(e) { if (e.key === 'Escape') close(); }
  function close() {
    stopTimer();
    if (ov) { ov.remove(); ov = null; }
    document.removeEventListener('keydown', escClose);
    try { if (typeof render === 'function') render(); } catch (_) {}
  }

  global.YahmaScanConsole = { open: open, close: close, isOpen: function () { return !!(ov && ov.isConnected); } };
})(window);
