(function(){
  'use strict';
  if(window._yahmaSmoothFleet) return;
  window._yahmaSmoothFleet = true;

  // منع render متكرر أثناء السكرول/التحريك
  var renderBusy = false;
  var pendingRender = false;
  function softWrapRender(){
    var orig = window.render;
    if(typeof orig !== 'function' || orig._smoothWrapped) return;
    window.render = function(){
      /* The rendering itself is synchronous; the queue was causing repeated redraws. */
      if(renderBusy){ pendingRender = true; return; }
      renderBusy = true;
      pendingRender = false;
      try{ return orig.apply(this, arguments); }
      finally{
        var released = false;
        var release = function(){
          if(released) return;
          released = true;
          renderBusy = false;
          /* Follow-up requests are handled once at the caller side (nav-guard
             with a bounded retry) — re-queueing here created an endless loop
             that made the screen flicker and blocked tab switching. */
          pendingRender = false;
        };
        requestAnimationFrame(release);
        setTimeout(release, 250);
      }
    };
    window.render._smoothWrapped = true;
    window.render._orig = orig;
  }

  // تسريع getFilteredRows عبر كاش بسيط لمفاتيح الفلاتر
  function patchFilterCache(){
    // لا نعدّل المنطق الأصلي بقوة — فقط نقلل رسم البطاقات على الموبايل أثناء الصفحة الكبيرة
    try{
      var cards = document.getElementById('fleet-cards');
      if(cards && window.innerWidth > 900){
        // على الشاشات الكبيرة البطاقات مخفية غالباً — لا تبنِها لو مش ظاهرة
        var cs = window.getComputedStyle(cards);
        if(cs.display === 'none'){
          cards.setAttribute('data-skip-build','1');
        }
      }
    }catch(e){}
  }

  // سكرول الجدول: passive + لا تعيد bind في كل مرة
  document.addEventListener('scroll', function(){}, {passive:true, capture:true});

  function boot(){
    softWrapRender();
    setTimeout(softWrapRender, 800);
    setTimeout(softWrapRender, 2500);
    patchFilterCache();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
