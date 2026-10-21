/* ===== core/router-payments-paid.js — تبويب «تم الدفع» =====
 *
 * رسم جدول المدفوعات، الفلاتر، والواجهة (Excel + PDF).
 *
 * نفس الكود بنفس الأسماء — globals زي ما كان.
 */
/* ===== تبويب «تم الدفع» =====
   السطور اللي اتجدّدت رخصتها بتتشال من هنا (بتسجّل في note)،
   عشان التبويب يبقى «اللي فاضل» بس — والتاريخ محفوظ في الأسطول وسجل النشاط. */
function renderPaidInspections(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تم الدفع';
  document.getElementById('topbar-sub').textContent='طلبات تم دفع تجديد فحصها واعتمادها';
  const paid=loadPaidInspections();
  const doneNote=(window.YahmaPayments&&window.YahmaPayments.DONE_NOTE)||'license-renewed';
  const allPaid=(window.YahmaPayments&&typeof window.YahmaPayments.localByStatus==='function')
    ? window.YahmaPayments.localByStatus('paid') : paid;
  const doneCount=allPaid.filter(function(p){ return String(p.note||'')===doneNote; }).length;
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=paid.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.paid=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.paid[String(r.item.id)]=r; });
  const today=new Date(); today.setHours(0,0,0,0);
  const todayCount=rows.filter(({item})=>item.paidAt&&new Date(item.paidAt)>=today).length;
  /* هل الرخصة اتجدّدت فعلاً؟ لو التاريخ لسه قادم/منتهي يبقى الخطوة الجاية */
  const needsLicense=({car})=>{
    const d=car.licenseExpiry?new Date(car.licenseExpiry):null;
    return !d || isNaN(d.getTime()) || d.getTime() < Date.now();
  };
  const pendingLicense=rows.filter(needsLicense).length;

  const getBranches = () => {
    const s = new Set();
    rows.forEach(r => { const b = (r.car && r.car.branch) || (r.item && r.item.branch); if (b && String(b).trim()) s.add(String(b).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getUsers = () => {
    const s = new Set();
    rows.forEach(r => { const u = resolveItemUserName(r.item); if (u && u !== '—') s.add(u); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getOwners = () => {
    const s = new Set();
    rows.forEach(r => {
      const o = (r.car && (r.car.owner || r.car.companyName)) || '';
      if (o && String(o).trim() && String(o).trim() !== '—') s.add(String(o).trim());
    });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const branchOpts = '<option value="">كل الفروع</option>' + getBranches().map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
  const ownerOpts = '<option value="">كل المُلّاك</option>' + getOwners().map(o => '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>').join('');
  const userOpts = '<option value="">كل المستخدمين</option>' + getUsers().map(u => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');

  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip">
    <div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>إجمالي المدفوع</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${todayCount}</b><small>مدفوع اليوم</small></span></div>
    <div class="fleet-summary-card ${pendingLicense?'attention':''}"><span class="fleet-summary-icon">📄</span><span><b>${pendingLicense}</b><small>بانتظار تجديد الرخصة</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✅</span><span><b>${doneCount}</b><small>تم تجديد رخصها</small></span></div>
  </div>
  <div class="filter-panel">
    <div class="filter-panel-title"><strong>🔎 فلاتر طلبات تم الدفع</strong><span>صفِّ النتائج حسب اللوحة، الفرع، حالة الرخصة، أو المستخدم</span></div>
    <div class="quick-filters" id="paid-quick">
      <button type="button" class="quick-filter active" data-pq="all">الكل</button>
      <button type="button" class="quick-filter" data-pq="need_lic">📄 بانتظار تجديد الرخصة</button>
      <button type="button" class="quick-filter" data-pq="has_lic">✅ الرخصة سارية</button>
      <button type="button" class="quick-filter" data-pq="today">📅 مدفوع اليوم</button>
    </div>
    <div class="fleet-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <label>بحث<input id="pay-search-paid" placeholder="رقم اللوحة، الفرع، المالك، المستخدم، الملاحظات..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
      <label>الفرع<select id="pay-branch-paid">${branchOpts}</select></label>
      <label>اسم المالك<select id="pay-owner-paid">${ownerOpts}</select></label>
      <label>حالة الرخصة<select id="pay-lic-status-paid"><option value="">كل الحالات</option><option value="need">بانتظار تجديد الرخصة</option><option value="valid">الرخصة سارية</option></select></label>
      <label>المستخدم<select id="pay-user-paid">${userOpts}</select></label>
    </div>
    <div class="filter-footer">
      <span id="pay-count-paid">عرض ${rows.length} من ${rows.length} طلب</span>
      <button type="button" class="btn btn-ghost btn-small" id="pay-clear-paid">↺ مسح الفلاتر</button>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('paid')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-paid"><thead><tr>${payCheckHeader('paid',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>الرقم التسلسلي</th><th>رقم الحاسب</th><th>اسم المالك</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody id="pay-tbody-paid">
  </tbody></table></div>`;

  let activePQ = 'all';

  function getFiltered() {
    const q = (document.getElementById('pay-search-paid')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-paid')?.value || '').trim();
    const owner = (document.getElementById('pay-owner-paid')?.value || '').trim();
    const licSt = (document.getElementById('pay-lic-status-paid')?.value || '').trim();
    const user = (document.getElementById('pay-user-paid')?.value || '').trim();

    return rows.filter(({item, car}) => {
      const needs = needsLicense({car});
      if (activePQ === 'need_lic' && !needs) return false;
      if (activePQ === 'has_lic' && needs) return false;
      if (activePQ === 'today' && (!item.paidAt || new Date(item.paidAt) < today)) return false;

      if (licSt === 'need' && !needs) return false;
      if (licSt === 'valid' && needs) return false;

      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.serial, car.accountNo, car.ownerNumber, car.owner, car.companyName, car.notes, resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (branch && String((car && car.branch) || (item && item.branch) || '').trim() !== branch) return false;
      if (owner && String((car && (car.owner || car.companyName)) || '').trim() !== owner) return false;
      if (user && resolveItemUserName(item) !== user) return false;
      return true;
    });
  }

  function draw() {
    const list = getFiltered();
    const tbody = document.getElementById('pay-tbody-paid');
    if (!tbody) return;

    PAY_ROW_INDEX.paid=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.paid[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('paid', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>{
      const needs = needsLicense({car});
      return `<tr>${payCheckCell('paid',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td><td class="serial-cell">${escapeHtml(car.serial||'—')}</td><td>${escapeHtml(car.accountNo||car.ownerNumber||'—')}</td><td>${escapeHtml(car.owner||car.companyName||'—')}</td><td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td>${escapeHtml(formatArabicDate(item.paidAt))}</td><td><span class="tag green">تم الدفع</span></td>${payNoteCell(car)}<td>${escapeHtml(resolveItemUserName(item))}</td><td><div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-renew-license="${escapeHtml(item.id)}">تجديد الرخصة</button>${!needs ? '<span class="tag green" style="margin:0 2px">الرخصة سارية</span>' : ''}<button type="button" class="btn btn-ghost btn-small row-del" data-stepback-payment="${escapeHtml(item.id)}" title="رجوع السيارة لقائمة «تحت الدفع»">↩ رجوع لِتحت الدفع</button>${canDeleteHere()?` <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>`:''}</div></td></tr>`;
    }).join('') : '<tr><td class="empty-span"><div class="empty">لا توجد طلبات مدفوعة بعد</div></td></tr>';

    const countLabel = document.getElementById('pay-count-paid');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' طلب';

    window._yahmaCurrentPdfData=()=>({
      title:'طلبات تم الدفع',
      subtitle:'عدد الطلبات: '+list.length,
      headers:['رقم اللوحة','الفرع','الرقم التسلسلي','رقم الحاسب','اسم المالك','تاريخ الطلب','تاريخ الدفع','حالة الدفع','ملاحظات','المستخدم'],
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—',
        car.serial||'—', car.accountNo||car.ownerNumber||'—', car.owner||car.companyName||'—',
        formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
        'تم الدفع', car.notes||'—', resolveItemUserName(item)])
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'paid');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-renew-license]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.renewLicense));
        if(!item){renderPaidInspections(content);return;}
        const car=fleet.find(c=>String(c.id)===String(item.carId));
        await PAY_ITEM_ACTION.renew(item, car, false);
      };
    });
    content.querySelectorAll('[data-stepback-payment]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadPaidInspections().find(p=>String(p.id)===String(button.dataset.stepbackPayment));
        if(!item) return;
        await PAY_ITEM_ACTION.back(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
      };
    });
  }

  content.querySelectorAll('#paid-quick .quick-filter').forEach(btn => {
    btn.onclick = () => {
      content.querySelectorAll('#paid-quick .quick-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePQ = btn.dataset.pq;
      draw();
    };
  });

  ['pay-search-paid', 'pay-branch-paid', 'pay-owner-paid', 'pay-lic-status-paid', 'pay-user-paid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', draw);
      el.addEventListener('change', draw);
    }
  });

  document.getElementById('pay-clear-paid')?.addEventListener('click', function(){
    ['pay-search-paid', 'pay-branch-paid', 'pay-owner-paid', 'pay-lic-status-paid', 'pay-user-paid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    activePQ = 'all';
    content.querySelectorAll('#paid-quick .quick-filter').forEach(b => b.classList.toggle('active', b.dataset.pq === 'all'));
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);
}

