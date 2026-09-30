/* ===== الإشعارات ===== */
/* استُخرجت من app-core.js (السطور 2501-2574) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== inline ===== */

(function(){
 const READ_KEY='fleet-notifications-read-v1';
 let activeFilter='all';
 function notificationItems(){
  const out=[]; const push=(car,type,date,status)=>out.push({id:`${car.id}-${type}-${date||''}`,car,type,date,status});
  (fleet||[]).forEach(c=>{
   const card=dateStatus(c.cardExpiry), lic=dateStatus(c.licenseExpiry);
   if(card.level!=='green')push(c,'انتهاء الكارت',c.cardExpiry,card);
   if(lic.level!=='green')push(c,'انتهاء الرخصة',c.licenseExpiry,lic);
   const ins=textTag(c.insuranceStatus); if(ins.level!=='green')push(c,'حالة التأمين','',ins);
   const insp=textTag(c.inspectionStatus); if(insp.level!=='green')push(c,'حالة الفحص','',insp);
   if(c.nextService){const svc=dateStatus(c.nextService);if(svc.level!=='green')push(c,'موعد الصيانة',c.nextService,svc)}
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
 function draw(){
  const list=document.getElementById('notify-list'),badge=document.getElementById('notify-badge');if(!list||!badge)return;
  const all=notificationItems(),read=readSet(),unread=all.filter(n=>!read.has(n.id));
  badge.textContent=unread.length>99?'99+':unread.length;badge.classList.toggle('zero',unread.length===0);
  const shown=(activeFilter==='unread'?unread:all).slice(0,30);
  const summary=document.getElementById('notify-summary');if(summary)summary.textContent=unread.length?` · ${unread.length} جديدة`:' · لا توجد جديدة';
  const count=document.getElementById('notify-count-label');if(count)count.textContent=shown.length?`عرض ${shown.length} من ${activeFilter==='unread'?unread.length:all.length}`:'لا توجد إشعارات';
  // كل القيم المحقونة هنا بيانات مستخدم (لوحة/حالة/ملاحظات) — لازم escapeHtml
  // عشان أي حقل فيه <script> أو " في حالة الإشعارات ما ينفّذش داخل لوحة المدير (XSS).
  const _E = (v)=>typeof escapeHtml==='function'?escapeHtml(v):String(v==null?'':v);
  list.innerHTML=shown.length?shown.map(n=>{const isRead=read.has(n.id);return `<button class="notify-item ${isRead?'is-read':''}" data-id="${_E(n.id)}" data-car="${_E(n.car.id)}" aria-label="${_E(n.car.plate)} — ${_E(fmtNotice(n))}"><span class="notify-dot ${_E(n.status.level)}"></span><span class="notify-item-body"><b>${_E(n.car.plate)}</b><span>${_E(fmtNotice(n))}</span><small>${_E(n.status.label)}</small></span><span class="notify-item-state">${isRead?'✓':'جديد'}</span></button>`}).join(''):'<div class="notify-empty">لا توجد إشعارات في هذا التصنيف</div>';
  list.querySelectorAll('.notify-item').forEach(x=>x.onclick=()=>{const r=readSet();r.add(x.dataset.id);saveRead(r);close();openModal(x.dataset.car);draw()});
 }
 const oldRender=window.render || (typeof render==='function' ? render : null);
 if(oldRender && !window._notifyRenderHooked){
   window._notifyRenderHooked=true;
   window.render=function(){oldRender.apply(this,arguments);setTimeout(function(){try{mount();draw()}catch(e){}},0)};
 }
 // تحديث خفيف كل 20 ثانية فقط — وعدم إعادة الرسم لو القائمة مقفولة
 setInterval(function(){
   try{
     mount();
     var panel=document.getElementById('notify-panel');
     var badge=document.getElementById('notify-badge');
     if(panel && panel.classList.contains('open')) draw();
     else if(badge){
       // حدّث الرقم فقط بدون إعادة بناء القائمة
       var all=[];
       try{ all = notificationItems(); }catch(e){}
       var read=readSet();
       var unread=all.filter(function(n){return !read.has(n.id)}).length;
       badge.textContent=unread>99?'99+':String(unread);
       badge.classList.toggle('zero', unread===0);
     }
   }catch(e){}
 }, 20000);
})();


