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
    /* ⚠️ العداد = عدد الاستئجارات الشغّالة، زي «تم الدفع» بيعدّ
       السطور الفعلية مش كل السجلات. العداد عدّاد تنبيه لا إحصاء. */
    try{
      const rentalsBadge=document.getElementById('count-rentals');
      if(rentalsBadge && window.YahmaRentals && typeof window.YahmaRentals.localOpen==='function'){
        rentalsBadge.textContent=window.YahmaRentals.localOpen().length;
      }
    }catch(_){yahmaErr(_,'render-router.js:count-rentals');}
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
  /* «الاستئجارات» في القائمة: السجل بيتبني من جدول rentals مش من
     الأسطول، فلو دخل في النطاق هيتقفل على «المحتاجة فحص» ونفس
     الفلتر بيقصي سجلات ما ليها علاقة. */
  if (typeof fleetForTab==='function' && currentTab
      && ['dashboard','fleet','branches','reports','audit','preparation','dues','rentals'].indexOf(currentTab)<0){
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
    var TABLE_TABS = ['fleet','branches','payments','paid','renewed','rentals']; /* مثبّتة: الجدول يتمرر داخليًا والفلاتر والترقيم ثابتة */
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
    else if(currentTab === 'rentals'){
      /* نفس القالب بتاع «المستحقات»: الوحدة دي ليها مكتبتها
         الخاصة، فلازم نشوفها موجودة قبل ما نناديها. */
      if(window.YahmaRentalsUI && typeof window.YahmaRentalsUI.render==='function'){
        try{ window.YahmaRentalsUI.render(content); }
        catch(e){
          window.__lastError=(e&&e.stack)||String(e);
          content.innerHTML='<div class="panel"><h3>تعذر عرض الاستئجارات</h3><p class="muted-small">'+escapeHtml(e&&e.message?e.message:'حدث خطأ غير متوقع')+'</p><button type="button" class="btn btn-primary btn-small" id="rentals-retry">إعادة المحاولة</button></div>';
          document.getElementById('rentals-retry')?.addEventListener('click',()=>render());
        }
      }
    }
    else if(currentTab === 'reports') renderReports(content);
    else if(currentTab === 'audit') renderAuditPage(content);
    else if(currentTab === 'users') renderUsers(content);
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

function renderDashboard(content){ return window.YahmaDashboard.render(content, {fleet, setCurrentTab: tab => { currentTab = tab; }}); }
function renderFleet(content){ return window.YahmaFleet.render(content, fleet); }
