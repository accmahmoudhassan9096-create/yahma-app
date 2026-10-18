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
    /* زر الإعدادات يفتح إدارة المستخدمين (للمدير فقط) */
    const settings=document.getElementById('topbar-settings');
    if(settings){
      settings.onclick=function(e){
        e.preventDefault();
        if(window.YahmaTopbarUser && typeof window.YahmaTopbarUser.closeMenu === 'function') window.YahmaTopbarUser.closeMenu();
        if(window.YahmaTopbarUser && typeof window.YahmaTopbarUser.openUserAdmin === 'function') window.YahmaTopbarUser.openUserAdmin();
      };
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
