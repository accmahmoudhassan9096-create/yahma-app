/* ===== الفترات والمؤشرات والإيميل المجدول والـPDF الرسمي ===== */
/* استُخرج من app-core.js (السطور 759-949) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

/* ================= v9: فلتر الفترة العالمي ================= */
const REPORT_FILTERS_KEY = window.YahmaReports.filtersKey;
const REPORT_PRESETS_KEY = window.YahmaReports.presetsKey;
const PERIOD_PRESETS = window.YahmaReports.periodPresets;
function reportStorageRead(key, fallback){ return window.YahmaReports.storageRead(key, fallback); }
function persistReportState(){ return window.YahmaReports.persistState(); }
function getReportPresets(){ return window.YahmaReports.getPresets(); }
function _legacyIsoLocal(d){ const x=new Date(d); if(isNaN(x)) return ''; return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function _legacyPeriodBounds(){
  const p = window.periodRange || {preset:'thisMonth'};
  const now = new Date();
  if(p.preset==='custom'){
    let from = p.from || '', to = p.to || '';
    if(from && to && from > to){ const t=from; from=to; to=t; }
    return {from: from || '1900-01-01', to: to || isoLocal(now)};
  }
  const y=now.getFullYear(), m=now.getMonth();
  const ws=new Date(now); ws.setDate(ws.getDate()-((ws.getDay()+1)%7)); // الأسبوع يبدأ السبت
  switch(p.preset){
    case 'today':    return {from: isoLocal(now), to: isoLocal(now)};
    case 'thisWeek': return {from: isoLocal(ws), to: isoLocal(now)};
    case 'thisMonth':return {from: isoLocal(new Date(y,m,1)), to: isoLocal(new Date(y,m+1,0))};
    case 'lastMonth':return {from: isoLocal(new Date(y,m-1,1)), to: isoLocal(new Date(y,m,0))};
    case 'last30':   { const s=new Date(now); s.setDate(s.getDate()-29); return {from:isoLocal(s), to:isoLocal(now)}; }
    case 'last90':   { const s=new Date(now); s.setDate(s.getDate()-89); return {from:isoLocal(s), to:isoLocal(now)}; }
    case 'ytd':      return {from: isoLocal(new Date(y,0,1)), to: isoLocal(new Date(y,11,31))};
    default:         return {from:'1900-01-01', to: isoLocal(new Date(y,11,31))}; // all
  }
}
function _legacyPeriodLabel(){
  if((window.periodRange||{}).preset==='all') return 'كل الفترات';
  const b = periodBounds();
  return 'من '+(b.from||'—')+' إلى '+(b.to||'—');
}
// أي تاريخ يمثل السجل؟ (يراعي أسماء الحقول الفعلية الموجودة في البيانات)
function _legacyPeriodDateOf(rec){
  const iso = v => { if(!v) return ''; const s=String(v); return s.length>=10 ? s.slice(0,10) : ''; };
  return iso(rec.updatedAt) || iso(rec.lastMaintenance) || iso(rec.createdAt) || iso(rec.prepCompletedAt) || iso(rec.nextService) || '';
}
function _legacyInPeriod(rec){
  const b = periodBounds();
  const d = periodDateOf(rec);
  if(!d) return true; // سجلات بلا تاريخ تُحتسب ضمن أي فترة (سلوك متوافق مع النسخ السابقة)
  return d >= b.from && d <= b.to;
}
/* ===== v9: المؤشرات المحاسبية — تُحتسب من حقول الإيراد الاختيارية فقط، بلا أرقام مفبركة ===== */
function _legacyAccountingIndicators(list){
  const b = periodBounds();
  let days = Math.round((new Date(b.to) - new Date(b.from))/86400000) + 1;
  if(!(days>0)) days = 30;
  let active=0, dailySum=0, dailyN=0, estSum=0, estN=0, maintCost=0;
  (list||[]).forEach(c=>{
    const st=String(c.carStatus||'').trim();
    if(!st.includes('خارج') && !st.includes('مسروق') && !st.includes('محول') && !st.includes('مفقود') && !st.includes('مؤرشفة') && !st.includes('مباعة')) active++;
    const dr=parseFloat(c.dailyRate), rd=parseFloat(c.rentedDaysMonth);
    if(!isNaN(dr)&&dr>0){ dailySum+=dr; dailyN++; }
    if(!isNaN(dr)&&dr>0&&!isNaN(rd)&&rd>=0){ estSum+=dr*rd; estN++; }
    const mc=parseFloat(c.maintenanceCost); if(!isNaN(mc)) maintCost+=mc;
  });
  const avgDaily = dailyN? dailySum/dailyN : 0;
  const monthPotential = dailyN? avgDaily*active*30 : 0; // تقدير: متوسط السعر اليومي × السيارات النشطة × 30 يوم
  const estMonthRev = estSum;                            // تقدير من أيام التأجير المسجلة فعليًا
  return {
    days, active,
    avgDaily: Math.round(avgDaily),
    monthPotential: Math.round(monthPotential),
    estMonthRev: Math.round(estMonthRev),
    revPerCar: active? Math.round((estMonthRev||monthPotential)/active) : 0,
    maintCost: Math.round(maintCost),
    netEst: Math.round((estMonthRev||monthPotential) - maintCost),
    hasData: dailyN>0
  };
}
function _legacyFmtSAR(n){ return ((n||0).toLocaleString('en-US'))+' ر.س'; }
function isoLocal(date){ return window.YahmaReports.isoLocal(date); }
function periodBounds(){ return window.YahmaReports.periodBounds(); }
function periodLabel(){ return window.YahmaReports.periodLabel(); }
function periodDateOf(record){ return window.YahmaReports.periodDate(record); }
function inPeriod(record){ return window.YahmaReports.inPeriod(record); }
function accountingIndicators(list){ return window.YahmaReports.accountingIndicators(list); }
function fmtSAR(number){ return window.YahmaReports.formatCurrency(number); }

/* ================= v10: الإرسال المجدول ================= */
const emailScheduleService = window.YahmaEmailSchedule;
const SND_RKEY = emailScheduleService.recipientsKey;
const SND_LKEY = emailScheduleService.sendLogKey;
const SND_SKEY = emailScheduleService.scheduleKey;
function loadRecipients(){ return emailScheduleService.loadRecipients(); }
function saveRecipients(entries){ return emailScheduleService.saveRecipients(entries); }
function loadSendLog(){ return emailScheduleService.loadSendLog(); }
function saveSendLog(entries){ return emailScheduleService.saveSendLog(entries); }
function sndSchedule(){ return emailScheduleService.loadSchedule(); }
function saveSched(schedule){ return emailScheduleService.saveSchedule(schedule); }
function markSent(name, kind, channel){ return emailScheduleService.markSent(name, kind, channel); }
function sndDueKinds(){
  return [];
}
function sndInitTimer(){
  if(window.sndTimer) clearInterval(window.sndTimer);
  window.sndTimer=null;
}

/* ================= v11: التقرير الرسمي PDF + مشاركة واتساب ================= */
function frEnsureRoot(){
  let root=document.getElementById('fr-root');
  if(root) return root;
  root=document.createElement('div');
  root.id='fr-root';
  root.className='overlay fr-overlay';
  root.style.display='none';
  root.innerHTML='<div class="modal fr-modal"><div class="fr-actions"><h2>التقرير الرسمي — معاينة قبل التصدير</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary btn-small" id="fr-pdf">⬇ تحميل PDF</button><button type="button" class="btn btn-primary btn-small" id="fr-wa">📲 واتساب مع الملف</button><button type="button" class="btn btn-ghost btn-small" id="fr-print">🖨 طباعة</button><button type="button" class="btn btn-ghost btn-small" id="fr-close">إغلاق</button></div></div><div class="fr-scroll"><div class="fr-sheet" id="fr-sheet"></div></div></div>';
  document.body.appendChild(root);
  root.addEventListener('click',e=>{ if(e.target===root) frClose(); });
  document.getElementById('fr-close').onclick=frClose;
  document.getElementById('fr-pdf').onclick=frDownload;
  document.getElementById('fr-print').onclick=()=>{ document.body.classList.add('fr-printing'); window.print(); setTimeout(()=>document.body.classList.remove('fr-printing'),500); };
  document.getElementById('fr-wa').onclick=frWhatsApp;
  return root;
}
function frClose(){ const r=document.getElementById('fr-root'); if(r) r.style.display='none'; document.body.classList.remove('fr-printing'); }
function frFileName(){ return window.YahmaReports.reportFileName(); }
function frTextSummary(){ return window.YahmaReports.reportTextSummary(); }
function frSheetHTML(){ return window.YahmaReports.formalReportHtml(); }
function frMakePdf(){ return window.YahmaExport.createFormalReportPdf('fr-sheet', frFileName()); }
async function frDownload(){
  try{
    const {pdf,name}=await frMakePdf();
    pdf.save(name);
    try{ log('تصدير رسمي','تحميل التقرير الرسمي PDF — '+name); }catch(e){yahmaErr(e,'report-glue.js:133');}
  }catch(e){ alert(e&&e.message?e.message:'تعذر إنشاء PDF'); }
}
async function frWhatsApp(){
  try{
    const {pdf,name}=await frMakePdf();
    const blob=pdf.output('blob');
    const file=new File([blob],name,{type:'application/pdf'});
    const text=frTextSummary();
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'تقرير يهماء الرسمي', text:text});
      try{ markSent('تقرير رسمي','report','wa'); }catch(e){yahmaErr(e,'report-glue.js:144');}
    } else {
      pdf.save(name);
      window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
      alert('متصفحك لا يسمح بإرفاق الملف مباشرة في واتساب.\nتم تحميل ملف التقرير ('+name+') — أرفقه يدويًا في المحادثة، والملخص الرسمي جاهز في واتساب.');
      try{ markSent('تقرير رسمي','report','wa'); }catch(e){yahmaErr(e,'report-glue.js:149');}
    }
  }catch(e){ if(e&&e.name!=='AbortError') alert(e&&e.message?e.message:'تعذر تجهيز المشاركة'); }
}

/* ================= v12: إنفوجرافيك المؤشرات ================= */
function infEnsureRoot(){
  let root=document.getElementById('inf-root');
  if(root) return root;
  root=document.createElement('div');
  root.id='inf-root';
  root.className='overlay inf-overlay';
  root.style.display='none';
  root.innerHTML='<div class="modal inf-modal"><div class="inf-actions"><h2>📊 إنفوجرافيك مؤشرات الفترة</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary btn-small" id="inf-png">⬇ تحميل PNG</button><button type="button" class="btn btn-ghost btn-small" id="inf-print">🖨 طباعة</button><button type="button" class="btn btn-ghost btn-small" id="inf-share">📤 مشاركة نص</button><button type="button" class="btn btn-ghost btn-small" id="inf-close">إغلاق</button></div></div><div class="inf-scroll"><div class="inf-sheet" id="inf-sheet"></div></div></div>';
  document.body.appendChild(root);
  root.addEventListener('click',e=>{ if(e.target===root) infClose(); });
  document.getElementById('inf-close').onclick=infClose;
  document.getElementById('inf-png').onclick=infDownloadPng;
  document.getElementById('inf-print').onclick=()=>{ document.body.classList.add('inf-printing'); window.print(); setTimeout(()=>document.body.classList.remove('inf-printing'),500); };
  document.getElementById('inf-share').onclick=infShareText;
  return root;
}
function infClose(){ const r=document.getElementById('inf-root'); if(r) r.style.display='none'; document.body.classList.remove('inf-printing'); }
function infFileName(){ return window.YahmaReports.infographicFileName(); }
function infTextSummary(){ return window.YahmaReports.infographicTextSummary(); }
function infSheetHTML(){ return window.YahmaReports.infographicHtml(); }
function infMakePngBlob(){
  const sheet=document.getElementById('inf-sheet');
  return window.YahmaExport.capturePngBlob('inf-sheet',{windowWidth:880,windowHeight:sheet?.scrollHeight||1200});
}
async function infDownloadPng(){
  try{
    const blob=await infMakePngBlob();
    if(!blob) throw new Error('تعذر توليد PNG');
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=infFileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    try{ log('تصدير رسمي','تحميل الإنفوجرافيك PNG — '+a.download); }catch(e){yahmaErr(e,'report-glue.js:186');}
    try{ markSent('إنفوجرافيك','report','dl'); }catch(e){yahmaErr(e,'report-glue.js:187');}
  }catch(e){ alert(e&&e.message?e.message:'تعذر إنشاء PNG'); }
}
function infShareText(){
  const txt=infTextSummary();
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');
  try{ markSent('إنفوجرافيك','report','wa'); }catch(e){yahmaErr(e,'report-glue.js:193');}
}

