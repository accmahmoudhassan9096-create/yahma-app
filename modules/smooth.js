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
      if(renderBusy){ pendingRender = true; return; }
      renderBusy = true;
      pendingRender = false;
      try{ return orig.apply(this, arguments); }
      finally{
        // احتياطي: rAF لا يُستدعى في تبويبة مخفية/خلفية، فتبقى renderBusy=true
        // إلى الأبد ويتعطّل كل رسم لاحق. الـ setTimeout يُحرّر البوابة في كل الحالات.
        var released = false;
        var release = function(){
          if(released) return;
          released = true;
          renderBusy = false;
          if(pendingRender){ pendingRender = false; window.render(); }
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
