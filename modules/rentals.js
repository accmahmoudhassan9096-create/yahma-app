/* ===== modules/rentals.js — تبويب «الاستئجارات» =====

   الهدف: replaces the old «اكتب رقم الشهر يدوي» approach. كل
   عملية استئجار بتتسجل بتاريخاتها، والتقرير بيحسب من السجل.

   التفاصيل اللي بتتأثر في حالة السيارة:
     • تسجيل استئجار  →-carStatus = «مؤجرة»
     • إنهاء استئجار   →السيارة بتفضل «مؤجرة» (قرار المستخدم)
       والحالة الأصلية متسجّلة في prev_status ونعرضها كتلميح،
       فمش بنرجّعها لوحدنا — الرجوع قرار مش نتيجة جانبية.

   كل التواريخ والأرقام بتشتغل عن طريق YahmaRentals — مفيش
   حساب تاريخ متكرر هنا. */

(function (global) {
  'use strict';

  var doc = global.document;
  var S = function () { return global.YahmaRentals; };

  function esc(v) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* ⭐ تاريخ اليوم بس — من غير وقت.

   `formatArabicDate` بتلزق وقت دايمًا، وده مناسب لدفعات الفحص
   (عندها لحظة فعلية) بس مش مناسب لتواريخ استئجار: «بدأ
   ١ أكتوبر — ٠٣:٠٠ ص» معناها إن العملية بدأت الساعة ٣ الصبح،
   وده كلام غلط. تاريخ بلا وقت. */
  function fmtDay(v) {
    var s = String(v || '').trim();
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    try {
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return s; }
  }
  function fmtDate(v) { return fmtDay(v); }
  function canWrite() {
    var P = global.YahmaPerms;
    if (P && typeof P.canEditNow === 'function') return !!P.canEditNow();
    return global.currentRole !== 'view';
  }
  function canRemove() {
    var P = global.YahmaPerms;
    if (P && typeof P.canDelete === 'function') return !!P.canDelete();
    return global.currentRole === 'admin';
  }
  function guard(action) {
    if (canWrite()) return true;
    if (global.YahmaPerms && typeof global.YahmaPerms.denyMessage === 'function') {
      alert(global.YahmaPerms.denyMessage(action));
    } else {
      alert('ليس لديك صلاحية ' + action + '.');
    }
    return false;
  }

  /* فاتورة استئجار واحدة: المدة بالأيام شاملة الطرفين، والمبلغ
     = الأيام × سعر اليوم المثبّت وقت التسجيل. */
  function rowDays(r) { return S().overlapDays(r, '', ''); }
  function rowAmount(r) { return rowDays(r) * (parseFloat(r.dailyRate) || 0); }

  /* الشكل العربي للرقم — نفس اللي بيستخدمه التطبيق */
  function num(n) {
    var v = Math.round((parseFloat(n) || 0) * 100) / 100;
    return v.toLocaleString('en-US');
  }
  function money(n) {
    return num(n) + ' ر.س';
  }

  function syncWarn() {
    var err = String((global.__yahmaRentalsCloudError) || '').trim();
    if (!err) return '';
    return '<div class="payments-sync-warn"><b>⚠️ مزامنة الاستئجارات متوقفة</b>'
      + '<span>' + esc(err) + '</span>'
      + '<small>الشغل محفوظ على الجهاز بس. اتأكد من الاتصال قبل ما تقفل الصفحة.</small></div>';
  }

  function summaryHtml(list) {
    var open = list.filter(S().isOpen);
    var days = 0, revenue = 0;
    list.forEach(function (r) {
      var d = S().overlapDays(r, '', '');
      days += d;
      revenue += d * (parseFloat(r.dailyRate) || 0);
    });
    return '<div class="fleet-summary-strip module-summary-strip">'
      + '<div class="fleet-summary-card attention"><span class="fleet-summary-icon">%</span>'
      + '<span><b>' + open.length + '</b><small>استئجار شغّال</small></span></div>'
      + '<div class="fleet-summary-card"><span class="fleet-summary-icon">D</span>'
      + '<span><b>' + num(days) + '</b><small>أيام إيجار (الكل)</small></span></div>'
      + '<div class="fleet-summary-card"><span class="fleet-summary-icon">$</span>'
      + '<span><b>' + money(revenue) + '</b><small>إيراد محسوب (الكل)</small></span></div>'
      + '</div>';
  }

  function filterBar(list) {
    return '<div class="filter-panel"><div class="filter-panel-title">'
      + '<strong>سجل الاستئجارات</strong>'
      + '<span>كل عملية بتاريخاتها — التقرير بيحسب منه مش من رقم يدوي</span>'
      + '</div><div class="filter-panel-filters">'
      + '<label>بحث<input type="search" id="rent-q" placeholder="لوحة أو ملاحظة" value="' + esc(global.__rentQ || '') + '"></label>'
      + '<label>الحالة<select id="rent-state">'
      + '<option value="">الكل</option>'
      + '<option value="open"' + (global.__rentState === 'open' ? ' selected' : '') + '>شغّال</option>'
      + '<option value="closed"' + (global.__rentState === 'closed' ? ' selected' : '') + '>منتهي</option>'
      + '</select></label>'
      + '</div></div>';
  }

  function visible(list) {
    var q = String(global.__rentQ || '').trim();
    var st = String(global.__rentState || '');
    return list.filter(function (r) {
      if (st === 'open' && !S().isOpen(r)) return false;
      if (st === 'closed' && S().isOpen(r)) return false;
      if (!q) return true;
      var hay = [r.plate, r.note, r.branch, r.userName].join(' ');
      return hay.indexOf(q) > -1;
    });
  }

  function carOf(r) {
    var get = global.YahmaAppContext && global.YahmaAppContext.getFleet;
    if (typeof get !== 'function') return null;
    var list = get() || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(r.carId)) return list[i];
    }
    return null;
  }

  function rowsHtml(list) {
    var show = visible(list);
    if (!show.length) {
      return '<tr><td class="empty-span"><div class="empty">'
        + (list.length ? 'لا توجد نتائج مطابقة للفلاتر' : 'لم يُسجَّل أي استئجار بعد')
        + '</div></td></tr>';
    }
    return show.map(function (r) {
      var car = carOf(r);
      var open = S().isOpen(r);
      var days = rowDays(r);
      /* ⚠️ لو السيارة اتشالت من الأسطول، السجل لازم يفضل
         ظاهر — الاستئجار ده حدث حصل في العالم الحقيقي ومش
         هيتلغي بإن السيارة اتمسحت من الجدول. */
      var plate = r.plate || (car && car.plate) || '—';
      return '<tr>'
        + '<td class="plate">' + esc(plate) + '</td>'
        + '<td>' + esc(r.branch || (car && car.branch) || '—') + '</td>'
        + '<td>' + esc(fmtDate(r.startDate)) + '</td>'
        + '<td>' + (open ? '<span class="tag amber">شغّال</span>' : esc(fmtDate(r.endDate))) + '</td>'
        + '<td>' + num(days) + '</td>'
        + '<td>' + num(parseFloat(r.dailyRate) || 0) + '</td>'
        + '<td class="pay-cell"><b>' + num(days * (parseFloat(r.dailyRate) || 0)) + '</b></td>'
        + '<td>' + (car ? esc(String(car.carStatus || '—')) : '<span class="tag amber">السيارة مش في الأسطول</span>') + '</td>'
        + '<td class="pay-cell">' + esc(r.note || '—') + '</td>'
        + '<td>' + esc(r.userName || '—') + '</td>'
        + '<td><div class="row-actions">'
        + (canWrite() && open
          ? '<button type="button" class="btn btn-primary btn-small" data-rent-end="' + esc(r.id) + '" title="حط تاريخ التسليم — سيبه فاضي لو لسه شغّال">⏹ إنهاء الاستئجار</button>'
          : '')
        + (canWrite() && !open
          ? '<button type="button" class="btn btn-ghost btn-small" data-rent-reopen="' + esc(r.id) + '" title="يفتح الاستئجار تاني — يمسح تاريخ النهاية">↻ فتح تاني</button>'
          : '')
        + (canWrite()
          ? '<button type="button" class="btn btn-ghost btn-small" data-rent-edit="' + esc(r.id) + '" title="تعديل التواريخ أو السعر">✏ تعديل</button>'
          : '')
        + (canRemove()
          ? '<button type="button" class="btn btn-danger btn-small" data-rent-del="' + esc(r.id) + '" title="حذف السجل نهائيًا">🗑 حذف</button>'
          : '')
        + '</div></td>'
        + '</tr>';
    }).join('');
  }

  /* ===== نافذة تسجيل/تعديل =====

     بنستخدم <dialog> زي باقي النوافذ في التطبيق. اختيار السيارة
     بقائمة فيها المتاح بس — سيارة عندها استئجار شغّال بتتحذف من
     القائمة (فيها استئجار مفتوح، مش عملي تسجّل فوقه). */
  function formHtml(edit) {
    var cars = (global.YahmaAppContext && global.YahmaAppContext.getFleet) ? global.YahmaAppContext.getFleet() : [];
    var opts = cars.map(function (c) {
      var busy = S().openForCar(c.id);
      if (busy && (!edit || String(busy.id) !== String(edit.id))) return '';
      var st = String(c.carStatus || '').trim();
      if (st && st !== 'مؤجرة' && !edit) {
        /* السيارة في حالة تانية (مسروقة/للبيع/تحت الصيانة) —
           تسجيل استئجار ليها هيغيّر حالتها لـ«مؤجرة»، وده قرار
           أكبر من تسجيل فاتورة. بنستبعدها ونقول السبب. */
        return '';
      }
      return '<option value="' + esc(c.id) + '"'
        + ((edit && String(edit.carId) === String(c.id)) ? ' selected' : '')
        + '>' + esc((c.plate || '—') + ' · ' + (c.branch || '—')) + '</option>';
    }).join('');

    return '<form method="dialog" class="modal-form" id="rent-form">'
      + '<div class="field"><label for="rent-car">السيارة</label>'
      + '<select id="rent-car" name="car" required' + (edit ? ' disabled' : '') + '>'
      + (edit ? '<option value="' + esc(edit.carId) + '" selected>'
        + esc(edit.plate || edit.carId) + '</option>' : '<option value="">— اختر —</option>')
      + opts + '</select>'
      + (edit ? '' : '<small class="muted-small">بتظهر بس السيارات المتاحة. السيارة اللي عندها استئجار شغّال أو في حالة تانية مش ظاهرة.</small>')
      + '</div>'
      + '<div class="field"><label for="rent-from">من تاريخ</label>'
      + '<input type="date" id="rent-from" name="start" required value="' + esc(edit ? edit.startDate : S().todayStr()) + '"></div>'
      + '<div class="field"><label for="rent-to">إلى تاريخ</label>'
      + '<input type="date" id="rent-to" name="end" value="' + esc(edit && edit.endDate ? edit.endDate : '') + '">'
      + '<small class="muted-small">سيبها فاضية = الاستئجار لسه شغّال</small></div>'
      + '<div class="field"><label for="rent-rate">سعر اليوم</label>'
      + '<input type="number" id="rent-rate" name="rate" min="0" step="0.01" value="'
      + esc(edit ? edit.dailyRate : '') + '" placeholder="من سعر السيارة">'
      + '<small class="muted-small">سعر اليوم وقت التسجيل — لو غيّرت السعر بعدين، إيراد الفترة دي ما يتغيّرش</small></div>'
      + '<div class="field"><label for="rent-note">ملاحظة</label>'
      + '<input type="text" id="rent-note" name="note" value="' + esc(edit ? edit.note : '') + '" placeholder="اختياري"></div>'
      + '<div id="rent-preview" class="muted-small"></div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn btn-ghost" id="rent-cancel">إلغاء</button>'
      + '<button type="submit" class="btn btn-primary" id="rent-save">' + (edit ? 'حفظ التعديل' : 'تسجيل الاستئجار') + '</button>'
      + '</div></form>';
  }

  /* المعاينة الحيّة: المستخدم يشوف المدة والمبلغ قبل ما يحفظ.
     من غيرها بيسجّل تاريخ غلط ولما يعرف بيكون فاتح 20 سجل.

     ⚠️ لو حقل السعر فاضي، المتجر بيرجع لسعر السيارة وقت الحفظ.
     فلازم المعاينة تعرض نفس الرقم ده — عرض «المبلغ: —» والمبلغ
     الحقيقي 2,000 يخلي المستخدم يفتكر إن الحقول مش شغالة. */
  function bindPreview(dlg) {
    var from = dlg.querySelector('#rent-from');
    var to = dlg.querySelector('#rent-to');
    var rate = dlg.querySelector('#rent-rate');
    var carSel = dlg.querySelector('#rent-car');
    var out = dlg.querySelector('#rent-preview');
    function carRate() {
      var r = parseFloat(rate.value);
      if (!isNaN(r) && rate.value !== '') return r;
      if (carSel) {
        var cars = (global.YahmaAppContext && global.YahmaAppContext.getFleet) ? global.YahmaAppContext.getFleet() : [];
        for (var i = 0; i < cars.length; i++) {
          if (String(cars[i].id) === String(carSel.value)) return parseFloat(cars[i].dailyRate) || 0;
        }
      }
      return null;
    }
    function upd() {
      var s = S();
      var f = s.normDate(from.value), t = s.normDate(to.value);
      if (!f) { out.textContent = ''; return; }
      var r = carRate();
      if (!t) {
        out.textContent = 'من ' + fmtDay(f) + ' — لسه شغّال. الأيام بتتحسب لحد النهاردة في التقرير.'
          + (r ? ' · بسعر ' + num(r) + ' ر.س/يوم' : '');
        return;
      }
      if (t < f) { out.textContent = '⚠️ تاريخ النهاية قبل تاريخ البداية'; return; }
      var d = s.daysBetween(f, t);
      var warn = d > s.MAX_DAYS ? ' ⚠️ المدة أطول من الحد المسموح (' + s.MAX_DAYS + ' يوم).' : '';
      out.textContent = 'المدة: ' + num(d) + ' يوم · المبلغ: '
        + (r ? num(d * r) + ' ر.س' : '— (من غير سعر)') + warn;
    }
    [from, to, rate, carSel].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', upd);
      el.addEventListener('change', upd);
    });
    upd();
  }

  function openForm(edit) {
    if (!guard(edit ? 'تعديل استئجار' : 'تسجيل استئجار')) return;
    var dlg = doc.createElement('dialog');
    dlg.className = 'modal';
    dlg.id = 'rent-dialog';
    dlg.innerHTML = '<div class="modal-head"><h3>' + (edit ? 'تعديل استئجار' : 'تسجيل استئجار') + '</h3></div>'
      + formHtml(edit);
    doc.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
    bindPreview(dlg);
    dlg.querySelector('#rent-cancel').addEventListener('click', function () { dlg.close(); dlg.remove(); });
    dlg.querySelector('#rent-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var carSel = dlg.querySelector('#rent-car');
      var start = S().normDate(dlg.querySelector('#rent-from').value);
      var end = S().normDate(dlg.querySelector('#rent-to').value);
      var rateRaw = dlg.querySelector('#rent-rate').value;
      var note = dlg.querySelector('#rent-note').value;

      var btn = dlg.querySelector('#rent-save');
      btn.disabled = true;
      try {
        if (edit) {
          var up = await S().updateRental(edit.id, edit.carId, {
            startDate: start, endDate: end,
            dailyRate: rateRaw === '' ? undefined : rateRaw,
            note: note
          });
          if (!up.ok) { alert(up.error); btn.disabled = false; return; }
          logIt('تعديل استئجار', (edit.plate || '') + (up.error ? ' — محلي بس' : ''));
        } else {
          var cars = (global.YahmaAppContext && global.YahmaAppContext.getFleet) ? global.YahmaAppContext.getFleet() : [];
          var car = null;
          cars.forEach(function (c) { if (String(c.id) === String(carSel.value)) car = c; });
          if (!car) { alert('اختر سيارة من القائمة.'); btn.disabled = false; return; }
          var res = await S().startRental(car, {
            startDate: start, endDate: end,
            dailyRate: rateRaw === '' ? undefined : rateRaw,
            note: note
          });
          if (!res.ok) { alert(res.error); btn.disabled = false; return; }
          /* ⭐ حالة السيارة → «مؤجرة». ده اتفق عليه: السيارة اللي بتتأجر
             مش متاحة للتأجير تاني. */
          var prev = String(car.carStatus || '');
          car.carStatus = 'مؤجرة';
          var saved = await global.saveData([car.id]);
          if (saved === false) {
            car.carStatus = prev;                 /* رجّع زي ما كان */
            await global.saveData([car.id]);
            alert('سجّلنا الاستئجار، بس تعذر حفظ حالة السيارة على Supabase — رجّعنا الحالة لـ«' + (prev || 'فارغة') + '». عدّلها من الأسطول لو عايز «مؤجرة».');
          }
          logIt('تسجيل استئجار', (car.plate || '') + (res.error ? ' — محلي بس' : ''));
        }
        dlg.close(); dlg.remove();
        global.__rentState = '';
        global.render();
      } catch (err) {
        if (typeof global.yahmaErr === 'function') global.yahmaErr(err, 'rentals.js:submit');
        alert('تعذر حفظ الاستئجار: ' + ((err && err.message) || err));
        btn.disabled = false;
      }
    });
  }

  /* إنهاء استئجار: حط تاريخ النهاية + اسأل عن حالة السيارة.
     الحالة الأصلية متسجّلة في prev_status، فبنعرضها ونرجّعها
     بس بإذن — مش تلقائي. */
  function endFlow(r) {
    if (!guard('إنهاء استئجار')) return;
    var car = carOf(r);
    var suggested = S().todayStr();
    var raw = prompt('تاريخ تسليم السيارة (' + (r.plate || '') + ') — اتركه فاضي لو لسه شغّال:\n' + suggested, suggested);
    if (raw === null) return;                       /* المستخدم رفض */
    var end = S().normDate(raw);
    if (raw.trim() && !end) { alert('التاريخ مش مفهوم. اكتبه بصيغة سنة-شهر-يوم.'); return; }
    if (end && end < S().normDate(r.startDate)) {
      alert('تاريخ التسليم قبل تاريخ الاستلام (' + r.startDate + ').');
      return;
    }
    (async function () {
      var res = await S().endRental(r.id, end);
      if (!res.ok) { alert(res.error); return; }
      /* ⚠️ لو السيارة لسه «مؤجرة»، رجّعها للحالة اللي كانت
         قبل الاستئجار — بإذن المستخدم. لو الحالة اتغيّرت لسبب
         تاني (مثلاً اتعلّمت مسروقة) مش بنلمسها. */
      if (car && String(car.carStatus || '') === 'مؤجرة') {
        var back = String(r.prevStatus || '').trim();
        if (back) {
          if (confirm('السيارة لسه بحالة «مؤجرة».\n\nترجعها لـ«' + back + '» اللي كانت قبل الاستئجار؟\n(اختر «إلغاء» لو عايز تسيبها «مؤجرة»)')) {
            car.carStatus = back;
            await global.saveData([car.id]);
          }
        } else {
          alert('السيارة لسه بحالة «مؤجرة» بس ما كانش متسجّل حالة قديمة — غيّرها من تبويب «الأسطول».');
        }
      }
      logIt('إنهاء استئجار', (r.plate || '') + (res.error ? ' — محلي بس' : ''));
      global.__rentState = '';
      global.render();
    })();
  }

  async function reopenFlow(r) {
    if (!guard('فتح استئجار منتهي')) return;
    if (!confirm('نفتح استئجار «' + (r.plate || '') + '» تاني؟\n\n'
      + '• تاريخ التسليم هيتشال\n'
      + '• الحساب هيبقى شغّال تاني لحد ما تحدد تاريخ جديد')) return;
    var res = await S().updateRental(r.id, r.carId, { endDate: '' });
    if (!res.ok) { alert(res.error); return; }
    logIt('فتح استئجار تاني', r.plate || '');
    global.render();
  }

  async function deleteFlow(r) {
    if (!guard('حذف استئجار')) return;
    if (!confirm('حذف سجل استئجار «' + (r.plate || '') + '» نهائيًا؟\n\n'
      + '• السجل هيمسح من القاعدة — مش هينفع تراجعه\n'
      + '• المدة (' + num(rowDays(r)) + ' يوم) هتتشال من التقارير\n'
      + '• لو الاستئجار لسه شغّال، حالتها هتفضل «مؤجرة» — غيّرها يدوي\n\nمتابعة؟')) return;
    var res = await S().removeRental(r.id, r.carId);
    if (!res.ok) { alert(res.error); return; }
    logIt('حذف استئجار', (r.plate || '') + (res.error ? ' — محلي بس' : ''));
    global.render();
  }

  function logIt(action, detail) {
    if (typeof global.log === 'function') {
      try { global.log(action, detail); } catch (_) { }
    }
  }

  function bind(root) {
    var add = root.querySelector('[data-rent-add]');
    if (add && !add._bound) {
      add._bound = true;
      add.addEventListener('click', function () { openForm(null); });
    }
    var q = root.querySelector('#rent-q');
    if (q && !q._bound) {
      q._bound = true;
      q.addEventListener('input', function () {
        global.__rentQ = q.value;
        if (typeof global.render === 'function') global.render();
      });
    }
    var st = root.querySelector('#rent-state');
    if (st && !st._bound) {
      st._bound = true;
      st.addEventListener('change', function () {
        global.__rentState = st.value;
        if (typeof global.render === 'function') global.render();
      });
    }
    root.querySelectorAll('[data-rent-end]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () {
        var r = findById(b.dataset.rentEnd);
        if (r) endFlow(r);
      });
    });
    root.querySelectorAll('[data-rent-reopen]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () {
        var r = findById(b.dataset.rentReopen);
        if (r) reopenFlow(r);
      });
    });
    root.querySelectorAll('[data-rent-edit]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () {
        var r = findById(b.dataset.rentEdit);
        if (r) openForm(r);
      });
    });
    root.querySelectorAll('[data-rent-del]').forEach(function (b) {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () {
        var r = findById(b.dataset.rentDel);
        if (r) deleteFlow(r);
      });
    });
  }

  function findById(id) {
    var all = S().localAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  /* ⭐ colspan بيتحسب من الترويسة — رقم ثابت هيتكسر أول ما نضيف
     عمود. نفس المنطق اللي في «الفحص» وفي التلات تبويبات الدفع. */
  function fixSpans(root) {
    var head = root.querySelector('.fleet-table thead tr');
    if (!head) return;
    var n = head.cells.length;
    root.querySelectorAll('.fleet-table .empty').forEach(function (cell) {
      cell.parentElement.colSpan = n;
    });
  }

  function render(content) {
    var title = doc.getElementById('topbar-title');
    var sub = doc.getElementById('topbar-sub');
    if (title) title.textContent = 'الاستئجارات';
    if (sub) sub.textContent = 'سجل الاستئجارات — التقرير بيحسب منه';

    var list = S().localAll();
    var addBtn = canWrite()
      ? '<button type="button" class="btn btn-primary btn-small" data-rent-add>+ تسجيل استئجار</button>'
      : '';

    content.innerHTML = summaryHtml(list)
      + '<div class="filter-panel"><div class="filter-panel-title">'
      + '<strong>الاستئجارات</strong>' + addBtn + '</div></div>'
      + syncWarn()
      + filterBar(list)
      + '<div class="table-scroll"><table class="fleet-table"><thead><tr>'
      + '<th>رقم اللوحة</th><th>الفرع</th><th>من تاريخ</th><th>إلى تاريخ</th>'
      + '<th>عدد الأيام</th><th>سعر اليوم</th><th>المبلغ</th>'
      + '<th>حالة السيارة</th><th>ملاحظات</th><th>المستخدم</th><th>إجراء</th>'
      + '</tr></thead><tbody>'
      + rowsHtml(list)
      + '</tbody></table></div>';

    bind(content);
    fixSpans(content);

    /* تصدير Excel/PDF — نفس العقد بتاع كل التبويبات:
       { title, subtitle, headers, rows } */
    var show = visible(list);
    global._yahmaCurrentPdfData = function () {
      return {
        title: 'سجل الاستئجارات',
        subtitle: 'عدد العمليات: ' + show.length + ' — استئجار شغّال: '
          + list.filter(S().isOpen).length,
        headers: ['رقم اللوحة', 'الفرع', 'من تاريخ', 'إلى تاريخ', 'عدد الأيام',
          'سعر اليوم', 'المبلغ', 'حالة السيارة', 'ملاحظات', 'المستخدم'],
        rows: show.map(function (r) {
          var car = carOf(r);
          return [
            r.plate || (car && car.plate) || '—',
            r.branch || (car && car.branch) || '—',
            r.startDate || '—',
            S().isOpen(r) ? 'شغّال' : (r.endDate || '—'),
            num(rowDays(r)),
            num(parseFloat(r.dailyRate) || 0),
            num(rowDays(r) * (parseFloat(r.dailyRate) || 0)),
            car ? String(car.carStatus || '—') : 'مش في الأسطول',
            r.note || '—',
            r.userName || '—'
          ];
        })
      };
    };
  }

  global.YahmaRentalsUI = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);