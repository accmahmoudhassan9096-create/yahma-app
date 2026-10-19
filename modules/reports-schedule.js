/*
 * modules/reports-schedule.js — الجدولة والتصدير
 *
 * قوالب واتساب، الإرسال المجدول بالبريد، وتصدير Excel و PDF.
 * نفس الفكرة: ctx فيه الأسماء اللي كانت في نطاق renderReports.
 */
(function (global) {
  'use strict';

  /* ===== الجدولة — واتساب والبريد ===== */
  function bindScheduleUI(ctx) {
  const { SND_SKEY, accountingIndicators, branches, esc, expBuckets, list, maint, notReady, out, periodLabel, prepOpen, prepOverdue, ready, readyPct, rf, total } = ctx;
  const summaryText = () => (document.getElementById('rd-summary-text')?.textContent || '').trim();

  /* ===== v9: قوالب واتساب — نص عربي جاهز ببدائل محمية من encodeURIComponent ===== */
  const WA_TEMPLATES = {
    daily: d => `📊 *يهماء لتأجير السيارات* — تقرير يومي
🗓 ${d.date} · ${d.periodLabel}
────────────────
🚗 الأسطول ضمن الفلتر: ${d.total}
✅ جاهزة: ${d.ready} (${d.readyPct}%)
⚠️ غير جاهزة: ${d.notReady}
🔧 صيانة: ${d.maint} · 🚫 خارج الخدمة: ${d.out}
⏰ مهام متأخرة: ${d.prepOverdue} من إجمالي ${d.prepOpen} مفتوحة
📄 مستندات منتهية: ${d.overdue} · تنتهي خلال 7 أيام: ${d.d7}
${d.accLine}
🏢 الفروع:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    monthly: d => `📈 *يهماء لتأجير السيارات* — ملخص شهري
🗓 ${d.date} · ${d.periodLabel}
────────────────
🚗 إجمالي السيارات: ${d.total}
✅ نسبة الجاهزية: ${d.readyPct}% (${d.ready}/${d.total})
🔧 صيانة: ${d.maint} · 🚫 خارج الخدمة: ${d.out}
💰 إيراد شهري متوقع: ${d.monthPotential}
🧾 تكاليف صيانة مسجلة: ${d.maintCost}
💵 صافي تقديري: ${d.netEst}
🚗 متوسط الإيراد لكل سيارة: ${d.revPerCar}
⏰ مهام متأخرة: ${d.prepOverdue}
🏢 الفروع:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    docs: d => `📄 *يهماء لتأجير السيارات* — تنبيه المستندات
🗓 ${d.date} · ${d.periodLabel}
────────────────
🔴 مستندات منتهية: ${d.overdue}
🟡 تنتهي خلال 7 أيام: ${d.d7}
🔵 تنتهي خلال 30 يوم: ${d.d30}
⚪ تنتهي خلال 90 يوم: ${d.d90}
🏢 أدنى جاهزية:
${d.branches}
———
📡 المصدر: منصة يهماء`,
    branch: d => `🏢 *يهماء لتأجير السيارات* — تقرير فرع
🗓 ${d.date} · ${d.periodLabel}
🏢 الفرع: ${d.branchName}
────────────────
🚗 إجمالي سيارات الفرع: ${d.branch.t}
✅ جاهزة: ${d.branch.r} (${d.branch.pct}%)
⏰ مهام متأخرة: ${d.branch.ov}
📄 مستندات منتهية: ${d.overdue} · خلال 7 أيام: ${d.d7}
${d.accLine}
———
📡 المصدر: منصة يهماء`
  };
  const buildWaData = () => {
    const acc2 = accountingIndicators(list);
    return {
      date: new Date().toLocaleDateString('ar-SA-u-ca-gregory'),
      periodLabel: periodLabel(),
      total, ready, readyPct, notReady, maint, out, prepOpen, prepOverdue,
      overdue: expBuckets.overdue, d7: expBuckets.d7, d30: expBuckets.d30, d90: expBuckets.d90,
      monthPotential: fmtSAR(acc2.monthPotential),
      maintCost: fmtSAR(acc2.maintCost),
      netEst: fmtSAR(acc2.netEst),
      revPerCar: fmtSAR(acc2.revPerCar),
      accLine: acc2.hasData ? `💰 إيراد متوقع: ${fmtSAR(acc2.estMonthRev||acc2.monthPotential)} · صافي تقديري: ${fmtSAR(acc2.netEst)}` : '💰 أضف سعر التأجير اليومي لكل سيارة لعرض المؤشرات المالية',
      branches: branches.slice(0,5).map(b=>`• ${b.name}: ${b.pct}% جاهز (${b.r}/${b.t})`).join('\n'),
      branchName: (rf.branch && rf.branch!=='all') ? rf.branch : 'كل الفروع',
      branch: (()=>{ const n=(rf.branch && rf.branch!=='all')?rf.branch:null; const fb = n ? branches.find(b=>b.name===n) : branches[0]; return fb||{t:total,r:ready,pct:readyPct,ov:prepOverdue}; })()
    };
  };
  const waSelect = document.getElementById('rd-wa-tpl');
  const buildWaMsg = () => {
    const tpl = (waSelect && waSelect.value) || 'daily';
    const d = buildWaData();
    const msg = (WA_TEMPLATES[tpl] || WA_TEMPLATES.daily)(d);
    return (!msg || !msg.trim()) ? '' : msg;
  };
  const sendAllRecipientsByEmail = () => {
    const recipients = loadRecipients().filter(r=>String(r.email||'').trim());
    if(!recipients.length){ alert('أضف بريدًا إلكترونيًا لمستخدم واحد على الأقل أولًا.'); return; }
    const subject = 'تقرير يهماء — '+periodLabel();
    const body = buildWaMsg() || summaryText();
    const bcc = recipients.map(r=>String(r.email).trim()).join(',');
    location.href='mailto:?bcc='+encodeURIComponent(bcc)+'&subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    recipients.forEach(r=>markSent(r.name,'daily','mail'));
    sndRenderAll();
  };
  const sendAllMailBtn = document.getElementById('snd-mail-all');
  if(sendAllMailBtn) sendAllMailBtn.onclick = sendAllRecipientsByEmail;
  document.getElementById('rd-wa').onclick = () => {
    const msg = buildWaMsg();
    if(!msg){ alert('لا يوجد محتوى للمشاركة ضمن الفلتر الحالي.'); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  };
  const waCopyBtn = document.getElementById('rd-wa-copy');
  if(waCopyBtn) waCopyBtn.onclick = async () => {
    const msg = buildWaMsg();
    if(!msg){ alert('لا يوجد محتوى للنسخ ضمن الفلتر الحالي.'); return; }
    try{ await navigator.clipboard.writeText(msg); waCopyBtn.textContent='✓ تم النسخ'; setTimeout(()=>{waCopyBtn.textContent='📋 نسخ';},1500); }
    catch(e){ alert('تعذر النسخ التلقائي — انسخ النص يدويًا من الملخص التنفيذي بالأسفل.'); }
  };
  document.getElementById('rd-mail').onclick = () => {
    const msg = buildWaMsg() || summaryText();
    location.href = 'mailto:?subject=' + encodeURIComponent('تقرير يهماء — ' + periodLabel()) + '&body=' + encodeURIComponent(msg);
  };
  const broadcastBtn=document.getElementById('rd-broadcast');
  if(broadcastBtn) broadcastBtn.onclick=()=>{
    if(window.currentRole!=='admin'){alert('إرسال التعميم متاح للمدير فقط.');return;}
    document.getElementById('yahma-broadcast-modal')?.remove();
    const overlay=document.createElement('div');
    overlay.id='yahma-broadcast-modal';
    overlay.className='overlay';
    overlay.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="broadcast-title" style="width:min(620px,94vw)"><div class="modal-head"><h2 id="broadcast-title">إرسال تعميم أو تقرير</h2><button type="button" class="btn btn-ghost btn-small" id="broadcast-close">إغلاق</button></div><p class="muted-small">يرسل إلى بريد حسابات المنصة. المستخدمون الجدد سيظهرون تلقائيًا.</p><label class="fld">المستلمون<select id="broadcast-audience"><option value="all">كل المستخدمين</option><option value="admin">المديرون</option><option value="manager">الإداريون</option><option value="ops">فريق التشغيل</option><option value="view">مشاهدة فقط</option></select></label><label class="fld">عنوان الرسالة<input id="broadcast-subject" maxlength="180" value="تعميم يهماء — ${esc(periodLabel())}"></label><label class="fld">نص الرسالة<textarea id="broadcast-body" rows="10" maxlength="20000" placeholder="اكتب التعميم هنا"></textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn btn-ghost btn-small" id="broadcast-insert-report">إدراج ملخص التقرير الحالي</button><button type="button" class="btn btn-primary btn-small" id="broadcast-send">إرسال</button></div><div id="broadcast-status" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelector('#broadcast-close').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('#broadcast-insert-report').onclick=()=>{
      const body=overlay.querySelector('#broadcast-body');
      body.value=[body.value.trim(),buildWaMsg()||summaryText()].filter(Boolean).join('\n\n');
    };
    overlay.querySelector('#broadcast-send').onclick=async()=>{
      const subject=overlay.querySelector('#broadcast-subject').value.trim();
      const message=overlay.querySelector('#broadcast-body').value.trim();
      const status=overlay.querySelector('#broadcast-status');
      const send=overlay.querySelector('#broadcast-send');
      if(!subject||!message){status.textContent='اكتب عنوان الرسالة ونصها أولًا.';return;}
      if(!window.supabaseReady||!window.supabaseClient){status.textContent='الإرسال يحتاج اتصال المنصة السحابي.';return;}
      send.disabled=true;status.textContent='جارٍ إرسال الرسالة...';
      try{
        const {data,error}=await window.supabaseClient.functions.invoke('send-user-email',{body:{subject,message,audience:overlay.querySelector('#broadcast-audience').value}});
        if(error) throw error;
        if(data?.error) throw new Error(data.error);
        if(!data?.sent) throw new Error('لم يُرسل البريد لأي مستخدم');
        status.textContent=`تم قبول الإرسال إلى ${data.sent} مستخدم${data.failed?`، وتعذر ${data.failed}${data.error?' ('+data.error+')':''}`:''}.`;
        try{log('تعميم بالبريد',subject+' — '+data.sent+' مستلم');}catch(_){yahmaErr(_,'reports.js:1049');}
      }catch(err){status.textContent='تعذر الإرسال: '+(err.message||'تحقق من إعداد خدمة البريد');}
      finally{send.disabled=false;}
    };
    overlay.querySelector('#broadcast-subject').focus();
  };

  /* ===== v10: واجهة الإرسال المجدول ===== */
  const SND_KIND_LABEL = {daily:'تقرير يومي', weekly:'تنبيه مستندات أسبوعي', report:'تقرير رسمي PDF'};
  let sndEditing = null;
  const sndMsgFor = (r, kind) => {
    const d = buildWaData();
    if(kind==='weekly') return WA_TEMPLATES.docs(d);
    if(r.role==='branch' && r.branch){ d.branchName=r.branch; d.branch=branches.find(x=>x.name===r.branch)||d.branch; return WA_TEMPLATES.branch(d); }
    return WA_TEMPLATES.daily(d);
  };
  const sndRenderAll = () => {
    if(window.currentRole==='admin' && window.supabaseReady && !window.__sndScheduleLoaded){
      window.__sndScheduleLoaded=true;
      window.supabaseClient.from('email_schedule').select('enabled,daily_time,weekly_day,weekly_time,last_daily_date,last_weekly_date').eq('id',1).maybeSingle().then(({data,error})=>{
        if(data){
          try{localStorage.setItem(SND_SKEY,JSON.stringify({enabled:!!data.enabled,dailyTime:String(data.daily_time||'07:00').slice(0,5),weeklyDay:Number(data.weekly_day)||0,weeklyTime:String(data.weekly_time||'08:00').slice(0,5),lastDaily:data.last_daily_date||null,lastWeekly:data.last_weekly_date||null}));}catch(_){yahmaErr(_,'reports.js:1070');}
          sndRenderAll();
        }else if(!error){
          try{localStorage.setItem(SND_SKEY,JSON.stringify({enabled:false,dailyTime:'07:00',weeklyDay:0,weeklyTime:'08:00'}));}catch(_){yahmaErr(_,'reports.js:1073');}
          sndRenderAll();
        }else if(error){
          const status=document.getElementById('snd-schedule-status');
          if(status) status.textContent='شغّل تحديث مخطط قاعدة البيانات أولًا لتفعيل الجدولة السحابية.';
        }
      }).catch(()=>{});
    }
    const rec=loadRecipients(), lg=loadSendLog(), sc=sndSchedule(), due=sndDueKinds();
    const ban=document.getElementById('snd-banner');
    if(ban){
      if(due.length){
        const btns=due.map(k=>`<button type="button" class="btn btn-primary btn-small" onclick="window.sndPrep('${k}')">${k==='daily'?'📨 جهّز التقرير اليومي':'📄 جهّز تنبيه المستندات'}</button>`).join(' ');
        ban.innerHTML=`<b>⏰ موعد الإرسال المجدول حان — ${rec.filter(r=>r.daily||r.docs).length} مستلم في القائمة</b><div class="snd-banner-acts">${btns}${due.includes('weekly')?'<button type="button" class="btn btn-ghost btn-small" onclick="window.sndPdfDocs()">🖼 PDF المستندات</button>':''}</div>`;
        ban.style.display='flex';
      } else { ban.style.display='none'; ban.innerHTML=''; }
    }
    /* كارت تقرير الفحص الأسبوعي لكل فرع (للمدير فقط) */
    const bmCard = document.getElementById('branch-mail-card');
    if (bmCard) {
      if (window.currentRole === 'admin' && window.YahmaBranchEmail && typeof window.YahmaBranchEmail.mount === 'function') {
        bmCard.style.display = '';
        window.YahmaBranchEmail.mount(bmCard).catch(() => { bmCard.style.display = 'none'; });
      } else bmCard.style.display = 'none';
    }
    const goBm=document.getElementById('rd-go-branch-mail');
    if(goBm) goBm.onclick=()=>{ const c=document.getElementById('branch-mail-card'); if(c){ c.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>c.querySelector('#branch-mail-preflight')?.focus(),400); } };
    const rowsEl=document.getElementById('snd-rows');
    if(rowsEl){
      rowsEl.innerHTML = rec.length ? rec.map(r=>`
        <div class="snd-row">
          <div class="snd-who">
            <b>${esc(r.name)}${r.role==='admin'?' — مدير (كل الفروع)':' — مشرف '+esc(r.branch||'فرع')}</b>
            <span dir="ltr">${esc(r.phone||'—')}${r.email?' · '+esc(r.email):''}</span>
            <div class="snd-chips">${r.daily?`<span class="snd-chip2">يومي ${sc.dailyTime}</span>`:''}${r.docs?'<span class="snd-chip2 amber">مستندات أسبوعي</span>':''}</div>
          </div>
          <div class="snd-mini-acts">
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','daily','wa')">💬 واتساب</button>
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','daily','mail')">✉ إيميل</button>
            ${r.docs?`<button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','weekly','wa')">📄 مستندات</button>`:''}
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndEdit('${r.id}')">✏</button>
            <button type="button" class="btn btn-ghost btn-small" onclick="window.sndDel('${r.id}')">🗑</button>
          </div>
        </div>`).join('') : '<div class="snd-empty">لا مستلمين بعد — أضف المدير ومشرفي الفروع من النموذج أعلاه. المدير يستلم ملخص كل الفروع، ومشرف الفرع يستلم تقرير فرعه فقط.</div>';
    }
    const logEl=document.getElementById('snd-log-rows');
    if(logEl){
      logEl.innerHTML = lg.length ? lg.slice(0,20).map(e=>`<div class="snd-log-row"><span>${esc(e.name)} — ${SND_KIND_LABEL[e.kind]||e.kind} · ${e.channel==='mail'?'إيميل':'واتساب'}</span><time>${new Date(e.at).toLocaleString('ar-SA-u-ca-gregory')}</time></div>`).join('') : '<div class="snd-empty">لا إرساليات مسجلة بعد — كل رسالة تُرسل ستُوثّق هنا تلقائيًا.</div>';
    }
    const batchEl=document.getElementById('snd-batch');
    if(batchEl && !batchEl.dataset.keep) batchEl.innerHTML='';
    const en=document.getElementById('snd-en'); if(en) en.checked=!!sc.enabled;
    const dt=document.getElementById('snd-daily-time'); if(dt) dt.value=sc.dailyTime;
    const wt=document.getElementById('snd-weekly-time'); if(wt) wt.value=sc.weeklyTime;
    const wd=document.getElementById('snd-weekly-day'); if(wd) wd.value=String(sc.weeklyDay);
    const status=document.getElementById('snd-schedule-status');
    if(status && sc.enabled){
      const fmtD=d=>{ try{ return d?new Date(d+'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory'):'—'; }catch(_){ return d||'—'; } };
      status.textContent='الجدولة السحابية مفعّلة: تقرير يومي '+sc.dailyTime+'، وتنبيه مستندات أسبوعي يوم '+['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][sc.weeklyDay]+' '+sc.weeklyTime+' بتوقيت الرياض.'
        +' آخر إرسال تلقائي — يومي: '+fmtD(sc.lastDaily)+' · أسبوعي: '+fmtD(sc.lastWeekly)+'.';
    }
  };
  window.sndPrep = (kind) => {
    const rec=loadRecipients().filter(r=> kind==='daily' ? r.daily : r.docs);
    const box=document.getElementById('snd-batch'); if(!box) return;
    box.dataset.keep='1';
    box.innerHTML = rec.length ? `<div class="rd-card-h"><h3>رسائل جاهزة — ${SND_KIND_LABEL[kind]}</h3><span class="rd-chip">${rec.length} مستلم</span></div>` + rec.map(r=>`
      <div class="snd-row" style="flex-direction:column;align-items:stretch;margin-top:8px">
        <div class="snd-who"><b>${esc(r.name)}</b><span>${r.role==='admin'?'ملخص كل الفروع':'تقرير فرع: '+esc(r.branch||'—')}</span></div>
        <div class="snd-mini-acts" style="margin-top:6px">
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','${kind}','wa')">💬 واتساب</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndChannel('${r.id}','${kind}','mail')">✉ إيميل</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="window.sndCopy('${r.id}','${kind}')">📋 نسخ</button>
        </div>
      </div>`).join('') : '<div class="snd-empty">لا مستلمين مطابقين لهذا النوع — راجع قائمة المستلمين.</div>';
    box.scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.sndChannel = (id,kind,ch) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    const msg=sndMsgFor(r,kind);
    if(ch==='wa'){ const dg=String(r.phone||'').replace(/[^0-9]/g,''); window.open((dg?'https://wa.me/'+dg:'https://wa.me')+'?text='+encodeURIComponent(msg),'_blank'); }
    else { location.href='mailto:'+(r.email||'')+'?subject='+encodeURIComponent('تقرير يهماء — '+SND_KIND_LABEL[kind])+'&body='+encodeURIComponent(msg); }
    markSent(r.name,kind,ch);
    sndRenderAll();
  };
  window.sndCopy = async (id,kind) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    try{ await navigator.clipboard.writeText(sndMsgFor(r,kind)); alert('تم نسخ رسالة '+r.name); }catch(e){ alert('تعذر النسخ التلقائي.'); }
  };
  window.sndDel = (id) => {
    if(!confirm('حذف هذا المستلم؟')) return;
    saveRecipients(loadRecipients().filter(x=>x.id!==id));
    sndRenderAll();
  };
  window.sndEdit = (id) => {
    const r=loadRecipients().find(x=>x.id===id); if(!r) return;
    sndEditing=id;
    const g=x=>document.getElementById(x);
    g('snd-name').value=r.name||''; g('snd-role').value=r.role||'admin';
    g('snd-phone').value=r.phone||''; g('snd-email').value=r.email||'';
    g('snd-branch').value=r.branch||''; g('snd-gets-daily').checked=!!r.daily; g('snd-gets-docs').checked=!!r.docs;
    g('snd-add').textContent='تحديث المستلم';
    g('snd-name').scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.sndPdfDocs = () => { const b=document.getElementById('rd-pdf'); if(b) b.click(); };
  const sndAddBtn=document.getElementById('snd-add');
  if(sndAddBtn) sndAddBtn.onclick = () => {
    const g=x=>{ const el=document.getElementById(x); return el?el.value.trim():''; };
    const name=g('snd-name');
    if(!name){ alert('أدخل اسم المستلم'); return; }
    const rec=loadRecipients();
    const obj={ id: sndEditing || ('r'+Date.now()), name, role:g('snd-role'), phone:g('snd-phone'), email:g('snd-email'), branch:g('snd-branch'), daily:document.getElementById('snd-gets-daily').checked, docs:document.getElementById('snd-gets-docs').checked };
    if(sndEditing){ const i=rec.findIndex(x=>x.id===sndEditing); if(i>=0) rec[i]=obj; sndEditing=null; sndAddBtn.textContent='＋ إضافة مستلم'; }
    else rec.push(obj);
    saveRecipients(rec);
    ['snd-name','snd-phone','snd-email','snd-branch'].forEach(x=>{const el=document.getElementById(x); if(el) el.value='';});
    try{ log('إعداد الإرسال', 'حفظ مستلم: '+name); }catch(e){yahmaErr(e,'reports.js:1189');}
    sndRenderAll();
  };
  const sndSchedBtn=document.getElementById('snd-save-sched');
  if(sndSchedBtn) sndSchedBtn.onclick = async () => {
    const s={ enabled:document.getElementById('snd-en').checked, dailyTime:document.getElementById('snd-daily-time').value||'07:00', weeklyDay:parseInt(document.getElementById('snd-weekly-day').value,10)||0, weeklyTime:document.getElementById('snd-weekly-time').value||'08:00' };
    sndSchedBtn.disabled=true;
    try{ await saveSched(s); }
    catch(e){ alert('تعذر حفظ الجدولة على الخادم: '+(e.message||'تحقق من إعداد قاعدة البيانات')); sndSchedBtn.disabled=false; return; }
    sndSchedBtn.disabled=false;
    try{ log('إعداد الإرسال', 'تحديث الجدولة — يومي '+s.dailyTime); }catch(e){yahmaErr(e,'reports.js:1199');}
    alert(s.enabled?'تم حفظ الجدولة السحابية. سيتم الإرسال تلقائيًا حتى عند إغلاق المنصة.':'تم حفظ الجدولة وهي متوقفة.');
    sndRenderAll();
  };
  sndRenderAll();
  sndInitTimer();

  const frBtn=document.getElementById('rd-formal');
  if(frBtn) frBtn.onclick = () => {
    if(!window.__lastReportAgg){ alert('افتح شاشة التقارير أولًا لتوليد المؤشرات.'); return; }
    frEnsureRoot();
    document.getElementById('fr-sheet').innerHTML = frSheetHTML();
    document.getElementById('fr-root').style.display = 'flex';
  };
  const infBtn=document.getElementById('rd-infog');
  if(infBtn) infBtn.onclick = () => {
    if(!window.__lastReportAgg){ alert('افتح شاشة التقارير أولًا لتوليد المؤشرات.'); return; }
    infEnsureRoot();
    document.getElementById('inf-sheet').innerHTML = infSheetHTML();
    document.getElementById('inf-root').style.display = 'flex';
  };
  }

  /* ===== تصدير Excel ===== */
  function bindExcelExport(ctx) {
  const { DOC_TYPES, allRentalsForCar, branchRevenue, branches, daysFrom, list, periodBounds, rf, rpFiltered } = ctx;
  /* ---- Excel export (filtered list) ---- */
  const exportReportsExcel = async () => {
    if(!(await ensureXlsxReady())){
      alert('مكتبة Excel غير محمّلة. تأكد من الاتصال بالإنترنت.');
      return;
    }
    const rows = list.map(c => {
      let readyLabel = '—';
      try{ if(typeof vehicleReadiness==='function'){ const r=vehicleReadiness(c); readyLabel=r.ready?'جاهز':(r.label||'غير جاهز'); } }catch(e){yahmaErr(e,'reports.js:1229');}
      const openTasks = (c.prepTasks||[]).filter(t=>t.status!=='done').length;
      return {
        'اللوحة': c.plate||'',
        'الماركة': c.brand||'',
        'النوع': c.type||'',
        'الموديل': c.model||'',
        'الفرع': c.branch||'',
        'المالك': c.owner||'',
        'حالة السيارة': c.carStatus||'',
        'الجاهزية': readyLabel,
        'السعر اليومي': c.dailyRate||'',
        'أقل سعر يومي': c.minDailyRate||'',
        'سعر الشهر': c.monthlyRate||'',
        'أقل سعر شهري': c.minMonthlyRate||'',
        'كم الحالي': c.odometer||'',
        'اللون': c.color||'',
        'المدينة': c.city||'',
        'الرقم التسلسلي': c.serial||'',
        'رقم الهيكل': c.chassisNo||'',
        'حالة التأمين': c.insuranceStatus||'',
        'انتهاء الرخصة': c.licenseExpiry||'',
        'أيام التأجير': rpFiltered.perCar.get(String(c.id))||0,
        'إيراد تقديري': (function(){
          const rd=rpFiltered.perCar.get(String(c.id))||0;
          if(!rd) return 0;
          const rec=allRentalsForCar(String(c.id)).sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)))[0];
          return Math.round(rd*(parseFloat(rec?rec.dailyRate:c.dailyRate)||0));
        })(),
        'انتهاء البطاقة': c.cardExpiry||'',
        'انتهاء الرخصة': c.licenseExpiry||'',
        'التأمين': c.insuranceExpiry||c.insuranceStatus||'',
        'الفحص': c.inspectionStatus||'',
        'الصيانة القادمة': c.nextService||'',
        'مهام مفتوحة': openTasks
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows.length?rows:[{'اللوحة':'لا بيانات'}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    // branch sheet
    const br = branches.map(b=>({'الفرع':b.name,'الأسطول':b.t,'جاهز':b.r,'النسبة %':b.pct,'مهام متأخرة':b.ov}));
    if(br.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(br), 'الفروع');
    // branch revenue sheet (من سعر اليوم المسجل)
    if(branchRevenue.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branchRevenue.map(b=>({'الفرع':b.name,'السيارات':b.cars,'متوسط السعر':b.avg,'الإيراد التقديري':b.rev}))), 'إيراد الفروع');
    // docs sheet (تقرير المستندات التفصيلي)
    const docRows = list.map(c=>{
      const row={'اللوحة':c.plate||'','الفرع':c.branch||''};
      let worst=null;
      DOC_TYPES.forEach(dt=>{
        const d=daysFrom(c[dt.key]);
        row[dt.label]=c[dt.key]||'';
        row['متبقي '+dt.label]=(d===null||isNaN(d))?'':d;
        if(d!==null&&!isNaN(d)&&(worst===null||d<worst)) worst=d;
      });
      row['أخطر مستند (يوم)']=worst===null?'':worst;
      return row;
    });
    if(docRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows), 'المستندات');
    (()=>{ const pb=periodBounds(); const bsfx=(rf.branch&&rf.branch!=='all')?('_'+String(rf.branch).replace(/\s+/g,'-')):''; const fname=(window.periodRange.preset==='all')?('yahma-report-'+todayStr()+bsfx+'.xlsx'):('yahma-report-'+pb.from+'_to_'+pb.to+bsfx+'.xlsx'); XLSX.writeFile(wb, fname); })();
  };
  const excelBtn = document.getElementById('rd-excel');
  if(excelBtn) excelBtn.onclick = exportReportsExcel;
  }

  /* ===== تصدير PDF ===== */
  function bindPdfButtons(ctx) {
  /* ---- PDF from current dashboard (JPEG/scale 1.5: ملف صغير موثوق بدل PNG ضخم يفشل تنزيله) ---- */
  document.getElementById('rd-pdf').onclick = async () => {
    const node = document.getElementById('reports-dashboard');
    if(!node){ alert('لا يوجد محتوى للتصدير'); return; }
    const btn = document.getElementById('rd-pdf');
    const old = btn ? btn.innerHTML : '';
    if(btn){ btn.disabled=true; btn.textContent='جارِ تجهيز PDF...'; }
    try{
      if(typeof html2canvas === 'undefined'){
        alert('مكتبة اللقطة غير محمّلة');
        window.print();
        return;
      }
      const canvas = await html2canvas(node, {scale:1.5, backgroundColor:'#ffffff', useCORS:true, logging:false});
      const img = canvas.toDataURL('image/jpeg', 0.85);
      if(window.jspdf && window.jspdf.jsPDF){
        const {jsPDF} = window.jspdf;
        const pdf = new jsPDF('p','mm','a4');
        const pageW=210, pageH=297, margin=8;
        const usableW=pageW-margin*2;
        const imgH = canvas.height * usableW / canvas.width;
        let hLeft = imgH, pos = margin;
        pdf.addImage(img, 'JPEG', margin, pos, usableW, imgH);
        hLeft -= (pageH - margin*2);
        while(hLeft > 0){
          pdf.addPage();
          pos = margin - (imgH - hLeft);
          pdf.addImage(img, 'JPEG', margin, pos, usableW, imgH);
          hLeft -= (pageH - margin*2);
        }
        pdf.save('yahma-report-'+Date.now()+'.pdf');
      } else {
        // fallback: download image
        const a=document.createElement('a'); a.download='yahma-report.png'; a.href=img; a.click();
        alert('مكتبة PDF غير متاحة — تم تنزيل صورة بدلًا منها');
      }
    }catch(err){
      console.error(err);
      alert('تعذر إنشاء PDF');
    }finally{
      if(btn){ btn.disabled=false; btn.innerHTML=old||'PDF'; }
    }
  };

  document.getElementById('rd-shot').onclick = async () => {
    const node = document.getElementById('reports-dashboard');
    if(!node) return;
    try{
      if(typeof html2canvas === 'undefined'){ window.print(); return; }
      const canvas = await html2canvas(node, {scale:2, backgroundColor:'#F3FAFA', useCORS:true});
      const a=document.createElement('a'); a.download='yahma-report-'+Date.now()+'.png'; a.href=canvas.toDataURL('image/png'); a.click();
    }catch(e){ alert('تعذر التقاط اللقطة'); }
  };
  }


  global.YahmaReportsSchedule = {
    bindScheduleUI, bindExcelExport, bindPdfButtons
  };
})(typeof window !== 'undefined' ? window : this);
