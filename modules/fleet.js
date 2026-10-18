/*
 * modules/fleet.js — واجهة الأسطول العام (YahmaFleet)
 *
 * أوركستراتور خفيف: يبني FleetModule من fleet-core.js و fleet-view.js.
 *
 */
(function (global) {
  'use strict';

  const Core = global.YahmaFleetCore;
  const View = global.YahmaFleetView;
  if (!Core || !View) {
    console.error("fleet.js: fleet-core.js / fleet-view.js مش محمّلين قبله");
    return;
  }

  const FleetModule = {
    getAll: Core.getFleet,
    render: View.render,
    count: function () { return Core.getFleet().length; },
    readinessStats: Core.readinessStats,
    uniqueFieldValues: Core.uniqueFieldValues,
    optionList: Core.optionList,
    createFilterEngine: Core.createFilterEngine,
    async persist() {
      if (global.YahmaDB && global.YahmaDB.saveFleet) {
        await global.YahmaDB.saveFleet(Core.getFleet());
      } else if (typeof global.saveData === 'function') {
        await global.saveData();
      }
    },
    async exportExcel(filtered) {
      const list = filtered || Core.getFleet();
      if (global.YahmaExport && global.YahmaExport.excel) {
        await global.YahmaExport.excel(list);
      }
    },
    go() {
      try {
        global.currentTab = 'fleet';
        document.querySelector('.nav-item[data-tab="fleet"]')?.click();
        if (typeof global.render === 'function') global.render();
      } catch(e){yahmaErr(e,'fleet.js:756');}
    },
  };

  global.YahmaFleet = FleetModule;

})(window !== undefined ? window : this);

