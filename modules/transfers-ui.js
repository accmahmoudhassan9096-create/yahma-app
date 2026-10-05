(function(global){
  'use strict';

/* تبويب التنازلات: سيارات لها تنازل من المالك (انتهاء الأقساط) — تُقرأ من أعمدة الإكسل
   (تنازل/تاريخ التنازل/المالك السابق/حالة التنازل/ملاحظات التنازل) ولا تمس حالة السيارة. */
function renderTransfers(content){
  document.getElementById('topbar-title').textContent='التنازلات';
  document.getElementById('topbar-sub').textContent='سيارات انتقلت ملكيتها إلينا بانتهاء الأقساط';
  const isTransfer=c=>String(c.transferDone||'').trim()==='نعم';
  const uniq=(field)=>{
    const map=new Map();
    fleet.forEach(c=>{
      if(!isTransfer(c)) return;
      const raw=String(c[field]??'').trim();
      if(!raw) return;
      const canon=(field==='brand'&&typeof canonicalBrand==='function')?canonicalBrand(raw):raw;
      const key=canon.replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');
      if(!map.has(key)) map.set(key, canon);
    });
    return [...map.values()].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true}));
  };
  const optionList=(items,placeholder)=>`<option value="">${placeholder}</option>${items.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}`;
  const all=fleet.filter(isTransfer);
  const done=all.filter(c=>String(c.transferStatus||'').trim()==='مكتمل').length;
  const pending=all.filter(c=>String(c.transferStatus||'').trim()==='قيد التنفيذ').length;
  const statusTag=s=>{
    const t=String(s||'').trim();
    if(t==='مكتمل') return 'green';
    if(t==='قيد التنفيذ') return 'amber';
    return 'grey';
  };
  content.innerHTML = `
    <div class="fleet-summary-strip module-summary-strip" aria-label="ملخص التنازلات">
      <button type="button" class="fleet-summary-card total" data-tq=""><span class="fleet-summary-icon">📝</span><span><b>${all.length}</b><small>إجمالي التنازلات</small></span></button>
      <button type="button" class="fleet-summary-card ready" data-tq="done"><span class="fleet-summary-icon">✓</span><span><b>${done}</b><small>مكتمل</small></span></button>
      <button type="button" class="fleet-summary-card attention" data-tq="pending"><span class="fleet-summary-icon">⏳</span><span><b>${pending}</b><small>قيد التنفيذ</small></span></button>
    </div>
    <div class="filter-panel">
      <div class="filter-panel-title"><strong>🔎 فلاتر التنازلات</strong><span>صفِّ النتائج حسب أي بند — ثم صدّر Excel أو PDF</span></div>
      <div class="quick-filters" id="tr-quick">
        <button type="button" class="quick-filter" data-tq="done">✅ مكتمل</button>
        <button type="button" class="quick-filter" data-tq="pending">⏳ قيد التنفيذ</button>
      </div>
      <div class="fleet-filter-grid">
        <label>بحث<input id="tr-search" placeholder="لوحة، مالك، مالك سابق، ملاحظة..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
        <label>الفرع<select id="tr-branch">${optionList(uniq('branch'),'كل الفروع')}</select></label>
        <label>المالك الحالي<select id="tr-owner">${optionList(uniq('owner'),'كل الملاك')}</select></label>
        <label>حالة التنازل<select id="tr-status"><option value="">كل الحالات</option><option>مكتمل</option><option>قيد التنفيذ</option></select></label>
      </div>
      <div class="filter-footer">
        <span id="tr-filter-count">عرض 0 من ${all.length}</span>
        <button class="btn btn-ghost btn-small" id="tr-clear">↺ مسح الفلاتر</button>
      </div>
    </div>
    <div class="table-scroll">
      <table class="fleet-table" style="min-width:1500px">
        <thead><tr>
          <th>رقم اللوحة</th>
          <th>الماركة</th>
          <th>النوع</th>
          <th>الموديل</th>
          <th>المالك الحالي</th>
          <th>المالك السابق</th>
          <th>تاريخ التنازل</th>
          <th>حالة التنازل</th>
          <th>ملاحظات التنازل</th>
          <th>الفرع</th>
          <th>إجراء</th>
        </tr></thead>
        <tbody id="tr-tbody"></tbody>
      </table>
    </div>
    <div class="pager" id="tr-pager">
      <div class="pager-info" id="tr-pager-info">—</div>
      <div class="pager-controls">
        <button class="btn btn-ghost btn-small" id="tr-pager-prev">‹</button>
        <div class="pager-pages" id="tr-pager-pages"></div>
        <button class="btn btn-ghost btn-small" id="tr-pager-next">›</button>
      </div>
      <label class="pager-size">عرض
        <select id="tr-pager-size">
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="100">100 (حد أقصى سلس)</option>
        </select>
      </label>
    </div>
    <div class="panel" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-excel-export btn-small" id="tr-export-xlsx" title="تصدير النتائج المفلترة">📊 Excel</button>
      <button class="btn btn-ghost btn-small" id="tr-export-pdf" title="تصدير PDF للنتائج المفلترة">📄 PDF</button>
      <span class="muted-small">تُقرأ بيانات التنازل من أعمدة الإكسل (تنازل/تاريخ التنازل/المالك السابق/حالة التنازل/ملاحظات التنازل).</span>
    </div>
  `;

  const $=id=>document.getElementById(id);
  let activeTQ='', page=1, pageSize=25;
  const val=id=>($(id)?.value||'').trim();
  const norm=s=>String(s??'').trim();
  const eq=(a,b)=>norm(a).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا')===norm(b).replace(/[يى]/g,'ي').replace(/أ|إ|آ/g,'ا');
  const editable=!(typeof currentRole!=='undefined'&&currentRole==='view');

  function getRows(){
    const q=val('tr-search').toLowerCase();
    return fleet.filter(c=>{
      if(!isTransfer(c)) return false;
      if(q){
        const hay=[c.plate,c.brand,c.type,c.model,c.owner,c.transferFrom,c.transferStatus,c.transferNotes,c.branch].map(v=>String(v||'').toLowerCase()).join(' ');
        if(!hay.includes(q)) return false;
      }
      if(val('tr-branch') && !eq(c.branch,val('tr-branch'))) return false;
      if(val('tr-owner') && !eq(c.owner,val('tr-owner'))) return false;
      if(val('tr-status') && norm(c.transferStatus)!==val('tr-status')) return false;
      if(activeTQ==='done' && norm(c.transferStatus)!=='مكتمل') return false;
      if(activeTQ==='pending' && norm(c.transferStatus)!=='قيد التنفيذ') return false;
      return true;
    });
  }

  function statusOptions(cur){
    const t=String(cur||'').trim();
    const opts=['مكتمل','قيد التنفيذ'].map(o=>`<option value="${o}"${o===t?' selected':''}>${o}</option>`).join('');
    const extra=(t&&t!=='مكتمل'&&t!=='قيد التنفيذ')?`<option value="${escapeHtml(t)}" selected>${escapeHtml(t)}</option>`:'';
    return extra+opts;
  }

  function draw(){
    const allRows=getRows();
    const total=allRows.length;
    const size=pageSize>0?pageSize:total||1;
    const pages=Math.max(1,Math.ceil((total||1)/size));
    if(page>pages) page=pages;
    if(page<1) page=1;
    const startIdx=(page-1)*size;
    const rows=allRows.slice(startIdx,startIdx+size);
    const tbody=$('tr-tbody');
    (function(){
      const scrollEl = tbody.closest('.table-scroll') || tbody.parentElement;
      function renderTrRow(c){
        return `<tr data-id="${escapeHtml(c.id)}">
        <td class="plate">${escapeHtml(c.plate||'—')}</td>
        <td>${escapeHtml(c.brand||'—')}</td>
        <td>${escapeHtml(c.type||'—')}</td>
        <td>${escapeHtml(c.model||'—')}</td>
        <td>${escapeHtml(c.owner||'—')}</td>
        <td>${escapeHtml(c.transferFrom||'—')}</td>
        <td>${c.transferDate?fmtDate(c.transferDate):'—'}</td>
        <td><span class="tag ${statusTag(c.transferStatus)}">${escapeHtml(c.transferStatus||'—')}</span></td>
        <td><input class="tr-note-input" data-note-id="${escapeHtml(c.id)}" value="${escapeHtml(c.transferNotes||'')}" placeholder="اكتب ملاحظة…" aria-label="ملاحظات تنازل السيارة ${escapeHtml(c.plate||'—')}"${editable?'':' readonly'}></td>
        <td>${escapeHtml(c.branch||'—')}</td>
        <td style="white-space:nowrap">
          <select class="tr-status-sel" data-status-id="${escapeHtml(c.id)}" aria-label="حالة التنازل للسيارة ${escapeHtml(c.plate||'—')}"${editable?'':' disabled'}>${statusOptions(c.transferStatus)}</select>
          <input type="date" class="tr-date-input" data-date-id="${escapeHtml(c.id)}" value="${escapeHtml(c.transferDate||'')}" aria-label="تاريخ التنازل للسيارة ${escapeHtml(c.plate||'—')}"${editable?'':' disabled'}>
          <button class="btn btn-ghost btn-small" data-open="${escapeHtml(c.id)}">الملف</button>
        </td>
      </tr>`;
      }
      if(window.YahmaVTable && scrollEl){
        if(!window._trVT || window._trVT._tb !== tbody){
          if(window._trVT && window._trVT.destroy) try{window._trVT.destroy()}catch(e){}
          window._trVT = window.YahmaVTable.create({
            scrollEl: scrollEl, tbody: tbody, rowHeight: 52, overscan: 10, threshold: 30, colCount: 11,
            renderRow: function(c){ return renderTrRow(c); },
            emptyHtml: '<tr><td colspan="11"><div class="empty">لا توجد سيارات لها تنازل مطابقة — ارفع ملف الإكسل بأعمدة التنازل</div></td></tr>'
          });
          window._trVT._tb = tbody;
        }
        window._trVT.setItems(rows, true);
      } else {
        tbody.innerHTML=rows.length?rows.map(renderTrRow).join(''):`<tr><td colspan="11"><div class="empty">لا توجد سيارات لها تنازل مطابقة — ارفع ملف الإكسل بأعمدة التنازل</div></td></tr>`;
      }
      if(!tbody._trDelegate){
        tbody._trDelegate = true;
        tbody.addEventListener('click', async function(e){
          const btn = e.target.closest ? e.target.closest('button[data-open]') : null;
          if(!btn) return;
          if(typeof openModal==='function') openModal(btn.dataset.open);
        });
        tbody.addEventListener('change', async function(e){
          const t = e.target;
          const inp = t.closest ? t.closest('input[data-note-id],select[data-status-id],input[data-date-id]') : null;
          if(!inp || inp.hasAttribute('readonly') || inp.hasAttribute('disabled')) return;
          const id = inp.dataset.noteId || inp.dataset.statusId || inp.dataset.dateId;
          const car = fleet.find(c=>String(c.id)===String(id));
          if(!car) return;
          if(typeof currentRole!=='undefined'&&currentRole==='view'){ alert('ليس لديك صلاحية التعديل.'); draw(); return; }
          let field=null, label='';
          if(inp.dataset.noteId){ field='transferNotes'; label='ملاحظة تنازل'; }
          else if(inp.dataset.statusId){ field='transferStatus'; label='حالة تنازل'; }
          else if(inp.dataset.dateId){ field='transferDate'; label='تاريخ تنازل'; }
          if(!field) return;
          const v=String(inp.value||'').trim();
          if(String(car[field]||'')===v) return;
          car[field]=v;
          inp.classList.add('saving');
          let ok=true;
          try{ if(typeof saveData==='function') ok = await saveData([car.id]); }catch(_){ ok=false; }
          inp.classList.remove('saving');
          if(ok===false){ alert('تعذر الحفظ — تحقق من الاتصال.'); }
          else { try{ if(typeof window.log==='function') window.log(label,'السيارة '+(car.plate||'')); }catch(_){} }
        });
      }
    })();

    $('tr-filter-count').textContent=`عرض ${total} من ${all.length}`+(pageSize>0&&total>pageSize?` — صفحة ${page}`:'');
    const info=$('tr-pager-info');
    if(info){
      if(!total) info.textContent='لا نتائج';
      else info.textContent=`عرض ${startIdx+1}–${Math.min(startIdx+rows.length,total)} من ${total}`;
    }
    const pagesEl=$('tr-pager-pages');
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
    const prev=$('tr-pager-prev'), next=$('tr-pager-next');
    if(prev) prev.disabled=page<=1;
    if(next) next.disabled=page>=pages;
    document.querySelectorAll('#tr-quick .quick-filter').forEach(b=>b.classList.toggle('active',b.dataset.tq===activeTQ&&activeTQ!==''));
    document.querySelectorAll('.module-summary-strip [data-tq]').forEach(b=>b.classList.toggle('active',b.dataset.tq===activeTQ));
  }

  ['tr-branch','tr-owner','tr-status'].forEach(id=>{
    $(id)?.addEventListener('change',()=>{page=1;draw();});
  });
  (function(){let t=null;$('tr-search')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{page=1;draw()},180);});})();
  document.querySelectorAll('#tr-quick .quick-filter, .module-summary-strip [data-tq]').forEach(b=>{
    b.addEventListener('click',()=>{activeTQ=activeTQ===b.dataset.tq?'':b.dataset.tq;page=1;draw();});
  });
  $('tr-clear')?.addEventListener('click',()=>{
    ['tr-search','tr-branch','tr-owner','tr-status'].forEach(id=>{if($(id)) $(id).value='';});
    activeTQ=''; page=1; draw();
  });
  $('tr-pager-prev')?.addEventListener('click',()=>{page=Math.max(1,page-1);draw();});
  $('tr-pager-next')?.addEventListener('click',()=>{page++;draw();});
  $('tr-pager-size')?.addEventListener('change',e=>{pageSize=parseInt(e.target.value,10)||0;page=1;draw();});

  async function exportTr(fmt){
    const rows=getRows();
    if(!rows.length){alert('لا توجد نتائج مطابقة للفلاتر.');return;}
    const headers=['رقم اللوحة','الماركة','النوع','الموديل','المالك الحالي','المالك السابق','تاريخ التنازل','حالة التنازل','ملاحظات التنازل','الفرع','حالة السيارة'];
    const data=rows.map(c=>[
      c.plate||'',c.brand||'',c.type||'',c.model||'',c.owner||'',c.transferFrom||'',c.transferDate||'',
      c.transferStatus||'',c.transferNotes||'',c.branch||'',c.carStatus||''
    ]);
    window._yahmaGetFilteredCars = getRows;
    if(fmt==='pdf'){
      const name='تنازلات-مفلتر-'+new Date().toISOString().slice(0,10)+'.pdf';
      if(window.YahmaExport&&window.YahmaExport.exportTablePdf){
        window.YahmaExport.exportTablePdf({title:'التنازلات — نتائج مفلترة',subtitle:'عدد السجلات: '+rows.length,headers:headers,rows:data,buttonId:'tr-export-pdf',filename:name});
      } else if(typeof openPrintWindow==='function') openPrintWindow('التنازلات — نتائج مفلترة','عدد السجلات: '+rows.length,headers,data);
      return;
    }
    if(!(await ensureXlsxReady())){alert('مكتبة Excel غير متاحة');return;}
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
    ws['!cols']=headers.map(()=>({wch:16}));
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'تنازلات');
    XLSX.writeFile(wb,'تنازلات-مفلتر-'+(typeof todayStr==='function'?todayStr():Date.now())+'.xlsx');
  }
  window._yahmaModuleExport = function(fmt){ exportTr(fmt==='pdf'?'pdf':'xlsx'); };
  window._yahmaGetFilteredCars = getRows;
  window._yahmaCurrentPdfData=()=>({title:'التنازلات المفلترة',subtitle:'عدد السيارات: '+getRows().length,headers:['رقم اللوحة','الماركة','النوع','الموديل','المالك السابق','تاريخ التنازل','حالة التنازل','الفرع','حالة السيارة'],rows:getRows().map(c=>[c.plate||'—',c.brand||'—',c.type||'—',c.model||'—',c.transferFrom||'—',c.transferDate||'—',c.transferStatus||'—',c.branch||'—',c.carStatus||'—'])});
  $('tr-export-xlsx')?.addEventListener('click',()=>exportTr('xlsx'));
  $('tr-export-pdf')?.addEventListener('click',()=>exportTr('pdf'));
  draw();
}

  global.YahmaTransfers = { render: renderTransfers };
})(window);
