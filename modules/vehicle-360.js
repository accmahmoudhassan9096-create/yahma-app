/* ===== ملف السيارة 360 ===== */
/* استُخرجت من app-core.js (السطور 2762-2803) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== inline ===== */

(function(){
  function esc(v){return typeof escapeHtml==='function'?escapeHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));}
  function safeDate(v){try{return typeof fmtDate==='function'?fmtDate(v):(v||'—')}catch(e){return v||'—'}}
  function levelTag(label,level){return '<span class="tag '+esc(level||'green')+'">'+esc(label||'—')+'</span>'}
  window.openVehicle360=function(id){
    const car=(typeof fleet!=='undefined'?fleet:[]).find(c=>String(c.id)===String(id)); if(!car)return;
    const r=typeof vehicleReadiness==='function'?vehicleReadiness(car):{ready:false,label:'غير متاح',level:'amber',failed:[]};
    const card=typeof cardState==='function'?cardState(car):{label:car.cardStatus||'—',level:'amber'};
    const lic=typeof licenseState==='function'?licenseState(car):{label:car.licenseStatus||'—',level:'amber'};
    const insp=typeof inspectionState==='function'?inspectionState(car):{label:car.inspectionStatus||'—',level:'amber'};
    const prep=typeof prepStatusForCar==='function'?prepStatusForCar(car):{label:'—',level:'amber'};
    const overlay=document.getElementById('vehicle360-overlay')||document.body.appendChild(document.createElement('div'));
    overlay.id='vehicle360-overlay'; overlay.className='vehicle360-overlay open';
    const tasks=Array.isArray(car.prepTasks)?car.prepTasks:[]; const openTasks=tasks.filter(t=>t.status!=='done').length;
    const failures=(r.failed||[]).map(x=>x.label||x).filter(Boolean);
    const audit=(typeof window.getCarAudit==='function'?window.getCarAudit(car.id):[]);
    const info=[['رقم اللوحة',car.plate],['الماركة',car.brand],['النوع',car.type],['الموديل',car.model],['اللون',car.color],['الرقم التسلسلي',car.serial],['رقم البطاقة',car.cardNumber],['المالك',car.owner],['رقم المالك',car.ownerNumber],['الفرع',car.branch],['المدينة',car.city],['حالة السيارة',car.carStatus],['العداد',car.odometer],['الصيانة القادمة',safeDate(car.nextService)],['آخر صيانة',safeDate(car.lastMaintenance||car.lastmaintenance)]];
    const infoHtml=info.map(x=>'<'+'div class="vehicle360-field"><small>'+esc(x[0])+'</small><b>'+esc(x[1]||'—')+'</b></div>').join('');
    const failuresHtml=failures.length?failures.map(f=>'<'+'div class="vehicle360-event"><span class="vehicle360-dot"></span><div><b>'+esc(f)+'</b><div>يتطلب معالجة قبل الاعتماد النهائي.</div></div></div>').join(''):'<div class="vehicle360-empty">لا توجد أسباب تمنع الجاهزية حاليًا.</div>';
    const auditHtml=audit.length?audit.slice(0,10).map(a=>'<'+'div class="vehicle360-event"><span class="vehicle360-dot"></span><div><b>'+esc(a.action||'عملية')+'</b><div>'+esc(a.detail||'')+' · '+esc(a.displayAt||a.at||'')+'</div></div></div>').join(''):'<div class="vehicle360-empty">سيظهر هنا سجل العمليات المرتبط بالسيارة عند توفره.</div>';
    overlay.innerHTML='<div class="vehicle360" role="dialog" aria-modal="true">'
      +'<div class="vehicle360-head"><div class="vehicle360-title"><div class="vehicle360-avatar">🚘</div><div><h2>'+esc(car.plate||'بدون لوحة')+'</h2><p>'+esc([car.brand,car.type,car.model].filter(Boolean).join(' · '))+'</p><div class="vehicle360-badges">'+levelTag(r.label,r.level)+levelTag(prep.label,prep.level)+'</div></div></div><button class="vehicle360-close" id="vehicle360-close">×</button></div>'
      +'<div class="vehicle360-body"><div class="vehicle360-kpis">'
      +'<div class="vehicle360-kpi"><b>'+esc(card.label)+'</b><span>حالة البطاقة · '+safeDate(car.cardExpiry)+'</span></div>'
      +'<div class="vehicle360-kpi"><b>'+esc(lic.label)+'</b><span>حالة الرخصة · '+safeDate(car.licenseExpiry)+'</span></div>'
      +'<div class="vehicle360-kpi"><b>'+esc(insp.label)+'</b><span>حالة الفحص</span></div>'
      +'<div class="vehicle360-kpi"><b>'+openTasks+'</b><span>مهام تجهيز مفتوحة</span></div></div>'
      +'<div class="vehicle360-grid"><div class="vehicle360-panel"><h3>📋 البيانات التشغيلية</h3><div class="vehicle360-info">'+infoHtml+'</div></div>'
      +'<div class="vehicle360-panel"><h3>🚦 أسباب عدم الجاهزية</h3>'+failuresHtml+'<div class="vehicle360-actions"><button class="btn btn-primary" id="vehicle360-edit">تعديل البيانات</button><button class="btn btn-ghost" id="vehicle360-prep">فتح التجهيز</button></div></div>'
      +'<div class="vehicle360-panel" style="grid-column:1/-1"><h3>🕘 آخر العمليات</h3><div class="vehicle360-timeline">'+auditHtml+'</div></div></div></div></div>';
    overlay.onclick=e=>{if(e.target===overlay)closeVehicle360()};
    document.getElementById('vehicle360-close').onclick=closeVehicle360;
    document.getElementById('vehicle360-edit').onclick=()=>{closeVehicle360();openModal(car.id)};
    document.getElementById('vehicle360-prep').onclick=()=>{closeVehicle360(); if(typeof openPrepLifecycle==='function')openPrepLifecycle(car); else if(typeof window.renderPreparationPhase2==='function'){currentTab='preparation';render();}};
  };
  window.closeVehicle360=function(){const o=document.getElementById('vehicle360-overlay');if(o)o.remove()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeVehicle360()});
})();


