(function (global) {
  'use strict';
  const Core = global.YahmaDashboardCore;
  const View = global.YahmaDashboardView;
  if (!Core || !View) {
    console.error('dashboard.js: dashboard-core.js / dashboard-view.js مش محمّلين قبله');
    return;
  }

function renderDashboard(content, context){
  const fleet = Array.isArray(context.fleet) ? context.fleet : [];
  const setCurrentTab = context.setCurrentTab;
  document.getElementById('topbar-title').textContent = 'يهماء لتأجير السيارات';
  document.getElementById('topbar-sub').textContent = 'منصة تحضير الأسطول للتأجير';

  const state = Core.computeDashboardState(fleet);
  content.innerHTML = View.dashboardTemplate(state);
  View.bindDashboardEvents(content, context, state);
}


  global.YahmaDashboard = { render: renderDashboard };
})(typeof window !== 'undefined' ? window : this);
