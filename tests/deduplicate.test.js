const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadFleetView() {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {} }),
      querySelectorAll: () => [],
      documentElement: { classList: { add() {} } }
    },
    Array, Map, Set, String, Number, Boolean, JSON, Math, Date, parseInt, parseFloat,
    normalizePlateKey: (p) => String(p || '')
      .replace(/[ً-ْ]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/\s+/g, '')
      .replace(/[-_]/g, '')
      .trim()
      .toLowerCase(),
    YahmaFleetCore: {
      readinessStats: () => ({ total: 0, ready: 0, out: 0 }),
      uniqueFieldValues: () => [],
      optionList: () => ''
    },
    currentRole: 'admin',
    escapeHtml: (s) => String(s || ''),
    readinessStats: () => ({ total: 0, ready: 0, out: 0 }),
    vehicleReadiness: () => ({ label: 'جاهز' }),
    licenseState: () => ({ label: 'ساري' }),
    inspectionState: () => ({ label: 'ساري' }),
    cardState: () => ({ label: 'ساري' })
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const code = read('modules/fleet-view.js');
  vm.runInContext(code, vm.createContext(sandbox));
  return sandbox;
}

test('لا توجد مكررات في أسطول سياراته فريدة', () => {
  const s = loadFleetView();
  const list = [
    { id: '1', plate: 'أ ب ج 1234', serial: 'SN100', brand: 'تويوتا' },
    { id: '2', plate: 'د هـ و 5678', serial: 'SN200', brand: 'هيونداي' }
  ];
  const res = s.window.yahmaFindDuplicates(list);
  assert.strictEqual(res.clusters.length, 0);
  assert.strictEqual(res.totalDupsCount, 0);
  assert.strictEqual(res.plan.length, 0);
});

test('اكتشاف السيارات المكررة بنفس اللوحة تماماً', () => {
  const s = loadFleetView();
  const list = [
    { id: '1', plate: 'أ ب ج 1234', brand: 'تويوتا', branch: 'الرياض', updatedAt: '2026-10-01' },
    { id: '2', plate: 'أ ب ج 1234', brand: 'تويوتا', branch: 'جدة', notes: 'سليمة', updatedAt: '2026-10-10' }
  ];
  const res = s.window.yahmaFindDuplicates(list);
  assert.strictEqual(res.clusters.length, 1);
  assert.strictEqual(res.totalDupsCount, 1);
  assert.strictEqual(res.plan.length, 1);
  // السيارة 2 لها نقاط أعلى (فيها ملاحظات وأحدث) فيتم اختيارها كـ keeper
  assert.strictEqual(res.plan[0].keeper.id, '2');
  assert.strictEqual(res.plan[0].duplicates[0].id, '1');
});

test('اكتشاف السيارات المكررة باختلاف المسافات والأرقام العربية والهمزات', () => {
  const s = loadFleetView();
  const list = [
    { id: '1', plate: 'أ ب ج ١٢٣٤', brand: 'كيا' },
    { id: '2', plate: 'ا ب ج 1234', brand: 'كيا' }
  ];
  const res = s.window.yahmaFindDuplicates(list);
  assert.strictEqual(res.clusters.length, 1);
  assert.strictEqual(res.totalDupsCount, 1);
});

test('اكتشاف السيارات المكررة بالرقم التسلسلي (الشاسيه)', () => {
  const s = loadFleetView();
  const list = [
    { id: '1', plate: 'أ أ أ 1111', serial: 'CHASSIS999' },
    { id: '2', plate: 'ب ب ب 2222', serial: 'CHASSIS999' }
  ];
  const res = s.window.yahmaFindDuplicates(list);
  assert.strictEqual(res.clusters.length, 1);
  assert.strictEqual(res.totalDupsCount, 1);
});

test('تجاهل الأرقام التسلسلية الفارغة والافتراضية (بدون، 0، لا يوجد)', () => {
  const s = loadFleetView();
  const list = [
    { id: '1', plate: 'س س س 1111', serial: 'بدون' },
    { id: '2', plate: 'ص ص ص 2222', serial: 'بدون' },
    { id: '3', plate: 'ع ع ع 3333', serial: '0' },
    { id: '4', plate: 'ف ف ف 4444', serial: 'لا يوجد' }
  ];
  const res = s.window.yahmaFindDuplicates(list);
  assert.strictEqual(res.clusters.length, 0);
  assert.strictEqual(res.totalDupsCount, 0);
});
