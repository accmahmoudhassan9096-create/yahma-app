/* ===== تفاعلات الشريط العلوي + مؤشرات سريعة + القوائم ===== */
/* استُخرجت من app-core.js (السطور 3570-3774) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== yahma-topbar-interactions ===== */

(function(){
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
    var branchOptions='<option value="">كل الفروع (بدون تقييد)</option>'
      +sortedBranches.map(function(pair){
          var label=pair[0]+' — '+pair[1]+' سيارة';
          return '<option value="'+escapeHtml(pair[0])+'">'+escapeHtml(label)+'</option>';
        }).join('');
    var allPageIds=PAGE_PERMISSION_OPTIONS.map(function(page){return page.id;});
    var permissionGrid=function(className,selected,disabled){return '<div class="ua-permission-grid '+className+'">'+PAGE_PERMISSION_OPTIONS.map(function(page){return '<label><input type="checkbox" value="'+page.id+'" '+(selected.includes(page.id)?'checked ':'')+(disabled?'disabled':'')+'><span>'+page.label+'</span></label>';}).join('')+'</div>';};
    var selectedPermissions=function(scope){return Array.from(scope.querySelectorAll('input[type="checkbox"]:checked')).map(function(input){return input.value;});};
    var syncPermissions=function(scope,role){var inputs=scope.querySelectorAll('input[type="checkbox"]');inputs.forEach(function(input){input.disabled=role==='admin';if(role==='admin')input.checked=true;});};
    var ov=document.createElement('div'); ov.id='user-admin-overlay'; ov.className='overlay'; ov.style.display='flex';
    ov.innerHTML='<div class="modal user-admin-modal"><div class="user-admin-head"><div><h2>إدارة المستخدمين</h2><p>أضف المستخدم وحدد دوره والفرع والأقسام التي يستطيع رؤيتها.</p></div><button type="button" class="btn btn-ghost btn-small" id="user-admin-close">إغلاق</button></div><form id="user-admin-form" class="user-admin-form"><input id="ua-name" placeholder="الاسم الكامل" required><input id="ua-email" type="email" dir="ltr" placeholder="البريد الإلكتروني" required><input id="ua-password" type="password" dir="ltr" placeholder="كلمة المرور المؤقتة" minlength="8" required><select id="ua-role"><option value="view">مشاهدة فقط</option><option value="ops">تشغيل</option><option value="admin">مدير</option></select><select id="ua-branch">'+branchOptions+'</select><small class="ua-branch-note">اختر الفرع بالاسم الظاهر مع عدد سياراته — الاسم لازم يطابق تمامًا عشان يظهر للمستخدم.</small><div class="ua-permissions-block"><strong>الأقسام المسموح بها</strong><small>الرئيسية متاحة للجميع. المدير لديه وصول كامل.</small>'+permissionGrid('ua-new-permissions',allPageIds,false)+'</div><button class="btn btn-primary" type="submit">إضافة المستخدم</button></form><div id="user-admin-message" class="user-admin-message"></div><div class="user-admin-list" id="user-admin-list"><div class="empty">جارِ تحميل المستخدمين...</div></div></div>';
    document.body.appendChild(ov);
    var close=function(){ov.remove()}; ov.onclick=function(e){if(e.target===ov) close()}; ov.querySelector('#user-admin-close').onclick=close;
    var msg=ov.querySelector('#user-admin-message'), list=ov.querySelector('#user-admin-list');
    var renderUsers=async function(){
      if(!window.supabaseReady||!window.supabaseClient){list.innerHTML='<div class="empty">إدارة المستخدمين تحتاج اتصال Supabase.</div>';return;}
      var result=await window.supabaseClient.from('profiles').select('id,full_name,role,branch_name,allowed_tabs').order('full_name',{ascending:true});
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
        return '<div class="user-admin-row" data-user-id="'+escapeHtml(u.id)+'"><div class="ua-user-summary"><b>'+escapeHtml(u.full_name||'بدون اسم')+'</b><small>'+escapeHtml(u.role||'view')+'</small></div><div class="ua-user-fields"><select class="ua-existing-branch">'+options+'</select><select class="ua-existing-role"><option value="view" '+(u.role==='view'?'selected':'')+'>مشاهدة</option><option value="ops" '+(u.role==='ops'?'selected':'')+'>تشغيل</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مدير</option></select></div><div class="ua-user-permissions"><strong>الأقسام المسموح بها</strong>'+permissionGrid('ua-existing-permissions',allowed,u.role==='admin')+'</div><div class="ua-user-actions"><button type="button" class="btn btn-ghost btn-small ua-save-role">حفظ الصلاحيات</button>'+deleteBtn+'</div></div>';
      }).join('')||'<div class="empty">لا يوجد مستخدمون بعد.</div>';
      list.querySelectorAll('.ua-existing-role').forEach(function(select){select.addEventListener('change',function(){syncPermissions(select.closest('.user-admin-row'),select.value);});});
      list.querySelectorAll('.ua-save-role').forEach(function(btn){btn.onclick=async function(){var row=btn.closest('.user-admin-row'), role=row.querySelector('.ua-existing-role').value, branch=row.querySelector('.ua-existing-branch').value.trim()||null, allowed=role==='admin'?allPageIds:selectedPermissions(row.querySelector('.ua-existing-permissions')); btn.disabled=true; var r=await window.supabaseClient.from('profiles').update({role:role,branch_name:branch,allowed_tabs:allowed}).eq('id',row.dataset.userId); msg.textContent=r.error?'تعذر حفظ بيانات المستخدم: '+r.error.message:'تم حفظ الصلاحيات والفرع'; btn.disabled=false; if(!r.error) await renderUsers();};});
      list.querySelectorAll('.ua-delete-user').forEach(function(btn){btn.onclick=async function(){
        var row=btn.closest('.user-admin-row');
        var uname=row.querySelector('b')?row.querySelector('b').textContent:'هذا المستخدم';
        if(!confirm('متأكد إنك عايز تحذف "'+uname+'"؟ الإجراء ده لا يمكن التراجع عنه.')) return;
        btn.disabled=true; btn.textContent='جارِ الحذف...';
        try{
          var r=await window.supabaseClient.functions.invoke('admin-delete-user',{body:{id:row.dataset.userId}});
          if(r.error){
            var detail=r.error.message||'خطأ غير معروف';
            try{ if(r.error.context){ var body=await r.error.context.clone().json(); if(body&&body.error) detail=body.error; } }catch(_){ }
            if(r.data&&r.data.error) detail=r.data.error;
            msg.textContent='تعذر حذف المستخدم: '+detail;
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
      var r=await window.supabaseClient.functions.invoke('admin-create-user',{body:payload});
      if(r.error){
        var detail=r.error.message||'خطأ غير معروف';
        try{
          if(r.error.context){
            var responseBody=await r.error.context.clone().json();
            if(responseBody&&responseBody.error) detail=responseBody.error;
          }
        }catch(_){ }
        if(r.data&&r.data.error) detail=r.data.error;
        msg.textContent='تعذر إنشاء المستخدم: '+detail;
        return;
      }
      var notice=r.data&&r.data.id?await window.notifyYahmaEvent('account_created',{userId:r.data.id,name:payload.name}):{ok:false,error:'تعذر تحديد الحساب الجديد'};
      msg.textContent=notice.ok?'تم إنشاء المستخدم وإرسال رسالة ترحيب إلى بريده.':`تم إنشاء المستخدم، لكن تعذر إرسال رسالة الترحيب: ${notice.error||'تحقق من إعداد البريد'}`;
      e.target.reset(); await renderUsers();
    };
    renderUsers();
  }
  /* ===== تموضع القائمة داخل حدود الشاشة =====
     القائمة position:absolute والدور RTL، فـ right:0 كان بيخرجها خارج
     الشاشة تمامًا على الموبايل (الزر خارج الإطار → لا يمكن الضغط عليه).
     هنا نحسب الموضع بعد فتحها ونثبّته بالبكسل. */
  var MENU_MIN_MARGIN = 8;
  function positionMenu(menu, trigger){
    if(!menu||!trigger) return;
    /* القائمة تُثبَّت على الشاشة (fixed) حتى تكون الإحداثيات نسبةً للـ viewport
       وليست نسبةً لحاوية الشريط العلوي (وإلا خرجت من الشاشة في RTL) */
    menu.style.position='fixed';
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('max-width');
    var vw=window.innerWidth||document.documentElement.clientWidth||0;
    var vh=window.innerHeight||document.documentElement.clientHeight||0;
    var cs=getComputedStyle(menu);
    var maxAllowed=Math.max(200, vw-MENU_MIN_MARGIN*2);
    var natural=menu.offsetWidth||parseFloat(cs.width)||270;
    var w=Math.min(natural, maxAllowed);
    var mh=menu.offsetHeight||0;
    var t=trigger.getBoundingClientRect();
    /* على RTL نبدأ من حافة الزر اليمنى؛ مع ضمان عدم الخروج من الشاشة */
    var left=Math.round(t.right-w);
    if(left+w+MENU_MIN_MARGIN>vw) left=vw-w-MENU_MIN_MARGIN;
    if(left<MENU_MIN_MARGIN) left=MENU_MIN_MARGIN;
    var top=Math.round(t.bottom+8);
    var spaceBelow=vh-top-MENU_MIN_MARGIN;
    if(mh>spaceBelow){
      var above=t.top-8-MENU_MIN_MARGIN;
      if(above>0) top=Math.max(MENU_MIN_MARGIN, Math.round(above-mh));
    }
    if(top+mh>vh-MENU_MIN_MARGIN) top=Math.max(MENU_MIN_MARGIN, vh-MENU_MIN_MARGIN-mh);
    menu.style.width=w+'px';
    menu.style.maxHeight=Math.max(160, vh-top-MENU_MIN_MARGIN)+'px';
    menu.style.overflowY='auto';
    menu.style.left=left+'px';
    menu.style.top=top+'px';
  }
  function openMenu(menu, trigger){
    menu.hidden=false;
    positionMenu(menu, trigger);
    trigger.setAttribute('aria-expanded','true');
  }
  function init(){
    var trigger=document.getElementById('topbar-user'), menu=document.getElementById('user-dropdown');
    if(!trigger||!menu||trigger._yahmaBound) return;
    var userWrap=document.getElementById('topbar-user-wrap'), notifySlot=document.getElementById('notify-slot-anchor');
    if(userWrap&&notifySlot&&notifySlot.parentNode===userWrap.parentNode) notifySlot.parentNode.insertBefore(userWrap,notifySlot.nextSibling);
    trigger._yahmaBound=true;
    trigger.addEventListener('click',function(e){
      e.stopPropagation();
      syncProfileMenu();
      if(menu.hidden) openMenu(menu, trigger);
      else closeMenu();
    });
    document.addEventListener('click',function(e){if(!e.target.closest('#topbar-user-wrap')) closeMenu();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape') closeMenu();});
    /* إعادة التموضع عند تدوير الشاشة أو تغيّر الحجم */
    var reposition=function(){ if(menu&&!menu.hidden) positionMenu(menu, trigger); };
    window.addEventListener('resize', reposition);
    window.addEventListener('orientationchange', function(){ setTimeout(reposition, 250); });
    var settings=document.getElementById('btn-account-settings');
    if(settings){ settings.textContent=window.currentRole==='admin'?'إدارة المستخدمين':'إعدادات الحساب'; settings.addEventListener('click',function(){closeMenu(); openUserAdmin();}); }
    syncProfileMenu();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  setTimeout(function(){init();syncProfileMenu();},1500); setTimeout(function(){init();syncProfileMenu();},4000);
})();


/* ===== yahma-quick-stats-js ===== */

(function(){
 function update(){
  const root=document.getElementById('quick-stats'); if(!root)return;
  let total=0,ready=0,openTasks=0;
  try{
   const list=Array.isArray(window.fleet)?window.fleet:[]; total=list.length;
   if(typeof vehicleReadiness==='function') list.forEach(c=>{if(vehicleReadiness(c).ready)ready++});
   if(typeof collectTasks==='function') openTasks=collectTasks().filter(t=>t.status!=='done').length;
  }catch(e){}
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value)};
  set('quick-ready',ready); set('quick-review',Math.max(total-ready,0)); set('quick-tasks',openTasks);
 }
 function bind(){document.querySelectorAll('#quick-stats [data-stat-tab]').forEach(btn=>{if(btn._bound)return;btn._bound=true;btn.addEventListener('click',()=>{const tab=btn.dataset.statTab;document.querySelector(`.nav-item[data-tab="${tab}"]`)?.click()})})}
 function boot(){update();bind();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 setTimeout(function(){update();bind()},2000);
})();


/* ===== yahma-safe-dropdowns-js ===== */

(function(){
  'use strict';
  if(window._yahmaSafeDd) return;
  window._yahmaSafeDd = true;

  function closeAll(except){
    document.querySelectorAll('.top-dd.open').forEach(function(dd){
      if(except && dd === except) return;
      dd.classList.remove('open');
    });
    var pop = document.getElementById('modern-popover');
    if(pop){
      pop.hidden = true;
      pop.classList.remove('open','is-leaving');
    }
  }

  function onBtnClick(e){
    var btn = e.currentTarget;
    var dd = btn.closest('.top-dd');
    if(!dd) return;
    e.preventDefault();
    e.stopPropagation();
    var willOpen = !dd.classList.contains('open');
    closeAll();
    if(willOpen) dd.classList.add('open');
  }

  function bindOnce(){
    document.querySelectorAll('.topbar-actions .top-dd, .top-dd').forEach(function(dd){
      var btn = dd.querySelector(':scope > button') || dd.querySelector('button');
      if(!btn || btn._safeDdBound) return;
      btn._safeDdBound = true;
      // ensure native menu is usable
      var menu = dd.querySelector('.top-dd-menu');
      if(menu){
        menu.hidden = false;
        menu.removeAttribute('hidden');
        menu.style.removeProperty('display');
      }
      btn.addEventListener('click', onBtnClick);
    });
  }

  document.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('.top-dd')) return;
    closeAll();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeAll();
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindOnce);
  else bindOnce();
  // one delayed re-bind only (no aggressive interval)
  setTimeout(bindOnce, 800);
  setTimeout(bindOnce, 2500);
})();





