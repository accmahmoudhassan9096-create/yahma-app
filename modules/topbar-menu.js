(function(){
  'use strict';
  var MENU_MIN_MARGIN = 8;
  function closeMenu(){
    if(window.YahmaTopbarUser && typeof window.YahmaTopbarUser.closeMenu === 'function'){
      window.YahmaTopbarUser.closeMenu();
    } else {
      var menu = document.getElementById('user-dropdown'), trigger = document.getElementById('topbar-user');
      if(menu) menu.hidden = true;
      if(trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  }

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
  /* ===== أدوات البيانات على الموبايل =====
     الأزرار دي مخفية من الشريط العلوي على الموبايل (الزحام)،
     لكن لازم يفضل للمستخدم طريقة وصول — فبنقلها لقائمة المستخدم.
     بننداء نفس الأزرار الأصلية عشان الصلاحيات تفضل محسوبة صح. */
  function bindMobileTools(){
    var map={
      'umt-import':'btn-import',
      'umt-export-xlsx':'btn-export',
      'umt-export-pdf':'btn-export-pdf',
      'umt-template':'btn-template',
      'umt-email-pdf':'btn-email-filtered-pdf',
      'umt-backup':'btn-backup'
    };
    /* «تحديث قسري» مش مرتبط بزر مخفي — بينادي الدالة نفسها مباشرة */
    var hardBtn=document.getElementById('umt-hard-refresh');
    if(hardBtn && !hardBtn._yahmaBound){
      hardBtn._yahmaBound=true;
      hardBtn.addEventListener('click',function(e){
        e.preventDefault();
        closeMenu();
        if(typeof window.yahmaAskHardRefresh==='function') window.yahmaAskHardRefresh();
      });
    }
    /* سجل الأخطاء. إظهار/إخفاء العنصر ملك error-panel.js (بيعرف
       الأدوار وبيحدّث نفسه عند تغيّرها) — هنا الربط بس. */
    var errItem=document.getElementById('umt-errors');
    if(errItem && !errItem._yahmaBound){
      errItem._yahmaBound=true;
      errItem.addEventListener('click',function(e){
        e.preventDefault();
        closeMenu();
        if(window.YahmaErrorPanel && typeof window.YahmaErrorPanel.open==='function'){
          window.YahmaErrorPanel.open();
        }
      });
    }
    try{ if(window.YahmaErrorPanel && typeof window.YahmaErrorPanel.syncVisibility==='function') window.YahmaErrorPanel.syncVisibility(); }catch(_){yahmaErr(_,'topbar-ui.js:err');}

    /* ⭐ تقرير سريع عن الأخطاء — متاح لكل الأدوار (مش بس المدير).
       «سجل الأخطاء» الكامل مخفي لغير الأدمن لأنه فيه أسماء ملفات
       وسطور. بس لما حاجة غلط، المستخدم لازم يعرف من غير صلاحيات.
       فبنديله نافذة مختصرة: آخر 10 أخطاء (الرسالة والمكان) + زر نسخ. */
    var quickErr=document.getElementById('umt-quick-errors');
    if(quickErr && !quickErr._yahmaBound){
      quickErr._yahmaBound=true;
      quickErr.addEventListener('click',function(e){
        e.preventDefault();
        closeMenu();
        if(window.YahmaErrorPanel && typeof window.YahmaErrorPanel.quickReport==='function'){
          window.YahmaErrorPanel.quickReport();
        }
      });
    }

    /* قفل المنصة: اقفل دلوقتي / شغّل ووقّف القفل */
    var lockNow=document.getElementById('umt-lock-now');
    if(lockNow && !lockNow._yahmaBound){
      lockNow._yahmaBound=true;
      lockNow.addEventListener('click',function(e){
        e.preventDefault();
        closeMenu();
        if(typeof window.YahmaAppLock==='undefined') return;
        if(!window.YahmaAppLock.isEnabled()){
          try{ window.alert('القفل متوقف دلوقتي — شغّله من «إيقاف قفل المنصة» الأول.'); }catch(_){yahmaErr(_,'topbar-ui.js:214');}
          return;
        }
        window.YahmaAppLock.relock();
        window.YahmaAppLock.show();
      });
    }
    var lockToggle=document.getElementById('umt-lock-toggle');
    var lockLabel=document.getElementById('umt-lock-toggle-label');
    if(lockToggle && !lockToggle._yahmaBound){
      lockToggle._yahmaBound=true;
      var syncLockLabel=function(){
        if(!lockLabel || typeof window.YahmaAppLock==='undefined') return;
        lockLabel.textContent = window.YahmaAppLock.isEnabled() ? 'إيقاف قفل المنصة' : 'تشغيل قفل المنصة';
      };
      syncLockLabel();
      lockToggle.addEventListener('click',function(e){
        e.preventDefault();
        if(typeof window.YahmaAppLock==='undefined') return;
        var on = !window.YahmaAppLock.isEnabled();
        window.YahmaAppLock.setEnabled(on);
        syncLockLabel();
        closeMenu();
        try{
          window.alert(on
            ? 'قفل المنصة شغّال — هطلب كلمة المرور عند كل فتح للتطبيق.'
            : 'قفل المنصة متوقف — التطبيق هيفتح على طول.');
        }catch(_){yahmaErr(_,'topbar-ui.js:241');}
      });
    }
    Object.keys(map).forEach(function(id){
      var trigger=document.getElementById(id);
      if(!trigger || trigger._mobileBound) return;
      trigger._mobileBound=true;
      trigger.addEventListener('click',function(e){
        e.preventDefault();
        closeMenu();
        var target=document.getElementById(map[id]);
        if(!target){ return; }
        /* نحترم نفس قواعد الصلاحية المطبّقة على الزر الأصلي */
        if(target.disabled){
          try{ window.alert('هذا الإجراء يحتاج صلاحية مدير أو تشغيل.'); }catch(_){yahmaErr(_,'topbar-ui.js:255');}
          return;
        }
        setTimeout(function(){ target.click(); }, 80);
      });
    });
  }
  window.YahmaTopbarMenu = { positionMenu, openMenu, bindMobileTools };
})();
