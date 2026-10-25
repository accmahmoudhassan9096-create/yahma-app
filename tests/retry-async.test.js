/* إعادة المحاولة عند أول تحميل — «الأسطول طلع فاضي بعد الدخول»

   السبب: طلب السيارات الأول كان بيتم قبل ما جلسة Supabase تتجهز، أو
   الشبكة تقطع لحظة، فالتطبيق يستسلم ويعرض «لم تظهر البيانات» لحد ما
   المستخدم يعمل ريفرش بنفسه.

   الحل: modules/utils.js → retryAsync + استخدمها data.js في جلب
   الأسطول، وشبكة أمان في auth-boot.js لو الأسطول فضل فاضي. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function bootUtils() {
  const sandbox = { console, Date, Math, JSON, Intl, Promise, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('modules/utils.js'), ctx, { filename: 'modules/utils.js' });
  return sandbox;
}

const U = bootUtils();
const FAST = { attempts: 3, delays: [1, 1] };

test('retryAsync: نجاح من أول مرة — مفيش إعادة', async () => {
  let calls = 0;
  const value = await U.retryAsync(() => { calls += 1; return 'ok'; }, FAST);
  assert.strictEqual(value, 'ok');
  assert.strictEqual(calls, 1);
});

test('retryAsync: بتعيد بعد الخطأ وتنجح', async () => {
  let calls = 0;
  const value = await U.retryAsync(() => {
    calls += 1;
    if (calls < 3) throw new Error('شبكة');
    return 'ok';
  }, FAST);
  assert.strictEqual(value, 'ok');
  assert.strictEqual(calls, 3);
});

test('retryAsync: بترمي آخر خطأ بعد استهلاك المحاولات', async () => {
  let calls = 0;
  await assert.rejects(
    () => U.retryAsync(() => { calls += 1; throw new Error('فشل ' + calls); }, FAST),
    /فشل 3/
  );
  assert.strictEqual(calls, 3);
});

test('retryAsync: shouldRetry بتعيد على النتيجة الفاضية (0 سيارات)', async () => {
  let calls = 0;
  const value = await U.retryAsync(
    () => { calls += 1; return calls < 2 ? [] : ['car']; },
    {
      attempts: 3,
      delays: [1, 1],
      shouldRetry: info => !!info.error || !(Array.isArray(info.value) && info.value.length)
    }
  );
  assert.deepStrictEqual(value, ['car']);
  assert.strictEqual(calls, 2);
});

test('retryAsync: attempts=1 معناها محاولة واحدة بس', async () => {
  let calls = 0;
  await assert.rejects(
    () => U.retryAsync(() => { calls += 1; throw new Error('x'); }, { attempts: 1, delays: [1] }),
    /x/
  );
  assert.strictEqual(calls, 1);
});

test('جلب الأسطول بيعيد المحاولة — والشبكة الآمنة موجودة', () => {
  const data = read('modules/data.js');
  const boot = read('core/auth-boot.js');
  assert.ok(/retryAsync\(fetchOnce/.test(data), 'data.js مش بيستخدم retryAsync في جلب السيارات');
  assert.ok(/waitForSession\(client/.test(data), 'data.js مش بيستنى جلسة Supabase');
  assert.ok(/__yahmaSessionExpired = false/.test(data), 'علامة انتهاء الجلسة لازم تتشال بعد نجاح التحميل');
  assert.ok(/empty-retry/.test(boot), 'auth-boot.js مفيهوش إعادة تحميل لما الأسطول يفضل فاضي');
});
