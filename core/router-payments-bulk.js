/* ===== core/router-payments-bulk.js — التحديد الجماعي =====
 *
 * التحديد الجماعي في دورة الفحص/الدفع/التجديد: الشريط، خلية التحديد،
 * الإجراءات الجماعية، وإزالة الصفوف المكرّرة.
 *
 * نفس الكود بنفس الأسماء — globals زي ما كان.
 */
/* ===== التحديد الجماعي في دورة الفحص/الدفع/التجديد =====

   الطلب: في كل التبويبات أقدر أعلّم على السيارات وآخد قرار
   جماعي — إرجاعها للتبويب اللي قبله أو نقلها للي بعده.

   كل الإجراءات دي موجودة أصلاً صف-بصف في نفس التبويبات. فاللي
   اتعمل هنا مش تنفيذ جديد، بل **نسخ جماعي على نفس الدوال** — لأن
   لو اتعمل مسار تاني للنسخة الجماعية، أي إصلاح في المنطق المفرد
   ما هيوصلش للجماعي، وده بالظبط اللي بيحصل في الكود المتشابه
   يدوي.

   cycle = الفحص ← تحت الدفع ← تم الدفع ← تم التجديد

   التحديد بيتشال بين كل رسم — الاختيار حالة مؤقتة مش قرار
   دائم، لو فضل محفوظ كان التحديد هيعلق على أسطر مش موجودة بعد
   ما الفلتر يتغير.

   canBulk يتحكم في الشريط كله. لكن الرجوع والإلغاء **إجراءات
   بتشيل بيانات**، فمقفولة بحد أعلى: canDelete() يعني المدير بس.
   ده نفس الفصل الموجود في «الفحص» — الشريط موجود، وزر الحذف
   جوه مقفول. التقديم والتأجيل بياخدوا canBulk. */

const PAY_CYCLE = ['renewals', 'payments', 'paid', 'renewed'];
const PAY_TAB_LABELS = { renewals:'الفحص', payments:'تحت الدفع', paid:'تم الدفع', renewed:'تم التجديد' };

/* الإجراءات المتاحة في كل تبويب. next/prev بالترتيب مش بالنص —
   لو ترتيب التبويبات اتغيّر، الرابط بينشغل لوحده. */
const PAY_TAB_ACTIONS = {
  payments: [
    { dir:'prev', act:'cancel', label:'↩ رجوع لِالفحص',
      kind:'destructive',
      title:'يشيل الطلب ويرجّع المحددة لِتبويب «الفحص» بحالة «لم يفحص»' },
    { dir:'next', act:'paid', label:'تسجيل الدفع ⇢ تم الدفع',
      kind:'advance',
      title:'يسجّل دفع الفحص للمحددة وينقلها لِتبويب «تم الدفع»' }
  ],
  paid: [
    { dir:'prev', act:'back', label:'↩ رجوع لِتحت الدفع',
      kind:'destructive',
      title:'بيشيل تاريخ الدفع ويرجّع حالة الفحص للمحددة، ويخليها في «تحت الدفع»' },
    { dir:'next', act:'renew', label:'📅 تجديد الرخصة ⇢ تم التجديد',
      kind:'advance',
      title:'يجدّد رخصة المحددة 3 سنين و ينقلها لِتبويب «تم التجديد»' }
  ],
  renewed: [
    { dir:'prev', act:'back2', label:'↩ رجوع لِتم الدفع',
      kind:'destructive',
      title:'بيشيل سجل «تم التجديد» ويرجّع تاريخ الرخصة القديم، والمحددة تفضل في «تم الدفع»' }
  ]
};

const PAY_SELECTIONS = Object.create(null);

/* ينادي الإجراءwhatever لو مفعّل، ويقفل لو المرفوض.
   بيرجّع false من غير تغيير لو المستخدم رفض التأكيد. */
function canBulkPayAction(action, kind) {
  const need = (kind === 'destructive')
    ? (window.YahmaPerms && typeof window.YahmaPerms.canDelete === 'function' ? window.YahmaPerms.canDelete() : window.currentRole === 'admin')
    : canRunPayments(action);
  if (!need) {
    alert((window.YahmaPerms && typeof window.YahmaPerms.denyMessage === 'function'
      ? window.YahmaPerms.denyMessage(action)
      : 'ليس لديك صلاحية ' + action + '.'));
    return false;
  }
  return true;
}

function selectedPayRows(tab) {
  const ids = PAY_SELECTIONS[tab];
  if (!ids || !ids.size) return [];
  const out = [];
  ids.forEach(function (id) {
    const item = currentPayRowFor(tab, id);
    if (item) out.push(item);
  });
  return out;
}

/* خريطة السطر الحالي: id الطلب → {item, car}. كل تبويب بيعرف
   يجمّع صفوفه بنفس الطريقة، فالمحدد بيتشال صح بعد أي رسم. */
let PAY_ROW_INDEX = Object.create(null);
function currentPayRowFor(tab, itemId) {
  const entry = PAY_ROW_INDEX[tab] && PAY_ROW_INDEX[tab][itemId];
  return entry || null;
}

/* ⭐ التقرير بعد أي نسخة جماعية — **متشرك** بين كل الإجراءات.
   أول مرة كانت الرسالة «تم» أو سطر من الفشل بس. المستخدم كان
   بيقرأ «تم» ويقول في حال فيه فشل، ودي نفس المشكلة اللي بتتحل
   دايماً: النجاح بيبان والإخفاء بيبان.
   الشكل: X اتنفذت · Y اتخطّت · Z فشل [باللوحات].
   والعدد المحدد من الأول بيتبقّى في النص عشان يبقى واضح إن اتخطّت
   وفشل مش ناسيهم. */
function payBulkReport(sel, moved, skipped, failed) {
  const parts = [];
  if (moved) parts.push(moved + ' اتنفذت');
  if (skipped) parts.push(skipped + ' اتخطّت');
  if (failed.length) parts.push(failed.length + ' فشلت: ' + failed.slice(0, 6).join('، ') + (failed.length > 6 ? ' (+' + (failed.length - 6) + ')' : ''));
  const head = 'من ' + sel + ' محددة: ';
  return parts.length ? head + parts.join(' · ') : head + 'مفيش حاجة اتغيّرت.';
}

/* ===== خلية التحديد والشريط =====

   مصدر واحد للثلاث تبويبات: عمود الترويسة، خلية السطر، والشريط.
   لو كل تبويب كان له نسخة، أول تعديل على واحد هيفصل التلاتة. */

/* عمود التحديد بيتطابق مع الشريط: لو مالوش شريط، مالوش
   checkbox. «مشاهدة» كانت هتشوف مربعات تحديد تضغط عليها
   ومفيش حاجة تحصل — أحسن ما نخفيها خالص. */
function payCheckHeader(tab, allIds) {
  if (!canBulkHere()) return '';
  const n = selectedPayRows(tab).length;
  const all = allIds.length > 0 && n === allIds.length;
  return '<th class="th-check"><input type="checkbox" id="pay-head-' + tab + '"'
    + ' data-pay-head="' + tab + '"' + (all ? ' checked' : '')
    + ' aria-label="تحديد كل السيارات"></th>';
}

function payCheckCell(tab, itemId, plate) {
  if (!canBulkHere()) return '';
  const set = PAY_SELECTIONS[tab];
  const on = set ? set.has(String(itemId)) : false;
  return '<td class="td-check"><input type="checkbox" class="row-check" data-pay-check="'
    + escapeHtml(String(itemId)) + '" data-pay-tab="' + tab + '"'
    + (on ? ' checked' : '')
    + ' aria-label="تحديد السيارة ' + escapeHtml(plate || '—') + '"></td>';
}

/* ⭐ الشريط بياخد نفس التركيب بالظبط لشريط «الفحص»:
   .bulk-bar > (.bulk-bar-info + .bulk-bar-actions).

   مش رفاهية — التنسيق بييجي من 04-dark-overrides.css، وزوايا
   bulk-bar-actions هي اللي بتلوّن الأزرار أبيض على التدرّج
   الغامق. لو حطيت الأزرار مباشرة جوه bulk-bar، النص هيطلع
   غامق على غامق: الشريط يبان موجود والزراير مقروءة لأحد. */
/* ===== نقل الإداري بين مراحل الدورة =====

   «إداري» (manager) و«مدير النظام» (admin) يقدروا يعلّموا على سيارات
   في أي تبويب من الأربعة وينقلوها لأي مرحلة تانية — مش بس الخطوة
   اللي بعدها. «تشغيل» مالوش غير «تم الفحص» في تبويب الفحص.

   النقل مش بيكتب حالة على السيارة وخلاص: بيمشي على نفس دوال المفرد
   (PAY_ITEM_ACTION) خطوة خطوة — عشان الأثر على السحابة وحالة الرخصة
   وحالة الفحص يبقى هو هو اللي بيحصل لو المستخدم عملها بإيده. */

function payMovableRole() {
  const r = (typeof currentRole !== 'undefined' ? currentRole
    : (typeof window !== 'undefined' ? window.currentRole : ''));
  return r === 'admin' || r === 'manager';
}

function payItemOfCar(carId) {
  try {
    if (!window.YahmaPayments || typeof window.YahmaPayments.localAll !== 'function') return null;
    const all = window.YahmaPayments.localAll();
    for (let i = 0; i < all.length; i++) {
      if (String(all[i].carId) === String(carId)) return all[i];
    }
  } catch (e) { yahmaErr(e, 'router-payments-bulk.js:payItemOfCar'); }
  return null;
}

/* المرحلة الحالية للسيارة من الطابور — مصدر واحد للحقيقة */
function payStageOf(carId) {
  const item = payItemOfCar(carId);
  if (!item) return 'renewals';
  if (String(item.status) === 'pending') return 'payments';
  if (String(item.status) === 'paid') {
    const renewed = (window.YahmaPayments && typeof window.YahmaPayments.isRenewed === 'function')
      ? window.YahmaPayments.isRenewed(item) : false;
    return renewed ? 'renewed' : 'paid';
  }
  return 'renewals';
}

/* سطور التحذير في نافذة التأكيد — الرجوع لورا بيمسح بيانات،
   فلازم المستخدم يقراها قبل ما يوافق. */
function payMoveWarning(from, target) {
  const order = ['renewals', 'payments', 'paid', 'renewed'];
  const lines = [];
  const forward = order.indexOf(target) > order.indexOf(from);
  if (order.indexOf(target) < order.indexOf(from)) {
    if (from === 'renewed') lines.push('• سجل «تم التجديد» هيتشال وتاريخ الرخصة هيرجع للقديم');
    if (from === 'renewed' || from === 'paid') lines.push('• تاريخ الدفع هيتشال من الطلب');
    if (target === 'renewals') lines.push('• السيارة هترجع لِتبويب «الفحص» بحالة «' + NOT_INSPECTED + '»');
  }
  if (forward) {
    if (target === 'payments') lines.push('• هيتعمل طلب دفع جديد في «تحت الدفع»');
    if (target === 'paid') lines.push('• هيتسجل دفع تجديد الفحص للمحددة');
    if (target === 'renewed') lines.push('• الرخصة هتتجدد 3 سنين من تاريخ اليوم');
  }
  return lines.length ? '\n\n' + lines.join('\n') : '';
}

/* نقل سيارة واحدة لأي مرحلة — بيمشي بالخطوات المطلوبة بالترتيب. */
async function payMoveOne(car, target) {
  if (!car) return 'failed';
  let stage = payStageOf(car.id);
  if (stage === target) return 'skipped';

  /* ١) الرجوع خطوات لورا لحد ما نوصل للمرحلة المطلوبة أو للي قبلها */
  if (target === 'renewals') {
    if (stage === 'renewed') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.back2(it, car, true);
      if (r !== 'done') return r;
      stage = 'paid';
    }
    if (stage === 'paid') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.back(it, car, true);
      if (r !== 'done') return r;
      stage = 'payments';
    }
    if (stage === 'payments') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      return await PAY_ITEM_ACTION.cancel(it, car, true);
    }
    /* مفيش طلب من الأساس — نرجّع حالة الفحص بس */
    if (car.inspectionStatus !== NOT_INSPECTED) {
      const before = car.inspectionStatus;
      car.inspectionStatus = NOT_INSPECTED;
      const saved = await saveData([car.id]);
      if (saved === false) {
        car.inspectionStatus = before;
        await saveData([car.id]);
        return 'failed';
      }
    }
    return 'done';
  }

  /* ٢) ضمان وجود طلب في «تحت الدفع» قبل أي خطوة قدام.
     نفس ترتيب bulkAdvanceToPayment: حالة الفحص الأول (وحفظ)،
     وبعدين تسجيل الطلب — عشان لو الحفظ فشل ما نعملش طلب
     لسيارة لسه «لم يفحص». */
  if (stage === 'renewals') {
    if (!window.YahmaPayments || typeof window.YahmaPayments.requestPayment !== 'function') return 'failed';
    if (car.inspectionStatus !== 'تم الفحص') {
      const before = car.inspectionStatus;
      car.inspectionStatus = 'تم الفحص';
      const saved = await saveData([car.id]);
      if (saved === false) {
        car.inspectionStatus = before;
        await saveData([car.id]);
        return 'failed';
      }
    }
    await window.YahmaPayments.requestPayment(car);
    stage = 'payments';
  }

  if (target === 'payments') {
    if (stage === 'renewed') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.back2(it, car, true);
      if (r !== 'done') return r;
      stage = 'paid';
    }
    if (stage === 'paid') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.back(it, car, true);
      if (r !== 'done') return r;
      stage = 'payments';
    }
    return stage === 'payments' ? 'done' : 'failed';
  }

  if (target === 'paid') {
    if (stage === 'renewed') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.back2(it, car, true);
      if (r !== 'done') return r;
      stage = 'paid';
    }
    if (stage === 'payments') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.paid(it, car, true);
      if (r !== 'done') return r;
      stage = 'paid';
    }
    return stage === 'paid' ? 'done' : 'failed';
  }

  if (target === 'renewed') {
    if (stage === 'payments') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.paid(it, car, true);
      if (r !== 'done') return r;
      stage = 'paid';
    }
    if (stage === 'paid') {
      const it = payItemOfCar(car.id);
      if (!it) return 'failed';
      const r = await PAY_ITEM_ACTION.renew(it, car, true);
      if (r !== 'done') return r;
      stage = 'renewed';
    }
    return stage === 'renewed' ? 'done' : 'failed';
  }

  return 'failed';
}

/* النسخة الجماعية: تأكيد واحد، تنفيذ واحد واحد، تقرير بالأرقام. */
async function runPayMove(tab, target) {
  if (!payMovableRole()) {
    alert('النقل بين مراحل الدورة متاح للمدير والإداري فقط.');
    return;
  }
  const items = selectedPayRows(tab);
  if (!items.length) { alert('لم تحدّد أي سيارة. علّم على سيارة واحدة على الأقل.'); return; }
  if (!PAY_TAB_LABELS[target]) return;

  let from = tab;
  const plates = items.map(function (r) { return (r.car && r.car.plate) || r.item.plate || '—'; });
  const warn = payMoveWarning(from, target);
  if (!confirm('نقل ' + items.length + ' سيارة إلى «' + PAY_TAB_LABELS[target] + '»؟\n'
    + plates.join('، ') + warn + '\n\nمتابعة؟')) return;

  let moved = 0, skipped = 0;
  const failed = [];
  for (const row of items) {
    const plate = (row.car && row.car.plate) || row.item.plate || String(row.item.id);
    try {
      const car = (row.car && row.car.id) ? row.car
        : (Array.isArray(fleet) ? fleet.find(function (c) { return String(c.id) === String(row.item.carId); }) : null);
      const res = await payMoveOne(car, target);
      if (res === 'done') moved++;
      else if (res === 'failed') failed.push(plate);
      else skipped++;
    } catch (e) {
      yahmaErr(e, 'router-payments-bulk.js:runPayMove:' + target);
      failed.push(plate);
    }
  }
  PAY_SELECTIONS[tab] = new Set();
  alert(payBulkReport(items.length, moved, skipped, failed));
  if (typeof log === 'function') {
    try { log('نقل مرحلة — ' + (PAY_TAB_LABELS[tab] || tab), 'إلى ' + PAY_TAB_LABELS[target] + ': ' + moved + ' اتنفذت'); }
    catch (e) { yahmaErr(e, 'router-payments-bulk.js:runPayMove:log'); }
  }
  render();
}

function payBulkBarFor(tab) {
  const actions = PAY_TAB_ACTIONS[tab] || [];
  /* bar بيظهر بـcanBulk بس. Ehrenutzer «مشاهدة» مالوش شريط
     خالص —Checks ميتsummatش من غير حاجة تعمل بيها. */
  if (!actions.length || !canBulkHere()) return '';
  /* مجموعة «نقل المحددة (إداري)» — للمدير والإداري بس.
     بتظهر في التلات تبويبات وبتنقل لأي مرحلة من الأربعة.
     لما المجموعة تكون ظاهرة بنستغنى عن أزرار الخطوة الواحدة فوقها:
     «رجوع لِتحت الدفع» و«تحت الدفع» في المجموعة نفس الحاجة بالظبط،
     و«تم الدفع» كان بيظهر مرتين في نفس الشريط. */
  const moveBtns = payMovableRole() ? PAY_CYCLE.filter(function (t) { return t !== tab; }).map(function (t) {
    return '<button type="button" class="btn btn-ghost btn-small" data-pay-move="' + t
      + '" data-pay-tab="' + tab + '" title="نقل المحددة إلى «' + PAY_TAB_LABELS[t] + '»">'
      + PAY_TAB_LABELS[t] + '</button>';
  }).join('') : '';
  const moveGroup = moveBtns
    ? '<div class="admin-transfer-group" style="display:inline-flex;gap:4px;align-items:center;background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:6px;flex-wrap:wrap;">'
      + '<span style="font-size:11px;font-weight:bold;color:#0e8f8d">نقل المحددة (إداري):</span>' + moveBtns + '</div>'
    : '';
  const btns = moveBtns ? '' : actions.map(function (a) {
    /* canBulk بيحدد وجود الشريط. الإجراء المدمر (رجوع/إلغاء)
       بياخد canDelete = المدير بس. */
    const granted = a.kind !== 'destructive' || canDeleteHere();
    if (!granted) return '';
    const cls = a.kind === 'destructive' ? 'btn-ghost' : 'btn-primary';
    return '<button type="button" class="btn ' + cls + ' btn-small" data-pay-act="' + escapeHtml(a.act)
      + '" data-pay-tab="' + tab + '" title="' + escapeHtml(a.title || a.label) + '">'
      + escapeHtml(a.label) + '</button>';
  }).join('');
  /* display:none من الأول زي شريط «الفحص» — الشريط يظهر مع أول
     تحديد، مش مع أول رسم. */
  return '<div class="bulk-bar" id="pay-bulk-bar-' + tab + '" style="display:none">'
    + '<div class="bulk-bar-info"><span id="pay-bulk-count-' + tab + '">0 محددة</span></div>'
    + '<div class="bulk-bar-actions">' + btns + moveGroup
    + '<button type="button" class="btn btn-ghost btn-small" data-pay-clear="' + tab + '">إلغاء التحديد</button>'
    + '</div></div>';
}

/* ⭐ سطر «لا توجد نتائج» بيتحسب بعدد الأعمدة في الترويسة.
   رقم ثابت هيتكسر أول ما نضيف عمود، والحاجة بتظهر كسطر قصير
   في نص الجدول — أوضح الكلام اللي المستخدم بيشوفه. نفس الفكرة
   اللي اتعملت في «الفحص» (colCount من #ren-table thead). */
function fixPaySpans(content) {
  const head = content.querySelector('.fleet-table thead tr');
  if (!head) return;
  const n = head.cells.length;
  content.querySelectorAll('.fleet-table .empty').forEach(function (cell) {
    cell.parentElement.colSpan = n;
  });
}

/* تحديث حالة الشريط بعد أي تغيير في التحديد.
   ⭐ نستخدم PAY_SELECTIONS[tab].size مباشرة للعد — مش selectedPayRows()
   لأن selectedPayRows بترجع بس اللي في PAY_ROW_INDEX الحالي (المفلتر)،
   فلو فلترت بالبحث والسيارات المحددة مش في الـindex، العد بيبان صفر. */
function payBulkBarHtml(tab) {
  const bar = document.getElementById('pay-bulk-bar-' + tab);
  const head = document.querySelector('input[data-pay-head="' + tab + '"]');
  const allCount = Object.keys(PAY_ROW_INDEX[tab] || {}).length;
  const selCount = (PAY_SELECTIONS[tab] || new Set()).size;
  if (head) {
    head.checked = allCount > 0 && selCount === allCount;
    head.indeterminate = selCount > 0 && selCount < allCount;
  }
  if (!bar) return;
  bar.style.display = selCount ? '' : 'none';
  const cnt = document.getElementById('pay-bulk-count-' + tab);
  if (cnt) {
    cnt.textContent = selCount + ' محددة'
      + ' من ' + allCount;
  }
}

function canBulkHere() {
  try {
    if (typeof window.YahmaPerms === 'object' && typeof window.YahmaPerms.canBulk === 'function') {
      return !!window.YahmaPerms.canBulk();
    }
    return !(typeof currentRole !== 'undefined' && currentRole === 'view');
  } catch (_) { return false; }
}

function canDeleteHere() {
  try {
    if (typeof window.YahmaPerms === 'object' && typeof window.YahmaPerms.canDelete === 'function') {
      return !!window.YahmaPerms.canDelete();
    }
    return currentRole === 'admin';
  } catch (_) { return false; }
}

/* يربط التحديد والشريط. تفويض واحد على الـtbody مش listener لكل
   صف — الجدول بيعاد بناؤه مع كل رسم. */
async function handleDeleteCarFromPaymentRow(carId, plate) {
  if (!canDeleteHere()) {
    alert('الحذف متاح لمدير النظام فقط.');
    return;
  }
  const car = (Array.isArray(fleet) ? fleet : []).find(c => String(c.id) === String(carId));
  const carPlate = plate || (car && car.plate) || carId;
  if (!confirm('هل تريد بالتأكيد حذف السيارة ' + carPlate + ' نهائيًا من الأسطول وقاعدة البيانات؟')) {
    return;
  }
  try {
    if (typeof deleteVehicleFromCloud === 'function') {
      await deleteVehicleFromCloud(carId);
    }
    if (Array.isArray(fleet)) {
      fleet = fleet.filter(c => String(c.id) !== String(carId));
      if (typeof window !== 'undefined') window.fleet = fleet;
    }
    if (window.YahmaPayments && typeof window.YahmaPayments.cancel === 'function') {
      try {
        var all = window.YahmaPayments.localAll();
        for (var p of all) {
          if (String(p.carId) === String(carId)) {
            await window.YahmaPayments.cancel(p.id, carId);
          }
        }
      } catch (_) {}
    }
    if (typeof saveData === 'function') {
      await saveData();
    }
    if (typeof render === 'function') render();
    alert('تم حذف السيارة ' + carPlate + ' بنجاح.');
  } catch (err) {
    console.error('Delete car failed:', err);
    alert('فشل حذف السيارة: ' + (err && err.message || err));
  }
}

function bindPaySelection(content, tab) {
  const tbody = content.querySelector('.fleet-table tbody');
  if (!tbody) return;
  payBulkBarHtml(tab);

  /* ⭐ الإصلاح الجذري: بنربط الـlisteners على content (بيفضل موجود)
     مش على tbody (بيتدمر ويتعاد إنشاؤه كل render).
     الـguard بيتحط على content مش على tbody.

     ⚠️ سبب «ضغطتين» على الموبايل:
     - المتصفح على موبایل بيطلق click → handler كان يقول return
       لو الهدف checkbox → فالضغطة الأولى ما بتعملش حاجة.
     - change بيطلق بعد click بتأخير (أو مش بيطلق في بعض الحالات).

     الحل: click handler يشتغل على الـcheckbox برضو — لكن نقرأ
     checked *بعد* ما المتصفح يقلبها (setTimeout 0).
     مش بنقلبها يدويًا عشان نتجنب double-flip. */
  if (!content._paySelectDelegate) {
    content._paySelectDelegate = true;

    function applyPayCheck(box) {
      const t = box.dataset.payTab;
      const id = String(box.dataset.payCheck);
      const set = PAY_SELECTIONS[t] || (PAY_SELECTIONS[t] = new Set());
      if (box.checked) set.add(id); else set.delete(id);
      const tr = box.closest('tr');
      if (tr) tr.classList.toggle('is-selected', box.checked);
      payBulkBarHtml(t);
    }

    /* ⭐ قراءة الحالة بعد ما المتصفح يقلب.

       السبب: وقت الـclick handler، المتصفح لسه ما قلبش box.checked
       (Chrome بيقلبها في "pre-click activation" بس الـproperty لسه
       قديمة وقت الـhandler). فكان applyPayCheck بيشوف القيمة القديمة
       وبيعمل delete بدل add — والضغط بيحتاج ضغطتين.

       الحل: نؤجّل قراءة الحالة لـsetTimeout(0) — بعد ما المتصفح
       يقلب فعلاً. والـcheckbox بيتحدث في الشاشة صح من غير ما
       نعمل double-flip. */
    function applyPayCheckSoon(box) {
      box._payHandled = true;
      setTimeout(function () { applyPayCheck(box); }, 0);
    }

    content.addEventListener('click', function (e) {
      /* زر أو لينك أو input تاني — نتجاهل */
      if (e.target.closest('button, a, select, textarea, .row-actions')) return;
      if (!canBulkHere()) return;

      const box = e.target.closest ? e.target.closest('input[data-pay-check]') : null;
      if (box) {
        if (box.disabled) return;
        /* ⭐ التفرقة مهمة:
           - ضغط على الـcheckbox **نفسه**: المتصفح قلب الـchecked
             (pre-click activation) — نقرأ القيمة بعدين بـsetTimeout.
           - ضغط على **الخلية** (الـtd): المتصفح **ما بيقلبش** الـcheckbox
             خالص! فلازم نقلبه بنفسنا. من غير التفرقة دي، الضغط على
             الخلية كان بيقرأ قيمة قديمة وبيعمل delete — فالضغط
             على الخلية كان بيلغي التحديد بدل ما يزيد (والدور
             كان بيلزم ضغطتين). */
        if (e.target === box) {
          applyPayCheckSoon(box);
        } else {
          box.checked = !box.checked;
          applyPayCheck(box);
        }
        return;
      }

      /* الضغطة على مكان تاني في الصف — نقلب checked يدويًا */
      const tr = e.target.closest('tr');
      if (!tr) return;
      const cb = tr.querySelector('input[data-pay-check]');
      if (!cb || cb.disabled) return;
      cb.checked = !cb.checked;
      applyPayCheck(cb);
    });

    /* ⭐ شبكة أمان: لو الـclick handler اتخطّى (مثلاً programmatic
       change)، الـchange handler بيشتغل. الـonchange بيقرأ الحالة
       بعد ما المتصفح يقلب — فبيكون صح دايماً. */
    content.addEventListener('change', function (e) {
      const box = e.target.closest ? e.target.closest('input[data-pay-check]') : null;
      if (!box || box.disabled) return;
      /* لو الـclick handler اشتغل بالفعل، ما نعملش التحديث مرتين */
      if (box._payHandled) { box._payHandled = false; return; }
      applyPayCheck(box);
    });
  }

  const head = content.querySelector('input[data-pay-head="' + tab + '"]');
  if (head) {
    head.onclick = null;
    const headTh = head.closest('th');
    if (headTh && !headTh._bound) {
      headTh._bound = true;
      headTh.addEventListener('click', function(e) {
        if (e.target === head) return;
        head.checked = !head.checked;
        head.dispatchEvent(new Event('change'));
      });
    }
    head.onchange = function () {
      const all = Object.keys(PAY_ROW_INDEX[tab] || {});
      PAY_SELECTIONS[tab] = head.checked ? new Set(all) : new Set();
      content.querySelectorAll('input[data-pay-check][data-pay-tab="' + tab + '"]').forEach(function (cb) {
        cb.checked = head.checked;
      });
      payBulkBarHtml(tab);
    };
  }

  const clear = content.querySelector('[data-pay-clear="' + tab + '"]');
  if (clear) clear.onclick = function () {
    PAY_SELECTIONS[tab] = new Set();
    content.querySelectorAll('input[data-pay-check][data-pay-tab="' + tab + '"]').forEach(function (cb) {
      cb.checked = false;
    });
    if (head) { head.checked = false; head.indeterminate = false; }
    payBulkBarHtml(tab);
  };

  content.querySelectorAll('[data-del-car]').forEach(function (b) {
    if (b._delBound) return;
    b._delBound = true;
    b.onclick = async function (e) {
      e.stopPropagation();
      await handleDeleteCarFromPaymentRow(b.dataset.delCar, b.dataset.plate);
    };
  });

  content.querySelectorAll('[data-pay-act]').forEach(function (b) {
    if (b._payBound) return;
    b._payBound = true;
    b.onclick = function () { runPayBulk(b.dataset.payTab, b.dataset.payAct); };
  });

  /* أزرار «نقل المحددة (إداري)» — لأي مرحلة من الأربعة */
  content.querySelectorAll('[data-pay-move]').forEach(function (b) {
    if (b._payMoveBound) return;
    b._payMoveBound = true;
    b.onclick = function () { runPayMove(b.dataset.payTab, b.dataset.payMove); };
  });
}

/* ينفّذ الإجراء على المحدَّد واحد واحد — عشان نعرف مين اتنفذ
   ومين لأ، ولعلاش. ما فيش Promise.all هنا: ترتيب العمليات مقصود
   (حفظ حالة الفحص قبل الطلب)، وفشل واحدة لازم ما يوقفش الباقي. */
/* ينفّذ الإجراء على المحدَّد واحد واحد — عشان نعرف مين اتنفذ
   ومين لأ، ولعلاش. ما فيش Promise.all هنا: ترتيب العمليات مقصود
   (حفظ حالة الفحص قبل الطلب)، وفشل واحدة لازم ما يوقفش الباقي.

   ⚠️ مفيش معامل items — التحديد بيتقرا هنا وقت الضغط.
   أول نسخة كتبتها (tab, action, items) و<b>الزراير نادتها
   بمعاملين</b>، فـitems كان undefined والضربة بتعمل
   TypeError على items.length — يعني الشريط الجماعي كله كان
   ميّتشتغلش، صامت ومن غير أي رسالة للمستخدم. التحديد جواها
   بالظبط عشان يتقرا من الخريطة وقت الضغط، بعد أي رسم. */
async function runPayBulk(tab, action) {
  const items = selectedPayRows(tab);
  if (!items.length) { alert('لم تحدّد أي سيارة. علّم على سيارة واحدة على الأقل.'); return; }
  if (!canBulkPayAction(action, PAY_TAB_ACTIONS[tab].find(function(a){ return a.act === action; }).kind)) return;

  const plates = items.map(function (r) { return r.car.plate || r.item.plate || '—'; });
  /* ⭐ رسالة التأكيد بتقول إيه اللي هيحصل. الإجراء المدمر
     (رجوع/إلغاء) بيرجّع حالة الفحص أو الرخصة للقيمة المسجّلة
     لكل سيارة، والتفاصيل دي كانت بتظهر في نافذة كل سيارة —
     والنسخة الجماعية بتكتمها (20 نافذة = تجربة معطّلة).
     فلازم التفاصيل تطلع هنا جوه النافذة الواحدة، وإلا بقى
     المستخدم بيضغط على عملية بتغيّر بيانات من غير ما يعرف. */
  const meta = action === 'renew'
    ? '\n\nتاريخ انتهاء الرخصة الجديد: ' + paySuggestedLicenseDate()
      + '\n(التاريخ المقترح هيتطبّق على كل المحددة — غيّره بعدين من «الفحص» لو عايز غير كده)'
    : (action === 'cancel'
      ? '\n\n• الطلب هيتشال من «تحت الدفع»\n• كل سيارة هترجع لِتبويب «الفحص» بحالة «'
        + NOT_INSPECTED + '»'
      : (action === 'back'
        ? '\n\n• تاريخ الدفع هيتشال\n• حالة الفحص هترجع للقيمة اللي كانت مسجّلة وقت الدفع'
        : (action === 'back2'
          ? '\n\n• سجل «تم التجديد» هيتشال\n• تاريخ الرخصة هيرجع القديم'
          : '')));
  if (!confirm('هيتطبّق على ' + items.length + ' سيارة:\n' + plates.join('، ') + meta + '\n\nمتابعة؟')) return;

  let moved = 0, skipped = 0;
  const failed = [];
  for (const row of items) {
    const plate = row.car.plate || row.item.plate || String(row.item.id);
    try {
      /* ملاحظة: الدوال المفردة بترسم لوحدها عند النجاح (الرجوع
         بيقفل بـrender عشان يحدّث التبويب)، فالنسخة الجماعية
         بترسم مرة واحدة في الآخر. */
      const res = await PAY_ITEM_ACTION[action](row.item, row.car, true);
      /* ⭐ التلات حالات منفصلة، وخصوصاً «فشل» ما بتتحسبش
         «اتنفذت». أول نسخة كانت:
             if (res === 'skipped') skipped++; else moved++;
         فـ«فشل» كان بيدخل في moved. النتيجة على 20 سيارة:
         «19 اتنفذت · 1 اتخطّت · 2 فشلت» — جمعها 22.
         المستخدم بيقرأ «19 اتنفذت» وهي 17، وبياخد قرار غلط
         على أساس إن الحفظ خلص.
         والعدّ لازم يساوي العدد المحدد بالظبط — التقرير بيقول
         كده للمستخدم فلازم يبقى صح. */
      if (res === 'done') moved++;
      else if (res === 'failed') failed.push(plate);
      else skipped++;
    } catch (e) {
      yahmaErr(e, 'render-router.js:runPayBulk:' + action);
      failed.push(plate);
    }
  }
  PAY_SELECTIONS[tab] = new Set();
  alert(payBulkReport(items.length, moved, skipped, failed));
  if (typeof log === 'function') {
    try { log('إجراء جماعي — ' + (PAY_TAB_LABELS[tab] || tab), action + ': ' + moved + ' اتنفذت' + (failed.length ? ' · ' + failed.length + ' فشلت' : '')); }
    catch (e) { yahmaErr(e, 'render-router.js:runPayBulk:log'); }
  }
  render();
}

function deduplicatePaymentRows(rows){
  var seen = new Set();
  var out = [];
  var norm = typeof normalizePlateKey === 'function' ? normalizePlateKey : (function(p){
    return String(p || '').replace(/\s+/g, '').toLowerCase();
  });
  var sorted = (Array.isArray(rows) ? rows : []).slice().sort(function(a, b){
    var ta = new Date((a.item && (a.item.requestedAt || a.item.paidAt || a.item.renewedAt)) || 0).getTime();
    var tb = new Date((b.item && (b.item.requestedAt || b.item.paidAt || b.item.renewedAt)) || 0).getTime();
    return tb - ta;
  });
  for (var i = 0; i < sorted.length; i++) {
    var r = sorted[i];
    var pKey = (r.car && r.car.plate && norm(r.car.plate)) || (r.item && r.item.plate && norm(r.item.plate)) || (r.car && r.car.id) || (r.item && r.item.carId);
    if (!pKey || seen.has(pKey)) continue;
    seen.add(pKey);
    out.push(r);
  }
  return out;
}

