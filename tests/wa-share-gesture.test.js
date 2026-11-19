/* ============================================================
   tests/wa-share-gesture.test.js
   حماية من خطأ "واتساب بيفتح من غير PDF مرفق":
   لازم canShare يُفحص قبل أي await، وما نفتحش popup على الموبايل
   (window.open بيستهلك الـ user gesture وnavigator.share بيفشل).
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'core/pdf-share.js'), 'utf8');

function bodyOf(name) {
  const start = src.indexOf('async function ' + name + '(') >= 0
    ? src.indexOf('async function ' + name + '(')
    : src.indexOf('function ' + name + '(');
  let depth = 0, started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

test('sharePdfOnWhatsApp: canShare يُفحص قبل أول await', () => {
  const body = bodyOf('sharePdfOnWhatsApp');
  const canSharePos = body.indexOf('navigator.canShare({files:[probe]})');
  const firstAwait = body.indexOf('await ');
  assert.ok(canSharePos >= 0, 'مفيش فحص canShare');
  assert.ok(firstAwait >= 0, 'مفيش await');
  assert.ok(canSharePos < firstAwait, 'canShare لازم يتفحص قبل تجهيز PDF (داخل الـ gesture)');
});

test('sharePdfOnWhatsApp: واتساب بيترفع داخل الضغطة قبل أي await', () => {
  const body = bodyOf('sharePdfOnWhatsApp');
  const guard = body.indexOf('if(!canShareFiles && opts.openWaNow && phone)');
  const directOpen = body.indexOf("window.open(direct,'_blank'");
  const firstAwait = body.indexOf('await generateReportPdfBlob');
  assert.ok(guard >= 0, 'مفيش شرط فتح واتساب المبكر');
  assert.ok(directOpen >= 0, 'مفيش فتح مباشر لـ wa.me');
  assert.ok(directOpen < firstAwait, 'فتح واتساب لازم يكون قبل تجهيز PDF');
  assert.ok(!body.includes("about:blank"), 'ما ينفعش about:blank — لازم wa.me مباشرة');
});

test('sharePdfOnWhatsApp: navigator.share بالملف موجود', () => {
  const body = bodyOf('sharePdfOnWhatsApp');
  assert.ok(body.includes('navigator.share({files:[file]'), 'مفيش مشاركة ملف');
  assert.ok(body.includes("{type:'application/pdf'}"), 'الملف مش PDF');
});
