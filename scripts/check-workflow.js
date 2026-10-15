/* ===== scripts/check-workflow.js — فحص بنية الـCI قبل ما يوصل GitHub =====

   الـworkflow الأول كان فيه غلطين، والاتنين اتكشفتوا بعد ما
   GitHub رفض الملف أو فشل التشغيل:

     1. تعليق JavaScript ‎/* ... *‎/ بدل #. YAML مالوش دي،
        وGitHub رفض الملف كله: "error in your yaml syntax".
     2. glob بين علامتي تنصيص على سطر run:. الـshell بيشوف
        النص الحرفي وNode بيقول "Could not find .../*.test.js".
        على ويندوز بيشتغل عشان PowerShell بيوسّعه، وعلى Linux لأ —
        فالسطر كان بيمشي محليًا وبيفشل على CI.

   الاتنين مبكّرين جدًا على CI. الفحص ده بياخد الكسر لوحده.

   مش parser كامل — فاحص بنيوي بالمعنى المفيد: tabs، تعليقات
   JS معلّقة، مفاتيح Actions المطلوبة، وglobs مقصوصة. */

'use strict';

const fs = require('fs');
const path = require('path');

/* بيقبل مسار كوسيط عشان نفس الفاحص يتشغّل على أي workflow،
   أو على ملف تالف معمول للتجربة، من غير تعديل الملف الأصلي. */
const FILE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', '.github', 'workflows', 'verify.yml');
const REQUIRED_KEYS = ['name:', 'on:', 'jobs:', 'runs-on:', 'steps:'];

if (!fs.existsSync(FILE)) {
  console.error('Missing: ' + FILE);
  process.exit(1);
}

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
const problems = [];

lines.forEach((raw, i) => {
  const ln = i + 1;
  if (!raw.trim()) return;

  if (/\t/.test(raw)) problems.push(ln + ': tab character — YAML indents with spaces only');

  if (/^\s*\/\*/.test(raw) || /^\s*\*\//.test(raw)) {
    problems.push(ln + ': JavaScript block comment — invalid in YAML, use #');
  }
  if (/\*\/\s*$/.test(raw)) problems.push(ln + ': trailing */ — invalid in YAML');

  const indent = raw.match(/^ */)[0].length;
  if (indent % 2 !== 0 && !/^\s*#/.test(raw)) {
    problems.push(ln + ': odd indentation (' + indent + ')');
  }

  const body = raw.slice(indent);
  if (/^\s*#/.test(raw)) return;
  if (!/^\s*-\s|^\s*[A-Za-z_][\w.-]*\s*:/.test(raw)) {
    problems.push(ln + ': not a comment, list item or key: ' + JSON.stringify(body.slice(0, 50)));
  }

  /* A bare glob on a run: line is correct - the shell expands it.
     Quoted is the bug: the shell never sees it, node gets the
     literal text, and it answers "Could not find". */
  const run = body.match(/^run:\s*(.*)$/);
  if (run && /["'][^"']*\*[^"']*["']/.test(run[1])) {
    problems.push(ln + ': glob inside quotes on a run: line — the shell will not expand it. Remove the quotes.');
  }
});

REQUIRED_KEYS.forEach((key) => {
  if (!src.includes(key)) problems.push('missing required key: ' + key);
});

if (problems.length) {
  console.error('Workflow check FAILED:');
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

console.log('Workflow check passed (' + lines.length + ' lines).');