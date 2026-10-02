(function(global){
  'use strict';

function renderRenewals(content, mode='inspection'){
  const licenseMode=mode==='license';
  const insuranceMode=mode==='insurance';
  document.getElementById('topbar-title').textContent = insuranceMode?'التأمين':licenseMode?'تجديد الرخص':'الفحص';
  document.getElementById('topbar-sub').textContent = insuranceMode?'متابعة وتجديد تأمين السيارات':licenseMode?'متابعة وتجديد رخص السيارات':'متابعة السيارات المطلوب فحصها';
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
  const needInsp=getUninspectedCars().filter(car=>!pendingIds.has(String(car.id))).length;
  const needLic=fleet.filter(c=>dateStatus(c.licenseExpiry).level!=='green').length;
  const needInsurance=fleet.filter(c=>textTag(c.insuranceStatus).level!=='green').length;
  const goodInsp=fleet.filter(car=>inspectionDisplayStatus(car.inspectionStatus).level==='green').length;
  const goodLic=fleet.length-needLic;
  content.innerHTML = `
    <div class="fleet-summary-strip module-summary-strip" aria-label="ملخص ${licenseMode?'الرخص':'الفحص'}">
      ${insuranceMode?`<div class="fleet-summary-card attention"><span class="fleet-summary-icon">!</span><span><b>${needInsurance}</b><small>تأمين يحتاج متابعة</small></span></div>`:licenseMode?`<button type="button" class="fleet-summary-card attention" data-rq="lic_bad"><span class="fleet-summary-icon">!</span><span><b>${needLic}</b><small>رخص تحتاج متابعة</small></span></button><button type="button" class="fleet-summary-card ready" data-rq="lic_ok"><span class="fleet-summary-icon">✓</span><span><b>${goodLic}</b><small>رخص سارية</small></span></button>`:`
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
        <button class="btn btn-ghost" id="btn-copy-inspection">نسخ القائمة</button>
        <button class="btn btn-excel-export" id="ren-export-xlsx" title="تصدير النتائج المفلترة">📊 Excel</button>
        <button class="btn btn-ghost" id="ren-export-pdf" title="تصدير PDF للنتائج المفلترة">📄 PDF</button>
      </div>
    </div>`}
    <div class="filter-panel">
      <div class="filter-panel-title"><strong>🔎 فلاتر ${insuranceMode?'التأمين':licenseMode?'الرخص':'الفحص'}</strong><span>صفِّ النتائج حسب أي بند — ثم صدّر Excel أو PDF</span></div>
      <div class="quick-filters" id="ren-quick">
        ${insuranceMode?`<button type="button" class="quick-filter" data-rq="insurance_bad">🛡️ يحتاج متابعة</button>`:licenseMode?`<button type="button" class="quick-filter" data-rq="lic_expired">🔴 منتهية</button><button type="button" class="quick-filter" data-rq="lic_soon">🟡 قريبة الانتهاء</button>`:`<button type="button" class="quick-filter" data-rq="insp_bad">🔍 تحتاج فحص</button>`}
        ${licenseMode||insuranceMode?'':`
        <button type="button" class="quick-filter" data-rq="lic_bad">📄 رخصة تحتاج متابعة</button>
        <button type="button" class="quick-filter" data-rq="lic_ok">✅ رخصة سارية</button>
        <button type="button" class="quick-filter" data-rq="lic_expired">🔴 رخصة منتهية</button>
        <button type="button" class="quick-filter" data-rq="lic_soon">🟡 رخصة قريبة</button>
        <button type="button" class="quick-filter" data-rq="active">🟢 سيارة نشطة</button>
        <button type="button" class="quick-filter" data-rq="maintenance">🔧 تحت الصيانة</button>
        <button type="button" class="quick-filter" data-rq="out">⛔ خارج الخدمة</button>
        `}
      </div>
      <div class="fleet-filter-grid">
        <label>بحث<input id="ren-search" placeholder="لوحة، مالك، فرع..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
        <label>الفرع<select id="ren-branch">${optionList(uniq('branch'),'كل الفروع')}</select></label>
        <label>حالة السيارة<select id="ren-car-status"><option value="">كل الحالات</option><option>تحت الصيانة</option><option>حجز</option><option>متاحة للايجار</option><option>محولة غير مستلمة</option><option>مسروقة</option><option>للبيع</option><option>مؤجرة</option><option>خدمة</option><option>مفقودة</option></select></label>
        <label>المالك<select id="ren-owner">${optionList(uniq('owner'),'كل الملاك')}</select></label>
        <label>الماركة<select id="ren-brand">${optionList(uniq('brand'),'كل الماركات')}</select></label>
        <label>حالة الفحص<select id="ren-insp-status"><option value="">كل الحالات</option><option value="green">سليم</option><option value="amber">يحتاج فحص</option><option value="red">لم يتم الفحص</option><option value="grey">غير محدد</option></select></label>
        <label>صلاحية الرخصة<select id="ren-lic-condition"><option value="">كل الحالات</option><option value="green">سارية</option><option value="amber">قريبة الانتهاء</option><option value="red">منتهية</option><option value="grey">غير محددة</option></select></label>
        <label>حالة الرخصة (سجل)<select id="ren-lic-status"><option value="">كل الحالات</option><option>نشط</option><option>ملغى</option><option>موقوف</option><option>منتهي</option></select></label>
        ${insuranceMode?`<label>حالة التأمين<select id="ren-insurance-status"><option value="">كل الحالات</option><option value="green">ساري</option><option value="red">منتهي / لا يوجد</option><option value="grey">غير محدد</option></select></label>`:''}
      </div>
      <div class="filter-footer">
        <span id="ren-filter-count">عرض 0 من ${fleet.length}</span>
        <button class="btn btn-ghost btn-small" id="ren-clear">↺ مسح الفلاتر</button>
      </div>
    </div>
    <div class="table-scroll" style="max-height:calc(100vh - 320px)">
      <table class="fleet-table" style="min-width:1300px">
        <thead><tr>
          <th>رقم اللوحة</th>
          <th>الماركة</th>
          <th>النوع</th>
          <th>الموديل</th>
          ${(!licenseMode&&!insuranceMode)?'<th>حالة الفحص</th>':''}
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
  const rank={red:0,amber:1,grey:2,green:3};
  const val=id=>($(id)?.value||'').trim();
  const norm=s=>String(s??'').trim();
  const eq=(a,b)=>norm(a).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا')===norm(b).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');

  function getRows(){
    const q=val('ren-search').toLowerCase();
    return fleet.filter(c=>{
      // تبويبات الفحص والرخص والتأمين تعرض كل السيارات (الأسوأ أولًا حسب الفرز) — الفلاتر السريعة تضيّق عند الحاجة
      if(!licenseMode&&!insuranceMode&&pendingIds.has(String(c.id))) return false;
      if(q){
        const hay=[c.plate,c.brand,c.model,c.owner,c.branch,c.carStatus,c.inspectionStatus,c.insuranceCompany].map(v=>String(v||'').toLowerCase()).join(' ');
        if(!hay.includes(q)) return false;
      }
      if(val('ren-branch') && !eq(c.branch,val('ren-branch'))) return false;
      if(val('ren-owner') && !eq(c.owner,val('ren-owner'))) return false;
      if(val('ren-brand') && (typeof canonicalBrand==='function'?canonicalBrand(c.brand)!==val('ren-brand'):!eq(c.brand,val('ren-brand')))) return false;
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
    if(insuranceMode) return {title:'التأمين المفلتر',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','حالة التأمين','انتهاء التأمين','شركة التأمين','المالك','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',textTag(c.insuranceStatus).label,c.insuranceExpiry||'—',c.insuranceCompany||'—',c.owner||'—',c.branch||'—',c.carStatus||'—'])};
    return {title:licenseMode?'تجديد الرخص المفلترة':'الفحص المفلتر',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','حالة الفحص','انتهاء الرخصة','حالة الرخصة','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',inspectionDisplayStatus(c.inspectionStatus).label,c.licenseExpiry||'—',dateStatus(c.licenseExpiry).label,c.branch||'—',c.carStatus||'—'])};
  };

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
        const noteEditable=noteMode&&!(typeof currentRole!=='undefined'&&currentRole==='view');
        return `<tr data-id="${escapeHtml(c.id)}">
        <td class="plate">${escapeHtml(c.plate||'—')}</td>
        <td>${escapeHtml(c.brand||'—')}</td>
        <td>${escapeHtml(c.type||'—')}</td>
        <td>${escapeHtml(c.model||'—')}</td>
        ${(!licenseMode&&!insuranceMode)?`<td><span class="tag ${insp.level}">${escapeHtml(insp.label)}</span></td>`:''}
        ${licenseMode?`<td>${fmtDate(c.licenseExpiry)}</td>
        <td><span class="tag ${lic.level}">${escapeHtml(lic.label)}</span></td>`:''}
        ${insuranceMode?`<td><span class="tag ${ins.level}">${escapeHtml(ins.label)}</span></td><td>${fmtDate(c.insuranceExpiry)}</td><td>${escapeHtml(c.insuranceCompany||'—')}</td><td>${escapeHtml(c.owner||'—')}</td>`:''}
        <td>${escapeHtml(c.branch||'—')}</td>
        <td><span class="tag ${carTag.level}">${escapeHtml(carTag.label)}</span></td>
        <td style="white-space:nowrap">
          ${licenseMode||insuranceMode?'':`<button class="btn btn-ghost btn-small" data-renew-insp="${escapeHtml(c.id)}">تجديد فحص</button>`}
          ${licenseMode?`<button class="btn btn-ghost btn-small" data-renew-lic="${escapeHtml(c.id)}">تجديد رخصة</button>`:''}
          ${insuranceMode?`<button class="btn btn-ghost btn-small" data-renew-ins="${escapeHtml(c.id)}">تجديد تأمين</button>`:''}
        </td>
        ${noteMode?`<td><input class="ren-note-input" data-note-id="${escapeHtml(c.id)}" value="${escapeHtml(c.notes||'')}" placeholder="اكتب ملاحظة…" aria-label="ملاحظات السيارة ${escapeHtml(c.plate||'—')}"${noteEditable?'':' readonly'}></td>`:''}
      </tr>`;
      }
      if(window.YahmaVTable && scrollEl){
        if(!window._renVT || window._renVT._tb !== tbody){
          if(window._renVT && window._renVT.destroy) try{window._renVT.destroy()}catch(e){}
          window._renVT = window.YahmaVTable.create({
            scrollEl: scrollEl, tbody: tbody, rowHeight: 52, overscan: 10, threshold: 30, colCount: insuranceMode?11:(licenseMode?10:9),
            renderRow: function(c){ return renderRenRow(c); },
            afterRender: function(){},
            emptyHtml: `<tr><td colspan="${insuranceMode?11:(licenseMode?10:9)}"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>`
          });
          window._renVT._tb = tbody;
        }
        window._renVT.setItems(rows, true);
      } else {
        tbody.innerHTML=rows.length?rows.map(renderRenRow).join(''):`<tr><td colspan="${insuranceMode?11:(licenseMode?10:9)}"><div class="empty">لا توجد نتائج مطابقة</div></td></tr>`;
      }
      // تفويض أحداث الأزرار مرة واحدة (متوافق مع Virtualization)
      if(!tbody._renDelegate){
        tbody._renDelegate = true;
        tbody.addEventListener('click', async function(e){
          const btn = e.target.closest('button[data-renew-insp],button[data-renew-lic],button[data-renew-ins]');
          if(!btn) return;
          e.stopPropagation();
          if(btn.dataset.renewInsp){
            const car=fleet.find(c=>c.id===btn.dataset.renewInsp); if(!car) return;
            if(typeof currentRole!=='undefined'&&currentRole!=='admin'&&currentRole!=='ops'){alert('ليس لديك صلاحية تسجيل تجديد الفحص.');return;}
            if(typeof window.canAccessYahmaTab==='function'&&!window.canAccessYahmaTab('payments')){alert('لا تملك صلاحية الوصول إلى قسم الدفع.');return;}
            const paymentQueue=readPaymentQueue();
            if(paymentQueue.some(item=>String(item.carId)===String(car.id))){alert('السيارة موجودة بالفعل في قائمة الدفع.');return;}
            if(!confirm('نقل السيارة '+car.plate+' إلى قائمة الدفع لتجديد الفحص؟')) return;
            paymentQueue.unshift({id:'ip-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),carId:car.id,plate:car.plate||'',branch:car.branch||'',requestedAt:new Date().toISOString(),status:'pending'});
            localStorage.setItem('yahma-inspection-payments-v1',JSON.stringify(paymentQueue));
            if(typeof window.log==='function') window.log('طلب دفع فحص','السيارة '+(car.plate||''));
            if(typeof render==='function') render();
            document.querySelector('.nav-item[data-tab="payments"]')?.click();
          } else if(btn.dataset.renewLic){
            const car=fleet.find(c=>c.id===btn.dataset.renewLic); if(!car) return;
            const newDate=prompt('تاريخ انتهاء الرخصة الجديد لـ '+car.plate+' (YYYY-MM-DD):', addDays(todayStr(),365));
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
          else { try{ if(typeof window.log==='function') window.log('ملاحظة فحص','السيارة '+(car.plate||'')); }catch(_){} }
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

  ['ren-branch','ren-car-status','ren-owner','ren-brand','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{
    $(id)?.addEventListener('change',()=>{page=1;draw();});
  });
  (function(){let t=null;$('ren-search')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{page=1;draw()},180);});})();
  document.querySelectorAll('#ren-quick .quick-filter, .module-summary-strip [data-rq]').forEach(b=>{
    b.addEventListener('click',()=>{activeRQ=activeRQ===b.dataset.rq?'':b.dataset.rq;page=1;draw();});
  });
  $('ren-clear')?.addEventListener('click',()=>{
    ['ren-search','ren-branch','ren-car-status','ren-owner','ren-brand','ren-insp-status','ren-lic-condition','ren-lic-status','ren-insurance-status'].forEach(id=>{if($(id)) $(id).value='';});
    activeRQ=''; page=1; draw();
  });
  $('ren-pager-prev')?.addEventListener('click',()=>{page=Math.max(1,page-1);draw();});
  $('ren-pager-next')?.addEventListener('click',()=>{page++;draw();});
  $('ren-pager-size')?.addEventListener('change',e=>{pageSize=parseInt(e.target.value,10)||0;page=1;draw();});
  async function exportRen(fmt){
    const rows=getRows();
    if(!rows.length){alert('لا توجد نتائج مطابقة للفلاتر.');return;}
    const headers=insuranceMode?['رقم اللوحة','الماركة','النوع','الموديل','حالة التأمين','انتهاء التأمين','شركة التأمين','المالك','الفرع','حالة السيارة']:['رقم اللوحة','الماركة','النوع','الموديل','الفرع','المالك','حالة السيارة','حالة الفحص','انتهاء الرخصة','حالة الرخصة'];
    const data=rows.map(c=>insuranceMode?[
      c.plate||'',c.brand||'',c.type||'',c.model||'',
      (typeof textTag==='function'?textTag(c.insuranceStatus).label:(c.insuranceStatus||'')),
      c.insuranceExpiry||'',c.insuranceCompany||'',c.owner||'',c.branch||'',c.carStatus||''
    ]:[
      c.plate||'',c.brand||'',c.type||'',c.model||'',c.branch||'',c.owner||'',c.carStatus||'',
      (typeof inspectionDisplayStatus==='function'?inspectionDisplayStatus(c.inspectionStatus).label:(c.inspectionStatus||'')),
      c.licenseExpiry||'',c.licenseStatus||''
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
  $('ren-export-xlsx')?.addEventListener('click',()=>exportRen('xlsx'));
  $('ren-export-pdf')?.addEventListener('click',()=>exportRen('pdf'));
  draw();
}

  global.YahmaRenewals.render = renderRenewals;
})(window);
