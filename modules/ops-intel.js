/* ===== الفلاتر المحفوظة والعرض الافتراضي (ops-ux-intel) ===== */
/* استُخرجت من app-core.js (السطور 2804-3569) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== ops-ux-intel-js ===== */


(function(){
  'use strict';
  const LS_FILTERS = 'yahma-saved-filters-v1';
  const LS_DEFAULT_VIEW = 'yahma-default-view-v1';
  const LS_NOTIFY = 'yahma-ops-notify-v1';
  const SLA_DAYS = { // target days by task type keyword
    'default': 3,
    'صيانة': 5,
    'فحص': 2,
    'تأمين': 4,
    'رخصة': 4,
    'بطاقة': 3,
    'نظافة': 1,
    'تجهيز': 2
  };

  function fleetArr(){ return (typeof fleet !== 'undefined' && Array.isArray(fleet)) ? fleet : []; }
  function today(){ const d=new Date(); return d.toISOString().slice(0,10); }
  function daysBetween(a,b){
    try{
      const x=new Date(a), y=new Date(b);
      if(isNaN(x)||isNaN(y)) return null;
      return Math.round((y-x)/(1000*60*60*24));
    }catch(e){ return null; }
  }
  function addDays(iso, n){
    const d=new Date(iso||today()); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10);
  }
  function parseDate(v){
    if(!v) return null;
    const d=new Date(v);
    return isNaN(d) ? null : d.toISOString().slice(0,10);
  }
  function slaTargetFor(title){
    const t=String(title||'');
    for(const k of Object.keys(SLA_DAYS)){
      if(k!=='default' && t.includes(k)) return SLA_DAYS[k];
    }
    return SLA_DAYS.default;
  }
  function toastKbd(msg){
    let el=document.getElementById('kbd-toast');
    if(!el){ el=document.createElement('div'); el.id='kbd-toast'; el.className='kbd-toast'; document.body.appendChild(el); }
    el.textContent=msg; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'), 2200);
  }

  /* ---------- Ops intelligence compute ---------- */
  function collectTasks(){
    const out=[];
    fleetArr().forEach(c=>{
      (c.prepTasks||[]).forEach(t=>{
        out.push({
          ...t,
          carId:c.id,
          plate:c.plate,
          branch:c.branch||'—',
          created:t.created||t.createdAt||t.startDate||null,
          dueDate:t.dueDate||null,
          status:t.status||'open',
          title:t.title||t.type||'مهمة'
        });
      });
    });
    return out;
  }

  function expiryAlerts(withinDays){
    const list=[];
    const t=today();
    fleetArr().forEach(c=>{
      const fields=[
        {key:'cardExpiry', label:'انتهاء البطاقة'},
        {key:'licenseExpiry', label:'انتهاء الرخصة'},
        {key:'insuranceExpiry', label:'انتهاء التأمين'},
        {key:'inspectionExpiry', label:'انتهاء الفحص'},
        {key:'nextService', label:'صيانة قادمة'}
      ];
      fields.forEach(f=>{
        const exp=parseDate(c[f.key]);
        if(!exp) return;
        const left=daysBetween(t, exp);
        if(left===null) return;
        if(left <= withinDays){
          list.push({
            plate:c.plate, branch:c.branch, carId:c.id,
            label:f.label, exp, left,
            level: left < 0 ? 'danger' : left <= 7 ? 'warn' : 'info'
          });
        }
      });
    });
    list.sort((a,b)=>a.left-b.left);
    return list;
  }

  function readinessFailures(){
    const counts={};
    fleetArr().forEach(c=>{
      if(typeof vehicleReadiness!=='function') return;
      const r=vehicleReadiness(c);
      if(r && r.ready) return;
      (r.failed||[]).forEach(f=>{
        const label=(f && (f.label||f.name||f)) || 'سبب غير محدد';
        counts[label]=(counts[label]||0)+1;
      });
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }

  function branchMetrics(){
    const map={};
    fleetArr().forEach(c=>{
      const b=c.branch||'غير محدد';
      if(!map[b]) map[b]={total:0,ready:0,overdueTasks:0,prepDaysSum:0,prepCount:0};
      map[b].total++;
      let ready=false;
      if(typeof vehicleReadiness==='function'){
        const r=vehicleReadiness(c);
        ready=!!(r&&r.ready);
      } else {
        ready=String(c.carStatus||'').includes('جاهز') || c.ready===true;
      }
      if(ready) map[b].ready++;
      (c.prepTasks||[]).forEach(t=>{
        if(t.status==='done') return;
        const due=parseDate(t.dueDate);
        if(due && due < today()) map[b].overdueTasks++;
        // estimate prep duration if completed
      });
      (c.prepTasks||[]).filter(t=>t.status==='done').forEach(t=>{
        const st=parseDate(t.created||t.createdAt||t.startDate);
        const en=parseDate(t.completedAt||t.doneDate||t.dueDate);
        if(st && en){
          const d=daysBetween(st,en);
          if(d!==null && d>=0 && d<120){ map[b].prepDaysSum+=d; map[b].prepCount++; }
        }
      });
    });
    return Object.entries(map).map(([branch,m])=>({
      branch,
      total:m.total,
      ready:m.ready,
      readyPct: m.total? Math.round(m.ready/m.total*100):0,
      overdueTasks:m.overdueTasks,
      avgPrepDays: m.prepCount? (m.prepDaysSum/m.prepCount).toFixed(1) : '—'
    })).sort((a,b)=>b.total-a.total);
  }

  function taskSLA(){
    return collectTasks().filter(t=>t.status!=='done').map(t=>{
      const target=slaTargetFor(t.title);
      const start=parseDate(t.created||t.createdAt||t.startDate) || parseDate(t.dueDate);
      const due=parseDate(t.dueDate);
      const age = start ? daysBetween(start, today()) : null;
      const overdue = due ? daysBetween(today(), due) < 0 : false;
      const overBy = due && overdue ? Math.abs(daysBetween(today(), due)) : 0;
      let level='ok';
      if(overdue) level='bad';
      else if(age!==null && age >= target) level='warn';
      return {...t, target, age, overdue, overBy, level};
    }).sort((a,b)=>{
      const rank={bad:0,warn:1,ok:2};
      return rank[a.level]-rank[b.level];
    });
  }

  /* ---------- Notifications ---------- */
  function buildOpsNotifications(){
    const items=[];
    const t=today();
    // overdue tasks
    collectTasks().filter(x=>x.status!=='done' && parseDate(x.dueDate) && parseDate(x.dueDate)<t).forEach(x=>{
      items.push({
        id:'ov-'+x.carId+'-'+(x.id||x.title),
        level:'danger',
        title:'مهمة متأخرة: '+(x.title||''),
        body:(x.plate||'')+' · '+(x.branch||'')+' · استحقاق '+(x.dueDate||''),
        carId:x.carId, type:'task'
      });
    });
    // due today
    collectTasks().filter(x=>x.status!=='done' && parseDate(x.dueDate)===t).forEach(x=>{
      items.push({
        id:'td-'+x.carId+'-'+(x.id||x.title),
        level:'warn',
        title:'استحقاق اليوم: '+(x.title||''),
        body:(x.plate||'')+' · '+(x.branch||''),
        carId:x.carId, type:'task'
      });
    });
    // expiry 7 days
    expiryAlerts(7).forEach(a=>{
      items.push({
        id:'ex-'+a.carId+'-'+a.label,
        level:a.level,
        title:a.label+(a.left<0?' (منتهية)':' خلال '+a.left+' يوم'),
        body:(a.plate||'')+' · '+(a.branch||'')+' · '+a.exp,
        carId:a.carId, type:'expiry'
      });
    });
    return items.slice(0,80);
  }

  function renderNotifyPanel(){
    const items=buildOpsNotifications();
    // badge
    const badge=document.querySelector('.notify-badge, #notify-count, [data-notify-count]');
    if(badge){ badge.textContent=String(items.length); badge.style.display=items.length?'':'none'; }
    // if custom panel exists
    let panel=document.getElementById('ops-notify-panel');
    return items;
  }

  function openNotifyCenter(){
    const items=buildOpsNotifications();
    let ov=document.getElementById('ops-notify-overlay');
    if(!ov){
      ov=document.createElement('div');
      ov.id='ops-notify-overlay';
      ov.className='shortcut-help';
      document.body.appendChild(ov);
    }
    ov.classList.add('open');
    ov.innerHTML=`<div class="box" style="max-width:480px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">التنبيهات التشغيلية</h3>
        <button class="btn btn-ghost btn-small" id="ops-notify-close">إغلاق</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-small" id="ops-wa-share">مشاركة واتساب</button>
        <button class="btn btn-ghost btn-small" id="ops-mail-share">بريد</button>
      </div>
      <div class="ops-notify-list">${items.length?items.map(n=>`
        <div class="ops-notify-item" data-car="${n.carId||''}">
          <span class="n-dot ${n.level}"></span>
          <div>
            <b style="font-size:13px">${escapeOps(n.title)}</b>
            <div class="ops-notify-meta">${escapeOps(n.body)}</div>
          </div>
        </div>`).join(''):'<div class="gs-empty">لا توجد تنبيهات حالية 🎉</div>'}
      </div>
    </div>`;
    ov.onclick=e=>{ if(e.target===ov) ov.classList.remove('open'); };
    document.getElementById('ops-notify-close').onclick=()=>ov.classList.remove('open');
    ov.querySelectorAll('.ops-notify-item').forEach(el=>{
      el.onclick=()=>{
        const id=el.getAttribute('data-car');
        ov.classList.remove('open');
        if(id && typeof openVehicle360==='function') openVehicle360(id);
        else if(id && typeof openModal==='function') openModal(id);
      };
    });
    const textSummary = items.slice(0,15).map(n=>`• ${n.title} — ${n.body}`).join('\n') || 'لا تنبيهات';
    document.getElementById('ops-wa-share').onclick=()=>{
      const url='https://wa.me/?text='+encodeURIComponent('تنبيهات يهماء:\n'+textSummary);
      window.open(url,'_blank');
    };
    document.getElementById('ops-mail-share').onclick=()=>{
      const url='mailto:?subject='+encodeURIComponent('تنبيهات تشغيل يهماء')+'&body='+encodeURIComponent(textSummary);
      window.location.href=url;
    };
  }

  function escapeOps(s){
    return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  /* ---------- Unified search ---------- */
  function searchAll(q){
    q=String(q||'').trim().toLowerCase();
    if(q.length<1) return [];
    const res=[];
    fleetArr().forEach(c=>{
      const blob=[c.plate,c.branch,c.owner,c.brand,c.model,c.type,c.serial,c.cardNumber].join(' ').toLowerCase();
      if(blob.includes(q)){
        res.push({kind:'car', id:c.id, title:c.plate||'—', sub:[c.brand,c.model,c.branch,c.owner].filter(Boolean).join(' · '), icon:'🚗'});
      }
      (c.prepTasks||[]).forEach(t=>{
        const tb=[t.title,t.assignee,t.type,c.plate].join(' ').toLowerCase();
        if(tb.includes(q)){
          res.push({kind:'task', id:c.id, title:t.title||'مهمة', sub:(c.plate||'')+' · '+(t.assignee||'')+' · '+(t.status||''), icon:'☑️'});
        }
      });
    });
    // branches unique
    const branches=[...new Set(fleetArr().map(c=>c.branch).filter(Boolean))];
    branches.forEach(b=>{
      if(String(b).toLowerCase().includes(q)){
        res.push({kind:'branch', id:b, title:b, sub:'فرع', icon:'📍'});
      }
    });
    return res.slice(0,20);
  }

  function ensureGlobalSearch(){
    const topbar=document.querySelector('.topbar, .topbar-v43, .main .topbar');
    if(!topbar) return;
    if(document.getElementById('global-search-input') || document.getElementById('global-search')) return;
    const actions=topbar.querySelector('.topbar-actions')||topbar;
    const wrap=document.createElement('div');
    wrap.className='global-search-wrap';
    wrap.innerHTML=`<input id="global-search-input" type="search" placeholder="بحث موحّد: لوحة، فرع، مالك، مهمة… (/)" autocomplete="off" style="width:100%;padding:10px 14px;border:1px solid var(--line,#E1E6F1);border-radius:999px;font-family:inherit;font-size:13.5px"/>
      <div class="global-search-results" id="global-search-results"></div>`;
    // insert near start of actions
    if(actions.firstChild) actions.insertBefore(wrap, actions.firstChild);
    else actions.appendChild(wrap);

    const input=document.getElementById('global-search-input');
    const box=document.getElementById('global-search-results');
    let activeIdx=-1;
    function draw(list){
      activeIdx=-1;
      if(!list.length){
        box.innerHTML='<div class="gs-empty">لا نتائج</div><div class="gs-hint">اختصار: اضغط / للبحث · Esc للإغلاق</div>';
        box.classList.add('open');
        return;
      }
      box.innerHTML=list.map((r,i)=>`<div class="gs-item" data-idx="${i}" data-kind="${r.kind}" data-id="${escapeOps(r.id)}">
        <div class="gs-ico">${r.icon}</div>
        <div class="gs-body"><b>${escapeOps(r.title)}</b><span>${escapeOps(r.sub)}</span></div>
      </div>`).join('')+'<div class="gs-hint">Enter للفتح · ↑↓ للتنقل</div>';
      box.classList.add('open');
      box.querySelectorAll('.gs-item').forEach(el=>{
        el.onmouseenter=()=>{ box.querySelectorAll('.gs-item').forEach(x=>x.classList.remove('active')); el.classList.add('active'); activeIdx=+el.dataset.idx; };
        el.onclick=()=>activate(list[+el.dataset.idx]);
      });
    }
    function activate(r){
      if(!r) return;
      box.classList.remove('open');
      input.blur();
      if(r.kind==='car'||r.kind==='task'){
        if(typeof openVehicle360==='function') openVehicle360(r.id);
        else if(typeof openModal==='function') openModal(r.id);
        else if(typeof currentTab!=='undefined'){ try{ currentTab='fleet'; if(typeof render==='function') render(); }catch(e){yahmaErr(e,'ops-intel.js:343');} }
      } else if(r.kind==='branch'){
        try{
          if(typeof currentTab!=='undefined') currentTab='fleet';
          if(typeof render==='function') render();
          setTimeout(()=>{
            const sel=document.querySelector('#filter-branch, select[data-filter="branch"], #branch-filter');
            if(sel){ sel.value=r.id; sel.dispatchEvent(new Event('change')); }
          }, 100);
        }catch(e){yahmaErr(e,'ops-intel.js:352');}
      }
    }
    input.addEventListener('input', ()=>{
      const list=searchAll(input.value);
      if(!input.value.trim()){ box.classList.remove('open'); return; }
      draw(list);
      input._last=list;
    });
    input.addEventListener('keydown', e=>{
      const list=input._last||[];
      if(e.key==='Escape'){ box.classList.remove('open'); input.blur(); return; }
      if(e.key==='ArrowDown'){ e.preventDefault(); activeIdx=Math.min(list.length-1, activeIdx+1); }
      if(e.key==='ArrowUp'){ e.preventDefault(); activeIdx=Math.max(0, activeIdx-1); }
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        box.querySelectorAll('.gs-item').forEach((x,i)=>x.classList.toggle('active', i===activeIdx));
      }
      if(e.key==='Enter' && activeIdx>=0){ e.preventDefault(); activate(list[activeIdx]); }
      else if(e.key==='Enter' && list[0]){ e.preventDefault(); activate(list[0]); }
    });
    document.addEventListener('click', e=>{
      if(!wrap.contains(e.target)) box.classList.remove('open');
    });
  }

  /* ---------- Saved filters ---------- */
  function loadFilters(){ try{ return JSON.parse(localStorage.getItem(LS_FILTERS)||'[]'); }catch(e){ return []; } }
  function saveFilters(arr){ localStorage.setItem(LS_FILTERS, JSON.stringify(arr.slice(0,12))); }

  function currentFilterState(){
    const st={};
    ['prep-search','prep-status','prep-type','prep-due','filter-branch','filter-status','search'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) st[id]=el.value;
    });
    const q=document.querySelector('.search input, #fleet-search');
    if(q) st._q=q.value;
    return st;
  }
  function applyFilterState(st){
    if(!st) return;
    Object.keys(st).forEach(id=>{
      if(id==='_q'){
        const q=document.querySelector('.search input, #fleet-search');
        if(q){ q.value=st._q; q.dispatchEvent(new Event('input')); }
        return;
      }
      const el=document.getElementById(id);
      if(el){ el.value=st[id]; el.dispatchEvent(new Event(el.tagName==='INPUT'?'input':'change')); }
    });
  }

  function injectSavedFiltersUI(){
    const content=document.getElementById('content')||document.querySelector('.content');
    if(!content) return;
    if(document.getElementById('saved-filters-bar')) return;
    // only on fleet/preparation
    const tab=(typeof currentTab!=='undefined'?currentTab:'');
    if(tab!=='fleet' && tab!=='preparation') return;
    const bar=document.createElement('div');
    bar.id='saved-filters-bar';
    bar.className='saved-filters';
    const list=loadFilters();
    bar.innerHTML=`<span style="font-size:12px;color:var(--muted);font-weight:700">عروضي:</span>
      ${list.map((f,i)=>`<button type="button" class="sf-chip" data-sf="${i}">${escapeOps(f.name)} <span class="x" data-del="${i}">×</span></button>`).join('')}
      <button type="button" class="btn btn-ghost btn-small sf-save-btn" id="sf-save">حفظ العرض الحالي</button>
      <button type="button" class="btn btn-ghost btn-small sf-save-btn" id="sf-default">تعيين كافتراضي</button>`;
    content.insertBefore(bar, content.firstChild);
    bar.querySelectorAll('[data-sf]').forEach(btn=>{
      btn.onclick=e=>{
        if(e.target.dataset.del!=null) return;
        const f=loadFilters()[+btn.dataset.sf];
        if(f) applyFilterState(f.state);
        toastKbd('تم تطبيق العرض: '+(f&&f.name||''));
      };
    });
    bar.querySelectorAll('[data-del]').forEach(x=>{
      x.onclick=e=>{
        e.stopPropagation();
        const arr=loadFilters(); arr.splice(+x.dataset.del,1); saveFilters(arr);
        bar.remove(); injectSavedFiltersUI();
      };
    });
    document.getElementById('sf-save').onclick=()=>{
      const name=prompt('اسم العرض المحفوظ:','عرض '+(loadFilters().length+1));
      if(!name) return;
      const arr=loadFilters(); arr.push({name, state:currentFilterState()}); saveFilters(arr);
      bar.remove(); injectSavedFiltersUI();
      toastKbd('تم حفظ العرض');
    };
    document.getElementById('sf-default').onclick=()=>{
      localStorage.setItem(LS_DEFAULT_VIEW, JSON.stringify({tab: typeof currentTab!=='undefined'?currentTab:'dashboard', filters:currentFilterState()}));
      toastKbd('تم حفظ العرض الافتراضي');
    };
  }

  /* ---------- Ops intel panel on dashboard ---------- */
  function renderOpsIntelHTML(){
    const exp7=expiryAlerts(7);
    const exp30=expiryAlerts(30);
    const overdue=collectTasks().filter(t=>t.status!=='done' && parseDate(t.dueDate) && parseDate(t.dueDate)<today());
    const dueToday=collectTasks().filter(t=>t.status!=='done' && parseDate(t.dueDate)===today());
    const failures=readinessFailures();
    const branches=branchMetrics().slice(0,6);
    const sla=taskSLA().slice(0,8);
    const maxFail=Math.max(1, ...failures.map(x=>x[1]));

    return `
    <div class="ops-alerts-bar">
      <button type="button" class="ops-chip danger" data-ops="overdue"><b>${overdue.length}</b> مهام متأخرة</button>
      <button type="button" class="ops-chip warn" data-ops="today"><b>${dueToday.length}</b> استحقاق اليوم</button>
      <button type="button" class="ops-chip warn" data-ops="exp7"><b>${exp7.length}</b> تنتهي خلال 7 أيام</button>
      <button type="button" class="ops-chip info" data-ops="exp30"><b>${exp30.length}</b> خلال 30 يوم</button>
      <button type="button" class="ops-chip ok" data-ops="notify">مركز التنبيهات</button>
    </div>
    <div class="ops-intel-grid">
      <div class="ops-card">
        <h3>أسباب عدم الجاهزية <span style="font-size:11px;color:#888;font-weight:600">ترند حالي</span></h3>
        ${failures.length?failures.map(([label,c])=>`
          <div class="ops-reason-row">
            <span>${escapeOps(label)}</span>
            <b>${c}</b>
            <div class="ops-bar"><i style="width:${Math.round(c/maxFail*100)}%"></i></div>
          </div>`).join(''):'<div class="gs-empty">لا توجد أسباب مسجّلة</div>'}
      </div>
      <div class="ops-card">
        <h3>أداء الفروع</h3>
        ${branches.length?branches.map(b=>`
          <div class="ops-metric"><span>${escapeOps(b.branch)}</span><b>${b.readyPct}%</b></div>
          <div style="font-size:11px;color:#888;margin:-4px 0 6px">جاهز ${b.ready}/${b.total} · متأخر ${b.overdueTasks} · متوسط التجهيز ${b.avgPrepDays} يوم</div>
          <div class="ops-bar"><i style="width:${b.readyPct}%"></i></div>
        `).join(''):'<div class="gs-empty">لا بيانات فروع</div>'}
      </div>
      <div class="ops-card">
        <h3>SLA المهام <span style="font-size:11px;color:#888;font-weight:600">هدف زمني</span></h3>
        ${sla.length?sla.map(t=>`
          <div class="ops-metric">
            <span style="max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeOps(t.title)}">${escapeOps(t.plate)} · ${escapeOps(t.title)}</span>
            <span class="ops-sla-badge ops-sla-${t.level}">${t.overdue?('متأخر '+t.overBy+'ي'):('هدف '+t.target+'ي')}</span>
          </div>`).join(''):'<div class="gs-empty">لا مهام مفتوحة</div>'}
      </div>
    </div>`;
  }

  function injectOpsIntel(){
    const content=document.getElementById('content')||document.querySelector('.content');
    if(!content) return;
    // فقط في الرئيسية — ونضعها في أسفل/وسط الصفحة وليس في الأعلى
    if(typeof currentTab!=='undefined' && currentTab!=='dashboard'){
      const gone=document.getElementById('ops-intel-root');
      if(gone) gone.remove();
      return;
    }
    let root=document.getElementById('ops-intel-root');
    if(!root){
      root=document.createElement('div');
      root.id='ops-intel-root';
      root.className='ops-intel-bottom';
    }
    root.innerHTML=renderOpsIntelHTML();
    // ضع اللوحة بعد محتوى الداشبورد الأصلي (أسفل الصفحة)
    if(root.parentElement!==content){
      content.appendChild(root);
    } else if(content.lastElementChild!==root){
      content.appendChild(root);
    }
    root.querySelectorAll('[data-ops]').forEach(btn=>{
      btn.onclick=()=>{
        const k=btn.getAttribute('data-ops');
        if(k==='notify') openNotifyCenter();
        else if(k==='overdue'||k==='today'){
          try{
            currentTab='preparation';
            if(typeof render==='function') render();
            else if(typeof window.render==='function') window.render();
            setTimeout(()=>{
              const sel=document.getElementById('prep-due');
              if(sel){ sel.value=k==='overdue'?'overdue':'today'; sel.dispatchEvent(new Event('change')); }
            }, 80);
          }catch(e){yahmaErr(e,'ops-intel.js:531');}
        } else if(k==='exp7'||k==='exp30'){
          openExpiryBoard(k==='exp7'?7:30);
        }
      };
    });
  }

  function openExpiryBoard(days){
    const list=expiryAlerts(days);
    let ov=document.getElementById('ops-exp-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='ops-exp-overlay'; ov.className='shortcut-help'; document.body.appendChild(ov); }
    ov.classList.add('open');
    ov.innerHTML=`<div class="box" style="max-width:520px">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">تنبيهات خلال ${days} يوم</h3>
      <button class="btn btn-ghost btn-small" id="ops-exp-close">إغلاق</button></div>
      <div class="ops-notify-list" style="margin-top:10px">${list.length?list.map(a=>`
        <div class="ops-notify-item" data-car="${a.carId}">
          <span class="n-dot ${a.level}"></span>
          <div><b style="font-size:13px">${escapeOps(a.label)} — ${escapeOps(a.plate)}</b>
          <div class="ops-notify-meta">${escapeOps(a.branch)} · ${a.exp} · ${a.left<0?('متأخر '+Math.abs(a.left)+' يوم'):(a.left+' يوم متبقية')}</div></div>
        </div>`).join(''):'<div class="gs-empty">لا تنبيهات في هذه الفترة</div>'}
      </div></div>`;
    ov.onclick=e=>{ if(e.target===ov) ov.classList.remove('open'); };
    document.getElementById('ops-exp-close').onclick=()=>ov.classList.remove('open');
    ov.querySelectorAll('[data-car]').forEach(el=>{
      el.onclick=()=>{ ov.classList.remove('open'); const id=el.getAttribute('data-car'); if(id&&typeof openVehicle360==='function') openVehicle360(id); };
    });
  }

  /* ---------- Mobile prep tabs ---------- */
  function injectMobilePrep(){
    if(typeof currentTab==='undefined' || currentTab!=='preparation') return;
    const content=document.getElementById('content')||document.querySelector('.content');
    if(!content || document.getElementById('mobile-prep-tabs')) return;
    const tabs=document.createElement('div');
    tabs.id='mobile-prep-tabs';
    tabs.className='mobile-prep-tabs';
    tabs.innerHTML=`<button type="button" class="active" data-mp="focus">التدخل</button>
      <button type="button" data-mp="tasks">المهام</button>
      <button type="button" data-mp="kpis">المؤشرات</button>`;
    content.insertBefore(tabs, content.firstChild);
    tabs.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{
        tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const mode=b.dataset.mp;
        const kpis=content.querySelector('.prep-kpis');
        const grid=content.querySelector('.prep-dashboard-grid');
        const panel=content.querySelector('.panel');
        if(kpis) kpis.style.display = mode==='kpis'?'grid':'none';
        if(grid) grid.style.display = mode==='focus'?'grid':'none';
        if(panel) panel.style.display = mode==='tasks'?'block':'none';
      };
    });
    // default mobile: focus
    if(window.matchMedia('(max-width:820px)').matches){
      tabs.querySelector('[data-mp="focus"]').click();
    }
  }

  /* ---------- Keyboard shortcuts ---------- */
  function showShortcutHelp(){
    let ov=document.getElementById('shortcut-help');
    if(!ov){
      ov=document.createElement('div'); ov.id='shortcut-help'; ov.className='shortcut-help';
      ov.innerHTML=`<div class="box">
        <h3>اختصارات لوحة المفاتيح</h3>
        <div class="row"><span>بحث موحّد</span><kbd>/</kbd></div>
        <div class="row"><span>الصفحة الرئيسية</span><kbd>G</kbd> ثم <kbd>D</kbd></div>
        <div class="row"><span>الأسطول</span><kbd>G</kbd> ثم <kbd>F</kbd></div>
        <div class="row"><span>التجهيز</span><kbd>G</kbd> ثم <kbd>P</kbd></div>
        <div class="row"><span>التقارير</span><kbd>G</kbd> ثم <kbd>R</kbd></div>
        <div class="row"><span>مركز التنبيهات</span><kbd>N</kbd></div>
        <div class="row"><span>تحديث</span><kbd>Shift + R</kbd></div>
        <div class="row"><span>هذه القائمة</span><kbd>?</kbd></div>
        <div style="margin-top:12px;text-align:left"><button class="btn btn-primary btn-small" id="sh-close">حسناً</button></div>
      </div>`;
      document.body.appendChild(ov);
      ov.onclick=e=>{ if(e.target===ov) ov.classList.remove('open'); };
      ov.querySelector('#sh-close').onclick=()=>ov.classList.remove('open');
    }
    ov.classList.add('open');
  }

  let gotoWait=false;
  document.addEventListener('keydown', e=>{
    const tag=(e.target&&e.target.tagName||'').toLowerCase();
    const typing=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
    if(e.key==='Escape'){
      document.querySelectorAll('.shortcut-help.open,.global-search-results.open').forEach(x=>x.classList.remove('open'));
      return;
    }
    if(typing) return;
    if(e.key==='/' ){ e.preventDefault(); const i=document.getElementById('global-search-input')||document.getElementById('global-search'); if(i){ i.focus(); i.select(); } return; }
    if(e.key==='?' || (e.shiftKey && e.key==='/')){ e.preventDefault(); showShortcutHelp(); return; }
    if(e.key==='n' || e.key==='N'){ if(!e.ctrlKey && !e.metaKey){ e.preventDefault(); openNotifyCenter(); } return; }
    if(e.shiftKey && (e.key==='R'||e.key==='r')){
      e.preventDefault();
      if(typeof render==='function') render();
      toastKbd('تم التحديث');
      return;
    }
    if(e.key==='g'||e.key==='G'){ gotoWait=true; toastKbd('G ثم D/F/P/R…'); setTimeout(()=>gotoWait=false, 1200); return; }
    if(gotoWait){
      const map={d:'dashboard', f:'fleet', p:'preparation', r:'reports', b:'branches'};
      const k=e.key.toLowerCase();
      if(map[k]){
        e.preventDefault();
        try{
          if(typeof currentTab!=='undefined') currentTab=map[k];
          document.querySelectorAll('.nav-item').forEach(n=>{
            if(n.getAttribute('data-tab')===map[k]) n.click();
          });
          if(typeof render==='function') render();
          toastKbd('انتقال: '+map[k]);
        }catch(err){yahmaErr(err,'ops-intel.js:647');}
        gotoWait=false;
      }
    }
  });

  /* ---------- Hook into render ---------- */
  function enhanceAfterRender(){
    try{
      ensureGlobalSearch();
      injectOpsIntel();
      injectSavedFiltersUI();
      injectMobilePrep();
      renderNotifyPanel();
      // apply default view once per session
      if(!window._yahmaDefaultApplied){
        window._yahmaDefaultApplied=true;
        try{
          const def=JSON.parse(localStorage.getItem(LS_DEFAULT_VIEW)||'null');
          if(def && def.filters){
            setTimeout(()=>applyFilterState(def.filters), 200);
          }
        }catch(e){yahmaErr(e,'ops-intel.js:669');}
      }
    }catch(err){ console.warn('ops-ux', err); }
  }

  // Wrap render if available
  /* ⚠️ ملاحظة مهمة: الكود القديم كان بيعيد إسناد `render = window.render`
     وده كان بيكسر الـ closure بتاع render-router (اللي بيقرا currentTab من
     branches-store)، فالتبويب كان بيتغيّر في البيانات بدون ما الشاشة تتحدث.
     بقى بنغلّف window.render فقط، من غير المساس بالـ binding العام. */
  function hookRender(){
    const markHooked = (fn)=>{ fn._opsHooked=true; return fn; };
    if(typeof window.render==='function' && !window.render._opsHooked){
      const orig=window.render;
      window.render = markHooked(function(){
        let r;
        try{ r=orig.apply(this, arguments); }
        catch(err){ console.error('render error', err); }
        try{ setTimeout(enhanceAfterRender, 40); }catch(e){yahmaErr(e,'ops-intel.js:687');}
        return r;
      });
    }
  }

  // notify button enhancement
  function hookNotifyBtn(){
    const candidates=document.querySelectorAll('#btn-notify, [data-action="notify"], button[title*="إشعار"]:not(.notify-btn), button[aria-label*="إشعار"]:not(.notify-btn)');
    candidates.forEach(btn=>{
      if(btn._opsBound) return;
      btn._opsBound=true;
      btn.addEventListener('click', e=>{
        // still allow native, also open ops center
        setTimeout(openNotifyCenter, 10);
      });
    });
  }

  function boot(){
    hookRender();
    hookNotifyBtn();
    enhanceAfterRender();
    // periodic re-hook (in case render redefined)
    setTimeout(function(){ hookRender(); hookNotifyBtn(); }, 3000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.YahmaOpsUX = { openNotifyCenter, expiryAlerts, branchMetrics, taskSLA, searchAll, buildOpsNotifications };

  /* Emergency: never leave user on eternal loading */
  function emergencyUnstick(){
    try{
      document.documentElement.classList.remove('yahma-booting');
      document.documentElement.classList.add('yahma-ready');
      // مهم جدًا: ده "شبكة أمان" لشاشة التطبيق، مش لشاشة الدخول.
      // لو المستخدم لسه قاعد على شاشة تسجيل الدخول (مفيش جلسة ولم يفعّل الوضع
      // التجريبي) نخرج بس من حالة البوتينج ونسيب شاشة الدخول كما هي — الاختفاء
      // بعد 2.5 ثانية كان بيخلّي المستخدم يفتح المنصة ويدخل "admin تجريبي"
      // ببيانات وهمية ويعدّل عليها وهي ما بتتزامنش مع Supabase.
      const appShouldBeVisible = !!window.currentUser || window._demoMode === true;
      if(!appShouldBeVisible) return;
      const auth=document.getElementById('auth-screen');
      const app=document.getElementById('app-root');
      if(auth) auth.classList.add('hidden');
      if(app) app.classList.remove('hidden');
      const content=document.getElementById('content');
      const stuck = content && (content.textContent.indexOf('جارِ التحميل')>=0 || content.textContent.indexOf('جاري التحميل')>=0 || !content.textContent.trim());
      if(typeof fleet==='undefined' || !Array.isArray(fleet)){
        try{ window.fleet = JSON.parse(localStorage.getItem('fleet-data-v2')||'[]'); }catch(e){ window.fleet=[]; }
      }
      // access global fleet via assignment if in scope later
      if(stuck){
        if(window.currentUser){
          // مستخدم سحابي مسجّل دخول: نعرض البيانات المحفوظة فقط ولا ندخل
          // الوضع التجريبي أبدًا (كان بيوقّف مزامنة Supabase بشكل صامت).
          if(typeof render==='function') render();
          else if(typeof window.render==='function') window.render();
        }else{
          window._demoMode = true;
          if(!window.currentRole) window.currentRole='admin';
          if(typeof forceLocalBoot==='function') forceLocalBoot();
          else if(typeof render==='function') render();
          else if(typeof window.render==='function') window.render();
        }
      }
    }catch(err){ console.warn('emergencyUnstick', err); }
  }
  setTimeout(emergencyUnstick, 2500);
  setTimeout(emergencyUnstick, 5000);
})();



