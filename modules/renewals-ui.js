(function(global){
  'use strict';

/* ===== أعمدة بيانات بتتمشى مع السيارة عبر دورة الفحص =====

   الطلب: الأعمدة في «الفحص» وتوصل مع السيارة لـ«تحت الدفع» ←
   «تم الدفع» ← «تم التجديد»، والقيم **ثابتة على السيارة من ملف
   Excel مرفوع** — مش كتابة يدوية.

   علشان كده دي خلايا عرض مش inputs: أي حد يعدّلها من هنا بيكسر
   المعادلة، والقيمة الصح مكانها ورقة Excel أو نافذة تعديل السيارة.

   نفس الترتيب والتصدير في «تحت الدفع» (render-router.js) عشان
   مفيش عمود ينزل من الجدول ويبقى في التصدير — أو العكس. */
const REN_DATA_FIELDS = [
  { field:'serial', label:'الرقم التسلسلي' },
  { field:'accountNo', label:'رقم الحاسب الآلي' },
  { field:'companyName', label:'اسم الشركة' }
];
const REN_DATA_HEADERS = REN_DATA_FIELDS.map(d => '<th>' + d.label + '</th>').join('');
const REN_DATA_LABELS = REN_DATA_FIELDS.map(d => d.label);

/* ⚠️ لو رجعت cell فيها input من غير سبب، الأعمدة بتبقى قابلة
   للكتابة تاني والاختبار بيرفض. */
function renDataCells(car){
  return REN_DATA_FIELDS.map(function(def){
    return '<td class="ren-data-cell">' + escapeHtml(car[def.field] || '—') + '</td>';
  }).join('');
}

function renderRenewals(content, mode='inspection'){
  /* الشريط نفسه ≠ زر الحذف. كان الاتنين نفس الشرط. */
  const canBulk=(typeof window.YahmaPerms==='object') ? window.YahmaPerms.canBulk() : !(typeof currentRole!=='undefined'&&currentRole==='view');
  /* الحذف للمدير بس — مطابق لـ yahma_is_admin() في القاعدة. */
  const canDelete=(typeof window.YahmaPerms==='object') ? window.YahmaPerms.canDelete() : currentRole==='admin';
  const licenseMode=mode==='license';
  const insuranceMode=mode==='insurance';
  const isAdmin=(typeof currentRole!=='undefined'?currentRole==='admin':(typeof window!=='undefined'&&window.currentRole==='admin'));
  const isOpsInspection=(!licenseMode && !insuranceMode && !isAdmin);
  document.getElementById('topbar-title').textContent = insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص';
  document.getElementById('topbar-sub').textContent = insuranceMode?'متابعة وتجديد تأمين السيارات':licenseMode?'كل رخص محتاجة متابعة — منتهية وقاربت الانتهاء ومفيش لها تاريخ':'متابعة السيارات المطلوب فحصها';
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
  const readPaymentQueue=()=>{try{const items=JSON.parse(localStorage.getItem('yahma-inspection-payments-v1')||'[]');return Array.isArray(items)?items:[]}catch(_){return [];}};
  const pendingIds=new Set(readPaymentQueue().map(item=>String(item.carId)));
  /* نفس fleetForTab بالظبط — عشان الرقم في البطاقة يطابق عدد صفوف الجدول */
  const needInsp=typeof fleetForTab==='function'?fleetForTab('renewals', fleet).filter(car=>!pendingIds.has(String(car.id))).length:getUninspectedCars().filter(car=>!pendingIds.has(String(car.id))).length;
  const needLic=typeof fleetForTab==='function'?fleetForTab('license-renewals', fleet).length:fleet.filter(c=>dateStatus(c.licenseExpiry).level==='red').length;
  const needInsurance=typeof fleetForTab==='function'?fleetForTab('insurance-renewals', fleet).length:fleet.filter(c=>textTag(c.insuranceStatus).level==='red').length;
  const goodInsp=fleet.filter(car=>inspectionDisplayStatus(car.inspectionStatus).level==='green').length;
  const goodLic=fleet.length-needLic;
  content.innerHTML = `
    <div class="fleet-summary-strip module-summary-strip" aria-label="ملخص ${licenseMode?'الرخص':'الفحص'}">
      ${insuranceMode?`<div class="fleet-summary-card attention"><span class="fleet-summary-icon">!</span><span><b>${needInsurance}</b><small>تأمين منتهي</small></span></div>`:licenseMode?`<button type="button" class="fleet-summary-card attention" data-rq="lic_bad"><span class="fleet-summary-icon">!</span><span><b>${needLic}</b><small>رخص منتهية</small></span></button><button type="button" class="fleet-summary-card ready" data-rq="lic_ok"><span class="fleet-summary-icon">✓</span><span><b>${goodLic}</b><small>رخص سارية</small></span></button>`:`
      <button type="button" class="fleet-summary-card attention" data-rq="insp_bad"><span class="fleet-summary-icon">!</span><span><b>${needInsp}</b><small>تحتاج فحص</small></span></button>
      <div class="fleet-summary-card ready"><span class="fleet-summary-icon">✓</span><span><b>${goodInsp}</b><small>فحص سليم</small></span></div>
      `}
    </div>
    ${licenseMode||insuranceMode?'':`<div class="wa-toolbar">
      <div class="wa-toolbar-info">
        <strong>السيارات غير المفحوصة:</strong> <span class="wa-count">${needInsp}</span>
      </div>
      <div class="wa-toolbar-actions">
        <button class="btn btn-whatsapp" id="btn-wa-inspection">إرسال على واتساب</button>
        <button class="btn btn-copy-inspection">نسخ القائمة</button>
        <!-- أزرار التصدير القديمة (ren-export-*) اتشالت: شريط التصدير
             الموحّد (yx-bar) بقي هو المسؤول وهو موجود جنب زر الرفع. -->
      </div>
    </div>`}
    <div class="filter-panel">
      <div class="filter-panel-title"><strong>🔎 فلاتر ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'}</strong><span>${isOpsInspection?'البحث في سيارات الفحص':'صفِّ النتائج حسب أي بند — ثم صدّر Excel أو PDF'}</span></div>
      ${isOpsInspection ? '' : `
      <div class="quick-filters" id="ren-quick">
        ${insuranceMode?`<button type="button" class="quick-filter" data-rq="insurance_bad">🛡️ يحتاج متابعة</button>`:licenseMode?`<button type="button" class="quick-filter" data-rq="lic_expired">🔴 منتهية</button><button type="button" class="quick-filter" data-rq="lic_soon">🟡 قريبة الانتهاء</button><button type="button" class="quick-filter" data-rq="lic_unknown">⚪ مفيش تاريخ</button>`:`<button type="button" class="quick-filter" data-rq="insp_bad">🔍 تحتاج فحص</button>`}
        ${licenseMode||insuranceMode?'':`
        <button type="button" class="quick-filter" data-rq="active">🟢 سيارة نشطة</button>
        <button type="button" class="quick-filter" data-rq="maintenance">🔧 تحت الصيانة</button>
        <button type="button" class="quick-filter" data-rq="out">⛔ خارج الخدمة</button>
        `}
      </div>`}
      <div class="fleet-filter-grid"${isOpsInspection ? ' style="grid-template-columns:1fr;"' : ''}>
        <label${isOpsInspection ? ' style="grid-column:1/-1;width:100%;"' : ''}>بحث<input id="ren-search" placeholder="لوحة، مالك، فرع..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px${isOpsInspection?';width:100%':''}"></label>
        ${isOpsInspection ? '' : `
        <label>الفرع<select id="ren-branch">${optionList(uniq('branch'),'كل الفروع')}</select></label>
        <label>حالة السيارة<select id="ren-car-status"><option value="">كل الحالات</option><option>تحت الصيانة</option><option>حجز</option><option>متاحة للايجار</option><option>محولة غير مستلمة</option><option>مسروقة</option><option>للبيع</option><option>مؤجرة</option><option>خدمة</option><option>مفقودة</option></select></label>
        <label>المالك<select id="ren-owner">${optionList(uniq('owner'),'كل الملاك')}</select></label>
        <label>الماركة<select id="ren-brand">${optionList(uniq('brand'),'كل الماركات')}</select></label>
        <label>الموديل (السنة)<select id="ren-model">${optionList(uniq('model'),'كل الموديلات')}</select></label>
        ${(!licenseMode&&!insuranceMode)?`<label>حالة الفحص<select id="ren-insp-status"><option value="">كل الحالات</option><option value="green">تم الفحص</option><option value="red">لم يفحص</option></select></label>`:''}
        ${licenseMode?`<label>صلاحية الرخصة<select id="ren-lic-condition"><option value="">كل الحالات</option><option value="green">سارية</option><option value="amber">قريبة الانتهاء</option><option value="red">منتهية</option><option value="grey">غير محددة</option></select></label>
        <label>حالة الرخصة (سجل)<select id="ren-lic-status"><option value="">كل الحالات</option><option>نشط</option><option>ملغى</option><option>موقوف</option><option>منتهي</option></select></label>`:''}
        ${insuranceMode?`<label>حالة التأمين<select id="ren-insurance-status"><option value="">كل الحالات</option><option value="green">ساري</option><option value="red">منتهي / لا يوجد</option><option value="grey">غير محدد</option></select></label>`:''}
        `}
      </div>
      <div class="filter-footer">
        <span id="ren-filter-count">عرض 0 من ${fleet.length}</span>
        <button class="btn btn-ghost btn-small" id="ren-clear">↺ مسح الفلاتر</button>
        <button class="btn btn-primary btn-small" id="ren-upload-btn" title="رفع شيت ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'} — ${insuranceMode?'يحدّث: حالة التأمين، الشركة، الانتهاء، اللون، المدينة، الرقم التسلسلي، المالك، الفرع، حالة السيارة':licenseMode?'يحدّث تاريخ وحالة الرخصة فقط':'يحدّث: حالة الفحص، الرقم التسلسلي، رقم الحاسب الآلي، اسم الشركة، والملاحظات'}">📥 رفع شيت ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'}</button>
        <input type="file" id="file-ren-upload" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
    </div>
    ${canBulk?`<div class="bulk-bar" id="ren-bulk-bar" style="display:none">
      <div class="bulk-bar-info"><span id="ren-bulk-count">0 محددة</span></div>
      <div class="bulk-bar-actions">
        ${insuranceMode?'<button class="btn btn-primary btn-small" id="ren-bulk-ins-ok">🛡️ تعيين «ساري»</button><button class="btn btn-ghost btn-small" id="ren-bulk-ins-no">تعيين «لا يوجد»</button>':''}
        ${(!licenseMode&&!insuranceMode)?(
          isAdmin
            ? '<button class="btn btn-ghost btn-small" id="ren-insp-from-lic" title="يضبط حالة الفحص من تاريخ الرخصة: منتهية ⇐ لم يفحص، سارية ⇐ تم الفحص">🔄 فحص من الرخص</button><button class="btn btn-primary btn-small" id="ren-bulk-insp-yes" title="يضبط الحالة «تم الفحص» وينقل المحددة لِتبويب «تحت الدفع» — الخطوة التالية في الدورة">✅ تم الفحص ← تحت الدفع</button><button class="btn btn-ghost btn-small" id="ren-bulk-insp-no" title="يضبط الحالة «لم يفحص» بدون نقل — السيارة بتفضل في «الفحص»">لم يُفحص</button>'
            : '<button class="btn btn-primary btn-small" id="ren-bulk-insp-yes" title="يضبط الحالة «تم الفحص» وينقل المحددة لِتبويب «تحت الدفع»">✅ تم الفحص ← تحت الدفع</button>'
        ):''}
        ${licenseMode?'<button class="btn btn-primary btn-small" id="ren-bulk-lic-renew">📅 تجديد الرخصة (سنة)</button><button class="btn btn-ghost btn-small" id="ren-bulk-lic-status">ضبط حالة الرخصة</button>':''}
        <button class="btn btn-danger btn-small" id="ren-bulk-delete">🗑 حذف المحددة</button>
        ${(canDelete && isAdmin)?`
          <div class="admin-transfer-group" style="display:inline-flex;gap:4px;align-items:center;background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:6px;">
            <span style="font-size:11px;font-weight:bold;color:var(--accent,#008080)">نقل المحددة (للمدير):</span>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-payments" type="button" title="نقل السيارات المحددة لتبويب «تحت الدفع»">📥 تحت الدفع</button>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-paid" type="button" title="نقل السيارات المحددة لتبويب «تم الدفع»">💵 تم الدفع</button>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-renewed" type="button" title="نقل السيارات المحددة لتبويب «تم التجديد»">✅ تم التجديد</button>
          </div>
        `:""}
        <button class="btn btn-ghost btn-small" id="ren-bulk-clear">إلغاء التحديد</button>
      </div>
    </div>`:''}
    <div class="table-scroll" style="max-height:calc(100vh - 320px)">
      <table class="fleet-table" id="ren-table" style="min-width:1400px">
        <thead><tr>
          ${canBulk?'<th class="th-check"><input type="checkbox" id="ren-head-check" aria-label="تحديد الكل"></th>':''}
          <th>رقم اللوحة</th>
          <th>الماركة</th>
          <th>النوع</th>
          <th>الموديل</th>
          <th>كم الحالي</th>
          <th>اللون</th>
          <th>المدينة</th>
          ${(!licenseMode&&!insuranceMode)?REN_DATA_HEADERS:'<th>الرقم التسلسلي</th>'}
          ${(!licenseMode&&!insuranceMode)?'<th>انتهاء الرخصة</th><th>حالة الرخصة</th><th>حالة الفحص</th>':''}
          ${licenseMode?'<th>تاريخ انتهاء الرخصة</th><th>حالة الرخصة</th>':''}
          ${insuranceMode?'<th>حالة التأمين</th><th>تاريخ الانتهاء</th><th>شركة التأمين</th><th>المالك</th>':''}
          <th>الفرع</th>
          <th>حالة السيارة</th>
          <th>إجراء</th>
          ${insuranceMode?'':'<th>ملاحظات</th>'}
        </tr></thead>
        <tbody id="ren-tbody"></tbody>
      </table>
    </div>
    <div class="pager" id="ren-pager">
      <div class="pager-info" id="ren-pager-info">—</div>
      <div class="pager-controls">
        <button class="btn btn-ghost btn-small" id="ren-pager-prev">‹</button>
        <div class="pager-pages" id="ren-pager-pages"></div>
        <button class="btn btn-ghost btn-small" id="ren-pager-next">›</button>
      </div>
      <label class="pager-size">عرض
        <select id="ren-pager-size">
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="100">100 (حد أقصى سلس)</option>
        </select>
      </label>
    </div>
  `;

  document.getElementById('btn-wa-inspection')?.addEventListener('click', shareUninspectedWhatsApp);
  document.getElementById('btn-copy-inspection')?.addEventListener('click', copyUninspectedList);

  const $=id=>document.getElementById(id);
  let activeRQ='', page=1, pageSize=25;
  const selectedRenIds=new Set();
  const rank={red:0,amber:1,grey:2,green:3};
  const val=id=>($(id)?.value||'').trim();
  const norm=s=>String(s??'').trim();
  const eq=(a,b)=>norm(a).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا')===norm(b).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');

  function getRows(){
    const q=val('ren-search').toLowerCase();
    return fleet.filter(c=>{
      // تبويبات الفحص والرخص والتأمين تعرض كل السيارات (الأسوأ أولًا حسب الفرز) — الفلاتر السريعة تضيّق عند الحاجة
      if(!licenseMode&&!insuranceMode&&pendingIds.has(String(c.id))) return false;
      /* تبويب الرخص: بيعرض كل حاجة محتاجة متابعة افتراضيًا —
         منتهية + قاربت الانتهاء + مفيش لها تاريخ.
         الرقم في القائمة (needLic) بيحسب نفس الثلاثة بالظبط،
         ولو|displayed المنتهي بس هنا؟ بيظهر تعارض زي «720 محتاجة
         تجديد» والجدول بيقول «438». الفلاتر السريعة تحت بتضيّق. */
      if(licenseMode && !activeRQ && !val('ren-lic-condition') && !val('ren-lic-status')){
        if(dateStatus(c.licenseExpiry).level!=='red') return false;
      }
      if(insuranceMode && !activeRQ && !val('ren-insurance-status')){
        var _insSt = textTag(c.insuranceStatus).level;
        var _expSt = c.insuranceExpiry && typeof dateStatus === 'function' ? dateStatus(c.insuranceExpiry).level : null;
        if(_insSt !== 'red' && _expSt !== 'red') return false;
      }
      if(!licenseMode && !insuranceMode && !activeRQ && !val('ren-insp-status')){
        if(inspectionDisplayStatus(c.inspectionStatus).level !== 'red') return false;
      }
      if(q){
        const hay=[c.plate,c.brand,c.model,c.owner,c.branch,c.carStatus,c.inspectionStatus,c.insuranceCompany].map(v=>String(v||'').toLowerCase()).join(' ');
        if(!hay.includes(q)) return false;
      }
      if(val('ren-branch') && !eq(c.branch,val('ren-branch'))) return false;
      if(val('ren-owner') && !eq(c.owner,val('ren-owner'))) return false;
      if(val('ren-brand') && (typeof canonicalBrand==='function'?canonicalBrand(c.brand)!==val('ren-brand'):!eq(c.brand,val('ren-brand')))) return false;
      if(val('ren-model') && !eq(c.model,val('ren-model'))) return false;
      if(val('ren-car-status') && !carStatusMatch(c.carStatus,val('ren-car-status'))) return false;
      if(val('ren-insp-status') && inspectionDisplayStatus(c.inspectionStatus).level!==val('ren-insp-status')) return false;
      if(val('ren-insurance-status') && textTag(c.insuranceStatus).level!==val('ren-insurance-status')) return false;
      if(val('ren-lic-condition') && dateStatus(c.licenseExpiry).level!==val('ren-lic-condition')) return false;
      if(val('ren-lic-status')){
        const want=val('ren-lic-status'), raw=norm(c.licenseStatus);
        if(want.includes('ملغ') && !raw.includes('ملغ')) return false;
        else if(want.includes('موقوف') && !raw.includes('موقوف')) return false;
        else if(want.includes('منته') && !(raw.includes('منته')||dateStatus(c.licenseExpiry).level==='red')) return false;
        else if(want==='نشط' && (raw.includes('ملغ')||raw.includes('موقوف')||raw.includes('منته'))) return false;
      }
      if(activeRQ){
        const insp=inspectionDisplayStatus(c.inspectionStatus).level;
        const lic=dateStatus(c.licenseExpiry).level;
        const st=norm(c.carStatus);
        if(activeRQ==='insp_bad' && insp==='green') return false;
        if(activeRQ==='insp_ok' && insp!=='green') return false;
        if(activeRQ==='lic_bad' && lic==='green') return false;
        if(activeRQ==='lic_ok' && lic!=='green') return false;
        if(activeRQ==='lic_expired' && lic!=='red') return false;
        if(activeRQ==='lic_soon' && lic!=='amber') return false;
        if(activeRQ==='lic_unknown' && lic!=='grey') return false;
        if(activeRQ==='active' && !carStatusMatch(st,'متاحة للايجار')) return false;
        if(activeRQ==='maintenance' && !st.includes('صيانة')) return false;
        if(activeRQ==='out' && !carStatusOut(st)) return false;
        if(activeRQ==='insurance_bad' && textTag(c.insuranceStatus).level==='green') return false;
      }
      return true;
    }).sort((a,b)=>{
      if(insuranceMode){
        const rankIns={red:0,amber:1,grey:2,green:3};
        return rankIns[textTag(a.insuranceStatus).level]-rankIns[textTag(b.insuranceStatus).level];
      }
      const av=Math.min(rank[inspectionDisplayStatus(a.inspectionStatus).level], rank[dateStatus(a.licenseExpiry).level]);
      const bv=Math.min(rank[inspectionDisplayStatus(b.inspectionStatus).level], rank[dateStatus(b.licenseExpiry).level]);
      return av-bv;
    });
  }
  window._yahmaCurrentPdfData=()=>{
    if(insuranceMode) return {title:'التأمين المفلتر',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','كم الحالي','اللون','المدينة','حالة التأمين','انتهاء التأمين','شركة التأمين','المالك','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.odometer||'—',c.color||'—',c.city||'—',textTag(c.insuranceStatus).label,c.insuranceExpiry||'—',c.insuranceCompany||'—',c.owner||'—',c.branch||'—',c.carStatus||'—'])};
    if(licenseMode) return {title:'تجديد الرخص المفلترة',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','كم الحالي','اللون','المدينة','الرقم التسلسلي','انتهاء الرخصة','حالة الرخصة','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.odometer||'—',c.color||'—',c.city||'—',c.serial||'—',c.licenseExpiry||'—',dateStatus(c.licenseExpiry).label,c.branch||'—',c.carStatus||'—'])};
    /* وضع الفحص: الأعمدة بتتمشى مع السيارة لـ«تحت الدفع»، فلازم
       تطلع في التصدير كمان — وإلا اللي بيبعت الملف للفوترة ناقصه. */
    return {title:'الفحص المفلتر',subtitle:'عدد السيارات: '+getRows().length,
      headers:['رقم اللوحة','الماركة','النوع','الموديل','كم الحالي','اللون','المدينة']
        .concat(REN_DATA_LABELS,['انتهاء الرخصة','حالة الرخصة','حالة الفحص','الفرع','حالة السيارة','ملاحظات']),
      rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.odometer||'—',c.color||'—',c.city||'—']
        .concat(REN_DATA_FIELDS.map(d=>c[d.field]||'—'))
        .concat([c.licenseExpiry||'—',dateStatus(c.licenseExpiry).label,inspectionDisplayStatus(c.inspectionStatus).label,c.branch||'—',c.carStatus||'—',c.notes||'—']))};
  };

  /* تحديد جماعي + حذف (إداريون فقط) */
  function updateRenBulkBar(){
    const bar=$('ren-bulk-bar'); if(!bar) return;
    const n=selectedRenIds.size;
    bar.style.display=n?'':'none';
    const cnt=$('ren-bulk-count'); if(cnt) cnt.textContent=n+' محددة';
    const tbody=$('ren-tbody');
    const boxes=tbody?[...tbody.querySelectorAll('.row-check')]:[];
    const head=$('ren-head-check');
    if(head){ head.checked=boxes.length>0&&boxes.every(b=>b.checked); head.indeterminate=boxes.some(b=>b.checked)&&!head.checked; }
  }
  function wireRenChecks(){
    const tbody=$('ren-tbody'); if(!tbody) return;
    tbody.querySelectorAll('.row-check').forEach(cb=>{
      cb.checked=selectedRenIds.has(cb.dataset.id);
      cb.onchange=()=>{ if(cb.checked) selectedRenIds.add(cb.dataset.id); else selectedRenIds.delete(cb.dataset.id); updateRenBulkBar(); };
    });
    const head=$('ren-head-check');
    if(head && !head._bound){
      head._bound=true;
      head.onchange=()=>{
        const boxes=[...tbody.querySelectorAll('.row-check')];
        if(head.checked) boxes.forEach(b=>selectedRenIds.add(b.dataset.id));
        else boxes.forEach(b=>selectedRenIds.delete(b.dataset.id));
        wireRenChecks(); updateRenBulkBar();
      };
    }
    updateRenBulkBar();
  }
  async function deleteRenCars(ids){
    const cars=ids.map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
    if(!cars.length) return;
    if(!confirm('حذف '+cars.length+' سيارة نهائيًا من الأسطول؟\n'+cars.slice(0,8).map(c=>c.plate).join('، ')+(cars.length>8?'…':''))) return;
    cars.forEach(c=>selectedRenIds.delete(String(c.id)));
    await removeSoldVehiclesByPlates(cars.map(c=>c.plate),{skipConfirm:true,silent:true});
    render();
  }
  /* ===== تعديل جماعي: فحص / رخصة / تأمين (إداريون فقط — الزر يظهر ضمن شريط التحديد) ===== */
  function renSelectedCars(){
    return [...selectedRenIds].map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
  }
  function renPlates(cars){ return cars.slice(0,8).map(c=>c.plate||'—').join('، ')+(cars.length>8?'…':''); }
  async function renBulkApply(cars, mutate, doneMsg, logLabel){
    if(!cars.length) return;
    cars.forEach(mutate);
    const ids=cars.map(c=>c.id);
    let ok=true;
    try{ ok=await saveData(ids); }catch(_){ ok=false; }
    cars.forEach(c=>selectedRenIds.delete(String(c.id)));
    if(ok===false) alert('تعذر الحفظ على بعض السيارات — تحقق من الاتصال ثم أعد المحاولة.');
    else alert(doneMsg);
    if(logLabel && typeof window.log==='function'){
      try{ window.log(logLabel, cars.length+' سيارة: '+renPlates(cars)); }catch(_){yahmaErr(_,'renewals-ui.js:255');}
    }
    render();
  }
  /* قاعدة الفحص من الرخصة: منتهية ⇐ لم يفحص · سارية ⇐ تم الفحص (نفس قاعدة الاستيراد) */
  function inspectionFromLicense(car){
    const raw = String(car.licenseExpiry || '').trim();
    if(!raw) return null;
    const d = new Date(raw.slice(0,10) + 'T00:00:00');
    if(isNaN(d)) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    return d.getTime() < today.getTime() ? 'لم يفحص' : 'تم الفحص';
  }
  async function adminMoveSelectedCars(targetTab){
    if(typeof currentRole!=="undefined" && currentRole!=="admin"){
      alert("هذا الإجراء متاح لمدير النظام فقط."); return;
    }
    const cars=[...selectedRenIds].map(id=>fleet.find(c=>String(c.id)===String(id))).filter(Boolean);
    if(!cars.length){ alert("يرجى تحديد سيارة واحدة على الأقل."); return; }
    const tabNames = { payments: "تحت الدفع", paid: "تم الدفع", renewed: "تم التجديد" };
    const targetName = tabNames[targetTab] || targetTab;
    if(!confirm("هل تريد بالتأكيد نقل " + cars.length + " سيارة إلى تبويب «" + targetName + "»؟")) return;
    cars.forEach(function(c){ c.inspectionStatus = "تم الفحص"; });
    try{ await saveData(cars.map(c=>c.id)); }catch(_){}
    if(!window.YahmaPayments){ alert("تعذر الوصول لوحدة الدفع."); return; }
    let moved=0; const failed=[];
    for(const car of cars){
      try{
        if(targetTab==="payments"){
          await window.YahmaPayments.requestPayment(car);
        }else if(targetTab==="paid"){
          var pendingList = window.YahmaPayments.localByStatus("pending");
          var item = pendingList.find(function(p){ return String(p.carId)===String(car.id); });
          if(!item){
            await window.YahmaPayments.requestPayment(car);
            pendingList = window.YahmaPayments.localByStatus("pending");
            item = pendingList.find(function(p){ return String(p.carId)===String(car.id); });
          }
          if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.paid){
            await window.PAY_ITEM_ACTION.paid(item || { id: car.id, carId: car.id }, car, true);
          }
        }else if(targetTab==="renewed"){
          var pList = window.YahmaPayments.localByStatus("pending");
          var pItem = pList.find(function(p){ return String(p.carId)===String(car.id); });
          if(!pItem){
            await window.YahmaPayments.requestPayment(car);
            pList = window.YahmaPayments.localByStatus("pending");
            pItem = pList.find(function(p){ return String(p.carId)===String(car.id); });
          }
          if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.paid){
            await window.PAY_ITEM_ACTION.paid(pItem || { id: car.id, carId: car.id }, car, true);
          }
          var paidList = window.YahmaPayments.localByStatus("paid");
          var paidItem = paidList.find(function(p){ return String(p.carId)===String(car.id); }) || pItem || { id: car.id, carId: car.id };
          if(window.PAY_ITEM_ACTION && window.PAY_ITEM_ACTION.renew){
            await window.PAY_ITEM_ACTION.renew(paidItem, car, true);
          }
        }
        moved++;
      }catch(err){
        console.error("Failed to move car:", car.plate, err);
        failed.push(car.plate || car.id);
      }
    }
    selectedRenIds.clear();
    var msg = "✓ تم نقل " + moved + " سيارة بنجاح إلى تبويب «" + targetName + "».";
    if(failed.length) msg += "\nفشل نقل: " + failed.join("، ");
    alert(msg);
    if(typeof log==="function"){ try{ log("نقل سيارات جماعي", moved + " سيارة إلى " + targetName); }catch(_){} }
    if(typeof render==="function") render();
  }

  async function bulkInspectionFromLicenses(){
    const cars = renSelectedCars();
    if(!cars.length) return;
    const withDate = cars.filter(c => !!inspectionFromLicense(c));
    if(!withDate.length){ alert('لا توجد سيارة بتاريخ رخصة صالح لتطبيق القاعدة.'); return; }
    const expired = withDate.filter(c => inspectionFromLicense(c) === 'لم يفحص').length;
    if(!confirm('ضبط حالة الفحص من تاريخ الرخصة لـ '+withDate.length+' سيارة؟\n• منتهية ⇐ لم يفحص: '+expired+'\n• سارية ⇐ تم الفحص: '+(withDate.length-expired)+'\n• بدون تاريخ رخصة: تُترك كما هي ('+(cars.length-withDate.length)+')')) return;
    await renBulkApply(withDate, c=>{ c.inspectionStatus = inspectionFromLicense(c); },
      'تم تحديث فحص '+withDate.length+' سيارة من الرخص', 'فحص من الرخص');
  }
  /* ===== الانتقال للمرحلة التالية: الفحص ← تحت الدفع =====

     ⚠️ سبب وجود الدالة دي: «تم الفحص» الجماعي كان بيحط حالة الفحص
     وخلاص، فما كانش بينقل ولا سيارة لِتبويب «تحت الدفع». النتيجة إن
     1055 سيارة بتتفحص تدخل الحالة الصح وتتصل في الفحص تاني للأبد،
     والدورة تقف عند أول خطوة. زر السيارة الواحدة («تجديد فحص») كان
     بينقل صح من أول يوم — فالمسارين كانا متفظلفين.

    خطوة واحدة دلوقتي: الجماعي = المفرد + تكرار.

     الطلب بيتسجّل بـ YahmaPayments.requestPayment — نفس دالة الزر
     المفرد بالظبط، فالنتيجة في السحابة وفي التبويب متطابقة. */

  /* السيارات اللي هي أصلاً في «تحت الدفع» — بنتجاهلها.
     مهم: requestPayment بيعمل insert جديد في جدول
     inspection_payments كل مرة، فبدون الفلترة دي السيارة كانت
     هتاخد طلبين، واحد قديم والتاني جديد. */
  function pendingCarIds() {
    try {
      if (window.YahmaPayments && typeof window.YahmaPayments.localByStatus === 'function') {
        return window.YahmaPayments.localByStatus('pending')
          .map(function (p) { return String(p.carId); });
      }
    } catch(e){yahmaErr(e,'renewals-ui.js:pendingCarIds');}
    return [];
  }

  async function bulkAdvanceToPayment(cars) {
    if (!window.YahmaPayments || typeof window.YahmaPayments.requestPayment !== 'function') {
      alert('تعذّر الانتقال لِتبويب «تحت الدفع» — وحدة الدفع غير محمّلة.');
      return;
    }
    if (typeof window.canAccessYahmaTab === 'function' && !window.canAccessYahmaTab('payments')) {
      alert('لا تملك صلاحية الوصول إلى قسم «تحت الدفع».');
      return;
    }

    /* ❶ حالة الفحص الأول، ونحفظ مرة واحدة لكل المحدد. */
    cars.forEach(function(c){ c.inspectionStatus = 'تم الفحص'; });
    let ok = true;
    try { ok = await saveData(cars.map(function(c){ return c.id; })); }
    catch(_){ ok = false; }
    if (ok === false) {
      alert('تعذر حفظ حالة الفحص على بعض السيارات — تحقق من الاتصال ثم أعد المحاولة.\nلم يتم نقل أي سيارة لِتبويب «تحت الدفع».');
      return;
    }

    /* ❷ الطلب على الدفع — سيّارة سيّارة عشان نعرف مين اتنفذ ومين لأ. */
    const already = pendingCarIds();
    let moved = 0, skipped = 0;
    const failed = [];
    for (const car of cars) {
      if (already.indexOf(String(car.id)) >= 0) { skipped++; continue; }
      try {
        await window.YahmaPayments.requestPayment(car);
        moved++;
      } catch(e) {
        yahmaErr(e,'renewals-ui.js:bulkAdvanceToPayment');
        failed.push(car.plate || String(car.id));
      }
    }

    cars.forEach(function(c){ selectedRenIds.delete(String(c.id)); });

    /* ملخص دقيق — «تم» ومين اتخطّى ومين فشل. رسالة واحدة عامة
       كانت هتخفي الفشل وتخلّي المستخدم يفكر إن كله تم. */
    const parts = [];
    if (moved) parts.push(moved + ' سيارة اتنقلت لِتبويب «تحت الدفع»');
    if (skipped) parts.push(skipped + ' كانت موجودة بالفعل في «تحت الدفع»');
    if (failed.length) parts.push('فشل نقل: ' + failed.join('، '));
    alert(parts.join('\n') || 'مفيش حاجة اتغيّرت.');

    if (typeof log === 'function') {
      try { log('فحص جماعي', moved + ' انتقال لِتحت الدفع' + (skipped ? ' + ' + skipped + ' موجودة بالفعل' : '')); }
      catch(e){yahmaErr(e,'renewals-ui.js:bulkAdvanceToPayment:log');}
    }
    render();
  }

  async function bulkSetInspection(value, advanceToPayment){
    const cars=renSelectedCars();
    if(!cars.length) return;
    const question = advanceToPayment
      ? 'تعيين حالة الفحص «تم الفحص» ونقل '+cars.length+' سيارة لِتبويب «تحت الدفع»؟'
      : 'تعيين حالة الفحص «'+value+'» لـ '+cars.length+' سيارة؟';
    if(!confirm(question+'\n'+renPlates(cars))) return;
    if(advanceToPayment){ await bulkAdvanceToPayment(cars); return; }
    await renBulkApply(cars, c=>{ c.inspectionStatus=value; }, 'تم تحديث فحص '+cars.length+' سيارة', 'تحديث فحص جماعي');
  }
  async function bulkRenewLicense(){
    const cars=renSelectedCars();
    if(!cars.length) return;
    const def=defaultLicenseExpiry();
    const raw=prompt('تاريخ انتهاء الرخصة الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', def);
    if(!raw) return;
    const val=normalizeDateValue(raw)||raw;
    if(!confirm('ضبط انتهاء الرخصة على '+val+' لـ '+cars.length+' سيارة؟\n'+renPlates(cars))) return;
    await renBulkApply(cars, c=>{ c.licenseExpiry=val; if(!c.licenseStatus||String(c.licenseStatus).includes('منته')) c.licenseStatus='نشط'; },
      'تم تجديد رخصة '+cars.length+' سيارة (انتهاء '+val+')', 'تجديد رخص جماعي');
  }
  async function bulkSetLicenseStatus(){
    const cars=renSelectedCars();
    if(!cars.length) return;
    const raw=prompt('حالة الرخصة الجديدة ('+cars.length+' سيارة):\nنشط / ملغى / موقوف / منتهي','نشط');
    if(!raw) return;
    const val=raw.trim();
    if(!['نشط','ملغى','موقوف','منتهي'].includes(val)){ alert('القيمة يجب أن تكون: نشط أو ملغى أو موقوف أو منتهي'); return; }
    if(!confirm('تعيين حالة الرخصة «'+val+'» لـ '+cars.length+' سيارة؟\n'+renPlates(cars))) return;
    await renBulkApply(cars, c=>{ c.licenseStatus=val; }, 'تم تحديث حالة رخصة '+cars.length+' سيارة', 'تحديث رخص جماعي');
  }
  async function bulkSetInsurance(value){
    const cars=renSelectedCars();
    if(!cars.length) return;
    const label=value==='ساري'?'ساري':'لا يوجد';
    if(!confirm('تعيين التأمين «'+label+'» لـ '+cars.length+' سيارة؟\n'+renPlates(cars))) return;
    await renBulkApply(cars, c=>{ c.insuranceStatus=value; }, 'تم تحديث تأمين '+cars.length+' سيارة', 'تحديث تأمين جماعي');
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
    const tbody=$('ren-tbody');
    (function(){
      const scrollEl = tbody.closest('.table-scroll') || tbody.parentElement;
      function renderRenRow(c){
        const insp=inspectionDisplayStatus(c.inspectionStatus);
        const lic=(typeof licenseDisplayStatus==='function'?licenseDisplayStatus(c.licenseExpiry):dateStatus(c.licenseExpiry));
        const ins=textTag(c.insuranceStatus);
        const carTag=textTag(c.carStatus);
        const noteMode=!insuranceMode;
        /* الملاحظات بيانات تشغيلية — مفتوحة لكل من يعدّل، مش بس للإداري. */
const noteEditable=noteMode&&(typeof window.YahmaPerms==='object'?window.YahmaPerms.canEditNow():!(typeof currentRole!=='undefined'&&currentRole==='view'));
        return `<tr data-id="${escapeHtml(c.id)}">
        ${canBulk?`<td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" aria-label="تحديد السيارة ${escapeHtml(c.plate||'—')}"></td>`:''}
        <td class="plate">${escapeHtml(c.plate||'—')}</td>
        <td>${escapeHtml(c.brand||'—')}</td>
        <td>${escapeHtml(c.type||'—')}</td>
        <td>${escapeHtml(c.model||'—')}</td>
        <td>${escapeHtml(String(c.odometer??'').trim()||'—')}</td>
        <td>${escapeHtml(c.color||'—')}</td>
        <td>${escapeHtml(c.city||'—')}</td>
        ${(!licenseMode&&!insuranceMode)?renDataCells(c):`<td>${escapeHtml(c.serial||'—')}</td>`}
        ${(!licenseMode&&!insuranceMode)?`<td>${fmtDate(c.licenseExpiry)}</td><td><span class="tag ${lic.level}">${escapeHtml(lic.label)}</span></td><td><span class="tag ${insp.level}">${escapeHtml(insp.label)}</span></td>`:''}
        ${licenseMode?`<td>${fmtDate(c.licenseExpiry)}</td>
        <td><span class="tag ${lic.level}">${escapeHtml(lic.label)}</span></td>`:''}
        ${insuranceMode?`<td><span class="tag ${ins.level}">${escapeHtml(ins.label)}</span></td><td>${fmtDate(c.insuranceExpiry)}</td><td>${escapeHtml(c.insuranceCompany||'—')}</td><td>${escapeHtml(c.owner||'—')}</td>`:''}
        <td>${escapeHtml(c.branch||'—')}</td>
        <td><span class="tag ${carTag.level}">${escapeHtml(carTag.label)}</span></td>
        <td style="white-space:nowrap">
          ${licenseMode||insuranceMode?'':`<button class="btn btn-ghost btn-small" data-renew-insp="${escapeHtml(c.id)}">تجديد فحص</button>`}
          ${licenseMode?`<button class="btn btn-ghost btn-small" data-renew-lic="${escapeHtml(c.id)}">تجديد رخصة</button>`:''}
          ${insuranceMode?`<button class="btn btn-ghost btn-small" data-renew-ins="${escapeHtml(c.id)}">تجديد تأمين</button>`:''}
          ${canDelete?`<button class="btn btn-danger btn-small" data-del-car="${escapeHtml(c.id)}" title="حذف السيارة">🗑</button>`:''}
        </td>
        ${noteMode?`<td><input class="ren-note-input" data-note-id="${escapeHtml(c.id)}" value="${escapeHtml(c.notes||'')}" placeholder="اكتب ملاحظة…" aria-label="ملاحظات السيارة ${escapeHtml(c.plate||'—')}"${noteEditable?'':' readonly'}></td>`:''}
      </tr>`;
      }
      /* ⚠️ الـcolspan بيتبني من عدد الترويسات الحقيقي مش رقم ثابت.
         الرقم القديم (9 في وضع الفحص) كان أقل من العدد الفعلي
         بخمس أعمدة، فسطر «لا توجد نتائج» مكانش بياخد عرض الجدول.
         وكان لازم يتعدّل يدوي مع كل عمدة جديدة — مصدر أخطاء
         متكرر. دلوقتي بيتحسب لوحده. */
      const headCells=document.querySelectorAll('#ren-table thead tr:first-child > th');
      const colCount=headCells.length || 1;
      if(window.YahmaVTable && scrollEl){
        if(!window._renVT || window._renVT._tb !== tbody){
          if(window._renVT && window._renVT.destroy) try{window._renVT.destroy()}catch(e){yahmaErr(e,'renewals-ui.js:358');}
          window._renVT = window.YahmaVTable.create({
            scrollEl: scrollEl, tbody: tbody, rowHeight: 52, overscan: 10, threshold: 30, colCount: colCount,
            renderRow: function(c){ return renderRenRow(c); },
            afterRender: function(){},
            emptyHtml: `<tr><td colspan="${colCount}"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>`
          });
          window._renVT._tb = tbody;
        }
        window._renVT.setItems(rows, true);
      } else {
        tbody.innerHTML=rows.length?rows.map(renderRenRow).join(''):`<tr><td colspan="${colCount}"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>`;
      }
      wireRenChecks();
      // تفويض أحداث الأزرار مرة واحدة (متوافق مع Virtualization)
      if(!tbody._renDelegate){
        tbody._renDelegate = true;
        tbody.addEventListener('click', async function(e){
          const btn = e.target.closest('button[data-renew-insp],button[data-renew-lic],button[data-renew-ins],button[data-del-car]');
          if(!btn) return;
          e.stopPropagation();
          if(btn.dataset.delCar){
            if(typeof currentRole!=='undefined'&&currentRole!=='admin'&&currentRole!=='ops'){alert('ليس لديك صلاحية الحذف.');return;}
            const car=fleet.find(c=>String(c.id)===String(btn.dataset.delCar)); if(!car) return;
            await deleteRenCars([car.id]);
            return;
          }
            if(btn.dataset.renewInsp){
             const car=fleet.find(c=>c.id===btn.dataset.renewInsp); if(!car) return;
             if(typeof currentRole!=='undefined'&&currentRole!=='admin'&&currentRole!=='ops'){alert('لس لديك صلاحية تسجيل تجديد الفحص.');return;}
             if(typeof window.canAccessYahmaTab==='function'&&!window.canAccessYahmaTab('payments')){alert('لا تملك صلاحية الوصول إلى قسم تحت الدفع.');return;}
             /* الوحدة الجديدة: طابور دفع مرتبط بالموارد + على Supabase (يشتغل على كل الأجهزة) */
             if(window.YahmaPayments&&typeof window.YahmaPayments.requestPayment==='function'){
               const existing=window.YahmaPayments.localByStatus('pending');
               if(existing.some(item=>String(item.carId)===String(car.id))){alert('السيارة موجودة بالفعل في قائمة «تحت الدفع».');return;}
               if(!confirm('نقل السيارة '+car.plate+' إلى «تحت الدفع» لتجديد الفحص؟')) return;
               await window.YahmaPayments.requestPayment(car);
               if(typeof window.log==='function') window.log('طلب دفع فحص','السيارة '+(car.plate||''));
               if(typeof render==='function') render();
               document.querySelector('.nav-item[data-tab="payments"]')?.click();
               return;
             }
             /* احتياطي: التخزين المحلي القديم لو الوحدة لم تتحملتش */
             const paymentQueue=readPaymentQueue();
             if(paymentQueue.some(item=>String(item.carId)===String(car.id))){alert('السيارة موجودة بالفعل في قائمة الدفع.');return;}
             if(!confirm('نقل السيارة '+car.plate+' إلى قائمة الدفع لتجديد الفحص؟')) return;
             const uName = (typeof window !== 'undefined' && ((window.YahmaPayments && typeof window.YahmaPayments.getCurrentActorName === 'function' && window.YahmaPayments.getCurrentActorName()) || window.currentUserName || (window.currentUser && window.currentUser.email))) || '';
             paymentQueue.unshift({id:'ip-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),carId:car.id,plate:car.plate||'',branch:car.branch||'',requestedAt:new Date().toISOString(),status:'pending',userName:uName});
             localStorage.setItem('yahma-inspection-payments-v1',JSON.stringify(paymentQueue));
             if(typeof window.log==='function') window.log('طلب دفع فحص','السيارة '+(car.plate||''));
             if(typeof render==='function') render();
             document.querySelector('.nav-item[data-tab="payments"]')?.click();
          } else if(btn.dataset.renewLic){
            const car=fleet.find(c=>c.id===btn.dataset.renewLic); if(!car) return;
            const newDate=prompt('تاريخ انتهاء الرخصة الجديد لـ '+car.plate+' (YYYY-MM-DD):', defaultLicenseExpiry());
            if(!newDate) return;
            car.licenseExpiry=normalizeDateValue(newDate)||newDate;
            if(!car.licenseStatus||String(car.licenseStatus).includes('منته')) car.licenseStatus='نشط';
            await saveData([car.id]); render();
          } else if(btn.dataset.renewIns){
            const car=fleet.find(c=>c.id===btn.dataset.renewIns); if(!car) return;
            if(!confirm('تعيين تأمين السيارة '+car.plate+' كـ «ساري»؟')) return;
            car.insuranceStatus='ساري'; await saveData([car.id]); render();
          }
        });
      }
      // تفويض حفظ الملاحظات مرة واحدة (وضع الفحص فقط — متوافق مع Virtualization)
      // ⚠️ أعمدة الأرقام (تسلسلي/حاسب/شركة) خلايا عرض مش inputs —
      //    القيم بتتحط بملف Excel. لو رجعت inputs، المفروض يرجع
      //    لها تفويض هنا، وما ينفعش تشوف input مش متعالَج.
      if(!tbody._renNoteDelegate){
        tbody._renNoteDelegate = true;
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
          else { try{ if(typeof window.log==='function') window.log('ملاحظة فحص','السيارة '+(car.plate||'')); }catch(_){yahmaErr(_,'renewals-ui.js:440');} }
        });
      }
    })();

    $('ren-filter-count').textContent=`عرض ${total} من ${fleet.length}`+(pageSize>0&&total>pageSize?` — صفحة ${page}`:'');
    const info=$('ren-pager-info');
    if(info){
      if(!total) info.textContent='لا نتائج';
      else info.textContent=`عرض ${startIdx+1}–${Math.min(startIdx+rows.length,total)} من ${total}`;
    }
    const pagesEl=$('ren-pager-pages');
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
    const prev=$('ren-pager-prev'), next=$('ren-pager-next');
    if(prev) prev.disabled=page<=1;
    if(next) next.disabled=page>=pages;
    document.querySelectorAll('#ren-quick .quick-filter').forEach(b=>b.classList.toggle('active',b.dataset.rq===activeRQ));
  }

  ['ren-branch','ren-car-status','ren-owner','ren-brand','ren-model','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{
    $(id)?.addEventListener('change',()=>{page=1;draw();});
  });
  (function(){let t=null;$('ren-search')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{page=1;draw()},180);});})();
  document.querySelectorAll('#ren-quick .quick-filter, .module-summary-strip [data-rq]').forEach(b=>{
    b.addEventListener('click',()=>{activeRQ=activeRQ===b.dataset.rq?'':b.dataset.rq;page=1;draw();});
  });
  $('ren-clear')?.addEventListener('click',()=>{
    ['ren-search','ren-branch','ren-car-status','ren-owner','ren-brand','ren-model','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{if($(id)) $(id).value='';});
    activeRQ=''; selectedRenIds.clear(); page=1; draw();
  });
  $('ren-pager-prev')?.addEventListener('click',()=>{page=Math.max(1,page-1);draw();});
  $('ren-pager-next')?.addEventListener('click',()=>{page++;draw();});
  $('ren-pager-size')?.addEventListener('change',e=>{pageSize=parseInt(e.target.value,10)||0;page=1;draw();});
  async function exportRen(fmt){
    const rows=getRows();
    if(!rows.length){alert('لا توجد نتائج مطابقة للفلاتر.');return;}
    const headers=insuranceMode?['رقم اللوحة','الماركة','النوع','الموديل','حالة التأمين','انتهاء التأمين','شركة التأمين','المالك','الفرع','حالة السيارة']:['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','حالة السيارة','انتهاء الرخصة','حالة الرخصة','حالة الفحص'];
    const data=rows.map(c=>insuranceMode?[
      c.plate||'',c.brand||'',c.type||'',c.model||'',
      (typeof textTag==='function'?textTag(c.insuranceStatus).label:(c.insuranceStatus||'')),
      c.insuranceExpiry||'',c.insuranceCompany||'',c.owner||'',c.branch||'',c.carStatus||''
    ]:[
      c.plate||'',c.brand||'',c.type||'',c.model||'',c.branch||'',c.owner||'',c.carStatus||'',
      c.licenseExpiry||'',(typeof dateStatus==='function'?dateStatus(c.licenseExpiry).label:(c.licenseStatus||'')),
      (typeof inspectionDisplayStatus==='function'?inspectionDisplayStatus(c.inspectionStatus).label:(c.inspectionStatus||''))
    ]);
    window._yahmaGetFilteredCars = getRows;
    if(fmt==='pdf'){
      const title=insuranceMode?'تأمين — نتائج مفلترة':'فحص ورخصة — نتائج مفلترة';
      const base=insuranceMode?'تأمين-مفلتر':'فحص-ورخصة-مفلتر';
      const name=base+'-'+new Date().toISOString().slice(0,10)+'.pdf';
      if(window.YahmaExport&&window.YahmaExport.exportTablePdf){
        window.YahmaExport.exportTablePdf({title:title,subtitle:'عدد السجلات: '+rows.length,headers:headers,rows:data,buttonId:'ren-export-pdf',filename:name});
      } else if(typeof openPrintWindow==='function') openPrintWindow(title,'عدد السجلات: '+rows.length,headers,data);
      return;
    }
    if(!(await ensureXlsxReady())){alert('مكتبة Excel غير متاحة');return;}
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
    ws['!cols']=headers.map(()=>({wch:16}));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'فحص-ورخصة');
    XLSX.writeFile(wb,'فحص-ورخصة-مفلتر-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
  }
  window._yahmaModuleExport = function(fmt){ exportRen(fmt==='pdf'?'pdf':'xlsx'); };
  window._yahmaGetFilteredCars = getRows;
  /* أزرار ren-export-* اتشالت من الشاشة (اختفى تكرار التصدير).
     الربط هنا بيفضل آمن لو رجعت تاني، والتصدير شغال من شريط yx. */
  $('ren-export-xlsx')?.addEventListener('click',()=>exportRen('xlsx'));
  $('ren-export-pdf')?.addEventListener('click',()=>exportRen('pdf'));
  $('ren-bulk-delete')?.addEventListener('click',()=>deleteRenCars([...selectedRenIds]));
  $('ren-insp-from-lic')?.addEventListener('click',bulkInspectionFromLicenses);
  $('ren-bulk-insp-yes')?.addEventListener('click',()=>bulkSetInspection('تم الفحص', true));
  $('ren-bulk-insp-no')?.addEventListener('click',()=>bulkSetInspection('لم يفحص'));
  $('ren-bulk-lic-renew')?.addEventListener('click',bulkRenewLicense);
  $('ren-bulk-lic-status')?.addEventListener('click',bulkSetLicenseStatus);
  $('ren-bulk-ins-ok')?.addEventListener('click',()=>bulkSetInsurance('ساري'));
  $('ren-bulk-ins-no')?.addEventListener('click',()=>bulkSetInsurance('لا يوجد'));
  $('ren-bulk-clear')?.addEventListener('click',()=>{selectedRenIds.clear();draw();});
  $('ren-admin-to-payments')?.addEventListener('click',()=>adminMoveSelectedCars('payments'));
  $('ren-admin-to-paid')?.addEventListener('click',()=>adminMoveSelectedCars('paid'));
  $('ren-admin-to-renewed')?.addEventListener('click',()=>adminMoveSelectedCars('renewed'));
  /* حقول كل تبويب عند رفع الشيت.
     التأمين: المطلوب يحدّث بيانات السيارة الأساسية كمان — اللون
     والمدينة والرقم التسلسلي والمالك والفرع وحالة السيارة — مش
     حالة التأمين بس. */
  const UPLOAD_FIELDS = {
    insurance: ['insuranceStatus','insuranceCompany','insuranceExpiry',
                'color','city','serial','owner','branch','carStatus'],
    license: ['licenseExpiry','licenseStatus'],
    inspection: ['inspectionStatus','serial','accountNo','companyName','notes']
  };

  $('ren-upload-btn')?.addEventListener('click',()=>$('file-ren-upload')?.click());
  $('file-ren-upload')?.addEventListener('change',async e=>{
    const file=e.target.files[0];
    if(!file) return;
    const cfg=insuranceMode?{title:'التأمين',fields:UPLOAD_FIELDS.insurance}
      :licenseMode?{title:'الرخص',fields:UPLOAD_FIELDS.license}
      :{title:'الفحص',fields:UPLOAD_FIELDS.inspection};
    await handleDomainUpdateFile(file,cfg);
    e.target.value='';
  });
  draw();
}

  global.YahmaRenewals.render = renderRenewals;
})(window);
