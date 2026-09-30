/* ===== أحداث ومهام التجهيز الحيّة ===== */
/* استُخرجت من app-core.js (السطور 2575-2761) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== inline ===== */

(function(){
  function esc(v){return typeof escapeHtml==='function'?escapeHtml(v):String(v??'');}
  window.recordPrepEvent=function(car,type,title,details){
    window.YahmaPreparationHistory.appendEvent(car,type,title,details);
  };
  window.prepStatusLabel=function(status){return window.YahmaPreparationData.statusLabel(status);};
  window.prepDueState=function(value){const today=typeof todayStr==='function'?todayStr():undefined;return window.YahmaPreparationData.dueState(value,today);};
  window.prepTaskSaveInline=function(carId,taskId,status){
    return window.YahmaPreparationData.saveInlineStatus(carId,taskId,status,{
      fleet,
      recordEvent: window.recordPrepEvent,
      saveData,
      render
    });
  };
  window.openPrepTimeline=function(carId){
    window.YahmaPreparationHistory.renderTimeline(carId, {
      fleet,
      vehicleReadiness,
      prepStatusForCar,
      prepChecklistForCar,
      escapeHtml
    });
  };
  window.renderPreparationPhase2=function(content){
    document.getElementById('topbar-title').textContent='التجهيز والمهام';
    document.getElementById('topbar-sub').textContent='مركز تشغيل تجهيز السيارات حتى اعتمادها جاهزة للتأجير';
    const tasks=getPrepTasks(); const open=tasks.filter(t=>t.status==='open').length, progress=tasks.filter(t=>t.status==='progress').length, done=tasks.filter(t=>t.status==='done').length;
    const today=typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10);
    const dueToday=tasks.filter(t=>t.status!=='done'&&t.dueDate===today).length, overdue=tasks.filter(t=>t.status!=='done'&&t.dueDate&&t.dueDate<today).length;
    const review=fleet.filter(c=>vehicleReadiness(c).ready&&!prepChecklistForCar(c).final);
    const notReady=fleet.filter(c=>!vehicleReadiness(c).ready);
    content.innerHTML=`<div class="prep-page-head"><div><h2 style="margin:0;font-size:18px">غرفة تجهيز الأسطول</h2><div class="muted-small">من اكتشاف المشكلة إلى تنفيذ المهمة ثم المراجعة النهائية.</div></div><div class="prep-action"><button class="btn btn-excel-export" id="prep-export-xlsx">📊 Excel</button><button class="btn btn-ghost" id="prep-export-pdf">📄 PDF</button><button class="btn btn-ghost" id="prep-export-tasks">تصدير</button><button class="btn btn-primary" id="prep-refresh">↻ تحديث</button></div></div>
    <div class="prep-summary"><div class="box"><span class="num">${open}</span><span class="lbl">مفتوحة</span></div><div class="box"><span class="num">${progress}</span><span class="lbl">قيد التنفيذ</span></div><div class="box"><span class="num">${done}</span><span class="lbl">مكتملة</span></div><div class="box"><span class="num">${dueToday}</span><span class="lbl">استحقاق اليوم</span></div><div class="box"><span class="num prep-overdue">${overdue}</span><span class="lbl">متأخرة</span></div></div>
    <div class="prep-dashboard-grid"><div class="prep-focus"><h3>🚨 يحتاج تدخل الآن</h3><div class="prep-focus-list">${notReady.slice(0,8).map(c=>{const r=vehicleReadiness(c);return `<div class="prep-focus-item"><div><b>${esc(c.plate||'—')}</b><div class="meta">${esc(c.branch||'—')} · ${(r.failed||[]).map(x=>esc(x.label)).join('، ')}</div></div><button class="btn btn-ghost btn-small" data-open-car="${esc(c.id)}">فتح</button></div>`}).join('')||'<div class="empty">لا توجد سيارات غير جاهزة.</div>'}</div></div><div class="prep-focus"><h3>🔎 جاهزة وتنتظر المراجعة</h3><div class="prep-focus-list">${review.slice(0,8).map(c=>`<div class="prep-focus-item"><div><b>${esc(c.plate||'—')}</b><div class="meta">${esc(c.branch||'—')} · كل شروط الجاهزية مستوفاة</div></div><button class="btn btn-ghost btn-small" data-open-car="${esc(c.id)}">مراجعة</button></div>`).join('')||'<div class="empty">لا توجد سيارات تنتظر المراجعة.</div>'}</div></div></div>
    <div class="panel"><div class="prep-filter"><input id="prep-search" placeholder="بحث باللوحة أو الفرع أو المهمة أو المسؤول"><select id="prep-status"><option value="">كل الحالات</option><option value="open">مفتوحة</option><option value="progress">قيد التنفيذ</option><option value="done">مكتملة</option></select><select id="prep-type"><option value="">كل الأسباب</option>${[...new Set(tasks.map(t=>t.type).filter(Boolean))].map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select><select id="prep-due"><option value="">كل الاستحقاقات</option><option value="today">اليوم</option><option value="overdue">متأخرة</option><option value="future">قادمة</option></select></div><div style="overflow:auto"><table class="task-table"><thead><tr><th>السيارة</th><th>الفرع</th><th>المهمة</th><th>المسؤول</th><th>الاستحقاق</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody id="prep-task-body"></tbody></table></div></div>`;
    const draw=()=>{const q=(document.getElementById('prep-search').value||'').trim().toLowerCase(),st=document.getElementById('prep-status').value,type=document.getElementById('prep-type').value,due=document.getElementById('prep-due').value;const list=tasks.filter(t=>{const ds=prepDueState(t.dueDate);return(!q||[t.plate,t.branch,t.title,t.assignee].join(' ').toLowerCase().includes(q))&&(!st||t.status===st)&&(!type||t.type===type)&&(!due||(due==='today'&&ds==='today')||(due==='overdue'&&ds==='overdue')||(due==='future'&&t.dueDate&&t.dueDate>today));});document.getElementById('prep-task-body').innerHTML=list.length?list.map(t=>{const cls=t.status==='done'?'task-done':t.status==='progress'?'task-progress':'task-open';const ds=prepDueState(t.dueDate);return `<tr><td class="plate">${esc(t.plate)}</td><td>${esc(t.branch)}</td><td>${esc(t.title)}</td><td>${esc(t.assignee||'—')}</td><td class="${ds==='overdue'?'prep-overdue':ds==='today'?'prep-ok':''}">${esc(t.dueDate||'—')}</td><td><span class="task-status ${cls}">${prepStatusLabel(t.status)}</span></td><td><div class="prep-task-actions"><select data-task-status="${esc(t.carId)}" data-task-id="${esc(t.id||t.sourceId)}"><option value="open" ${t.status==='open'?'selected':''}>مفتوحة</option><option value="progress" ${t.status==='progress'?'selected':''}>قيد التنفيذ</option><option value="done" ${t.status==='done'?'selected':''}>مكتملة</option></select><button class="btn btn-ghost btn-small" data-open-car="${esc(t.carId)}">السيارة</button><button class="btn btn-ghost btn-small" data-timeline="${esc(t.carId)}">Timeline</button></div></td></tr>`}).join(''):'<tr><td colspan="7"><div class="empty">لا توجد مهام حسب الفلاتر الحالية</div></td></tr>';document.querySelectorAll('[data-open-car]').forEach(b=>b.onclick=()=>openModal(b.dataset.openCar));document.querySelectorAll('[data-timeline]').forEach(b=>b.onclick=()=>openPrepTimeline(b.dataset.timeline));document.querySelectorAll('[data-task-status]').forEach(x=>x.onchange=()=>prepTaskSaveInline(x.dataset.taskStatus,x.dataset.taskId,x.value));};
    ['prep-search','prep-status','prep-type','prep-due'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(id==='prep-search'){ let t=null; el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(draw,180);}); }
    else el.addEventListener('change',draw);
  });
    document.getElementById('prep-refresh')?.addEventListener('click',render);
    document.getElementById('prep-export-tasks')?.addEventListener('click', async ()=>{
      const q=(document.getElementById('prep-search')?.value||'').trim().toLowerCase();
      const st=document.getElementById('prep-status')?.value||'';
      const type=document.getElementById('prep-type')?.value||'';
      const due=document.getElementById('prep-due')?.value||'';
      const list=tasks.filter(t=>{
        const ds=(typeof prepDueState==='function')?prepDueState(t.dueDate):'';
        return(!q||[t.plate,t.branch,t.title,t.assignee].join(' ').toLowerCase().includes(q))
          &&(!st||t.status===st)&&(!type||t.type===type)
          &&(!due||(due==='today'&&ds==='today')||(due==='overdue'&&ds==='overdue')||(due==='future'&&t.dueDate&&t.dueDate>(typeof todayStr==='function'?todayStr():'')));
      });
      if(!list.length){alert('لا توجد مهام مطابقة للفلاتر.');return;}
      const headers=['رقم اللوحة','الفرع','المهمة','المسؤول','الاستحقاق','الحالة'];
      const rows=list.map(t=>[t.plate||'',t.branch||'',t.title||'',t.assignee||'',t.dueDate||'',(typeof prepStatusLabel==='function'?prepStatusLabel(t.status):(t.status||''))]);
      // show chooser
      const go=confirm('موافق = Excel\nإلغاء = PDF / طباعة');
      if(go && (await ensureXlsxReady())){
        const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
        const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'مهام');
        XLSX.writeFile(wb,'مهام-تجهيز-مفلترة-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
      } else if(typeof openPrintWindow==='function'){
        openPrintWindow('مهام تجهيز الأسطول (مفلترة)','عدد المهام: '+list.length,headers,rows);
      }
    });
    // also wire excel/pdf buttons if present
    const _exportPrepFiltered=async (fmt)=>{
      const q=(document.getElementById('prep-search')?.value||'').trim().toLowerCase();
      const st=document.getElementById('prep-status')?.value||'';
      const type=document.getElementById('prep-type')?.value||'';
      const due=document.getElementById('prep-due')?.value||'';
      const list=tasks.filter(t=>{
        const ds=(typeof prepDueState==='function')?prepDueState(t.dueDate):'';
        return(!q||[t.plate,t.branch,t.title,t.assignee].join(' ').toLowerCase().includes(q))
          &&(!st||t.status===st)&&(!type||t.type===type)
          &&(!due||(due==='today'&&ds==='today')||(due==='overdue'&&ds==='overdue')||(due==='future'&&t.dueDate&&t.dueDate>(typeof todayStr==='function'?todayStr():'')));
      });
      if(!list.length){alert('لا توجد مهام مطابقة للفلاتر.');return;}
      const headers=['رقم اللوحة','الفرع','المهمة','المسؤول','الاستحقاق','الحالة'];
      const rows=list.map(t=>[t.plate||'',t.branch||'',t.title||'',t.assignee||'',t.dueDate||'',(typeof prepStatusLabel==='function'?prepStatusLabel(t.status):(t.status||''))]);
      if(fmt==='pdf'){ if(typeof openPrintWindow==='function') openPrintWindow('مهام التجهيز المفلترة','عدد: '+list.length,headers,rows); return; }
      if(!(await ensureXlsxReady())){alert('مكتبة Excel غير متاحة');return;}
      const ws=XLSX.utils.aoa_to_sheet([headers,...rows]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'مهام');
      XLSX.writeFile(wb,'مهام-تجهيز-مفلترة-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
    };
    document.getElementById('prep-export-xlsx')?.addEventListener('click',()=>_exportPrepFiltered('xlsx'));
    document.getElementById('prep-export-pdf')?.addEventListener('click',()=>_exportPrepFiltered('pdf'));
    window._yahmaModuleExport=function(fmt){_exportPrepFiltered(fmt==='pdf'?'pdf':'xlsx');};
    draw();
  };
  /* Replace the existing Phase-2 renderer while preserving the original data model. */
  if(typeof renderPreparation==='function') renderPreparation=renderPreparationPhase2;
})();


/* ===== inline ===== */

(function(){
  const E=v=>typeof escapeHtml==='function'?escapeHtml(v):String(v??'');
  const now=()=>new Date().toISOString();
  function ensure(car){car.prepTasks=Array.isArray(car.prepTasks)?car.prepTasks:[];car.prepEvents=Array.isArray(car.prepEvents)?car.prepEvents:[];car.prepChecklist=car.prepChecklist||{};return car}
  function taskLabel(s){return s==='done'?'مكتملة':s==='progress'?'قيد التنفيذ':'مفتوحة'}
  /** تنسيق تاريخ + وقت — كانت مستدعاة في سطر الاعتماد بدون أي تعريف في الكود كله،
   * فيرمي ReferenceError أثناء بناء الـ innerHTML وبتمنع فتح مودال "دورة تجهيز السيارة"
   * لكل سيارة اعتمدها المدير بالفعل (أي بالضبط السيارات اللي يدور عليها). */
  function prepDateTime(v){
    const d=v?new Date(v):null;
    if(!d||isNaN(d)) return v?String(v):'—';
    const p=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
  }
  function close(id){document.getElementById(id)?.remove()}
  function openLife(car){
    ensure(car);
    const r=vehicleReadiness(car), p=prepChecklistForCar(car);
    const tasks=car.prepTasks;
    const allDone=tasks.every(t=>t.status==='done');
    const canApprove=r.ready && allDone;
    const reviewAt=car.prepChecklist.finalReviewAt||'';
    const box=document.createElement('div'); box.className='modal-overlay'; box.style.display='flex'; box.id='prep-life-overlay';
    box.innerHTML=`<div class="modal" style="max-width:980px;width:min(980px,96vw);max-height:92vh;overflow:auto">
      <div class="modal-head"><div><h3 style="margin:0">دورة تجهيز السيارة</h3><div class="muted-small">${E(car.plate||'—')} — ${E(car.brand||'')} ${E(car.model||'')} ${car.year?E(car.year):''}</div></div><span class="readiness-pill ${E(prepStatusForCar(car).level)}">${E(prepStatusForCar(car).label)}</span></div>
      <div class="prep-life-grid">
        <div class="prep-life-card"><h4>① فحص الجاهزية</h4><div id="life-checks">${r.checks.map(x=>`<div class="prep-check-row"><div class="prep-check-main"><span class="prep-check-icon ${x.ok?'ok':'no'}">${x.ok?'✓':'!'}</span><b>${E(x.label)}</b></div><span class="muted-small">${x.ok?'مستوفى':'يحتاج إجراء'}</span></div>`).join('')}</div>
          <div class="prep-approval ${canApprove?'ok':''}"><h5>${canApprove?'✓ السيارة مستوفية شروط الاعتماد':'⏳ السيارة غير مستوفية لشروط الاعتماد'}</h5><p>${canApprove?'يمكن تنفيذ المراجعة النهائية واعتماد السيارة.':'لا يمكن اعتماد السيارة حتى تكتمل شروط الجاهزية وتغلق المهام المفتوحة.'}</p></div>
        </div>
        <div class="prep-life-card"><h4>② مهام التجهيز</h4><div id="life-tasks">${tasks.length?tasks.map(t=>`<div class="prep-task-line" data-task-row="${E(t.id||t.sourceId||'')}"><input data-task-title value="${E(t.title||'مهمة تجهيز')}" placeholder="وصف المهمة"><input data-task-assignee value="${E(t.assignee||'')}" placeholder="المسؤول"><input data-task-due type="date" value="${E(t.dueDate||'')}"><div class="task-save"><select data-task-state><option value="open" ${t.status==='open'?'selected':''}>مفتوحة</option><option value="progress" ${t.status==='progress'?'selected':''}>قيد التنفيذ</option><option value="done" ${t.status==='done'?'selected':''}>مكتملة</option></select><button class="btn btn-ghost btn-small" data-save-task="${E(t.id||t.sourceId||'')}">حفظ</button></div></div>`).join(''):'<div class="prep-empty">لا توجد مهام إضافية حاليًا.</div>'}</div>
          <div class="prep-life-actions"><button class="btn btn-ghost" id="life-add-task">＋ إضافة مهمة</button><button class="btn btn-ghost" id="life-timeline">🕐 عرض Timeline</button></div>
        </div>
      </div>
      <div class="prep-life-card" style="margin-top:14px"><h4>③ المراجعة النهائية والاعتماد</h4><textarea id="life-final-note" rows="3" placeholder="ملاحظات المراجعة النهائية..." style="width:100%;box-sizing:border-box">${E(car.prepChecklist.finalNote||'')}</textarea>
        <div class="prep-life-actions"><button class="btn btn-primary" id="life-approve" ${canApprove?'':'disabled'}>✓ اعتماد السيارة جاهزة للتأجير</button>${p.final?`<span class="muted-small" style="align-self:center">تم الاعتماد: ${E(reviewAt?prepDateTime(reviewAt):'—')}</span>`:''}<button class="btn btn-ghost" id="life-close">إغلاق</button></div>
      </div>
    </div>`;
    document.body.appendChild(box);
    box.querySelector('#life-close').onclick=()=>box.remove(); box.onclick=e=>{if(e.target===box)box.remove()};
    box.querySelector('#life-timeline').onclick=()=>openPrepTimeline(car.id);
    box.querySelector('#life-add-task').onclick=()=>{ensure(car);const id='task-'+Date.now();car.prepTasks.push({id,title:'مهمة تجهيز جديدة',status:'open',assignee:'',dueDate:'',notes:'',auto:false,createdAt:now()});recordPrepEvent(car,'task','إضافة مهمة تجهيز','مهمة جديدة');saveData([car.id]).then(()=>{close('prep-life-overlay');openLife(car)});};
    box.querySelectorAll('[data-save-task]').forEach(btn=>btn.onclick=async()=>{const row=btn.closest('[data-task-row]'),id=btn.dataset.saveTask,t=car.prepTasks.find(x=>x.id===id||x.sourceId===id);if(!t)return;t.title=row.querySelector('[data-task-title]').value.trim()||'مهمة تجهيز';t.assignee=row.querySelector('[data-task-assignee]').value.trim();t.dueDate=row.querySelector('[data-task-due]').value;t.status=row.querySelector('[data-task-state]').value;t.updatedAt=now();if(t.status==='done'&&!t.completedAt)t.completedAt=now();recordPrepEvent(car,'task','تحديث مهمة تجهيز',`${t.title} — ${taskLabel(t.status)}`);await saveData([car.id]);close('prep-life-overlay');openLife(car);render();});
    box.querySelector('#life-approve').onclick=async()=>{
      const result=await window.YahmaPreparationData.approveCar(car,box.querySelector('#life-final-note').value,{
        vehicleReadiness,
        recordEvent:window.recordPrepEvent,
        saveData,
        supabaseReady:window.supabaseReady,
        notifyYahmaEvent:window.notifyYahmaEvent
      });
      if(!result.ok){
        alert(result.reason==='save'?'تعذر حفظ الاعتماد على Supabase، ولم يُرسل الإشعار.':'لا يمكن الاعتماد قبل استيفاء شروط الجاهزية وإغلاق جميع المهام.');
        return;
      }
      close('prep-life-overlay');
      render();
      const notice=result.notice;
      alert(notice.ok?`تم الاعتماد وإرسال ${notice.sent} إشعار للمديرين${notice.failed?`، وتعذر ${notice.failed}`:''}.`:notice.skipped?'تم اعتماد السيارة: جاهزة للتأجير':`تم الاعتماد، لكن تعذر إرسال إشعار البريد: ${notice.error}`);
    };
  }
  window.openPrepLifecycle=openLife;
  window.renderPreparationPhase2=function(content){
    document.getElementById('topbar-title').textContent='التجهيز والمهام';
    document.getElementById('topbar-sub').textContent='دورة تشغيل كاملة من اكتشاف المشكلة حتى اعتماد السيارة جاهزة للتأجير';
    const tasks=getPrepTasks(); const open=tasks.filter(t=>t.status==='open').length, progress=tasks.filter(t=>t.status==='progress').length, done=tasks.filter(t=>t.status==='done').length;
    const ready=fleet.filter(c=>vehicleReadiness(c).ready).length;
    const review=fleet.filter(c=>vehicleReadiness(c).ready&&!prepChecklistForCar(c).final).length;
    const approved=fleet.filter(c=>vehicleReadiness(c).ready&&prepChecklistForCar(c).final).length;
    const overdue=tasks.filter(t=>t.status!=='done'&&prepDueState(t.dueDate)==='overdue').length;
    const focus=fleet.filter(c=>{const r=vehicleReadiness(c),p=prepChecklistForCar(c);return !r.ready||!p.final}).slice(0,10);
    content.innerHTML=`<div class="prep-page-head"><div><h2 style="margin:0;font-size:18px">غرفة تحكم تجهيز الأسطول</h2><div class="muted-small">السيارة لا تصبح جاهزة إلا بعد استيفاء الشروط، إغلاق المهام، ثم المراجعة النهائية.</div></div><button class="btn btn-primary" id="prep-refresh">↻ تحديث</button></div>
    <div class="prep-kpis"><div class="prep-kpi"><b>${ready}</b><span>مستوفية الشروط</span></div><div class="prep-kpi"><b>${review}</b><span>تنتظر المراجعة النهائية</span></div><div class="prep-kpi"><b>${approved}</b><span>معتمدة جاهزة للتأجير</span></div><div class="prep-kpi"><b>${open}</b><span>مهام مفتوحة</span></div><div class="prep-kpi"><b>${progress}</b><span>قيد التنفيذ</span></div><div class="prep-kpi"><b>${overdue}</b><span>مهام متأخرة</span></div></div>
    <div class="prep-dashboard-grid"><div class="prep-focus"><h3>🚨 السيارات التي تحتاج تدخل</h3><div class="prep-focus-list">${focus.length?focus.map(c=>{const r=vehicleReadiness(c),p=prepChecklistForCar(c),pending=(c.prepTasks||[]).filter(t=>t.status!=='done').length;return `<div class="prep-focus-item"><div><b>${E(c.plate||'—')}</b><div class="meta">${E(c.branch||'—')} · ${E(prepStatusForCar(c).label)} · ${pending} مهمة مفتوحة</div><div class="prep-progress"><span style="width:${Math.round(r.checks.filter(x=>x.ok).length/(r.checks.length||1)*100)}%"></span></div></div><div class="prep-action"><button class="btn btn-ghost btn-small" data-life="${E(c.id)}">فتح دورة التجهيز</button></div></div>`}).join(''):'<div class="empty">لا توجد سيارات تحتاج تدخل حاليًا</div>'}</div></div>
      <div class="prep-focus"><h3>📌 مسار التجهيز</h3><div class="prep-timeline"><div class="prep-event"><b>1. اكتشاف الاحتياج</b><small>تظهر أسباب عدم الجاهزية تلقائيًا.</small></div><div class="prep-event"><b>2. تنفيذ المهام</b><small>تعيين المسؤول وتاريخ الاستحقاق ومتابعة الحالة.</small></div><div class="prep-event"><b>3. استيفاء الشروط</b><small>الكارت والرخصة والتأمين والفحص والصيانة وحالة السيارة.</small></div><div class="prep-event"><b>4. المراجعة النهائية</b><small>مراجعة واعتماد قبل إعلان السيارة جاهزة للتأجير.</small></div></div></div></div>
    <div class="panel"><div class="prep-filter"><input id="prep-search" placeholder="بحث باللوحة أو الفرع أو المهمة أو المسؤول"><select id="prep-status"><option value="">كل الحالات</option><option value="open">مفتوحة</option><option value="progress">قيد التنفيذ</option><option value="done">مكتملة</option></select><select id="prep-type"><option value="">كل الأسباب</option>${[...new Set(tasks.map(t=>t.type).filter(Boolean))].map(x=>`<option value="${E(x)}">${E(x)}</option>`).join('')}</select><select id="prep-due"><option value="">كل الاستحقاقات</option><option value="today">مستحقة اليوم</option><option value="overdue">متأخرة</option><option value="future">قادمة</option></select></div><div style="overflow:auto"><table class="task-table"><thead><tr><th>السيارة</th><th>الفرع</th><th>المهمة</th><th>المسؤول</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead><tbody id="prep-task-body"></tbody></table></div></div>`;
    const draw=()=>{const q=(document.getElementById('prep-search').value||'').trim().toLowerCase(),st=document.getElementById('prep-status').value,type=document.getElementById('prep-type').value,due=document.getElementById('prep-due').value;const list=tasks.filter(t=>{const ds=prepDueState(t.dueDate);return(!q||[t.plate,t.branch,t.title,t.assignee].join(' ').toLowerCase().includes(q))&&(!st||t.status===st)&&(!type||t.type===type)&&(!due||(due==='today'&&ds==='today')||(due==='overdue'&&ds==='overdue')||(due==='future'&&t.dueDate&&t.dueDate>todayStr()));});document.getElementById('prep-task-body').innerHTML=list.length?list.map(t=>{const ds=prepDueState(t.dueDate),cls=t.status==='done'?'task-done':t.status==='progress'?'task-progress':'task-open';return `<tr><td class="plate">${E(t.plate)}</td><td>${E(t.branch)}</td><td>${E(t.title)}</td><td>${E(t.assignee||'—')}</td><td class="${ds==='overdue'?'prep-overdue':ds==='today'?'prep-ok':''}">${E(t.dueDate||'—')}</td><td><span class="task-status ${cls}">${taskLabel(t.status)}</span></td><td><div class="prep-task-actions"><button class="btn btn-ghost btn-small" data-life="${E(t.carId)}">دورة التجهيز</button><button class="btn btn-ghost btn-small" data-timeline="${E(t.carId)}">Timeline</button></div></td></tr>`}).join(''):'<tr><td colspan="7"><div class="empty">لا توجد مهام حسب الفلاتر الحالية</div></td></tr>';document.querySelectorAll('[data-life]').forEach(b=>b.onclick=()=>{const c=fleet.find(x=>x.id===b.dataset.life);if(c)openLife(c)});document.querySelectorAll('[data-timeline]').forEach(b=>b.onclick=()=>openPrepTimeline(b.dataset.timeline));};
    ['prep-search','prep-status','prep-type','prep-due'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(id==='prep-search'){ let t=null; el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(draw,180);}); }
    else el.addEventListener('change',draw);
  });document.getElementById('prep-refresh')?.addEventListener('click',render);draw();
  };
  if(typeof renderPreparation==='function') renderPreparation=renderPreparationPhase2;
})();


