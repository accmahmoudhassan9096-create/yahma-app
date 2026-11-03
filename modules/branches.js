(function (global) {
  'use strict';

  function renderBranches(content, context) {
    const {
      fleet, getBranches, replaceBranches, ensureBranchName, branchStats,
      openBranchModal, saveBranches, emailBranch, whatsappBranch,
      downloadBranchStatusTemplate, escapeHtml
    } = context;

    document.getElementById('topbar-title').textContent = 'دليل الفروع';
    document.getElementById('topbar-sub').textContent = 'بيانات التواصل + إرسال تقارير الإيميل والواتساب لكل فرع';
    [...new Set(fleet.map(c => String(c.branch || '').trim()).filter(Boolean))].forEach(ensureBranchName);

    content.innerHTML = `
      <div class="wa-toolbar">
        <div class="wa-toolbar-info"><strong>عدد الفروع:</strong> <span class="wa-count">${getBranches().length}</span></div>
        <div class="wa-toolbar-actions">
          <button class="btn btn-primary" id="btn-add-branch">+ إضافة فرع</button>
          <!-- تحديث الفرع/الحالة من غير مكانه: الرفع الرئيسي «رفع / تحديث سيارات الأسطول» بيحدّث العمودين. -->
          <button class="btn btn-branch-import" id="btn-branch-status-import-2" hidden>تحديث فرع/حالة (Excel)</button>
          <!-- نموذج تحديث الفرع/الحالة: بيتبعت مع المستورد اللي خفياه، فاتخفى هو كمان.
               نموذج الأسطول الفارغ (umt-template) هو المستخدم دلوقتي. -->
          <button class="btn btn-ghost" id="btn-branch-status-template-2" hidden>نموذج Excel</button>
        </div>
      </div>
      <div class="filter-panel">
        <div class="filter-panel-title"><strong>البحث</strong></div>
        <div class="fleet-tools-head">
          <div class="fleet-search-wrap"><span>⌕</span><input id="br-search" aria-label="بحث في الفروع" placeholder="اسم الفرع، المسؤول، الإيميل..."></div>
        </div>
      </div>
      <div class="table-scroll" style="max-height:calc(100vh - 280px)">
        <table class="fleet-table" style="min-width:1100px">
          <thead><tr>
            <th>الفرع</th><th>المسؤول</th><th>الإيميل</th><th>واتساب</th>
            <th>السيارات</th><th>جاهزة</th><th>فحص</th><th>كارت</th><th>رخصة</th>
            <th>إجراءات</th>
          </tr></thead>
          <tbody id="br-tbody"></tbody>
        </table>
      </div>`;

    const $ = id => document.getElementById(id);
    const getBranchRows = () => {
      const q = ($('br-search')?.value || '').trim().toLowerCase();
      return getBranches()
        .filter(b => !q || [b.name, b.manager, b.email, b.phone, b.notes].join(' ').toLowerCase().includes(q))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
    };
    global._yahmaCurrentPdfData = () => ({
      title: 'دليل الفروع المفلتر',
      subtitle: 'عدد الفروع: ' + getBranchRows().length,
      headers: ['الفرع', 'المسؤول', 'الإيميل', 'الهاتف', 'السيارات', 'جاهزة', 'فحص يحتاج متابعة', 'كارت يحتاج متابعة', 'رخصة تحتاج متابعة'],
      rows: getBranchRows().map(b => {
        const s = branchStats(b.name);
        return [b.name || '—', b.manager || '—', b.email || '—', b.phone || '—', s.total, s.ready, s.insp, s.card, s.lic];
      })
    });

    function draw() {
      const list = getBranchRows();
      const tb = $('br-tbody');
      tb.innerHTML = list.length ? list.map(b => {
        const st = branchStats(b.name);
        return `<tr data-id="${escapeHtml(b.id)}">
          <td class="plate"><button type="button" class="br-name-btn" data-branch-cars="${escapeHtml(b.name||'')}" title="عرض سيارات هذا الفرع في الأسطول">${escapeHtml(b.name || '—')}</button></td>
          <td>${escapeHtml(b.manager || '—')}</td>
          <td>${escapeHtml(b.email || '—')}</td>
          <td>${escapeHtml(b.phone || '—')}</td>
          <td><b>${st.total}</b></td>
          <td><span class="tag green">${st.ready}</span></td>
          <td><span class="tag ${st.insp ? 'amber' : 'green'}">${st.insp}</span></td>
          <td><span class="tag ${st.card ? 'amber' : 'green'}">${st.card}</span></td>
          <td><span class="tag ${st.lic ? 'amber' : 'green'}">${st.lic}</span></td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-small" data-edit="${escapeHtml(b.id)}">تعديل</button>
            <button class="btn btn-ghost btn-small" data-mail-sum="${escapeHtml(b.name)}">✉ ملخص</button>
            <button class="btn btn-ghost btn-small" data-mail-insp="${escapeHtml(b.name)}">✉ فحص</button>
            <button class="btn btn-whatsapp btn-small" data-wa-insp="${escapeHtml(b.name)}" style="padding:6px 10px;font-size:11px">واتساب فحص</button>
            <button class="btn btn-ghost btn-small" data-mail-card="${escapeHtml(b.name)}">✉ كارت</button>
            <button class="btn btn-danger btn-small" data-del="${escapeHtml(b.id)}">حذف</button>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="10"><div class="empty">لا توجد فروع — أضف فرعًا أو استورد تحديثات من Excel</div></td></tr>';

      tb.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => openBranchModal(btn.dataset.edit));
      /* عرض سيارات الفرع: نكتب pendingFleetBranch ونكفي — نقرة
         ملاحة الأسطول نفسها بتستدعي render() وتستهلك الـpending
         وتضبط فلتر الفرع والصفوف. ممنوع أي set يدوي أو render()
         إضافي هنا: الـrender الثاني بيتبع استهلاك الـpending
         ومبيعيد بناء الأسطول فاضي فتظهر كل السيارات (3900+). */
      tb.querySelectorAll('[data-branch-cars]').forEach(btn => btn.onclick = () => {
        window.pendingFleetBranch = btn.dataset.branchCars || '';
        document.querySelector('.nav-item[data-tab="fleet"]')?.click();
      });
      tb.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
        if (!confirm('حذف هذا الفرع من الدليل؟ (لن تُحذف السيارات)')) return;
        btn.disabled = true;
        btn.textContent = 'جارِ الحذف...';
        try {
          replaceBranches(getBranches().filter(x => x.id !== btn.dataset.del));
          saveBranches();
          draw();
          const count = document.getElementById('count-branches');
          if (count) count.textContent = getBranches().length;
        } finally {
          btn.disabled = false;
          btn.textContent = 'حذف';
        }
      });
      tb.querySelectorAll('[data-mail-sum]').forEach(btn => btn.onclick = () => emailBranch(btn.dataset.mailSum, 'summary'));
      tb.querySelectorAll('[data-mail-insp]').forEach(btn => btn.onclick = () => emailBranch(btn.dataset.mailInsp, 'insp'));
      tb.querySelectorAll('[data-mail-card]').forEach(btn => btn.onclick = () => emailBranch(btn.dataset.mailCard, 'card'));
      tb.querySelectorAll('[data-wa-insp]').forEach(btn => btn.onclick = () => whatsappBranch(btn.dataset.waInsp, 'insp'));
    }

    $('btn-add-branch').onclick = () => openBranchModal(null);
    $('btn-branch-status-import-2').onclick = () => $('file-branch-status')?.click();
    $('btn-branch-status-template-2').onclick = downloadBranchStatusTemplate;
    /* العناصر المخفية اتشالت من الواجهة — الربط الاختياري بيخلّيها آمنة لو رجعت */
    $('br-search').oninput = draw;
    draw();
  }

  global.YahmaBranches = { render: renderBranches };
})(window);
