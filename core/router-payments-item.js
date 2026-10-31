/* ===== core/router-payments-item.js — منطق المفرد =====
 *
 * دورة المفرد: الرجوع للمرحلة السابقة، أعمدة البيانات اللي بتتمشى
 * مع السيارة، الملاحظات، واسم المستخدم المسجّل للطلب.
 *
 * نفس الكود بنفس الأسماء — globals زي ما كان.
 */
/* ===== الرجوع للمرحلة السابقة =====

   السلسلة: الفحص ← تحت الدفع ← تم الدفع ← تم التجديد

   كل انتقال أمامي بيكتب على بيانات السيارة (حالة الفحص، تاريخ
   الرخصة)، فالرجوع لورا لازم يرجّع الكتابة دي برضو — غير كده
   السيارة هتطلع «سليم» برخصة متجددة رغم إن الطلب رجع طور.

   الحقول القديمة متخزّنة في `prev_state` على جدول الدفعات، بتتسجّل
   لحظة الانступ قدام في rememberCarState(). الحقول اللي مش في
   اللقطة دي ما اتغيرتش في المرحلة دي، فبنسيبها زي ما هي. */
const STAGE_BACK_FIELDS = {
  paid:       ['inspectionStatus'],
  renewed:    ['licenseExpiry', 'licenseStatus']
};
function applyPrevState(car, snapshot, stage){
  if(!car) return [];
  const fields = STAGE_BACK_FIELDS[stage] || [];
  const changed = [];
  fields.forEach(function(f){
    if(!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, f)) return;
    if(car[f] === snapshot[f]) return;
    car[f] = snapshot[f];
    changed.push(f);
  });
  return changed;
}
/* سطور توضيح للحوار: إيه اللي هيتغيّر بالظبط — المستخدم يقرأ
   ويوافق، بدل ما يقفل عتامة ويكتشف بعدين. */
function prevRestoreLines(car, snapshot, stage){
  const out = [];
  if(STAGE_BACK_FIELDS[stage].indexOf('inspectionStatus') >= 0){
    out.push('• حالة الفحص هترجع لـ«' + ((snapshot && snapshot.inspectionStatus) || 'لم يفحص') + '»');
  }
  if(STAGE_BACK_FIELDS[stage].indexOf('licenseExpiry') >= 0){
    if(snapshot && snapshot.licenseExpiry) out.push('• الرخصة هترجع لتاريخ ' + snapshot.licenseExpiry);
    else out.push('• مفيش تاريخ قديم مسجّل للرخصة — هتفضل زي ما هي');
    if(snapshot && snapshot.licenseStatus) out.push('• حالة الرخصة هترجع لـ«' + snapshot.licenseStatus + '»');
  }
  return out.join('\n');
}
/* حراسة موحّدة للزراير — الطبقة مركزية بتعرف إيه مسموح لكل دور */
function canRunPayments(action){
  if(typeof window.YahmaPerms==='object'){
    if(window.YahmaPerms.canEditNow()) return true;
    alert(window.YahmaPerms.denyMessage(action||'هذا الإجراء'));
    return false;
  }
  if(window.currentRole==='admin'||window.currentRole==='manager'||window.currentRole==='ops') return true;
  alert('ليس لديك صلاحية '+ (action||'هذا الإجراء') +'.');
  return false;
}
const NOT_INSPECTED = 'لم يفحص';

/* ===== أعمدة بيانات بتتمشى مع السيارة عبر دورة الدفع =====

   الأعمدة دي بتظهر هنا كـ**خلايا عرض** مش inputs: القيم ثابتة على
   السيارة من ملف Excel مرفوع، أو من نافذة تعديل السيارة. الكتابة
   اليدوية مش مطلوبة، وأي حد يعدّلها من الجدول بيكسر القاعدة.

   بتظهر كمان في «الفحص» (renewals-ui.js) بنفس الترتيب عشان
   بتتيمشى مع السيارة في السلسلة كلها: الفحص ← تحت الدفع ← تم الدفع
   ← تم التجديد.

   «مشاهدة» بيشوفها زي أي حد — مفيش استثناء، لأنها مش بتتعدّل.

   ⚠️ لو رجعت cell فيها input من غير سبب، الأعمدة بتبقى قابلة
   للكتابة تاني والاختبار بيرفض. */
const PAY_CELL_FIELDS = [
  { field: 'serial', label: 'الرقم التسلسلي' },
  { field: 'accountNo', label: 'رقم الحاسب الآلي' },
  { field: 'companyName', label: 'اسم الشركة' },
  { field: 'notes', label: 'ملاحظات' }
];
const PAY_CELL_HEADERS = PAY_CELL_FIELDS.map(d => '<th>' + d.label + '</th>').join('');
const PAY_CELL_LABELS = PAY_CELL_FIELDS.map(d => d.label);

function payCellsHtml(car) {
  return PAY_CELL_FIELDS.map(function (def) {
    return '<td class="pay-cell">' + escapeHtml(car[def.field] || '—') + '</td>';
  }).join('');
}

const CORE_PAY_FIELDS = PAY_CELL_FIELDS.filter(d => d.field !== 'notes');
const CORE_PAY_HEADERS = CORE_PAY_FIELDS.map(d => '<th>' + d.label + '</th>').join('');

function corePayCellsHtml(car) {
  return CORE_PAY_FIELDS.map(function (def) {
    return '<td class="pay-cell">' + escapeHtml(car[def.field] || '—') + '</td>';
  }).join('');
}

function payNoteCell(car) {
  if (!car) return '<td>—</td>';
  const tab = (typeof window.yahmaGetTab === 'function') ? window.yahmaGetTab() : '';
  const isOpsInNonOpsTab = (typeof currentRole !== 'undefined' && currentRole === 'ops' && tab !== 'renewals');
  const canEdit = (typeof window.YahmaPerms === 'object')
    ? window.YahmaPerms.canEditNow()
    : (!(typeof currentRole !== 'undefined' && currentRole === 'view') && !isOpsInNonOpsTab);
  return `<td><input class="pay-note-input ren-note-input" data-note-id="${escapeHtml(car.id)}" value="${escapeHtml(car.notes || '')}" placeholder="اكتب ملاحظة…" aria-label="ملاحظات السيارة ${escapeHtml(car.plate || '—')}"${canEdit ? '' : ' readonly'}></td>`;
}

function bindPayNotes(container) {
  if (!container) return;
  const tbody = container.querySelector('table.fleet-table tbody') || container.querySelector('tbody');
  if (!tbody || tbody._payNoteDelegate) return;
  tbody._payNoteDelegate = true;
  tbody.addEventListener('change', async function (e) {
    const inp = e.target.closest ? e.target.closest('input[data-note-id]') : null;
    if (!inp || inp.hasAttribute('readonly')) return;
    const fleetList = (typeof fleet !== 'undefined' && Array.isArray(fleet)) ? fleet : (window.fleet || []);
    const car = fleetList.find(c => String(c.id) === String(inp.dataset.noteId));
    if (!car) return;
    if (typeof window.YahmaPerms === 'object' && !window.YahmaPerms.canEditNow()) {
      alert(window.YahmaPerms.denyMessage('تعديل الملاحظات'));
      inp.value = car.notes || '';
      return;
    }
    if (typeof currentRole !== 'undefined' && (currentRole === 'view' || (currentRole === 'ops' && (typeof window.yahmaGetTab === 'function' ? window.yahmaGetTab() : '') !== 'renewals'))) {
      alert('ليس لديك صلاحية التعديل.');
      inp.value = car.notes || '';
      return;
    }
    const v = inp.value.trim();
    if (String(car.notes || '') === v) return;
    car.notes = v;
    inp.classList.add('saving');
    let ok = true;
    try {
      if (typeof saveData === 'function') ok = await saveData([car.id]);
    } catch (_) {
      ok = false;
    }
    inp.classList.remove('saving');
    if (ok === false) {
      alert('تعذر الحفظ — تحقق من الاتصال.');
    } else {
      try {
        if (typeof window.log === 'function') window.log('ملاحظة فحص', 'السيارة ' + (car.plate || ''));
      } catch (_) {
        yahmaErr(_, 'router-payments.js:notes');
      }
    }
  });
}

function resolveItemUserName(item) {
  var name = item.userName || (item.prevState && item.prevState.userName);
  if (!name && typeof window !== 'undefined') {
    if (window.YahmaPayments && typeof window.YahmaPayments.getCurrentActorName === 'function') {
      name = window.YahmaPayments.getCurrentActorName();
    } else if (window.currentUserName) {
      name = window.currentUserName;
    }
  }
  return name || '—';
}

/* ===== المنطق المفرد — مصدر واحد للمفرد والجماعي =====

   الأزرار المفردة كان منطقها جوّه querySelectorAll.addEventListener
   جوّه كل دالة رسم. النسخة الجماعية محتاجة تنادي نفس المنطق ده،
   فلو اتكتب تاني من الأول هيبقى فيه مسارين للحقيقة — وأي إصلاح
   في واحد مش هيوصل للتاني. فالدوال دي اتقلعت لفوق، والعُرضيّن
   (زرار الصف) بينادوا عليها.

   quiet = النسخة الجماعية: متعملش render، لأن الرسم بيحصل مرة
   واحدة في الآخر بعد كل السيارات.

   القيمة المرجعة بتتقرا من runPayBulk:
     'done'     اتنفذ
     'skipped'  المستخدم رفض التأكيد
     'failed'   اتحفظت محليًا بس الكتابة على السحابة فشل —
                الدالة بترجّع الحالة القديمة قبل ما ترجع */
const PAY_ITEM_ACTION = {
  /* «تحت الدفع» ⇐ «الفحص»: الطلب يتشال والسيارة ترجع بحالة لم يفحص */
  async cancel(item, car, quiet) {
    const plate = (car && car.plate) || item.plate || '—';
    if (!payConfirm(quiet, 'إلغاء طلب الدفع للسيارة «' + plate + '»؟\n\n'
      + '• الطلب هيتشال من «تحت الدفع»\n'
      + '• السيارة هترجع لِتبويب «الفحص» بحالة «' + NOT_INSPECTED + '»')) return 'skipped';
    if (car) {
      const before = car.inspectionStatus;
      car.inspectionStatus = NOT_INSPECTED;
      const saved = await saveData([car.id]);
      if (saved === false) {
        car.inspectionStatus = before;
        await saveData([car.id]);
        alert('تعذر حفظ التغيير على Supabase. تم إرجاع الحالة محليًا؛ تحقق من الاتصال ثم أعد المحاولة.');
        return 'failed';
      }
    }
    await window.YahmaPayments.revertPendingToInspection(item.id, item.carId);
    if (typeof window.log === 'function') window.log('إلغاء طلب دفع فحص', 'السيارة ' + plate + ' — رجعت لِالفحص');
    if (!quiet) render();
    return 'done';
  },

  /* «تحت الدفع» → «تم الدفع»: بنحفظ القيمة القديمة الأول عشان
     «رجوع لِتحت الدفع» يقدر يرجّعها بالظبط. */
  async paid(item, car, quiet) {
    if (!car) { alert('لم تعد السيارة موجودة في الأسطول.'); return 'skipped'; }
    if (!payConfirm(quiet, 'تأكيد تسجيل دفع تجديد الفحص للسيارة ' + car.plate + '؟')) return 'skipped';
    const previous = car.inspectionStatus;
    await window.YahmaPayments.rememberCarState(item.id, item.carId, { inspectionStatus: previous });
    car.inspectionStatus = 'سليم';
    const saved = await saveData([car.id]);
    if (saved === false) {
      car.inspectionStatus = previous;
      await saveData([car.id]);
      alert('تعذر حفظ التغيير على Supabase. تم إرجاع الحالة محليًا؛ تحقق من الاتصال ثم أعد المحاولة.');
      return 'failed';
    }
    await window.YahmaPayments.markPaid(item.id, item.carId);
    if (typeof window.log === 'function') window.log('تسجيل دفع وتجديد فحص', 'السيارة ' + car.plate);
    if (!quiet) { goTabFromRouter('paid'); return 'done'; }
    render();
    return 'done';
  },

  /* «تم الدفع» ⇐ «تحت الدفع»: يرجّع حالة الفحص للقيمة اللي كانت،
     وبيشيل تاريخ الدفع. */
  async back(item, car, quiet) {
    const plate = (car && car.plate) || item.plate || '—';
    const snapshot = window.YahmaPayments.prevStateOf(item.id, item.carId);
    if (!payConfirm(quiet, 'رجوع السيارة «' + plate + '» لِقائمة «تحت الدفع»؟\n\n'
      + prevRestoreLines(car, snapshot, 'paid') + '\n'
      + '• تاريخ الدفع هيتشال من الطلب\n'
      + '• الطلب هيفضل في «تحت الدفع» مستني الدفع تاني')) return 'skipped';
    if (car) {
      const before = Object.assign({}, car);
      applyPrevState(car, snapshot, 'paid');
      /* سجل قديم من غير لقطة: مينفعش نسيب الحالة «سليم» — الحوار
         بيقول للمستخدم إن حالة الفحص هترجع لـ«لم يفحص»، ولو الكود
         عمل غير كده يبقى الحوار بيكدب. فبنرجّع لللي قلناه. */
      if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, 'inspectionStatus')) {
        car.inspectionStatus = NOT_INSPECTED;
      }
      const saved = await saveData([car.id]);
      if (saved === false) {
        Object.keys(before).forEach(function (k) { car[k] = before[k]; });
        await saveData([car.id]);
        alert('تعذر حفظ التغيير على Supabase. تم إرجاع الحالة محليًا؛ تحقق من الاتصال ثم أعد المحاولة.');
        return 'failed';
      }
    }
    await window.YahmaPayments.revertPaidToPending(item.id, item.carId);
    if (typeof window.log === 'function') window.log('رجوع طلب دفع لِتحت الدفع', 'السيارة ' + plate);
    if (!quiet) render();
    return 'done';
  },

  /* «تم الدفع» → «تم التجديد»: 3 سنين. silentDate في النسخة
     الجماعية — الـprompt لكل سيارة مش عملي في حلقة. */
  async renew(item, car, quiet) {
    const content = document.getElementById('content');
    /* النسختين الجماعية والمفردة بتمرر true/false — الرفع من شيت
       (تم التجديد) بيمرر object فيه quiet=true و licenseExpiry من الملف */
    const applyOpts = (quiet && typeof quiet === 'object')
      ? Object.assign({ quiet: true }, quiet)
      : { silentDate: !!quiet, quiet: !!quiet };
    return renewLicenseFromPaid(item, car, content, applyOpts);
  },

  /* «تم التجديد» ⇐ «تم الدفع»: سجل «تم التجديد» يتشال وتاريخ
     الرخصة يرجع للقديم. */
  async back2(item, car, quiet) {
    const plate = (car && car.plate) || item.plate || '—';
    const snapshot = window.YahmaPayments.prevStateOf(item.id, item.carId);
    if (!payConfirm(quiet, 'رجوع السيارة «' + plate + '» لِتبويب «تم الدفع»؟\n\n'
      + prevRestoreLines(car, snapshot, 'renewed') + '\n'
      + '• سجل «تم التجديد» هيتشال\n'
      + '• الطلب هيفضل في «تم الدفع»')) return 'skipped';
    if (car) {
      const before = Object.assign({}, car);
      applyPrevState(car, snapshot, 'renewed');
      const saved = await saveData([car.id]);
      if (saved === false) {
        Object.keys(before).forEach(function (k) { car[k] = before[k]; });
        await saveData([car.id]);
        alert('تعذر حفظ التغيير على Supabase. تم إرجاع الحالة محليًا؛ تحقق من الاتصال ثم أعد المحاولة.');
        return 'failed';
      }
    }
    await window.YahmaPayments.revertRenewedToPaid(item.id, item.carId);
    if (typeof window.log === 'function') window.log('رجوع تجديد لِتم الدفع', 'السيارة ' + plate);
    if (!quiet) render();
    return 'done';
  }
};
if (typeof window !== 'undefined') window.PAY_ITEM_ACTION = PAY_ITEM_ACTION;
  /* ⭐ بيتستخدم في ملف تاني (تصدير «تحت الدفع») — لازم يتصدَّر. */
  if (typeof window !== 'undefined') window.PAY_CELL_LABELS = PAY_CELL_LABELS;

