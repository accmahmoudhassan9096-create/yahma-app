/* ===== موجّه العرض render() وواجهة الفروع والرسوم ===== */
/* استُخرج من app-core.js (السطور 950-1431) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

function renderReports(content){ return window.YahmaReports.render(content, {fleet, presetsKey: REPORT_PRESETS_KEY, scheduleKey: SND_SKEY}); }
function exportReportPDF(restoreTab){ return window.YahmaExport.exportReportPdf(restoreTab); }

function prepChecklistForCar(car){ return window.YahmaPreparationData.checklistForCar(car, vehicleReadiness); }
function prepStatusForCar(car){ return window.YahmaPreparationData.statusForCar(car, vehicleReadiness); }
function getPrepTasks(){ return window.YahmaPreparationData.getTasks(fleet, vehicleReadiness); }
function savePrepTask(task){ return window.YahmaPreparationData.saveTask(fleet, task); }
function renderPreparation(content){
  document.getElementById('topbar-title').textContent='التجهيز والمهام';
  document.getElementById('topbar-sub').textContent='تحويل أسباب عدم الجاهزية إلى خطوات ومهام واضحة حتى تصبح السيارة جاهزة للتأجير';
  const tasks=getPrepTasks();
  const open=tasks.filter(t=>t.status==='open').length;
  const progress=tasks.filter(t=>t.status==='progress').length;
  const done=tasks.filter(t=>t.status==='done').length;
  const needsReview=fleet.filter(c=>vehicleReadiness(c).ready && !prepChecklistForCar(c).final).length;
  content.innerHTML=`
    <div class="prep-page-head"><div><h2 style="margin:0;font-size:18px">مركز تجهيز الأسطول</h2><div class="muted-small">كل مشكلة في السيارة تظهر هنا كإجراء قابل للمتابعة.</div></div><button class="btn btn-primary" id="prep-refresh">↻ تحديث</button></div>
    <div class="prep-kpis"><div class="prep-kpi"><b>${open}</b><span>مهام مفتوحة</span></div><div class="prep-kpi"><b>${progress}</b><span>قيد التنفيذ</span></div><div class="prep-kpi"><b>${done}</b><span>مكتملة</span></div><div class="prep-kpi"><b>${needsReview}</b><span>جاهزة وتحتاج مراجعة نهائية</span></div></div>
    <div class="panel">
      <div class="prep-filter"><input id="prep-search" placeholder="بحث باللوحة أو الفرع أو المهمة"><select id="prep-status"><option value="">كل الحالات</option><option value="open">مفتوحة</option><option value="progress">قيد التنفيذ</option><option value="done">مكتملة</option></select><select id="prep-type"><option value="">كل الأسباب</option>${[...new Set(tasks.map(t=>t.type))].map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select>
        <button class="btn btn-excel-export btn-small" id="prep-export-xlsx" type="button">📊 Excel</button>
        <button class="btn btn-ghost btn-small" id="prep-export-pdf" type="button">📄 PDF</button>
      </div>
      <div style="overflow:auto"><table class="task-table"><thead><tr><th>السيارة</th><th>الفرع</th><th>المهمة</th><th>المسؤول</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead><tbody id="prep-task-body"></tbody></table></div>
    </div>`;
  const getPrepFiltered=()=>{
    const q=(document.getElementById('prep-search').value||'').trim().toLowerCase(), st=document.getElementById('prep-status').value, type=document.getElementById('prep-type').value;
    return tasks.filter(t=>(!q||[t.plate,t.branch,t.title,t.assignee].join(' ').toLowerCase().includes(q))&&(!st||t.status===st)&&(!type||t.type===type));
  };
  const exportPrep=async (fmt)=>{
    const list=getPrepFiltered();
    if(!list.length){alert('لا توجد مهام مطابقة للفلاتر.');return;}
    const headers=['رقم اللوحة','الفرع','المهمة','المسؤول','الاستحقاق','الحالة'];
    const data=list.map(t=>{
      const label=t.status==='done'?'مكتملة':t.status==='progress'?'قيد التنفيذ':'مفتوحة';
      return [t.plate||'',t.branch||'',t.title||'',t.assignee||'',t.dueDate||'',label];
    });
    if(fmt==='pdf'){
      const name='مهام-تجهيز-مفلترة-'+new Date().toISOString().slice(0,10)+'.pdf';
      if(window.YahmaExport&&window.YahmaExport.exportTablePdf){
        window.YahmaExport.exportTablePdf({title:'مهام التجهيز المفلترة',subtitle:'عدد المهام: '+list.length,headers:headers,rows:data,buttonId:'prep-export-pdf',filename:name});
      } else if(typeof openPrintWindow==='function') openPrintWindow('مهام التجهيز المفلترة','عدد المهام: '+list.length,headers,data);
      return;
    }
    if(!(await ensureXlsxReady())){alert('مكتبة Excel غير متاحة');return;}
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'مهام-التجهيز');
    XLSX.writeFile(wb,'مهام-تجهيز-مفلترة-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
  };
  window._yahmaCurrentPdfData=()=>({title:'مهام التجهيز المفلترة',subtitle:'عدد المهام: '+getPrepFiltered().length,headers:['رقم اللوحة','الفرع','المهمة','المسؤول','الاستحقاق','الحالة'],rows:getPrepFiltered().map(t=>[t.plate||'',t.branch||'',t.title||'',t.assignee||'',t.dueDate||'',t.status==='done'?'مكتملة':t.status==='progress'?'قيد التنفيذ':'مفتوحة'])});
  const draw=()=>{
    const list=getPrepFiltered();
    document.getElementById('prep-task-body').innerHTML=list.length?list.map(t=>{const cls=t.status==='done'?'task-done':t.status==='progress'?'task-progress':'task-open';const label=t.status==='done'?'مكتملة':t.status==='progress'?'قيد التنفيذ':'مفتوحة';return `<tr><td class="plate">${escapeHtml(t.plate)}</td><td>${escapeHtml(t.branch)}</td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.assignee||'—')}</td><td>${escapeHtml(t.dueDate||'—')}</td><td><span class="task-status ${cls}">${label}</span></td><td><button class="btn btn-ghost btn-small" data-prep-edit="${escapeHtml(t.carId)}">فتح السيارة</button></td></tr>`}).join(''):'<tr><td colspan="7"><div class="empty">لا توجد مهام حسب الفلاتر الحالية</div></td></tr>';
    document.querySelectorAll('[data-prep-edit]').forEach(b=>b.onclick=()=>openModal(b.dataset.prepEdit));
  };
  ['prep-search','prep-status','prep-type'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(id==='prep-search'){ let t=null; el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(draw,180);}); }
    else el.addEventListener('change',draw);
  });
  document.getElementById('prep-refresh')?.addEventListener('click',render);
  document.getElementById('prep-export-xlsx')?.addEventListener('click',()=>exportPrep('xlsx'));
  document.getElementById('prep-export-pdf')?.addEventListener('click',()=>exportPrep('pdf'));
  window._yahmaModuleExport = function(fmt){ exportPrep(fmt==='pdf'?'pdf':'xlsx'); };
  draw();
}

function renderAuditPage(content){
  return window.YahmaAudit.render(content, {currentRole: window.currentRole});
}

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
/* تنسيق تاريخ عربي موحّد يتعامل مع نصوص ISO وتوقيت المتصفح معًا */
function formatArabicDate(value){
  if(!value) return '—';
  var d=new Date(value);
  if(isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'})+' — '+
         d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
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
         ر��در مع كل رسم — الأسطر بتتحدّث من الرسم فمفيش
         مشكلة. بنحدّث بس الشريط. */
      payBulkBarHtml(tab);
    };
  }

  const clear = content.querySelector('[data-pay-clear="' + tab + '"]');
  if (clear) clear.onclick = function () {
    PAY_SELECTIONS[tab] = new Set();
    payBulkBarHtml(tab);
  };

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

function renderInspectionPayments(content){
  document.getElementById('topbar-title').textContent='تحت الدفع';
  document.getElementById('topbar-sub').textContent='طلبات دفع تجديد فحص السيارات';
  const pending=loadInspectionPayments();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rows=pending.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  PAY_ROW_INDEX.payments=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.payments[String(r.item.id)]=r; });
  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip"><div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>طلبات تحت الدفع</small></span></div></div>
  <div class="filter-panel"><div class="filter-panel-title"><strong>طلبات تجديد الفحص بانتظار الدفع</strong><span>بعد تسجيل الدفع تنتقل الطلب إلى تبويب «تم الدفع»</span></div></div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('payments')}
  <div class="table-scroll"><table class="fleet-table"><thead><tr>${payCheckHeader('payments',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th>${CORE_PAY_HEADERS}<th>تاريخ الطلب</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody>
  ${rows.length?rows.map(({item,car})=>`<tr>${payCheckCell('payments',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td>${corePayCellsHtml(car)}<td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td><span class="tag amber">تحت الدفع</span></td><td class="pay-cell">${escapeHtml(car.notes||'—')}</td><td>${escapeHtml(resolveItemUserName(item))}</td><td><button type="button" class="btn btn-primary btn-small" data-payment-done="${escapeHtml(item.id)}">تسجيل الدفع</button> <button type="button" class="btn btn-ghost btn-small" data-payment-cancel="${escapeHtml(item.id)}">إلغاء الطلب</button></td></tr>`).join(''):'<tr><td class="empty-span"><div class="empty">لا توجد طلبات تحت الدفع</div></td></tr>'}
  </tbody></table></div>`;
  bindPaymentsDiagnostic(content);
  bindPaySelection(content,'payments');
  fixPaySpans(content);
  window._yahmaCurrentPdfData=()=>({
    title:'طلبات فحص تحت الدفع',
    subtitle:'عدد الطلبات: '+rows.length,
    headers:['رقم اللوحة','الفرع'].concat(PAY_CELL_LABELS,['تاريخ الطلب','حالة الدفع','المستخدم']),
    rows:rows.map(({item,car})=>[
      car.plate||item.plate||'—', car.branch||item.branch||'—']
        .concat(PAY_CELL_FIELDS.map(d=>car[d.field]||'—'))
        .concat([formatArabicDate(item.requestedAt), 'تحت الدفع', resolveItemUserName(item)]))
  });
  /* العُرضيّن بينادوا نفس الدوال بتاعة النسخة الجماعية — مسار
     واحد للمنطق. طلب التأكيد هنا كان جوّه الكود دلوقتي مرتين. */
  content.querySelectorAll('[data-payment-done]').forEach(function(button){
    button.addEventListener('click', async function(){
      if(!canRunPayments('إدارة طلبات الدفع')) return;
      const id=button.dataset.paymentDone;
      const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
      if(!item) return;
      await PAY_ITEM_ACTION.paid(item, byId.get(String(item.carId)), false);
    });
  });
  content.querySelectorAll('[data-payment-cancel]').forEach(function(button){
    button.addEventListener('click', async function(){
      if(!canRunPayments('إدارة طلبات الدفع')) return;
      const id=button.dataset.paymentCancel;
      const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
      if(!item) return;
      await PAY_ITEM_ACTION.cancel(item, byId.get(String(item.carId)), false);
    });
  });
}

/* ===== تبويب «تم الدفع» =====
   السطور اللي اتجدّدت رخصتها بتتشال من هنا (بتسجّل في note)،
   عشان التبويب يبقى «اللي فاضل» بس — والتاريخ محفوظ في الأسطول وسجل النشاط. */
function renderPaidInspections(content){
  document.getElementById('topbar-title').textContent='تم الدفع';
  document.getElementById('topbar-sub').textContent='طلبات تم دفع تجديد فحصها واعتمادها';
  const paid=loadPaidInspections();
  const doneNote=(window.YahmaPayments&&window.YahmaPayments.DONE_NOTE)||'license-renewed';
  const allPaid=(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function')
    ? window.YahmaPayments.localByStatus('paid') : paid;
  const doneCount=allPaid.filter(function(p){ return String(p.note||'')===doneNote; }).length;
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rows=paid.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
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
  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip">
    <div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>إجمالي المدفوع</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${todayCount}</b><small>مدفوع اليوم</small></span></div>
    <div class="fleet-summary-card ${pendingLicense?'attention':''}"><span class="fleet-summary-icon">📄</span><span><b>${pendingLicense}</b><small>بانتظار تجديد الرخصة</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✅</span><span><b>${doneCount}</b><small>تم تجديد رخصها</small></span></div>
  </div>
  <div class="filter-panel"><div class="filter-panel-title"><strong>طلبات تم الدفع</strong><span>الخطوة التالية: تجديد الرخصة — اضغط «تجديد الآن» لتسجيل الرخصة مباشرة من هنا</span></div></div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('paid')}
  <div class="table-scroll"><table class="fleet-table"><thead><tr>${payCheckHeader('paid',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody>
  ${rows.length?rows.map(({item,car})=>{
      const needs=needsLicense({car});
      return `<tr>${payCheckCell('paid',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td><td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td>${escapeHtml(formatArabicDate(item.paidAt))}</td><td><span class="tag green">تم الدفع</span></td><td class="pay-cell">${escapeHtml(car.notes||'—')}</td><td>${escapeHtml(resolveItemUserName(item))}</td><td><div class="row-actions">${needs
        ? `<button type="button" class="btn btn-primary btn-small" data-renew-license="${escapeHtml(item.id)}">تجديد الرخصة</button>`
        : `<span class="tag green">الرخصة سارية</span>`}<button type="button" class="btn btn-ghost btn-small row-del" data-stepback-payment="${escapeHtml(item.id)}" title="رجوع السيارة لقائمة «تحت الدفع»">↩ رجوع لِتحت الدفع</button></div></td></tr>`;
    }).join(''):'<tr><td class="empty-span"><div class="empty">لا توجد طلبات مدفوعة بعد</div></td></tr>'}
  </tbody></table></div>`;
  bindPaymentsDiagnostic(content);
  bindPaySelection(content,'paid');
  fixPaySpans(content);
  window._yahmaCurrentPdfData=()=>({
    title:'طلبات تم الدفع',
    subtitle:'عدد الطلبات: '+rows.length,
    headers:['رقم اللوحة','الفرع','تاريخ الطلب','تاريخ الدفع','حالة الدفع','ملاحظات','المستخدم'],
    rows:rows.map(({item,car})=>[
      car.plate||item.plate||'—', car.branch||item.branch||'—',
      formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
      'تم الدفع', car.notes||'—', resolveItemUserName(item)])
  });
  /* الضغطة بتجدد الرخصة على طول (3 سنين) وبتشيل السطر من القائمة.
     بتنادي نفس PAY_ITEM_ACTION.renew اللي بتستدعيه النسخة
     الجماعية — quiet=false فبيفتح نافذة التاريخ زي الأول. */
  content.querySelectorAll('[data-renew-license]').forEach(function(button){
    button.addEventListener('click', async function(){
      if(!canRunPayments('إدارة طلبات الدفع')) return;
      const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.renewLicense));
      if(!item){renderPaidInspections(content);return;}
      const car=fleet.find(c=>String(c.id)===String(item.carId));
      await PAY_ITEM_ACTION.renew(item, car, false);
    });
  });
  /* نفس الدالة المستخرجة — المفرد والجماعي نفس المسار. */
  content.querySelectorAll('[data-stepback-payment]').forEach(function(button){
    button.addEventListener('click', async function(){
      if(!canRunPayments('إدارة طلبات الدفع')) return;
      const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.stepbackPayment));
      if(!item) return;
      await PAY_ITEM_ACTION.back(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
    });
  });
}

/* ===== تبويب «تم التجديد» =====
   الخطوة الأخيرة في الدورة: السيارة اتجدّدت رخصتها واتسجّل تاريخ التنفيذ.
   كل سطر بيعرض التواريخ الثلاثة: الطلب / الدفع / التجديد. */
function renderRenewedInspections(content){
  document.getElementById('topbar-title').textContent='تم التجديد';
  document.getElementById('topbar-sub').textContent='سيارات اكتملت دورة تجديد الفحص والرخصة';
  const list=loadRenewedInspections();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rows=list.map(item=>({item,car:byId.get(String(item.carId))})).filter(r=>r.car);
  PAY_ROW_INDEX.renewed=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.renewed[String(r.item.id)]=r; });
  const today=new Date(); today.setHours(0,0,0,0);
  const stampOf=(p)=>(window.YahmaPayments&&typeof window.YahmaPayments.doneStamp==='function')
    ? window.YahmaPayments.doneStamp(p) : p.licenseRenewedAt || null;
  const todayCount=rows.filter(({item})=>{ const s=stampOf(item); return s && new Date(s)>=today; }).length;
  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip">
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${rows.length}</b><small>إجمالي المجدّد</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">📅</span><span><b>${todayCount}</b><small>تم تجديدها اليوم</small></span></div>
  </div>
  <div class="filter-panel"><div class="filter-panel-title"><strong>تم تجديد الرخصة</strong><span>هذه السيارات اتجدّدت رخصها بالفعل وهي مسجّلة في الأسطول</span></div></div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('renewed')}
  <div class="table-scroll"><table class="fleet-table"><thead><tr>
    ${payCheckHeader('renewed',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>تاريخ التجديد</th><th>الرخصة الجديدة</th><th>الحالة</th><th>ملاحظات</th><th>المستخدم</th><th>إجراء</th>
  </tr></thead><tbody>
  ${rows.length?rows.map(({item,car})=>{
      const stamp=stampOf(item);
      return `<tr>${payCheckCell('renewed',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td>
        <td>${escapeHtml(car.branch||item.branch||'—')}</td>
        <td>${escapeHtml(formatArabicDate(item.requestedAt))}</td>
        <td>${escapeHtml(formatArabicDate(item.paidAt))}</td>
        <td><b>${escapeHtml(formatArabicDate(stamp))}</b></td>
        <td>${escapeHtml(car.licenseExpiry||'—')}</td>
        <td><span class="tag green">تم التجديد</span></td>
        <td class="pay-cell">${escapeHtml(car.notes||'—')}</td>
        <td>${escapeHtml(resolveItemUserName(item))}</td>
        <td><button type="button" class="btn btn-ghost btn-small" data-stepback-renewed="${escapeHtml(item.id)}" title="رجوع السيارة لِتبويب «تم الدفع»">↩ رجوع لِتم الدفع</button></td></tr>`;
    }).join(''):'<tr><td class="empty-span"><div class="empty">لم يتم تسجيل أي تجديد بعد</div></td></tr>'}
  </tbody></table></div>`;
  bindPaymentsDiagnostic(content);
  bindPaySelection(content,'renewed');
  fixPaySpans(content);
  window._yahmaCurrentPdfData=()=>({
    title:'سجل تجديد الرخص',
    subtitle:'عدد العمليات: '+rows.length,
    headers:['رقم اللوحة','الفرع','تاريخ الطلب','تاريخ الدفع','تاريخ التجديد','الرخصة الجديدة','الحالة','ملاحظات','المستخدم'],
    rows:rows.map(({item,car})=>[
      car.plate||item.plate||'—', car.branch||item.branch||'—',
      formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
      formatArabicDate(stampOf(item)), car.licenseExpiry||'—', 'تم التجديد', car.notes||'—', resolveItemUserName(item)])
  });
  /* الرجوع: «تم التجديد» ⇐ «تم الدفع» — السطر يخرج من «تم التجديد»
     (مفيش note تجديد)، وتاريخ الرخصة يرجع للي كان قبل التجديد. */
  content.querySelectorAll('[data-stepback-renewed]').forEach(function(button){
    button.addEventListener('click', async function(){
      if(!canRunPayments('إدارة طلبات الدفع')) return;
      const item=loadRenewedInspections().find(p=>String(p.id)===String(button.dataset.stepbackRenewed));
      if(!item) return;
      await PAY_ITEM_ACTION.back2(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
    });
  });
}

/* ⭐ تأكيد الإجراء — مرّة واحدة في الجماعي، وكل سيارة لوحدها في المفرد.

   quiet (النسخة الجماعية) بتكتم التأكيد الخاص بكل سيارة: نافذة
   الجماعية أصلاً سألت «متابعة؟» وذكرت كل اللوحات، فسؤال تاني
   لكل سيارة = 20 نافذة فوق 20 نافذة = 40 نافذة على عملية واحدة.
   ده نفس السبب اللي خلّى silentDate في التجديد.

   ⚠️ التفاصيل المهمة (حالة الفحص هترجع لـ…) بتروح مع الكتم، فبترجع
   مكانها في رسالة التأكيد الجماعية (رسالةBulkHint) — مش بتضيع. */
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

/* انتقال آمن للتبويب: نغيّر التبويب عبر السابط العامة ثم نرسم مرة واحدة. */
function goTabFromRouter(tab){
  try{
    if(typeof window.yahmaSetTab==='function') window.yahmaSetTab(tab);
    else window.currentTab=tab;
  }catch(_){yahmaErr(_,'render-router.js:478');}
  document.querySelectorAll('.nav-item').forEach(function(i){
    i.classList.toggle('active', i.dataset.tab===tab);
  });
  try{
    if(typeof window.render==='function'&&typeof window.render._perfImmediate==='function'){
      window.render._perfImmediate();
    }else if(typeof window.render==='function'){
      window.render();
    }
  }catch(_){yahmaErr(_,'render-router.js:488');}
}

/* نسخة كاملة من الأسطول وقت الرسم.
   لازم تكون متغير مستقل (مش على window.YahmaData) عشان:
   1) لو YahmaData لسه متحمّلش، الرجوع يفضل شغال.
   2) ما نلحقش بجوز في حالة مرحلية فلتر إنه نرجّعه بعد ما الـ warning يتقري. */
let __yahmaFullFleet = null;

function render(){
  /* تاريخ آخر رسم — المراقب في data.js بيقارنه باليوم الحالي
     ويعمل re-render تلقائي لما اليوم يتغير، حتى لو المستخدم
     سايب التطبيق مفتوح من غير ما يبدّل تبويب. */
  try {
    const _d = new Date();
    window.__yahmaRenderDay = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
  } catch(_){yahmaErr(_,'render-router.js:504');}
  /* نقرأ التبويب من الـ API العام (yahmaGetTab) بدل الـ binding المحلي. */
  if(typeof window.yahmaGetTab === 'function'){ currentTab = window.yahmaGetTab(); }
  if(!window.canAccessYahmaTab(currentTab)) { currentTab='dashboard'; if(typeof window.yahmaSetTab==='function') window.yahmaSetTab('dashboard'); }
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.tab===currentTab));
  const emailPdfButton=document.getElementById('btn-email-filtered-pdf');
  if(emailPdfButton) emailPdfButton.style.display=window.currentRole==='admin'?'inline-flex':'none';
  if(typeof loadBranches==='function'){ try{ if(!branches.length) loadBranches(); }catch(_){yahmaErr(_,'render-router.js:511');} }
  document.getElementById('count-fleet').textContent = fleet.length;
  // تاب "الفحص والرخصة والتأمين": فحص + رخصة + تأمين
  /* الأرقام دي لازم تُحسب بنفس منطق الفلترة في fleetForTab بالظبط،
     وإلا ظهر تعارض زي «720 محتاجة تجديد» والجدول «438».
     fleetForTab هو المصدر الوحيد للحقيقة. */
  const pendingInspectionIds=new Set(loadInspectionPayments().map(item=>String(item.carId)));
  const tabCount=(tab, extra)=>{
    try{
      if(typeof fleetForTab!=='function') return 0;
      const list=fleetForTab(tab, fleet);
      return extra ? list.filter(extra).length : list.length;
    }catch(_){ return 0; }
  };
  const renewalAlerts = tabCount('renewals', c=>!pendingInspectionIds.has(String(c.id)));
  const licenseAlerts = tabCount('license-renewals');
  const insuranceAlerts = tabCount('insurance-renewals');
  // تاب "بطاقات التشغيل": تنبيهات الكارت (بطاقة التشغيل)
  const followUpAlerts = tabCount('inspections');
    document.getElementById('count-renewals').textContent = renewalAlerts;
    const licenseCount=document.getElementById('count-license-renewals'); if(licenseCount) licenseCount.textContent=licenseAlerts;
    const insuranceCount=document.getElementById('count-insurance-renewals'); if(insuranceCount) insuranceCount.textContent=insuranceAlerts;
    document.getElementById('count-inspections').textContent = followUpAlerts;
    const transfersCount=fleet.filter(c=>String(c.transferDone||'').trim()==='نعم').length;
    const transfersBadge=document.getElementById('count-transfers'); if(transfersBadge) transfersBadge.textContent=transfersCount;
    const pendingPayments=loadInspectionPayments().length;
    const paymentCount=document.getElementById('count-payments'); if(paymentCount) paymentCount.textContent=pendingPayments;
    const paidCount=document.getElementById('count-paid'); if(paidCount) paidCount.textContent=loadPaidInspections().length;
    const renewedCount=document.getElementById('count-renewed'); if(renewedCount) renewedCount.textContent=loadRenewedInspections().length;
    try{ if(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function'){ window.YahmaPayments.localByStatus('pending'); window.YahmaPayments.localByStatus('paid'); } }catch(_){yahmaErr(_,'render-router.js:540');}
  const cb=document.getElementById('count-branches'); if(cb) cb.textContent = branches.length;
  const cp=document.getElementById('count-preparation'); if(cp) cp.textContent = getPrepTasks().filter(t=>t.status!=='done').length;
  const sync=document.getElementById('sync-status');if(sync){sync.textContent=window.syncMessage||'جاري الاتصال';sync.className='sync-status '+(window.supabaseReady?'online':'offline');}
  updateLastSyncLabel();

  const content = document.getElementById('content');
  /* ===== فلترة الأسطول حسب التبويب =====
     كل تبويب يعرض سياراته فقط (اللي محتاجة فحص / رخص منتهية / تأمين...),
     والأسطول والفروع والتقارير يفضلوا كل الأسطول.
     بنلفّ fleet مؤقتاً وقت الرسم ونرجّعها فوراً — فالتعديل والحفظ شغالين عادي. */
  let scopedFleet=null;
  if (typeof fleetForTab==='function' && currentTab
      && ['dashboard','fleet','branches','reports','audit','preparation','dues'].indexOf(currentTab)<0){
    try{
      __yahmaFullFleet = fleet;
      scopedFleet = fleetForTab(currentTab, fleet);
      fleet = scopedFleet;
    }catch(_){ scopedFleet=null; }
  }
  try{
    /* بيانات PDF الخاصة بالتبويب تُعاد توليدها مع كل عرض — نمسح القديمة حتى لا يصدّر زر PDF بيانات تبويب سابق */
    window._yahmaCurrentPdfData = null;
    /* تبويبات الجداول: مسطرة تمرير رأسية واحدة فقط لا غير */
    var TABLE_TABS = ['fleet','branches','payments','paid','renewed']; /* مثبّتة: الجدول يتمرر داخليًا والفلاتر والترقيم ثابتة */
    var FLOW_TABS = ['renewals','license-renewals','insurance-renewals','inspections','transfers']; /* انسيابية: المحتوى يتمرر مرة واحدة والجدول بطوله الطبيعي */
    content.classList.toggle('content-table', TABLE_TABS.indexOf(currentTab) >= 0);
    content.classList.toggle('content-flow', FLOW_TABS.indexOf(currentTab) >= 0);

  // Topbar layout: mockup-style on dashboard
  const tb = document.querySelector('.topbar');
  if (tb) tb.classList.toggle('is-dashboard', currentTab === 'dashboard');
  const titles = document.querySelector('.topbar-titles');
  if (titles) titles.style.display = currentTab === 'dashboard' ? 'none' : 'block';
if(currentTab === 'dashboard') renderDashboard(content);
    else if(currentTab === 'fleet') renderFleet(content);
    else if(currentTab === 'renewals') renderRenewals(content,'inspection');
    else if(currentTab === 'license-renewals') renderRenewals(content,'license');
    else if(currentTab === 'insurance-renewals') renderRenewals(content,'insurance');
    else if(currentTab === 'payments') renderInspectionPayments(content);
    else if(currentTab === 'paid') renderPaidInspections(content);
    else if(currentTab === 'renewed') renderRenewedInspections(content);
    else if(currentTab === 'inspections') renderFollowUp(content);
    else if(currentTab === 'transfers') renderTransfers(content);
    else if(currentTab === 'reports') renderReports(content);
    else if(currentTab === 'audit') renderAuditPage(content);
    else if(currentTab === 'branches') renderBranches(content);
    else if(currentTab === 'preparation') renderPreparation(content);
    else if(currentTab === 'dues' && window.YahmaDues && typeof window.YahmaDues.render==='function'){
      try{ window.YahmaDues.render(content); }
      catch(e){
        window.__lastError=(e&&e.stack)||String(e);
        content.innerHTML='<div class="panel"><h3>تعذر عرض المستحقات</h3><p class="muted-small">'+escapeHtml(e&&e.message?e.message:'حدث خطأ غير متوقع')+'</p><button type="button" class="btn btn-primary btn-small" id="dues-retry">إعادة المحاولة</button></div>';
        document.getElementById('dues-retry')?.addEventListener('click',()=>render());
      }
    }
  }catch(e){
    window.__lastError=(e&&e.stack)||String(e);
    console.error('render failed for tab '+currentTab,e);
    if(currentTab==='reports'&&content){
      content.innerHTML='<div class="panel"><h3>تعذر عرض التقارير</h3><p class="muted-small">'+escapeHtml(e&&e.message?e.message:'حدث خطأ غير متوقع')+'</p><button type="button" class="btn btn-primary btn-small" id="reports-retry">إعادة المحاولة</button></div>';
      document.getElementById('reports-retry')?.addEventListener('click',()=>render());
    }else renderEmergencyFleet(content);
  }
  /* ⚠️ نرجّع الأسطول الكامل فور انتهاء الرسم وقبل أي فحص للبيانات.
     لو رجعنا بعد showDataWarning — البانر هيشوف القائمة المفلترة (ممكن تكون فاضية)
     ويقول «لم تظهر البيانات» خطأً. الأولوية هنا للأمان. */
  if(__yahmaFullFleet && Array.isArray(__yahmaFullFleet)){ fleet = __yahmaFullFleet; }
  __yahmaFullFleet = null;
  try{ if(typeof applyBranchScopeUI==='function') applyBranchScopeUI(); }catch(_){yahmaErr(_,'render-router.js:601');}
  try{ showBranchScopeNotice(content); }catch(_){yahmaErr(_,'render-router.js:602');}
  try{ showDataWarning(content); }catch(_){yahmaErr(_,'render-router.js:603');}
  /* الصلاحيات حسب التبويب: «تشغيل» يعدّل في الفحص بس، والباقي
     قراءة فقط. طبقة واحدة بتغطي كل أزرار التعديل بدل شرط في كل ملف. */
  try{ applyTabEditPermission(content); }catch(_){yahmaErr(_,'render-router.js:606');}
  /* شريط التصدير (Excel + PDF) بيظهر في أي تبويب فيه جدول */
  try{ if(window.YahmaExportBar&&typeof window.YahmaExportBar.sync==='function') window.YahmaExportBar.sync(); }catch(_){yahmaErr(_,'render-router.js:608');}
}

/* ===== تنبيه صريح عند فشل تحميل البيانات =====
   بدون كده المستخدم يشوف شاشة فاضية ويظن إن الأسطول فاضي */
/* ===== تنبيه نطاق الفرع =====
   القاعدة: فرع محدد ⇐ ذلك الفرع فقط. بدون فرع ⇐ كل الفروع.
   التنبيه يظهر فقط لو الحساب مربوط بفرع ما فيه ولا سيارة، لأن
   الاسم هنا لازم يطابق أسماء الفروع في الأسطول بالحرف (الخادم بيطابق كذلك). */
function showBranchScopeNotice(content){
  if(!content) return;
  const old=document.getElementById('yahma-branch-warn');
  if(old) old.remove();
  let role=''; try{ role=String(typeof currentRole!=='undefined'?currentRole:''); }catch(_){yahmaErr(_,'render-router.js:621');}
  if(!role || role==='admin') return;
  let branch=''; try{ branch=String((typeof window.currentUserBranch!=='undefined'&&window.currentUserBranch)||'').trim(); }catch(_){yahmaErr(_,'render-router.js:623');}
  let list=null; try{ list=(typeof fleet!=='undefined'&&Array.isArray(fleet))?fleet:null; }catch(_){yahmaErr(_,'render-router.js:624');}
  if(!branch) return;                       /* بدون فرع ⇐ كل الفروع، مفيش سبب للتنبيه */
  if(!list || list.length) return;          /* فيه بيانات → لا شيء */
  let body='<b>لا توجد سيارات مرتبطة بفرعك</b>'
    +'<span>حسابك مربوط بالفرع: <b>'+escapeHtml(branch)+'</b> — والتطبيق لا يرى أي سيارة بهذا الاسم. تأكد من مطابقته لأسماء الفروع في الأسطول، أو اختر «كل الفروع» من «إدارة المستخدمين».</span>';
  const banner=document.createElement('div');
  banner.id='yahma-branch-warn';
  banner.className='yahma-data-warn';
  banner.innerHTML='<div class="ywarn-ico">🔒</div><div class="ywarn-body">'+body+'</div>'
    +'<div class="ywarn-acts"><button type="button" class="btn btn-primary btn-small" data-ywarn="cloud">↻ إعادة المحاولة</button>'
    +'<button type="button" class="btn btn-ghost btn-small" data-ywarn="relogin">تسجيل خروج ودخول</button></div>';
  const first=content.firstElementChild;
  if(first) content.insertBefore(banner,first); else content.appendChild(banner);
  banner.querySelector('[data-ywarn="cloud"]').onclick=async()=>{ try{ if(typeof loadData==='function'){ await loadData(true); render(); } }catch(_){yahmaErr(_,'render-router.js:637');} };
  banner.querySelector('[data-ywarn="relogin"]').onclick=()=>{
    /* نمرّ عبر yahmaSignOut ليخرج محليًا فورًا حتى لو الشبكة تعطّلت */
    try{ if(typeof window.yahmaSignOut==='function'){ window.yahmaSignOut(); } }
    catch(_){ try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) supabaseClient.auth.signOut(); }catch(__){yahmaErr(__,'render-router.js:641');} }
    setTimeout(()=>location.reload(),600);
  };
}

/* ===== الصلاحيات حسب التبويب =====
   القاعدة المطلوبة: «تشغيل» يقدر يشتغل في تبويب الفحص بس، وباقي
   الأقسام عرض فقط له. بدل شرط متكرر في كل ملف، بنمسح أي زر تعديل
   مرة واحدة بعد كل رسم.

  بعبارة أخرى: الأزرار اللي بتعدّل بيانات (حفظ/حذف/رفع/تعيين/تجديد) بتتعطّل
   وتاخد تلميح يوضّح للمستخدم إن حسابه محدود. */
const EDIT_ACTION_RE = /(حذف|رفع|استيراد|تعيين|ضبط|تجديد|إضافة|تعديل|حفظ|تحديث|الإجراء|رجوع|تسجيل الدفع|✏|🗑|📥|✚|➕|🗓|↻|↩)/;
const EDIT_ID_RE = /(upload|import|delete|del-|drop|bulk|save|add|edit|renew|set-|status|remove|trash|stepback|payment-cancel|payment-done)/i;

function applyTabEditPermission(content){
  if(!content) return;
  if(typeof window.YahmaPerms!=='object') return;
  /* الأدوار الأعلى ما يتلمسش */
  if(window.YahmaPerms.rank() >= 3) return;
  const allowed = window.YahmaPerms.canEditNow();
  if(allowed) return;

  const nodes = content.querySelectorAll('button, input[type="checkbox"][data-row-check], .row-check');
  let blocked = 0;
  nodes.forEach(function(el){
    if(el.closest('#yahma-export-bar')) return;       /* التصدير مسموح دايمًا */
    if(el.disabled) return;
    const id = el.id || '';
    const txt = (el.textContent||'').replace(/\s+/g,' ').trim();
    const isEdit = EDIT_ID_RE.test(id) || (EDIT_ACTION_RE.test(txt) && el.tagName === 'BUTTON');
    if(!isEdit) return;
    /* أزرار التصفية/البحث مش تعديل */
    if(/(بحث|فلتر|مسح الفلاتر|تحديث الصفحة|تبديل|عرض)/.test(txt) && !/رفع|حذف|حفظ/.test(txt)) return;
    el.disabled = true;
    el.dataset.permBlocked = '1';
    el.title = window.YahmaPerms.denyMessage(txt.slice(0,30) || 'هذا الإجراء');
    blocked++;
  });
  if(blocked && window.YahmaPerms.role() === 'ops'){
    showEditHint(content);
  }
}

/* تلميح صغير يوضح ليش الأزرار مقفولة — بدل ما المستخدم يت wondering */
let __yahmaPermHint = null;
function showEditHint(content){
  try{
    if(__yahmaPermHint && __yahmaPermHint.parentNode) __yahmaPermHint.remove();
    const box = document.createElement('div');
    box.id = 'yahma-perm-hint';
    box.className = 'yx-perm-hint';
    box.textContent = 'حسابك «تشغيل» — مسموح بالتعديل في تبويب «الفحص» بس — باقي الأقسام مشاهدة';
    content.insertBefore(box, content.firstChild);
    __yahmaPermHint = box;
  }catch(_){yahmaErr(_,'render-router.js:696');}
}

function showDataWarning(content){
  if(!content) return;
  const old=document.getElementById('yahma-data-warn');
  if(old) old.remove();
  if(window.__yahmaWarnDismissed) return;   /* المستخدم أقفله — ما نرجعوش له تاني */
  let list=null;
  try{ list=(typeof fleet!=='undefined'&&Array.isArray(fleet))?fleet:null; }catch(_){yahmaErr(_,'render-router.js:705');}
  if(!list || list.length) return;                 /* فيه بيانات → لا شيء */
  const msg=String((typeof window.syncMessage!=='undefined'&&window.syncMessage)||'').trim();
  const expired=!!(typeof window.__yahmaSessionExpired!=='undefined'&&window.__yahmaSessionExpired);
  const failed=expired||/تعذر|محلي|فشل|انتهت|غير متاح|error/i.test(msg);
  const reason=failed?msg:'لم يتم تحميل السيارات من السحابة';
  const banner=document.createElement('div');
  banner.id='yahma-data-warn';
  banner.className='yahma-data-warn';
  banner.innerHTML='<button type="button" class="ywarn-close" data-ywarn="close" aria-label="إغلاق التنبيه" title="إغلاق">✕</button>'
    +'<div class="ywarn-ico">'+(expired?'🔑':'⚠️')+'</div><div class="ywarn-body"><b>'+(expired?escapeHtml(reason):('لم تظهر البيانات ('+escapeHtml(reason)+')'))+'</b>'
    +'<span>'+(expired?'الجلسة على هذا الجهاز انتهت — سجّل الدخول من جديد وسترجع البيانات فورًا.'
      :'غالبًا انتهت جلسة الدخول أو الشبكة ضعيفة. جرّب: تحديث البيانات، أو تسجيل الخروج والدخول من جديد.')+'</span></div>'
    +'<div class="ywarn-acts">'
    +(expired?'<button type="button" class="btn btn-primary btn-small" data-ywarn="relogin">🔑 تسجيل دخول</button>'
             :'<button type="button" class="btn btn-primary btn-small" data-ywarn="cloud">⬇ حدّث من السحابة</button>')
    +'<button type="button" class="btn btn-ghost btn-small" data-ywarn="reload">↻ تحديث الآن</button>'
    +'<button type="button" class="btn btn-ghost btn-small" data-ywarn="relogin2">'+(expired?'تسجيل خروج ودخول':'إعادة تسجيل الدخول')+'</button>'
    +'</div>';
  const first=content.firstElementChild;
  if(first) content.insertBefore(banner,first); else content.appendChild(banner);
  banner.querySelector('[data-ywarn="close"]').onclick=()=>{ window.__yahmaWarnDismissed=true; hideDataWarning(); };
  banner.querySelector('[data-ywarn="reload"]').onclick=()=>location.reload();
  banner.querySelector('[data-ywarn="cloud"]')?.addEventListener('click',async()=>{
    try{ if(typeof window.__yahmaSessionExpired!=='undefined') window.__yahmaSessionExpired=false;
      if(typeof loadData==='function'){ await loadData(true); } }catch(_){yahmaErr(_,'render-router.js:730');}
    render();
  });
  const relogin=()=>{
    /* نمرّ عبر yahmaSignOut ليخرج محليًا فورًا حتى لو الشبكة تعطّلت */
    try{ if(typeof window.yahmaSignOut==='function'){ window.yahmaSignOut(); } }
    catch(_){ try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) supabaseClient.auth.signOut(); }catch(__){yahmaErr(__,'render-router.js:736');} }
    setTimeout(()=>location.reload(),600);
  };
  banner.querySelector('[data-ywarn="relogin"]')?.addEventListener('click',relogin);
  banner.querySelector('[data-ywarn="relogin2"]')?.addEventListener('click',relogin);
}
/* إخفاء التنبيه فورًا — بنستدعيها لحظة وصول البيانات حتى لو مفيش render جديد */
function hideDataWarning(){ const b=document.getElementById('yahma-data-warn'); if(b) b.remove(); }
window.hideDataWarning = hideDataWarning;
/* نداءها من طبقة البيانات بعد كل تحميل — يضمن إن التحذير مايفضلش معلّق على الشاشة */
window.yahmaRefreshDataWarning = function(){
  hideDataWarning();
  if(window.__yahmaWarnDismissed) return;
  try{ const c=document.getElementById('content'); if(c) showDataWarning(c); }catch(_){yahmaErr(_,'render-router.js:749');}
};

/* التغليف ضروري بعد التقسيم: openEmailFilteredPdfModal معرّفة في core/pdf-share.js
   (ملف لاحق) — المرجع المباشر وقت التحميل كان سيسقط بـ ReferenceError بعد الفصل. */
document.getElementById('btn-email-filtered-pdf')?.addEventListener('click',function(){ openEmailFilteredPdfModal(); });

const CHART_COLORS = ['#E0A42E','#3B82C4','#2FA36B','#9C4FD6','#D5503F','#20A3A3','#E8792E','#5A6FD6','#4C9E57','#C15DA8'];
function colorAt(i){ return CHART_COLORS[i % CHART_COLORS.length]; }

function buildDonut(counts){
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,c])=>s+c,0) || 1;
  const r = 68, cx = 90, cy = 90, sw = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let circles = '';
  entries.forEach(([label,count],i)=>{
    const len = (count/total) * circ;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorAt(i)}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(circ-len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" />`;
    offset += len;
  });
  const svg = `<svg viewBox="0 0 180 180" width="180" height="180">
    <g transform="rotate(-90 90 90)">${circles}</g>
    <circle cx="90" cy="90" r="${r - sw/2 - 3}" fill="var(--panel)"/>
    <text x="90" y="86" text-anchor="middle" font-size="24" font-weight="700" fill="#17202B" font-family="Cairo, sans-serif">${total}</text>
    <text x="90" y="105" text-anchor="middle" font-size="11" fill="#6B7280" font-family="Cairo, sans-serif">إجمالي العربيات</text>
  </svg>`;
  const legend = entries.map(([label,count],i)=>`
    <div class="legend-item">
      <span class="legend-swatch" style="background:${colorAt(i)}"></span>
      <span class="legend-label">${label}</span>
      <span class="legend-count">${count}</span>
      <span class="legend-pct">${Math.round(count/total*100)}%</span>
    </div>`).join('');
  return `<div class="donut-wrap"><div>${svg}</div><div class="legend">${legend}</div></div>`;
}

function buildStackedBar(label, counts, total){
  const order = ['green','amber','red','grey'];
  const segs = order.filter(k=>counts[k]>0).map(k=>`<div class="stack-seg ${k}" style="width:${(counts[k]/total*100).toFixed(1)}%"></div>`).join('');
  const partsText = order.filter(k=>counts[k]>0).map(k=>{
    const names = {green:'جيدة', amber:'قريبة', red:'متأخرة/منتهية', grey:'غير محددة'};
    return `${counts[k]} ${names[k]}`;
  }).join(' · ');
  return `<div class="stack-block">
    <div class="stack-label"><span>${label}</span><span class="muted">${partsText}</span></div>
    <div class="stack-track">${segs}</div>
  </div>`;
}

function buildYearChart(counts){
  const years = Object.keys(counts).sort();
  const max = Math.max(...Object.values(counts), 1);
  const cols = years.map(y=>{
    const h = Math.max((counts[y]/max)*110, 4);
    return `<div class="year-col">
      <div class="year-bar-num">${counts[y]}</div>
      <div class="year-bar" style="height:${h}px"></div>
      <div class="year-label">${y}</div>
    </div>`;
  }).join('');
  return `<div class="year-chart">${cols}</div>`;
}

function buildOwnerChart(counts){
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = Math.max(...entries.map(e=>e[1]), 1);
  return entries.map(([owner,count])=>`
    <div class="owner-row">
      <div class="owner-top"><b>${owner}</b><span class="muted-small">${count} عربية</span></div>
      <div class="owner-track"><div class="owner-fill" style="width:${(count/max*100).toFixed(1)}%"></div></div>
    </div>`).join('') || '<div class="empty">لا توجد بيانات ملاك بعد</div>';
}


async function downloadBranchStatusTemplate(){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  const headers=['رقم اللوحة','الفرع','حالة السيارة'];
  const examples=[
    ['ر ن س 6724','فرع الرياض','نشط'],
    ['ر ن س 6725','فرع جدة','تحت الصيانة'],
    ['ر ن س 6726','فرع الدمام','خارج الخدمة']
  ];
  const ws=XLSX.utils.aoa_to_sheet([headers,...examples]);
  ws['!cols']=[{wch:18},{wch:18},{wch:16}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'تحديث فرع وحالة');
  XLSX.writeFile(wb,'نموذج-تحديث-فرع-وحالة.xlsx');
}
async function handleBranchStatusImport(file){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  let rows;
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  }catch(e){
    alert('تعذر قراءة الملف.');
    return;
  }
  if(!rows.length){ alert('الملف فارغ.'); return; }

  const normPlate=typeof normalizePlateKey==='function'?normalizePlateKey:(p=>String(p||'').replace(/\s+/g,'').toLowerCase());
  const byPlate=new Map();
  fleet.forEach(c=>{ byPlate.set(normPlate(c.plate), c); });

  let updated=0, notFound=0, skipped=0;
  const changes=[];
  const changedIds=[];
  rows.forEach(row=>{
    let plate='', branch='', status='';
    Object.keys(row).forEach(h=>{
      const nh=String(h).replace(/\s+/g,'').toLowerCase();
      const field=typeof findField==='function'?findField(h):null;
      if(field==='plate'||nh.includes('لوح')||nh.includes('plate')) plate=row[h];
      else if(field==='branch'||nh.includes('فرع')||nh.includes('branch')) branch=row[h];
      else if(field==='carStatus'||nh.includes('حالة')||nh.includes('status')) status=row[h];
    });
    // fallback: columns by order
    const vals=Object.values(row);
    if(!plate && vals[0]) plate=vals[0];
    if(!branch && vals[1]!=null && vals[1]!=='') branch=vals[1];
    if(!status && vals[2]!=null && vals[2]!=='') status=vals[2];

    plate=String(plate||'').trim();
    branch=String(branch||'').trim();
    status=String(status||'').trim();
    if(!plate){ skipped++; return; }
    if(!branch && !status){ skipped++; return; }

    const car=byPlate.get(normPlate(plate));
    if(!car){ notFound++; return; }

    let changed=false;
    if(branch && String(car.branch||'').trim()!==branch){
      car.branch=branch;
      ensureBranchName(branch);
      changed=true;
    }
    if(status){
      // تطبيع بسيط للحالة
      let st=status;
      if(st.includes('صيان')) st='تحت الصيانة';
      else if(st.includes('خارج')) st='خارج الخدمة';
      else if(st==='نشط'||st==='ساري'||st.toLowerCase()==='active') st='نشط';
      if(String(car.carStatus||'').trim()!==st){
        car.carStatus=st;
        changed=true;
      }
    }
    if(changed){ updated++; changes.push(car.plate); changedIds.push(car.id); }
  });

  if(!updated){
    alert('لم يتم تحديث أي سيارة.\nغير موجودة: '+notFound+'\nتم تجاهل: '+skipped);
    return;
  }
  if(!confirm('سيتم تحديث '+updated+' سيارة (فرع و/أو حالة).\nمتابعة؟')) return;
  await saveData(changedIds);
  render();
  alert('تم تحديث '+updated+' سيارة.'+(notFound? '\nغير موجودة بالأسطول: '+notFound:'')+(skipped? '\nصفوف متجاهلة: '+skipped:''));
}

function buildBranchMessage(branchName, kind){
  const st=branchStats(branchName);
  const lines=[];
  const title=kind==='insp'?'السيارات غير المفحوصة':kind==='card'?'الكروت التي تحتاج متابعة':kind==='lic'?'الرخص التي تحتاج متابعة':'ملخص جاهزية الفرع';
  lines.push('📋 *'+title+'*');
  lines.push('الفرع: *'+branchName+'*');
  lines.push('التاريخ: '+new Date().toLocaleDateString('ar-EG'));
  lines.push('————————————');
  let list=st.cars;
  if(kind==='insp') list=st.cars.filter(c=>inspectionDisplayStatus(c.inspectionStatus).level!=='green');
  else if(kind==='card') list=st.cars.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green');
  else if(kind==='lic') list=st.cars.filter(c=>licenseDisplayStatus(c.licenseExpiry).level!=='green');
  else if(kind==='summary'){
    lines.push('إجمالي السيارات: '+st.total);
    lines.push('جاهزة: '+st.ready);
    lines.push('تحتاج فحص: '+st.insp);
    lines.push('كارت يحتاج متابعة: '+st.card);
    lines.push('رخصة تحتاج متابعة: '+st.lic);
    lines.push('————————————');
    lines.push('مرسل من نظام إدارة الأسطول');
    return lines.join('\n');
  }
  lines.push('العدد: *'+list.length+'*');
  lines.push('————————————');
  if(!list.length) lines.push('✅ لا توجد عناصر.');
  else list.slice(0,80).forEach((c,i)=>{
    lines.push((i+1)+') '+(c.plate||'—')+' | '+(c.carStatus||'—'));
    if(kind==='insp') lines.push('   الفحص: '+inspectionDisplayStatus(c.inspectionStatus).label);
    if(kind==='card') lines.push('   الكارت: '+cardDisplayStatus(c.cardExpiry,c.cardStatus).label+(c.cardExpiry?' | '+fmtDate(c.cardExpiry):''));
    if(kind==='lic') lines.push('   الرخصة: '+licenseDisplayStatus(c.licenseExpiry).label+(c.licenseExpiry?' | '+fmtDate(c.licenseExpiry):''));
  });
  if(list.length>80) lines.push('… و '+(list.length-80)+' أخرى');
  lines.push('————————————');
  lines.push('مرسل من نظام إدارة الأسطول');
  return lines.join('\n');
}
function emailBranch(branchName, kind){
  const b=getBranchByName(branchName);
  const to=(b&&b.email)||'';
  const subject='تقرير '+(kind==='insp'?'الفحص':kind==='card'?'الكارت':kind==='lic'?'الرخصة':'الجاهزية')+' — فرع '+branchName;
  const body=buildBranchMessage(branchName, kind||'summary');
  const email=to||prompt('بريد الفرع (أو اتركه فارغًا واختر من برنامج البريد):', '')||'';
  window.location.href='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
function whatsappBranch(branchName, kind){
  const b=getBranchByName(branchName);
  const phone=(b&&b.phone)||prompt('رقم واتساب الفرع (مثال: 2010xxxxxxxx) — اتركه فارغًا للاختيار يدويًا:','')||'';
  const st=branchStats(branchName);
  let list=st.cars, title='ملخص فرع '+branchName, headers, rows, filename;
  kind=kind||'summary';
  if(kind==='insp'){
    list=st.cars.filter(c=>inspectionDisplayStatus(c.inspectionStatus).level!=='green');
    title='غير المفحوصة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','حالة الفحص','حالة الرخصة','انتهاء الرخصة'];
    rows=carsToInspRows(list);
    filename='فحص-'+branchName+'-'+todayStr();
  }else if(kind==='card'){
    list=st.cars.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green');
    title='كروت تحتاج متابعة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','رقم الكارت','حالة السيارة','حالة الكارت','انتهاء الكارت','التأمين'];
    rows=carsToCardRows(list);
    filename='كارت-'+branchName+'-'+todayStr();
  }else if(kind==='lic'){
    list=st.cars.filter(c=>licenseDisplayStatus(c.licenseExpiry).level!=='green');
    title='رخص تحتاج متابعة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','حالة الرخصة','انتهاء الرخصة'];
    rows=list.map(c=>[c.plate||'—',c.brand||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',licenseDisplayStatus(c.licenseExpiry).label,fmtDate(c.licenseExpiry)]);
    filename='رخصة-'+branchName+'-'+todayStr();
  }else{
    title='ملخص جاهزية — فرع '+branchName;
    headers=['البند','العدد'];
    rows=[['إجمالي السيارات',String(st.total)],['جاهزة',String(st.ready)],['تحتاج فحص',String(st.insp)],['كارت يحتاج متابعة',String(st.card)],['رخصة تحتاج متابعة',String(st.lic)]];
    filename='ملخص-'+branchName+'-'+todayStr();
  }
  sharePdfOnWhatsApp({
    title,
    subtitle:'فرع '+branchName+' — '+list.length+' سجل',
    headers,
    rows,
    phone:String(phone||'').trim(),
    filename,
    caption:'📋 '+title+' ('+list.length+') — مرفق PDF',
    fallbackText:buildBranchMessage(branchName, kind)
  });
}

function renderBranches(content){
  return window.YahmaBranches.render(content, {
    fleet,
    getBranches: () => branches,
    replaceBranches: next => { branches = next; },
    ensureBranchName,
    branchStats,
    openBranchModal,
    saveBranches,
    emailBranch,
    whatsappBranch,
    downloadBranchStatusTemplate,
    escapeHtml
  });
}

function openBranchModal(id){
  const existing=id?branches.find(b=>b.id===id):null;
  editingBranchId=id||null;
  const name=existing?existing.name:'';
  const email=existing?existing.email:'';
  const phone=existing?existing.phone:'';
  const manager=existing?existing.manager:'';
  const notes=existing?existing.notes:'';
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.id='branch-overlay';
  overlay.style.display='flex';
  overlay.innerHTML=`<div class="modal" style="max-width:480px">
    <h2>${existing?'تعديل فرع':'إضافة فرع'}</h2>
    <div class="field-grid">
      <div class="field full"><label for="br-f-name">اسم الفرع *</label><input id="br-f-name" value="${escapeHtml(name)}"></div>
      <div class="field"><label for="br-f-manager">المسؤول</label><input id="br-f-manager" value="${escapeHtml(manager)}"></div>
      <div class="field"><label for="br-f-phone">واتساب</label><input id="br-f-phone" value="${escapeHtml(phone)}" placeholder="2010xxxxxxxx"></div>
      <div class="field full"><label for="br-f-email">الإيميل</label><input id="br-f-email" type="email" value="${escapeHtml(email)}" placeholder="branch@example.com"></div>
      <div class="field full"><label for="br-f-notes">ملاحظات</label><textarea id="br-f-notes">${escapeHtml(notes)}</textarea></div>
    </div>
    <div class="modal-actions">
      <div></div>
      <div class="modal-actions-right">
        <button class="btn btn-ghost" id="br-cancel">إلغاء</button>
        <button class="btn btn-primary" id="br-save">حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#br-cancel').onclick=()=>overlay.remove();
  overlay.onclick=e=>{ if(e.target===overlay) overlay.remove(); };
  overlay.querySelector('#br-save').onclick=()=>{
    const n=(document.getElementById('br-f-name').value||'').trim();
    if(!n){ alert('اسم الفرع مطلوب'); return; }
    const data={
      name:n,
      manager:(document.getElementById('br-f-manager').value||'').trim(),
      phone:(document.getElementById('br-f-phone').value||'').trim(),
      email:(document.getElementById('br-f-email').value||'').trim(),
      notes:(document.getElementById('br-f-notes').value||'').trim()
    };
    if(editingBranchId){
      const b=branches.find(x=>x.id===editingBranchId);
      if(b) Object.assign(b,data);
    }else{
      branches.push({id:'b'+Date.now()+Math.floor(Math.random()*999),...data});
    }
    saveBranches();
    overlay.remove();
    if(currentTab==='branches') render();
    else {
      const cb=document.getElementById('count-branches'); if(cb) cb.textContent=branches.length;
    }
  };
}

function renderDashboard(content){ return window.YahmaDashboard.render(content, {fleet, setCurrentTab: tab => { currentTab = tab; }}); }
function renderFleet(content){ return window.YahmaFleet.render(content, fleet); }
