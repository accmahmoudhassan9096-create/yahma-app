(function(){
 function update(){
  const root=document.getElementById('quick-stats'); if(!root)return;
  let total=0,ready=0,openTasks=0;
  try{
   const list=Array.isArray(window.fleet)?window.fleet:[]; total=list.length;
   if(typeof vehicleReadiness==='function') list.forEach(c=>{if(vehicleReadiness(c).ready)ready++});
   if(typeof collectTasks==='function') openTasks=collectTasks().filter(t=>t.status!=='done').length;
  }catch(e){yahmaErr(e,'topbar-ui.js:300');}
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value)};
  set('quick-ready',ready); set('quick-review',Math.max(total-ready,0)); set('quick-tasks',openTasks);
 }
 function bind(){document.querySelectorAll('#quick-stats [data-stat-tab]').forEach(btn=>{if(btn._bound)return;btn._bound=true;btn.addEventListener('click',()=>{const tab=btn.dataset.statTab;document.querySelector(`.nav-item[data-tab="${tab}"]`)?.click()})})}
 function boot(){update();bind();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 setTimeout(function(){update();bind()},2000);
})();