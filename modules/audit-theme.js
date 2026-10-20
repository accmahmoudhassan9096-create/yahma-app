/* ===== سجل النشاط + تبديل الوضع الليلي ===== */
/* استُخرجت من app-core.js (السطور 2160-2500) ضمن تقسيم الملفات.
   ملاحظة: هذه الكتلة IIFE واحدة مغلقة على نفسها (تبدأ 2162 وتنتهي 2498)
   وتحتوي سجل النشاط + initTheme — لذلك لا يمكن فصلها إلى ملفين. */

/* ===== inline ===== */

(function(){
 const AUDIT='fleet-audit-v1';
 function formatAuditDateTime(v){
  if(!v) return '—';
  try{
    const d=new Date(v);
    if(isNaN(d.getTime())) return String(v);
    const day=String(d.getDate()).padStart(2,'0');
    const month=String(d.getMonth()+1).padStart(2,'0');
    const year=d.getFullYear();
    const hours=d.getHours();
    const minutes=String(d.getMinutes()).padStart(2,'0');
    const ampm=hours>=12?'م':'ص';
    const h12=String(hours%12||12).padStart(2,'0');
    return `${day}/${month}/${year} — ${h12}:${minutes} ${ampm}`;
  }catch(_){ return String(v); }
 }

 function log(action,detail){
  const actorName = (typeof window !== 'undefined' && ((window.YahmaPayments && typeof window.YahmaPayments.getCurrentActorName === 'function' && window.YahmaPayments.getCurrentActorName()) || window.currentUserName || (window.currentUser && window.currentUser.email))) || 'مستخدم محلي';
  const userEmail = (window.currentUser && window.currentUser.email) || '';
  const record={at:new Date().toISOString(),displayAt:formatAuditDateTime(new Date()),user:actorName,user_email:userEmail,user_name:actorName,role:window.currentRole||'view',action,detail};
  let a=[];try{a=JSON.parse(localStorage.getItem(AUDIT)||'[]')}catch(e){yahmaErr(e,'audit-theme.js:12');}
  a.unshift(record);localStorage.setItem(AUDIT,JSON.stringify(a.slice(0,500)));
  if(!window._demoMode&&window.supabaseReady&&window.supabaseClient&&window.currentUser?.id){
    window.supabaseClient.from('audit_logs').insert({user_id:window.currentUser.id,user_email:record.user_email||record.user,role:record.role,action:record.action,detail:record.detail,created_at:record.at}).then(()=>{}).catch(()=>{});
  }
 }
 /* نُصيّح window.log عند التحميل لا عند أول استدعاء — كان السطر داخل دالة log
    فبقي window.log غير معرّف حتى أول حفظ، فتسقط النداءات الخام log(...) في
    app-core/reports بـ ReferenceError. */
 window.log=log;

 window.openAuditReport=async function(){
  if(window.currentRole!=='admin'){alert('سجل النشاط متاح للمدير فقط.');return;}
  let rows=[];
  const userMap = new Map();
  if(window.supabaseReady&&window.supabaseClient){
    try {
      const [auditRes, profRes] = await Promise.all([
        window.supabaseClient.from('audit_logs').select('id,user_id,user_email,role,action,detail,created_at').order('created_at',{ascending:false}).limit(1000),
        window.supabaseClient.from('profiles').select('id,full_name,email')
      ]);
      if(!auditRes.error && auditRes.data) rows=auditRes.data;
      if(!profRes.error && profRes.data){
        profRes.data.forEach(p => {
          const name = String(p.full_name || '').trim();
          if(name){
            if(p.id) userMap.set(String(p.id).trim(), name);
            if(p.email) userMap.set(String(p.email).trim().toLowerCase(), name);
          }
        });
      }
    } catch (_) {}
  }
  if(!rows.length){try{rows=JSON.parse(localStorage.getItem(AUDIT)||'[]').map(x=>({user_email:x.user_email||x.user,user_name:x.user_name||x.user,role:x.role,action:x.action,detail:x.detail,created_at:x.at}))}catch(e){rows=[]}}

  try {
    const curName = (window.currentUserName && window.currentUserName.trim()) ||
      localStorage.getItem('yahma_last_user_name') ||
      (window.YahmaPayments && typeof window.YahmaPayments.getCurrentActorName === 'function' && window.YahmaPayments.getCurrentActorName());
    if (curName) {
      if (window.currentUser?.id) userMap.set(String(window.currentUser.id).trim(), curName);
      if (window.currentUser?.email) userMap.set(String(window.currentUser.email).trim().toLowerCase(), curName);
    }
  } catch (_) {}

  const resolveName = (r) => {
    if(r.user_name && String(r.user_name).trim()) return String(r.user_name).trim();
    if(r.user_id && userMap.has(String(r.user_id).trim())) return userMap.get(String(r.user_id).trim());
    const em = String(r.user_email || '').trim().toLowerCase();
    if(em && userMap.has(em)) return userMap.get(em);
    const u = String(r.user || '').trim();
    if(u){
      if(userMap.has(u.toLowerCase())) return userMap.get(u.toLowerCase());
      if(!u.includes('@')) return u;
    }
    if(em && em.includes('@')){
      const prefix = em.split('@')[0].replace(/[\._\-]+/g, ' ').trim();
      return prefix || em;
    }
    return u || 'مستخدم';
  };

  rows.forEach(r => {
    r.display_user = resolveName(r);
  });

  const userCounts=new Map();
  rows.forEach(r=>{
    const u=String(r.display_user||'—').trim();
    userCounts.set(u,(userCounts.get(u)||0)+1);
  });
  const sortedUsers=[...userCounts.keys()].sort((a,b)=>a.localeCompare(b,'ar'));
  const userOptions=sortedUsers.map(u=>`<option value="${escapeHtml(u.toLowerCase())}">${escapeHtml(u)} (${userCounts.get(u)})</option>`).join('');

  const old=document.getElementById('audit-report-overlay');if(old)old.remove();
  const ov=document.createElement('div');ov.id='audit-report-overlay';ov.className='overlay';ov.style.display='flex';
  const esc=v=>escapeHtml(v||'—');

  ov.innerHTML=`<div class="modal audit-report-modal">
    <div class="audit-report-head">
      <div>
        <h2>سجل نشاط المستخدمين</h2>
        <p id="audit-modal-subtitle">آخر ${rows.length} حركة مسجلة بالتاريخ والوقت.</p>
      </div>
      <div class="modal-actions-right">
        <button type="button" class="btn btn-ghost btn-small" id="audit-export">تصدير CSV</button>
        <button type="button" class="btn btn-ghost btn-small" id="audit-close">إغلاق</button>
      </div>
    </div>
    <div class="filter-panel" style="margin-bottom:12px;padding:10px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px">
          <b>المستخدم:</b>
          <select id="audit-modal-sel-user" style="padding:5px 8px;border-radius:6px;border:1px solid var(--line);font-size:12px;background:var(--paper,#fff);color:var(--text)">
            <option value="">كل المستخدمين (${sortedUsers.length})</option>
            ${userOptions}
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;flex:1">
          <b>بحث:</b>
          <input id="audit-modal-ipt-search" placeholder="بحث بالحركة أو التفاصيل أو اللوحة..." style="padding:5px 8px;border-radius:6px;border:1px solid var(--line);font-size:12px;width:100%">
        </label>
        <button type="button" class="btn btn-ghost btn-small" id="audit-modal-clear">مسح</button>
      </div>
    </div>
    <div class="audit-report-table">
      <table>
        <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>الدور</th><th>الحركة</th><th>التفاصيل</th></tr></thead>
        <tbody id="audit-modal-tbody"></tbody>
      </table>
    </div>
  </div>`;
  document.body.appendChild(ov);

  const getFilteredModalRows = () => {
    const uSel = (ov.querySelector('#audit-modal-sel-user')?.value || '').trim().toLowerCase();
    const q = (ov.querySelector('#audit-modal-ipt-search')?.value || '').trim().toLowerCase();
    return rows.filter(r => {
      const u = String(r.display_user || '').trim().toLowerCase();
      if (uSel && u !== uSel) return false;
      if (q) {
        const hay = [u, r.user_email, r.action, r.detail, r.role].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  const drawModal = () => {
    const filtered = getFilteredModalRows();
    const shown = filtered.slice(0, 300);
    const sub = ov.querySelector('#audit-modal-subtitle');
    if (sub) {
      sub.textContent = `عرض ${shown.length} من أصل ${filtered.length} حركة مطابقة (إجمالي السجل: ${rows.length}).`;
    }
    const tbody = ov.querySelector('#audit-modal-tbody');
    if (tbody) {
      tbody.innerHTML = shown.length ? shown.map(r => `<tr>
        <td dir="ltr">${esc(formatAuditDateTime(r.created_at || r.at))}</td>
        <td><b>${esc(r.display_user)}</b></td>
        <td>${esc(r.role)}</td>
        <td>${esc(r.action)}</td>
        <td>${esc(r.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">لا توجد حركات مطابقة للفلاتر.</td></tr>';
    }
    window._yahmaCurrentPdfData = () => ({
      title: 'سجل نشاط المستخدمين',
      subtitle: `عدد الحركات: ${filtered.length}`,
      headers: ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'],
      rows: filtered.map(r => [formatAuditDateTime(r.created_at || r.at), r.display_user || '—', r.role || '—', r.action || '—', r.detail || '—'])
    });
  };

  ov.querySelector('#audit-modal-sel-user')?.addEventListener('change', drawModal);
  ov.querySelector('#audit-modal-ipt-search')?.addEventListener('input', drawModal);
  ov.querySelector('#audit-modal-clear')?.addEventListener('click', () => {
    const u = ov.querySelector('#audit-modal-sel-user'); if (u) u.value = '';
    const s = ov.querySelector('#audit-modal-ipt-search'); if (s) s.value = '';
    drawModal();
  });

  drawModal();

  const close = () => ov.remove();
  ov.querySelector('#audit-close').onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.querySelector('#audit-export').onclick = () => {
    const filtered = getFilteredModalRows();
    const lines = [['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'], ...filtered.map(r => [formatAuditDateTime(r.created_at || r.at), r.user_email || r.user, r.role, r.action, r.detail])];
    const csv = '\uFEFF' + lines.map(x => x.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'yahma-audit-' + (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10)) + '.csv';
    a.click();
  };
 };

 function ensureRoleBadge(){
  if(document.getElementById('role-badge')) return;
  const actions=document.querySelector('.topbar-actions');
  if(!actions) return;
  const roleBadge=document.createElement('span');
  roleBadge.id='role-badge';
  roleBadge.className='role-badge';
  roleBadge.title='دورك الحالي (يحدده المدير عبر Supabase)';
  const logout=document.createElement('button');
  logout.className='btn btn-ghost';
  logout.id='btn-logout';
  logout.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><span class="btn-label">خروج</span>';
  logout.onclick=async ()=>{
    log('تسجيل خروج', (window.currentUser&&window.currentUser.email)||'');
    await window.yahmaSignOut();
  };
  // insert after mobile menu / notify
  const firstBtn=actions.querySelector('#btn-refresh') || actions.firstChild;
  actions.insertBefore(logout, firstBtn);
  actions.insertBefore(roleBadge, logout);
 }

 function initMoreMenu(){
  if(window._topDdBound) return;
  window._topDdBound = true;

  let pop = document.getElementById('modern-popover');
  if(!pop){
    pop = document.createElement('div');
    pop.id = 'modern-popover';
    pop.className = 'modern-popover';
    pop.hidden = true;
    pop.innerHTML = '<div class="mp-card" role="menu"><div class="mp-head"><span class="mp-title"></span><button type="button" class="mp-close" aria-label="إغلاق">×</button></div><div class="mp-body"></div></div>';
    document.body.appendChild(pop);
  }
  const card = pop.querySelector('.mp-card');
  const titleEl = pop.querySelector('.mp-title');
  const bodyEl = pop.querySelector('.mp-body');
  const closeBtn = pop.querySelector('.mp-close');
  let leaveTimer = null;

  function closePop(){
    if(pop.hidden || pop.classList.contains('is-leaving')) return;
    pop.classList.add('is-leaving');
    pop.classList.remove('open');
    document.querySelectorAll('.top-dd.open').forEach(x => x.classList.remove('open'));
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      pop.hidden = true;
      pop.classList.remove('is-leaving');
      bodyEl.innerHTML = '';
    }, 160);
  }

  function openPop(dd, btn){
    const menu = dd.querySelector('.top-dd-menu') || dd._menuEl;
    if(!menu) return;

    clearTimeout(leaveTimer);
    pop.classList.remove('is-leaving');

    const tNode = menu.querySelector('.top-dd-title');
    const btnLabel = (btn.textContent || '').replace(/\s+/g,' ').trim().replace('▾','').trim();
    titleEl.textContent = tNode ? tNode.textContent.trim() : btnLabel;

    bodyEl.innerHTML = '';
    let idx = 0;
    menu.querySelectorAll('.more-item, .more-divider').forEach(node => {
      if(node.classList.contains('more-divider')){
        const hr = document.createElement('div');
        hr.className = 'mp-divider';
        hr.style.setProperty('--i', String(idx));
        bodyEl.appendChild(hr);
        idx++;
        return;
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mp-item' + (node.classList.contains('danger') ? ' danger' : '');
      item.style.setProperty('--i', String(idx));
      item.innerHTML = '<span class="mp-item-label"></span><span class="mp-item-go">‹</span>';
      item.querySelector('.mp-item-label').textContent = (node.textContent || '').replace(/\s+/g,' ').trim();
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closePop();
        setTimeout(() => node.click(), 20);
      });
      bodyEl.appendChild(item);
      idx++;
    });

    document.querySelectorAll('.top-dd.open').forEach(x => x.classList.remove('open'));
    dd.classList.add('open');

    // Position before show (no layout thrash during animation)
    pop.hidden = false;
    // force reflow then open for enter transition
    void pop.offsetWidth;

    const r = btn.getBoundingClientRect();
    const gap = 10;
    const cw = Math.max(270, Math.min(320, card.offsetWidth || 280));
    // temporary show to measure height without visible flash: card already opacity 0
    const ch = card.offsetHeight || 200;

    let left = Math.round(r.left + r.width / 2 - cw / 2);
    if(left < 10) left = 10;
    if(left + cw > window.innerWidth - 10) left = Math.max(10, window.innerWidth - cw - 10);

    let top = Math.round(r.bottom + gap);
    let placeAbove = false;
    if(top + ch > window.innerHeight - 12){
      top = Math.max(10, Math.round(r.top - ch - gap));
      placeAbove = true;
    }

    card.style.width = cw + 'px';
    card.style.top = top + 'px';
    card.style.left = left + 'px';
    card.dataset.place = placeAbove ? 'above' : 'below';
    const arrowX = Math.round(r.left + r.width / 2 - left);
    card.style.setProperty('--arrow-x', Math.max(20, Math.min(cw - 20, arrowX)) + 'px');

    requestAnimationFrame(() => {
      pop.classList.add('open');
    });
  }

  // تم تعطيل اعتراض قوائم الشريط العلوي — تستخدم القوائم الأصلية لتجنب التعليق
  document.querySelectorAll('.top-dd').forEach(dd => {
    if(dd.closest && dd.closest('.topbar-actions')) return; // لا تلمس قوائم التوب بار
    const btn = dd.querySelector(':scope > button') || dd.querySelector('button');
    if(!btn || btn._ddBound) return;
    btn._ddBound = true;
    const native = dd.querySelector('.top-dd-menu');
    if(native){
      native.hidden = true;
      native.style.display = 'none';
      dd._menuEl = native;
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const was = dd.classList.contains('open');
      if(was){ closePop(); return; }
      closePop();
      setTimeout(() => openPop(dd, btn), pop.classList.contains('is-leaving') ? 100 : 0);
    });
  });

  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePop(); });
  pop.addEventListener('click', (e) => { if(e.target === pop) closePop(); });

  if(!window._topDdDocBound){
    window._topDdDocBound = true;
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closePop(); });
    document.addEventListener('click', (e) => {
      if(e.target.closest && (e.target.closest('.top-dd') || e.target.closest('.modern-popover'))) return;
      closePop();
    });
    window.addEventListener('resize', closePop);
    window.addEventListener('scroll', closePop, true);
  }
}

function initTheme(){
  const btn=document.getElementById('btn-theme');
  const label=document.getElementById('theme-label');
  const icon=document.getElementById('theme-icon');
  const apply=()=>{
    const dark=localStorage.getItem('fleet-theme')==='dark';
    document.body.classList.toggle('dark-mode',dark);
    if(label) label.textContent=dark?'الوضع النهاري':'الوضع الليلي';
    if(icon) icon.textContent=dark?'☀':'◐';
  };
  if(btn&&!btn._bound){
    btn._bound=true;
    btn.onclick=()=>{
      const next=document.body.classList.contains('dark-mode')?'light':'dark';
      localStorage.setItem('fleet-theme', next);
      apply();
    };
  }
  apply();
 }
 function initMobileMenu(){
  const btn=document.getElementById('btn-mobile-menu');
  if(!btn || btn._bound) return;
  btn._bound=true;
  let backdrop=document.querySelector('.sidebar-backdrop');
  if(!backdrop){
    backdrop=document.createElement('div');
    backdrop.className='sidebar-backdrop';
    document.body.appendChild(backdrop);
  }
  const sidebar=document.querySelector('.sidebar');
  const close=()=>{
    if(!sidebar) return;
    sidebar.classList.remove('open');
    sidebar.style.zIndex='';
    backdrop.classList.remove('show');
  };
  const open=()=>{
    if(!sidebar) return;
    /* z-index مضمون من JS كمان: القائمة فوق الـ backdrop دائمًا
       (وإلا أي ضغطة على تبويب تقع على الـ backdrop فتبفل القائمة) */
    sidebar.classList.add('open');
    sidebar.style.zIndex='70';
    backdrop.classList.add('show');
  };
  btn.addEventListener('click', ()=> sidebar?.classList.contains('open') ? close() : open());
  backdrop.addEventListener('click', close);
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{ if(window.innerWidth<=700) close(); });
  });
 }

 function initBackupRestore(){
  const backupBtn=document.getElementById('btn-backup');
  const restoreBtn=document.getElementById('btn-restore');
  const input=document.getElementById('backup-file');
  if(backupBtn && !backupBtn._bound){
    backupBtn._bound=true;
    backupBtn.onclick=()=>{
      const data={version:1,exportedAt:new Date().toISOString(),fleet:fleet||[],audit:JSON.parse(localStorage.getItem(AUDIT)||'[]')};
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      a.download='fleet-backup-'+todayStr()+'.json';
      a.click();
      log('نسخة احتياطية','تصدير البيانات');
      document.getElementById('more-menu')?.classList.remove('open');
    };
  }
  const emailBackup=document.getElementById('btn-email-backup');
  if(emailBackup&&!emailBackup._bound){
    emailBackup._bound=true;
    emailBackup.onclick=async()=>{
      const data={version:2,exportedAt:new Date().toISOString(),fleet:fleet||[],audit:JSON.parse(localStorage.getItem(AUDIT)||'[]')};
      await shareFileByEmail('fleet-backup-'+todayStr()+'.json',JSON.stringify(data,null,2),'application/json','نسخة احتياطية للأسطول — '+todayStr(),'مرفق نسخة احتياطية من بيانات الأسطول وسجل النشاط.');
      document.getElementById('more-menu')?.classList.remove('open');
    };
  }
  if(restoreBtn && input && !restoreBtn._bound){
    restoreBtn._bound=true;
    restoreBtn.onclick=()=>{ input.click(); document.getElementById('more-menu')?.classList.remove('open'); };
    input.onchange=()=>{
      const f=input.files[0]; if(!f) return;
      const rd=new FileReader();
      rd.onload=async ()=>{
        try{
          const d=JSON.parse(rd.result);
          if(!Array.isArray(d.fleet)) throw Error();
          if(!confirm('استعادة النسخة ستستبدل بيانات الأسطول الحالية. متابعة؟')) return;
          fleet=d.fleet; await saveData(); log('استعادة','استعادة نسخة JSON'); render(); alert('تمت الاستعادة بنجاح');
        }catch(e){ alert('ملف النسخة غير صالح'); }
      };
      rd.readAsText(f);
      input.value='';
    };
  }
 }

 function applyRole(){
  const role=window.currentRole||'view';
  let visibleTabs=0;
  document.querySelectorAll('.nav-item[data-tab]').forEach(item=>{
    item.style.display=window.canAccessYahmaTab(item.dataset.tab)?'':'none';
     if(window.canAccessYahmaTab(item.dataset.tab)) visibleTabs++;
   });
   /* كل الأقسام مخفية = المستخدم محبوس بلا سبب؛ نوضّح بدل الصمت */
   const sidebar=document.querySelector('.sidebar');
   if(sidebar){
     let hint=sidebar.querySelector('.yahma-no-tabs-hint');
     if(visibleTabs<=1){
       if(!hint){ hint=document.createElement('div'); hint.className='yahma-no-tabs-hint'; sidebar.appendChild(hint); }
       hint.innerHTML='<b>لا توجد أقسام متاحة لحسابك</b><span>صلاحيات حسابك فارغة. كلّم المدير لتفعيل الأقسام.</span>';
     }else if(hint){ hint.remove(); }
   }
  const accountSettings=document.getElementById('btn-account-settings');
  if(accountSettings) accountSettings.style.display='none';
  const badge=document.getElementById('role-badge');
  if(badge){ badge.textContent = ({admin:'مدير',ops:'تشغيل',view:'مشاهدة فقط'})[role] || role; badge.className='role-badge '+role; }
  document.querySelectorAll('#btn-clear-all,#btn-delete').forEach(x=>{
    if(role==='admin'){ x.style.display=''; x.style.visibility='visible'; }
    else { x.style.display='none'; }
  });
  document.querySelectorAll('#btn-restore').forEach(x=>{
    x.style.display=(role==='admin'||role==='ops')?'':'none';
  });
  const importBtn=document.getElementById('btn-import');
  if(importBtn){
    importBtn.style.display='';
    importBtn.disabled=(role!=='admin'&&role!=='ops');
    importBtn.title=(role==='admin'||role==='ops')?'رفع ملف Excel وإضافة أو تحديث سيارات الأسطول':'رفع ملف Excel — تحتاج صلاحية مدير أو تشغيل';
  }
  /* «تحديث الفرع» و«رفع السيارات المباعة» اتشالوا من الواجهة:
   الرفع الرئيسي «رفع / تحديث سيارات الأسطول» بيحدّث الفرع وحالة السيارة
   (excel-import.js) وبيحذف المباع تلقائيًا لما حالة السيارة تكون «مباع».
   سيبنا السطرين دول للتذكير لو حبيت ترجّعهم يوم. */
  const branchImpBtn=document.getElementById('btn-branch-status-import');
  if(branchImpBtn){ branchImpBtn.style.display='none'; }
  const soldBtn=document.getElementById('btn-sold-import');
  if(soldBtn){ soldBtn.style.display='none'; }
  if(role==='view') document.querySelectorAll('#btn-add-car,#btn-save').forEach(x=>x.disabled=true);
  else document.querySelectorAll('#btn-add-car,#btn-save').forEach(x=>x.disabled=false);
 }

 function initUI(){
  ensureRoleBadge();
  initMoreMenu();
  initTheme();
  initMobileMenu();
  initBackupRestore();
  applyRole();
 }

 const oldRender=window.render || (typeof render==='function' ? render : null);
 if(oldRender) window.render=function(){ oldRender(); setTimeout(initUI,0); };
 const oldSave=window.saveData || (typeof saveData==='function' ? saveData : null);
 if(oldSave) window.saveData=async function(){ log('حفظ','تحديث بيانات الأسطول'); return oldSave.apply(this,arguments); };
 document.addEventListener('DOMContentLoaded', initUI);
 setTimeout(initUI, 300);
})();


