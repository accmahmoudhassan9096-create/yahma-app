/* ===== core/router-payments.js — دورة الفحص والدفع والتجديد =====
 *
 * كل حاجة بتخص دورة «الفحص ← تحت الدفع ← تم الدفع ← تم التجديد»:
 * قراءة الطلبات، خلايا العرض، التحديد الجماعي، تنفيذ الإجراءات
 * (تسجيل دفع / إنهاء / تجديد الرخصة) ورسم التلات تبويبات.
 *
 * الدوال هنا globals (الملف مش جوه IIFE) وده مقصود:
 * canRunPayments بيستدعيها modules/payments-store.js،
 * وrenderInspectionPayments بيناديها الـrouter. فلو لفّيناهم في
 * namespace كان لازم نعدّل كل المراجع. هم زي ما هم.
 *
 * Moved out of core/render-router.js — same functions, same names.
 */
const INSPECTION_PAYMENTS_KEY='yahma-inspection-payments-v1';
function loadInspectionPayments(){
  /* المصدر الجديد: وحدة الدفعات (.pending). نحتفظ بالقديم للتوافق. */
  if(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function'){
    return window.YahmaPayments.localByStatus('pending');
  }
  try{const items=JSON.parse(localStorage.getItem(INSPECTION_PAYMENTS_KEY)||'[]');return Array.isArray(items)?items:[];}
  catch(_){return [];}
}
function loadPaidInspections(){
  if(window.YahmaPayments&&typeof window.YahmaPayments.pendingList==='function'){
    return window.YahmaPayments.pendingList();
  }
  return [];
}
/* «تم التجديد»: السطور اللي اكتملت خطتها (تجديد الرخصة اتسجّل) */
function loadRenewedInspections(){
  if(window.YahmaPayments&&typeof window.YahmaPayments.renewedList==='function'){
    return window.YahmaPayments.renewedList();
  }
  return [];
}
/* تنسيق تاريخ عربي موحّد بالأرقام يتعامل مع نصوص ISO وتوقيت المتصفح معًا */
function formatArabicDate(value){
  if(!value) return '—';
  if(typeof value === 'string' && /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(value.trim())){
    var parts = value.trim().split(/[-\/]/);
    return String(parts[2]).padStart(2, '0') + '/' + String(parts[1]).padStart(2, '0') + '/' + parts[0];
  }
  var d=new Date(value);
  if(isNaN(d.getTime())) return String(value);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  var hours = d.getHours();
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var ampm = hours >= 12 ? 'م' : 'ص';
  var h12 = String(hours % 12 || 12).padStart(2, '0');
  return day + '/' + month + '/' + year + ' — ' + h12 + ':' + minutes + ' ' + ampm;
}
/* تنبيه: المزامنة السحابية للدفعات معطّلة — الشغل محفوظ على الجهاز بس */
function paymentsSyncWarningHtml(){
  var err=String((typeof window!=='undefined'&&window.__yahmaPaymentsCloudError)||'').trim();
  if(!err) return '';
  return '<div class="payments-sync-warn"><b>⚠️ المزامنة السحابية متوقفة</b>'
    +'<span>'+escapeHtml(err)+'</span>'
    +'<button type="button" class="btn btn-ghost btn-small" data-pay-diag="1">فحص الاتصال بقاعدة البيانات</button></div>';
}
/* زر «فحص الاتصال»: يشغّل diagnose ويعرض النتيجة في نفس المكان */
function bindPaymentsDiagnostic(root){
  if(!root) return;
  const btn=root.querySelector('[data-pay-diag]');
  if(!btn || btn._bound) return;
  btn._bound=true;
  btn.addEventListener('click',async()=>{
    btn.disabled=true;
    const old=btn.textContent;
    btn.textContent='جارِ الفحص...';
    let res=null;
    try{ res=await window.YahmaPayments.diagnose(); }catch(e){ res={verdict:'فشل الفحص: '+(e&&e.message||'?')}; }
    btn.disabled=false;
    btn.textContent=old;
    const host=root.querySelector('.payments-sync-warn');
    if(!host) return;
    const lines=[
      '<b>'+escapeHtml(res.verdict||'')+'</b>',
      '<span>الاتصال بـ Supabase: '+(res.supabaseReady?'موجود':'غير موجود')+'</span>',
      '<span>جلسة الدخول: '+(res.session?('صالحة — '+(res.email||'')):'غير موجودة على هذا الجهاز')+'</span>',
      '<span>قراءة الجدول: '+(res.readOk?('شغالة'+(res.readCount!=null?' ('+res.readCount+' صف)':'')):('فاشلة — '+(res.writeError||'')))+'</span>',
      '<span>الكتابة: '+(res.writeOk?'شغالة':'متوقفة — '+(res.writeError||''))+'</span>'
    ];
    host.innerHTML=lines.join('');
    var style=host.style;
    if(res.writeOk){
      style.background='rgba(18,170,166,.12)';
      style.borderColor='rgba(18,170,166,.45)';
      window.__yahmaPaymentsCloudError='';
    }
  });
}

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
  const canEdit = (typeof window.YahmaPerms === 'object')
    ? window.YahmaPerms.canEditNow()
    : !(typeof currentRole !== 'undefined' && currentRole === 'view');
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
    if (typeof currentRole !== 'undefined' && currentRole === 'view') {
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
    return renewLicenseFromPaid(item, car, content, { silentDate: !!quiet, quiet: !!quiet });
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
  const on = selectedPayRows(tab).some(function (r) { return String(r.item.id) === String(itemId); });
  return '<td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-pay-check="'
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
function payBulkBarFor(tab) {
  const actions = PAY_TAB_ACTIONS[tab] || [];
  /* bar بيظهر بـcanBulk بس. Ehrenutzer «مشاهدة» مالوش شريط
     خالص —Checks ميتsummatش من غير حاجة تعمل بيها. */
  if (!actions.length || !canBulkHere()) return '';
  const btns = actions.map(function (a) {
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
    + '<div class="bulk-bar-actions">' + btns
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

/* تحديث حالة الشريط بعد أي تغيير في التحديد. */
function payBulkBarHtml(tab) {
  const bar = document.getElementById('pay-bulk-bar-' + tab);
  if (!bar) return;
  const items = selectedPayRows(tab);
  bar.style.display = items.length ? '' : 'none';
  const cnt = document.getElementById('pay-bulk-count-' + tab);
  if (cnt) {
    cnt.textContent = items.length + ' محددة'
      + ' من ' + Object.keys(PAY_ROW_INDEX[tab] || {}).length;
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

  if (!tbody._paySelectDelegate) {
    tbody._paySelectDelegate = true;
    tbody.addEventListener('change', function (e) {
      const box = e.target.closest ? e.target.closest('input[data-pay-check]') : null;
      if (!box) return;
      const t = box.dataset.payTab;
      const id = box.dataset.payCheck;
      const set = PAY_SELECTIONS[t] || (PAY_SELECTIONS[t] = new Set());
      if (box.checked) set.add(id); else set.delete(id);
      payBulkBarHtml(t);
    });
  }

  const head = content.querySelector('input[data-pay-head="' + tab + '"]');
  if (head) {
    head.onclick = null;
    head.onchange = function () {
      const all = Object.keys(PAY_ROW_INDEX[tab] || {});
      PAY_SELECTIONS[tab] = head.checked ? new Set(all) : new Set();
      /* مينفعش نغيّر الـchecked بتاع كل الـcheckboxes ونعمل
         رسم مع كل رسم — الأسطر بتتحدّث من الرسم فمفيش
         مشكلة. بنحدّث بس الشريط. */
      payBulkBarHtml(tab);
    };
  }

  const clear = content.querySelector('[data-pay-clear="' + tab + '"]');
  if (clear) clear.onclick = function () {
    PAY_SELECTIONS[tab] = new Set();
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

function renderInspectionPayments(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تحت الدفع';
  document.getElementById('topbar-sub').textContent='طلبات دفع تجديد فحص السيارات';
  const pending=loadInspectionPayments();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=pending.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.payments=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.payments[String(r.item.id)]=r; });

  const getBranches = () => {
    const s = new Set();
    rows.forEach(r => { const b = (r.car && r.car.branch) || (r.item && r.item.branch); if (b && String(b).trim()) s.add(String(b).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getCompanies = () => {
    const s = new Set();
    rows.forEach(r => { const c = r.car && r.car.companyName; if (c && String(c).trim()) s.add(String(c).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getUsers = () => {
    const s = new Set();
    rows.forEach(r => { const u = resolveItemUserName(r.item); if (u && u !== '—') s.add(u); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };

  const branchOpts = '<option value="">كل الفروع</option>' + getBranches().map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
  const compOpts = '<option value="">كل الشركات</option>' + getCompanies().map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
  const userOpts = '<option value="">كل المستخدمين</option>' + getUsers().map(u => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');

  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip"><div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>طلبات تحت الدفع</small></span></div></div>
  <div class="filter-panel">
    <div class="filter-panel-title"><strong>🔎 فلاتر طلبات تحت الدفع</strong><span>صفِّ النتائج حسب اللوحة، الفرع، الشركة، أو المستخدم</span></div>
    <div class="fleet-filter-grid">
      <label>بحث<input id="pay-search-payments" placeholder="رقم اللوحة، الفرع، الشركة، الرقم التسلسلي، المستخدم..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
      <label>الفرع<select id="pay-branch-payments">${branchOpts}</select></label>
      <label>الشركة<select id="pay-company-payments">${compOpts}</select></label>
      <label>المستخدم<select id="pay-user-payments">${userOpts}</select></label>
    </div>
    <div class="filter-footer">
      <span id="pay-count-payments">عرض ${rows.length} من ${rows.length} طلب</span>
      <button type="button" class="btn btn-ghost btn-small" id="pay-clear-payments">↺ مسح الفلاتر</button>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('payments')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-payments"><thead><tr>${payCheckHeader('payments',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th>${CORE_PAY_HEADERS}<th>تاريخ الطلب</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody id="pay-tbody-payments">
  </tbody></table></div>`;

  function getFiltered() {
    const q = (document.getElementById('pay-search-payments')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-payments')?.value || '').trim();
    const comp = (document.getElementById('pay-company-payments')?.value || '').trim();
    const user = (document.getElementById('pay-user-payments')?.value || '').trim();

    return rows.filter(({item, car}) => {
      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.companyName, car.serial, car.accountNo, car.notes, resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (branch && String((car && car.branch) || (item && item.branch) || '').trim() !== branch) return false;
      if (comp && String((car && car.companyName) || '').trim() !== comp) return false;
      if (user && resolveItemUserName(item) !== user) return false;
      return true;
    });
  }

  function draw() {
    const list = getFiltered();
    const tbody = document.getElementById('pay-tbody-payments');
    if (!tbody) return;

    PAY_ROW_INDEX.payments=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.payments[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('payments', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>`<tr>${payCheckCell('payments',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td>${corePayCellsHtml(car)}<td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td><span class="tag amber">تحت الدفع</span></td>${payNoteCell(car)}<td>${escapeHtml(resolveItemUserName(item))}</td><td><button type="button" class="btn btn-primary btn-small" data-payment-done="${escapeHtml(item.id)}">تسجيل الدفع</button> <button type="button" class="btn btn-ghost btn-small" data-payment-cancel="${escapeHtml(item.id)}">إلغاء الطلب</button>${canDeleteHere()?` <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>`:''}</td></tr>`).join('') : '<tr><td class="empty-span"><div class="empty">لا توجد طلبات تحت الدفع</div></td></tr>';

    const countLabel = document.getElementById('pay-count-payments');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' طلب';

    window._yahmaCurrentPdfData=()=>({
      title:'طلبات فحص تحت الدفع',
      subtitle:'عدد الطلبات: '+list.length,
      headers:['رقم اللوحة','الفرع'].concat(PAY_CELL_LABELS,['تاريخ الطلب','حالة الدفع','المستخدم']),
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—']
          .concat(PAY_CELL_FIELDS.map(d=>car[d.field]||'—'))
          .concat([formatArabicDate(item.requestedAt), 'تحت الدفع', resolveItemUserName(item)]))
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'payments');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-payment-done]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const id=button.dataset.paymentDone;
        const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
        if(!item) return;
        await PAY_ITEM_ACTION.paid(item, byId.get(String(item.carId)), false);
      };
    });
    content.querySelectorAll('[data-payment-cancel]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const id=button.dataset.paymentCancel;
        const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
        if(!item) return;
        await PAY_ITEM_ACTION.cancel(item, byId.get(String(item.carId)), false);
      };
    });
  }

  ['pay-search-payments', 'pay-branch-payments', 'pay-company-payments', 'pay-user-payments'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', draw);
      el.addEventListener('change', draw);
    }
  });
  document.getElementById('pay-clear-payments')?.addEventListener('click', function(){
    ['pay-search-payments', 'pay-branch-payments', 'pay-company-payments', 'pay-user-payments'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);
}

/* ===== تبويب «تم الدفع» =====
   السطور اللي اتجدّدت رخصتها بتتشال من هنا (بتسجّل في note)،
   عشان التبويب يبقى «اللي فاضل» بس — والتاريخ محفوظ في الأسطول وسجل النشاط. */
function renderPaidInspections(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تم الدفع';
  document.getElementById('topbar-sub').textContent='طلبات تم دفع تجديد فحصها واعتمادها';
  const paid=loadPaidInspections();
  const doneNote=(window.YahmaPayments&&window.YahmaPayments.DONE_NOTE)||'license-renewed';
  const allPaid=(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function')
    ? window.YahmaPayments.localByStatus('paid') : paid;
  const doneCount=allPaid.filter(function(p){ return String(p.note||'')===doneNote; }).length;
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=paid.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.paid=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.paid[String(r.item.id)]=r; });
  const today=new Date(); today.setHours(0,0,0,0);
  const todayCount=rows.filter(({item})=>item.paidAt&&new Date(item.paidAt)>=today).length;
  /* هل الرخصة اتجدّدت فعلاً؟ لو التاريخ لسه قادم/منتهي يبقى الخطوة الجاية */
  const needsLicense=({car})=>{
    const d=car.licenseExpiry?new Date(car.licenseExpiry):null;
    return !d || isNaN(d.getTime()) || d.getTime() < Date.now();
  };
  const pendingLicense=rows.filter(needsLicense).length;

  const getBranches = () => {
    const s = new Set();
    rows.forEach(r => { const b = (r.car && r.car.branch) || (r.item && r.item.branch); if (b && String(b).trim()) s.add(String(b).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getUsers = () => {
    const s = new Set();
    rows.forEach(r => { const u = resolveItemUserName(r.item); if (u && u !== '—') s.add(u); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const branchOpts = '<option value="">كل الفروع</option>' + getBranches().map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
  const userOpts = '<option value="">كل المستخدمين</option>' + getUsers().map(u => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');

  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip">
    <div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>إجمالي المدفوع</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${todayCount}</b><small>مدفوع اليوم</small></span></div>
    <div class="fleet-summary-card ${pendingLicense?'attention':''}"><span class="fleet-summary-icon">📄</span><span><b>${pendingLicense}</b><small>بانتظار تجديد الرخصة</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✅</span><span><b>${doneCount}</b><small>تم تجديد رخصها</small></span></div>
  </div>
  <div class="filter-panel">
    <div class="filter-panel-title"><strong>🔎 فلاتر طلبات تم الدفع</strong><span>صفِّ النتائج حسب اللوحة، الفرع، حالة الرخصة، أو المستخدم</span></div>
    <div class="quick-filters" id="paid-quick">
      <button type="button" class="quick-filter active" data-pq="all">الكل</button>
      <button type="button" class="quick-filter" data-pq="need_lic">📄 بانتظار تجديد الرخصة</button>
      <button type="button" class="quick-filter" data-pq="has_lic">✅ الرخصة سارية</button>
      <button type="button" class="quick-filter" data-pq="today">📅 مدفوع اليوم</button>
    </div>
    <div class="fleet-filter-grid">
      <label>بحث<input id="pay-search-paid" placeholder="رقم اللوحة، الفرع، المستخدم، الملاحظات..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
      <label>الفرع<select id="pay-branch-paid">${branchOpts}</select></label>
      <label>حالة الرخصة<select id="pay-lic-status-paid"><option value="">كل الحالات</option><option value="need">بانتظار تجديد الرخصة</option><option value="valid">الرخصة سارية</option></select></label>
      <label>المستخدم<select id="pay-user-paid">${userOpts}</select></label>
    </div>
    <div class="filter-footer">
      <span id="pay-count-paid">عرض ${rows.length} من ${rows.length} طلب</span>
      <button type="button" class="btn btn-ghost btn-small" id="pay-clear-paid">↺ مسح الفلاتر</button>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('paid')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-paid"><thead><tr>${payCheckHeader('paid',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>الرقم التسلسلي</th><th>رقم الحاسب</th><th>اسم المالك</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody id="pay-tbody-paid">
  </tbody></table></div>`;

  let activePQ = 'all';

  function getFiltered() {
    const q = (document.getElementById('pay-search-paid')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-paid')?.value || '').trim();
    const licSt = (document.getElementById('pay-lic-status-paid')?.value || '').trim();
    const user = (document.getElementById('pay-user-paid')?.value || '').trim();

    return rows.filter(({item, car}) => {
      const needs = needsLicense({car});
      if (activePQ === 'need_lic' && !needs) return false;
      if (activePQ === 'has_lic' && needs) return false;
      if (activePQ === 'today' && (!item.paidAt || new Date(item.paidAt) < today)) return false;

      if (licSt === 'need' && !needs) return false;
      if (licSt === 'valid' && needs) return false;

      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.serial, car.accountNo, car.ownerNumber, car.owner, car.notes, resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (branch && String((car && car.branch) || (item && item.branch) || '').trim() !== branch) return false;
      if (user && resolveItemUserName(item) !== user) return false;
      return true;
    });
  }

  function draw() {
    const list = getFiltered();
    const tbody = document.getElementById('pay-tbody-paid');
    if (!tbody) return;

    PAY_ROW_INDEX.paid=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.paid[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('paid', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>{
      const needs = needsLicense({car});
      return `<tr>${payCheckCell('paid',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td><td class="serial-cell">${escapeHtml(car.serial||'—')}</td><td>${escapeHtml(car.accountNo||car.ownerNumber||'—')}</td><td>${escapeHtml(car.owner||car.companyName||'—')}</td><td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td>${escapeHtml(formatArabicDate(item.paidAt))}</td><td><span class="tag green">تم الدفع</span></td>${payNoteCell(car)}<td>${escapeHtml(resolveItemUserName(item))}</td><td><div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-renew-license="${escapeHtml(item.id)}">تجديد الرخصة</button>${!needs ? '<span class="tag green" style="margin:0 2px">الرخصة سارية</span>' : ''}<button type="button" class="btn btn-ghost btn-small row-del" data-stepback-payment="${escapeHtml(item.id)}" title="رجوع السيارة لقائمة «تحت الدفع»">↩ رجوع لِتحت الدفع</button>${canDeleteHere()?` <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>`:''}</div></td></tr>`;
    }).join('') : '<tr><td class="empty-span"><div class="empty">لا توجد طلبات مدفوعة بعد</div></td></tr>';

    const countLabel = document.getElementById('pay-count-paid');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' طلب';

    window._yahmaCurrentPdfData=()=>({
      title:'طلبات تم الدفع',
      subtitle:'عدد الطلبات: '+list.length,
      headers:['رقم اللوحة','الفرع','الرقم التسلسلي','رقم الحاسب','اسم المالك','تاريخ الطلب','تاريخ الدفع','حالة الدفع','ملاحظات','المستخدم'],
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—',
        car.serial||'—', car.accountNo||car.ownerNumber||'—', car.owner||car.companyName||'—',
        formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
        'تم الدفع', car.notes||'—', resolveItemUserName(item)])
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'paid');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-renew-license]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.renewLicense));
        if(!item){renderPaidInspections(content);return;}
        const car=fleet.find(c=>String(c.id)===String(item.carId));
        await PAY_ITEM_ACTION.renew(item, car, false);
      };
    });
    content.querySelectorAll('[data-stepback-payment]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.stepbackPayment));
        if(!item) return;
        await PAY_ITEM_ACTION.back(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
      };
    });
  }

  content.querySelectorAll('#paid-quick .quick-filter').forEach(btn => {
    btn.onclick = () => {
      content.querySelectorAll('#paid-quick .quick-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePQ = btn.dataset.pq;
      draw();
    };
  });

  ['pay-search-paid', 'pay-branch-paid', 'pay-lic-status-paid', 'pay-user-paid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', draw);
      el.addEventListener('change', draw);
    }
  });

  document.getElementById('pay-clear-paid')?.addEventListener('click', function(){
    ['pay-search-paid', 'pay-branch-paid', 'pay-lic-status-paid', 'pay-user-paid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    activePQ = 'all';
    content.querySelectorAll('#paid-quick .quick-filter').forEach(b => b.classList.toggle('active', b.dataset.pq === 'all'));
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);
}

/* ===== تبويب «تم التجديد» =====
   الخطوة الأخيرة في الدورة: السيارة اتجدّدت رخصتها واتسجّل تاريخ التنفيذ.
   كل سطر بيعرض التواريخ الثلاثة: الطلب / الدفع / التجديد. */
function renderRenewedInspections(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تم التجديد';
  document.getElementById('topbar-sub').textContent='سيارات اكتملت دورة تجديد الفحص والرخصة';
  const list=loadRenewedInspections();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=list.map(item=>({item,car:byId.get(String(item.carId))})).filter(r=>r.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.renewed=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.renewed[String(r.item.id)]=r; });
  const today=new Date(); today.setHours(0,0,0,0);
  const stampOf=(p)=>(window.YahmaPayments&&typeof window.YahmaPayments.doneStamp==='function')
    ? window.YahmaPayments.doneStamp(p) : p.licenseRenewedAt || null;
  const todayCount=rows.filter(({item})=>{ const s=stampOf(item); return s && new Date(s)>=today; }).length;

  const getBranches = () => {
    const s = new Set();
    rows.forEach(r => { const b = (r.car && r.car.branch) || (r.item && r.item.branch); if (b && String(b).trim()) s.add(String(b).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getUsers = () => {
    const s = new Set();
    rows.forEach(r => { const u = resolveItemUserName(r.item); if (u && u !== '—') s.add(u); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const branchOpts = '<option value="">كل الفروع</option>' + getBranches().map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
  const userOpts = '<option value="">كل المستخدمين</option>' + getUsers().map(u => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');

  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip">
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${rows.length}</b><small>إجمالي المجدّد</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">📅</span><span><b>${todayCount}</b><small>تم تجديدها اليوم</small></span></div>
  </div>
  <div class="filter-panel">
    <div class="filter-panel-title"><strong>🔎 فلاتر تم التجديد</strong><span>صفِّ النتائج حسب اللوحة، الفرع، المستخدم، أو التاريخ</span></div>
    <div class="quick-filters" id="renewed-quick">
      <button type="button" class="quick-filter active" data-rq="all">الكل</button>
      <button type="button" class="quick-filter" data-rq="today">📅 تم تجديدها اليوم</button>
    </div>
    <div class="fleet-filter-grid">
      <label>بحث<input id="pay-search-renewed" placeholder="رقم اللوحة، الفرع، المستخدم، الملاحظات..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
      <label>الفرع<select id="pay-branch-renewed">${branchOpts}</select></label>
      <label>المستخدم<select id="pay-user-renewed">${userOpts}</select></label>
    </div>
    <div class="filter-footer">
      <span id="pay-count-renewed">عرض ${rows.length} من ${rows.length} سيارة</span>
      <button type="button" class="btn btn-ghost btn-small" id="pay-clear-renewed">↺ مسح الفلاتر</button>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('renewed')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-renewed"><thead><tr>
    ${payCheckHeader('renewed',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>الرقم التسلسلي</th><th>رقم الحاسب</th><th>اسم المالك</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>تاريخ التجديد</th><th>الرخصة الجديدة</th><th>الحالة</th><th>ملاحظات</th><th>المستخدم</th><th>إجراء</th>
  </tr></thead><tbody id="pay-tbody-renewed">
  </tbody></table></div>`;

  let activeRQ = 'all';

  function getFiltered() {
    const q = (document.getElementById('pay-search-renewed')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-renewed')?.value || '').trim();
    const user = (document.getElementById('pay-user-renewed')?.value || '').trim();

    return rows.filter(({item, car}) => {
      const stamp = stampOf(item);
      if (activeRQ === 'today' && (!stamp || new Date(stamp) < today)) return false;

      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.serial, car.accountNo, car.ownerNumber, car.owner, car.licenseExpiry, car.notes, formatArabicDate(stamp), resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (branch && String((car && car.branch) || (item && item.branch) || '').trim() !== branch) return false;
      if (user && resolveItemUserName(item) !== user) return false;
      return true;
    });
  }

  function draw() {
    const list = getFiltered();
    const tbody = document.getElementById('pay-tbody-renewed');
    if (!tbody) return;

    PAY_ROW_INDEX.renewed=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.renewed[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('renewed', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>{
      const stamp=stampOf(item);
      return `<tr>${payCheckCell('renewed',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td>
        <td>${escapeHtml(car.branch||item.branch||'—')}</td>
        <td class="serial-cell">${escapeHtml(car.serial||'—')}</td>
        <td>${escapeHtml(car.accountNo||car.ownerNumber||'—')}</td>
        <td>${escapeHtml(car.owner||car.companyName||'—')}</td>
        <td>${escapeHtml(formatArabicDate(item.requestedAt))}</td>
        <td>${escapeHtml(formatArabicDate(item.paidAt))}</td>
        <td><b>${escapeHtml(formatArabicDate(stamp))}</b></td>
        <td>${fmtDate(car.licenseExpiry)}</td>
        <td><span class="tag green">تم التجديد</span></td>
        ${payNoteCell(car)}
        <td>${escapeHtml(resolveItemUserName(item))}</td>
        <td><button type="button" class="btn btn-ghost btn-small" data-stepback-renewed="${escapeHtml(item.id)}" title="رجوع السيارة لِتبويب «تم الدفع»">↩ رجوع لِتم الدفع</button>${canDeleteHere()?` <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>`:''}</td></tr>`;
    }).join('') : '<tr><td class="empty-span"><div class="empty">لم يتم تسجيل أي تجديد بعد</div></td></tr>';

    const countLabel = document.getElementById('pay-count-renewed');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' سيارة';

    window._yahmaCurrentPdfData=()=>({
      title:'سجل تجديد الرخص',
      subtitle:'عدد العمليات: '+list.length,
      headers:['رقم اللوحة','الفرع','الرقم التسلسلي','رقم الحاسب','اسم المالك','تاريخ الطلب','تاريخ الدفع','تاريخ التجديد','الرخصة الجديدة','الحالة','ملاحظات','المستخدم'],
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—',
        car.serial||'—', car.accountNo||car.ownerNumber||'—', car.owner||car.companyName||'—',
        formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
        formatArabicDate(stampOf(item)), fmtDate(car.licenseExpiry), 'تم التجديد', car.notes||'—', resolveItemUserName(item)])
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'renewed');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-stepback-renewed]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadRenewedInspections().find(p=>String(p.id)===String(button.dataset.stepbackRenewed));
        if(!item) return;
        await PAY_ITEM_ACTION.back2(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
      };
    });
  }

  content.querySelectorAll('#renewed-quick .quick-filter').forEach(btn => {
    btn.onclick = () => {
      content.querySelectorAll('#renewed-quick .quick-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRQ = btn.dataset.rq;
      draw();
    };
  });

  ['pay-search-renewed', 'pay-branch-renewed', 'pay-user-renewed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', draw);
      el.addEventListener('change', draw);
    }
  });

  document.getElementById('pay-clear-renewed')?.addEventListener('click', function(){
    ['pay-search-renewed', 'pay-branch-renewed', 'pay-user-renewed'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    activeRQ = 'all';
    content.querySelectorAll('#renewed-quick .quick-filter').forEach(b => b.classList.toggle('active', b.dataset.rq === 'all'));
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);
}

function payConfirm(quiet, message) {
  if (quiet) return true;
  return confirm(message);
}

/* التاريخ المقترح لتجديد الرخصة — 3 سنين (المدة الفعلية).
   مصدر واحد: بتستعمله النسخة المفردة كقيمة للـprompt والنسخة
   الجماعية في رسالة التأكيد. لو اتحسب في مكانين، ممكن يختلفوا
   ويبقى التأكيد بيعرض تاريخ غير اللي بيتكتب. */
function paySuggestedLicenseDate(){
  if (typeof window.defaultLicenseExpiry === 'function') {
    try { return window.defaultLicenseExpiry(); } catch (e) {
      yahmaErr(e, 'render-router.js:paySuggestedLicenseDate');
    }
  }
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().slice(0, 10);
}

/* ===== تجديد الرخصة من «تم الدفع» =====
   بتحدّد الرخصة (3 سنين افتراضيًا) وبتتحوّل للخطوة «تم التجديد».

   opts.silentDate: النسخة الجماعية. الـprompt جوّه حلقة على
   20 سيارة = 20 نافذة تتقفل واحد واحد، وده بيخلّي العملية
   الجماعية غير عملية خالص. فبناكل التاريخ المقترح من غير ما
   نسأل، ورسالة التأكيد بتقول للمستخدم إن التاريخ المقترح
   هيتطبّق على الكل — فمش بيهدم Choices ولا بيخفى عنه.
   opts.quiet: النسخة الجماعية — متعملش render (الرسم مرة واحدة). */
async function renewLicenseFromPaid(item, car, content, opts){
  opts = opts || {};
  if(!canRunPayments('تجديد الرخص')) return 'skipped';
  if(!car){alert('لم تعد السيارة موجودة في الأسطول.');return 'skipped';}
  const suggested=paySuggestedLicenseDate();
  let raw;
  if(opts.silentDate){
    raw = suggested;
  }else{
    raw = prompt('تاريخ انتهاء الرخصة الجديد لـ '+car.plate+' (YYYY-MM-DD):', suggested);
    if(!raw) return 'skipped';
  }
  const normalized=(typeof window.normalizeDateValue==='function') ? window.normalizeDateValue(raw) : raw;
  const previous=car.licenseExpiry;
  const previousStatus=car.licenseStatus;
  /* حفظ التاريخ القديم قبل التجديد — من غير كده «رجوع لِتم الدفع»
     هيسيب التاريخ الجديد في الأسطول ولا فيه رجعة منه. */
  await window.YahmaPayments.rememberCarState(item.id, item.carId, {
    licenseExpiry: previous,
    licenseStatus: previousStatus
  });
  car.licenseExpiry=normalized||raw;
  if(!car.licenseStatus||String(car.licenseStatus).includes('منته')) car.licenseStatus='نشط';
  const saved=await saveData([car.id]);
  if(saved===false){
    car.licenseExpiry=previous;
    await saveData([car.id]);
    alert('تعذر حفظ التغيير على Supabase. تحقق من الاتصال ثم أعد المحاولة.');
    return 'failed';
  }
  /* تاريخ التنفيذ لحظة التجديد */
  const doneAt=new Date().toISOString();
  await window.YahmaPayments.markLicenseRenewed(item.id, item.carId, doneAt);
  if(typeof window.log==='function') window.log('تجديد رخصة بعد دفع فحص','السيارة '+car.plate);
  if(opts.quiet){ render(); return 'done'; }
  /* الخطوة الجاية في الدورة: تم التجديد */
  goTabFromRouter('renewed');
  return 'done';
}

