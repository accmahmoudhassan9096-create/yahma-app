(function(){
  'use strict';
  function syncProfileMenu(){
    var name=document.getElementById('topbar-user-name'), role=document.getElementById('topbar-user-role'), email=document.getElementById('user-dropdown-email');
    var dn=document.getElementById('user-dropdown-name'), dr=document.getElementById('user-dropdown-role'), av=document.getElementById('topbar-user-avatar'), dav=document.getElementById('user-dropdown-avatar');
    if(!name) return;
    if(dn) dn.textContent=name.textContent||'مستخدم';
    if(dr) dr.textContent=role?role.textContent:'مدير النظام';
    if(av && dav) dav.textContent=av.textContent||'م';
    if(email){ email.textContent=''; email.style.display='none'; }
  }
  function closeMenu(){var menu=document.getElementById('user-dropdown'), trigger=document.getElementById('topbar-user'); if(menu){menu.hidden=true} if(trigger) trigger.setAttribute('aria-expanded','false');}
  document.addEventListener('click',function(e){
    var logout=e.target&&e.target.closest?e.target.closest('#btn-profile-logout'):null;
    if(!logout) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeMenu();
    if(logout._yahmaLogoutRunning) return;
    logout._yahmaLogoutRunning=true;
    var previous=logout.textContent;
    logout.disabled=true;
    logout.textContent='جارِ تسجيل الخروج...';
    var finish=function(){
      logout.disabled=false;
      logout.textContent=previous;
      logout._yahmaLogoutRunning=false;
    };
    /* حماية: لو signOut اتعلق على شبكة ضعيفة، نعيد تهيئة الزر بعد 8 ثواني.
        yahmaSignOut بيخرج المستخدم محليًا فورًا، فمفيش سبب نوقفه. */
    var hardStop=setTimeout(function(){ finish(); }, 8000);
    Promise.resolve(typeof window.yahmaSignOut==='function'?window.yahmaSignOut():false)
      .catch(function(err){ console.warn('signOut error', err); })
      .then(function(){ clearTimeout(hardStop); finish(); });
  },true);
  async function openUserAdmin(){
    if(window.currentRole!=='admin'){ alert('إدارة المستخدمين متاحة للمدير فقط.'); return; }
    var old=document.getElementById('user-admin-overlay'); if(old) old.remove();
    /* ===== أسماء الفروع =====
       دليل الفروع محفوظ على الجهاز (IndexedDB) وممكن يكون ناقص أو مختلف
       عن الأسماء الحقيقية الموجودة في بيانات السيارات. ولأن الخادم بيطابق
       الاسم بالحرف (yahma_can_access_branch)، لازم القائمة تعرض الأسماء
       الحقيقية من الأسطول مع عدد سيارات كل فرع. */
    var branchCounts=new Map();
    var fleetList=(typeof fleet!=='undefined'&&Array.isArray(fleet))?fleet:[];
    fleetList.forEach(function(c){
      var n=String((c&&c.branch)||'').trim(); if(!n) return;
      branchCounts.set(n,(branchCounts.get(n)||0)+1);
    });
    (Array.isArray(branches)?branches:[]).forEach(function(b){
      var n=b&&b.name?String(b.name).trim():''; if(!n) return;
      if(!branchCounts.has(n)) branchCounts.set(n,0);
    });
    var sortedBranches=Array.from(branchCounts.entries()).sort(function(a,b){ return b[1]-a[1]; });
    var branchOptions='<option value="">كل الفروع — يشوف الكل</option>'
      +sortedBranches.map(function(pair){
          var label=pair[0]+' — '+pair[1]+' سيارة';
          return '<option value="'+escapeHtml(pair[0])+'">'+escapeHtml(label)+'</option>';
        }).join('');
    var allPageIds=PAGE_PERMISSION_OPTIONS.map(function(page){return page.id;});
    var permissionGrid=function(className,selected,disabled){return '<div class="ua-permission-grid '+className+'">'+PAGE_PERMISSION_OPTIONS.map(function(page){return '<label><input type="checkbox" value="'+page.id+'" '+(selected.includes(page.id)?'checked ':'')+(disabled?'disabled':'')+'><span>'+page.label+'</span></label>';}).join('')+'</div>';};
    var selectedPermissions=function(scope){return Array.from(scope.querySelectorAll('input[type="checkbox"]:checked')).map(function(input){return input.value;});};
    var syncPermissions=function(scope,role){var inputs=scope.querySelectorAll('input[type="checkbox"]');inputs.forEach(function(input){input.disabled=role==='admin';if(role==='admin')input.checked=true;});};
    var ov=document.createElement('div'); ov.id='user-admin-overlay'; ov.className='overlay'; ov.style.display='flex';
    ov.innerHTML='<div class="modal user-admin-modal"><div class="user-admin-head"><div><h2>إدارة المستخدمين</h2><p>أضف المستخدم وحدد دوره والفرع والأقسام التي يستطيع رؤيتها.</p></div><div class="ua-head-actions"><button type="button" class="btn btn-ghost btn-small" id="ua-welcome-template" title="عدّل نص رسالة الترحيب اللي بتتبعت لكل حساب جديد">✉️ رسالة الترحيب</button><button type="button" class="btn btn-ghost btn-small" id="user-admin-close">إغلاق</button></div></div><form id="user-admin-form" class="user-admin-form"><input id="ua-name" placeholder="الاسم الكامل" required><input id="ua-email" type="email" dir="ltr" placeholder="البريد الإلكتروني" required><input id="ua-password" type="password" dir="ltr" placeholder="كلمة المرور المؤقتة" minlength="8" required><select id="ua-role"><option value="view">مشاهدة فقط</option><option value="ops">تشغيل (يفحص بس)</option><option value="manager">إداري</option><option value="admin">مدير النظام</option></select><select id="ua-branch">'+branchOptions+'</select><label id="ua-send-welcome"><input type="checkbox" id="ua-welcome-check" checked> إرسال رسالة ترحيب على بريده</label><small class="ua-branch-note">«كل الفروع» ⇐ يشوف كل الأسطول. لو اخترت فرع بعينه ⇐ يشوف ذلك الفرع فقط (الاسم لازم يطابق تمامًا).</small><div class="ua-permissions-block"><strong>الأقسام المسموح بها</strong><small>الرئيسية متاحة للجميع. المدير لديه وصول كامل.</small>'+permissionGrid('ua-new-permissions',allPageIds,false)+'</div><button class="btn btn-primary" type="submit">إضافة المستخدم</button></form><div id="user-admin-message" class="user-admin-message"></div><div class="user-admin-list" id="user-admin-list"><div class="empty">جارِ تحميل المستخدمين...</div></div></div>';
    document.body.appendChild(ov);
    var close=function(){ov.remove()}; ov.onclick=function(e){if(e.target===ov) close()}; ov.querySelector('#user-admin-close').onclick=close;
    var msg=ov.querySelector('#user-admin-message'), list=ov.querySelector('#user-admin-list');
    var welcomeBtn=ov.querySelector('#ua-welcome-template');
    if(welcomeBtn) welcomeBtn.onclick=function(){ openWelcomeEditor(); };
    var renderUsers=async function(){
      if(!window.supabaseReady||!window.supabaseClient){list.innerHTML='<div class="empty">إدارة المستخدمين تحتاج اتصال Supabase.</div>';return;}
      var result=await window.supabaseClient.from('profiles').select('id,full_name,role,branch_name,allowed_tabs,national_id,birth_date,phone').order('full_name',{ascending:true});
      if(result.error){list.innerHTML='<div class="empty">تعذر تحميل المستخدمين: '+escapeHtml(result.error.message)+'</div>';return;}
      var myId=window.currentUser&&window.currentUser.id;
      list.innerHTML=(result.data||[]).map(function(u){
        var wanted=String(u.branch_name||'').trim();
        var options=branchOptions.split('<option ').map(function(chunk){
            var isMatch=wanted && chunk.indexOf('value="'+escapeHtml(wanted)+'"')>=0;
            return isMatch ? '<option selected '+chunk : '<option '+chunk;
          }).join('');
        var deleteBtn=(u.id===myId)?'':'<button type="button" class="btn btn-ghost btn-small ua-delete-user" style="color:var(--red,#CE4B3D)">حذف</button>';
        var allowed=Array.isArray(u.allowed_tabs)?u.allowed_tabs:allPageIds;
        return '<div class="user-admin-row" data-user-id="'+escapeHtml(u.id)+'"><div class="ua-user-summary"><b>'+escapeHtml(u.full_name||'بدون اسم')+'</b><small>'+escapeHtml((window.YahmaPerms&&window.YahmaPerms.label?window.YahmaPerms.label(u.role):u.role)||'view')+'</small>'
        /* البيانات الشخصية بتظهر للمدير، وتتفتح له التعديل.
           القيم مش بتظهر «فاضية» كأن ناقصة — بتظهر «مش مسجّل» عشان
           تفرق بين «سابه فاضي» و«لسه ما اكتبش». */
        +'<small class="ua-personal">'
        +'<span>📞 '+(u.phone?escapeHtml(u.phone):'<i>الجوال مش مسجّل</i>')+'</span>'
        +'<span>🪪 '+(u.national_id?escapeHtml(u.national_id):'<i>الهوية مش مسجّلة</i>')+'</span>'
        +'<span>🎂 '+(u.birth_date?escapeHtml(fmtDate(u.birth_date)):'<i>الميلاد مش مسجّل</i>')+'</span>'
        +'</small></div>'
        +'<div class="ua-personal-edit">'
        +'<label>الجوال<input class="ua-p-phone" dir="ltr" inputmode="numeric" maxlength="10" value="'+escapeHtml(u.phone||'')+'" placeholder="05XXXXXXXX"></label>'
        +'<label>رقم الهوية<input class="ua-p-nid" dir="ltr" inputmode="numeric" maxlength="10" value="'+escapeHtml(u.national_id||'')+'" placeholder="10 أرقام"></label>'
        +'<label>تاريخ الميلاد<input class="ua-p-birth" type="date" value="'+escapeHtml(u.birth_date||'')+'"></label>'
        +'</div>'
        +'<div class="ua-user-fields"><select class="ua-existing-branch">'+options+'</select><select class="ua-existing-role"><option value="view" '+(u.role==='view'?'selected':'')+'>مشاهدة</option><option value="ops" '+(u.role==='ops'?'selected':'')+'>تشغيل</option><option value="manager" '+(u.role==='manager'?'selected':'')+'>إداري</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مدير النظام</option></select></div><div class="ua-user-permissions"><strong>الأقسام المسموح بها</strong>'+permissionGrid('ua-existing-permissions',allowed,u.role==='admin')+'</div><div class="ua-user-actions"><button type="button" class="btn btn-ghost btn-small ua-save-role">حفظ</button>'+deleteBtn+'</div></div>';
      }).join('')||'<div class="empty">لا يوجد مستخدمون بعد.</div>';
      list.querySelectorAll('.ua-existing-role').forEach(function(select){select.addEventListener('change',function(){syncPermissions(select.closest('.user-admin-row'),select.value);});});
      list.querySelectorAll('.ua-save-role').forEach(function(btn){btn.onclick=async function(){
        var row=btn.closest('.user-admin-row'),
            role=row.querySelector('.ua-existing-role').value,
            branch=row.querySelector('.ua-existing-branch').value.trim()||null,
            allowed=role==='admin'?allPageIds:selectedPermissions(row.querySelector('.ua-existing-permissions')),
            personal={
              phone:row.querySelector('.ua-p-phone').value.trim(),
              national_id:row.querySelector('.ua-p-nid').value.trim(),
              birth_date:row.querySelector('.ua-p-birth').value.trim()
            };
        /* نفس التحقق بتاع شاشة «بياناتي» — القيد موجود في القاعدة
           على أي حال، والفحص هنا بيوفّر رحلة ذهاب وإياب ورسالة في
           الشاشة بدل رسالة من السيرفر. */
        if(window.YahmaMyAccount&&typeof window.YahmaMyAccount.validate==='function'){
          var problem=window.YahmaMyAccount.validate(personal);
          if(problem){ msg.textContent=problem; return; }
        }
        btn.disabled=true;
        var payload={role:role,branch_name:branch,allowed_tabs:allowed};
        payload.phone=personal.phone||null;
        payload.national_id=personal.national_id||null;
        payload.birth_date=personal.birth_date||null;
        var r=await window.supabaseClient.from('profiles').update(payload).eq('id',row.dataset.userId);
        msg.textContent=r.error?'تعذر حفظ بيانات المستخدم: '+r.error.message:'تم حفظ الصلاحيات والفرع والبيانات الشخصية';
        btn.disabled=false;
        if(!r.error) await renderUsers();
      };});
      list.querySelectorAll('.ua-delete-user').forEach(function(btn){btn.onclick=async function(){
        var row=btn.closest('.user-admin-row');
        var uname=row.querySelector('b')?row.querySelector('b').textContent:'هذا المستخدم';
        if(!confirm('متأكد إنك عايز تحذف "'+uname+'"؟ الإجراء ده لا يمكن التراجع عنه.')) return;
        btn.disabled=true; btn.textContent='جارِ الحذف...';
        try{
          var call=await invokeYahmaFunction('admin-delete-user',{id:row.dataset.userId},msg);
          if(call.skipped){ btn.disabled=false; btn.textContent='حذف'; return; }
          var r=call.result;
          if(r.error){
            showResult(msg, await describeInvokeError(r,'تعذر حذف المستخدم: '), 'تعذر حذف المستخدم.');
            btn.disabled=false; btn.textContent='حذف';
            return;
          }
          msg.textContent='تم حذف المستخدم بنجاح';
          await renderUsers();
        }catch(err){
          msg.textContent='تعذر حذف المستخدم: '+(err.message||err);
          btn.disabled=false; btn.textContent='حذف';
        }
      };});
    };
    ov.querySelector('#ua-role').addEventListener('change',function(){syncPermissions(ov.querySelector('.ua-new-permissions'),this.value);});
    ov.querySelector('#user-admin-form').onsubmit=async function(e){
      e.preventDefault(); msg.textContent='جارِ إنشاء المستخدم...';
      if(!window.supabaseReady||!window.supabaseClient){msg.textContent='اتصال Supabase غير متاح.';return;}
      var role=ov.querySelector('#ua-role').value;
      var payload={name:ov.querySelector('#ua-name').value.trim(),email:ov.querySelector('#ua-email').value.trim(),password:ov.querySelector('#ua-password').value,role:role,branch_name:ov.querySelector('#ua-branch').value.trim(),allowed_tabs:role==='admin'?allPageIds:selectedPermissions(ov.querySelector('.ua-new-permissions'))};
      var call=await invokeYahmaFunction('admin-create-user',payload,msg);
      if(call.skipped) return;
      var r=call.result;
      if(r.error){
        showResult(msg, await describeInvokeError(r,'تعذر إنشاء المستخدم: '), 'تعذر إنشاء المستخدم.');
        return;
      }
      /* ⚠️ لازم نتأكد إن الحساب اتعمل فعلاً قبل ما نقول «تم».
         الرد كان ممكن يوصل بنجاح والعملية تفشل جوّه — وقتها
         الرسالة كانت بتقول «تم إنشاء المستخدم» وحاجة مااتعملتش.
         الرجوع للقراءة بعد الكتابة رخيص مقارنة برسالة كاذبة. */
      if(!r.data||!r.data.id){
        msg.textContent='رد الدالة مش متوقع — مفيش رقم حساب. اتأكد إن الجلسة لسه صالحة وكمل من جديد.';
        return;
      }
      var confirmRead=await window.supabaseClient.from('profiles')
        .select('id,role').eq('id',r.data.id).maybeSingle();
      if(confirmRead.error||!confirmRead.data){
        msg.textContent='الدالة رجعت رقم حساب بس الحساب مش ظاهر في القاعدة — ابعتله التفاصيل (رقم '
          +r.data.id+') ونتابع.';
        return;
      }
      if(confirmRead.data.role!==role){
        msg.textContent='اتعمل الحساب، بس الدور اتخزّن «'+confirmRead.data.role+'» بدل «'+role+'». عيّنه من القائمة.';
        await renderUsers();
        return;
      }
      var sendWelcome=ov.querySelector('#ua-welcome-check')?ov.querySelector('#ua-welcome-check').checked:true;
      var notice=r.data.id?await window.notifyYahmaEvent('account_created',{userId:r.data.id,name:payload.name,sendWelcome:sendWelcome}):{ok:false,error:'تعذر تحديد الحساب الجديد'};
      msg.textContent=notice.skipped?'تم إنشاء المستخدم. ترحيب: '+(notice.reason||'مش محسوب')
        :notice.ok?'تم إنشاء المستخدم وإرسال رسالة ترحيب إلى بريده.'
        :'تم إنشاء المستخدم، لكن تعذر إرسال رسالة الترحيب: '+(notice.error||'تحقق من إعداد البريد');
      e.target.reset(); await renderUsers();
    };
    renderUsers();
  }
  /* ===== محرّر رسالة الترحيب =====
   النص كان ثابت جوه الـEdge Function؛ المدير مش كان يقدر يغيّره.
   دلوقتي بيتقرأ من جدول welcome_template ويتحفظ من هنا.

   المعاينة بتتعمل **في المتصفح** مش على السيرفر: بتتغير مع كل
   حرف بتكتبه، والمستخدم يشوف النتيجة فورًا من غير انتظار شبكة.
   ولو السيرفر واقع، المعاينة بتفضل شغالة. */

var WELCOME_PLACEHOLDERS = ['{{name}}', '{{role}}', '{{branch}}', '{{login_url}}'];
var WELCOME_MAX_SUBJECT = 180;
var WELCOME_MAX_BODY = 4000;
var WELCOME_DEFAULT_SUBJECT = 'تم إنشاء حسابك في منصة يهماء لتأجير السيارات';
var WELCOME_DEFAULT_BODY = [
  'مرحبًا {{name}}،',
  '',
  'تم إنشاء حساب لك في منصة يهماء لتأجير السيارات، ودورك: {{role}}{{branch}}.',
  '',
  'خطوات الدخول:',
  '1) افتح: {{login_url}}',
  '2) سجّل الدخول ببريدك وكلمة المرور من مدير النظام.',
  '3) غيّر كلمة المرور من أول مرة تدخل.',
  '',
  'صلاحياتك محددة سلفًا، فلو محتاج تبويب مش ظاهرلك كلّم مدير النظام يفعّله.',
  '',
  'مع تحيات،',
  'فريق منصة يهماء'
].join('\n');

function welcomeRender(template, sample) {
  var branch = sample.branch ? (' — الفرع: ' + sample.branch) : '';
  return String(template == null ? '' : template)
    .split('{{name}}').join(sample.name || 'بك')
    .split('{{role}}').join(sample.role || 'مشاهدة فقط')
    .split('{{branch}}').join(branch)
    .split('{{login_url}}').join(sample.loginUrl || window.location.origin);
}

/* يقرأ القالب المحفوظ. لو السيرفر مش راد أو الجدول لسه مش
   موجود، بيرجع للافتراضي — عشان كده المدير يقدر يعدّل النص
   ويشوف المعاينة من غير ما يستنى أي حاجة. */
function welcomeLoadTemplate() {
  if (!window.supabaseClient) return Promise.resolve(null);
  try {
    return window.supabaseClient.functions
      .invoke('send-user-email', { body: { action: 'get_welcome_template' } })
      .then(function (r) {
        if (r && !r.error && r.data && !r.data.error) return r.data;
        return null;
      });
  } catch (_) { yahmaErr(_, 'topbar-ui.js:welcomeLoadTemplate'); return Promise.resolve(null); }
}

function openWelcomeEditor() {
  var old = document.getElementById('welcome-editor-overlay');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'welcome-editor-overlay';
  ov.className = 'overlay';
  ov.style.display = 'flex';
  ov.innerHTML =
    '<div class="modal welcome-editor-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-editor-title">'
    + '<div class="user-admin-head"><div><h2 id="welcome-editor-title">رسالة الترحيب</h2>'
    + '<p>الرسالة اللي بتتبعت لكل حساب جديد أول ما يتحفظ.</p></div>'
    + '<button type="button" class="btn btn-ghost btn-small" id="welcome-editor-close">إغلاق</button></div>'
    + '<div class="welcome-editor-body">'
    + '<label class="fld">عنوان الرسالة<input id="welcome-subject" maxlength="' + WELCOME_MAX_SUBJECT + '"></label>'
    + '<label class="fld">نص الرسالة<textarea id="welcome-body" rows="12" maxlength="' + WELCOME_MAX_BODY + '"></textarea></label>'
    + '<div class="welcome-ph-row"><span>الحقول المتاحة (اضغط لإدراجها):</span>'
    + WELCOME_PLACEHOLDERS.map(function (p) {
        return '<button type="button" class="welcome-ph" data-ph="' + p + '">' + escapeHtml(p) + '</button>';
      }).join('')
    + '</div>'
    + '<label class="welcome-enabled"><input type="checkbox" id="welcome-enabled" checked> إرسال رسالة الترحيب تلقائيًا</label>'
    + '<div class="welcome-preview-head"><strong>معاينة</strong>'
    + '<span class="muted-small">بأسماء تجريبية: محمود حسن — مدير النظام — فرع الشيخ زايد</span></div>'
    + '<pre class="welcome-preview" id="welcome-preview" dir="rtl"></pre>'
    + '<div id="welcome-editor-status" role="status" aria-live="polite" class="ua-user-admin-message"></div>'
    + '<div class="welcome-editor-actions">'
    + '<button type="button" class="btn btn-ghost btn-small" id="welcome-reset">استعادة النص الافتراضي</button>'
    + '<button type="button" class="btn btn-primary btn-small" id="welcome-save">حفظ</button>'
    + '</div></div></div>';
  document.body.appendChild(ov);

  var close = function () { ov.remove(); };
  ov.onclick = function (e) { if (e.target === ov) close(); };
  ov.querySelector('#welcome-editor-close').onclick = close;

  var subjectEl = ov.querySelector('#welcome-subject');
  var bodyEl = ov.querySelector('#welcome-body');
  var enabledEl = ov.querySelector('#welcome-enabled');
  var previewEl = ov.querySelector('#welcome-preview');
  var statusEl = ov.querySelector('#welcome-editor-status');

  var SAMPLE = { name: 'محمود حسن', role: 'مدير النظام', branch: 'فرع الشيخ زايد', loginUrl: window.location.origin };
  var drawPreview = function () {
    var s = welcomeRender(subjectEl.value, SAMPLE);
    var b = welcomeRender(bodyEl.value, SAMPLE);
    previewEl.textContent = 'العنوان: ' + s + '\n\n' + b;
  };

  var status = function (text, isError) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? 'var(--red,#CE4B3D)' : '';
  };

  subjectEl.addEventListener('input', drawPreview);
  bodyEl.addEventListener('input', drawPreview);

  ov.querySelectorAll('.welcome-ph').forEach(function (btn) {
    btn.onclick = function () {
      var target = bodyEl;
      var start = target.selectionStart != null ? target.selectionStart : target.value.length;
      var end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
      var token = btn.dataset.ph;
      target.value = target.value.slice(0, start) + token + target.value.slice(end);
      target.focus();
      try { target.setSelectionRange(start + token.length, start + token.length); }
      catch (_) { yahmaErr(_, 'topbar-ui.js:welcome-ph'); }
      drawPreview();
    };
  });

  ov.querySelector('#welcome-reset').onclick = function () {
    if (!confirm('استعادة النص الافتراضي؟ هيتحفظ النص اللي كتبته فوق.')) return;
    subjectEl.value = WELCOME_DEFAULT_SUBJECT;
    bodyEl.value = WELCOME_DEFAULT_BODY;
    drawPreview();
    status('النص الافتراضي اترجّع — اضغط «حفظ» لتثبيته.');
  };

  ov.querySelector('#welcome-save').onclick = async function () {
    var btn = this;
    var subject = subjectEl.value.trim();
    var text = bodyEl.value;
    if (!subject) { status('العنوان مطلوب.', true); subjectEl.focus(); return; }
    if (!text.trim()) { status('نص الرسالة مطلوب.', true); bodyEl.focus(); return; }
    btn.disabled = true;
    status('جارِ الحفظ...');
    try {
      var call = await invokeYahmaFunction('send-user-email', {
        action: 'save_welcome_template', subject: subject, body: text, enabled: enabledEl.checked
      }, statusEl);
      if (call.skipped) { btn.disabled = false; return; }
      var r = call.result;
      if (r && r.error) throw new Error(r.error.message || 'تعذر الحفظ');
      if (r && r.data && r.data.error) throw new Error(r.data.error);
      status('تم حفظ رسالة الترحيب.');
    } catch (e) {
      yahmaErr(e, 'topbar-ui.js:welcome-save');
      status('تعذر الحفظ: ' + ((e && e.message) || e), true);
    }
    btn.disabled = false;
  };

  /* تحميل النص المحفوظ — الافتراضي بيظهر فورًا، وبعدين أي نص
     محفوظ بيحلّ محلّه. مفيش شاشة تحميل ولا انتظار. */
  subjectEl.value = WELCOME_DEFAULT_SUBJECT;
  bodyEl.value = WELCOME_DEFAULT_BODY;
  drawPreview();
  status('جارِ تحميل النص المحفوظ...');
  welcomeLoadTemplate().then(function (data) {
    if (!data) {
      status('تعذر تحميل النص المحفوظ — بتشتغل على النص الافتراضي. لو ده غلط، تأكد إنك داخل كمدير النظام.');
      return;
    }
    subjectEl.value = String(data.subject || WELCOME_DEFAULT_SUBJECT);
    bodyEl.value = String(data.body || WELCOME_DEFAULT_BODY);
    enabledEl.checked = data.enabled !== false;
    drawPreview();
    status(data.fromDb ? '' : 'مفيش نص محفوظ لسه — ده النص الافتراضي.');
  });
}

/* ينادى من شاشة إدارة المستخدمين */
window.yahmaOpenWelcomeEditor = openWelcomeEditor;

  /* ===== تموضع القائمة داخل حدود الشاشة =====
     القائمة position:absolute والدور RTL، فـ right:0 كان بيخرجها خارج
     الشاشة تمامًا على الموبايل (الزر خارج الإطار → لا يمكن الضغط عليه).
     هنا نحسب الموضع بعد فتحها ونثبّته بالبكسل. */
  var MENU_MIN_MARGIN = 8;
  window.yahmaOpenWelcomeEditor = openWelcomeEditor;
  window.YahmaTopbarUser = { syncProfileMenu, closeMenu, openUserAdmin, welcomeRender, welcomeLoadTemplate, openWelcomeEditor };
})();
