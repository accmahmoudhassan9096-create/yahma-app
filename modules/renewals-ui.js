(function(global){
  'use strict';

const _persistentSelectedRenIds = new Set();
let _currentRenMode = null;

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
  /* «إداري» (manager) و«مدير النظام» هما اللي بيحرّكوا السيارات بين
     مراحل الدورة الأربعة. «تشغيل» ليه زر واحد بس: تم الفحص. */
  const isManager=(typeof currentRole!=='undefined'?currentRole==='manager':(typeof window!=='undefined'&&window.currentRole==='manager'));
  const canMoveCycle=isAdmin||isManager;
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
  const readPaymentQueue=()=>{try{if(window.YahmaPayments&&typeof window.YahmaPayments.localAll==='function')return window.YahmaPayments.localAll();if(typeof loadInspectionPayments==='function')return loadInspectionPayments();const items=JSON.parse(localStorage.getItem('yahma-inspection-payments-v1')||'[]');return Array.isArray(items)?items:[];}catch(_){return [];}};
  const pendingIds=new Set(readPaymentQueue().map(item=>String(item.carId)));
  /* نفس fleetForTab بالظبط — عشان الرقم في البطاقة يطابق عدد صفوف الجدول */
  const needInsp=typeof fleetForTab==='function'?fleetForTab('renewals', fleet).filter(car=>!pendingIds.has(String(car.id))).length:getUninspectedCars().filter(car=>!pendingIds.has(String(car.id))).length;
  // سيارات لم يُفحص بالفعل في طابور الدفع — مستخبية من الفحص عشان الدورة، لكن لازم تظهر كأيقونة صغيرة
  const pendingExcluded = (() => {
    try {
      const full = (typeof window !== 'undefined' && Array.isArray(window.__yahmaFullFleet) && window.__yahmaFullFleet.length) ? window.__yahmaFullFleet : fleet;
      const reds = full.filter(c => {
        if (!pendingIds.has(String(c.id))) return false;
        try { return inspectionDisplayStatus(c.inspectionStatus).level !== 'green'; } catch (_) { return true; }
      });
      return reds.length;
    } catch (_) { return 0; }
  })();
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
        <button class="btn btn-copy-inspection" id="btn-copy-inspection" type="button">نسخ القائمة</button>
        <!-- أزرار التصدير القديمة (ren-export-*) اتشالت: شريط التصدير
             الموحّد (yx-bar) بقي هو المسؤول وهو موجود جنب زر الرفع. -->
      </div>
    </div>`}
    ${(!licenseMode&&!insuranceMode&&pendingExcluded>0)?`<div style="display:flex;justify-content:flex-end;margin:6px 0"><button type="button" id="ren-pending-info" title="${pendingExcluded} سيارة لم يُفحص بالفعل في طابور الدفع — مش ظاهرة هنا عشان الدورة: الفحص ← تحت الدفع ← تم الدفع" style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;background:rgba(217,119,6,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(217,119,6,0.28);color:#d97706;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(217,119,6,0.12)"><span style="font-size:14px">🕐</span><span>تحت الدفع: ${pendingExcluded}</span></button></div>`:''}
    <div class="filter-panel">
      <div class="filter-panel-title"><strong>🔎 فلاتر ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'}</strong><span>${isOpsInspection?'البحث في سيارات الفحص':'صفِّ النتائج حسب أي بند — ثم صدّر Excel أو PDF'}</span></div>
      ${isOpsInspection ? '' : `
      <div class="quick-filters" id="ren-quick">
        ${insuranceMode?`<button type="button" class="quick-filter" data-rq="insurance_bad">🛡️ يحتاج متابعة</button>`:licenseMode?`<button type="button" class="quick-filter" data-rq="lic_expired">🔴 منتهية</button><button type="button" class="quick-filter" data-rq="lic_soon">🟡 قريبة الانتهاء</button><button type="button" class="quick-filter" data-rq="lic_unknown">⚪ مفيش تاريخ</button>`:`<button type="button" class="quick-filter" data-rq="insp_bad">🔍 تحتاج فحص</button>${pendingExcluded>0?`<button type="button" class="quick-filter" data-rq="in_payment">🕐 قيد الدفع (${pendingExcluded})</button>`:''}`}
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
        ${(!insuranceMode)?`<label>تنتهي بطاقة خلال<select id="ren-card-exp-month"><option value="">كل الشهور</option></select></label>`:''}
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
        <button class="btn btn-ghost btn-small" id="btn-scan-console" title="وضع المسح الشامل — شاشة الرادار والمؤشر للفرع">🛰 وضع المسح الشامل</button>
      <button class="btn btn-ghost btn-small" id="ren-export-xlsx">📥 تصدير Excel</button>
      <button class="btn btn-ghost btn-small" id="ren-export-pdf">📄 تصدير PDF</button>
        <button class="btn btn-primary btn-small" id="ren-upload-btn" title="رفع شيت ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'} — ${insuranceMode?'يحدّث: حالة التأمين، الشركة، الانتهاء، اللون، المدينة، الرقم التسلسلي، المالك، الفرع، حالة السيارة':licenseMode?'يحدّث تاريخ وحالة الرخصة فقط':'يحدّث: حالة الفحص، الرقم التسلسلي، رقم الحاسب الآلي، اسم الشركة، والملاحظات'}">📥 رفع شيت ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'}</button>
        <input type="file" id="file-ren-upload" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
    </div>
    ${canBulk?`<div class="bulk-bar" id="ren-bulk-bar" style="display:none">
      <div class="bulk-bar-info"><span id="ren-bulk-count">0 محددة</span></div>
      <div class="bulk-bar-actions">
        ${insuranceMode?'<button class="btn btn-primary btn-small" id="ren-bulk-ins-ok">🛡️ تعيين «ساري»</button><button class="btn btn-ghost btn-small" id="ren-bulk-ins-no">تعيين «لا يوجد»</button>':''}
        ${(!licenseMode&&!insuranceMode)?(
          canMoveCycle
            ? '<button class="btn btn-ghost btn-small" id="ren-insp-from-lic" title="يضبط حالة الفحص من تاريخ الرخصة: منتهية ⇐ لم يفحص، سارية ⇐ تم الفحص">🔄 فحص من الرخص</button><button class="btn btn-primary btn-small" id="ren-bulk-insp-yes" title="يضبط الحالة «تم الفحص» وينقل المحددة لِتبويب «تحت الدفع» — الخطوة التالية في الدورة">✅ تم الفحص ← تحت الدفع</button><button class="btn btn-ghost btn-small" id="ren-bulk-insp-no" title="يضبط الحالة «لم يفحص» بدون نقل — السيارة بتفضل في «الفحص»">لم يُفحص</button>'
            : '<button class="btn btn-primary btn-small" id="ren-bulk-insp-yes" title="يضبط الحالة «تم الفحص» وينقل المحددة لِتبويب «تحت الدفع» تلقائيًا">✅ تم الفحص</button>'
        ):''}
        ${licenseMode?'<button class="btn btn-primary btn-small" id="ren-bulk-lic-renew">📅 تجديد الرخصة (سنة)</button><button class="btn btn-ghost btn-small" id="ren-bulk-lic-status">ضبط حالة الرخصة</button>':''}
        ${canDelete?'<button class="btn btn-danger btn-small" id="ren-bulk-delete">🗑 حذف المحددة</button>':''}
        ${canMoveCycle?`
          <div class="admin-transfer-group" style="display:inline-flex;gap:4px;align-items:center;background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:6px;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:bold;color:var(--accent,#008080)">نقل المحددة (إداري):</span>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-payments" type="button" title="نقل السيارات المحددة لتبويب «تحت الدفع»">📥 تحت الدفع</button>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-paid" type="button" title="نقل السيارات المحددة لتبويب «تم الدفع»">💵 تم الدفع</button>
            <button class="btn btn-ghost btn-small" id="ren-admin-to-renewed" type="button" title="نقل السيارات المحددة لتبويب «تم التجديد»">✅ تم التجديد</button>
          </div>
        `:""}
        <button class="btn btn-ghost btn-small" id="ren-bulk-clear">إلغاء التحديد</button>
        <button class="btn btn-primary btn-small" id="ren-upload-renewed">📥 رفع شيت التجديد</button>
        <input type="file" id="file-ren-renewed" accept=".xlsx,.xls,.csv" style="display:none">
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
  document.getElementById('ren-pending-info')?.addEventListener('click', () => {
    const btn = document.querySelector('#ren-quick [data-rq="in_payment"]');
    if (btn) {
      btn.click();
    } else {
      const target = document.querySelector('.nav-item[data-tab="payments"]');
      if (target) target.click();
    }
  });
  document.getElementById('btn-scan-console')?.addEventListener('click', () => {
    if (window.YahmaScanConsole && typeof window.YahmaScanConsole.open === 'function') {
      window.YahmaScanConsole.open(licenseMode ? 'license' : insuranceMode ? 'insurance' : 'inspection');
    }
  });
  document.getElementById('btn-copy-inspection')?.addEventListener('click', copyUninspectedList);

  const $=id=>document.getElementById(id);
  let activeRQ='', page=1, pageSize=25;
  if(_currentRenMode !== mode){ _persistentSelectedRenIds.clear(); _currentRenMode = mode; }
  const selectedRenIds = _persistentSelectedRenIds;
  const rank={red:0,amber:1,grey:2,green:3};
  const val=id=>($(id)?.value||'').trim();
  const norm=s=>String(s??'').trim();
  const eq=(a,b)=>norm(a).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا')===norm(b).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');

  function getRows(){
    const q=val('ren-search').toLowerCase();
    const isSearching = Boolean(q);
    const showInPayment = activeRQ === 'in_payment';
    return fleet.filter(c=>{
      // تبويبات الفحص والرخص والتأمين تعرض كل السيارات (الأسوأ أولًا حسب الفرز) — الفلاتر السريعة تضيّق عند الحاجة
      if(!licenseMode&&!insuranceMode){
        if(showInPayment){
          if(!pendingIds.has(String(c.id))) return false;
        } else if(!isSearching){
          if(pendingIds.has(String(c.id))) return false;
        }
      }
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
      if(!licenseMode && !insuranceMode && !activeRQ && !val('ren-insp-status') && !isSearching){
        if(inspectionDisplayStatus(c.inspectionStatus).level === 'green') return false;
      }
      if(q){
        /* نفس منطق تبويب الأسطول: أرقام اللوحة القصيرة ما تتطابقش مع
           الرقم التسلسلي. modules/utils.js: carMatchesSearch */
        if(typeof carMatchesSearch === 'function'){
          if(!carMatchesSearch(c,q)) return false;
        } else {
          const hay=[c.plate,c.brand,c.model,c.owner,c.branch,c.carStatus,c.inspectionStatus,c.insuranceCompany].map(v=>String(v||'').toLowerCase()).join(' ');
          if(!hay.includes(q)) return false;
        }
      }
      if(val('ren-branch') && !eq(c.branch,val('ren-branch'))) return false;
      if(val('ren-owner') && !eq(c.owner,val('ren-owner'))) return false;
      if(val('ren-brand') && (typeof canonicalBrand==='function'?canonicalBrand(c.brand)!==val('ren-brand'):!eq(c.brand,val('ren-brand')))) return false;
      if(val('ren-model') && !eq(c.model,val('ren-model'))) return false;
      if(val('ren-car-status') && !carStatusMatch(c.carStatus,val('ren-car-status'))) return false;
      /* فلتر انتهاء البطاقة خلال شهر محدد (yyyy-mm) */
      if(val('ren-card-exp-month') && String(c.cardExpiry||'').slice(0,7)!==val('ren-card-exp-month')) return false;
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
        if(activeRQ==='in_payment' && !pendingIds.has(String(c.id))) return false;
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
    const allRows = getRows();
    const head=$('ren-head-check');
    if(head){
      const allSelected = allRows.length > 0 && allRows.every(c => selectedRenIds.has(String(c.id)));
      head.checked = allSelected;
      head.indeterminate = selectedRenIds.size > 0 && !allSelected;
    }
  }
  function wireRenChecks(){
    const tbody=$('ren-tbody'); if(!tbody) return;
    tbody.querySelectorAll('.row-check').forEach(cb=>{
      const id = String(cb.dataset.id);
      cb.checked=selectedRenIds.has(id);
      cb.closest('tr')?.classList.toggle('is-selected', cb.checked);
    });
    const head=$('ren-head-check');
    if(head && !head._bound){
      head._bound=true;
      head.onchange=()=>{
        const allRows = getRows();
        if(head.checked) {
          allRows.forEach(c => selectedRenIds.add(String(c.id)));
        } else {
          selectedRenIds.clear();
        }
        wireRenChecks(); updateRenBulkBar();
      };
    }
    const thCheck = document.querySelector('#ren-table thead .th-check');
    if(thCheck && !thCheck._bound){
      thCheck._bound=true;
      thCheck.addEventListener('click', function(e){
        if(e.target === head) return;
        if(head){
          head.checked = !head.checked;
          head.dispatchEvent(new Event('change'));
        }
      });
    }
    updateRenBulkBar();
  }
  /* ⭐ الإجراءات الجماعية اتنقلت لملفها: modules/renewals-ui-bulk.js
     (نفس الدوال بنفس الترتيب — بس بتاخد ctx.selectedRenIds). */
  const Bulk = window.YahmaRenewalsBulk;
  const renCtx = { selectedRenIds, $: (id) => document.getElementById(id) };
  const deleteRenCars = (ids) => Bulk.deleteRenCars(renCtx, ids);
  const renSelectedCars = () => Bulk.renSelectedCars(renCtx);
  const renPlates = (cars) => Bulk.renPlates(renCtx, cars);
  const renBulkApply = (cars, mutate, doneMsg, logLabel) => Bulk.renBulkApply(renCtx, cars, mutate, doneMsg, logLabel);
  const inspectionFromLicense = (car) => Bulk.inspectionFromLicense(renCtx, car);
  const adminMoveSelectedCars = (targetTab) => Bulk.adminMoveSelectedCars(renCtx, targetTab);
  const bulkInspectionFromLicenses = () => Bulk.bulkInspectionFromLicenses(renCtx);
  const pendingCarIds = () => Bulk.pendingCarIds(renCtx);
  const bulkAdvanceToPayment = (cars) => Bulk.bulkAdvanceToPayment(renCtx, cars);
  const bulkSetInspection = (value, advanceToPayment) => Bulk.bulkSetInspection(renCtx, value, advanceToPayment);
  const bulkRenewLicense = () => Bulk.bulkRenewLicense(renCtx);
  const bulkSetLicenseStatus = () => Bulk.bulkSetLicenseStatus(renCtx);
  const bulkSetInsurance = (value) => Bulk.bulkSetInsurance(renCtx, value);
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
        ${canBulk?`<td class="td-check"><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" ${selectedRenIds.has(String(c.id))?'checked':''} aria-label="تحديد السيارة ${escapeHtml(c.plate||'—')}"></td>`: ''}
        <td class="plate">${escapeHtml(c.plate||'—')}</td>
        <td>${escapeHtml(c.brand||'—')}</td>
        <td>${escapeHtml(c.type||'—')}</td>
        <td>${escapeHtml(c.model||'—')}</td>
        <td>${escapeHtml(String(c.odometer??'').trim()||'—')}</td>
        <td>${escapeHtml(c.color||'—')}</td>
        <td>${escapeHtml(c.city||'—')}</td>
        ${(!licenseMode&&!insuranceMode)?renDataCells(c):`<td>${escapeHtml(c.serial||'—')}</td>`}
        ${(!licenseMode&&!insuranceMode)?`<td>${fmtDate(c.licenseExpiry)}</td><td><span class="tag ${lic.level}">${escapeHtml(lic.label)}</span></td><td><span class="tag ${insp.level}">${escapeHtml(insp.label)}</span>${pendingIds.has(String(c.id))?' <span class="tag amber" title="السيارة في طابور الدفع">🕐 قيد الدفع</span>':''}</td>`:''}
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
      if(!tbody._renCheckChangeBound){
        tbody._renCheckChangeBound = true;
        tbody.addEventListener('change', function(e){
          const cb = e.target.closest ? e.target.closest('.row-check') : null;
          if(!cb) return;
          const id = String(cb.dataset.id);
          if(cb.checked) selectedRenIds.add(id);
          else selectedRenIds.delete(id);
          cb.closest('tr')?.classList.toggle('is-selected', cb.checked);
          updateRenBulkBar();
        });
      }
      // تفويض أحداث الأزرار مرة واحدة (متوافق مع Virtualization)
      if(!tbody._renDelegate){
        tbody._renDelegate = true;
        tbody.addEventListener('click', async function(e){
          const btn = e.target.closest('button[data-renew-insp],button[data-renew-lic],button[data-renew-ins],button[data-del-car]');
          if(btn){
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
             return;
            }
            if(btn.dataset.renewLic){
             const car=fleet.find(c=>c.id===btn.dataset.renewLic); if(!car) return;
             const newDate=prompt('تاريخ انتهاء الرخصة الجديد لـ '+car.plate+' (YYYY-MM-DD):', defaultLicenseExpiry());
             if(!newDate) return;
             car.licenseExpiry=normalizeDateValue(newDate)||newDate;
             if(!car.licenseStatus||String(car.licenseStatus).includes('منته')) car.licenseStatus='نشط';
             await saveData([car.id]); render();
             return;
            }
            if(btn.dataset.renewIns){
             const car=fleet.find(c=>c.id===btn.dataset.renewIns); if(!car) return;
             if(!confirm('تعيين تأمين السيارة '+car.plate+' كـ «ساري»؟')) return;
             car.insuranceStatus='ساري'; await saveData([car.id]); render();
             return;
            }
            return;
          }

          /* تجاهل النقر على عناصر التحكم الأخرى */
          if(e.target.closest('button, a, select, textarea, input:not(.row-check)')) return;

          if(!canBulk) return;
          const tr = e.target.closest('tr[data-id]');
          if(!tr) return;
          const cb = tr.querySelector('.row-check');
          if(!cb || cb.disabled) return;

          const id = String(cb.dataset.id);

          /* 1) إذا كان النقر مباشرة على المربع:
             المتصفح قام بتبديل cb.checked بالفعل قبل تشغيل click.
             نقوم بتحديث القائمة والتحديد البصري فوراً من أول لمسة */
          if(e.target === cb || (e.target.matches && e.target.matches('.row-check'))){
            if(cb.checked) selectedRenIds.add(id);
            else selectedRenIds.delete(id);
            tr.classList.toggle('is-selected', cb.checked);
            updateRenBulkBar();
            return;
          }

          /* 2) إذا كان النقر على الخلية (.td-check) أو في أي مكان على السطر:
             نقوم بتبديل المربع برمجياً وتحديث التحديد فوراً */
          cb.checked = !cb.checked;
          if(cb.checked) selectedRenIds.add(id);
          else selectedRenIds.delete(id);
          tr.classList.toggle('is-selected', cb.checked);
          updateRenBulkBar();
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
    /* خيارات فلتر انتهاء البطاقة — شهور حقيقية من البيانات */
    const sel=$('ren-card-exp-month');
    if(sel){
      const kept=sel.value;
      const months=[...new Set(fleet.map(c=>{const d=String(c.cardExpiry||'');const m=d.match(/^(\d{4}-\d{2})/);return m?m[1]:'';}).filter(Boolean))].sort();
      const names=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      sel.innerHTML='<option value="">كل الشهور</option>'+months.map(ym=>`<option value="${ym}"${ym===kept?' selected':''}>${names[Number(ym.slice(5,7))-1]||ym} ${ym.slice(0,4)}</option>`).join('');
    }
  }

  ['ren-branch','ren-car-status','ren-card-exp-month','ren-owner','ren-brand','ren-model','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{
    $(id)?.addEventListener('change',()=>{page=1;draw();});
  });
  (function(){let t=null;$('ren-search')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{page=1;draw()},180);});})();
  document.querySelectorAll('#ren-quick .quick-filter, .module-summary-strip [data-rq]').forEach(b=>{
    b.addEventListener('click',()=>{activeRQ=activeRQ===b.dataset.rq?'':b.dataset.rq;page=1;draw();});
  });
  $('ren-clear')?.addEventListener('click',()=>{
    ['ren-search','ren-branch','ren-car-status','ren-card-exp-month','ren-owner','ren-brand','ren-model','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{if($(id)) $(id).value='';});
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
  $("ren-upload-renewed")?.addEventListener('click',()=>{const fi=$("file-ren-renewed");if(fi){fi.click();}});
  /* زر «رفع شيت التجديد»: الملف فيه لوحات سيارات خلص رخصها.
     بنمطق اللوحة بكل صيغها (عادي ومعكوس زي ملف التنازلات)،
     واللي لسه في «تم الدفع» بنسجّلها «تم التجديد» فتشال من
     «تم الدفع» وظهرت هنا. اللي في «تحت الدفع» مش بيتنقل تلقائي —
     قاعدة «النقل يديوي بس»، لازم تنقلها من الشريط الجماعي الأول. */
  $('file-ren-renewed')?.addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); e.target.value=''; return; }
    let rows;
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:true});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    }catch(err){ alert('تعذر قراءة الملف. تأكد أنه ملف إكسيل أو CSV صحيح.'); e.target.value=''; return; }
    e.target.value='';
    if(!Array.isArray(rows)||!rows.length){ alert('الملف فارغ أو لا يحتوي على بيانات.'); return; }
    const normH=s=>String(s??'').replace(/[ً-ْ]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,'').trim().toLowerCase();
    const plateKeys=['رقماللوحه','اللوحه','رقمالسياره','السياره','رقمالسيارة'];
    const pCol=Object.keys(rows[0]||{}).find(h=>plateKeys.includes(normH(h)));
    if(!pCol){ alert('مفيش عمود «رقم اللوحة» (أو «رقم السيارة») في الملف.'); return; }
    const P=window.YahmaPayments;
    if(!P||typeof P.markLicenseRenewed!=='function'){ alert('مخزن الدفعات غير مجهّز.'); return; }
    const variantOf=(window.YahmaFleetExcel&&window.YahmaFleetExcel.transferPlateVariants)?window.YahmaFleetExcel.transferPlateVariants:(p)=>[normalizePlateKey(p)];
    /* عمود تاريخ الرخصة الجديد اختياري — لو موجود نستعمله بدل التاريخ المقترح (+3 سنين) */
    const dateKeys=['انتهاءالرخصه','تاريخانتهاءالرخصه','انتهاءالرخصهالجديد','تاريخالرخصه','الرخصه'];
    const dCol=Object.keys(rows[0]||{}).find(h=>dateKeys.includes(normH(h)))||null;
    const carOf=p=>fleet.find(c=>String(c.id)===String(p.carId));
    const paidNotRen=P.localByStatus('paid').filter(p=>!P.isRenewed(p));
    const alreadyRen=P.localByStatus('paid').filter(P.isRenewed);
    const pend=P.localByStatus('pending');
    const mapBy=new Map(list=>{const m=new Map();list.forEach(p=>{const c=carOf(p);if(!c)return;variantOf(c.plate).forEach(k=>{if(k&&!m.has(k))m.set(k,p);});});return m;});
    const paidMap=mapBy(paidNotRen), renMap=mapBy(alreadyRen), pendMap=mapBy(pend);
    const hits=[],pendHits=[],already=[],misses=[];
    rows.forEach(r=>{
      const plate=String(r[pCol]??'').trim(); if(!plate) return;
      const vs=variantOf(plate);
      const renHit=vs.map(k=>renMap.get(k)).find(Boolean);
      if(renHit){ already.push(plate); return; }
      const paidHit=vs.map(k=>paidMap.get(k)).find(Boolean);
      if(paidHit){ hits.push({row:paidHit,car:carOf(paidHit),plate,licDate:dCol?String(r[dCol]??'').trim():''}); return; }
      if(vs.map(k=>pendMap.get(k)).find(Boolean)){ pendHits.push(plate); return; }
      misses.push(plate);
    });
    if(!hits.length&&!already.length&&!pendHits.length&&!misses.length){ alert('مفيش أرقام لوحات مقروءة في عمود «رقم اللوحة».'); return; }
    if(!hits.length){
      alert('مفيش سيارة من الملف موجودة في «تم الدفع» حاليًا.\n'
        +(pendHits.length?('في «تحت الدفع» ('+pendHits.length+' سيارة) — لازم تنقلها يدوي للـ «تم الدفع» الأول من الشريط الجماعي.\n'):'')
        +(already.length?('متجددة من قبل: '+already.length+'.\n'):'')
        +(misses.length?('مش موجودة في الأسطول: '+misses.length+' — آخرها '+misses.slice(0,5).join('، ')):''));
      return;
    }
    const ok=confirm('معاينة رفع شيت التجديد:\n'
      +'• موجودة في «تم الدفع» → هتسجّل «تم التجديد»: '+hits.length+'\n'
      +(pendHits.length?('• في «تحت الدفع» (مش هتتنقل تلقائي — انقلها يدوي): '+pendHits.length+'\n'):'')
      +(already.length?('• متجددة من قبل (هتتجاهل): '+already.length+'\n'):'')
      +(misses.length?('• مش موجودة (هتتجاهل): '+misses.length+'\n'):'')
      +'\nمتابعة؟');
    if(!ok) return;
    /* نداء واحد للمنطق: بيمشي من المسار الموحّد
       PAY_ITEM_ACTION.renew — يسجّل الحالة القديمة + تاريخ الرخصة
       + سجل «تم التجديد»، مش مكالمتين منفصلتين. */
    if(!window.PAY_ITEM_ACTION||typeof window.PAY_ITEM_ACTION.renew!=='function'){
      alert('مسار التجديد غير مجهّز (router-payments-item.js مش محمّل). اعمل تحديث للصفحة.');
      return;
    }
    let done=0,failed=0,skipped=0;
    for(const h of hits){
      try{
        const r=await window.PAY_ITEM_ACTION.renew(h.row,h.car,{quiet:true,licenseExpiry:h.licDate||undefined});
        if(r==='done') done++; else skipped++;
      }
      catch(err){ failed++; try{yahmaErr(err,'renewals-ui.js:file-ren-renewed');}catch(_){console.error(err);} }
    }
    try{ if(typeof P.sync==='function') await P.sync(); }catch(_){}
    if(typeof render==='function') render();
    alert('تم تسجيل «تم التجديد»: '+done+' سيارة'
      +(failed?(" — فشل "+failed):'')
      +(skipped?(" — اتخطت "+skipped):'')
      +(already.length?('\nمتجددة من قبل: '+already.length):'')
      +(pendHits.length?('\nفي «تحت الدفع» مش اتأثرت ('+pendHits.length+') — انقلها يدوي لو عايز.'):'')
      +(misses.length?('\nمش موجودة: '+misses.length+' — آخرها '+misses.slice(0,5).join('، ')):''));
  });
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
