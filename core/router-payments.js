/* ===== core/router-payments.js — أساس دورة الدفع =====
 *
 * مفاتيح التخزين المحلي، تنسيق التاريخ العربي، خطأ المزامنة السحابية،
 * والتشخيص — مع تأكيد الدفع وتجديد الرخصة في الآخر.
 *
 * الدوال هنا globals (الملف مش جوه IIFE) وده مقصود:
 * canRunPayments بيستدعيها modules/payments-store.js،
 * وrenderInspectionPayments بيناديها الـrouter. فلو لفّيناهم في
 * namespace كان لازم نعدّل كل المراجع. هم زي ما هم.
 *
 * Moved out of core/router-payments.js — same functions, same names.
 */
﻿/* ===== core/router-payments.js — دورة الفحص والدفع والتجديد =====
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
  if(opts.licenseExpiry){
    /* الشيتات (رفع «تم التجديد»): التاريخ جاي من ملف المستخدم — من غير prompt */
    raw = opts.licenseExpiry;
  }else if(opts.silentDate){
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


