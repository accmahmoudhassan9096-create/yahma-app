/* ===== كارت «تقرير الفحص الأسبوعي للفرع» — إدارة بريد الفروع والإرسال ===== */
(function (global) {
  'use strict';

  const FN = 'send-user-email';
  const PROJECT_REF = 'dzildqysxdlnfsmjttjg';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxkcXlzeGRsbmZzbWp0dGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTU3NTMsImV4cCI6MjEwNTYzMTc1M30.UdcML-28I0ndel65IMBxfG7wMOZjRK9ZlrjTj_JFyVc';
  const url = () => (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || `https://${PROJECT_REF}.supabase.co`;
  const LS_DRAFT = 'yahma-branch-contacts-v1';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let branches = [];
  let contacts = [];
  let preview = null;

  const readDraft = () => { try { const v = JSON.parse(localStorage.getItem(LS_DRAFT) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const writeDraft = (map) => { try { localStorage.setItem(LS_DRAFT, JSON.stringify(map || {})); } catch (e) {} };

  async function call(action, extra) {
    if (typeof supabaseReady === 'undefined' || !supabaseReady || !supabaseClient) throw new Error('يلزم تسجيل الدخول');
    const { data: sess } = await supabaseClient.auth.getSession();
    const token = sess?.session?.access_token;
    const res = await fetch(`${url()}/functions/v1/${FN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
      body: JSON.stringify(Object.assign({ action }, extra || {})),
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || `تعذّر الاتصال بالخدمة (${res.status})`);
    return data;
  }

  const status = (el, text, isErr) => {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'muted-small' + (isErr ? ' branch-mail-err' : '');
  };

  function rowsHtml() {
    const draft = readDraft();
    if (!branches.length) return '<div class="empty">لا توجد فروع في الأسطول بعد.</div>';
    const byName = {};
    contacts.forEach((c) => { byName[c.branch_name] = c; });
    return branches.map((b) => {
      const saved = byName[b.name] || {};
      const email = draft[b.name] !== undefined ? draft[b.name] : (saved.email || '');
      const active = saved.active !== false;
      return `<tr data-branch="${esc(b.name)}">
        <td><b>${esc(b.name)}</b><div class="muted-small">${b.cars} سيارة</div></td>
        <td><input type="email" class="branch-mail-input" data-branch="${esc(b.name)}" value="${esc(email)}" placeholder="branch@company.com" dir="ltr" aria-label="بريد ${esc(b.name)}"></td>
        <td><label class="branch-mail-active"><input type="checkbox" class="branch-mail-on" data-branch="${esc(b.name)}"${active ? ' checked' : ''}> مُفعّل</label></td>
        <td class="branch-mail-state">${saved.email ? '<span class="tag green">محفوظ</span>' : '<span class="tag amber">غير محفوظ</span>'}</td>
        <td class="branch-mail-pending muted-small">—</td>
      </tr>`;
    }).join('');
  }

  function paint(container) {
    const list = container.querySelector('#branch-mail-list');
    if (list) list.innerHTML = rowsHtml();
    if (preview && preview.reports) {
      const map = {};
      preview.reports.forEach((r) => { map[r.branch] = r; });
      container.querySelectorAll('.branch-mail-pending').forEach((td) => {
        const name = td.parentElement?.dataset?.branch;
        const rep = map[name];
        td.textContent = rep ? `${rep.pending} من ${rep.total} تحتاج فحص` : '—';
        td.style.color = rep && rep.pending ? '#CE4B3D' : '';
      });
    }
  }

  async function mount(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="rd-card-h"><h3>📧 تقرير الفحص الأسبوعي لكل فرع</h3><span class="rd-chip">بريد لكل فرع</span></div>
      <p class="muted-small">كل أسبوع: كل فرع يستلم إيميل فيه أرقام لوحاته التي لم يتم فحصها (أو رخصتها منتهية). التفعيل يتم من «الإرسال المجدول» أدناه.</p>
      <div class="branch-mail-actions">
        <button type="button" class="btn btn-ghost btn-small" id="branch-mail-reload">↻ تحديث</button>
        <button type="button" class="btn btn-ghost btn-small" id="branch-mail-preview">👁 معاينة القائمة</button>
        <button type="button" class="btn btn-primary btn-small" id="branch-mail-save">💾 حفظ البريد</button>
        <button type="button" class="btn btn-primary btn-small" id="branch-mail-send">📤 إرسال الآن</button>
      </div>
      <div class="muted-small" id="branch-mail-status" role="status" aria-live="polite" style="margin:8px 0"></div>
      <div class="table-scroll branch-mail-wrap">
        <table class="fleet-table"><thead><tr>
          <th>الفرع</th><th>البريد الإلكتروني</th><th>الحالة</th><th>المحفوظ</th><th>يحتاج فحص</th>
        </tr></thead><tbody id="branch-mail-list"></tbody></table>
      </div>`;

    const st = container.querySelector('#branch-mail-status');
    const load = async (silent) => {
      try {
        status(st, silent ? 'جارٍ التحديث…' : 'جارٍ تحميل الفروع…');
        const data = await call('list_branch_contacts');
        branches = data.branches || [];
        contacts = data.contacts || [];
        paint(container);
        status(st, branches.length + ' فرع · ' + contacts.length + ' بريد محفوظ');
      } catch (e) { status(st, String(e.message || e), true); }
    };
    await load(true);

    container.addEventListener('input', (e) => {
      const input = e.target.closest?.('.branch-mail-input');
      if (!input) return;
      const draft = readDraft();
      draft[input.dataset.branch] = input.value;
      writeDraft(draft);
    });

    container.querySelector('#branch-mail-reload').onclick = () => load();
    container.querySelector('#branch-mail-preview').onclick = async () => {
      try {
        status(st, 'جارٍ حساب قائمة الفحص…');
        preview = await call('preview_branch_inspection');
        paint(container);
        const total = preview.reports.reduce((s, r) => s + r.pending, 0);
        status(st, `معاينة ${preview.date} — إجمالي ما يحتاج فحص: ${total} سيارة`);
      } catch (e) { status(st, String(e.message || e), true); }
    };
    container.querySelector('#branch-mail-save').onclick = async () => {
      const draft = readDraft();
      const items = [];
      container.querySelectorAll('.branch-mail-input').forEach((input) => {
        const name = input.dataset.branch;
        const on = container.querySelector('.branch-mail-on[data-branch="' + CSS.escape(name) + '"]');
        const email = String(input.value || '').trim();
        if (email) items.push({ branch_name: name, email, active: !!(on && on.checked) });
      });
      if (!items.length) { status(st, 'أدخل بريدًا واحدًا على الأقل', true); return; }
      try {
        status(st, 'جارٍ الحفظ…');
        const res = await call('save_branch_contacts', { contacts: items });
        writeDraft({});
        await load(true);
        status(st, 'تم حفظ ' + res.saved + ' بريد' + (res.errors && res.errors.length ? ' — أخطاء: ' + res.errors.join(' | ') : ''), !!(res.errors && res.errors.length));
      } catch (e) { status(st, String(e.message || e), true); }
    };
    container.querySelector('#branch-mail-send').onclick = async () => {
      const targets = [];
      container.querySelectorAll('.branch-mail-input').forEach((input) => {
        if (String(input.value || '').trim()) targets.push(input.dataset.branch);
      });
      if (!targets.length) { status(st, 'أدخل بريدًا واحدًا على الأقل', true); return; }
      if (!confirm('إرسال تقرير الفحص إلى ' + targets.length + ' فرع؟')) return;
      try {
        status(st, 'جارٍ الإرسال…');
        const res = await call('send_branch_inspection', { branches: targets });
        await load(true);
        const detail = (res.results || []).map((r) => `${r.branch}: ${r.sent ? 'تم' : 'فشل ' + (r.error || '')}`).join(' · ');
        status(st, `أُرسل ${res.sent} · فشل ${res.failed}${detail ? ' — ' + detail : ''}`, res.failed > 0);
      } catch (e) { status(st, String(e.message || e), true); }
    };
  }

  global.YahmaBranchEmail = { mount, call, readDraft, writeDraft };
})(typeof window !== 'undefined' ? window : this);