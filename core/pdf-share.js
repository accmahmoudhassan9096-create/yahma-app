/* ===== توليد PDF وواتساب ونافذة المركبة وربط الأزرار ===== */
/* استُخرج من app-core.js (السطور 1432-1786) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

function getUninspectedCars(){
  return window.YahmaRenewals.getUninspectedCars(fleet, inspectionDisplayStatus);
}
function buildInspectionWhatsAppMessage(cars){
  return window.YahmaRenewals.buildInspectionWhatsAppMessage(cars||getUninspectedCars(), inspectionDisplayStatus);
}


/* نفس خط الواجهة (Cairo) عشان العربي يطلع متّصل ومظبوط على أي جهاز.
   فرض Tahoma كان بيخلي المتصفح يرجع لخط بديل على الأجهزة اللي مش
   عليها Windows fonts، فالعربي بيطلع حروفه مقطّعة في الـPDF. */
var YAHMA_PDF_FONT = "'Cairo','Noto Sans Arabic',Tahoma,'Segoe UI',Arial,sans-serif";

function buildPdfReportHtml(title, headers, rows, subtitle){
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const head=(headers||[]).map(h=>'<th>'+esc(h)+'</th>').join('');
  const body=(rows||[]).map(r=>'<tr>'+(r||[]).map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('');
  return (
    '<div class="pdf-root" style="box-sizing:border-box;width:1000px;padding:24px;background:#ffffff;color:#1A2433;font-family:' + YAHMA_PDF_FONT + ';direction:rtl;text-align:right;">'+
      '<style>.pdf-root *{font-family:' + YAHMA_PDF_FONT + ' !important}</style>'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C6952E;padding-bottom:12px;margin-bottom:16px;">'+
        '<div>'+
          '<div style="font-size:22px;font-weight:800;color:#1F3C88;line-height:1.3;">'+esc(title)+'</div>'+
          (subtitle?('<div style="font-size:13px;color:#5A6A7E;margin-top:6px;">'+esc(subtitle)+'</div>'):'')+
        '</div>'+
        '<div style="font-size:12px;color:#5A6A7E;white-space:nowrap;">'+esc(new Date().toLocaleString('ar-EG'))+'</div>'+
      '</div>'+
      '<div style="font-size:13px;margin-bottom:12px;color:#5A6A7E;">عدد السجلات: <b style="color:#1A2433;">'+(rows?rows.length:0)+'</b></div>'+
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'+
        '<thead><tr style="background:#1F3C88;color:#fff;">'+head.replace(/<th>/g,'<th style="padding:9px 7px;font-size:12px;text-align:right;border:1px solid #16306e;word-wrap:break-word;">')+'</tr></thead>'+
        '<tbody>'+(body||('<tr><td colspan="'+(headers||[]).length+'" style="padding:14px;text-align:center;">لا توجد بيانات</td></tr>')).replace(/<td>/g,'<td style="padding:8px 7px;border:1px solid #E5E7EB;font-size:11.5px;text-align:right;word-wrap:break-word;vertical-align:top;">')+
        '</tbody></table>'+
      '<div style="margin-top:18px;padding-top:10px;border-top:1px solid #E6EAF0;font-size:11px;color:#8A97A8;text-align:center;">نظام إدارة جاهزية الأسطول</div>'+
    '</div>'
  );
}
async function generateReportPdfBlob(title, headers, rows, subtitle){
  if(typeof html2canvas!=='function') throw new Error('html2canvas غير متاحة — تحقق من الاتصال بالإنترنت');
  const jspdfNS=window.jspdf||window.jsPDF;
  const JsPDF=(jspdfNS&&(jspdfNS.jsPDF||jspdfNS))||null;
  if(!JsPDF) throw new Error('jsPDF غير متاحة — تحقق من الاتصال بالإنترنت');

  const host=document.createElement('div');
  host.setAttribute('data-pdf-host','1');
  // ظاهر جزئيًا على الشاشة (opacity منخفضة) — off-screen يسبب PDF فاضي في بعض المتصفحات
  host.style.cssText='position:fixed;left:0;top:0;width:1000px;background:#fff;z-index:2147483646;opacity:0.02;pointer-events:none;overflow:visible;';
  host.innerHTML=buildPdfReportHtml(title, headers, rows, subtitle);
  document.body.appendChild(host);

  try{
    // لازم الخط يخلص تحميل قبل الرسم، وإلا الـclone بيرسم بخط بديل
    try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(_){yahmaErr(_,'pdf-share.js:56');}
    // انتظر رسم المتصفح
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await new Promise(r=>setTimeout(r, 250));

    const node=host.querySelector('.pdf-root')||host;

    /* The page is drawn by the browser itself (SVG foreignObject).
       html2canvas re-implements text layout, and with the fonts used
       here the Arabic comes out with disconnected letters. The browser
       knows how to shape it correctly. */
    let canvas=null;
    try{
      if(window.YahmaCaptureViaSvg){
        canvas=await window.YahmaCaptureViaSvg(node, 2, 0.9);
      }
    }catch(e){ console.warn('تعذر الرسم عبر SVG، بنستخدم html2canvas:', e); }
    if(!canvas){
      canvas=await html2canvas(node,{
        scale:2,
        useCORS:true,
        allowTaint:true,
        backgroundColor:'#ffffff',
        logging:false,
        width:node.scrollWidth||1000,
        height:Math.max(node.scrollHeight||100, 200),
        windowWidth:node.scrollWidth||1000,
        windowHeight:Math.max(node.scrollHeight||100, 200)
      });
    }

    if(!canvas || canvas.width<20 || canvas.height<20){
      throw new Error('تعذر رسم التقرير (Canvas فارغ)');
    }

    const landscape=(headers||[]).length>6;
    const pdf=new JsPDF({orientation:landscape?'landscape':'portrait', unit:'mm', format:'a4'});
    const pageW=pdf.internal.pageSize.getWidth();
    const pageH=pdf.internal.pageSize.getHeight();
    const margin=8;
    const usableW=pageW-margin*2;
    const usableH=pageH-margin*2;
    const imgW=usableW;
    const imgH=canvas.height*imgW/canvas.width;

    // صفحة واحدة لو المحتوى قصير
    if(imgH<=usableH){
      const data=canvas.toDataURL('image/jpeg',0.95);
      pdf.addImage(data,'JPEG',margin,margin,imgW,imgH);
      return pdf.output('blob');
    }

    // تقسيم لصفحات: قص من الـ canvas
    const pageHeightPx=Math.floor(canvas.width * usableH / usableW);
    let yPx=0;
    let page=0;
    while(yPx<canvas.height-2){
      const sliceH=Math.min(pageHeightPx, canvas.height-yPx);
      const pageCanvas=document.createElement('canvas');
      pageCanvas.width=canvas.width;
      pageCanvas.height=sliceH;
      const ctx=pageCanvas.getContext('2d');
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,pageCanvas.width,pageCanvas.height);
      ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const data=pageCanvas.toDataURL('image/jpeg',0.95);
      if(page>0) pdf.addPage();
      const sliceMm=sliceH*imgW/canvas.width;
      pdf.addImage(data,'JPEG',margin,margin,imgW,sliceMm);
      yPx+=sliceH;
      page++;
      if(page>40) break; // حماية
    }
    return pdf.output('blob');
  }finally{
    host.remove();
  }
}
function currentPagePdfData(){
  if(typeof window._yahmaCurrentPdfData==='function') return window._yahmaCurrentPdfData();
  const tables=[...document.querySelectorAll('#content table')].sort((a,b)=>b.querySelectorAll('tbody tr').length-a.querySelectorAll('tbody tr').length);
  const table=tables[0];
  if(table){
    const headers=[...table.querySelectorAll('thead th')].map(x=>x.innerText.trim());
    const rows=[...table.querySelectorAll('tbody tr')].map(tr=>[...tr.cells].map(td=>{const clone=td.cloneNode(true);clone.querySelectorAll('button').forEach(b=>b.remove());return clone.innerText.trim()}).slice(0,headers.length));
    if(headers.length) return {title:document.getElementById('topbar-title')?.textContent.trim()||'تقرير المنصة',subtitle:'البيانات المعروضة في الصفحة الحالية — '+rows.length+' سجل',headers,rows};
  }
  return {title:document.getElementById('topbar-title')?.textContent.trim()||'تقرير المنصة',subtitle:'ملخص الصفحة الحالية',headers:['البيان'],rows:[[document.getElementById('topbar-sub')?.textContent.trim()||'لا توجد بيانات جدولية في الصفحة الحالية']]};
}
function openEmailFilteredPdfModal(){
  if(window.currentRole!=='admin'){alert('إرسال التقارير متاح لمدير النظام فقط.');return;}
  if(!window.supabaseReady||!window.supabaseClient){alert('يلزم الاتصال بالمنصة أولًا لإرسال البريد.');return;}
  if(document.getElementById('email-filtered-pdf-overlay')) return;
  const overlay=document.createElement('div');overlay.className='overlay';overlay.id='email-filtered-pdf-overlay';overlay.style.display='flex';
  overlay.innerHTML='<div class="modal" style="max-width:650px;max-height:90vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0">إرسال التقرير المفلتر PDF</h2><button class="btn btn-ghost" type="button" id="efp-close" aria-label="إغلاق">×</button></div><p class="muted-small" id="efp-summary" style="margin:8px 0 14px"></p><div class="field full"><label for="efp-search">بحث عن مستخدم</label><input id="efp-search" type="search" placeholder="الاسم أو البريد الإلكتروني"></div><div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0"><label style="display:flex;align-items:center;gap:8px"><input id="efp-all" type="checkbox"> تحديد المستخدمين الظاهرين</label><span class="muted-small" id="efp-count">جارٍ تحميل المستخدمين...</span></div><div id="efp-users" style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px"></div><div class="field-grid" style="margin-top:12px"><div class="field full"><label for="efp-subject">عنوان البريد</label><input id="efp-subject" maxlength="180"></div><div class="field full"><label for="efp-message">رسالة مرافقة (اختياري)</label><textarea id="efp-message" rows="3" maxlength="5000" placeholder="مرفق لكم التقرير المطلوب."></textarea></div></div><div class="modal-actions"><span class="muted-small">حتى 25 مستخدمًا في كل إرسال</span><div class="modal-actions-right"><button class="btn btn-ghost" id="efp-cancel" type="button">إلغاء</button><button class="btn btn-primary" id="efp-send" type="button" disabled>إرسال PDF</button></div></div></div>';
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.querySelector('#efp-close').onclick=close;overlay.querySelector('#efp-cancel').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
  const search=overlay.querySelector('#efp-search'), listEl=overlay.querySelector('#efp-users'), countEl=overlay.querySelector('#efp-count'), sendBtn=overlay.querySelector('#efp-send');
  let users=[],loading=true;const selected=new Set();
  const draw=()=>{
    const q=search.value.trim().toLowerCase();const shown=users.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q));
    listEl.innerHTML=shown.map(u=>'<label style="display:flex;align-items:center;gap:9px;padding:8px;border-bottom:1px solid var(--line)"><input type="checkbox" data-user-id="'+escapeHtml(u.id)+'" '+(selected.has(u.id)?'checked':'')+'><span style="min-width:0;overflow-wrap:anywhere"><b>'+escapeHtml(u.name||u.email)+'</b><small style="display:block;color:var(--muted)">'+escapeHtml(u.email)+'</small></span></label>').join('')||'<div class="empty">لا يوجد مستخدمون مطابقون</div>';
    countEl.textContent=loading?'جارٍ تحميل المستخدمين...':!hasRows?'لا توجد بيانات قابلة للإرسال في هذه الصفحة':`${selected.size} محدد · ${users.length} مستخدم`;sendBtn.disabled=loading||!hasRows||selected.size===0||selected.size>25;
    overlay.querySelector('#efp-all').checked=shown.length>0&&shown.every(u=>selected.has(u.id));
    listEl.querySelectorAll('[data-user-id]').forEach(box=>box.onchange=()=>{box.checked?selected.add(box.dataset.userId):selected.delete(box.dataset.userId);draw()});
  };
  search.oninput=draw;
  overlay.querySelector('#efp-all').onchange=e=>{const q=search.value.trim().toLowerCase();users.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q)).forEach(u=>e.target.checked?selected.add(u.id):selected.delete(u.id));draw()};
  const pageData=currentPagePdfData(),hasRows=(pageData.rows||[]).length>0;overlay.querySelector('#efp-summary').textContent=`${pageData.title} · ${(pageData.rows||[]).length} سجل`+(!hasRows?' — افتح سجل النشاط أولًا لعرض بياناته':'');overlay.querySelector('#efp-subject').value='منصة يهماء — '+pageData.title;draw();
  window.supabaseClient.functions.invoke('send-user-email',{body:{action:'list_report_recipients'}}).then(({data,error})=>{if(error)throw error;users=Array.isArray(data?.users)?data.users:[];loading=false;draw()}).catch(error=>{loading=false;countEl.textContent='تعذر تحميل المستخدمين';listEl.innerHTML='<div class="empty">'+escapeHtml(error.message||'تعذر تحميل الحسابات')+'</div>';sendBtn.disabled=true});
  sendBtn.onclick=async()=>{
    const ids=[...selected];if(!ids.length||ids.length>25)return;sendBtn.disabled=true;sendBtn.textContent='جارٍ تجهيز وإرسال PDF...';
    try{
      const data=currentPagePdfData();if(!data.rows?.length)throw new Error('لا توجد نتائج مطابقة للفلاتر لإرسالها');
      if(window.YahmaExport?.ensurePdfReady) await window.YahmaExport.ensurePdfReady();
      const blob=await generateReportPdfBlob(data.title,data.headers,data.rows,data.subtitle);if(blob.size>6*1024*1024)throw new Error('حجم التقرير أكبر من 6 ميجابايت؛ قلل النتائج بالفلاتر ثم أعد المحاولة');
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('تعذر قراءة ملف PDF'));reader.readAsDataURL(blob)});
      const filename=(data.title||'yahma-report').replace(/[^\w\u0600-\u06FF-]/g,'-').slice(0,70)+'-'+todayStr()+'.pdf';
      const result=await window.supabaseClient.functions.invoke('send-user-email',{body:{action:'send_report_pdf',recipientIds:ids,subject:overlay.querySelector('#efp-subject').value,message:overlay.querySelector('#efp-message').value,filename,pdfBase64:base64}});
      if(result.error)throw result.error;if(result.data?.error)throw new Error(result.data.error);
      alert(`تم إرسال التقرير إلى ${result.data?.sent||0} مستخدم${result.data?.failed?`، وتعذر الإرسال إلى ${result.data.failed}`:''}`+(result.data?.errors?.length?'\n'+result.data.errors.join('\n'):''));close();
    }catch(error){alert('تعذر إرسال التقرير: '+(error.message||error));sendBtn.disabled=false;sendBtn.textContent='إرسال PDF'}
  };
}
function downloadBlob(blob, filename){
  if(!blob || blob.size<100) throw new Error('ملف PDF فارغ أو تالف');
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename||'report.pdf';
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 4000);
}
/* ===== سجل التنبيهات المرسلة عبر واتساب =====
   كل نداء sharePdfOnWhatsApp بيتسجل هنا (المصدر الوحيد لإرسال
   الواتساب في النظام — التنبيهات المركزية وتبويب المتابعة وغيرها،
   فسجل واحد بيلقطهم كلهم). تخزين محلي بحد 200 حركة.
   تأكيد الاستلام (#6): بعد الإرسال، مسؤول يقدر يوثّق على الحركة
   «مين استلم» + ملاحظة — بيتخزن مع الحركة وتظهر في سجل ال🕘. */
const WA_HIST_KEY = 'yahma-wa-history-v1';
function currentSenderName(){
  try{
    if (typeof currentUserName !== 'undefined' && currentUserName && currentUserName.trim()) return currentUserName.trim();
    const last = localStorage.getItem('yahma_last_user_name');
    if (last && last.trim()) return last.trim();
  }catch(_){}
  return '';
}
function readWaHistory(){
  try{ const l=JSON.parse(localStorage.getItem(WA_HIST_KEY)||'[]'); return Array.isArray(l)?l:[]; }catch(_){ return []; }
}
function writeWaHistory(list){
  try{ localStorage.setItem(WA_HIST_KEY, JSON.stringify(list)); }catch(_){yahmaErr(_,'pdf-share.js:writeWaHistory');}
}
function recordWaHistory(entry){
  try{
    const list=readWaHistory();
    list.unshift({
      at: new Date().toISOString(),
      title: String(entry.title||''),
      count: entry.rowsCount||0,
      phone: String(entry.phone||''),
      pdfOk: !!entry.pdfOk,
      by: String(entry.by||''),
      confirmedBy: '', confirmedAt: null, confirmedNote: ''
    });
    if(list.length>200) list=list.slice(0,200);
    writeWaHistory(list);
  }catch(_){yahmaErr(_,'pdf-share.js:recordWaHistory');}
}
window.YahmaWAHistoryLog={
  list: readWaHistory,
  clear: function(){ try{ localStorage.removeItem(WA_HIST_KEY); }catch(_){} },
  /* توثيق الاستلام: at = مفتاح الحركة (وقت الإرسال ISO) */
  confirm: function(atIso, patch){
    const list=readWaHistory();
    const e=list.find(r=>r && r.at===atIso);
    if(!e) return false;
    e.confirmedBy=String((patch&&patch.by)||'').trim();
    e.confirmedAt=(patch&&patch.at)||new Date().toISOString();
    e.confirmedNote=String((patch&&patch.note)||'').trim();
    writeWaHistory(list);
    return true;
  },
  /* إلغاء توثيق الاستلام (لو اتكتب بالغلط) */
  unconfirm: function(atIso){
    const list=readWaHistory();
    const e=list.find(r=>r && r.at===atIso);
    if(!e) return false;
    e.confirmedBy=''; e.confirmedAt=null; e.confirmedNote='';
    writeWaHistory(list);
    return true;
  }
};

async function sharePdfOnWhatsApp(opts){
  const title=opts.title||'تقرير الأسطول';
  const headers=opts.headers||[];
  const rows=opts.rows||[];
  const subtitle=opts.subtitle||'';
  const phone=(opts.phone||'').trim();
  const caption=opts.caption||('مرفق: '+title);
  const filename=((opts.filename||title)+'').replace(/[\\/:*?"<>|]+/g,'_')+'.pdf';
  /* بيتسجل مرة واحدة قبل العودة من أي مسار ناجح */
  const histEntry={ title: title, rowsCount: rows.length, phone: phone, by: currentSenderName() };

  const loading=document.createElement('div');
  loading.style.cssText='position:fixed;inset:0;background:rgba(13,24,54,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Tahoma,Arial,sans-serif;font-size:16px;font-weight:700';
  loading.innerHTML='<div style="background:#1F3C88;padding:18px 28px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)">جارِ تجهيز ملف PDF...</div>';
  document.body.appendChild(loading);

  let pdfOk=false;
  try{
    const blob=await generateReportPdfBlob(title, headers, rows, subtitle);
    downloadBlob(blob, filename);
    pdfOk=true;

    // مشاركة مباشرة على الموبايل إن أمكن
    try{
      const file=new File([blob], filename, {type:'application/pdf'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        loading.remove();
        await navigator.share({files:[file], title:title, text:caption});
        recordWaHistory(Object.assign({}, histEntry, { pdfOk:true }));
        return;
      }
    }catch(shareErr){
      if(shareErr && shareErr.name==='AbortError'){ loading.remove(); return; }
      console.warn(shareErr);
    }
  }catch(e){
    console.error('PDF error', e);
    pdfOk=false;
    // fallback: نافذة طباعة/حفظ PDF
    try{
      if(typeof openPrintWindow==='function'){
        openPrintWindow(title, subtitle, headers, rows, 'استخدم حفظ كـ PDF من نافذة الطباعة');
      }
    }catch(_){yahmaErr(_,'pdf-share.js:231');}
  }finally{
    loading.remove();
  }

  const msg = pdfOk
    ? (caption+'\n\nتم تنزيل الملف: '+filename+'\nأرفقه من مجلد التنزيلات 📎')
    : ((opts.fallbackText||caption)+'\n\n(تعذر إنشاء PDF تلقائيًا — استخدم نافذة الطباعة إن ظهرت)');

  recordWaHistory(Object.assign({}, histEntry, { pdfOk: pdfOk }));

  // افتح واتساب دائمًا (بعد التنزيل)
  setTimeout(()=>{
    try{ shareOnWhatsApp(msg, phone||null); }
    catch(e){ console.error(e); alert('تعذر فتح واتساب. انسخ الرسالة يدويًا.'); }
  }, pdfOk?400:200);

  if(pdfOk){
    setTimeout(()=>{
      alert('تم تنزيل PDF.\nافتح واتساب وأرفق الملف من التنزيلات (📎).');
    }, 600);
  }else{
    alert('تعذر إنشاء PDF تلقائيًا.\nسيُفتح واتساب بالنص، ويمكنك استخدام نافذة الطباعة لحفظ PDF.');
  }
}
function carsToInspRows(cars){
  return window.YahmaRenewals.carsToInspectionRows(cars, {inspectionDisplayStatus, licenseDisplayStatus, formatDate: fmtDate});
}
function carsToCardRows(cars){
  return (cars||[]).map(c=>[
    c.plate||'—', c.brand||'—', c.branch||'—', c.cardNumber||'—', c.carStatus||'—',
    cardDisplayStatus(c.cardExpiry,c.cardStatus).label,
    fmtDate(c.cardExpiry),
    textTag(c.insuranceStatus).label
  ]);
}

function shareOnWhatsApp(text, phone){
  const msg=encodeURIComponent(text);
  // لو رقم موجود: wa.me/2010xxxxxxx بدون + أو أصفار زائدة للدولة
  let url;
  if(phone){
    const num=String(phone).replace(/[^0-9]/g,'');
    url='https://wa.me/'+num+'?text='+msg;
  }else{
    url='https://wa.me/?text='+msg;
  }
  window.open(url,'_blank');
}
function shareUninspectedWhatsApp(){
  const cars=getUninspectedCars();
  if(!cars.length){
    if(!confirm('لا توجد سيارات غير مفحوصة. هل تريد إرسال تقرير فارغ؟')) return;
  }
  const phone=prompt('رقم واتساب المستلم (اختياري)\nمثال: 2010xxxxxxxx\nاتركه فارغًا لاختيار جهة الاتصال من واتساب:','')||'';
  const headers=['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','حالة الفحص','حالة الرخصة','انتهاء الرخصة'];
  sharePdfOnWhatsApp({
    title:'تقرير السيارات غير المفحوصة',
    subtitle:'إجمالي: '+cars.length+' سيارة',
    headers,
    rows:carsToInspRows(cars),
    phone:phone.trim(),
    filename:'غير-مفحوصة-'+todayStr(),
    caption:'📋 تقرير السيارات غير المفحوصة ('+cars.length+' سيارة) — مرفق PDF',
    fallbackText:buildInspectionWhatsAppMessage(cars)
  });
}
function copyUninspectedList(){
  const text=buildInspectionWhatsAppMessage(getUninspectedCars());
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>alert('تم نسخ القائمة. يمكنك لصقها في واتساب.')).catch(()=>prompt('انسخ النص يدويًا:', text));
  }else{
    prompt('انسخ النص يدويًا:', text);
  }
}

function renderRenewals(content,mode){ return window.YahmaRenewals.render(content,mode); }

function renderFollowUp(content){ return window.YahmaFollowUp.render(content); }


function openModal(id){
  return window.YahmaVehicleModal.open(id, {
    fleet,
    setEditingId: value => { editingId = value; },
    normalizeDateValue,
    prepChecklistForCar,
    prepStatusForCar,
    escapeHtml
  });
}

function closeModal(){ document.getElementById('overlay').style.display = 'none'; editingId = null; }

document.getElementById('btn-clear-all').addEventListener('click', async ()=>{
  if(window.currentRole!=='admin'){ alert('الأرشفة الجماعية متاحة للمدير فقط.'); return; }
  if(!confirm('سيتم أرشفة كل السيارات بدل حذفها نهائيًا. يمكن استعادتها لاحقًا. متابعة؟')) return;
  fleet.forEach(c=>{c.carStatus='مؤرشفة';c.archivedAt=new Date().toISOString();});
  await saveData();
  log('أرشفة جماعية','عدد السيارات: '+fleet.length);
  render();
  alert('تمت أرشفة كل السيارات ويمكن استعادتها بتغيير الحالة إلى نشط.');
});

document.getElementById('btn-add-car').addEventListener('click', ()=> openModal(null));
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });

document.getElementById('btn-save').addEventListener('click', ()=>window.YahmaVehicleOperations.saveFromForm({
  fleet,
  getEditingId: () => editingId,
  todayStr,
  uid,
  saveData,
  supabaseReady: window.supabaseReady,
  notifyYahmaEvent: window.notifyYahmaEvent,
  log,
  closeModal,
  render,
  saveButton: document.getElementById('btn-save'),
  alert: message => alert(message)
}));

document.getElementById('btn-delete').addEventListener('click', ()=>window.YahmaVehicleOperations.archiveEditing({
  fleet,
  getEditingId: () => editingId,
  currentRole: window.currentRole,
  userEmail: window.currentUser&&window.currentUser.email,
  deleteButton: document.getElementById('btn-delete'),
  confirm: message => confirm(message),
  saveData,
  log,
  closeModal,
  render,
  alert: message => alert(message)
}));

document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    if(!window.canAccessYahmaTab(item.dataset.tab)){
      /* بدل ما نتجاهل بصمت: نقول للمستخدم ليه القسم مش متاح */
      try{ window.alert('هذا القسم غير متاح لحسابك. كلّم المدير لتفعيله.'); }catch(_){yahmaErr(_,'pdf-share.js:370');}
      return;
    }
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    const nextTab = item.dataset.tab;
    currentTab = nextTab;
    try{ render(); }
    catch(e){
      console.error('tab render failed',e);
      renderEmergencyFleet(document.getElementById('content'));
      try{ window.alert('تعذر فتح القسم: '+(e&&e.message||'خطأ غير متوقع')); }catch(_){yahmaErr(_,'pdf-share.js:381');}
    }
    /* تأكيد بصري إن التبويب اتغيّر فعلًا — يمنع شك المستخدم في إن الضغط اشتغل */
    setTimeout(function(){
      if(typeof currentTab !== 'undefined' && currentTab !== nextTab){
        try{ currentTab = nextTab; render(); }catch(_){yahmaErr(_,'pdf-share.js:386');}
      }
      document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.tab===nextTab));
    }, 0);
  });
});

/* ---------- Excel import / export ---------- */
const EXCEL_HEADERS = window.YahmaFleetExcel.EXCEL_HEADERS;
const FIELD_ALIASES = window.YahmaFleetExcel.FIELD_ALIASES;
