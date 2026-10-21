(function(){
  'use strict';
  if(window._yahmaSmoothFleet) return;
  window._yahmaSmoothFleet = true;

  // منع render متكرر أثناء السكرول/التحريك
  var renderBusy = false;
  var pendingRender = false;
  var pendingThis = null;
  var pendingArgs = null;
  var burst = 0;
  /* أقصى عدد إعادات في دفعة واحدة. الحماية من أي حلقة لانية:
     لو الرسم بيرسم نفسه بشكل متكرر، بنقف بعد الحد ده. */
  var MAX_BURST = 3;
  function softWrapRender(){
    var orig = window.render;
    if(typeof orig !== 'function' || orig._smoothWrapped) return;
    window.render = function(){
      /* ⭐ ما نسقطش الرسم — بنحفظه وننفّذه مرة واحدة لما يخلص الحالي.
         قبل كنا بنعمل pendingRender = true وبعدين release كانت
         بتمسحه (pendingRender = false) — فأي رسم جاي في أول إطار
         بعد رسم تاني كان بيضيع خلاص.

         النتيجة اللي المستخدم كان شايفها: يضغط تبويب، الـcurrentTab
         بيتغيّر في البيانات، بس الشاشة بتفضل على التبويب القديم
         (نفس العطل اللي-ops-intel.js حذّر منه). */
      if(renderBusy){
        pendingRender = true;
        pendingThis = this;
        pendingArgs = arguments;
        return;
      }
      renderBusy = true;
      pendingRender = false;
      try{ return orig.apply(this, arguments); }
      finally{
        var released = false;
        var release = function(){
          if(released) return;
          released = true;
          renderBusy = false;
          if(!pendingRender){ burst = 0; return; }
          pendingRender = false;
          if(burst >= MAX_BURST){ burst = 0; return; }
          burst++;
          try{ window.render.apply(pendingThis, pendingArgs || []); }
          catch(_){ /* الخطأ بيتبعت للـerror bus من جوه الـrender نفسه */ }
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
    }catch(e){yahmaErr(e,'smooth.js:49');}
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
