/* ===== التخزين المحلي والفروع والبذور ===== */
/* استُخرج من app-core.js (السطور 415-604) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */


const STORAGE_KEY = 'fleet-data-v2';
const BRANCHES_KEY = 'fleet-branches-v1';
let fleet = [];
let branches = []; // {id,name,email,phone,manager,notes}
let editingId = null;
let editingBranchId = null;
let currentTab = 'dashboard';

/* ===== تنبيه مهم (كان سبب في bugs سابقتين) =====
   `let` في أعلى السكربت بيعمل binding في الـ global lexical environment،
   مش property على window. يعني `window.currentTab = 'x'` بيعمل متغير تاني
   لا يقرؤه التطبيق إطلاقًا. عشان كده كل كود خارجي يعدّل التبويب لازم
   يمرّ من الدوال دي (أو ينادي معالج التبويب الأصلي). */
window.yahmaGetTab = function () { return currentTab; };
window.yahmaSetTab = function (tab) {
  if (typeof tab === 'string' && tab) currentTab = tab;
  /* نزامن الـ window property كمان — لو أي كود قديم لسه بيقرا window.currentTab */
  try { window.currentTab = currentTab; } catch (_) {}
  return currentTab;
};
/* نفس المشكلة مع fleet/branches — نوفّر قارئات الآمنة أيضًا */
window.yahmaGetFleet = function () { return fleet; };

/* ===== نطاق الفرع للمستخدم =====
   المدير يرى كل الفروع. غير المدير المرتبط بفرع (profiles.branch_name)
   يرى سيارات فرعه فقط — والتنفيذ الحقيقي على الخادم عبر RLS
   (yahma_can_access_branch)، وهنا نطابق العرض والقفل في الواجهة. */
function userBranchScope(){
  if(window.currentRole==='admin') return null;
  const b=String(window.currentUserBranch||'').trim();
  return b||null;
}
function scopeFleetToUser(list){
  const b=userBranchScope();
  const arr=Array.isArray(list)?list:[];
  if(!b) return arr;
  return arr.filter(c=>String((c&&c.branch)||'').trim()===b);
}
/* قفل فلاتر الفروع على فرع المستخدم + شارة الفرع — تُستدعى في نهاية render() */
function applyBranchScopeUI(){
  const b=userBranchScope();
  document.querySelectorAll('#ff-branch,#rd-branch,#ren-branch,#fu-branch').forEach(sel=>{
    if(!b){ sel.disabled=false; sel.removeAttribute('data-locked'); sel.removeAttribute('title'); return; }
    let opt=Array.from(sel.options).find(o=>o.value===b);
    if(!opt){ opt=document.createElement('option'); opt.value=b; opt.textContent=b; sel.appendChild(opt); }
    sel.value=b; sel.disabled=true; sel.setAttribute('data-locked','branch');
    sel.title='مقيد على فرعك: '+b;
  });
  const sub=document.getElementById('topbar-sub');
  if(sub){
    let chip=document.getElementById('branch-scope-chip');
    if(b){
      if(!chip){ chip=document.createElement('span'); chip.id='branch-scope-chip'; chip.className='branch-scope-chip'; sub.appendChild(document.createTextNode(' ')); sub.appendChild(chip); }
      chip.textContent='فرع: '+b;
    }else if(chip){ chip.remove(); }
  }
}
const PAGE_PERMISSION_OPTIONS=[
  {id:'fleet',label:'الأسطول'},{id:'branches',label:'الفروع'},{id:'renewals',label:'الفحص'},
  {id:'payments',label:'تحت الدفع'},{id:'paid',label:'تم الدفع'},{id:'renewed',label:'تم التجديد'},{id:'license-renewals',label:'رخص منتهية'},
  {id:'insurance-renewals',label:'التأمين'},{id:'inspections',label:'بطاقات التشغيل'},
  {id:'transfers',label:'التنازلات'},{id:'reports',label:'التقارير'},{id:'audit',label:'سجل النشاط'}
];
window.currentUserPermissions=Array.isArray(window.currentUserPermissions)?window.currentUserPermissions:[];
/* ===== إصلاح: allowed_tabs فاضي/ null كان بيخفي كل التبويبات =====
   الدالة كانت بترجّع مصفوفة فاضية لو الحقل اتسجل null أو [] في profiles،
   فالمستخدم كان بيفضل محبوس في الرئيسية (dashboard) على الموبايل.
   القاعدة الجديدة: لو مفيش تحديد صريح، امنح كل الأقسام عدا السجل الإداري. */
window.ALL_YAHMA_TABS=(typeof PAGE_PERMISSION_OPTIONS!=='undefined'&&Array.isArray(PAGE_PERMISSION_OPTIONS))
  ? PAGE_PERMISSION_OPTIONS.map(function(p){return p.id;})
  : ['dashboard','fleet','branches','renewals','payments','paid','renewed','license-renewals','insurance-renewals','inspections','transfers','reports','audit'];
window.defaultYahmaTabsForRole=function(role){
  var all=window.ALL_YAHMA_TABS||[];
  if(role==='admin') return all.slice();
  /* «view» و«ops» يشوفوا كل الأقسام عدا سجل النشاط (إداري بحت) */
  return all.filter(function(id){ return id!=='audit'; });
};
window.resolveYahmaPermissions=function(allowed, role){
  if(Array.isArray(allowed) && allowed.length) return allowed.slice();
  return window.defaultYahmaTabsForRole(role);
};
window.canAccessYahmaTab=function(tab){
  if(tab==='dashboard'||window.currentRole==='admin'||window._demoMode)return true;
  if(Array.isArray(window.currentUserPermissions)&&window.currentUserPermissions.includes(tab))return true;
  /* أمان: لو اللPermissions اتقرت فاضية لسبب ما، اسمح بكل التبويبات عدا الإداري */
  if(!Array.isArray(window.currentUserPermissions)||!window.currentUserPermissions.length){
    return window.defaultYahmaTabsForRole(window.currentRole).includes(tab);
  }
  return false;
};

// شبكة أمان ضد شاشة التحميل الأبدية
function forceLocalBoot(){
  if(window.currentUser && !window._demoMode) return; // مستخدم مسجّل دخول على السحابة — لا تحوّل للوضع التجريبي أبدًا
  // ما نفعّلش البيانات المحلية إلا لو المستخدم هو نفسه فعّل الوضع التجريبي.
  // منعنا التحويل التلقائي عشان: (1) شاشة الدخول ما تختفيش بعد 3 ثواني،
  // (2) تعديلات مستخدم حقيقي ما تروحش للتخزين المحلي بس وهي "تبدو" محفوظة.
  if(!window._demoMode) return;
  const content=document.getElementById('content');
  if(!content) return;
  const stuck = content.textContent.indexOf('جارِ التحميل')>=0 || content.textContent.trim()==='';
  // ملاحظة: كان الشرط هنا بيتحقق من window.fleet بدل fleet — و"fleet" متغيرة let
  // في الـ scope العلوي مش بتتحط تلقائيًا على window، يعني window.fleet كانت دايمًا
  // undefined والشرط دايمًا بيفشل، فالدالة كانت بتنفّذ نفسها وتعمل render زيادة
  // في كل مرة (بعد 2.5 و3 و7 ثواني من فتح الصفحة) حتى لو التطبيق شغّال تمام.
  if(!stuck && typeof fleet!=='undefined' && Array.isArray(fleet) && fleet.length) return;
  console.warn('تحميل معلّق — تفعيل بيانات محلية');
  window._demoMode=true;
  if(!window.currentRole || window.currentRole==='view') window.currentRole='admin';
  try{
    let local=[];
    try{ local=JSON.parse(localStorage.getItem('fleet-data-v2')||'[]'); }catch(e){}
    if(!Array.isArray(local) || !local.length){
      if(typeof seedData==='function') local=seedData();
    }
    fleet=local;
    localStorage.setItem('fleet-data-v2', JSON.stringify(local));
    if(typeof render==='function') render();
    if(typeof applyRole==='function') applyRole();
  }catch(e){ console.error(e); }
}
setTimeout(forceLocalBoot, 3000);
setTimeout(forceLocalBoot, 7000);

function loadBranches(){
  try{
    const raw=localStorage.getItem(BRANCHES_KEY);
    if(raw){ const p=JSON.parse(raw); if(Array.isArray(p)) branches=p; }
  }catch(_){ branches=[]; }
  // املأ من أسماء الفروع الموجودة في الأسطول إن الدليل فاضي
  if(!branches.length){
    const names=[...new Set(fleet.map(c=>String(c.branch||'').trim()).filter(Boolean))];
    branches=names.map(n=>({id:'b'+Date.now()+Math.floor(Math.random()*999),name:n,email:'',phone:'',manager:'',notes:''}));
    saveBranches();
  }
  if(window.YahmaDB && window.YahmaDB.ready && window.YahmaDB.loadBranches){
    window.YahmaDB.ready.then(async()=>{
      try{
        const stored=await window.YahmaDB.loadBranches();
        if(stored.length){
          const previous=JSON.stringify(branches);
          branches=stored;
          localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
          if(previous!==JSON.stringify(branches) && typeof render==='function') render();
        }else if(branches.length){
          await window.YahmaDB.saveBranches(branches);
        }
      }catch(e){ console.warn('YahmaDB branches load', e); }
    }).catch(()=>{});
  }
}
function saveBranches(){
  try{ localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches)); }catch(_){}
  if(window.YahmaDB && window.YahmaDB.ready && window.YahmaDB.saveBranches){
    window.YahmaDB.ready.then(()=>window.YahmaDB.saveBranches(branches)).catch(()=>{});
  }
}
function getBranchByName(name){
  const n=String(name||'').trim();
  if(!n) return null;
  const norm=s=>String(s||'').trim().replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');
  return branches.find(b=>norm(b.name)===norm(n))||null;
}
function ensureBranchName(name){
  const n=String(name||'').trim();
  if(!n) return;
  if(!getBranchByName(n)){
    branches.push({id:'b'+Date.now()+Math.floor(Math.random()*999),name:n,email:'',phone:'',manager:'',notes:''});
    saveBranches();
  }
}
function branchStats(name){
  if(!Array.isArray(fleet)) return {total:0,ready:0,insp:0,card:0,lic:0,cars:[]};
  const cars=fleet.filter(c=>String(c.branch||'').trim()===String(name||'').trim());
  const ready=cars.filter(c=>{
    try{ return vehicleReadiness(c).ready; }catch(e){ return false; }
  }).length;
  const insp=cars.filter(c=>{
    try{ return inspectionDisplayStatus(c.inspectionStatus).level!=='green'; }catch(e){ return false; }
  }).length;
  const card=cars.filter(c=>{
    try{ return cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green'; }catch(e){ return false; }
  }).length;
  const lic=cars.filter(c=>{
    try{ return licenseDisplayStatus(c.licenseExpiry).level!=='green'; }catch(e){ return false; }
  }).length;
  return {total:cars.length,ready,insp,card,lic,cars};
}

/** تحمّل مكتبة XLSX عند أول استخدام فعلي بدل تحميلها مسبقًا مع الصفحة.
 * بترجع true لو المكتبة جاهزة (كانت محمّلة أو اتحمّلت دلوقتي)، وfalse لو فشل التحميل. */
async function ensureXlsxReady(){
  if(typeof XLSX!=='undefined') return true;
  try{
    if(window.YahmaExport && typeof window.YahmaExport.ensureXlsx==='function'){
      await window.YahmaExport.ensureXlsx();
    }
  }catch(e){ console.warn('تعذر تحميل مكتبة Excel', e); }
  return typeof XLSX!=='undefined';
}
function readinessStats(){ return window.YahmaReadiness.stats(fleet); }
function normalizeFleetDates(){
  let changed=false;
  fleet.forEach(c=>{
    const card=normalizeDateValue(c.cardExpiry), license=normalizeDateValue(c.licenseExpiry), service=normalizeDateValue(c.nextService);
    if(card !== (c.cardExpiry || '')){c.cardExpiry=card;changed=true;}
    if(license !== (c.licenseExpiry || '')){c.licenseExpiry=license;changed=true;}
    if(service !== (c.nextService || '')){c.nextService=service;changed=true;}
  });
  return changed;
}

const BRAND_MODELS = {
  'هيونداي': ['اكسنت','جراد أي 10','ستاريا','أي 10','ACCENT'],
  'كيا': ['سبورتاج','بيجاس'],
  'شانجان': ['ايدو بلس'],
  'شيفروليه': ['TAHOE'],
  'تويوتا': ['اوريان','يارس']
};
const BRANCHES = ['الفرع الرئيسي','فرع القاهرة الجديدة','فرع الإسكندرية','فرع الجيزة'];
function seedData(){
  const brands = Object.keys(BRAND_MODELS);
  const cardStatuses = ['نشط','نشط','نشط','نشط','ملغى'];
  const inspectionStatuses = ['تم الفحص','تم الفحص','تم الفحص','لم يفحص','لم يفحص'];
  const insuranceStatuses = ['ساري','ساري','ساري','منتهي','لا يوجد'];
  const carStatuses = ['متاحة للايجار','متاحة للايجار','متاحة للايجار','تحت الصيانة','خارج الخدمة'];
  const owners = ['أحمد سعيد','محمد عبد الله','شركة النصر للتأجير','كريم فتحي','سارة حسن'];
  const cardOffsets = [-5, 8, 20, 45, 90, 200, -15, 3, 60, 12, 150, 5, 30, 75];
  const licenseOffsets = [25, -3, 90, 10, 40, 6, 100, -8, 15, 200, 55, 20, 9, 300];
  const rows = [];
  for(let i=1;i<=14;i++){
    const brand = brands[i % brands.length];
    const models = BRAND_MODELS[brand];
    rows.push({
      id: uid(),
      plate: 'ر ن س ' + (6700 + i),
      brand,
      type: models[i % models.length],
      model: String(2022 + (i % 5)),
      year: String(2022 + (i % 5)),
      serial: String(400000000 + i*137931),
      cardNumber: '14-00' + (600000 + i*1234),
      cardStatus: cardStatuses[i % cardStatuses.length],
      cardExpiry: addDays(todayStr(), cardOffsets[i-1]),
      licenseStatus: cardStatuses[(i+1) % cardStatuses.length],
      licenseExpiry: addDays(todayStr(), licenseOffsets[i-1]),
      inspectionStatus: inspectionStatuses[i % inspectionStatuses.length],
      insuranceStatus: insuranceStatuses[i % insuranceStatuses.length],
      owner: owners[i % owners.length],
      ownerNumber: String(10000 + i),
      branch: BRANCHES[i % BRANCHES.length],
      carStatus: carStatuses[i % carStatuses.length],
      dailyRate: String(120 + (i % 6) * 35),
      rentedDaysMonth: String(12 + (i * 3) % 18),
      updatedAt: todayStr(),
      notes: ''
    });
  }
  return rows;
}

/* ===== ترحيل حالة الفحص الثنائية (مرة واحدة) =====
   يوحد كل القيم إلى «تم الفحص» أو «لم يفحص» فقط. يعمل للمدير/الديمو فقط (بيانات شاملة). */
async function migrateInspectionStatus(){
  try{
    if(localStorage.getItem('yahma-inspection-mig-v1')) return {skipped:true};
    if(typeof userBranchScope==='function' && userBranchScope()) return {skipped:true};
    if(!Array.isArray(fleet) || !fleet.length) return {skipped:true};
    const ids=[];
    fleet.forEach(c=>{
      const t=String(c.inspectionStatus||'').trim();
      const next=(t==='تم الفحص'||t==='سليم'||t==='ساري'||t==='ساري المفعول')?'تم الفحص':'لم يفحص';
      if(next!==c.inspectionStatus){ c.inspectionStatus=next; ids.push(c.id); }
    });
    localStorage.setItem('yahma-inspection-mig-v1','1');
    if(ids.length && typeof saveData==='function'){ try{ await saveData(ids); }catch(_){} }
    try{ if(ids.length && typeof window.log==='function') window.log('ترحيل بيانات','توحيد حالة الفحص (تم الفحص/لم يفحص): '+ids.length); }catch(_){}
    return {migrated:ids.length};
  }catch(e){ return {error:String(e&&e.message||e)}; }
}
/* ===== ترحيل قيم حالة السيارة (مرة واحدة) =====
   يوحد 'نشط' و'موجودة' القديمة إلى 'متاحة للايجار'. يعمل للمدير/الديمو فقط (بيانات شاملة). */
async function migrateCarStatusValues(){
  try{
    if(localStorage.getItem('yahma-status-mig-v2')) return {skipped:true};
    if(typeof userBranchScope==='function' && userBranchScope()) return {skipped:true};
    if(!Array.isArray(fleet) || !fleet.length) return {skipped:true};
    const ids=[];
    fleet.forEach(c=>{ const s=String(c.carStatus||'').trim(); if(s==='نشط'||s==='موجودة'){ c.carStatus='متاحة للايجار'; ids.push(c.id); } });
    localStorage.setItem('yahma-status-mig-v2','1');
    if(ids.length && typeof saveData==='function'){ try{ await saveData(ids); }catch(_){} }
    try{ if(ids.length && typeof window.log==='function') window.log('ترحيل بيانات','توحيد حالة السيارة (← متاحة للايجار): '+ids.length); }catch(_){}
    return {migrated:ids.length};
  }catch(e){ return {error:String(e&&e.message||e)}; }
}
/* ===== ترحيل أسماء الماركات (مرة واحدة) =====
   يوحد اختلافات الإملاء (هونداي/هيونداى ← هيونداي ...). يعمل للمدير/الديمو فقط. */
async function migrateCarBrands(){
  try{
    if(localStorage.getItem('yahma-brand-mig-v2')) return {skipped:true};
    if(typeof userBranchScope==='function' && userBranchScope()) return {skipped:true};
    if(!Array.isArray(fleet) || !fleet.length) return {skipped:true};
    if(typeof canonicalBrand!=='function') return {skipped:true};
    const ids=[];
    fleet.forEach(c=>{ const b=String(c.brand||''); if(!b.trim()) return; const cb=canonicalBrand(b); if(cb!==b){ c.brand=cb; ids.push(c.id); } });
    localStorage.setItem('yahma-brand-mig-v2','1');
    if(ids.length && typeof saveData==='function'){ try{ await saveData(ids); }catch(_){} }
    try{ if(ids.length && typeof window.log==='function') window.log('ترحيل بيانات','توحيد أسماء الماركات: '+ids.length); }catch(_){}
    return {migrated:ids.length};
  }catch(e){ return {error:String(e&&e.message||e)}; }
}
/* ===== ترحيل اصطلاح النوع/الموديل (مرة واحدة) =====
   اصطلاح المنصة: «النوع» = اسم الطراز (سونت/يارس)، «الموديل» = السنة (2026).
   يحول أي بيانات قديمة (النوع فارغ + الموديل اسم طراز + سنة الصنع سنة)
   إلى الاصطلاح الجديد ويحفظها. يعمل للمدير/الديمو فقط (بيانات شاملة). */
async function migrateTypeModelConvention(){
  try{
    if(localStorage.getItem('yahma-typemodel-mig-v1')) return {skipped:true};
    if(typeof userBranchScope==='function' && userBranchScope()) return {skipped:true};
    if(!Array.isArray(fleet) || !fleet.length) return {skipped:true};
    const yearLike=v=>/^\d{4}$/.test(String(v||'').trim());
    const ids=[];
    fleet.forEach(c=>{
      const m=String(c.model||'').trim(), t=String(c.type||'').trim(), y=String(c.year||'').trim();
      if(!m || yearLike(m)) return;
      let changed=false;
      if(c.type!==m){ c.type=m; changed=true; }
      const wy=yearLike(y)?y:'';
      if(String(c.model||'')!==wy){ c.model=wy; changed=true; }
      if(String(c.year||'')!==wy){ c.year=wy; changed=true; }
      if(changed) ids.push(c.id);
    });
    localStorage.setItem('yahma-typemodel-mig-v1','1');
    if(ids.length && typeof saveData==='function'){ try{ await saveData(ids); }catch(_){} }
    try{ if(ids.length && typeof window.log==='function') window.log('ترحيل بيانات','توحيد النوع/الموديل: '+ids.length+' سيارة'); }catch(_){}
    return {migrated:ids.length};
  }catch(e){ return {error:String(e&&e.message||e)}; }
}


