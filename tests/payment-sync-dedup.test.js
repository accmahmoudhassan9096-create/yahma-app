/* ===== اختبارات منع انتقال السيارات التلقائي وإزالة التكرار بين التبويبات =====
 *
 * المشكلة التي تم حلها:
 * 1) عند عمل رفرش، السجلات القديمة من السيرفر كانت تعيد السيارة لحالات سابقة.
 * 2) markLicenseRenewed كانت تستدعي resolveCloudId الذي يبحث فقط عن status='pending'،
 *    بينما السيارة في حالة 'paid'، فكان التحديث يفشل ولا يصل إلى Supabase، فيعود
 *    الطلب إلى «تم الدفع» بعد الرفرش.
 * 3) sync() لم يكن يزيل التكرار بحسب car_id، فكانت السيارة تظهر في تبويبين في نفس الوقت.
 * 4) renewals-ui كانت تقرأ pendingIds من المفتاح القديم المهجور yahma-inspection-payments-v1.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAYMENTS_SRC = read('modules/payments-store.js');
const RENEWALS_SRC = read('modules/renewals-ui.js');
const BRANCHES_SRC = read('core/branches-store.js');

test('localAll تزيل التكرار بين الحالات بحيث لا تظهر نفس السيارة في pending و paid معًا', () => {
  assert.ok(/seenCarIds\.has\(cid\)/.test(PAYMENTS_SRC), 'localAll يجب أن تتحقق من عدم تكرار carId');
});

test('sync تزيل التكرار بأخذ أحدث سجل فقط لكل سيارة لمنع عودة الحالات القديمة بعد الرفرش', () => {
  assert.ok(/latestByCar\.has\(cid\)/.test(PAYMENTS_SRC), 'sync يجب أن تأخذ أحدث سجل لكل carId فقط');
});

test('resolveCloudId تبحث في pending و paid معًا لتمكين تحديث السجلات المدفوعة عند التجديد', () => {
  const fnMatch = /async function resolveCloudId[\s\S]*?limit\(1\);/.exec(PAYMENTS_SRC);
  assert.ok(fnMatch, 'resolveCloudId مفقودة');
  assert.ok(/in\('status',\s*\['pending',\s*'paid'\]\)/.test(fnMatch[0]),
    'resolveCloudId يجب أن تبحث في pending و paid');
});

test('renewals-ui تقرأ طابور الدفع من YahmaPayments.localAll لكي لا تعود سيارات تحت الدفع لتبويب الفحص', () => {
  assert.ok(/window\.YahmaPayments\.localAll/.test(RENEWALS_SRC),
    'readPaymentQueue يجب أن تعتمد على window.YahmaPayments.localAll');
});

test('fleetForTab لتبويب renewals يستبعد السيارات الموجودة في طابور الدفع', () => {
  assert.ok(/inPayment\.has\(String\(c\.id\)\)/.test(BRANCHES_SRC),
    'fleetForTab renewals يجب أن يستبعد السيارات الموجودة في طابور الدفع');
});
