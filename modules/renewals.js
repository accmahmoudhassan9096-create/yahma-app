(function (global) {
  'use strict';

  function getUninspectedCars(fleet, inspectionDisplayStatus) {
    const order = { red: 0, amber: 1, grey: 2, green: 3 };
    return fleet.filter(car => inspectionDisplayStatus(car.inspectionStatus).level !== 'green')
      .sort((a, b) => order[inspectionDisplayStatus(a.inspectionStatus).level] - order[inspectionDisplayStatus(b.inspectionStatus).level]);
  }

  function buildInspectionWhatsAppMessage(cars, inspectionDisplayStatus) {
    const list = cars || [];
    const lines = [
      '📋 *تقرير السيارات غير المفحوصة*',
      'التاريخ: ' + (global.YahmaUtils ? global.YahmaUtils.fmtDate(new Date()) : new Date().toISOString().slice(0, 10)),
      'العدد: *' + list.length + '* سيارة',
      '————————————'
    ];
    if (!list.length) {
      lines.push('✅ لا توجد سيارات تحتاج فحص حاليًا.');
    } else {
      list.forEach((car, index) => {
        const status = inspectionDisplayStatus(car.inspectionStatus);
        lines.push((index + 1) + ') ' + (car.plate || '—'));
        lines.push('   الفحص: ' + status.label + ' | الفرع: ' + (car.branch || '—'));
        if (car.owner && car.owner !== '—') lines.push('   المالك: ' + car.owner);
      });
    }
    lines.push('————————————', 'مرسل من نظام إدارة الأسطول');
    return lines.join('\n');
  }

  function carsToInspectionRows(cars, context) {
    return (cars || []).map(car => [
      car.plate || '—',
      car.brand || '—',
      car.branch || '—',
      car.owner || '—',
      car.carStatus || '—',
      context.inspectionDisplayStatus(car.inspectionStatus).label,
      context.licenseDisplayStatus(car.licenseExpiry).label,
      context.formatDate(car.licenseExpiry)
    ]);
  }

  global.YahmaRenewals = { getUninspectedCars, buildInspectionWhatsAppMessage, carsToInspectionRows };
})(window);
