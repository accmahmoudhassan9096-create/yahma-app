/* Vehicle readiness rules, independent from the dashboard renderer. */
(function (global) {
  'use strict';

  const utils = global.YahmaUtils;

  function vehicleReadiness(car) {
    car = car && typeof car === 'object' ? car : {};
    const checks = [];
    const add = (key, label, ok, level = 'red') => checks.push({ key, label, ok, level });
    add('card', 'الكارت', utils.dateStatus(car.cardExpiry).level === 'green' && !['ملغى', 'موقوف'].includes(String(car.cardStatus ?? '').trim()));
    add('license', 'الرخصة', utils.dateStatus(car.licenseExpiry).level === 'green' && !['ملغى', 'موقوف'].includes(String(car.licenseStatus ?? '').trim()));
    add('insurance', 'التأمين', utils.textTag(car.insuranceStatus).level === 'green');
    add('inspection', 'الفحص', utils.inspectionDisplayStatus(car.inspectionStatus).level === 'green');
    const carStatus = String(car.carStatus ?? '').trim();
    add('service', 'الصيانة', !carStatus.includes('صيانة') && !carStatus.includes('خارج') && !carStatus.includes('مسروق') && !carStatus.includes('محول') && !carStatus.includes('مفقود'));
    const status = carStatus;
    add('status', 'حالة السيارة', utils.carStatusReady(status));
    const failed = checks.filter(x => !x.ok);
    if (!car.id) return { level: 'grey', label: 'غير محددة', ready: false, checks, failed };
    if (failed.length === 0) return { level: 'green', label: 'جاهزة للتأجير', ready: true, checks, failed };
    if (failed.some(x => x.key === 'status' && (status.includes('خارج') || status.includes('مسروق') || status.includes('محول') || status.includes('مفقود')))) return { level: 'red', label: status.includes('مسروق') ? 'مسروقة' : (status.includes('مفقود') ? 'مفقودة' : (status.includes('محول') ? 'محولة غير مستلمة' : 'خارج الخدمة')), ready: false, checks, failed };
    if (failed.some(x => x.key === 'service')) return { level: 'amber', label: 'تحتاج صيانة', ready: false, checks, failed };
    if (failed.some(x => x.key === 'inspection')) return { level: 'amber', label: 'تحتاج فحص', ready: false, checks, failed };
    return { level: 'red', label: 'غير جاهزة', ready: false, checks, failed };
  }

  function readinessStats(cars) {
    const list = Array.isArray(cars) ? cars : [];
    const stats = { total: list.length, ready: 0, prep: 0, inspection: 0, maintenance: 0, out: 0, other: 0, reasons: {} };
    list.forEach(car => {
      const result = vehicleReadiness(car);
      if (result.ready) stats.ready++;
      else if (result.level === 'red' && result.label === 'خارج الخدمة') stats.out++;
      else if (result.label === 'تحتاج صيانة') stats.maintenance++;
      else if (result.label === 'تحتاج فحص') stats.inspection++;
      else stats.other++;
      result.failed.forEach(reason => { stats.reasons[reason.label] = (stats.reasons[reason.label] || 0) + 1; });
    });
    stats.pct = stats.total ? Math.round(stats.ready / stats.total * 1000) / 10 : 0;
    return stats;
  }

  function readinessReasons(stats) {
    return Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }

  global.YahmaReadiness = { vehicle: vehicleReadiness, stats: readinessStats, reasons: readinessReasons };
  global.vehicleReadiness = vehicleReadiness;
  global.readinessReasons = readinessReasons;
})(typeof window !== 'undefined' ? window : this);
