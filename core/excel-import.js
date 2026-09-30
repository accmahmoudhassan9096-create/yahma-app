/* ===== الاستيراد/التصدير Excel والسيارات المباعة وربط الشريط العلوي ===== */
/* استُخرج من app-core.js (السطور 1787-2159) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

function normalizeHeader(value){ return window.YahmaFleetExcel.normalizeHeader(value); }
function findField(header){ return window.YahmaFleetExcel.findField(header); }
function toDateStr(value){ return window.YahmaFleetExcel.toDateStr(value); }
async function downloadTemplate(){ return window.YahmaFleetExcel.downloadTemplate({ensureXlsxReady,alert:message=>alert(message)}); }
async function exportFleet(){ return window.YahmaFleetExcel.exportFleet({fleet,todayStr,ensureXlsxReady,alert:message=>alert(message)}); }
async function handleExcelFile(file){
  if(currentRole!=='admin'&&currentRole!=='ops'){ alert('ليس لديك صلاحية استيراد بيانات الأسطول.'); return; }
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  let rows;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, {defval:''});
  }catch(e){ alert('تعذر قراءة الملف. تأكد أنه ملف إكسيل أو CSV صحيح.'); return; }
  if(!rows.length){ alert('الملف فارغ أو لا يحتوي على بيانات.'); return; }

  const plan=window.YahmaFleetExcel.parseImportRows(rows,uid);
  if(!plan.active.length&&!plan.sold.length){ alert('لم يتم العثور على صف يحتوي على رقم لوحة صحيح. تأكد من مطابقة أسماء الأعمدة لنموذج الإكسيل.'); return; }
  const existingByPlate=new Map(fleet.map(car=>[normalizePlateKey(car.plate),car]));
  let updateCandidates=0,newCandidates=0;
  plan.active.forEach(record=>{
    if(existingByPlate.has(normalizePlateKey(record.car.plate))) updateCandidates++;
    else newCandidates++;
  });
  const soldMatches=new Set(plan.sold.map(record=>normalizePlateKey(record.car.plate)));
  const soldCount=fleet.filter(car=>soldMatches.has(normalizePlateKey(car.plate))).length;
  const shouldContinue=confirm(
    `معاينة تحديث الأسطول:\n${plan.active.length} صف نشط (${updateCandidates} موجود للتحديث، ${newCandidates} جديد)\n`+
    `${soldCount} سيارة مباعة سيتم حذفها\n\nسيتم تحديث الحقول غير الفارغة فقط. السيارات غير الموجودة في الملف لن تُحذف.\nمتابعة؟`
  );
  if(!shouldContinue) return;

  let updated=0,inserted=0,ignored=0;
  const affectedIds=[];
  for(const record of plan.active){
    const plateKey=normalizePlateKey(record.car.plate);
    const idx=fleet.findIndex(car=>normalizePlateKey(car.plate)===plateKey);
    if(idx>=0){
      const merged=window.YahmaFleetExcel.mergeImportRecord(fleet[idx],record);
      if(merged.changed){ fleet[idx]=merged.car; updated++; affectedIds.push(fleet[idx].id); }
      continue;
    }
    const car=record.car;
    const conflict=fleet.findIndex(existing=>(car.serial&&String(existing.serial||'').trim()===car.serial)||(car.cardNumber&&String(existing.cardNumber||'').trim()===car.cardNumber));
    if(conflict<0){ fleet.push(car); inserted++; affectedIds.push(car.id); }
    else ignored++;
  }

  const deletion=plan.sold.length
    ? await removeSoldVehiclesByPlates(plan.sold.map(record=>record.car.plate),{skipConfirm:true,silent:true})
    : {matched:0,deletedCloud:0,failedCloud:0};
  if(affectedIds.length||deletion.matched){
    log('استيراد Excel',`جديد: ${inserted}، محدث: ${updated}، محذوف كمباع: ${deletion.matched}، مكرر: ${ignored}`);
    await saveData(affectedIds.length?affectedIds:undefined);
    render();
  }
  alert(`اكتمل الاستيراد: ${inserted} جديد، ${updated} محدث، ${deletion.matched} مباعة محذوفة، ${ignored} مكرر تم تجاهله.`+
    (deletion.failedCloud?`\nتنبيه: فشل حذف ${deletion.failedCloud} من Supabase؛ تحقق من الاتصال والصلاحيات.`:'')+
    (plan.skipped?`\nتم تجاهل ${plan.skipped} صف بدون رقم لوحة.`:'')+
    (deletion.notFound?`\nلوحات مباعة غير موجودة: ${deletion.notFound}.`:'') );
}

function escPdf(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function openPrintWindow(title, subtitle, headers, rows, note){
  const dateStr=new Date().toLocaleString('ar-EG');
  const headCells=headers.map(h=>`<th>${escPdf(h)}</th>`).join('');
  const bodyRows=rows.map(r=>`<tr>${r.map(c=>`<td>${escPdf(c)}</td>`).join('')}</tr>`).join('');
  const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${escPdf(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
    *{box-sizing:border-box} body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;margin:24px;color:#1A2433;font-size:12px}
    h1{font-size:20px;margin:0 0 4px;color:#1F3C88} .sub{color:#5A6A7E;margin-bottom:16px;font-size:12px}
    .meta{display:flex;justify-content:space-between;margin-bottom:12px;font-size:11px;color:#5A6A7E}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{background:#1F3C88;color:#fff;padding:8px 6px;text-align:right;font-size:11px;font-weight:700}
    td{padding:7px 6px;border-bottom:1px solid #E6EAF0;text-align:right;font-size:11px}
    tr:nth-child(even) td{background:#F7F8FA}
    .note{margin-top:16px;font-size:11px;color:#5A6A7E}
    .footer{margin-top:20px;padding-top:10px;border-top:1px solid #E6EAF0;font-size:10px;color:#8A97A8;text-align:center}
    @media print{body{margin:12px} .no-print{display:none!important} thead{display:table-header-group}}
  </style></head><body onload="setTimeout(function(){window.print()},400)">
  <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px">
    <button onclick="window.print()" style="padding:10px 18px;background:#1F3C88;color:#fff;border:0;border-radius:8px;font-family:inherit;font-weight:700;cursor:pointer">طباعة / حفظ PDF</button>
    <button onclick="window.close()" style="padding:10px 18px;background:#eee;border:0;border-radius:8px;font-family:inherit;cursor:pointer">إغلاق</button>
  </div>
  <h1>${escPdf(title)}</h1>
  <div class="sub">${escPdf(subtitle||'')}</div>
  <div class="meta"><span>تاريخ التصدير: ${escPdf(dateStr)}</span><span>عدد السجلات: ${rows.length}</span></div>
  <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows||'<tr><td colspan="'+headers.length+'">لا توجد بيانات</td></tr>'}</tbody></table>
  ${note?`<div class="note">${escPdf(note)}</div>`:''}
  <div class="footer">نظام إدارة جاهزية الأسطول — تصدير PDF</div>
</body></html>`;
  const w=window.open('','_blank','width=1000,height=700');
  if(!w){ alert('يرجى السماح بالنوافذ المنبثقة لتصدير PDF'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
function exportCurrentTabPDF(){
  const tab=typeof currentTab!=='undefined'?currentTab:'dashboard';
  if(tab==='dashboard'){
    const st=readinessStats();
    const headers=['البند','القيمة'];
    const rows=[
      ['إجمالي الأسطول', String(fleet.length)],
      ['جاهزة للتأجير', String(st.ready)],
      ['غير جاهزة', String(st.total-st.ready)],
      ['نسبة الجاهزية', st.pct+'%'],
      ['كارت يحتاج متابعة', String(fleet.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green').length)],
      ['رخصة تحتاج متابعة', String(fleet.filter(c=>licenseDisplayStatus(c.licenseExpiry).level!=='green').length)],
      ['فحص غير سليم', String(fleet.filter(c=>inspectionDisplayStatus(c.inspectionStatus).level!=='green').length)],
      ['تحت الصيانة', String(fleet.filter(c=>String(c.carStatus||'').includes('صيانة')).length)],
      ['خارج الخدمة', String(fleet.filter(c=>String(c.carStatus||'').includes('خارج')).length)],
    ];
    // top issues by plate
    const notReady=fleet.filter(c=>!vehicleReadiness(c).ready).slice(0,80);
    const headers2=['رقم اللوحة','الماركة','الفرع','الحالة','السبب'];
    const rows2=notReady.map(c=>{
      const r=vehicleReadiness(c);
      return [c.plate||'—',c.brand||'—',c.branch||'—',c.carStatus||'—',(r.failed||[]).map(f=>f.label).join('، ')||'—'];
    });
    openPrintWindow('لوحة التحكم — ملخص الجاهزية','إحصائيات عامة للأسطول',headers,rows);
    if(rows2.length) setTimeout(()=>openPrintWindow('السيارات غير الجاهزة','أول '+rows2.length+' سيارة غير جاهزة',headers2,rows2),600);
    return;
  }
  if(tab==='fleet'){
    // try use visible filtered if possible - export all fleet with key cols
    // Prefer currently filtered rows if draw has selection - fall back to all
    let list=fleet.slice();
    try{
      // if search/filters exist in DOM, re-apply lightly
      const q=(document.getElementById('fleet-search')?.value||'').trim().toLowerCase();
      if(q) list=list.filter(c=>[c.plate,c.brand,c.model,c.owner,c.branch].join(' ').toLowerCase().includes(q));
    }catch(_){}
    const headers=['رقم اللوحة','الماركة','الموديل','السنة','الفرع','المالك','حالة السيارة','الكارت','الرخصة','الفحص','الجاهزية'];
    const rows=list.map(c=>{
      const rdy=vehicleReadiness(c);
      return [c.plate||'—',c.brand||'—',c.model||'—',c.year||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',
        cardDisplayStatus(c.cardExpiry,c.cardStatus).label,
        licenseDisplayStatus(c.licenseExpiry).label,
        inspectionDisplayStatus(c.inspectionStatus).label,
        rdy.label];
    });
    openPrintWindow('تقرير الأسطول','قائمة سيارات الأسطول',headers,rows);
    return;
  }
  if(tab==='renewals'){
    let list=fleet.slice();
    try{
      const q=(document.getElementById('ren-search')?.value||'').trim().toLowerCase();
      const branch=(document.getElementById('ren-branch')?.value||'').trim();
      const carSt=(document.getElementById('ren-car-status')?.value||'').trim();
      const insp=(document.getElementById('ren-insp-status')?.value||'').trim();
      const lic=(document.getElementById('ren-lic-condition')?.value||'').trim();
      list=list.filter(c=>{
        if(q && ![c.plate,c.owner,c.branch,c.brand].join(' ').toLowerCase().includes(q)) return false;
        if(branch && String(c.branch||'').trim()!==branch) return false;
        if(carSt){
          const got=String(c.carStatus||'');
          if(carSt==='تحت الصيانة'&&!got.includes('صيانة')) return false;
          if(carSt==='خارج الخدمة'&&!got.includes('خارج')) return false;
          if(carSt==='نشط'&&(got.includes('صيانة')||got.includes('خارج'))) return false;
        }
        if(insp && inspectionDisplayStatus(c.inspectionStatus).level!==insp) return false;
        if(lic && dateStatus(c.licenseExpiry).level!==lic) return false;
        return true;
      });
    }catch(_){}
    const headers=['رقم اللوحة','الماركة','المالك','الفرع','حالة السيارة','حالة الفحص','حالة الرخصة','تاريخ انتهاء الرخصة'];
    const rows=list.map(c=>[
      c.plate||'—',c.brand||'—',c.owner||'—',c.branch||'—',c.carStatus||'—',
      inspectionDisplayStatus(c.inspectionStatus).label,
      licenseDisplayStatus(c.licenseExpiry).label,
      fmtDate(c.licenseExpiry)
    ]);
    openPrintWindow('تقرير الفحص والرخصة','قائمة الفحص ومواعيد الرخصة',headers,rows);
    return;
  }
  if(tab==='followup'){
    let list=fleet.slice();
    try{
      const q=(document.getElementById('fu-search')?.value||'').trim().toLowerCase();
      const branch=(document.getElementById('fu-branch')?.value||'').trim();
      const carSt=(document.getElementById('fu-car-status')?.value||'').trim();
      const cardCond=(document.getElementById('fu-card-condition')?.value||'').trim();
      const ins=(document.getElementById('fu-ins-status')?.value||'').trim();
      list=list.filter(c=>{
        if(q && ![c.plate,c.owner,c.branch,c.brand,c.cardNumber].join(' ').toLowerCase().includes(q)) return false;
        if(branch && String(c.branch||'').trim()!==branch) return false;
        if(carSt){
          const got=String(c.carStatus||'');
          if(carSt==='تحت الصيانة'&&!got.includes('صيانة')) return false;
          if(carSt==='خارج الخدمة'&&!got.includes('خارج')) return false;
          if(carSt==='نشط'&&(got.includes('صيانة')||got.includes('خارج'))) return false;
        }
        if(cardCond && cardDisplayStatus(c.cardExpiry,c.cardStatus).level!==cardCond) return false;
        if(ins && textTag(c.insuranceStatus).level!==ins) return false;
        return true;
      });
    }catch(_){}
    const headers=['رقم اللوحة','الماركة','رقم البطاقة','المالك','الفرع','حالة السيارة','حالة الكارت','تاريخ انتهاء الكارت','التأمين'];
    const rows=list.map(c=>[
      c.plate||'—',c.brand||'—',c.cardNumber||'—',c.owner||'—',c.branch||'—',c.carStatus||'—',
      cardDisplayStatus(c.cardExpiry,c.cardStatus).label,
      fmtDate(c.cardExpiry),
      textTag(c.insuranceStatus).label
    ]);
    openPrintWindow('تقرير الكارت والتأمين','متابعة الكروت والتأمين',headers,rows);
    return;
  }
  if(tab==='reports'){
    const st=readinessStats();
    const byBranch={};
    fleet.forEach(c=>{
      const b=(c.branch||'غير محدد').trim()||'غير محدد';
      if(!byBranch[b]) byBranch[b]={total:0,ready:0};
      byBranch[b].total++;
      if(vehicleReadiness(c).ready) byBranch[b].ready++;
    });
    const headers=['الفرع','الإجمالي','جاهزة','غير جاهزة','نسبة الجاهزية'];
    const rows=Object.entries(byBranch).sort((a,b)=>b[1].total-a[1].total).map(([b,v])=>[
      b, String(v.total), String(v.ready), String(v.total-v.ready),
      (v.total?Math.round(v.ready/v.total*100):0)+'%'
    ]);
    openPrintWindow('تقرير أداء الفروع','ملخص الجاهزية حسب الفرع — إجمالي الأسطول '+fleet.length+' | جاهزية عامة '+st.pct+'%',headers,rows);
    return;
  }
  // fallback
  openPrintWindow('تصدير الأسطول','قائمة مختصرة',['رقم اللوحة','الماركة','الفرع','الحالة'],
    fleet.slice(0,500).map(c=>[c.plate||'—',c.brand||'—',c.branch||'—',c.carStatus||'—']));
}

function normalizePlateKey(p){
  return String(p||'')
    .replace(/[ً-ْ]/g,'')
    .replace(/[إأآٱ]/g,'ا')
    .replace(/ة/g,'ه')
    .replace(/ى/g,'ي')
    .replace(/\s+/g,'')
    .replace(/[-_]/g,'')
    .trim()
    .toLowerCase();
}
function extractPlatesFromRows(rows){
  const plates=[];
  rows.forEach(row=>{
    // دعم أسماء أعمدة متعددة + أول عمود لو مفيش هيدر معروف
    let plate='';
    const keys=Object.keys(row);
    for(const h of keys){
      const field=typeof findField==='function' ? findField(h) : null;
      const nh=String(h).replace(/\s+/g,'').toLowerCase();
      if(field==='plate' || nh.includes('لوح') || nh.includes('plate') || nh.includes('رقم')){
        plate=row[h]; break;
      }
    }
    if(!plate && keys.length) plate=row[keys[0]];
    const t=String(plate||'').trim();
    if(t) plates.push(t);
  });
  return plates;
}
async function downloadSoldTemplate(){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  const headers=['رقم اللوحة'];
  const example=['ر ن س 6724'];
  const ws=XLSX.utils.aoa_to_sheet([headers, example, ['ر ن س 6725']]);
  ws['!cols']=[{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'سيارات مباعة');
  XLSX.writeFile(wb, 'نموذج-سيارات-مباعة.xlsx');
}
async function removeSoldVehiclesByPlates(plates,options={}){
  const {skipConfirm=false,silent=false}=options;
  if(!plates.length){ if(!silent) alert('لم يتم العثور على أرقام لوحات في الملف.'); return {matched:0,deletedCloud:0,failedCloud:0,notFound:0,cancelled:false}; }
  const keys=plates.map(normalizePlateKey).filter(Boolean);
  const keySet=new Set(keys);
  const matched=fleet.filter(c=>keySet.has(normalizePlateKey(c.plate)));
  if(!matched.length){
    if(!silent) alert('لا توجد سيارات في الأسطول تطابق أرقام اللوحات في الملف.\nتم قراءة '+plates.length+' رقم لوحة.');
    return {matched:0,deletedCloud:0,failedCloud:0,notFound:plates.length,cancelled:false};
  }
  const preview=matched.slice(0,15).map(c=>c.plate).join('\n')+(matched.length>15?'\n…':'');
  if(!skipConfirm&&!confirm('سيتم حذف '+matched.length+' سيارة مباعة من الأسطول'+((!window._demoMode && window.supabaseReady)?' وSupabase':'')+':\n\n'+preview+'\n\nمتابعة؟')) return {matched:0,deletedCloud:0,failedCloud:0,notFound:plates.length,cancelled:true};

  const ids=matched.map(c=>String(c.id));
  const idSet=new Set(ids);
  const remaining=fleet.filter(c=>!idSet.has(String(c.id)));
  let deletedCloud=0, failedCloud=0;

  // حذف من Supabase واحدة تلو الأخرى (أو batch)
  if(!window._demoMode && window.supabaseReady && window.supabaseClient){
    try{
      for(let i=0;i<ids.length;i+=100){
        const chunk=ids.slice(i,i+100);
        const { error } = await window.supabaseClient.from(VEH_TABLE).delete().in('car_id', chunk);
        if(error) throw error;
        deletedCloud+=chunk.length;
        chunk.forEach(id=>cloudVehicleIds.delete(id));
      }
      window.syncMessage='تم حذف '+deletedCloud+' سيارة مباعة من Supabase';
    }catch(e){
      console.error(e);
      failedCloud=ids.length;
      if(!silent) alert('تعذر الحذف من Supabase: '+(e.message||e)+'\nسيتم الحذف محليًا فقط.');
    }
  }

  fleet=remaining;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
  pingSync();
  const notFound=plates.length-matched.length;
  if(!silent){
    render();
    alert('تم حذف '+matched.length+' سيارة مباعة.'
      +(deletedCloud? '\nمحذوفة من Supabase: '+deletedCloud:'')
      +(failedCloud? '\nفشل Supabase: تم الحفظ محليًا':'')
      +(notFound>0? '\nأرقام لوحات غير موجودة في الأسطول: '+notFound:''));
  }
  return {matched:matched.length,deletedCloud,failedCloud,notFound,cancelled:false};
}
async function handleSoldExcelFile(file){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  let rows;
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    rows=XLSX.utils.sheet_to_json(ws,{defval:''});
    // لو الملف بدون هيدر (صفوف كمصفوفات)
    if(!rows.length){
      const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      rows=aoa.filter(r=>r && r[0]).map(r=>({'رقم اللوحة':r[0]}));
    }
  }catch(e){
    alert('تعذر قراءة الملف. تأكد أنه Excel أو CSV.');
    return;
  }
  const plates=extractPlatesFromRows(rows);
  await removeSoldVehiclesByPlates(plates);
}

document.getElementById('btn-refresh').addEventListener('click', manualRefresh);
document.getElementById('btn-template').addEventListener('click', ()=>{ downloadTemplate(); document.getElementById('more-menu')?.classList.remove('open'); });
document.getElementById('btn-sold-template')?.addEventListener('click', ()=>{ downloadSoldTemplate(); document.getElementById('more-menu')?.classList.remove('open'); });
document.getElementById('btn-export').addEventListener('click', ()=>{ exportFleet(); document.getElementById('more-menu')?.classList.remove('open'); });
document.getElementById('btn-import').addEventListener('click', ()=> document.getElementById('file-import').click());
document.getElementById('btn-export-pdf')?.addEventListener('click', exportCurrentTabPDF);
document.getElementById('btn-sold-import')?.addEventListener('click', ()=> document.getElementById('file-sold-import').click());
document.getElementById('btn-branch-status-import')?.addEventListener('click', ()=> document.getElementById('file-branch-status').click());
document.getElementById('btn-branch-status-template')?.addEventListener('click', ()=>{ downloadBranchStatusTemplate(); document.getElementById('more-menu')?.classList.remove('open'); });
document.getElementById('btn-clear-all')?.addEventListener('click', ()=> document.getElementById('more-menu')?.classList.remove('open'));
document.getElementById('file-import').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  await handleExcelFile(file);
  e.target.value = '';
});
document.getElementById('file-sold-import')?.addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  if(!file) return;
  await handleSoldExcelFile(file);
  e.target.value='';
});
document.getElementById('file-branch-status')?.addEventListener('change', async (e)=>{
  const file=e.target.files[0];
  if(!file) return;
  await handleBranchStatusImport(file);
  e.target.value='';
});

// تم نقل استدعاء loadData() ليعمل فقط بعد نجاح تسجيل الدخول (انظر initAuthGate بالأعلى)


