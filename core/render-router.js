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
  if(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function'){
    return window.YahmaPayments.localByStatus('paid');
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

function renderInspectionPayments(content){
  document.getElementById('topbar-title').textContent='تحت الدفع';
  document.getElementById('topbar-sub').textContent='طلبات دفع تجديد فحص السيارات';
  const pending=loadInspectionPayments();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rows=pending.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip"><div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>طلبات تحت الدفع</small></span></div></div>
  <div class="filter-panel"><div class="filter-panel-title"><strong>طلبات تجديد الفحص بانتظار الدفع</strong><span>بعد تسجيل الدفع تنتقل الطلب إلى تبويب «تم الدفع»</span></div></div>
  ${paymentsSyncWarningHtml()}
  <div class="table-scroll"><table class="fleet-table"><thead><tr><th>رقم اللوحة</th><th>الفرع</th><th>تاريخ الطلب</th><th>حالة الدفع</th><th>الإجراء</th></tr></thead><tbody>
  ${rows.length?rows.map(({item,car})=>`<tr><td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td><td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td><span class="tag amber">تحت الدفع</span></td><td><button type="button" class="btn btn-primary btn-small" data-payment-done="${escapeHtml(item.id)}">تسجيل الدفع</button> <button type="button" class="btn btn-ghost btn-small" data-payment-cancel="${escapeHtml(item.id)}">إلغاء الطلب</button></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">لا توجد طلبات تحت الدفع</div></td></tr>'}
  </tbody></table></div>`;
  bindPaymentsDiagnostic(content);
  content.querySelectorAll('[data-payment-done],[data-payment-cancel]').forEach(button=>button.addEventListener('click',async()=>{
    if(window.currentRole!=='admin'&&window.currentRole!=='ops'){alert('ليس لديك صلاحية إدارة طلبات الدفع.');return;}
    const id=button.dataset.paymentDone||button.dataset.paymentCancel;
    if(!id)return;
    const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
    if(!item)return;
    const car=byId.get(String(item.carId));
    if(button.dataset.paymentCancel){
      if(!confirm('إلغاء طلب الدفع للسيارة '+(car?.plate||item.plate)+'؟'))return;
      await window.YahmaPayments.cancel(id, item.carId);
      if(typeof window.log==='function') window.log('إلغاء طلب دفع فحص','السيارة '+(car?.plate||item.plate||''));
      render();return;
    }
    if(!car){alert('لم تعد السيارة موجودة في الأسطول.');return;}
    if(!confirm('تأكيد تسجيل دفع تجديد الفحص للسيارة '+car.plate+'؟'))return;
    const previousInspectionStatus=car.inspectionStatus;
    car.inspectionStatus='سليم';
    const saved=await saveData([car.id]);
    if(saved===false){
      car.inspectionStatus=previousInspectionStatus;
      await saveData([car.id]);
      alert('تعذر حفظ التغيير على Supabase. تم إرجاع الحالة محليًا؛ تحقق من الاتصال ثم أعد المحاولة.');
      return;
    }
    await window.YahmaPayments.markPaid(id, item.carId);
    if(typeof window.log==='function') window.log('تسجيل دفع وتجديد فحص','السيارة '+car.plate);
    /* ⇐ السلسلة المطلوبة: تحت الدفع ← تم الدفع ← تجديد الرخص */
    goTabFromRouter('paid');
  }));
}

/* ===== تبويب «تم الدفع» ===== */
function renderPaidInspections(content){
  document.getElementById('topbar-title').textContent='تم الدفع';
  document.getElementById('topbar-sub').textContent='طلبات تم دفع تجديد فحصها واعتمادها';
  const paid=loadPaidInspections();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rows=paid.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
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
  </div>
  <div class="filter-panel"><div class="filter-panel-title"><strong>طلبات تم الدفع</strong><span>الخطوة التالية: تجديد الرخصة — اضغط «تجديد الآن» لتسجيل الرخصة مباشرة من هنا</span></div></div>
  ${paymentsSyncWarningHtml()}
  <div class="table-scroll"><table class="fleet-table"><thead><tr><th>رقم اللوحة</th><th>الفرع</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>حالة الدفع</th><th>الإجراء</th></tr></thead><tbody>
  ${rows.length?rows.map(({item,car})=>{
      const needs=needsLicense({car});
      return `<tr><td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td><td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td>${escapeHtml(formatArabicDate(item.paidAt))}</td><td><span class="tag green">تم الدفع</span></td><td>${needs
        ? `<button type="button" class="btn btn-primary btn-small" data-go-license="${escapeHtml(car.id)}">تجديد الرخصة ←</button>`
        : `<span class="tag green">الرخصة سارية</span>`}</td></tr>`;
    }).join(''):'<tr><td colspan="6"><div class="empty">لا توجد طلبات مدفوعة بعد</div></td></tr>'}
  </tbody></table></div>`;
  bindPaymentsDiagnostic(content);
  /* الانتقال لتبويب «تجديد الرخص» — نمرّ بنفس مسار التبويبات العادي
     عشان الرسم يحصل مرة واحدة فقط (من غير تكرار ولا تردد). */
  content.querySelectorAll('[data-go-license]').forEach(button=>button.addEventListener('click',()=>{
    if(!window.canAccessYahmaTab('license-renewals')){alert('لا تملك صلاحية الوصول إلى قسم تجديد الرخص.');return;}
    goTabFromRouter('license-renewals');
  }));
}

/* انتقال آمن للتبويب: نغيّر التبويب عبر API العام ثم نرسم مرة واحدة.
   ملاحظة: ما ننقرش على عنصر القائمة — النقرة بتسبب رسمين. */
function goTabFromRouter(tab){
  try{
    if(typeof window.yahmaSetTab==='function') window.yahmaSetTab(tab);
    else window.currentTab=tab;
  }catch(_){}
  document.querySelectorAll('.nav-item').forEach(function(i){
    i.classList.toggle('active', i.dataset.tab===tab);
  });
  /* render() بيقرا التبويب من yahmaGetTab — فنداء واحد كافي.
     بنمر على الأغلفة بس لو هيكDelayed، ونحاول _perfImmediate مرة واحدة. */
  try{
    if(typeof window.render==='function'&&typeof window.render._perfImmediate==='function'){
      window.render._perfImmediate();
    }else if(typeof window.render==='function'){
      window.render();
    }
  }catch(_){}
}

function render(){
  /* نقرأ التبويب من الـ API العام (yahmaGetTab) بدل الـ binding المحلي. */
  if(typeof window.yahmaGetTab === 'function'){ currentTab = window.yahmaGetTab(); }
  if(!window.canAccessYahmaTab(currentTab)) { currentTab='dashboard'; if(typeof window.yahmaSetTab==='function') window.yahmaSetTab('dashboard'); }
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.tab===currentTab));
  const emailPdfButton=document.getElementById('btn-email-filtered-pdf');
  if(emailPdfButton) emailPdfButton.style.display=window.currentRole==='admin'?'inline-flex':'none';
  if(typeof loadBranches==='function'){ try{ if(!branches.length) loadBranches(); }catch(_){ } }
  document.getElementById('count-fleet').textContent = fleet.length;
  // تاب "الفحص والرخصة والتأمين": فحص + رخصة + تأمين
  const pendingInspectionIds=new Set(loadInspectionPayments().map(item=>String(item.carId)));
  const renewalAlerts = fleet.filter(c => inspectionDisplayStatus(c.inspectionStatus).level !== 'green'&&!pendingInspectionIds.has(String(c.id))).length;
  const licenseAlerts = fleet.filter(c => dateStatus(c.licenseExpiry).level !== 'green').length;
  const insuranceAlerts = fleet.filter(c => textTag(c.insuranceStatus).level !== 'green').length;
  // تاب "بطاقات التشغيل": تنبيهات الكارت (بطاقة التشغيل)
  const followUpAlerts = fleet.filter(c => dateStatus(c.cardExpiry).level !== 'green' || (c.cardStatus&&String(c.cardStatus).includes('ملغ')) || (c.cardStatus&&String(c.cardStatus).includes('موقوف'))).length;
    document.getElementById('count-renewals').textContent = renewalAlerts;
    const licenseCount=document.getElementById('count-license-renewals'); if(licenseCount) licenseCount.textContent=licenseAlerts;
    const insuranceCount=document.getElementById('count-insurance-renewals'); if(insuranceCount) insuranceCount.textContent=insuranceAlerts;
    document.getElementById('count-inspections').textContent = followUpAlerts;
    const transfersCount=fleet.filter(c=>String(c.transferDone||'').trim()==='نعم').length;
    const transfersBadge=document.getElementById('count-transfers'); if(transfersBadge) transfersBadge.textContent=transfersCount;
    const pendingPayments=loadInspectionPayments().length;
    const paymentCount=document.getElementById('count-payments'); if(paymentCount) paymentCount.textContent=pendingPayments;
    const paidCount=document.getElementById('count-paid'); if(paidCount) paidCount.textContent=loadPaidInspections().length;
    try{ if(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function'){ window.YahmaPayments.localByStatus('pending'); window.YahmaPayments.localByStatus('paid'); } }catch(_){}
  const cb=document.getElementById('count-branches'); if(cb) cb.textContent = branches.length;
  const cp=document.getElementById('count-preparation'); if(cp) cp.textContent = getPrepTasks().filter(t=>t.status!=='done').length;
  const sync=document.getElementById('sync-status');if(sync){sync.textContent=window.syncMessage||'جاري الاتصال';sync.className='sync-status '+(window.supabaseReady?'online':'offline');}
  updateLastSyncLabel();

  const content = document.getElementById('content');
  try{
    /* بيانات PDF الخاصة بالتبويب تُعاد توليدها مع كل عرض — نمسح القديمة حتى لا يصدّر زر PDF بيانات تبويب سابق */
    window._yahmaCurrentPdfData = null;
    /* تبويبات الجداول: مسطرة تمرير رأسية واحدة فقط لا غير */
    var TABLE_TABS = ['fleet','branches','payments','paid']; /* مثبّتة: الجدول يتمرر داخليًا والفلاتر والترقيم ثابتة */
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
    else if(currentTab === 'inspections') renderFollowUp(content);
    else if(currentTab === 'transfers') renderTransfers(content);
    else if(currentTab === 'reports') renderReports(content);
    else if(currentTab === 'audit') renderAuditPage(content);
    else if(currentTab === 'branches') renderBranches(content);
    else if(currentTab === 'preparation') renderPreparation(content);
  }catch(e){
    window.__lastError=(e&&e.stack)||String(e);
    console.error('render failed for tab '+currentTab,e);
    if(currentTab==='reports'&&content){
      content.innerHTML='<div class="panel"><h3>تعذر عرض التقارير</h3><p class="muted-small">'+escapeHtml(e&&e.message?e.message:'حدث خطأ غير متوقع')+'</p><button type="button" class="btn btn-primary btn-small" id="reports-retry">إعادة المحاولة</button></div>';
      document.getElementById('reports-retry')?.addEventListener('click',()=>render());
    }else renderEmergencyFleet(content);
  }
  try{ if(typeof applyBranchScopeUI==='function') applyBranchScopeUI(); }catch(_){}
  try{ showBranchScopeNotice(content); }catch(_){}
  try{ showDataWarning(content); }catch(_){}
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
  let role=''; try{ role=String(typeof currentRole!=='undefined'?currentRole:''); }catch(_){}
  if(!role || role==='admin') return;
  let branch=''; try{ branch=String((typeof window.currentUserBranch!=='undefined'&&window.currentUserBranch)||'').trim(); }catch(_){}
  let list=null; try{ list=(typeof fleet!=='undefined'&&Array.isArray(fleet))?fleet:null; }catch(_){}
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
  banner.querySelector('[data-ywarn="cloud"]').onclick=async()=>{ try{ if(typeof loadData==='function'){ await loadData(true); render(); } }catch(_){} };
  banner.querySelector('[data-ywarn="relogin"]').onclick=()=>{
    /* نمرّ عبر yahmaSignOut ليخرج محليًا فورًا حتى لو الشبكة تعطّلت */
    try{ if(typeof window.yahmaSignOut==='function'){ window.yahmaSignOut(); } }
    catch(_){ try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) supabaseClient.auth.signOut(); }catch(__){} }
    setTimeout(()=>location.reload(),600);
  };
}

function showDataWarning(content){
  if(!content) return;
  const old=document.getElementById('yahma-data-warn');
  if(old) old.remove();
  let list=null;
  try{ list=(typeof fleet!=='undefined'&&Array.isArray(fleet))?fleet:null; }catch(_){}
  if(!list || list.length) return;                 /* فيه بيانات → لا شيء */
  const msg=String((typeof window.syncMessage!=='undefined'&&window.syncMessage)||'').trim();
  const expired=!!(typeof window.__yahmaSessionExpired!=='undefined'&&window.__yahmaSessionExpired);
  const failed=expired||/تعذر|محلي|فشل|انتهت|غير متاح|error/i.test(msg);
  const reason=failed?msg:'لم يتم تحميل السيارات من السحابة';
  const banner=document.createElement('div');
  banner.id='yahma-data-warn';
  banner.className='yahma-data-warn';
  banner.innerHTML='<div class="ywarn-ico">'+(expired?'🔑':'⚠️')+'</div><div class="ywarn-body"><b>'+(expired?escapeHtml(reason):('لم تظهر البيانات ('+escapeHtml(reason)+')'))+'</b>'
    +'<span>'+(expired?'الجلسة على هذا الجهاز انتهت — سجّل الدخول من جديد وسترجع البيانات فورًا.'
      :'غالبًا انتهت جلسة الدخول أو الشبكة ضعيفة. جرّب: تحديث البيانات، أو تسجيل الخروج والدخول من جديد.')+'</span></div>'
    +'<div class="ywarn-acts">'
    +'<button type="button" class="btn btn-primary btn-small" data-ywarn="reload">↻ تحديث الآن</button>'
    +'<button type="button" class="btn btn-ghost btn-small" data-ywarn="cloud">جلب من السحابة</button>'
    +'<button type="button" class="btn btn-ghost btn-small" data-ywarn="relogin">تسجيل خروج ودخول</button>'
    +'</div>';
  const first=content.firstElementChild;
  if(first) content.insertBefore(banner,first); else content.appendChild(banner);
  banner.querySelector('[data-ywarn="reload"]').onclick=()=>location.reload();
  banner.querySelector('[data-ywarn="cloud"]').onclick=async()=>{
    try{ if(typeof window.__yahmaSessionExpired!=='undefined') window.__yahmaSessionExpired=false;
      if(typeof loadData==='function'){ await loadData(true); render(); } }catch(_){}
  };
  banner.querySelector('[data-ywarn="relogin"]').onclick=()=>{
    /* نمرّ عبر yahmaSignOut ليخرج محليًا فورًا حتى لو الشبكة تعطّلت */
    try{ if(typeof window.yahmaSignOut==='function'){ window.yahmaSignOut(); } }
    catch(_){ try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) supabaseClient.auth.signOut(); }catch(__){} }
    setTimeout(()=>location.reload(),600);
  };
}

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
    <text x="90" y="86" text-anchor="middle" font-size="24" font-weight="700" fill="#17202B" font-family="IBM Plex Sans Arabic, sans-serif">${total}</text>
    <text x="90" y="105" text-anchor="middle" font-size="11" fill="#6B7280" font-family="IBM Plex Sans Arabic, sans-serif">إجمالي العربيات</text>
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
