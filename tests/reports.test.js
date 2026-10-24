const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadReportsModule(customFleet, customPayments) {
  const sandbox = {
    console, Date, Math, JSON, Intl, Promise, RegExp, Set, Map, Array, Object, String, Number,
    setTimeout: () => 0, clearTimeout: () => {},
    escapeHtml: (s) => String(s == null ? '' : s),
    formatArabicDate: (v) => String(v || '—'),
    fleet: customFleet || [],
    yahmaGetFleet: () => (customFleet || []),
    YahmaUtils: {
      carStatusOut: (st) => st === 'خارج الأسطول',
      daysFromNow: (d) => 10,
      inspectionDisplayStatus: (st) => ({ label: st, level: st === 'تم الفحص' ? 'green' : 'red' }),
      textTag: (st) => ({ label: st, level: st === 'ساري' ? 'green' : 'red' }),
      regionOfBranch: () => 'central',
      REGION_DEFS: [{ id: 'central', label: 'المنطقة الوسطى' }]
    },
    YahmaReadiness: {
      vehicle: (c) => ({ ready: c.carStatus === 'متاحة للإيجار', label: c.carStatus, level: 'green', failed: [] })
    },
    YahmaPayments: customPayments || {
      localByStatus: (st) => st === 'pending' ? [{ id: 1, carId: 'car-1', requestedAt: '2026-10-20' }] : [],
      pendingList: () => [{ id: 2, carId: 'car-2', paidAt: '2026-10-21' }],
      renewedList: () => [{ id: 3, carId: 'car-3', paidAt: '2026-10-22', renewedAt: '2026-10-23' }],
      isRenewed: (p) => !!p.renewedAt
    },
    document: {
      getElementById: (id) => ({
        addEventListener: () => {},
        innerHTML: '',
        value: '',
        querySelectorAll: () => []
      })
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;

  vm.runInContext(read('modules/reports.js'), vm.createContext(sandbox), { filename: 'reports.js' });
  return sandbox;
}

test('modules/reports.js: يحتوي على 12 تقريراً كاملاً', () => {
  const sampleFleet = [
    {
      id: 'car-1', plate: '1111 أ ب ج', branch: 'فرع الرياض', carStatus: 'متاحة للإيجار',
      dailyRate: 150, odometer: 45000, year: 2023, brand: 'تويوتا', type: 'كامري',
      maintenanceCost: 600, workshop: 'مركز الصيانة 1', nextService: '2026-12-01', lastMaintenance: '2026-09-01',
      daysSinceMovement: 5, lastMovementDate: '2026-10-19', rentedDaysMonth: 22,
      companyName: 'شركة الوفاق', accountNo: 'ACC-101', owner: 'شركة الوفاق لتأجير السيارات',
      insuranceCompany: 'التعاونية', insuranceStatus: 'ساري', cardExpiry: '2027-01-01', licenseExpiry: '2027-01-01'
    },
    {
      id: 'car-2', plate: '2222 د هـ و', branch: 'فرع جدة', carStatus: 'مؤجرة',
      dailyRate: 200, odometer: 80000, year: 2022, brand: 'هيونداي', type: 'إلنترا',
      maintenanceCost: 1200, workshop: 'ورشة السلام', nextService: '2026-11-15', lastMaintenance: '2026-08-10',
      daysSinceMovement: 35, lastMovementDate: '2026-09-15', rentedDaysMonth: 10,
      companyName: 'شركة ذيب', accountNo: 'ACC-202', owner: 'شركة ذيب للتمويل',
      insuranceCompany: 'ميدغلف', insuranceStatus: 'منتهي', cardExpiry: '2026-05-01', licenseExpiry: '2026-05-01'
    },
    {
      id: 'car-3', plate: '3333 س ص ع', branch: 'فرع الرياض', carStatus: 'تحت الصيانة',
      dailyRate: 180, odometer: 110000, year: 2021, brand: 'نيسان', type: 'صني',
      maintenanceCost: 2500, workshop: 'مركز الصيانة 1', nextService: '2026-10-25', lastMaintenance: '2026-10-01',
      daysSinceMovement: 20, lastMovementDate: '2026-10-04', rentedDaysMonth: 15,
      companyName: 'شركة الوفاق', accountNo: 'ACC-101', owner: 'أحمد السعيد',
      insuranceCompany: 'التعاونية', insuranceStatus: 'ساري', cardExpiry: '2026-11-01', licenseExpiry: '2026-11-01'
    }
  ];

  const app = loadReportsModule(sampleFleet);
  assert.ok(app.YahmaReports, 'YahmaReports غير معرّف على window');
  assert.strictEqual(typeof app.YahmaReports.render, 'function', 'renderReports ليست دالة');

  // استخراج التقارير وفحص وجودها
  const code = read('modules/reports.js');
  const expectedReportIds = [
    'overview', 'readiness', 'pipeline', 'movement',
    'maintenance', 'companies', 'docs', 'states',
    'ages', 'ops', 'watch', 'transfers'
  ];

  expectedReportIds.forEach((id) => {
    assert.ok(code.includes(`id: '${id}'`), `التقرير ${id} غير مسجل في REPORTS`);
  });

  // تجربة رسم التقارير مع عنصر حاوية
  let lastHtml = '';
  const container = {
    set innerHTML(val) { lastHtml = val; },
    get innerHTML() { return lastHtml; },
    querySelector: () => null,
    querySelectorAll: () => []
  };

  app.YahmaReports.render(container);
  assert.ok(lastHtml.includes('rp-head'), 'لم يتم بناء رأس التقارير');
  assert.ok(lastHtml.includes('دورة الفحص والمدفوعات'), 'التقرير الجديد دورة الفحص غير موجود في الواجهة');
  assert.ok(lastHtml.includes('حركة الأسطول والراكدة'), 'التقرير الجديد حركة الأسطول غير موجود في الواجهة');
  assert.ok(lastHtml.includes('الصيانة والورش'), 'التقرير الجديد الصيانة والورش غير موجود في الواجهة');
  assert.ok(lastHtml.includes('الشركات والتأمين'), 'التقرير الجديد الشركات والتأمين غير موجود في الواجهة');
});
