/* ===== tests/deploy.test.js — اتساق إعداد النشر =====

   أخطاء بت obtaining cost كتير في الإعدادات:
   - اسم متغير بيئة غلط في التوثيق: الـEdge Function بتقرأ
     `Deno.env.get('X')` — لو التوثيق بيقول `Y`، الدالة هتشتغل
     بـundefined وتفشل برسالة غامضة وقت التشغيل بس.
   - رقم إصدار قديم في مكانين.
   - ملف مش موجود في الـprecache أو العكس.

   الاختبارات دي بتقارن الكود بالتوثيق — أي انحراف بيبان هنا
   بدل ما يبقى مفاجأة على السيرفر. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions');

/* ---------- متغيرات البيئة ---------- */

function envVarsUsed() {
  const used = new Map();   /* name → [files] */
  if (!fs.existsSync(FN_DIR)) return used;
  for (const dir of fs.readdirSync(FN_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = path.join(FN_DIR, dir.name, 'index.ts');
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/Deno\.env\.get\(\s*'([^']+)'\s*\)/g)) {
      const name = m[1];
      if (!used.has(name)) used.set(name, []);
      used.get(name).push(dir.name);
    }
  }
  return used;
}

function envVarsDocumented() {
  const src = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^([A-Z][A-Z0-9_]*)\s*=/gm)) names.add(m[1]);
  /* اللي متعلّق في تعليقات برضو (عشان التوثيق يقدر يشرحهم) */
  for (const m of src.matchAll(/^#\s*([A-Z][A-Z0-9_]*)\s*=/gm)) names.add(m[1]);
  return names;
}

test('كل متغير بيطلبه الـEdge Function موثّق في .env.example', () => {
  const used = envVarsUsed();
  const doc = envVarsDocumented();
  const missing = [];
  used.forEach((files, name) => {
    if (!doc.has(name)) missing.push(name + ' (في ' + files.join(', ') + ')');
  });
  assert.deepStrictEqual(missing, [],
    'متغيرات بيستخدمها الكود بس مش موثّقة — لوحدها الـdeployment بيفشل بصمت');
});

test('مفيش متغير موثّق بس مش مستعمل خالص', () => {
  const used = envVarsUsed();
  const doc = envVarsDocumented();
  /* YAHMA_APP_VERSION intentionally documented as a pointer */
  const ALLOWED_UNUSED = ['YAHMA_APP_VERSION'];
  const extra = [];
  doc.forEach((name) => {
    if (!used.has(name) && ALLOWED_UNUSED.indexOf(name) === -1) extra.push(name);
  });
  assert.deepStrictEqual(extra, [],
    'متغيرات موثّقة بس مفيش كود بيستخدمها — إما توثيق قديم أو كود ناقص');
});

test('أسماء متغيرات البيئة بالإنجليزي CamelCase/SNAKE متسقة', () => {
  const used = envVarsUsed();
  const bad = [];
  used.forEach((files, name) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) bad.push(name + ' (في ' + files.join(', ') + ')');
  });
  assert.deepStrictEqual(bad, [], 'أسماء متغيرات البيئة لازم تكون SNAKE_CASE');
});

/* ---------- رقم النسخة ---------- */

test('رقم نسخة الـSW ظاهر في مكان واحد بس', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/CACHE_NAME\s*=\s*'yahma-shell-v(\d+)'/);
  assert.ok(m, 'مفيش CACHE_NAME في sw.js');
  const version = Number(m[1]);

  /* التوثيق — README وDEPLOY — لازم ما فيهاش رقم نسخة قديم */
  for (const f of ['README.md', 'DEPLOY-CLOUDFLARE.md']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const stale = [...src.matchAll(/yahma-shell-v(\d+)/g)]
      .map((x) => Number(x[1]))
      .filter((n) => n !== version);
    assert.deepStrictEqual(stale, [],
      f + ' فيه رقم نسخة قديم (الحالي v' + version + ')');
  }
});

/* ---------- الـworkflow ---------- */

test('الـworkflow بيشغّل كل فحوصات المستودع', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'verify.yml'), 'utf8');
  ['node --test tests/*.test.js', 'scripts/check-shell.js', 'scripts/check-workflow.js']
    .forEach((cmd) => {
      assert.ok(yml.indexOf(cmd) > -1, 'الـworkflow لازم يشغّل: ' + cmd);
    });
  /* ⭐ مفيش نسخة node قديمة — Node 20 خلص عمره */
  assert.ok(!/node-version:\s*'?(1[0-9]|20)'?/.test(yml),
    'node-version في الـworkflow قديم — استخدم 22 أو 24');
  assert.ok(/node-version:\s*'2[2-9]'/.test(yml),
    'node-version لازم يكون 22 أو أحدث');
});
