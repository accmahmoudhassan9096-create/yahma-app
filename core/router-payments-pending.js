/* ===== core/router-payments-pending.js — تبويب «تحت الدفع» =====
 *
 * رسم جدول طلبات الدفع، الفلاتر، والواجهة (Excel + PDF).
 *
 * نفس الكود بنفس الأسماء — globals زي ما كان.
 */
function renderInspectionPayments(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تحت الدفع';
  document.getElementById('topbar-sub').textContent='طلبات دفع تجديد فحص السيارات';
  const pending=loadInspectionPayments();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=pending.map(item=>({item,car:byId.get(String(item.carId))})).filter(row=>row.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.payments=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.payments[String(r.item.id)]=r; });

  const getBranches = () => {
    const s = new Set();
    rows.forEach(r => { const b = (r.car && r.car.branch) || (r.item && r.item.branch); if (b && String(b).trim()) s.add(String(b).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getCompanies = () => {
    const s = new Set();
    rows.forEach(r => { const c = r.car && r.car.companyName; if (c && String(c).trim()) s.add(String(c).trim()); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getNotes = () => {
    const s = new Set();
    rows.forEach(r => {
      const n = (r.car && r.car.notes) || (r.item && r.item.notes) || (r.item && r.item.note);
      if (n && String(n).trim()) s.add(String(n).trim());
    });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };
  const getUsers = () => {
    const s = new Set();
    rows.forEach(r => { const u = resolveItemUserName(r.item); if (u && u !== '—') s.add(u); });
    return [...s].sort((a,b) => a.localeCompare(b, 'ar'));
  };

  const branchOpts = '<option value="">كل الفروع</option>' + getBranches().map(b => '<option value="' + escapeHtml(b) + '">' + escapeHtml(b) + '</option>').join('');
  const compOpts = '<option value="">كل الشركات</option>' + getCompanies().map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
  const userOpts = '<option value="">كل المستخدمين</option>' + getUsers().map(u => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');

  const uniqueNotes = getNotes();
  const hasNotesCount = rows.filter(r => {
    const n = (r.car && r.car.notes) || (r.item && r.item.notes) || (r.item && r.item.note);
    return !!String(n || '').trim();
  }).length;
  const noNotesCount = rows.length - hasNotesCount;
  const noteOpts = '<option value="">كل الملاحظات</option>'
    + '<option value="__has_notes__">📝 يوجد ملاحظات (' + hasNotesCount + ')</option>'
    + '<option value="__no_notes__">⚪ بدون ملاحظات (' + noNotesCount + ')</option>'
    + (uniqueNotes.length
      ? '<optgroup label="نصوص الملاحظات المسجلة">' + uniqueNotes.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('') + '</optgroup>'
      : '');

  content.innerHTML=`<div class="fleet-summary-strip module-summary-strip"><div class="fleet-summary-card attention"><span class="fleet-summary-icon">$</span><span><b>${rows.length}</b><small>طلبات تحت الدفع</small></span></div></div>
  <div class="filter-panel" id="pay-pending-filter-panel">
    <div class="filter-panel-title">
      <div><strong>🔎 فلاتر طلبات تحت الدفع</strong><span>صفِّ النتائج حسب اللوحة، الفرع، الشركة، الملاحظات، أو المستخدم</span></div>
      <button type="button" class="btn btn-ghost btn-small fleet-filter-toggle" id="pay-pending-filter-toggle" aria-expanded="false">إظهار الفلاتر <span aria-hidden="true">⌄</span></button>
    </div>
    <div class="filter-panel-body" id="pay-pending-filter-body">
      <div class="quick-filters" id="pending-quick">
        <button type="button" class="quick-filter active" data-pq="all">الكل (${rows.length})</button>
        <button type="button" class="quick-filter" data-pq="has_notes">📝 يوجد ملاحظات (${hasNotesCount})</button>
        <button type="button" class="quick-filter" data-pq="no_notes">⚪ بدون ملاحظات (${noNotesCount})</button>
      </div>
      <div class="fleet-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <label>بحث<input id="pay-search-payments" placeholder="رقم اللوحة، الفرع، الشركة، الرقم التسلسلي، المستخدم..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
        <label>الفرع<select id="pay-branch-payments">${branchOpts}</select></label>
        <label>الشركة<select id="pay-company-payments">${compOpts}</select></label>
        <label>الملاحظات<select id="pay-note-payments">${noteOpts}</select></label>
        <label>المستخدم<select id="pay-user-payments">${userOpts}</select></label>
      </div>
      <div class="filter-footer">
        <span id="pay-count-payments">عرض ${rows.length} من ${rows.length} طلب</span>
        <button type="button" class="btn btn-ghost btn-small" id="pay-clear-payments">↺ مسح الفلاتر</button>
      </div>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('payments')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-payments"><thead><tr>${payCheckHeader('payments',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th>${CORE_PAY_HEADERS}<th>تاريخ الطلب</th><th>حالة الدفع</th><th>ملاحظات</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody id="pay-tbody-payments">
  </tbody></table></div>`;

  let activeQuickNote = 'all';

  function getFiltered() {
    const q = (document.getElementById('pay-search-payments')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-payments')?.value || '').trim();
    const comp = (document.getElementById('pay-company-payments')?.value || '').trim();
    const noteVal = (document.getElementById('pay-note-payments')?.value || '').trim();
    const user = (document.getElementById('pay-user-payments')?.value || '').trim();

    return rows.filter(({item, car}) => {
      const carNote = String((car && car.notes) || (item && item.notes) || (item && item.note) || '').trim();
      const hasNote = !!carNote;

      if (activeQuickNote === 'has_notes' && !hasNote) return false;
      if (activeQuickNote === 'no_notes' && hasNote) return false;

      if (noteVal === '__has_notes__' && !hasNote) return false;
      if (noteVal === '__no_notes__' && hasNote) return false;
      if (noteVal && noteVal !== '__has_notes__' && noteVal !== '__no_notes__') {
        if (!carNote.toLowerCase().includes(noteVal.toLowerCase())) return false;
      }

      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.companyName, car.serial, car.accountNo, carNote, resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (branch && String((car && car.branch) || (item && item.branch) || '').trim() !== branch) return false;
      if (comp && String((car && car.companyName) || '').trim() !== comp) return false;
      if (user && resolveItemUserName(item) !== user) return false;
      return true;
    });
  }

  function draw() {
    const list = getFiltered();
    const tbody = document.getElementById('pay-tbody-payments');
    if (!tbody) return;

    PAY_ROW_INDEX.payments=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.payments[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('payments', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>`<tr>${payCheckCell('payments',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td><td>${escapeHtml(car.branch||item.branch||'—')}</td>${corePayCellsHtml(car)}<td>${escapeHtml(formatArabicDate(item.requestedAt))}</td><td><span class="tag amber">تحت الدفع</span></td>${payNoteCell(car)}<td>${escapeHtml(resolveItemUserName(item))}</td><td><button type="button" class="btn btn-primary btn-small" data-payment-done="${escapeHtml(item.id)}">تسجيل الدفع</button> <button type="button" class="btn btn-ghost btn-small" data-payment-cancel="${escapeHtml(item.id)}">إلغاء الطلب</button>${canDeleteHere()?` <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>`:''}</td></tr>`).join('') : '<tr><td class="empty-span"><div class="empty">لا توجد طلبات تحت الدفع</div></td></tr>';

    const countLabel = document.getElementById('pay-count-payments');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' طلب';

    window._yahmaCurrentPdfData=()=>({
      title:'طلبات فحص تحت الدفع',
      subtitle:'عدد الطلبات: '+list.length,
      headers:['رقم اللوحة','الفرع'].concat(window.PAY_CELL_LABELS,['تاريخ الطلب','حالة الدفع','المستخدم']),
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—']
          .concat(PAY_CELL_FIELDS.map(d=>car[d.field]||'—'))
          .concat([formatArabicDate(item.requestedAt), 'تحت الدفع', resolveItemUserName(item)]))
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'payments');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-payment-done]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const id=button.dataset.paymentDone;
        const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
        if(!item) return;
        await PAY_ITEM_ACTION.paid(item, byId.get(String(item.carId)), false);
      };
    });
    content.querySelectorAll('[data-payment-cancel]').forEach(function(button){
      button.onclick = async function(){
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const id=button.dataset.paymentCancel;
        const item=loadInspectionPayments().find(p=>String(p.id)===String(id));
        if(!item) return;
        await PAY_ITEM_ACTION.cancel(item, byId.get(String(item.carId)), false);
      };
    });
  }

  const payFilterPanel = document.getElementById('pay-pending-filter-panel');
  const payFilterToggle = document.getElementById('pay-pending-filter-toggle');
  const payFilterBody = document.getElementById('pay-pending-filter-body');
  const setPayFiltersOpen = (open) => {
    if (!payFilterPanel || !payFilterToggle || !payFilterBody) return;
    payFilterPanel.classList.toggle('is-open', open);
    payFilterBody.hidden = !open;
    payFilterToggle.setAttribute('aria-expanded', String(open));
    const arrow = payFilterToggle.querySelector('span[aria-hidden]');
    if (arrow) arrow.textContent = open ? '⌃' : '⌄';
    if (payFilterToggle.firstChild) payFilterToggle.firstChild.textContent = open ? 'إخفاء الفلاتر ' : 'إظهار الفلاتر ';
    window._payPendingFiltersOpen = open;
  };
  if (payFilterToggle) {
    payFilterToggle.addEventListener('click', () => setPayFiltersOpen(!window._payPendingFiltersOpen));
    setPayFiltersOpen(window._payPendingFiltersOpen === true);
  }

  content.querySelectorAll('#pending-quick .quick-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('#pending-quick .quick-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeQuickNote = btn.dataset.pq;
      const noteSel = document.getElementById('pay-note-payments');
      if (noteSel) {
        if (activeQuickNote === 'has_notes') noteSel.value = '__has_notes__';
        else if (activeQuickNote === 'no_notes') noteSel.value = '__no_notes__';
        else noteSel.value = '';
      }
      draw();
    });
  });

  function syncQuickFromSelect(val) {
    if (val === '__has_notes__') activeQuickNote = 'has_notes';
    else if (val === '__no_notes__') activeQuickNote = 'no_notes';
    else activeQuickNote = 'all';
    content.querySelectorAll('#pending-quick .quick-filter').forEach(b => {
      b.classList.toggle('active', b.dataset.pq === activeQuickNote);
    });
  }

  const filterIds = ['pay-search-payments', 'pay-branch-payments', 'pay-company-payments', 'pay-note-payments', 'pay-user-payments'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (id === 'pay-note-payments') syncQuickFromSelect(el.value);
        draw();
      });
      el.addEventListener('change', () => {
        if (id === 'pay-note-payments') syncQuickFromSelect(el.value);
        draw();
      });
    }
  });

  document.getElementById('pay-clear-payments')?.addEventListener('click', function(){
    filterIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    activeQuickNote = 'all';
    content.querySelectorAll('#pending-quick .quick-filter').forEach(b => {
      b.classList.toggle('active', b.dataset.pq === 'all');
    });
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);
}

