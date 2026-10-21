/*
 * modules/reports.js — واجهة التقارير: الرسم والفلاتر
 *
 * الجزء ده فيه رسم الصفحة وربط الفلاتر. الحساب كله في
 * reports-core.js والقوالب في reports-templates.js.
 */
(function (global) {
  'use strict';

  /* الأجزاء اللي اتقسمت: بنجيبها بأسمائها عشان من غير ما نعدّل
     سطر واحد في الكود اللي تحت. الترتيب: core -> templates -> هنا. */
  const Core = global.YahmaReportsCore;
  const Tpl = global.YahmaReportsTemplates;
  const View = global.YahmaReportsView;
  const Sched = global.YahmaReportsSchedule;
  if (!Core || !Tpl || !View || !Sched) {
    console.error("reports.js: reports-core / reports-templates / reports-view / reports-schedule لازم يتحمّلوا قبله");
    return;
  }
  const {
    FILTERS_KEY, PRESETS_KEY, PERIOD_PRESETS,
    storageRead, persistState, getPresets, isoLocal,
    periodBounds, periodLabel, periodDate, inPeriod,
    accountingIndicators, aggregateReport
  } = Core;
  const {
    formatCurrency, escapeHtml,
    reportFileName, reportTextSummary, formalReportHtml,
    infographicFileName, infographicTextSummary, infographicDonut,
    infographicDonutLegend, infographicHtml
  } = Tpl;

function defaultReportFleet(){
  try{ return (typeof fleet!=='undefined' && Array.isArray(fleet)) ? fleet : []; }catch(_){ return []; }
}

function renderReports(content, context){
  // الاستدعاءات الداخلية (الفلاتر/التحديث/المحفوظ) لا تمرر سياقًا — وفّر الافتراضيات من النطاق العام
  const c = context || {};
  const fleet = Array.isArray(c.fleet) ? c.fleet : defaultReportFleet();
  const REPORT_PRESETS_KEY = c.presetsKey || PRESETS_KEY;
  const SND_SKEY = c.scheduleKey || ((window.YahmaEmailSchedule && window.YahmaEmailSchedule.scheduleKey) || 'fleet-schedule-v1');
  const today = new Date();
  today.setHours(0,0,0,0);
  const expFields = ['cardExpiry','licenseExpiry','insuranceExpiry','inspectionExpiry','nextService'];
  const daysFrom = value => {
    if(!value) return null;
    const date=new Date(value);
    if(isNaN(date)) return null;
    date.setHours(0,0,0,0);
    return Math.round((date-today)/86400000);
  };
  document.getElementById('topbar-title').textContent = 'التقارير';
  document.getElementById('topbar-sub').textContent = 'داشبورد تحليلي تفاعلي — ' + periodLabel();

  const rf = window.reportFilters || (window.reportFilters = {branch:'all', owner:'all', status:'all', issue:'all', range:'30'});
  const all = Array.isArray(fleet) ? fleet : [];
  const uniq = field => [...new Set(all.map(c => String(c[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));

  const issueMatch = (c, issue) => {
    if(!issue || issue==='all') return true;
    try{
      if(issue==='card') return (typeof fleetForTab==='function') ? fleetForTab('inspections', [c]).length > 0 : ((typeof dateStatus==='function' ? dateStatus(c.cardExpiry).level==='red' : false) || ['ملغى','موقوف'].includes(String(c.cardStatus||'').trim()));
      if(issue==='license') return (typeof fleetForTab==='function') ? fleetForTab('license-renewals', [c]).length > 0 : (typeof dateStatus==='function' && dateStatus(c.licenseExpiry).level==='red');
      if(issue==='inspection') return (typeof fleetForTab==='function') ? fleetForTab('renewals', [c]).length > 0 : (typeof inspectionDisplayStatus==='function' && inspectionDisplayStatus(c.inspectionStatus).level==='red');
      if(issue==='insurance') return (typeof fleetForTab==='function') ? fleetForTab('insurance-renewals', [c]).length > 0 : (typeof textTag==='function' && textTag(c.insuranceStatus).level==='red');
      if(issue==='maintenance') return String(c.carStatus||'').includes('صيانة');
      if(issue==='out') return carStatusOut(String(c.carStatus||''));
      if(issue==='notready') return typeof vehicleReadiness==='function' ? !vehicleReadiness(c).ready : false;
    }catch(e){yahmaErr(e,'reports.js:391');}
    return true;
  };

  const list = all.filter(c =>
    inPeriod(c) &&
    (!rf.branch || rf.branch==='all' || String(c.branch||'')===rf.branch) &&
    (!rf.owner || rf.owner==='all' || String(c.owner||'')===rf.owner) &&
    (!rf.status || rf.status==='all' || String(c.carStatus||'')===rf.status) &&
    (!rf.model || rf.model==='all' || String(c.model||'')===rf.model) &&
    issueMatch(c, rf.issue)
  );
  window._yahmaCurrentPdfData=()=>({title:'التقرير التحليلي المفلتر',subtitle:'الفترة: '+periodLabel()+' — عدد السيارات: '+list.length,headers:['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','الحالة','الجاهزية','انتهاء الرخصة','انتهاء الكارت'],rows:list.map(c=>{let ready='غير جاهزة';try{ready=vehicleReadiness(c).label}catch(e){yahmaErr(e,'reports.js:403');}return[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',ready,c.licenseExpiry||'—',c.cardExpiry||'—']})});

  const __reportAggFull = window.YahmaReports.aggregateReport(list, vehicleReadiness);
  window.__reportAggFull = __reportAggFull;
  const {total, ready, notReady, maint, out, prepOpen, prepOverdue, expBuckets, readyPct, fails, branches, owners, acc} = __reportAggFull;
  const pct = (n,d=total) => d ? Math.round(n/d*1000)/10 : 0;
  const activeCars=list.filter(c=>!String(c.carStatus||'').includes('صيانة')&&!String(c.carStatus||'').includes('خارج')&&!['مباعة','مؤرشفة'].includes(String(c.carStatus||'')));
  /* ⭐ من سجل الاستئجارات، للفلتر ده تحديدًا (مش لكل الأسطول).
     وتحتسب بـperCar الخريطة — فلو عدّينا على `list` مرة تانية
     من غير فلتر، الأرقام مش هتطابق عدد السيارات المعروض. */
  const rpb=periodBounds();
  /* ⭐ المقام أيام الفترة الحقيقية (مهم للقسمة على 30 ثابتة). */
  const periodDays=Math.max(1,Math.round((new Date(rpb.to)-new Date(rpb.from))/86400000)+1);
  const serviceDue=list.filter(c=>{const d=daysFrom(c.nextService);return d!==null&&d<=30;}).length;
  const workshopMap={};
  list.filter(c=>String(c.carStatus||'').includes('صيانة')).forEach(c=>{const w=String(c.workshop||'غير محددة').trim()||'غير محددة';workshopMap[w]=(workshopMap[w]||0)+1;});
  const topWorkshops=Object.entries(workshopMap).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // الإيراد حسب الفرع من سعر اليوم المسجل
  const branchRevenueMap={};
  list.forEach(c=>{
    const b=String(c.branch||'غير محدد').trim()||'غير محدد';
    const m=branchRevenueMap[b]||(branchRevenueMap[b]={cars:0,daySum:0,dayN:0,rev:0});
    m.cars++;
    const dr=parseFloat(c.dailyRate);
    /* ⭐ الإيراد التقديري للفرع = (سعر اليوم × أيام التأجير المسجلة
       في السيارة). مفيش سجل استئجارات — الرقم تقديري. */
    const rd=parseFloat(c.rentedDaysMonth);
    if(!isNaN(dr)&&dr>0){
      m.daySum+=dr; m.dayN++;
      if(!isNaN(rd)&&rd>=0) m.rev+=dr*rd;
    }
  });
  const branchRevenue=Object.entries(branchRevenueMap).map(([name,m])=>({name,cars:m.cars,avg:m.dayN?Math.round(m.daySum/m.dayN):0,rev:Math.round(m.rev)})).sort((a,b)=>b.rev-a.rev);
  const carsNoPrice=list.filter(c=>{ const dr=parseFloat(c.dailyRate); return isNaN(dr)||dr<=0; });

  // ---- تقرير المستندات التفصيلي: حسب النوع والنطاق ----
  const DOC_TYPES=[
    {key:'cardExpiry',label:'البطاقة'},
    {key:'licenseExpiry',label:'الرخصة'},
    {key:'insuranceExpiry',label:'التأمين'},
    {key:'inspectionExpiry',label:'الفحص'}
  ];
  const DOC_BUCKETS=[
    {key:'over',label:'منتهي',cls:'bad'},
    {key:'d7',label:'خلال 7 أيام',cls:'warn'},
    {key:'d30',label:'خلال 30 يوم',cls:'info'},
    {key:'d90',label:'خلال 90 يوم',cls:''}
  ];
  function docBucketOf(days){
    if(days===null||days===undefined||isNaN(days)) return null;
    if(days<0) return 'over';
    if(days<=7) return 'd7';
    if(days<=30) return 'd30';
    if(days<=90) return 'd90';
    return null;
  }
  const docDetail=DOC_TYPES.map(dt=>{
    const buckets={over:[],d7:[],d30:[],d90:[]};
    list.forEach(c=>{ const b=docBucketOf(daysFrom(c[dt.key])); if(b) buckets[b].push(c); });
    return {key:dt.key,label:dt.label,buckets};
  });
  const docBranchMap={};
  list.forEach(c=>{
    const br=String(c.branch||'غير محدد').trim()||'غير محدد';
    DOC_TYPES.forEach(dt=>{ if(docBucketOf(daysFrom(c[dt.key]))==='over') docBranchMap[br]=(docBranchMap[br]||0)+1; });
  });
  const topDocBranches=Object.entries(docBranchMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxFail = Math.max(1, ...fails.map(x=>x[1]), 1);
  const maxBranch = Math.max(1, ...branches.map(x=>x.t), 1);

    const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // ---- Weekly trend (from prep task dates) ----
  const weekStats = [];
  for(let w=7; w>=0; w--){
    const end = new Date(today); end.setDate(end.getDate() - w*7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    let done=0, late=0, expSoon=0;
    list.forEach(c=>{
      (c.prepTasks||[]).forEach(task=>{
        const completed = task.completedAt || task.doneDate || (task.status==='done' ? task.dueDate : null);
        if(completed){
          const d = new Date(completed);
          if(!isNaN(d) && d>=start && d<=end) done++;
        }
        if(task.status!=='done' && task.dueDate){
          const d = new Date(task.dueDate);
          if(!isNaN(d) && d>=start && d<=end && d < today) late++;
        }
      });
      ['cardExpiry','licenseExpiry','insuranceExpiry','inspectionExpiry'].forEach(f=>{
        if(!c[f]) return;
        const d = new Date(c[f]);
        if(!isNaN(d) && d>=start && d<=end) expSoon++;
      });
    });
    const label = start.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', {month:'numeric', day:'numeric'});
    weekStats.push({label, done, late, expSoon});
  }
  const maxWeek = Math.max(1, ...weekStats.map(w => w.done + w.late + w.expSoon));
  const weekBars = weekStats.map(w => {
    const h = Math.max(4, Math.round(((w.done+w.late+w.expSoon)/maxWeek)*110));
    const dH = Math.round((w.done/maxWeek)*110);
    const lH = Math.round((w.late/maxWeek)*110);
    const eH = Math.round((w.expSoon/maxWeek)*110);
    return `<div class="rd-week-col" title="${esc(w.label)}: مكتمل ${w.done} · متأخر ${w.late} · مستندات ${w.expSoon}">
      <div class="rd-week-stack" style="height:${h}px">
        <i class="d" style="height:${dH}px"></i>
        <i class="l" style="height:${lH}px"></i>
        <i class="e" style="height:${eH}px"></i>
      </div>
      <span>${esc(w.label)}</span>
    </div>`;
  }).join('');

  window.__lastReportAgg = Object.assign({total, ready, notReady, maint, out, prepOpen, prepOverdue, expBuckets, readyPct, fails, branches, owners, acc, rf}, (window.__reportAggFull || {}));
  const topBranches = branches.slice(0, 5);
  const maxPct = Math.max(1, ...topBranches.map(b => b.pct));
  const branchCompare = topBranches.length ? topBranches.map(b => `
    <div class="rd-cmp-row">
      <div class="rd-cmp-label">${esc(b.name)}</div>
      <div class="rd-cmp-bars">
        <div class="rd-cmp-bar ready" style="width:${b.pct}%" title="جاهز ${b.pct}%"><span>${b.pct}%</span></div>
        <div class="rd-cmp-bar gap" style="width:${100-b.pct}%"></div>
      </div>
      <div class="rd-cmp-meta">${b.r}/${b.t} · متأخر ${b.ov}</div>
    </div>`).join('') : '<div class="rd-empty">لا فروع</div>';


  const branchOpts = uniq('branch').map(b=>`<option value="${esc(b)}" ${rf.branch===b?'selected':''}>${esc(b)}</option>`).join('');
  const ownerOpts = uniq('owner').map(b=>`<option value="${esc(b)}" ${rf.owner===b?'selected':''}>${esc(b)}</option>`).join('');
  const statusOpts = uniq('carStatus').map(b=>`<option value="${esc(b)}" ${rf.status===b?'selected':''}>${esc(b)}</option>`).join('');
  const modelOpts = uniq('model').map(b=>`<option value="${esc(b)}" ${rf.model===b?'selected':''}>${esc(b)}</option>`).join('');
  const reportPresets=getReportPresets();

  // SVG donut
  const r0=42, c0=2*Math.PI*r0;
  const readyLen = total ? (ready/total)*c0 : 0;
  const notLen = total ? (notReady/total)*c0 : 0;
  const donut = `<svg class="rd-donut-svg" viewBox="0 0 120 120" width="140" height="140">
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#E8EEF5" stroke-width="14"/>
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#12AAA6" stroke-width="14"
      stroke-dasharray="${readyLen} ${c0-readyLen}" stroke-dashoffset="${c0*0.25}" stroke-linecap="round"
      class="rd-arc" style="--len:${readyLen}"/>
    <circle cx="60" cy="60" r="${r0}" fill="none" stroke="#CE4B3D" stroke-width="14"
      stroke-dasharray="${notLen} ${c0-notLen}" stroke-dashoffset="${c0*0.25 - readyLen}" stroke-linecap="round"
      class="rd-arc" style="--len:${notLen}"/>
    <text x="60" y="56" text-anchor="middle" font-size="18" font-weight="800" fill="#0A5F5D">${readyPct}%</text>
    <text x="60" y="74" text-anchor="middle" font-size="10" fill="#666E8C">جاهز</text>
  </svg>`;

  /* عناصر تقرير الملاك — متصرّفة هنا عشان تستخدمها دالة العرض ودالة الصفوف مع بعض */
  const ownersBars = document.getElementById('rd-owners-bars');
  const ownersAll = window.__lastReportAgg?.owners || [];
  const ownersMore = document.getElementById('rd-owners-more');

  /* ===== واجهة اللوحة — اتنقلت لملفاتها =====
     الترتيب مهم: القالب الأول عشان الـDOM يكون موجود، بعدين
     الفلاتر، بعدين الجدولة والتصدير، وأخيرًا ربط البطاقات والصفوف. */
  content.innerHTML = View.reportsTemplate({
    DOC_BUCKETS, PERIOD_PRESETS, acc, activeCars, branchCompare, branchOpts, branchRevenue,
    branches, carsNoPrice, content, docDetail, donut, esc, expBuckets, fails, maint, maxFail,
    modelOpts, notReady, out, ownerOpts, owners, pct, periodBounds, periodDays,
    periodLabel, prepOpen, prepOverdue, ready, readyPct, reportPresets, rf,
    serviceDue, statusOpts, topDocBranches, topWorkshops, total, weekBars 
  });
  View.bindReportControls({
    PERIOD_PRESETS, REPORT_PRESETS_KEY, content, esc, list, periodBounds, renderReports, rf 
  });
  Sched.bindScheduleUI({
    SND_SKEY, accountingIndicators, branches, esc, expBuckets, list, maint, notReady, out,
    periodLabel, prepOpen, prepOverdue, ready, readyPct, rf, total 
  });
  Sched.bindExcelExport({
    DOC_TYPES, branchRevenue, branches, daysFrom, list, periodBounds, rf
  });
  Sched.bindPdfButtons({
  });
  View.bindReportRows({
    DOC_BUCKETS, DOC_TYPES, carsNoPrice, content, daysFrom, docBucketOf, docDetail, esc,
    expFields, list, ownersAll, ownersBars, ownersMore, today 
  });
  View.bindOwnerRows({
    fleet, ownersBars 
  });
}




  const ReportsModule = {
    filtersKey: FILTERS_KEY,
    presetsKey: PRESETS_KEY,
    periodPresets: PERIOD_PRESETS,
    render: renderReports,
    storageRead,
    persistState,
    getPresets,
    isoLocal,
    periodBounds,
    periodLabel,
    periodDate,
    inPeriod,
    accountingIndicators,
    aggregateReport,
    formatCurrency,
    reportFileName,
    reportTextSummary,
    formalReportHtml,
    infographicFileName,
    infographicTextSummary,
    infographicDonut,
    infographicDonutLegend,
    infographicHtml,
    go() {
      try {
        global.currentTab = 'reports';
        document.querySelector('.nav-item[data-tab="reports"]')?.click();
        if (typeof global.render === 'function') global.render();
      } catch(e){yahmaErr(e,'reports.js:1604');}
    },
    async exportExcel() {
      if (global.YahmaExport && global.YahmaExport.excel) {
        await global.YahmaExport.excel();
      }
    },
    async preparePdf() {
      if (global.YahmaExport && global.YahmaExport.pdfPrepare) {
        await global.YahmaExport.pdfPrepare();
      }
    },
  };

  global.YahmaReports = ReportsModule;
})(typeof window !== 'undefined' ? window : this);
