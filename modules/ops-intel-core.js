/*
 * modules/ops-intel-core.js — حساب عمليات التشغيل الخالص
 *
 * دوال صافية (لا DOM ماعدا toastKbd) تُستخدم من ops-intel.js ومن
 * وحدات التطبيق الأخرى (مثل dashboard-view.js التي تستدعي toastKbd).
 * تُضبط كمتغيرات عامة (bare globals) لتستمر النداءات الداخلية باسمها،
 * وتُصدر كمساحة YahmaOpsCore للاختبارات.
 */
(function (global) {
  'use strict';

/* ===== حساب العمليات الخالص ===== */
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
  global.fleetArr = fleetArr;
  global.today = today;
  global.daysBetween = daysBetween;
  global.parseDate = parseDate;
  global.slaTargetFor = slaTargetFor;
  global.toastKbd = toastKbd;
  global.collectTasks = collectTasks;
  global.expiryAlerts = expiryAlerts;
  global.readinessFailures = readinessFailures;
  global.branchMetrics = branchMetrics;
  global.taskSLA = taskSLA;
  global.buildOpsNotifications = buildOpsNotifications;

  // تصدير كمساحة للاختبارات
  global.YahmaOpsCore = {
    fleetArr,
    today,
    daysBetween,
    addDays,
    parseDate,
    slaTargetFor,
    toastKbd,
    collectTasks,
    expiryAlerts,
    readinessFailures,
    branchMetrics,
    taskSLA,
    buildOpsNotifications
  };

})(typeof window !== 'undefined' ? window : this);
