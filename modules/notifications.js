/* ===== الإشعارات ===== */
/* استُخرجت من app-core.js (السطور 2501-2574) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== inline ===== */

(function(){
 const READ_KEY='fleet-notifications-read-v1';
 const TOAST_KEY='fleet-notifications-toast-v1';
 let activeFilter='all';
 let shownToastIds=new Set();
 try{shownToastIds=new Set(JSON.parse(localStorage.getItem(TOAST_KEY)||'[]'))}catch(e){shownToastIds=new Set()}
 const _E = (v)=>typeof escapeHtml==='function'?escapeHtml(v):String(v==null?'':v);
 function notificationItems(){
  const out=[]; const push=(car,type,date,status)=>out.push({id:`${car.id}-${type}-${date||''}`,car,type,date,status});
  (fleet||[]).forEach(c=>{
   const card=dateStatus(c.cardExpiry), lic=dateStatus(c.licenseExpiry);
   if(card.level!=='green')push(c,'انتهاء الكارت',c.cardExpiry,card);
   if(lic.level!=='green')push(c,'انتهاء الرخصة',c.licenseExpiry,lic);
   const ins=textTag(c.insuranceStatus); if(ins.level!=='green')push(c,'حالة التأمين','',ins);
   const insp=textTag(c.inspectionStatus); if(insp.level!=='green')push(c,'حالة الفحص','',insp);
   if(c.nextService){const svc=dateStatus(c.nextService);if(svc.level!=='green')push(c,'موعد الصيانة',c.nextService,svc)}
   // سيارات راكدة (لم تتحرك منذ أكثر من 60 يوماً)
   if(c.daysSinceMovement && c.daysSinceMovement > 60){push(c,'سيارة راكدة',`منذ ${c.daysSinceMovement} يوم`,{level:'warn',label:`راكدة منذ ${c.daysSinceMovement} يوم`})}
   // تنازلات معلقة
   if(c.transferStatus && c.transferStatus==='قيد التنازل'){push(c,'تنازل معلق','',{level:'info',label:'قيد التنازل'})}
  });
  return out.sort((a,b)=>(a.status.days??9999)-(b.status.days??9999));
 }
 function readSet(){try{return new Set(JSON.parse(localStorage.getItem(READ_KEY)||'[]'))}catch(e){return new Set()}}
 function saveRead(set){localStorage.setItem(READ_KEY,JSON.stringify([...set].slice(-500)))}
 function fmtNotice(n){let detail=n.date?fmtDate(n.date):n.status.label;return `${n.type} — ${detail}`}
 function mount(){
  const actions=document.querySelector('.topbar-actions');if(!actions||document.getElementById('notify-wrap'))return;
  const wrap=document.createElement('div');wrap.className='notify-wrap';wrap.id='notify-wrap';
  wrap.innerHTML='<button class="btn btn-ghost notify-btn" id="notify-btn" title="الإشعارات" aria-label="الإشعارات" aria-expanded="false">🔔<span class="notify-badge" id="notify-badge">0</span></button><div class="notify-panel" id="notify-panel" role="dialog" aria-label="الإشعارات"><div class="notify-head"><div><b>الإشعارات والتنبيهات</b><span class="notify-summary" id="notify-summary"></span></div><button class="notify-close-icon" id="notify-close" aria-label="إغلاق">×</button></div><div class="notify-toolbar"><button class="notify-filter active" data-filter="all">الكل</button><button class="notify-filter" data-filter="unread">غير مقروءة</button><button class="notify-read" id="notify-read">تعليم الكل كمقروء</button></div><div class="notify-list" id="notify-list"></div><div class="notify-foot"><span id="notify-count-label"></span><button id="notify-clear-read">إخفاء المقروءة</button></div></div>';
  actions.prepend(wrap);
  document.getElementById('notify-btn').onclick=()=>{const panel=document.getElementById('notify-panel');const opening=!panel.classList.contains('open');panel.classList.toggle('open',opening);document.getElementById('notify-btn').setAttribute('aria-expanded',String(opening));if(opening)draw()};
  document.getElementById('notify-close').onclick=()=>close();
  document.getElementById('notify-read').onclick=()=>{const r=readSet();notificationItems().forEach(n=>r.add(n.id));saveRead(r);draw()};
  document.getElementById('notify-clear-read').onclick=()=>{activeFilter='unread';document.querySelectorAll('.notify-filter').forEach(b=>b.classList.toggle('active',b.dataset.filter==='unread'));draw()};
  wrap.querySelectorAll('.notify-filter').forEach(btn=>btn.onclick=()=>{activeFilter=btn.dataset.filter;wrap.querySelectorAll('.notify-filter').forEach(b=>b.classList.toggle('active',b===btn));draw()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
  draw();
 }
 function close(){const panel=document.getElementById('notify-panel');if(panel)panel.classList.remove('open');document.getElementById('notify-btn')?.setAttribute('aria-expanded','false')}
 function showToast(n){
  const id=n.id;
  if(shownToastIds.has(id)) return;
  const t=document.createElement('div');t.className='notify-toast';t.id='notify-toast-'+_E(id);
  t.innerHTML='<div class="toast-icon">🔔</div><div class="toast-body"><div class="toast-title">إشعار جديد</div><div class="toast-msg">'+_E(n.car.plate)+' — '+_E(fmtNotice(n))+'</div></div><button class="toast-close" id="toast-close-'+_E(id)+'">×</button>';
  document.body.appendChild(t);
  setTimeout(()=>t.classList.add('show'),50);
  t.querySelector('.toast-close').onclick=()=>{t.remove();shownToastIds.add(id);saveToastIds()};
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),350);shownToastIds.add(id);saveToastIds()},5000)
 }
 function saveToastIds(){localStorage.setItem(TOAST_KEY,JSON.stringify([...shownToastIds].slice(-200)))}
 function draw(){
  const list=document.getElementById('notify-list'),badge=document.getElementById('notify-badge');if(!list||!badge)return;
  const all=notificationItems(),read=readSet(),unread=all.filter(n=>!read.has(n.id));
  badge.textContent=unread.length>99?'99+':unread.length;badge.classList.toggle('zero',unread.length===0);
  const shown=(activeFilter==='unread'?unread:all).slice(0,30);
  const summary=document.getElementById('notify-summary');if(summary)summary.textContent=unread.length?` · ${unread.length} جديدة`:' · لا توجد جديدة';
  const count=document.getElementById('notify-count-label');if(count)count.textContent=shown.length?`عرض ${shown.length} من ${activeFilter==='unread'?unread.length:all.length}`:'لا توجد إشعارات';
  const _E = (v)=>typeof escapeHtml==='function'?escapeHtml(v):String(v==null?'':v);
  list.innerHTML=shown.length?shown.map(n=>{const isRead=read.has(n.id);const isNew=isRead?false:!shownToastIds.has(n.id);return `<button class="notify-item ${isRead?'is-read':''}${isNew?' new-item':''}" data-id="${_E(n.id)}" data-car="${_E(n.car.id)}" aria-label="${_E(n.car.plate)} — ${_E(fmtNotice(n))}"><span class="notify-dot ${_E(n.status.level)}"></span><span class="notify-item-body"><b>${_E(n.car.plate)}</b><span>${_E(fmtNotice(n))}</span><small>${_E(n.status.label)}</small></span><span class="notify-item-state">${isRead?'✓':'جديد'}</span></button>`}).join(''):'<div class="notify-empty">لا توجد إشعارات في هذا التصنيف</div>';
  shown.filter(n=>!read.has(n.id) && !shownToastIds.has(n.id)).forEach(n=>{setTimeout(()=>showToast(n),100);});
  list.querySelectorAll('.notify-item').forEach(x=>{x.onclick=()=>{const r=readSet();r.add(x.dataset.id);saveRead(r);close();openModal(x.dataset.car);draw();};});
 }
 const oldRender=window.render || (typeof render==='function' ? render : null);
 if(oldRender && !window._notifyRenderHooked){
  window._notifyRenderHooked=true;
  window.render=function(){oldRender.apply(this,arguments);setTimeout(function(){try{mount();draw()}catch(e){yahmaErr(e,'notifications.js:56');}},0);};
 }
 setInterval(function(){
  try{
   mount();
   var panel=document.getElementById('notify-panel');
   var badge=document.getElementById('notify-badge');
   if(panel && panel.classList.contains('open')) draw();
   else if(badge){
    var all=[];try{ all = notificationItems(); }catch(e){yahmaErr(e,'notifications.js:68');}
    var read=readSet();var unread=all.filter(function(n){return !read.has(n.id)}).length;
    badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('zero', unread===0);
   }
  }catch(e){yahmaErr(e,'notifications.js:74');}
 }, 20000);
})();

