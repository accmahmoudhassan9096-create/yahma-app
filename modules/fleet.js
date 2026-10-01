/**
 * modules/fleet.js — واجهة الأسطول والفلترة والجاهزية والتصدير
 */
(function (global) {
  'use strict';

  function getFleet() {
    return Array.isArray(global.fleet) ? global.fleet : [];
  }

  // نتائج البحث الموحّد (الشريط العلوي) — نحفظها على مستوى الـ module لأن
  // renderFleet بتبني الـ input من جديد في كل رسم، فلو خزّناها جوه الدالة
  // كانت بتضيع مع أول إعادة رسم تانية (كان المستخدم يكتب في البحث، يتنقل،
  // ويرجع يلاقي الصندوق فاضي من غير ما الفلتر يتطبق أصلًا).
  let globalSearchValue = '';

  function readinessStats() {
    if (typeof global.readinessStats === 'function') return global.readinessStats();
    const list = getFleet();
    let ready = 0;
    list.forEach(function (c) {
      try {
        if (typeof global.vehicleReadiness === 'function' && global.vehicleReadiness(c).ready) ready++;
      } catch (e) {}
    });
    const total = list.length;
    return { total: total, ready: ready, pct: total ? Math.round((ready / total) * 100) : 0 };
  }

  function uniqueFieldValues(cars, field) {
    const values = new Map();
    (Array.isArray(cars) ? cars : []).forEach(car => {
      const raw = String(car[field] == null ? '' : car[field]).trim();
      if (!raw) return;
      const key = raw.replace(/[يى]/g, 'ي').replace(/أ|إ|آ/g, 'ا');
      if (!values.has(key)) values.set(key, raw);
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
  }

  function optionList(items, placeholder, escape) {
    const safe = typeof escape === 'function' ? escape : value => String(value == null ? '' : value);
    return '<option value="">' + safe(placeholder) + '</option>' + (items || []).map(value => '<option value="' + safe(value) + '">' + safe(value) + '</option>').join('');
  }

  function createFilterEngine(options) {
    let cachedKey = null;
    let cachedRows = null;

    function matchesQuick(car, quick, helpers) {
      const hasCardIssue = helpers.cardState(car).level !== 'green';
      const hasLicenseIssue = helpers.licenseState(car).level !== 'green';
      const hasInspectionIssue = helpers.inspectionState(car).level !== 'green';
      const status = String(car.carStatus || '');
      if (quick === 'inspection_only') return hasInspectionIssue;
      if (quick === 'license_only') return hasLicenseIssue;
      if (quick === 'card_only') return hasCardIssue;
      if (quick === 'any_doc') return hasCardIssue || hasLicenseIssue || hasInspectionIssue;
      if (quick === 'ready') return helpers.vehicleReadiness(car).ready;
      if (quick === 'maintenance') return status.includes('صيانة');
      if (quick === 'out') return carStatusOut(status);
      if (quick === 'not_ready') return !helpers.vehicleReadiness(car).ready;
      return true;
    }

    function getRows() {
      const cars = options.getCars();
      const rawSearch = options.getSearch() || '';
      const query = rawSearch.trim().toLowerCase();
      const quick = options.getQuick() || '';
      const filters = options.getFilters();
      const values = [rawSearch, quick, ...Object.keys(filters).sort().map(key => filters[key]), cars.length];
      const key = values.join('\x1f');
      if (cachedKey === key && cachedRows) return cachedRows;

      const needsStatus = !!(filters.cardCondition || filters.licenseCondition || filters.inspectionCondition || filters.prepStatus || quick);
      const rows = [];
      for (const car of cars) {
        if (filters.brand && car.brand !== filters.brand) continue;
        if (filters.type && car.type !== filters.type) continue;
        if (filters.model && car.model !== filters.model) continue;
        if (filters.year && String(car.model || '') !== filters.year) continue;
        if (filters.cardStatus && String(car.cardStatus || '') !== filters.cardStatus) continue;
        if (filters.licenseStatus && String(car.licenseStatus || '') !== filters.licenseStatus) continue;
        if (filters.inspectionStatus && String(car.inspectionStatus || '') !== filters.inspectionStatus) continue;
        if (filters.owner && car.owner !== filters.owner) continue;
        if (filters.branch && car.branch !== filters.branch) continue;
        if (filters.carStatus && car.carStatus !== filters.carStatus) continue;
        if (query) {
          if (!car._searchHay) {
            car._searchHay = [car.plate, car.brand, car.type, car.model, car.serial,
              car.cardNumber, car.owner, car.branch, car.carStatus]
              .map(value => String(value || '').toLowerCase()).join(' ');
          }
          if (!car._searchHay.includes(query)) continue;
        }
        if (needsStatus) {
          if (filters.cardCondition && options.helpers.cardState(car).level !== filters.cardCondition) continue;
          if (filters.licenseCondition && options.helpers.licenseState(car).level !== filters.licenseCondition) continue;
          if (filters.inspectionCondition && options.helpers.inspectionState(car).level !== filters.inspectionCondition) continue;
          if (filters.prepStatus && options.helpers.prepStatus(car).level !== filters.prepStatus) continue;
          if (quick && !matchesQuick(car, quick, options.helpers)) continue;
        }
        rows.push(car);
      }
      cachedKey = key;
      cachedRows = rows;
      return rows;
    }

    return { getRows: getRows, invalidate: function () { cachedKey = null; cachedRows = null; } };
  }

  function render(content, cars) {
    renderFleet(content, cars);
  }

  function renderFleet(content, cars){
  const fleet = Array.isArray(cars) ? cars : [];
  document.getElementById('topbar-title').textContent='إدارة الأسطول';
  document.getElementById('topbar-sub').textContent = fleet.length + ' سيارة — إدارة الجاهزية للتأجير';
  const fleetStats=readinessStats();
  const fleetAttention=Math.max(0, fleetStats.total-fleetStats.ready-fleetStats.out);
  const uniq=(field)=>{
    const map=new Map(); // normalized -> display
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
  content.innerHTML=`
    <div class="fleet-summary-strip" aria-label="ملخص حالة الأسطول">
      <button type="button" class="fleet-summary-card total" data-fleet-quick="all"><span class="fleet-summary-icon">🚗</span><span><b>${fleetStats.total}</b><small>إجمالي السيارات</small></span></button>
      <button type="button" class="fleet-summary-card ready" data-fleet-quick="ready"><span class="fleet-summary-icon">✓</span><span><b>${fleetStats.ready}</b><small>جاهزة للتأجير</small></span></button>
      <button type="button" class="fleet-summary-card attention" data-fleet-quick="not_ready"><span class="fleet-summary-icon">!</span><span><b>${fleetAttention}</b><small>تحتاج إجراء</small></span></button>
      <button type="button" class="fleet-summary-card out" data-fleet-quick="out"><span class="fleet-summary-icon">×</span><span><b>${fleetStats.out}</b><small>خارج الخدمة</small></span></button>
    </div>
    <div class="fleet-tools-head">
      <div class="fleet-search-wrap"><span>⌕</span><input id="fleet-search" aria-label="بحث في الأسطول" placeholder="ابحث برقم اللوحة، الماركة، النوع، الموديل، الشاسيه، المالك أو الفرع..."></div>
      <div class="view-toggle" id="fleet-view-toggle">
        <button type="button" class="active" data-view="table">جدول</button>
        <button type="button" data-view="cards">كروت</button>
      </div>
      <button class="btn btn-excel-export" id="fleet-export-filtered" title="تصدير النتائج المفلترة Excel">📊 Excel</button>
      <button class="btn btn-ghost" id="fleet-export-pdf" title="تصدير النتائج المفلترة PDF">📄 PDF</button>
      <button class="btn btn-ghost" id="fleet-clear-filters" title="إلغاء جميع الفلاتر">↺ مسح الفلاتر</button>
    </div>
    <div class="bulk-bar" id="bulk-bar" style="display:none">
      <div class="bulk-bar-info">
        <label class="bulk-check-all"><input type="checkbox" id="bulk-select-all"> تحديد الكل الظاهر</label>
        <span id="bulk-count">0 محددة</span>
      </div>
      <div class="bulk-bar-actions">
        <button class="btn btn-primary btn-small" id="bulk-renew-license">تجديد الرخصة</button>
        <button class="btn btn-ghost btn-small" id="bulk-renew-card">تجديد الكارت</button>
        <button class="btn btn-ghost btn-small" id="bulk-set-status">تغيير الحالة</button>
        <button class="btn btn-ghost btn-small" id="bulk-set-inspection">تحديث الفحص</button>
        <button class="btn btn-ghost btn-small" id="bulk-export">تصدير المحددة</button>
        <button class="btn btn-danger btn-small" id="bulk-mark-sold">بيع / حذف المحددة</button>
        <button class="btn btn-danger btn-small" id="bulk-clear-sel">إلغاء التحديد</button>
      </div>
    </div>
    <div class="filter-panel" id="fleet-filter-panel">
      <div class="filter-panel-title"><div><strong>🔎 فلاتر الأسطول</strong><span>كل فلتر مستقل ويمكن دمج أكثر من فلتر معًا</span></div><button type="button" class="btn btn-ghost btn-small fleet-filter-toggle" id="fleet-filter-toggle" aria-expanded="false">إظهار الفلاتر <span aria-hidden="true">⌄</span></button></div>
      <div class="filter-panel-body" id="fleet-filter-body">
      <div class="quick-filters">
        <button type="button" class="quick-filter" data-quick="inspection_only">🔍 تحتاج فحص</button>
        <button type="button" class="quick-filter" data-quick="license_only">📄 رخصة تحتاج متابعة</button>
        <button type="button" class="quick-filter" data-quick="card_only">🪪 كارت يحتاج متابعة</button>
        <button type="button" class="quick-filter" data-quick="any_doc">⚠️ أي وثيقة</button>
        <button type="button" class="quick-filter" data-quick="ready">🟢 جاهزة للتأجير</button>
        <button type="button" class="quick-filter" data-quick="not_ready">🔴 غير جاهزة</button>
        <button type="button" class="quick-filter" data-quick="maintenance">🔧 تحت الصيانة</button>
        <button type="button" class="quick-filter" data-quick="out">⛔ خارج الخدمة</button>
      </div>
      <div class="fleet-filter-grid">
        <label>الماركة<select id="ff-brand">${optionList(uniq('brand'),'كل الماركات')}</select></label>
        <label>النوع<select id="ff-type">${optionList(uniq('type'),'كل الأنواع')}</select></label>
        <label>الموديل (السنة)<select id="ff-model">${optionList(uniq('model'),'كل الموديلات')}</select></label>
        <label>حالة البطاقة<select id="ff-card-status"><option value="">كل الحالات</option><option>نشط</option><option>ملغى</option><option>موقوف</option></select></label>
        <label>صلاحية البطاقة<select id="ff-card-condition"><option value="">كل الحالات</option><option value="green">🟢 سارية</option><option value="amber">🟡 قريبة الانتهاء</option><option value="red">🔴 منتهية / غير سارية</option></select></label>
        <label>حالة الرخصة<select id="ff-license-status"><option value="">كل الحالات</option><option>نشط</option><option>ملغى</option><option>موقوف</option><option>منتهي</option></select></label>
        <label>صلاحية الرخصة<select id="ff-license-condition"><option value="">كل الحالات</option><option value="green">🟢 سارية</option><option value="amber">🟡 قريبة الانتهاء</option><option value="red">🔴 منتهية / غير سارية</option></select></label>
        <label>حالة الفحص<select id="ff-inspection-status"><option value="">كل الحالات</option><option>سليم</option><option>يحتاج فحص</option><option>لم يتم الفحص</option></select></label>
        <label>نتيجة الفحص<select id="ff-inspection-condition"><option value="">كل الحالات</option><option value="green">🟢 سليم</option><option value="amber">🟡 يحتاج فحص</option><option value="red">🔴 غير سليم / لم يتم الفحص</option></select></label>
        <label>المالك<select id="ff-owner">${optionList(uniq('owner'),'كل الملاك')}</select></label>
        <label>الفرع<select id="ff-branch">${optionList(uniq('branch'),'كل الفروع')}</select></label>
        <label>المدينة<select id="ff-city">${optionList(uniq('city'),'كل المدن')}</select></label>
        <label>حالة السيارة<select id="ff-car-status"><option value="">كل الحالات</option><option>تحت الصيانة</option><option>حجز</option><option>متاحة للايجار</option><option>محولة غير مستلمة</option><option>مسروقة</option><option>للبيع</option><option>مؤجرة</option></select></label>
        <label>حالة التجهيز<select id="ff-prep-status"><option value="">كل الحالات</option><option value="green">جاهزة للتأجير</option><option value="amber">تحت التجهيز</option><option value="red">تحتاج إجراء</option><option value="blue">مراجعة نهائية</option></select></label>
      </div>
      <div class="filter-footer"><span id="fleet-filter-count">عرض 0 من ${fleet.length}</span><span id="fleet-filter-note">يمكنك اختيار الفحص فقط أو الرخصة فقط أو الكارت فقط لتحديد السيارات التي تحتاج إجراء محدد.</span></div>
      </div>
    </div>
    <div class="table-scroll fleet-table-wrap" id="fleet-scroll">
      <table class="fleet-table"><thead><tr>
        <th class="th-check"><input type="checkbox" id="bulk-head-check" aria-label="تحديد الكل" title="تحديد الكل"></th>
        <th>رقم اللوحة</th><th>الماركة</th><th>النوع</th><th>الموديل</th><th>اللون</th><th>الرقم التسلسلي</th><th>رقم البطاقة</th><th>حالة البطاقة</th><th>تاريخ نهاية البطاقة</th><th>حالة الرخصة</th><th>تاريخ نهاية الرخصة</th><th>حالة الفحص</th><th>المالك</th><th>الفرع</th><th>المدينة</th><th>حالة السيارة</th><th>حالة التجهيز</th><th>الملف</th>
      </tr></thead><tbody id="fleet-tbody"></tbody></table>
    </div>
    <div class="fleet-cards" id="fleet-cards"></div>
    <div class="pager" id="fleet-pager">
      <div class="pager-info" id="pager-info">—</div>
      <div class="pager-controls">
        <button class="btn btn-ghost btn-small" id="pager-first" title="الأولى">«</button>
        <button class="btn btn-ghost btn-small" id="pager-prev" title="السابق">‹</button>
        <div class="pager-pages" id="pager-pages"></div>
        <button class="btn btn-ghost btn-small" id="pager-next" title="التالي">›</button>
        <button class="btn btn-ghost btn-small" id="pager-last" title="الأخيرة">»</button>
      </div>
      <label class="pager-size">عرض
        <select id="pager-size">
          <option value="10">10</option>
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="100">100 (حد أقصى سلس)</option>
        </select>
      </label>
    </div>`;

  const $=id=>document.getElementById(id);
  const search=$('fleet-search');
  const filters=['ff-brand','ff-type','ff-model','ff-card-status','ff-card-condition','ff-license-status','ff-license-condition','ff-inspection-status','ff-inspection-condition','ff-owner','ff-branch','ff-city','ff-car-status','ff-prep-status'].map($);
  let activeQuick=window.pendingFleetQuickFilter||'';
  window.pendingFleetQuickFilter='';
  // نتائج البحث الموحّد في الشريط العلوي (يكتبه dashboard عند الضغط على Enter)
  const pendingGlobalSearch=String(window.pendingFleetSearch||'').trim();
  window.pendingFleetSearch='';
  if(pendingGlobalSearch) globalSearchValue=pendingGlobalSearch;
  if(globalSearchValue && search && !search.value) search.value=globalSearchValue;
  if(search && !search._globBound){
    search._globBound=true;
    // أي تعديل يدوي للمستخدم يصبح هو الحالة الجديدة (وقطع البحث بالمسح يفضل مسحًا)
    search.addEventListener('input',()=>{ globalSearchValue=(search.value||'').trim(); });
  }
  let currentPage=1;
  let pageSize=25;
  /* كاش الفلترة — التنقل بين الصفحات لا يعيد حساب كل الأسطول */
  let _filterCacheKey = null;
  let _filterCacheRows = null;
  function _fleetFilterKey(){
    try{
      return [
        (search&&search.value)||'',
        activeQuick||'',
        val('ff-brand'),val('ff-type'),val('ff-model'),
        val('ff-card-status'),val('ff-card-condition'),
        val('ff-license-status'),val('ff-license-condition'),
        val('ff-inspection-status'),val('ff-inspection-condition'),
        val('ff-owner'),val('ff-branch'),val('ff-city'),val('ff-car-status'),val('ff-prep-status'),
        fleet.length
      ].join('\x1f');
    }catch(e){ return String(Date.now()); }
  }
  const selectedIds=new Set();
  const val=id=>($(id).value||'').trim();
  function updateBulkBar(){
    const bar=$('bulk-bar');
    const n=selectedIds.size;
    if(!bar) return;
    bar.style.display = n>0 ? 'flex' : 'none';
    const cnt=$('bulk-count');
    if(cnt) cnt.textContent = n + ' محددة';
    const head=$('bulk-head-check');
    const allVisible=getFilteredRows();
    if(head){
      head.checked = allVisible.length>0 && allVisible.every(c=>selectedIds.has(c.id));
      head.indeterminate = selectedIds.size>0 && !head.checked;
    }
    const selAll=$('bulk-select-all');
    if(selAll) selAll.checked = head ? head.checked : false;
  }
  function getSelectedCars(){
    return fleet.filter(c=>selectedIds.has(c.id));
  }
  async function bulkRenewLicense(){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const defaultDate=addDays(todayStr(),365);
    const newDate=prompt('تاريخ انتهاء الرخصة الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', defaultDate);
    if(!newDate) return;
    const normalized=normalizeDateValue(newDate)||newDate;
    cars.forEach(c=>{ c.licenseExpiry=normalized; if(!c.licenseStatus||c.licenseStatus==='منتهي') c.licenseStatus='نشط'; });
    const ids=cars.map(c=>c.id);
    selectedIds.clear();
    await saveData(ids); draw(); updateBulkBar();
    alert('تم تجديد رخصة '+cars.length+' سيارة');
  }
  async function bulkRenewCard(){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const defaultDate=addDays(todayStr(),365);
    const newDate=prompt('تاريخ انتهاء الكارت الجديد لـ '+cars.length+' سيارة (YYYY-MM-DD):', defaultDate);
    if(!newDate) return;
    const normalized=normalizeDateValue(newDate)||newDate;
    cars.forEach(c=>{ c.cardExpiry=normalized; if(!c.cardStatus||c.cardStatus.includes('ملغ')||c.cardStatus.includes('موقوف')) c.cardStatus='نشط'; });
    const ids=cars.map(c=>c.id);
    selectedIds.clear();
    await saveData(ids); draw(); updateBulkBar();
    alert('تم تجديد كارت '+cars.length+' سيارة');
  }
  async function bulkSetStatus(){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const status=prompt('الحالة الجديدة (نشط / تحت الصيانة / خارج الخدمة):', 'نشط');
    if(!status) return;
    const allowed=['نشط','تحت الصيانة','خارج الخدمة'];
    const s=status.trim();
    if(!allowed.includes(s)){ alert('الحالة يجب أن تكون: نشط أو تحت الصيانة أو خارج الخدمة'); return; }
    cars.forEach(c=>{ c.carStatus=s; });
    const ids=cars.map(c=>c.id);
    selectedIds.clear();
    await saveData(ids); draw(); updateBulkBar();
    alert('تم تحديث حالة '+cars.length+' سيارة');
  }
  async function bulkSetInspection(){
    const cars=getSelectedCars();
    if(!cars.length) return;
    const status=prompt('حالة الفحص الجديدة (سليم / يحتاج فحص / لم يتم الفحص):', 'سليم');
    if(!status) return;
    const allowed=['سليم','يحتاج فحص','لم يتم الفحص'];
    const s=status.trim();
    if(!allowed.includes(s)){ alert('القيمة يجب أن تكون: سليم أو يحتاج فحص أو لم يتم الفحص'); return; }
    cars.forEach(c=>{ c.inspectionStatus=s; });
    const ids=cars.map(c=>c.id);
    selectedIds.clear();
    await saveData(ids); draw(); updateBulkBar();
    alert('تم تحديث فحص '+cars.length+' سيارة');
  }
  function bulkExportSelected(){
    const cars=getSelectedCars();
    if(!cars.length){ alert('لا توجد سيارات محددة'); return; }
    exportRows(cars);
  }

  const cardState=c=>cardDisplayStatus(c.cardExpiry,c.cardStatus);
  const licenseState=c=>licenseDisplayStatus(c.licenseExpiry);
  const inspectionState=c=>inspectionDisplayStatus(c.inspectionStatus);
  const docIssueCount=c=>[cardState(c),licenseState(c),inspectionState(c)].filter(s=>s.level!=='green').length;
  const matchesQuick=(c,q)=>{
    const card=cardState(c).level!=='green';
    const lic=licenseState(c).level!=='green';
    const insp=inspectionState(c).level!=='green';
    const status=String(c.carStatus||'');
    // الفلاتر السريعة: تعرض كل السيارات التي لديها المشكلة (وليس الحصرية فقط)
    if(q==='inspection_only') return insp;
    if(q==='license_only') return lic;
    if(q==='card_only') return card;
    if(q==='any_doc') return card||lic||insp;
    if(q==='ready') return vehicleReadiness(c).ready;
    if(q==='maintenance') return status.includes('صيانة');
    if(q==='out') return carStatusOut(status);
    if(q==='not_ready') return !vehicleReadiness(c).ready;
    return true;
  };
  function getFilteredRows(){
    
    const _ck=_fleetFilterKey();
    if(_filterCacheKey===_ck && _filterCacheRows) return _filterCacheRows;
const q=(search.value||'').trim().toLowerCase();
    const fBrand=val('ff-brand'), fType=val('ff-type'), fModel=val('ff-model');
    const fCardSt=val('ff-card-status'), fCardCond=val('ff-card-condition');
    const fLicSt=val('ff-license-status'), fLicCond=val('ff-license-condition');
    const fInspSt=val('ff-inspection-status'), fInspCond=val('ff-inspection-condition');
    const fOwner=val('ff-owner'), fBranch=val('ff-branch'), fCity=val('ff-city'), fCarSt=val('ff-car-status'), fPrep=val('ff-prep-status');
    const needStatus = !!(fCardCond || fLicCond || fInspCond || fPrep || activeQuick);
    const rows=[];
    const n=fleet.length;
    for(let i=0;i<n;i++){
      const c=fleet[i];
      if(fBrand && (typeof canonicalBrand==='function'?canonicalBrand(c.brand)!==fBrand:c.brand!==fBrand)) continue;
      if(fType && c.type!==fType) continue;
      if(fModel && c.model!==fModel) continue;
      if(fCardSt && String(c.cardStatus||'')!==fCardSt) continue;
      if(fLicSt && String(c.licenseStatus||'')!==fLicSt) continue;
      if(fInspSt && String(c.inspectionStatus||'')!==fInspSt) continue;
      if(fOwner && c.owner!==fOwner) continue;
      if(fBranch && c.branch!==fBranch) continue;
      if(fCity && String(c.city||'')!==fCity) continue;
      if(fCarSt && !carStatusMatch(c.carStatus,fCarSt)) continue;
      if(q){
        if(!c._searchHay){
          c._searchHay=[c.plate,c.brand,c.type,c.model,c.city,c.serial,c.cardNumber,c.owner,c.branch,c.carStatus].map(v=>String(v||'').toLowerCase()).join(' ');
        }
        if(!c._searchHay.includes(q)) continue;
      }
      if(needStatus){
        if(fCardCond && cardState(c).level!==fCardCond) continue;
        if(fLicCond && licenseState(c).level!==fLicCond) continue;
        if(fInspCond && inspectionState(c).level!==fInspCond) continue;
        if(fPrep && prepStatusForCar(c).level!==fPrep) continue;
        if(activeQuick && !matchesQuick(c,activeQuick)) continue;
      }
      rows.push(c);
    }
    _filterCacheKey=_ck; _filterCacheRows=rows;
    return rows;
  }
  window._yahmaCurrentPdfData=()=>({title:'نتائج الأسطول المفلترة',subtitle:'عدد السيارات: '+getFilteredRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','حالة السيارة','الجاهزية','الرخصة','الفحص','الكارت'],rows:getFilteredRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',vehicleReadiness(c).label,licenseState(c).label,inspectionState(c).label,cardState(c).label])});
  async function exportRows(rows){
    if(!rows.length){alert('لا توجد سيارات مطابقة للفلاتر لتصديرها.');return;}
    if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
    const headers=['رقم اللوحة','الماركة','النوع','الموديل','الرقم التسلسلي','رقم البطاقة','حالة البطاقة','تاريخ نهاية البطاقة','حالة الرخصة','تاريخ نهاية الرخصة','حالة الفحص','المالك','الفرع','حالة السيارة','حالة التجهيز'];
    const data=rows.map(c=>[c.plate,c.brand,c.type,c.model,c.serial,c.cardNumber,cardState(c).label,c.cardExpiry,c.licenseStatus, c.licenseExpiry,inspectionState(c).label,c.owner,c.branch,c.carStatus,prepStatusForCar(c).label]);
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
    ws['!cols']=headers.map((_,i)=>({wch:[18,15,15,16,24,18,18,19,18,19,18,20,18,18][i]||18}));
    ws['!autofilter']={ref:`A1:N${data.length+1}`};
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'نتائج الفلترة');
    XLSX.writeFile(wb,`سيارات-الأسطول-المفلترة-${todayStr()}.xlsx`);
  }
  function draw(){
    const allRows=getFilteredRows(),tb=$('fleet-tbody');
    const cardsEl=$('fleet-cards');
    const total=allRows.length;
    const size=pageSize>0?pageSize:total||1;
    const totalPages=Math.max(1, Math.ceil((total||1)/size));
    if(currentPage>totalPages) currentPage=totalPages;
    if(currentPage<1) currentPage=1;
    const start=(currentPage-1)*size;
    const rows=pageSize>0?allRows.slice(start, start+size):allRows;

    // Pager UI
    const pagerInfo=$('pager-info');
    if(pagerInfo){
      if(!total) pagerInfo.textContent='لا نتائج';
      else {
        const from=start+1, to=Math.min(start+rows.length, total);
        pagerInfo.textContent=`عرض ${from}–${to} من ${total}`;
      }
    }
    const pagesEl=$('pager-pages');
    if(pagesEl){
      // show window of page buttons
      let htmlPages='';
      const windowSize=5;
      let pStart=Math.max(1, currentPage-Math.floor(windowSize/2));
      let pEnd=Math.min(totalPages, pStart+windowSize-1);
      pStart=Math.max(1, pEnd-windowSize+1);
      if(pStart>1) htmlPages+=`<button class="pager-num" data-page="1">1</button>${pStart>2?'<span class="pager-ellipsis">…</span>':''}`;
      for(let p=pStart;p<=pEnd;p++){
        htmlPages+=`<button class="pager-num ${p===currentPage?'active':''}" data-page="${p}">${p}</button>`;
      }
      if(pEnd<totalPages) htmlPages+=`${pEnd<totalPages-1?'<span class="pager-ellipsis">…</span>':''}<button class="pager-num" data-page="${totalPages}">${totalPages}</button>`;
      pagesEl.innerHTML=htmlPages;
      pagesEl.querySelectorAll('.pager-num').forEach(b=>b.onclick=()=>{ currentPage=+b.dataset.page; draw(); });
    }
    const disablePrev=currentPage<=1;
    const disableNext=currentPage>=totalPages;
    ['pager-first','pager-prev'].forEach(id=>{ const el=$(id); if(el) el.disabled=disablePrev; });
    ['pager-next','pager-last'].forEach(id=>{ const el=$(id); if(el) el.disabled=disableNext; });

    // Virtualization: رسم الصفوف الظاهرة فقط داخل #fleet-scroll
    (function(){
      const scrollEl = document.getElementById('fleet-scroll');
      function renderFleetRow(c){
        const card=cardState(c),lic=licenseState(c),insp=inspectionState(c),carTag=textTag(c.carStatus),prepTag=prepStatusForCar(c);
        return `<tr data-id="${escapeHtml(c.id)}"><td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" aria-label="تحديد السيارة ${escapeHtml(c.plate||'—')}"></td><td class="plate">${escapeHtml(c.plate||'—')}</td><td>${escapeHtml(c.brand||'—')}</td><td>${escapeHtml(c.type||'—')}</td><td>${escapeHtml(c.model||'—')}</td><td>${escapeHtml(c.color||'—')}</td><td class="serial-cell">${escapeHtml(c.serial||'—')}</td><td>${escapeHtml(c.cardNumber||'—')}</td><td><span class="tag ${card.level}">${escapeHtml(card.label)}</span></td><td>${fmtDate(c.cardExpiry)}</td><td><span class="tag ${lic.level}">${escapeHtml(lic.label)}</span></td><td>${fmtDate(c.licenseExpiry)}</td><td><span class="tag ${insp.level}">${escapeHtml(insp.label)}</span></td><td>${escapeHtml(c.owner||'—')}</td><td>${escapeHtml(c.branch||'—')}</td><td>${escapeHtml(c.city||'—')}</td><td><span class="tag ${carTag.level}">${escapeHtml(carTag.label)}</span></td><td><span class="readiness-pill ${prepTag.level}">${escapeHtml(prepTag.label)}</span></td><td><button type="button" class="btn btn-ghost btn-small fleet-view-btn" data-view-car="${escapeHtml(c.id)}">عرض الملف</button></td></tr>`;
      }
      function bindFleetRows(tbody){
        tbody.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>openModal(tr.dataset.id));
        tbody.querySelectorAll('[data-view-car]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openVehicle360(btn.dataset.viewCar)}));
        tbody.querySelectorAll('.row-check').forEach(cb=>{
          cb.checked = selectedIds.has(cb.dataset.id);
          cb.addEventListener('change', ()=>{
            if(cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
            updateBulkBar();
          });
        });
      }
      if(window.YahmaVTable && scrollEl && tb){
        if(!window._fleetVT || window._fleetVT._tb !== tb){
          if(window._fleetVT && window._fleetVT.destroy) try{window._fleetVT.destroy()}catch(e){}
          window._fleetVT = window.YahmaVTable.create({
            scrollEl: scrollEl,
            tbody: tb,
            rowHeight: 52,
            overscan: 12,
            threshold: 35,
            colCount: 19,
            renderRow: function(c){ return renderFleetRow(c); },
            afterRender: function(tbody){ bindFleetRows(tbody); },
            emptyHtml: '<tr><td colspan="19"><div class="empty">لا توجد نتائج مطابقة للفلاتر الحالية</div></td></tr>'
          });
          window._fleetVT._tb = tb;
        }
        window._fleetVT.setItems(rows, true);
      } else {
        tb.innerHTML=rows.length?rows.map(renderFleetRow).join(''):`<tr><td colspan="19"><div class="empty">لا توجد نتائج مطابقة للفلاتر الحالية</div></td></tr>`;
        bindFleetRows(tb);
      }
    })();
    // Mobile card view — تخطّي البناء لو العنصر مخفي (أداء أفضل مع آلاف السجلات)
    if(cardsEl && window.innerWidth<=900 && getComputedStyle(cardsEl).display!=='none'){
      cardsEl.innerHTML=rows.length?rows.map(c=>{
        const card=cardState(c),lic=licenseState(c),insp=inspectionState(c),carTag=textTag(c.carStatus),rdy=vehicleReadiness(c);
        return `<div class="fleet-card" data-id="${escapeHtml(c.id)}">
          <div class="fleet-card-head">
            <label class="card-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-id="${escapeHtml(c.id)}" ${selectedIds.has(c.id)?'checked':''}></label>
            <span class="fleet-card-plate">${escapeHtml(c.plate||'—')}</span>
            <span class="readiness-pill ${rdy.level}">${rdy.label}</span>
          </div>
          <div class="fleet-card-meta">
            <div><span>الماركة</span><b>${escapeHtml(c.brand||'—')} ${escapeHtml(c.model||'')}</b></div>
            <div><span>الفرع</span><b>${escapeHtml(c.branch||'—')}</b></div>
            <div><span>المالك</span><b>${escapeHtml(c.owner||'—')}</b></div>
            <div><span>الحالة</span><b>${escapeHtml(carTag.label)}</b></div>
          </div>
          <div class="fleet-card-tags">
            <span class="tag ${card.level}">كارت: ${escapeHtml(card.label)}</span>
            <span class="tag ${lic.level}">رخصة: ${escapeHtml(lic.label)}</span>
            <span class="tag ${insp.level}">فحص: ${escapeHtml(insp.label)}</span>
          </div><div style="margin-top:12px;display:flex;justify-content:flex-start"><button type="button" class="btn btn-ghost btn-small fleet-view-btn" data-view-car="${escapeHtml(c.id)}">عرض الملف الكامل</button></div>
        </div>`;
      }).join(''):'<div class="empty">لا توجد نتائج مطابقة للفلاتر الحالية</div>';
      cardsEl.querySelectorAll('.fleet-card[data-id]').forEach(el=>el.onclick=()=>openModal(el.dataset.id));
      cardsEl.querySelectorAll('[data-view-car]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openVehicle360(btn.dataset.viewCar)}));
      cardsEl.querySelectorAll('.row-check').forEach(cb=>{
        cb.checked = selectedIds.has(cb.dataset.id);
        cb.addEventListener('change', ()=>{
          if(cb.checked) selectedIds.add(cb.dataset.id); else selectedIds.delete(cb.dataset.id);
          updateBulkBar();
        });
      });
    }
    $('fleet-filter-count').textContent=`عرض ${allRows.length} من ${fleet.length}` + (pageSize>0 && allRows.length>pageSize ? ` — صفحة ${currentPage}` : '');
    const noteMap={
      inspection_only:'سيارات حالة فحصها غير سليمة (يحتاج فحص أو لم يتم).',
      license_only:'سيارات رخصتها منتهية أو قريبة الانتهاء.',
      card_only:'سيارات كارتتها منتهية أو قريبة أو ملغاة/موقوفة.',
      any_doc:'أي سيارة لديها مشكلة في الكارت أو الرخصة أو الفحص.',
      ready:'سيارات مستوفية لكل شروط الجاهزية للتأجير.',
      not_ready:'سيارات غير جاهزة للتأجير لأي سبب.',
      maintenance:'سيارات حالتها تحت الصيانة.',
      out:'سيارات خارج الخدمة.'
    };
    $('fleet-filter-note').textContent=noteMap[activeQuick]||'يمكنك دمج أي عدد من الفلاتر معًا ثم تصدير النتائج الظاهرة إلى Excel.';
    document.querySelectorAll('.quick-filter').forEach(b=>b.classList.toggle('active',b.dataset.quick===activeQuick));
    document.getElementById('topbar-sub').textContent=`${fleet.length} سيارة — عرض ${rows.length} — جاهزية ${readinessStats().pct}%`;
  }
  const resetAndDraw=()=>{ currentPage=1; draw(); };
  const filterPanel=document.getElementById('fleet-filter-panel');
  const filterToggle=document.getElementById('fleet-filter-toggle');
  const filterBody=document.getElementById('fleet-filter-body');
  const setFiltersOpen=(open)=>{
    if(!filterPanel||!filterToggle||!filterBody) return;
    filterPanel.classList.toggle('is-open',open);
    filterBody.hidden=!open;
    filterToggle.setAttribute('aria-expanded',String(open));
    filterToggle.firstChild.textContent=open?'إخفاء الفلاتر ':'إظهار الفلاتر ';
    window._fleetFiltersOpen=open;
  };
  if(filterToggle){
    filterToggle.addEventListener('click',()=>setFiltersOpen(!window._fleetFiltersOpen));
    setFiltersOpen(window._fleetFiltersOpen===true);
  }
  filters.forEach(el=>{el.addEventListener('change',resetAndDraw)});
  (function(){
    let t=null;
    search.addEventListener('input',function(){
      clearTimeout(t);
      t=setTimeout(resetAndDraw, 180);
    });
  })();
  document.querySelectorAll('.quick-filter,[data-fleet-quick]').forEach(b=>b.addEventListener('click',()=>{
    const quick=b.dataset.quick||b.dataset.fleetQuick;
    if(quick==='all'){ activeQuick=''; }
    else { activeQuick=activeQuick===quick?'':quick; }
    resetAndDraw();
  }));
  $('fleet-clear-filters').addEventListener('click',()=>{search.value='';filters.forEach(el=>el.value='');activeQuick='';selectedIds.clear();_filterCacheKey=null;_filterCacheRows=null;resetAndDraw();updateBulkBar();});
  window._yahmaModuleExport = function(fmt){
    const rows=getFilteredRows();
    if(!rows.length){alert('لا توجد نتائج مطابقة للفلاتر.');return;}
    if(fmt==='pdf'){
      const headers=['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','حالة السيارة','الجاهزية','الرخصة','الفحص','الكارت'];
      const data=rows.map(c=>{
        let rdy='—'; try{rdy=vehicleReadiness(c).label}catch(e){}
        return [c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',rdy,licenseState(c).label,inspectionState(c).label,cardState(c).label];
      });
      if(typeof openPrintWindow==='function') openPrintWindow('نتائج الأسطول المفلترة','عدد السجلات: '+rows.length,headers,data);
      else if(typeof window.YahmaExport==='object' && window.YahmaExport.printTable) window.YahmaExport.printTable('نتائج الأسطول المفلترة',headers,data);
      else alert('تعذر فتح نافذة PDF');
      return;
    }
    exportRows(rows);
  };
  window._yahmaGetFilteredCars = getFilteredRows;
  $('fleet-export-filtered').addEventListener('click',()=>window._yahmaModuleExport('xlsx'));
  $('fleet-export-pdf')?.addEventListener('click',()=>window._yahmaModuleExport('pdf'));

  // Bulk actions
  const selectAllVisible=()=>{
    getFilteredRows().forEach(c=>selectedIds.add(c.id));
    draw(); updateBulkBar();
  };
  const clearSelection=()=>{ selectedIds.clear(); draw(); updateBulkBar(); };
  $('bulk-head-check')?.addEventListener('change', (e)=>{
    if(e.target.checked) selectAllVisible(); else clearSelection();
  });
  $('bulk-select-all')?.addEventListener('change', (e)=>{
    if(e.target.checked) selectAllVisible(); else clearSelection();
  });
  $('bulk-renew-license')?.addEventListener('click', bulkRenewLicense);
  $('bulk-renew-card')?.addEventListener('click', bulkRenewCard);
  $('bulk-set-status')?.addEventListener('click', bulkSetStatus);
  $('bulk-set-inspection')?.addEventListener('click', bulkSetInspection);
  $('bulk-export')?.addEventListener('click', bulkExportSelected);
  $('bulk-mark-sold')?.addEventListener('click', async ()=>{
    const cars=getSelectedCars();
    if(!cars.length) return;
    const plates=cars.map(c=>c.plate);
    selectedIds.clear();
    await removeSoldVehiclesByPlates(plates);
  });
  $('bulk-clear-sel')?.addEventListener('click', clearSelection);

  // Pagination controls
  $('pager-first')?.addEventListener('click', ()=>{ currentPage=1; requestAnimationFrame(draw); });
  $('pager-prev')?.addEventListener('click', ()=>{ currentPage=Math.max(1,currentPage-1); requestAnimationFrame(draw); });
  $('pager-next')?.addEventListener('click', ()=>{ currentPage++; requestAnimationFrame(draw); });
  $('pager-last')?.addEventListener('click', ()=>{
    const total=getFilteredRows().length;
    const size=pageSize>0?pageSize:total||1;
    currentPage=Math.max(1, Math.ceil((total||1)/size));
    draw();
  });
  $('pager-size')?.addEventListener('change', (e)=>{
    pageSize=parseInt(e.target.value,10)||0;
    currentPage=1;
    draw();
  });

  // View toggle (table / cards)
  let fleetView = window.innerWidth <= 700 ? 'cards' : 'table';
  const applyView=()=>{
    const wrap=$('fleet-scroll'), cards=$('fleet-cards');
    if(fleetView==='cards'){ wrap?.classList.add('hide-mobile'); cards?.classList.add('show-mobile'); }
    else { wrap?.classList.remove('hide-mobile'); cards?.classList.remove('show-mobile'); }
    document.querySelectorAll('#fleet-view-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.view===fleetView));
  };
  document.querySelectorAll('#fleet-view-toggle button').forEach(b=>b.addEventListener('click',()=>{ fleetView=b.dataset.view; applyView(); }));
  applyView();
  draw();
  updateBulkBar();
}

  const FleetModule = {
    getAll: getFleet,
    render: render,
    count: function () { return getFleet().length; },
    readinessStats: readinessStats,
    uniqueFieldValues: uniqueFieldValues,
    optionList: optionList,
    createFilterEngine: createFilterEngine,
    async persist() {
      if (global.YahmaDB && global.YahmaDB.saveFleet) {
        await global.YahmaDB.saveFleet(getFleet());
      } else if (typeof global.saveData === 'function') {
        await global.saveData();
      }
    },
    async exportExcel(filtered) {
      const list = filtered || getFleet();
      if (global.YahmaExport && global.YahmaExport.excel) {
        await global.YahmaExport.excel(list);
      }
    },
    go() {
      try {
        global.currentTab = 'fleet';
        document.querySelector('.nav-item[data-tab="fleet"]')?.click();
        if (typeof global.render === 'function') global.render();
      } catch (e) {}
    },
  };

  global.YahmaFleet = FleetModule;
})(typeof window !== 'undefined' ? window : this);
