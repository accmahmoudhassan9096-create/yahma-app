/* ===== طبقة المزامنة مع Supabase وRealtime ===== */
/* استُخرج من app-core.js (السطور 605-758) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

/* ================= طبقة البيانات — Supabase ================= */
const VEH_TABLE = 'vehicles';
const dataService = window.YahmaData;
const realtimeService = window.YahmaRealtime;
function rowToCar(row){ return dataService.fromVehicleRow(row); }
function fetchAllVehicles(){ return dataService.fetchAllVehicles(window.supabaseClient, VEH_TABLE); }

let cloudVehicleIds = new Set();
const LAST_SYNC_KEY = 'fleet-last-sync-v1';

function updateLastSyncLabel(){
  const el=document.getElementById('last-sync-label');
  if(!el) return;
  const iso=localStorage.getItem(LAST_SYNC_KEY);
  if(!iso){ el.textContent='لم تُحدَّث من Supabase بعد'; return; }
  const d=new Date(iso);
  const mins=Math.round((Date.now()-d.getTime())/60000);
  let ago;
  if(mins<1) ago='الآن';
  else if(mins<60) ago='قبل '+mins+' دقيقة';
  else if(mins<1440) ago='قبل '+Math.round(mins/60)+' ساعة';
  else ago='قبل '+Math.round(mins/1440)+' يوم';
  el.textContent='آخر تحديث سحابي: '+ago;
}

function dataContext(){
  return {
    getFleet:()=>fleet,
    // نطاق الفرع: المستخدم المرتبط بفرع تُحفظ في ذاكرته سيارات فرعه فقط،
    // فكل التبويبات والعدادات والتصدير تقرأ النطاق تلقائيًا (والخادم يفرضه عبر RLS)
    setFleet:rows=>{ fleet=(typeof scopeFleetToUser==='function')?scopeFleetToUser(rows):rows; },
    render,
    seedData,
    normalizeFleetDates,
    attachRealtimeSync,
    renderEmergencyFleet,
    fetchCloudVehicles:fetchAllVehicles,
    rowToCar,
    loadData,
    updateLastSyncLabel,
    setCloudVehicleIds:ids=>{ cloudVehicleIds=new Set(ids); },
    addCloudVehicleIds:ids=>ids.forEach(id=>cloudVehicleIds.add(id))
  };
}

// Keep the public entry point stable while the data module owns its implementation.
let _loadDataInFlight = null;
/* نُعرّف الـ context فور تحميل الملف حتى يجد hook استعادة الجلسة الأسطول
   حتى لو لم يُستدعَ loadData بعد (حالة العميل العائد من الخلفية) */
try{ window.YahmaAppContext = dataContext(); } catch (_) {}
async function loadData(forceCloud=false){
  if(_loadDataInFlight) return _loadDataInFlight;
  _loadDataInFlight = _loadDataImpl(forceCloud);
  try{ return await _loadDataInFlight; }
  finally{ _loadDataInFlight = null; }
}
function _loadDataImpl(forceCloud=false){
  const ctx = dataContext();
  /* متاح لغيره (استعادة الجلسة عند رجوع التطبيق) بدون تمرير context يدويًا */
  try{ if (typeof window !== 'undefined') window.YahmaAppContext = ctx; } catch (_) {}
  return dataService.loadData(forceCloud, ctx);
}

function refreshFleetFromCloud(){ return realtimeService.refresh(dataContext()); }
function attachRealtimeSync(){ return realtimeService.attach(dataContext()); }

function manualRefresh(){ return realtimeService.manualRefresh(dataContext()); }

window.notifyYahmaEvent=async function(event,payload={}){
  if(window._demoMode||!window.supabaseReady||!window.supabaseClient) return {ok:false,skipped:true};
  try{
    const {data,error}=await window.supabaseClient.functions.invoke('send-user-email',{body:{event,payload}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    if(!data?.sent) throw new Error('لم يُرسل البريد لأي مستخدم');
    return {ok:true,sent:data.sent,failed:data.failed||0};
  }catch(error){
    const message=error?.message||'تعذر إرسال إشعار البريد';
    console.warn('Automatic email notification failed:',event,message);
    return {ok:false,error:message};
  }
};

function saveData(idsToSave){ return dataService.saveData(idsToSave, dataContext()); }
async function pingSync(){ /* لم تعد مطلوبة — Realtime على الجدول نفسه */ }
async function deleteVehicleFromCloud(id){
  if(window._demoMode){
    window.syncMessage='حُذفت محليًا (وضع تجريبي)';
    return {ok:true, localOnly:true};
  }
  if(!window.supabaseReady || !window.supabaseClient){
    return {ok:true, localOnly:true};
  }
  const carId=String(id);
  try{
    const { data, error } = await window.supabaseClient.from(VEH_TABLE).delete().eq('car_id', carId).select('id');
    if(error) throw error;
    // Supabase (RLS) بيرجّع 0 صفوف بدل خطأ لو مفيش صلاحية حذف
    if((!data || !data.length) && cloudVehicleIds.has(carId)){
      return {ok:false, error:'لم يتم الحذف من Supabase. تأكد أن حسابك مدير (admin) وأن سياسة RLS تسمح بالحذف.'};
    }
    cloudVehicleIds.delete(carId);
    window.syncMessage='تم حذف السيارة من Supabase';
    return {ok:true};
  }catch(e){
    console.error('deleteVehicleFromCloud', e);
    const msg=e && e.message || String(e);
    if(/permission|policy|denied|RLS/i.test(msg)){
      return {ok:false, error:'لا توجد صلاحية حذف على Supabase. تأكد أن حسابك مدير (admin) وأن سياسة RLS تسمح بالحذف.'};
    }
    return {ok:false, error: msg};
  }
}
async function deleteAllVehiclesFromCloud(){
  if(window._demoMode){
    window.syncMessage='تم المسح محليًا (وضع تجريبي)';
    return {ok:true, localOnly:true};
  }
  if(!window.supabaseReady || !window.supabaseClient) return {ok:true, localOnly:true};
  try{
    const { error } = await window.supabaseClient.from(VEH_TABLE).delete().not('id','is',null);
    if(error) throw error;
    cloudVehicleIds.clear();
    window.syncMessage='تم مسح كل السيارات من Supabase';
    return {ok:true};
  }catch(e){
    console.error('deleteAllVehiclesFromCloud', e);
    return {ok:false, error:e.message||String(e)};
  }
}
/** يحذف من Supabase أي سيارات غير موجودة في الأسطول الحالي */
async function syncCloudDeletions(){
  if(window._demoMode || !window.supabaseReady || !window.supabaseClient) return;
  try{
    const cloudRows=await fetchAllVehicles();
    const localIds=new Set(fleet.map(c=>String(c.id)));
    const orphans=cloudRows.map(r=>String(r.car_id||('cloud-'+r.id))).filter(id=>!localIds.has(id));
    if(!orphans.length) return;
    for(let i=0;i<orphans.length;i+=100){
      const { error } = await window.supabaseClient.from(VEH_TABLE).delete().in('car_id', orphans.slice(i,i+100));
      if(error) throw error;
    }
    cloudVehicleIds=new Set(fleet.map(c=>String(c.id)));
    window.syncMessage='تمت مزامنة الحذف مع Supabase ('+orphans.length+')';
  }catch(e){
    console.warn('syncCloudDeletions failed', e);
  }
}

async function shareFileByEmail(filename, content, mime, subject, body){
  const file=new File([content],filename,{type:mime});
  try{
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      await navigator.share({title:subject,text:body,files:[file]});
      log('إرسال بالبريد',filename);
      return;
    }
  }catch(e){ if(e && e.name==='AbortError') return; console.warn('share failed',e); }
  const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=filename;a.click();
  const to=prompt('اكتب البريد الإلكتروني للمستلم (اختياري):','')||'';
  window.location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body+'\n\nتم تنزيل الملف باسم '+filename+' — أرفقه بالرسالة قبل الإرسال.');
  log('تجهيز إرسال بالبريد',filename);
}

