(function(global){
  'use strict';

  /* رقم البطاقة: البيانات أحيانًا بتيجي ناقصة أو من غير بادئة 14-
     (مثال: «14-00601234» أو «601234»)، فبنوحّدها للعرض فقط. */
  function fmtCardNumber(raw){
    const s=String(raw==null?'':raw).trim();
    if(!s) return '—';
    /* لو مسبوق ببادئة 14- أو ١٤- نخليها زي ما هي */
    if(/^1٤?[-–—]\s*/.test(s)) return s;
    const digits=s.replace(/\D+/g,'');
    if(!digits) return s;
    return '14-'+digits;
  }
  /* متاح لكل التبويبات (الأسطول/الفروع/ملف السيارة) */
  window.fmtCardNumber = fmtCardNumber;

function renderFollowUp(content){
  /* الشريط نفسه ≠ زر الحذف. كان الاتنين نفس الشرط. */
  const canBulk=(typeof window.YahmaPerms==='object') ? window.YahmaPerms.canBulk() : !(typeof currentRole!=='undefined'&&currentRole==='view');
  /* الحذف للمدير بس — مطابق لـ yahma_is_admin() في القاعدة. */
  const canDelete=(typeof window.YahmaPerms==='object') ? window.YahmaPerms.canDelete() : currentRole==='admin';
  document.getElementById('topbar-title').textContent = 'بطاقات التشغيل';
  document.getElementById('topbar-sub').textContent = 'متابعة بطاقات التشغيل (الكارت) ومواعيد التجديد';
  const uniq=(field)=>{
    const map=new Map();
    fleet.forEach(c=>{
      const raw=String(c[field]??'').trim();
      if(!raw) return;
      const canon=(field==='brand'&&typeof canonicalBrand==='function')?canonicalBrand(raw):raw;
      const key=canon.replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');
      if(!map.has(key)) map.set(key, canon);
    });
    return [...map.values()].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true}));
  };
  const optionList=(items,placeholder)=>`<option value="">${placeholder}</option>${items.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}`;
  const needCard=typeof fleetForTab==='function'?fleetForTab('inspections', fleet).length:fleet.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level==='red').length;
  const needIns=fleet.filter(c=>textTag(c.insuranceStatus).level==='red').length;
  const goodCard=fleet.length-needCard;
  const goodIns=fleet.length-needIns;
  content.innerHTML = `
    <div class="fleet-summary-strip module-summary-strip" aria-label="ملخص بطاقات التشغيل والتأمين">
      <button type="button" class="fleet-summary-card attention" data-fq="card_bad"><span class="fleet-summary-icon">!</span><span><b>${needCard}</b><small>كروت منتهية</small></span></button>
      <button type="button" class="fleet-summary-card ready" data-fq="card_ok"><span class="fleet-summary-icon">✓</span><span><b>${goodCard}</b><small>كارت ساري</small></span></button>
      <button type="button" class="fleet-summary-card out" data-fq="ins_bad"><span class="fleet-summary-icon">!</span><span><b>${needIns}</b><small>تأمين منتهي</small></span></button>
      <button type="button" class="fleet-summary-card total" data-fq="ins_ok"><span class="fleet-summary-icon">✓</span><span><b>${goodIns}</b><small>تأمين ساري</small></span></button>
    </div>
    <div class="wa-toolbar">
      <div class="wa-toolbar-info">
        <strong>كروت منتهية:</strong> <span class="wa-count">${needCard}</span>
        &nbsp;|&nbsp;
        <strong>تأمين منتهي:</strong> <span class="wa-count">${needIns}</span>
      </div>
      <div class="wa-toolbar-actions">
        <button class="btn btn-whatsapp" id="btn-wa-card" type="button">واتساب — الكارت</button>
        <button class="btn btn-whatsapp" id="btn-wa-ins" type="button" title="تقرير التأمين غير الساري عبر واتساب">واتساب — التأمين</button>
        <button class="btn btn-ghost btn-small" id="btn-copy-card" type="button">📋 نسخ قائمة الكارت</button>
        <button class="btn btn-ghost btn-small" id="ren-export-xlsx">📥 تصدير Excel</button>
        <button class="btn btn-ghost btn-small" id="ren-export-pdf">📄 تصدير PDF</button>
        <button class="btn btn-primary btn-small" id="fu-upload-btn" title="رفع شيت الكروت — يحدّث بيانات الكارت فقط">📥 رفع شيت الكروت</button>
        <input type="file" id="file-fu-upload" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
    </div>
    <div class="filter-panel">
      <div class="filter-panel-title"><div><strong>🔎 فلاتر الكارت والتأمين</strong><span>صفِّ النتائج حسب أي بند — ثم صدّر Excel أو PDF</span></div><button type="button" class="btn btn-ghost btn-small fleet-filter-toggle fu-filter-toggle" id="fu-filter-toggle" aria-expanded="false">إظهار الفلاتر <span aria-hidden="true">⌄</span></button></div>
    ${needCard > 10 ? `<div style="display:flex;justify-content:flex-end;margin:6px 0"><button type="button" id="fu-expiry-alert" title="تنبيه: ${needCard} سيارة بحاجة فحص فورًا — مسؤولية مشرف الفرع" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;background:rgba(211,47,47,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(211,47,47,0.28);color:#d32f2f;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(211,47,47,0.12)"><span style="font-size:14px">⚠️</span><span>${needCard}</span></button></div>` : ''}
      <div class="filter-panel-body" id="fu-filter-body">
      <div class="quick-filters" id="fu-quick">
        <button type="button" class="quick-filter" data-fq="card_bad">🪪 كارت يحتاج متابعة</button>
        <button type="button" class="quick-filter" data-fq="card_ok">✅ كارت ساري</button>
        <button type="button" class="quick-filter" data-fq="card_expired">🔴 كارت منتهي</button>
        <button type="button" class="quick-filter" data-fq="card_soon">🟡 كارت قريب</button>
        <button type="button" class="quick-filter" data-fq="active">🟢 سيارة نشطة</button>
        <button type="button" class="quick-filter" data-fq="maintenance">🔧 تحت الصيانة</button>
        <button type="button" class="quick-filter" data-fq="out">⛔ خارج الخدمة</button>
      </div>
      <div class="fleet-filter-grid">
        <label>بحث<input id="fu-search" placeholder="لوحة، مالك، فرع، رقم كارت، ملاحظة..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
        <label>الفرع<select id="fu-branch">${optionList(uniq('branch'),'كل الفروع')}</select></label>
        <label>حالة السيارة<select id="fu-car-status"><option value="">كل الحالات</option><option>تحت الصيانة</option><option>حجز</option><option>متاحة للايجار</option><option>محولة غير مستلمة</option><option>مسروقة</option><option>للبيع</option><option>مؤجرة</option><option>خدمة</option><option>مفقودة</option></select></label>
        <label>المالك<select id="fu-owner">${optionList(uniq('owner'),'كل الملاك')}</select></label>
        <label>الماركة<select id="fu-brand">${optionList(uniq('brand'),'كل الماركات')}</select></label>
        <label>الموديل (السنة)<select id="fu-model">${optionList(uniq('model'),'كل الموديلات')}</select></label>
        <label>حالة الكارت (سجل)<select id="fu-card-status"><option value="">كل الحالات</option><option>نشط</option><option>ملغى</option><option>موقوف</option></select></label>
        <label>صلاحية الكارت<select id="fu-card-condition"><option value="">كل الحالات</option><option value="green">ساري</option><option value="amber">قريب الانتهاء</option><option value="red">منتهي / ملغى</option><option value="grey">غير محدد</option></select></label>
        <label>تنتهي البطاقة خلال<select id="fu-card-exp-month"><option value="">كل الشهور</option></select></label>
      </div>
      <div class="filter-footer">
        <span id="fu-filter-count">عرض 0 من ${fleet.length}</span>
        <button class="btn btn-ghost btn-small" id="fu-clear">↺ مسح الفلاتر</button>
        <button class="btn btn-ghost btn-small" id="btn-scan-console" title="وضع المسح الشامل — شاشة الرادار والمؤشر للفرع">🛰 وضع المسح الشامل</button>
      </div>
      </div>
    </div>
    ${canBulk?`<div class="bulk-bar" id="fu-bulk-bar" style="display:none">
      <div class="bulk-bar-info"><span id="fu-bulk-count">0 محددة</span></div>
      <div class="bulk-bar-actions">
        <button class="btn btn-primary btn-small" id="fu-bulk-card-renew">🪪 تجديد الكارت (سنة)</button>
        <button class="btn btn-ghost btn-small" id="fu-bulk-card-status">ضبط حالة الكارت</button>
        <button class="btn btn-ghost btn-small" id="fu-bulk-ins-ok">🛡️ تأمين «ساري»</button>
        <button class="btn btn-danger btn-small" id="fu-bulk-delete">🗑 حذف المحددة</button>
        <button class="btn btn-ghost btn-small" id="fu-bulk-clear">إلغاء التحديد</button>
      </div>
    </div>`:''}
    <div class="table-scroll" style="max-height:calc(100vh - 320px)">
      <table class="fleet-table" style="min-width:1600px">
        <thead><tr>
          ${canBulk?'<th class="th-check"><input type="checkbox" id="fu-head-check" aria-label="تحديد الكل"></th>':''}
          <th>رقم اللوحة</th>
          <th>الماركة</th>
          <th>النوع</th>
          <th>الموديل</th>
          <th>اللون</th>
          <th>المدينة</th>
          <th>الرقم التسلسلي</th>
          <th>رقم البطاقة</th>
          <th>تاريخ نهاية البطاقة</th>
          <th>حالة البطاقة</th>
          <th>الفرع</th>
          <th>حالة السيارة</th>
          <th>ملاحظات</th>
          <th>إجراء</th>
        </tr></thead>
        <tbody id="fu-tbody"></tbody>
      </table>
    </div>
    <div class="pager" id="fu-pager">
      <div class="pager-info" id="fu-pager-info">—</div>
      <div class="pager-controls">
        <button class="btn btn-ghost btn-small" id="fu-pager-prev">‹</button>
        <div class="pager-pages" id="fu-pager-pages"></div>
        <button class="btn btn-ghost btn-small" id="fu-pager-next">›</button>
      </div>
      <label class="pager-size">عرض
        <select id="fu-pager-size">
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="100">100 (حد أقصى سلس)</option>
        </select>
      </label>
    </div>
  `;

  function buildCardWAMessage(){
    const list=fleet.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green')
      .sort((a,b)=> (daysFromNow(a.cardExpiry)??9999)-(daysFromNow(b.cardExpiry)??9999));
    const lines=['🪪 *مطلوب الفحص في أسرع وقت — مسؤولية مشرف الفرع*', 'التاريخ: '+fmtDate(new Date()), 'العدد: *'+list.length+'* سيارة (منتهي كارت)', '————————————'];
    if(!list.length) lines.push('✅ لا توجد كروت تحتاج متابعة.');
    else list.forEach((c,i)=>{
      const st=cardDisplayStatus(c.cardExpiry,c.cardStatus);
      lines.push((i+1)+') '+(c.plate||'—'));
      lines.push('   الكارت: '+st.label+(c.cardExpiry?' | ينتهي: '+fmtDate(c.cardExpiry):'')+' | الفرع: '+(c.branch||'—'));
    });
    lines.push('————————————','مرسل من نظام إدارة الأسطول');
    return lines.join('\n');
  }
  function buildInsWAMessage(){
    const list=fleet.filter(c=>textTag(c.insuranceStatus).level!=='green');
    const lines=['🛡️ *تقرير التأمين غير الساري*', 'التاريخ: '+fmtDate(new Date()), 'العدد: *'+list.length+'* سيارة', '————————————'];
    if(!list.length) lines.push('✅ كل السيارات تأمينها ساري.');
    else list.forEach((c,i)=>{
      const st=textTag(c.insuranceStatus);
      lines.push((i+1)+') '+(c.plate||'—')+' — التأمين: '+st.label+' | الفرع: '+(c.branch||'—'));
    });
    lines.push('————————————','مرسل من نظام إدارة الأسطول');
    return lines.join('\n');
  }
  document.getElementById('btn-wa-card')?.addEventListener('click',()=>{
    const phone=prompt('رقم واتساب المستلم (اختياري)\nمثال: 2010xxxxxxxx\nاتركه فارغًا لاختيار جهة الاتصال:','')||'';
    const list=fleet.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green')
      .sort((a,b)=> (daysFromNow(a.cardExpiry)??9999)-(daysFromNow(b.cardExpiry)??9999));
    sharePdfOnWhatsApp({
      title:'تقرير الكروت التي تحتاج متابعة',
      subtitle:'إجمالي: '+list.length+' سيارة',
      headers:['رقم اللوحة','الماركة','الفرع','رقم الكارت','حالة السيارة','حالة الكارت','انتهاء الكارت','التأمين'],
      rows:carsToCardRows(list),
      phone:phone.trim(),
      filename:'كروت-'+todayStr(),
      caption:'🪪 تقرير الكروت ('+list.length+') — مرفق PDF',
      fallbackText:buildCardWAMessage()
    });
  });
  document.getElementById('btn-wa-ins')?.addEventListener('click',()=>{
    const phone=prompt('رقم واتساب المستلم (اختياري)\nمثال: 2010xxxxxxxx\nاتركه فارغًا لاختيار جهة الاتصال:','')||'';
    const list=fleet.filter(c=>textTag(c.insuranceStatus).level!=='green');
    sharePdfOnWhatsApp({
      title:'تقرير التأمين غير الساري',
      subtitle:'إجمالي: '+list.length+' سيارة',
      headers:['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','التأمين'],
      rows:list.map(c=>[c.plate||'—',c.brand||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',textTag(c.insuranceStatus).label]),
      phone:phone.trim(),
      filename:'تأمين-'+todayStr(),
      caption:'🛡️ تقرير التأمين ('+list.length+') — مرفق PDF',
      fallbackText:buildInsWAMessage()
    });
  });
  document.getElementById('btn-copy-card')?.addEventListener('click',()=>{
    const text=buildCardWAMessage();
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(()=>alert('تم نسخ قائمة الكارت')).catch(()=>prompt('انسخ:',text));
    else prompt('انسخ:',text);
  });

  const $=id=>document.getElementById(id);
  let activeFQ='', page=1, pageSize=25;
  const selectedFuIds=new Set();
  const rank={red:0,amber:1,grey:2,green:3};
  const val=id=>($(id)?.value||'').trim();
  const norm=s=>String(s??'').trim();
  const eq=(a,b)=>norm(a).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا')===norm(b).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');

  function getRows(){
    const q=val('fu-search').toLowerCase();
    return fleet.filter(c=>{
      if(q){
        const hay=[c.plate,c.brand,c.model,c.owner,c.branch,c.carStatus,c.cardNumber,c.cardStatus,c.insuranceStatus,c.notes].map(v=>String(v||'').toLowerCase()).join(' ');
        if(!hay.includes(q)) return false;
      }
      if(val('fu-branch') && !eq(c.branch,val('fu-branch'))) return false;
      if(val('fu-owner') && !eq(c.owner,val('fu-owner'))) return false;
      if(val('fu-brand') && (typeof canonicalBrand==='function'?canonicalBrand(c.brand)!==val('fu-brand'):!eq(c.brand,val('fu-brand')))) return false;
      if(val('fu-model') && !eq(c.model,val('fu-model'))) return false;
      if(val('fu-car-status') && !carStatusMatch(c.carStatus,val('fu-car-status'))) return false;
      if(val('fu-card-status')){
        const want=val('fu-card-status'), raw=norm(c.cardStatus);
        if(want.includes('ملغ') && !raw.includes('ملغ')) return false;
        else if(want.includes('موقوف') && !raw.includes('موقوف')) return false;
        else if(want==='نشط' && (raw.includes('ملغ')||raw.includes('موقوف'))) return false;
      }
      if(!activeFQ && !val('fu-card-condition') && !val('fu-card-status') && !q){
        const lvl = cardDisplayStatus(c.cardExpiry,c.cardStatus).level;
        const raw = norm(c.cardStatus);
        /* افتراضيًا: المنتهي + الملغي + اللي بدون تاريخ، مش بس الأحمر */
        if(lvl === 'green' && !raw.includes('ملغ') && !raw.includes('موقوف')) return false;
      }
      if(val('fu-card-condition') && cardDisplayStatus(c.cardExpiry,c.cardStatus).level!==val('fu-card-condition')) return false;
      /* فلتر انتهاء البطاقة خلال شهر محدد (yyyy-mm) */
      if(val('fu-card-exp-month') && String(c.cardExpiry||'').slice(0,7)!==val('fu-card-exp-month')) return false;
      if(activeFQ){
        const card=cardDisplayStatus(c.cardExpiry,c.cardStatus).level;
        const ins=textTag(c.insuranceStatus).level;
        const st=norm(c.carStatus);
        if(activeFQ==='card_bad' && card==='green') return false;
        if(activeFQ==='card_ok' && card!=='green') return false;
        if(activeFQ==='card_expired' && card!=='red') return false;
        if(activeFQ==='card_soon' && card!=='amber') return false;
        if(activeFQ==='ins_bad' && ins==='green') return false;
        if(activeFQ==='ins_ok' && ins!=='green') return false;
        if(activeFQ==='active' && !carStatusMatch(st,'متاحة للايجار')) return false;
        if(activeFQ==='maintenance' && !st.includes('صيانة')) return false;
        if(activeFQ==='out' && !carStatusOut(st)) return false;
      }
      return true;
    }).sort((a,b)=>{
      const av=Math.min(rank[cardDisplayStatus(a.cardExpiry,a.cardStatus).level], rank[textTag(a.insuranceStatus).level]);
      const bv=Math.min(rank[cardDisplayStatus(b.cardExpiry,b.cardStatus).level], rank[textTag(b.insuranceStatus).level]);
      return av-bv;
    });
  }
  window._yahmaCurrentPdfData=()=>({title:'بطاقات التشغيل والتأمين المفلترة',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','اللون','المدينة','الرقم التسلسلي','رقم البطاقة','انتهاء البطاقة','حالة البطاقة','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.color||'—',c.city||'—',c.serial||'—',fmtCardNumber(c.cardNumber),c.cardExpiry||'—',cardDisplayStatus(c.cardExpiry,c.cardStatus).label||'—',c.branch||'—',textTag(c.carStatus).label||'—'])});

  /* تحديد جماعي + حذف (إداريون فقط) */
  function updateFuBulkBar(){
    const bar=$('fu-bulk-bar'); if(!bar) return;
    const n=selectedFuIds.size;
    bar.style.display=n?'':'none';
    const cnt=$('fu-bulk-count'); if(cnt) cnt.textContent=n+' محددة';
    const allRows = getRows();
    const head=$('fu-head-check');
    if(head){
      const allSelected = allRows.length > 0 && allRows.every(c => selectedFuIds.has(String(c.id)));
      head.checked = allSelected;
      head.indeterminate = selectedFuIds.size > 0 && !allSelected;
    }
  }
  function wireFuChecks(){
    const tbody=$('fu-tbody'); if(!tbody) return;
    tbody.querySelectorAll('.row-check').forEach(cb=>{
      cb.checked=selectedFuIds.has(cb.dataset.id);
      cb.onchange=()=>{ if(cb.checked) selectedFuIds.add(cb.dataset.id); else selectedFuIds.delete(cb.dataset.id); updateFuBulkBar(); };
    });
    const head=$('fu-head-check');
    if(head && !head._bound){
      head._bound=true;
      head.onchange=()=>{
        const allRows = getRows();
        if(head.checked) {
          allRows.forEach(c => selectedFuIds.add(String(c.id)));
        } else {
          selectedFuIds.clear();
        }
        wireFuChecks(); updateFuBulkBar();
      };
    }
    updateFuBulkBar();
  }
  async function deleteFuCars(ids){
    const cars=ids.map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
    if(!cars.length) return;
    if(!confirm('حذف '+cars.length+' سيارة نهائيًا من الأسطول؟\n'+cars.slice(0,8).map(c=>c.plate).join('، ')+(cars.length>8?'…':''))) return;
    cars.forEach(c=>selectedFuIds.delete(String(c.id)));
    await removeSoldVehiclesByPlates(cars.map(c=>c.plate),{skipConfirm:true,silent:true});
    render();
  }
  /* ===== تعديل جماعي: الكارت + التأمين (إداريون فقط) ===== */
  function fuSelectedCars(){
    return [...selectedFuIds].map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
  }
  function fuPlates(cars){ return cars.slice(0,8).map(c=>c.plate||'—').join('، ')+(cars.length>8?'…':''); }
  async function fuBulkApply(cars, mutate, doneMsg, logLabel){
    if(!cars.length) return;
    cars.forEach(mutate);
    let ok=true;
    try{ ok=await saveData(cars.map(c=>c.id)); }catch(_){ ok=false; }
    cars.forEach(c=>selectedFuIds.delete(String(c.id)));
    if(ok===false) alert('تعذر الحفظ على بعض السيارات — تحقق من الاتصال ثم أعد المحاولة.');
    else alert(doneMsg);
    if(logLabel && typeof window.log==='function'){
      try{ window.log(logLabel, cars.length+' سيارة: '+fuPlates(cars)); }catch(_){yahmaErr(_,'follow-up-ui.js:300');}
    }
    render();
  }
  async function bulkRenewCard(){
    const cars=fuSelectedCars();
    if(!cars.length) return;
    const raw=prompt('تاريخ انتهاء الكارت الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', addDays(todayStr(),365));
    if(!raw) return;
    const val=normalizeDateValue(raw)||raw;
    if(!confirm('ضبط انتهاء الكارت على '+val+' لـ '+cars.length+' سيارة؟\n'+fuPlates(cars))) return;
    await fuBulkApply(cars, c=>{ c.cardExpiry=val; if(!c.cardStatus||String(c.cardStatus).includes('ملغ')||String(c.cardStatus).includes('موقوف')) c.cardStatus='نشط'; },
      'تم تجديد كارت '+cars.length+' سيارة (انتهاء '+val+')', 'تجديد كروت جماعي');
  }
  async function bulkSetCardStatus(){
    const cars=fuSelectedCars();
    if(!cars.length) return;
    const raw=prompt('حالة الكارت الجديدة ('+cars.length+' سيارة):\nنشط / ملغى / موقوف','نشط');
    if(!raw) return;
    const val=raw.trim();
    if(!['نشط','ملغى','موقوف'].includes(val)){ alert('القيمة يجب أن تكون: نشط أو ملغى أو موقوف'); return; }
    if(!confirm('تعيين حالة الكارت «'+val+'» لـ '+cars.length+' سيارة؟\n'+fuPlates(cars))) return;
    await fuBulkApply(cars, c=>{ c.cardStatus=val; }, 'تم تحديث حالة كارت '+cars.length+' سيارة', 'تحديث كروت جماعي');
  }
  async function bulkSetInsurance(){
    const cars=fuSelectedCars();
    if(!cars.length) return;
    if(!confirm('تعيين التأمين «ساري» لـ '+cars.length+' سيارة؟\n'+fuPlates(cars))) return;
    await fuBulkApply(cars, c=>{ c.insuranceStatus='ساري'; }, 'تم تحديث تأمين '+cars.length+' سيارة', 'تحديث تأمين جماعي');
  }
  function draw(){
    const all=getRows();
    const total=all.length;
    const size=pageSize>0?pageSize:total||1;
    const pages=Math.max(1,Math.ceil((total||1)/size));
    if(page>pages) page=pages;
    if(page<1) page=1;
    const startIdx=(page-1)*size;
    const rows=pageSize>0?all.slice(startIdx,startIdx+size):all;
    const tbody=$('fu-tbody');
    (function(){
      const scrollEl = tbody.closest('.table-scroll') || tbody.parentElement;
      function renderFuRow(c){
        const card=cardDisplayStatus(c.cardExpiry,c.cardStatus);
        const carTag=textTag(c.carStatus);
        const noteEditable=!(typeof currentRole!=='undefined'&&currentRole==='view');
        return `<tr data-id="${escapeHtml(c.id)}">
        ${canBulk?`<td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" aria-label="تحديد السيارة ${escapeHtml(c.plate||'—')}"></td>`:''}
        <td class="plate">${escapeHtml(c.plate||'—')}</td>
        <td>${escapeHtml(c.brand||'—')}</td>
        <td>${escapeHtml(c.type||'—')}</td>
        <td>${escapeHtml(c.model||'—')}</td>
        <td>${escapeHtml(c.color||'—')}</td>
        <td>${escapeHtml(c.city||'—')}</td>
        <td class="serial-cell">${escapeHtml(c.serial||'—')}</td>
        <td>${escapeHtml(fmtCardNumber(c.cardNumber))}</td>
        <td>${fmtDate(c.cardExpiry)}</td>
        <td><span class="tag ${card.level}">${escapeHtml(card.label)}</span></td>
        <td>${escapeHtml(c.branch||'—')}</td>
        <td><span class="tag ${carTag.level}">${escapeHtml(carTag.label)}</span></td>
        <td><input class="fu-note-input" data-note-id="${escapeHtml(c.id)}" value="${escapeHtml(c.notes||'')}" placeholder="اكتب ملاحظة…" aria-label="ملاحظات السيارة ${escapeHtml(c.plate||'—')}"${noteEditable?'':' readonly'}></td>
        <td>
          <button class="btn btn-ghost btn-small" data-renew="${escapeHtml(c.id)}">تجديد الكارت</button>
          <button class="btn btn-ghost btn-small" data-edit="${escapeHtml(c.id)}">تعديل</button>
          ${canDelete?`<button class="btn btn-danger btn-small" data-del-car="${escapeHtml(c.id)}" title="حذف السيارة">🗑</button>`:''}
        </td>
      </tr>`;
      }
      const delCol=canDelete?1:0;
      if(window.YahmaVTable && scrollEl){
        if(!window._fuVT || window._fuVT._tb !== tbody){
          if(window._fuVT && window._fuVT.destroy) try{window._fuVT.destroy()}catch(e){yahmaErr(e,'follow-up-ui.js:371');}
          window._fuVT = window.YahmaVTable.create({
            scrollEl: scrollEl, tbody: tbody, rowHeight: 52, overscan: 10, threshold: 30, colCount: 16+delCol,
            renderRow: function(c){ return renderFuRow(c); },
            emptyHtml: '<tr><td colspan="'+(15+delCol)+'"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>'
          });
          window._fuVT._tb = tbody;
        }
        window._fuVT.setItems(rows, true);
      } else {
        tbody.innerHTML=rows.length?rows.map(renderFuRow).join(''):`<tr><td colspan="${12+delCol}"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>`;
      }
      wireFuChecks();
      // تفويض حفظ الملاحظات مرة واحدة (متوافق مع Virtualization)
      if(!tbody._fuNoteDelegate){
        tbody._fuNoteDelegate = true;
        tbody.addEventListener('change', async function(e){
          const inp = e.target.closest ? e.target.closest('input[data-note-id]') : null;
          if(!inp || inp.hasAttribute('readonly')) return;
          const car = fleet.find(c=>String(c.id)===inp.dataset.noteId);
          if(!car) return;
          if(typeof currentRole!=='undefined'&&currentRole==='view'){ alert('ليس لديك صلاحية التعديل.'); inp.value=car.notes||''; return; }
          const v = inp.value.trim();
          if(String(car.notes||'')===v) return;
          car.notes=v;
          inp.classList.add('saving');
          let ok=true;
          try{ if(typeof saveData==='function') ok = await saveData([car.id]); }catch(_){ ok=false; }
          inp.classList.remove('saving');
          if(ok===false){ alert('تعذر الحفظ — تحقق من الاتصال.'); }
          else { try{ if(typeof window.log==='function') window.log('ملاحظة كارت','السيارة '+(car.plate||'')); }catch(_){yahmaErr(_,'follow-up-ui.js:401');} }
        });
      }
      if(!tbody._fuDelegate){
        tbody._fuDelegate = true;
        tbody.addEventListener('click', async function(e){
          const btn = e.target.closest('button[data-renew],button[data-edit],button[data-del-car]');
          if(!btn) return;
          e.stopPropagation();
          if(btn.dataset.delCar){
            if(typeof currentRole!=='undefined'&&currentRole!=='admin'&&currentRole!=='ops'){alert('ليس لديك صلاحية الحذف.');return;}
            const dc=fleet.find(c=>String(c.id)===String(btn.dataset.delCar)); if(!dc) return;
            await deleteFuCars([dc.id]);
            return;
          }
          if(btn.dataset.renew){
            const car=fleet.find(c=>c.id===btn.dataset.renew); if(!car) return;
            const newDate=prompt('أدخل تاريخ انتهاء الكارت الجديد لـ '+car.plate+' (YYYY-MM-DD):', addDays(todayStr(),365));
            if(!newDate) return;
            car.cardExpiry=normalizeDateValue(newDate)||newDate;
            if(!car.cardStatus||String(car.cardStatus).includes('ملغ')||String(car.cardStatus).includes('موقوف')) car.cardStatus='نشط';
            await saveData([car.id]); render();
          } else if(btn.dataset.edit){
            openModal(btn.dataset.edit);
          }
        });
      }
    })();

    $('fu-filter-count').textContent=`عرض ${total} من ${fleet.length}`+(pageSize>0&&total>pageSize?` — صفحة ${page}`:'');
    const info=$('fu-pager-info');
    if(info){
      if(!total) info.textContent='لا نتائج';
      else info.textContent=`عرض ${startIdx+1}–${Math.min(startIdx+rows.length,total)} من ${total}`;
    }
    const pagesEl=$('fu-pager-pages');
    if(pagesEl){
      let ph='';
      const win=5;
      let p0=Math.max(1,page-Math.floor(win/2));
      let p1=Math.min(pages,p0+win-1);
      p0=Math.max(1,p1-win+1);
      for(let p=p0;p<=p1;p++) ph+=`<button class="pager-num ${p===page?'active':''}" data-page="${p}">${p}</button>`;
      pagesEl.innerHTML=ph;
      pagesEl.querySelectorAll('.pager-num').forEach(b=>b.onclick=()=>{page=+b.dataset.page;draw();});
    }
    const prev=$('fu-pager-prev'), next=$('fu-pager-next');
    if(prev) prev.disabled=page<=1;
    if(next) next.disabled=page>=pages;
    document.querySelectorAll('#fu-quick .quick-filter').forEach(b=>b.classList.toggle('active',b.dataset.fq===activeFQ));
    /* خيارات فلتر انتهاء البطاقة — شهور من البيانات الفعلية */
    const msel=$('fu-card-exp-month');
    if(msel){
      const kept=msel.value;
      const months=[...new Set(fleet.map(c=>{const d=String(c.cardExpiry||'');const m=d.match(/^(\d{4}-\d{2})/);return m?m[1]:'';}).filter(Boolean))].sort();
      const names=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      msel.innerHTML='<option value="">كل الشهور</option>'+months.map(ym=>`<option value="${ym}"${ym===kept?' selected':''}>${names[Number(ym.slice(5,7))-1]||ym} ${ym.slice(0,4)}</option>`).join('');
    }
  }

  // زر فتح/قفل الفلاتر (dropdown) — زي الأسطول بالظبط
  const fuFilterToggle = document.getElementById('fu-filter-toggle');
  const fuFilterBody = document.getElementById('fu-filter-body');
  const fuFilterPanel = fuFilterToggle ? fuFilterToggle.closest('.filter-panel') : null;
  const setFuFiltersOpen = (open) => {
    if (!fuFilterPanel || !fuFilterToggle || !fuFilterBody) return;
    fuFilterPanel.classList.toggle('is-open', open);
    fuFilterBody.hidden = !open;
    fuFilterToggle.setAttribute('aria-expanded', String(open));
    const arrow = fuFilterToggle.querySelector('span[aria-hidden]');
    if (arrow) arrow.textContent = open ? '⌃' : '⌄';
    if (fuFilterToggle.firstChild) fuFilterToggle.firstChild.textContent = open ? 'إخفاء الفلاتر ' : 'إظهار الفلاتر ';
    else fuFilterToggle.textContent = open ? 'إخفاء الفلاتر ' : 'إظهار الفلاتر ';
    window._fuFiltersOpen = open;
  };
  if (fuFilterToggle) {
    fuFilterToggle.addEventListener('click', () => setFuFiltersOpen(!window._fuFiltersOpen));
    setFuFiltersOpen(window._fuFiltersOpen === true);
  }
  // الأيقونة الزجاجية للتنبيه — توصّل على فلتر الكارت من غير onclick داخل HTML
  const fuExpiryAlert = document.getElementById('fu-expiry-alert');
  if (fuExpiryAlert) {
    fuExpiryAlert.addEventListener('click', () => {
      const target = document.querySelector('#fu-quick [data-fq="card_bad"]');
      if (target) target.click();
    });
  }
  ['fu-branch','fu-car-status','fu-card-exp-month','fu-owner','fu-brand','fu-model','fu-card-status','fu-card-condition'].forEach(id=>{
    $(id)?.addEventListener('change',()=>{page=1;draw();});
  });
  (function(){let t=null;$('fu-search')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{page=1;draw()},180);});})();
  document.querySelectorAll('#fu-quick .quick-filter, .module-summary-strip [data-fq]').forEach(b=>{
    b.addEventListener('click',()=>{activeFQ=activeFQ===b.dataset.fq?'':b.dataset.fq;page=1;draw();});
  });
  $('fu-clear')?.addEventListener('click',()=>{
    ['fu-search','fu-branch','fu-car-status','fu-card-exp-month','fu-owner','fu-brand','fu-model','fu-card-status','fu-card-condition'].forEach(id=>{if($(id)) $(id).value='';});
    activeFQ=''; selectedFuIds.clear(); page=1; draw();
  });
  $('fu-bulk-delete')?.addEventListener('click',()=>deleteFuCars([...selectedFuIds]));
  $('fu-bulk-card-renew')?.addEventListener('click',bulkRenewCard);
  $('fu-bulk-card-status')?.addEventListener('click',bulkSetCardStatus);
  $('fu-bulk-ins-ok')?.addEventListener('click',bulkSetInsurance);
  $('fu-bulk-clear')?.addEventListener('click',()=>{selectedFuIds.clear();draw();});
  document.getElementById('btn-scan-console')?.addEventListener('click',()=>{
    if (window.YahmaScanConsole && typeof window.YahmaScanConsole.open === 'function') window.YahmaScanConsole.open('card');
  });
  $('fu-pager-prev')?.addEventListener('click',()=>{page=Math.max(1,page-1);draw();});
  $('fu-pager-next')?.addEventListener('click',()=>{page++;draw();});
  $('fu-pager-size')?.addEventListener('change',e=>{pageSize=parseInt(e.target.value,10)||0;page=1;draw();});
  async function exportFu(fmt){
    const rows=getRows();
    if(!rows.length){alert('لا توجد نتائج مطابقة للفلاتر.');return;}
    const headers=['رقم اللوحة','الماركة','النوع','الموديل','رقم الكارت','انتهاء الكارت','حالة الكارت','التأمين','الفرع','المالك','حالة السيارة'];
    const data=rows.map(c=>[
      c.plate||'',c.brand||'',c.type||'',c.model||'',c.cardNumber||'',c.cardExpiry||'',
      (typeof cardDisplayStatus==='function'?cardDisplayStatus(c.cardExpiry,c.cardStatus).label:(c.cardStatus||'')),
      c.insuranceStatus||'',c.branch||'',c.owner||'',c.carStatus||''
    ]);
    window._yahmaGetFilteredCars = getRows;
    if(fmt==='pdf'){
      const name='كارت-تأمين-مفلتر-'+new Date().toISOString().slice(0,10)+'.pdf';
      if(window.YahmaExport&&window.YahmaExport.exportTablePdf){
        window.YahmaExport.exportTablePdf({title:'كارت وتأمين — نتائج مفلترة',subtitle:'عدد السجلات: '+rows.length,headers:headers,rows:data,buttonId:'fu-export-pdf',filename:name});
      } else if(typeof openPrintWindow==='function') openPrintWindow('كارت وتأمين — نتائج مفلترة','عدد السجلات: '+rows.length,headers,data);
      return;
    }
    if(!(await ensureXlsxReady())){alert('مكتبة Excel غير متاحة');return;}
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
    ws['!cols']=headers.map(()=>({wch:16}));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'كارت-تأمين');
    XLSX.writeFile(wb,'كارت-تأمين-مفلتر-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
  }
  window._yahmaModuleExport = function(fmt){ exportFu(fmt==='pdf'?'pdf':'xlsx'); };
  window._yahmaGetFilteredCars = getRows;
  $('fu-export-xlsx')?.addEventListener('click',()=>exportFu('xlsx'));
  $('fu-export-pdf')?.addEventListener('click',()=>exportFu('pdf'));
  $('fu-upload-btn')?.addEventListener('click',()=>$('file-fu-upload')?.click());
  $('file-fu-upload')?.addEventListener('change',async e=>{
    const file=e.target.files[0];
    if(!file) return;
    await handleDomainUpdateFile(file,{title:'الكروت',fields:['cardNumber','cardExpiry','cardStatus']});
    e.target.value='';
  });
  draw();
}

  global.YahmaFollowUp = { render: renderFollowUp };
})(window);
