/* ===== تفاعلات الشريط العلوي + مؤشرات سريعة + القوائم ===== */
/* استُخرجت من app-core.js (السطور 3570-3774) ضمن تقسيم الملفات، */
/* ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== yahma-topbar-interactions ===== */

(function(){
  'use strict';

  /* تهيئة كل أجزاء الشريط العلوي بالترتيب الصحيح */
  function init(){
    /* bindMobileTools يربط أدوات الموبايل */
    if(window.YahmaTopbarMenu && typeof window.YahmaTopbarMenu.bindMobileTools === 'function') window.YahmaTopbarMenu.bindMobileTools();
    /* syncProfileMenu يزامن قائمة المستخدم */
    if(window.YahmaTopbarUser && typeof window.YahmaTopbarUser.syncProfileMenu === 'function') window.YahmaTopbarUser.syncProfileMenu();
    /* زر المستخدم يفتح/يغلق القائمة المنسدلة */
    const userBtn=document.getElementById('topbar-user');
    const userDropdown=document.getElementById('user-dropdown');
    if(userBtn && userDropdown){
      userBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        const isHidden = userDropdown.hidden;
        userDropdown.hidden = !isHidden;
        userDropdown.style.display = isHidden ? '' : 'none';
        /* ⭐ aria-expanded كان بيفضل false طول الوقت — قارئ الشاشة
           كان بيقول إن القائمة مقفولة وهي مفتوحة. */
        userBtn.setAttribute('aria-expanded', String(isHidden));
      };
    }
    /* زر "بياناتي وكلمة المرور" يفتح شاشة البيانات الشخصية */
    const myAccountBtn=document.getElementById('btn-my-account');
    if(myAccountBtn){
      myAccountBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        if(userDropdown) { userDropdown.hidden = true; userDropdown.style.display = 'none'; }
        if(typeof window.yahmaOpenMyAccount === 'function') window.yahmaOpenMyAccount();
        else if(window.YahmaMyAccount && typeof window.YahmaMyAccount.open === 'function') window.YahmaMyAccount.open();
      };
    }
    /* syncProfileMenu يزامن قائمة المستخدم */
    if(window.YahmaTopbarUser && typeof window.YahmaTopbarUser.syncProfileMenu === 'function') window.YahmaTopbarUser.syncProfileMenu();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* إغلاق القائمة عند الضغط خارجها */
  document.addEventListener('click', function(e){
    const userDropdown=document.getElementById('user-dropdown');
    const userBtn=document.getElementById('topbar-user');
    if(userDropdown && userBtn && !userDropdown.hidden && !userDropdown.contains(e.target) && !userBtn.contains(e.target)){
      userDropdown.hidden = true;
      userDropdown.style.display = 'none';
      /* ⭐ نفس الحاجة: aria-expanded لازم يرجع false مع الإغلاق */
      userBtn.setAttribute('aria-expanded','false');
    }
  });
})();
