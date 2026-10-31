(function (global) {
  'use strict';

  const AUDIT_KEY = 'fleet-audit-v1';

  async function loadUserMap() {
    const userMap = new Map();
    if (global.supabaseReady && global.supabaseClient) {
      try {
        const res = await global.supabaseClient.from('profiles').select('id,full_name,email');
        if (res && res.data) {
          res.data.forEach(p => {
            const name = String(p.full_name || '').trim();
            if (name) {
              if (p.id) userMap.set(String(p.id).trim(), name);
              if (p.email) userMap.set(String(p.email).trim().toLowerCase(), name);
            }
          });
        }
      } catch (_) {}
    }
    try {
      const curName = (global.currentUserName && global.currentUserName.trim()) ||
        localStorage.getItem('yahma_last_user_name') ||
        (global.YahmaPayments && typeof global.YahmaPayments.getCurrentActorName === 'function' && global.YahmaPayments.getCurrentActorName());
      if (curName) {
        if (global.currentUser?.id) userMap.set(String(global.currentUser.id).trim(), curName);
        if (global.currentUser?.email) userMap.set(String(global.currentUser.email).trim().toLowerCase(), curName);
      }
    } catch (_) {}
    return userMap;
  }

  function resolveDisplayName(r, userMap) {
    if (r.user_name && String(r.user_name).trim()) return String(r.user_name).trim();
    if (r.user_id && userMap && userMap.has(String(r.user_id).trim())) {
      return userMap.get(String(r.user_id).trim());
    }
    const em = String(r.user_email || '').trim().toLowerCase();
    if (em && userMap && userMap.has(em)) {
      return userMap.get(em);
    }
    const u = String(r.user || '').trim();
    if (u) {
      if (userMap && userMap.has(u.toLowerCase())) return userMap.get(u.toLowerCase());
      if (!u.includes('@')) return u;
    }
    if (em && em.includes('@')) {
      const prefix = em.split('@')[0].replace(/[\._\-]+/g, ' ').trim();
      return prefix || em;
    }
    return u || 'مستخدم';
  }

  async function fetchAuditRows() {
    let rows = [];
    if (global.supabaseReady && global.supabaseClient) {
      try {
        const res = await global.supabaseClient.from('audit_logs')
          .select('id,user_id,user_email,role,action,detail,created_at')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (!res.error && res.data) rows = res.data;
      } catch (_) {}
    }
    if (!rows.length) {
      try {
        rows = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]').map(x => ({
          user: x.user || x.user_name || x.user_email,
          user_email: x.user_email || x.user,
          user_name: x.user_name || x.user,
          role: x.role,
          action: x.action,
          detail: x.detail,
          created_at: x.at || x.created_at
        }));
      } catch (_) { rows = []; }
    }
    return rows;
  }

  function esc(v) {
    return String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'م' : 'ص';
      const h12 = String(hours % 12 || 12).padStart(2, '0');
      return `${day}/${month}/${year} — ${h12}:${minutes} ${ampm}`;
    } catch (_) {
      return String(iso);
    }
  }

  function renderAuditPage(content, context) {
    content = content || document.getElementById('content');
    if (!content) return;
    context = context || { currentRole: global.currentRole };

    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = 'سجل نشاط المستخدمين';
    const subEl = document.getElementById('topbar-sub');
    if (subEl) subEl.textContent = 'كل الحركات المسجلة بالتاريخ والوقت ومتابعة أداء المستخدمين';

    if (context.currentRole !== 'admin') {
      content.innerHTML = '<div class="panel"><h3>سجل نشاط المستخدمين</h3><p class="muted-small">عذرًا، سجل النشاط متاح لمدير النظام فقط.</p></div>';
      return;
    }

    content.innerHTML = `
      <div class="fleet-summary-strip module-summary-strip" id="audit-kpis">
        <div class="fleet-summary-card"><span class="fleet-summary-icon">📋</span><span><b id="audit-total-count">—</b><small>إجمالي الحركات</small></span></div>
        <div class="fleet-summary-card total"><span class="fleet-summary-icon">👤</span><span><b id="audit-filtered-count">—</b><small>الحركات المعروضة</small></span></div>
        <div class="fleet-summary-card ready"><span class="fleet-summary-icon">👥</span><span><b id="audit-users-count">—</b><small>المستخدمين النشطين</small></span></div>
        <div class="fleet-summary-card out"><span class="fleet-summary-icon">⏱️</span><span><b id="audit-last-time" style="font-size:11.5px">—</b><small>آخر حركة مسجلة</small></span></div>
      </div>

      <div class="filter-panel" style="margin-bottom:14px">
        <div class="filter-panel-title">
          <div>
            <strong>🔎 فلترة سجل النشاط وحركات المستخدمين</strong>
            <span>اختر مستخدمًا لعرض جميع عملياته بالتفصيل</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-small" id="audit-refresh-btn">↻ تحديث</button>
            <button type="button" class="btn btn-ghost btn-small" id="audit-export-xlsx">📊 Excel</button>
            <button type="button" class="btn btn-ghost btn-small" id="audit-export-csv">📄 CSV</button>
            <button type="button" class="btn btn-ghost btn-small" id="audit-export-pdf">📑 PDF</button>
          </div>
        </div>
        <div class="fleet-filter-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          <label><b>المستخدم:</b>
            <select id="audit-sel-user" style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px;background:var(--paper,#fff);color:var(--text);width:100%">
              <option value="">جاري التحميل...</option>
            </select>
          </label>
          <label><b>نوع العملية:</b>
            <select id="audit-sel-action" style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px;background:var(--paper,#fff);color:var(--text);width:100%">
              <option value="">كل العمليات</option>
            </select>
          </label>
          <label style="grid-column:span 2"><b>بحث في السجل:</b>
            <input id="audit-ipt-search" placeholder="ابحث بالحركة، التفاصيل، رقم اللوحة..." style="padding:7px 9px;border:1px solid var(--line);border-radius:7px;font-family:inherit;font-size:12px;width:100%">
          </label>
        </div>
        <div class="filter-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
          <span id="audit-count-label" style="font-size:12px;color:var(--muted)">جاري جلب البيانات...</span>
          <button type="button" class="btn btn-ghost btn-small" id="audit-clear-btn">↺ مسح الفلاتر</button>
        </div>
      </div>

      <div class="table-scroll" style="max-height:65vh;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--paper,#fff)">
        <table class="fleet-table" style="min-width:750px">
          <thead>
            <tr>
              <th style="width:190px">التاريخ والوقت</th>
              <th style="width:200px">المستخدم</th>
              <th style="width:90px">الدور</th>
              <th style="width:170px">نوع الحركة</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody id="audit-tbody">
            <tr><td colspan="5" class="empty" style="padding:24px;text-align:center">جاري تحميل سجل النشاط...</td></tr>
          </tbody>
        </table>
      </div>

      <div class="pager" id="audit-pager" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div class="pager-info" id="audit-pager-info">—</div>
        <div class="pager-controls">
          <button type="button" class="btn btn-ghost btn-small" id="audit-pager-prev">‹ السابق</button>
          <span id="audit-pager-page" style="margin:0 8px;font-size:12px">صفحة 1</span>
          <button type="button" class="btn btn-ghost btn-small" id="audit-pager-next">التالي ›</button>
        </div>
        <label class="pager-size">عرض:
          <select id="audit-pager-size" style="padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px">
            <option value="50">50</option>
            <option value="100" selected>100</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="0">الكل</option>
          </select>
        </label>
      </div>
    `;

    let allRows = [];
    let page = 1;
    let pageSize = 100;

    function getFiltered() {
      const userSel = (document.getElementById('audit-sel-user')?.value || '').trim().toLowerCase();
      const actionSel = (document.getElementById('audit-sel-action')?.value || '').trim().toLowerCase();
      const q = (document.getElementById('audit-ipt-search')?.value || '').trim().toLowerCase();

      return allRows.filter(r => {
        const u = String(r.display_user || '').trim().toLowerCase();
        if (userSel && u !== userSel) return false;
        const a = String(r.action || '').trim().toLowerCase();
        if (actionSel && a !== actionSel) return false;
        if (q) {
          const hay = [u, r.user_email, r.user, a, r.detail, r.role, fmtDateTime(r.created_at || r.at)].map(v => String(v || '').toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    function draw() {
      const filtered = getFiltered();
      const total = filtered.length;
      const size = pageSize > 0 ? pageSize : (total || 1);
      const totalPages = Math.max(1, Math.ceil((total || 1) / size));
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      const start = (page - 1) * size;
      const paged = pageSize > 0 ? filtered.slice(start, start + size) : filtered;

      // Update KPIs
      const totalCountEl = document.getElementById('audit-total-count');
      if (totalCountEl) totalCountEl.textContent = allRows.length;
      const filtCountEl = document.getElementById('audit-filtered-count');
      if (filtCountEl) filtCountEl.textContent = filtered.length;

      const countLabel = document.getElementById('audit-count-label');
      if (countLabel) countLabel.textContent = `عرض ${paged.length} من أصل ${filtered.length} حركة مطابقة (إجمالي السجل: ${allRows.length})`;

      const pagerInfo = document.getElementById('audit-pager-info');
      if (pagerInfo) pagerInfo.textContent = total ? `عرض ${start + 1}–${Math.min(start + paged.length, total)} من ${total}` : 'لا نتائج';

      const pageNumEl = document.getElementById('audit-pager-page');
      if (pageNumEl) pageNumEl.textContent = `صفحة ${page} من ${totalPages}`;

      const prevBtn = document.getElementById('audit-pager-prev');
      if (prevBtn) prevBtn.disabled = page <= 1;
      const nextBtn = document.getElementById('audit-pager-next');
      if (nextBtn) nextBtn.disabled = page >= totalPages;

      const tbody = document.getElementById('audit-tbody');
      if (!tbody) return;

      tbody.innerHTML = paged.length ? paged.map(r => {
        const u = r.display_user || '—';
        const role = r.role || '—';
        const action = r.action || '—';
        const detail = r.detail || '—';
        const dt = fmtDateTime(r.created_at || r.at);

        let tagClass = 'blue';
        if (action.includes('حذف') || action.includes('خروج')) tagClass = 'red';
        else if (action.includes('دفع') || action.includes('تجديد') || action.includes('إضافة')) tagClass = 'green';
        else if (action.includes('تعديل') || action.includes('نقل')) tagClass = 'amber';

        return `<tr>
          <td dir="ltr" style="font-size:11.5px;color:var(--muted)">${esc(dt)}</td>
          <td><b>${esc(u)}</b></td>
          <td><span class="role-badge" style="font-size:10.5px">${esc(role)}</span></td>
          <td><span class="tag ${tagClass}">${esc(action)}</span></td>
          <td style="max-width:340px;white-space:normal;word-break:break-word">${esc(detail)}</td>
        </tr>`;
      }).join('') : `<tr><td colspan="5" class="empty" style="padding:24px;text-align:center">لا توجد حركات مطابقة للفلاتر الحالية.</td></tr>`;

      global._yahmaCurrentPdfData = () => ({
        title: 'سجل نشاط المستخدمين',
        subtitle: `عدد الحركات المعروضة: ${filtered.length}`,
        headers: ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'],
        rows: filtered.map(r => [
          fmtDateTime(r.created_at || r.at),
          r.display_user || '—',
          r.role || '—',
          r.action || '—',
          r.detail || '—'
        ])
      });
    }

    global._yahmaModuleExport = function (fmt) {
      const rows = getFiltered();
      if (!rows.length) { alert('لا توجد حركات للتصدير.'); return; }
      if (fmt === 'pdf') {
        const title = 'سجل نشاط المستخدمين';
        const headers = ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'];
        const data = rows.map(r => [
          fmtDateTime(r.created_at || r.at),
          r.display_user || '—',
          r.role || '—',
          r.action || '—',
          r.detail || '—'
        ]);
        const name = 'سجل-النشاط-' + new Date().toISOString().slice(0, 10) + '.pdf';
        if (global.YahmaExport && global.YahmaExport.exportTablePdf) {
          global.YahmaExport.exportTablePdf({ title, subtitle: 'عدد السجلات: ' + rows.length, headers, rows: data, filename: name });
        } else if (typeof global.openPrintWindow === 'function') {
          global.openPrintWindow(title, 'عدد السجلات: ' + rows.length, headers, data);
        }
        return;
      }
      exportCsv(rows);
    };

    function exportCsv(rows) {
      const lines = [
        ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'],
        ...rows.map(r => [fmtDateTime(r.created_at || r.at), r.display_user || '—', r.role || '—', r.action || '—', r.detail || '—'])
      ];
      const csv = '\uFEFF' + lines.map(x => x.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'سجل-النشاط-' + (typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0, 10)) + '.csv';
      a.click();
    }

    async function exportXlsx(rows) {
      if (typeof global.ensureXlsxReady === 'function') {
        const ok = await global.ensureXlsxReady();
        if (!ok) { exportCsv(rows); return; }
      }
      if (!global.XLSX) { exportCsv(rows); return; }
      const headers = ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'];
      const data = rows.map(r => [
        fmtDateTime(r.created_at || r.at),
        r.display_user || '—',
        r.role || '—',
        r.action || '—',
        r.detail || '—'
      ]);
      const ws = global.XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 45 }];
      const wb = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(wb, ws, 'سجل النشاط');
      global.XLSX.writeFile(wb, 'سجل-النشاط-' + (typeof global.todayStr === 'function' ? global.todayStr() : Date.now()) + '.xlsx');
    }

    async function loadData() {
      const userMap = await loadUserMap();
      allRows = await fetchAuditRows();
      allRows.forEach(r => {
        r.display_user = resolveDisplayName(r, userMap);
      });

      const userCounts = new Map();
      const actionCounts = new Map();
      allRows.forEach(r => {
        const u = String(r.display_user || '—').trim();
        userCounts.set(u, (userCounts.get(u) || 0) + 1);
        const a = String(r.action || '—').trim();
        actionCounts.set(a, (actionCounts.get(a) || 0) + 1);
      });

      const usersCountEl = document.getElementById('audit-users-count');
      if (usersCountEl) usersCountEl.textContent = userCounts.size;

      const lastTimeEl = document.getElementById('audit-last-time');
      if (lastTimeEl) {
        lastTimeEl.textContent = allRows.length ? fmtDateTime(allRows[0].created_at || allRows[0].at) : '—';
      }

      const userSel = document.getElementById('audit-sel-user');
      if (userSel) {
        const sortedUsers = [...userCounts.keys()].sort((a, b) => a.localeCompare(b, 'ar'));
        userSel.innerHTML = `<option value="">كل المستخدمين (${sortedUsers.length})</option>` +
          sortedUsers.map(u => `<option value="${esc(u.toLowerCase())}">${esc(u)} (${userCounts.get(u)} حركة)</option>`).join('');
      }

      const actionSel = document.getElementById('audit-sel-action');
      if (actionSel) {
        const sortedActions = [...actionCounts.keys()].sort((a, b) => a.localeCompare(b, 'ar'));
        actionSel.innerHTML = `<option value="">كل العمليات (${sortedActions.length})</option>` +
          sortedActions.map(a => `<option value="${esc(a.toLowerCase())}">${esc(a)} (${actionCounts.get(a)})</option>`).join('');
      }

      draw();
    }

    document.getElementById('audit-sel-user')?.addEventListener('change', () => { page = 1; draw(); });
    document.getElementById('audit-sel-action')?.addEventListener('change', () => { page = 1; draw(); });
    (function () {
      let t = null;
      document.getElementById('audit-ipt-search')?.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { page = 1; draw(); }, 180);
      });
    })();

    document.getElementById('audit-clear-btn')?.addEventListener('click', () => {
      const u = document.getElementById('audit-sel-user'); if (u) u.value = '';
      const a = document.getElementById('audit-sel-action'); if (a) a.value = '';
      const s = document.getElementById('audit-ipt-search'); if (s) s.value = '';
      page = 1; draw();
    });

    document.getElementById('audit-refresh-btn')?.addEventListener('click', loadData);
    document.getElementById('audit-export-xlsx')?.addEventListener('click', () => exportXlsx(getFiltered()));
    document.getElementById('audit-export-csv')?.addEventListener('click', () => exportCsv(getFiltered()));
    document.getElementById('audit-export-pdf')?.addEventListener('click', () => global._yahmaModuleExport('pdf'));

    document.getElementById('audit-pager-prev')?.addEventListener('click', () => { page = Math.max(1, page - 1); draw(); });
    document.getElementById('audit-pager-next')?.addEventListener('click', () => { page++; draw(); });
    document.getElementById('audit-pager-size')?.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 0;
      page = 1; draw();
    });

    loadData();
  }

  /* ===== سجل حركة السيارة (Timeline في «ملف السيارة 360») =====
     نافذة الـ360 بتطلب window.getCarAudit(id) — كانت مش معرّفة،
     فالسجل كان فاضي دايمًا. بجمع من مصدرين:
     1) دورة الدفع: تحت الدفع/تم الدفع/تم التجديد + مين عمل كل خطوة
        (مع الوقت الحقيقي لكل مرحلة من الحقول المخزنة).
     2) سجل النشاط (audit_logs): أي حركة الـdetail فيها لوحة السيارة.
     الترتيب: الأحدث الأول، وبنحذف الازدواج بنفس العملية والوقت. */
  var auditRowsCache = [];
  function primeAuditCache() {
    fetchAuditRows().then(function (rows) {
      if (Array.isArray(rows) && rows.length) auditRowsCache = rows;
    }).catch(function () {});
  }
  primeAuditCache();

  function collectPaymentEvents(events, carId) {
    var p = global.YahmaPayments;
    if (!p || typeof p.localAll !== 'function') return;
    var isRen = typeof p.isRenewed === 'function' ? p.isRenewed : function () { return false; };
    var doneStampOf = typeof p.doneStamp === 'function' ? p.doneStamp : function () { return null; };
    p.localAll().forEach(function (x) {
      if (!x || x.carId === undefined) return;
      if (String(x.carId) !== String(carId)) return;
      var actor = String(x.userName || 'مستخدم').trim() || 'مستخدم';
      if (x.requestedAt && x.status === 'pending') {
        events.push({ at: x.requestedAt, action: 'طلب دفع الفحص ← «تحت الدفع»', detail: 'بواسطة: ' + actor });
      }
      if (x.paidAt) {
        events.push({ at: x.paidAt, action: 'قبض الدفعة ← «تم الدفع»', detail: isRen(x) ? 'بواسطة: ' + actor : 'بواسطة: ' + actor });
      }
      var renewStamp = isRen(x) ? (doneStampOf(x) || x.paidAt) : null;
      if (renewStamp) {
        events.push({ at: renewStamp, action: 'اكتمال تجديد الرخصة ← «تم التجديد»', detail: 'بواسطة: ' + actor });
      }
    });
  }

  global.getCarAudit = function (carId) {
    var plate = '';
    if (typeof fleet !== 'undefined' && Array.isArray(fleet)) {
      var found = fleet.find(function (c) { return String(c.id) === String(carId); });
      plate = String((found && found.plate) || '').trim();
    }
    var events = [];
    try { collectPaymentEvents(events, carId); } catch (_) {}
    try {
      var normPlate = plate.replace(/[\s]/g, '');
      auditRowsCache.forEach(function (r) {
        if (!r) return;
        var hay = String((r.action || '') + ' ' + (r.detail || ''));
        var hayNorm = hay.replace(/[\s]/g, '');
        if (normPlate && hayNorm.includes(normPlate)) {
          var who;
          try { who = resolveDisplayName(r, null); } catch (_) { who = r.user_name || r.user_email || 'مستخدم'; }
          events.push({ at: r.created_at, action: r.action || 'حركة', detail: 'بواسطة: ' + who + (r.detail ? ' — ' + r.detail : '') });
        }
      });
    } catch (_) {}
    var filtered = events.filter(function (e) {
      return e && e.at && !isNaN(new Date(e.at).getTime());
    }).sort(function (a, b) { return new Date(b.at).getTime() - new Date(a.at).getTime(); });
    var seen = new Map();
    var unique = [];
    filtered.forEach(function (e) {
      var key = String(e.action) + '|' + String(e.at).slice(0, 16);
      if (seen.has(key)) return;
      seen.set(key, 1);
      unique.push({ at: e.at, action: e.action, detail: e.detail, displayAt: fmtDateTime(e.at) });
    });
    return unique;
  };

  global.YahmaAudit = { render: renderAuditPage };
})(window);
