/* ===== الأداء + أولوية تحميل YahmaDB + محرك الجدول ===== */
/* استُخرجت من app-core.js (السطور 3775-3916) ضمن تقسيم الملفات،
   ونُفّذ بنفس الترتيب السابق بالضبط (بعد app-core.js مباشرة). */

/* ===== yahma-perf-js ===== */

(function(){
  'use strict';
  if(window._yahmaPerf) return;
  window._yahmaPerf = true;

  function debounce(fn, ms){
    var t=null;
    return function(){
      var ctx=this, args=arguments;
      clearTimeout(t);
      t=setTimeout(function(){ fn.apply(ctx, args); }, ms);
    };
  }
  function throttle(fn, ms){
    var last=0, scheduled=null, ctx, args;
    return function(){
      ctx=this; args=arguments;
      var now=Date.now();
      var remain=ms-(now-last);
      if(remain<=0){
        last=now;
        fn.apply(ctx, args);
      } else if(!scheduled){
        scheduled=setTimeout(function(){
          scheduled=null; last=Date.now(); fn.apply(ctx, args);
        }, remain);
      }
    };
  }

  // لفّ render بـ debounce خفيف لمنع إعادة الرسم المتتالية
  function wrapRender(){
    var orig = window.render;
    if(typeof orig !== 'function' || orig._perfWrapped) return;
    var pending=false, lastArgs=null, lastThis=null;
    function run(){
      pending=false;
      try{ orig.apply(lastThis, lastArgs||[]); }
      catch(e){ console.error('render', e); }
    }
    var debounced=debounce(run, 50);
    window.render = function(){
      lastThis=this; lastArgs=arguments;
      if(pending){ debounced(); return; }
      pending=true;
      // أول استدعاء فوري تقريبًا، والتالي يتجمّع
      if(typeof requestAnimationFrame==='function'){
        requestAnimationFrame(function(){ debounced(); });
      } else {
        debounced();
      }
    };
    window.render._perfWrapped = true;
    window.render._orig = orig;
  }

  // بحث عام: debounce
  function tuneGlobalSearch(){
    var input = document.getElementById('global-search') || document.getElementById('global-search-input');
    if(!input || input._perfTuned) return;
    input._perfTuned = true;
    // listeners already exist; we intercept via input event capture with debounce flag
  }

  // scroll/resize passive + throttle close handlers already exist
  try{
    var opts={passive:true, capture:true};
    // لا نضيف مستمعين جدد للـ scroll إن أمكن — فقط نتأكد
  }catch(e){}

  // تقليل عمل الإشعارات عند تبويب مخفي
  document.addEventListener('visibilitychange', function(){
    window._yahmaHidden = document.hidden;
  });

  // content-visibility support hint
  if(CSS && CSS.supports && CSS.supports('content-visibility', 'auto')){
    document.documentElement.classList.add('cv-ok');
  }

  // تعطيل backdrop-filter على أجهزة ضعيفة (تقريبي)
  try{
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    if(cores <= 4 || mem <= 4){
      document.documentElement.classList.add('yahma-lite');
    }
  }catch(e){}

  function boot(){
    wrapRender();
    // أعد اللف بعد تحميل سكربتات أخرى قد تستبدل render
    setTimeout(wrapRender, 500);
    setTimeout(wrapRender, 2000);
    setTimeout(wrapRender, 5000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();



/* ===== YahmaDB load preference (after core defines loadData) ===== */
(function(){
  if(!window.YahmaDB) return;
  const origLoad = typeof _loadDataImpl === 'function' ? _loadDataImpl : null;
  // Prefer IndexedDB on first paint if fleet empty
  window.YahmaDB.ready.then(async function(){
    try{
      if((!Array.isArray(window.fleet) || !window.fleet.length) && typeof window.YahmaDB.loadFleet==='function'){
        const rows = await window.YahmaDB.loadFleet();
        if(rows && rows.length){
          window.fleet = rows;
          if(typeof fleet !== 'undefined') fleet = rows;
          if(typeof render === 'function') render();
        }
      }
    }catch(e){ console.warn('YahmaDB initial load', e); }
  });
})();


/* ===== stable table renderer (no virtual scroll) ===== */
(function(){
  function create(opts){
    var tbody = opts.tbody;
    var renderRow = opts.renderRow;
    var afterRender = opts.afterRender || function(){};
    var emptyHtml = opts.emptyHtml || '<tr><td colspan="'+(opts.colCount||10)+'"><div class="empty">لا توجد نتائج</div></td></tr>';
    var items = [];
    function paint(){
      if(!tbody) return;
      if(!items.length){ tbody.innerHTML = emptyHtml; afterRender(tbody, items, 0, 0); return; }
      tbody.innerHTML = items.map(function(it,i){ return renderRow(it,i); }).join('');
      afterRender(tbody, items, 0, items.length);
    }
    return { setItems:function(next){ items=Array.isArray(next)?next:[]; paint(); }, paint:paint, destroy:function(){} };
  }
  window.YahmaVTable = { create: create };
})();
