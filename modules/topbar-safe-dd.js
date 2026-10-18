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