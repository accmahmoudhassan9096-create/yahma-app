/* ===== core/router-payments-renewed.js — تبويب «تم التجديد» =====
 *
 * رسم جدول المجدّدات، الفلاتر، والواجهة (Excel + PDF).
 *
 * نفس الكود بنفس الأسماء — globals زي ما كان.
 */
/* ===== تبويب «تم التجديد» =====
   الخطوة الأخيرة في الدورة: السيارة اتجدّدت رخصتها واتسجّل تاريخ التنفيذ.
   كل سطر بيعرض التواريخ الثلاثة: الطلب / الدفع / التجديد. */
function renderRenewedInspections(content){
  content = content || document.getElementById('content');
  if(!content) return;
  document.getElementById('topbar-title').textContent='تم التجديد';
  document.getElementById('topbar-sub').textContent='سيارات اكتملت دورة تجديد الفحص والرخصة';
  const list=loadRenewedInspections();
  const byId=new Map(fleet.map(car=>[String(car.id),car]));
  const rawRows=list.map(item=>({item,car:byId.get(String(item.carId))})).filter(r=>r.car);
  const rows=deduplicatePaymentRows(rawRows);
  PAY_ROW_INDEX.renewed=Object.create(null);
  rows.forEach(function(r){ PAY_ROW_INDEX.renewed[String(r.item.id)]=r; });
  const today=new Date(); today.setHours(0,0,0,0);
  const stampOf=(p)=>(window.YahmaPayments&&typeof window.YahmaPayments.doneStamp==='function')
    ? window.YahmaPayments.doneStamp(p) : p.licenseRenewedAt || null;
  const todayCount=rows.filter(({item})=>{ const s=stampOf(item); return s && new Date(s)>=today; }).length;
  const needsLicense=({car})=>{
    const d=car&&car.licenseExpiry?new Date(car.licenseExpiry):null;
    return !d || isNaN(d.getTime()) || d.getTime() < Date.now();
  };
  const pendingLicenseCount=rows.filter(needsLicense).length;

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
    <div class="fleet-summary-card"><span class="fleet-summary-icon">✓</span><span><b>${rows.length}</b><small>إجمالي المجدّد</small></span></div>
    <div class="fleet-summary-card"><span class="fleet-summary-icon">📅</span><span><b>${todayCount}</b><small>تم تجديدها اليوم</small></span></div>
    <div class="fleet-summary-card ${pendingLicenseCount?'attention':''}"><span class="fleet-summary-icon">📄</span><span><b>${pendingLicenseCount}</b><small>بانتظار تجديد الرخصة</small></span></div>
  </div>
  ${pendingLicenseCount > 0 ? `
  <div class="panel" style="border-inline-start:4px solid var(--amber,#D97706);margin-bottom:12px;background:rgba(217,119,6,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
    <div>
      <b style="color:#B45309">⚠️ تنبيه: يوجد ${pendingLicenseCount} سيارة مسجلة هنا ورخصتها لم تتجدد بعد</b>
      <div class="muted-small">هذه السيارات تم سداد فحصها لكن لم يصدر لها تاريخ رخصة سارٍ بعد (مكانها الطبيعي هو تبويب «تم الدفع»).</div>
    </div>
    ${(typeof payMovableRole === 'function' && payMovableRole()) ? `<button type="button" class="btn btn-primary btn-small" id="btn-revert-unrenewed">↩ إعادة ${pendingLicenseCount} سيارة غير مجددة إلى «تم الدفع»</button>` : ''}
  </div>` : ''}
  <div class="filter-panel">
    <div class="filter-panel-title"><strong>🔎 فلاتر تم التجديد</strong><span>صفِّ النتائج حسب اللوحة، الفرع، المستخدم، أو التاريخ</span></div>
    <div class="quick-filters" id="renewed-quick">
      <button type="button" class="quick-filter active" data-rq="all">الكل</button>
      <button type="button" class="quick-filter" data-rq="today">📅 تم تجديدها اليوم</button>
      ${pendingLicenseCount > 0 ? `<button type="button" class="quick-filter" data-rq="needs-license">⚠️ بانتظار تجديد الرخصة (${pendingLicenseCount})</button>` : ''}
    </div>
    <div class="fleet-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <label>بحث<input id="pay-search-renewed" placeholder="رقم اللوحة، الفرع، المالك، المستخدم، الملاحظات..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px"></label>
      <label>الفرع<select id="pay-branch-renewed">${branchOpts}</select></label>
      <label>اسم المالك<select id="pay-owner-renewed">${ownerOpts}</select></label>
      <label>المستخدم<select id="pay-user-renewed">${userOpts}</select></label>
    </div>
    <div class="filter-footer">
      <span id="pay-count-renewed">عرض ${rows.length} من ${rows.length} سيارة</span>
      <button type="button" class="btn btn-ghost btn-small" id="pay-clear-renewed">↺ مسح الفلاتر</button>
    </div>
  </div>
  ${paymentsSyncWarningHtml()}
  ${payBulkBarFor('renewed')}
  <div class="table-scroll"><table class="fleet-table" id="pay-table-renewed"><thead><tr>
    ${payCheckHeader('renewed',rows.map(function(r){return String(r.item.id);}))}<th>رقم اللوحة</th><th>الفرع</th><th>الرقم التسلسلي</th><th>رقم الحاسب</th><th>اسم المالك</th><th>تاريخ الطلب</th><th>تاريخ الدفع</th><th>تاريخ التجديد</th><th>الرخصة الجديدة</th><th>الحالة</th><th>ملاحظات</th><th>المستخدم</th><th>إجراء</th>
  </tr></thead><tbody id="pay-tbody-renewed">
  </tbody></table></div>`;

  let activeRQ = 'all';

  function getFiltered() {
    const q = (document.getElementById('pay-search-renewed')?.value || '').trim().toLowerCase();
    const branch = (document.getElementById('pay-branch-renewed')?.value || '').trim();
    const owner = (document.getElementById('pay-owner-renewed')?.value || '').trim();
    const user = (document.getElementById('pay-user-renewed')?.value || '').trim();

    return rows.filter(({item, car}) => {
      const stamp = stampOf(item);
      if (activeRQ === 'today' && (!stamp || new Date(stamp) < today)) return false;
      if (activeRQ === 'needs-license' && !needsLicense({car})) return false;

      if (q) {
        const hay = [car.plate, item.plate, car.branch, item.branch, car.serial, car.accountNo, car.ownerNumber, car.owner, car.companyName, car.licenseExpiry, car.notes, formatArabicDate(stamp), resolveItemUserName(item)].map(v => String(v || '').toLowerCase()).join(' ');
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
    const tbody = document.getElementById('pay-tbody-renewed');
    if (!tbody) return;

    PAY_ROW_INDEX.renewed=Object.create(null);
    list.forEach(function(r){ PAY_ROW_INDEX.renewed[String(r.item.id)]=r; });

    const headTh = content.querySelector('.fleet-table thead tr th.th-check');
    if (headTh) {
      headTh.outerHTML = payCheckHeader('renewed', list.map(r => String(r.item.id)));
    }

    tbody.innerHTML = list.length ? list.map(({item,car})=>{
      const stamp=stampOf(item);
      return `<tr>${payCheckCell('renewed',item.id,car.plate)}<td class="plate">${escapeHtml(car.plate||item.plate||'—')}</td>
        <td>${escapeHtml(car.branch||item.branch||'—')}</td>
        <td class="serial-cell">${escapeHtml(car.serial||'—')}</td>
        <td>${escapeHtml(car.accountNo||car.ownerNumber||'—')}</td>
        <td>${escapeHtml(car.owner||car.companyName||'—')}</td>
        <td>${escapeHtml(formatArabicDate(item.requestedAt))}</td>
        <td>${escapeHtml(formatArabicDate(item.paidAt))}</td>
        <td><b>${escapeHtml(formatArabicDate(stamp))}</b></td>
        <td>${fmtDate(car.licenseExpiry)}</td>
        <td><span class="tag green">تم التجديد</span></td>
        ${payNoteCell(car)}
        <td>${escapeHtml(resolveItemUserName(item))}</td>
        <td>${canDeleteHere() ? `<button type="button" class="btn btn-ghost btn-small" data-stepback-renewed="${escapeHtml(item.id)}" title="رجوع السيارة لِتبويب «تم الدفع»">↩ رجوع لِتم الدفع</button> <button type="button" class="btn btn-danger btn-small" data-del-car="${escapeHtml(car.id)}" data-plate="${escapeHtml(car.plate||'')}" title="حذف السيارة نهائيًا">🗑</button>` : '<span class="tag grey" style="opacity:0.75">عرض فقط</span>'}</td></tr>`;
    }).join('') : '<tr><td class="empty-span"><div class="empty">لم يتم تسجيل أي تجديد بعد</div></td></tr>';

    const countLabel = document.getElementById('pay-count-renewed');
    if (countLabel) countLabel.textContent = 'عرض ' + list.length + ' من ' + rows.length + ' سيارة';

    window._yahmaCurrentPdfData=()=>({
      title:'سجل تجديد الرخص',
      subtitle:'عدد العمليات: '+list.length,
      headers:['رقم اللوحة','الفرع','الرقم التسلسلي','رقم الحاسب','اسم المالك','تاريخ الطلب','تاريخ الدفع','تاريخ التجديد','الرخصة الجديدة','الحالة','ملاحظات','المستخدم'],
      rows:list.map(({item,car})=>[
        car.plate||item.plate||'—', car.branch||item.branch||'—',
        car.serial||'—', car.accountNo||car.ownerNumber||'—', car.owner||car.companyName||'—',
        formatArabicDate(item.requestedAt), formatArabicDate(item.paidAt),
        formatArabicDate(stampOf(item)), fmtDate(car.licenseExpiry), 'تم التجديد', car.notes||'—', resolveItemUserName(item)])
    });

    bindRowButtons();
    bindPayNotes(content);
    bindPaySelection(content,'renewed');
  fixPaySpans(content);
  }

  function bindRowButtons() {
    content.querySelectorAll('[data-stepback-renewed]').forEach(function(button){
      button.onclick = async function(){
        if(!canDeleteHere()){
          alert('هذا الإجراء متاح لمدير النظام فقط.');
          return;
        }
        if(!canRunPayments('إدارة طلبات الدفع')) return;
        const item=loadRenewedInspections().find(p=>String(p.id)===String(button.dataset.stepbackRenewed));
        if(!item) return;
        await PAY_ITEM_ACTION.back2(item, fleet.find(c=>String(c.id)===String(item.carId)), false);
      };
    });
  }

  content.querySelectorAll('#renewed-quick .quick-filter').forEach(btn => {
    btn.onclick = () => {
      content.querySelectorAll('#renewed-quick .quick-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRQ = btn.dataset.rq;
      draw();
    };
  });

  ['pay-search-renewed', 'pay-branch-renewed', 'pay-owner-renewed', 'pay-user-renewed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', draw);
      el.addEventListener('change', draw);
    }
  });

  document.getElementById('pay-clear-renewed')?.addEventListener('click', function(){
    ['pay-search-renewed', 'pay-branch-renewed', 'pay-owner-renewed', 'pay-user-renewed'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    activeRQ = 'all';
    content.querySelectorAll('#renewed-quick .quick-filter').forEach(b => b.classList.toggle('active', b.dataset.rq === 'all'));
    draw();
  });

  draw();
  bindPaymentsDiagnostic(content);

  const btnRev = content.querySelector('#btn-revert-unrenewed');
  if (btnRev) {
    btnRev.onclick = async () => {
      const targets = rows.filter(needsLicense);
      if (!targets.length) {
        alert('لا توجد سيارات بحاجة للإعادة.');
        return;
      }
      if (!confirm('إعادة ' + targets.length + ' سيارة لم تتجدد رخصتها بعد إلى تبويب «تم الدفع»؟\n\nستعود هذه السيارات فورًا إلى قائمة «تم الدفع» حتى يتم تجديد رخصها فعليًا.')) return;
      btnRev.disabled = true;
      btnRev.textContent = 'جارِ النقل...';
      for (const r of targets) {
        try {
          if (typeof PAY_ITEM_ACTION !== 'undefined' && PAY_ITEM_ACTION.back2) {
            await PAY_ITEM_ACTION.back2(r.item, r.car, true);
          }
        } catch (e) {
          if (typeof yahmaErr === 'function') yahmaErr(e, 'router-payments-renewed.js:btn-revert-unrenewed');
        }
      }
      render();
    };
  }
}

