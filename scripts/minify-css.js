/* Builds the minified CSS that actually ships.

   The source in css/ stays readable (with its Arabic comments — that is
   the documentation), and this script writes css/*.min.css, which is what
   index.html loads and the service worker caches.

   Why bother, when the files are local and Cloudflare gzips them anyway?
     · the browser parses ~40 KB less CSS on every cold start
     · the deploy is smaller
     · the source keeps its comments, so maintenance is not hurt

   usage: node scripts/minify-css.js
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');
/* اختياري: مجلد الإخراج (الاختبار بيولّد في مجلد مؤقت ويقارن) */
const OUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : CSS_DIR;

/* Minify without breaking the CSS. Deliberately conservative: it only
   removes comments and redundant whitespace, and never touches anything
   inside a string or a url(). */
function minifyCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    /* a comment */
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
      continue;
    }

    /* a string — copy it verbatim */
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    /* a url(...) — keep it verbatim (the path may contain characters we
       would otherwise touch) */
    if (/[uU]rl\(/.test(src.slice(i, i + 5))) {
      let depth = 0, j = i;
      while (j < n) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') { depth--; if (!depth) { j++; break; } }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    /* whitespace — a space between two parts of a SELECTOR must
       survive, or `.a .b` silently becomes `.a.b` (a different, much
       stricter selector) and `tr:nth-child(even) td` becomes
       `tr:nth-child(even)td`. That broke the whole layout once.

       So the space is only dropped where it can never matter: right
       after an opening bracket, or right before a closing one. */
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      const prev = out[out.length - 1];
      const next = src[j];
      const DROP_BEFORE = ',;{})(';
      const DROP_AFTER = ',;{[';
      const needSpace =
        prev && next &&
        DROP_BEFORE.indexOf(next) === -1 &&
        DROP_AFTER.indexOf(prev) === -1;
      if (needSpace) out += ' ';
      i = j;
      continue;
    }

    /* drop the last semicolon before a closing brace */
    if (c === ';') {
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '}') { i = j; continue; }
    }

    out += c;
    i++;
  }
  return out.trim() + '\n';
}

let totalIn = 0, totalOut = 0, count = 0;
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const name of fs.readdirSync(CSS_DIR).filter(n => n.endsWith('.css') && !n.endsWith('.min.css')).sort()) {
  const src = fs.readFileSync(path.join(CSS_DIR, name), 'utf8');
  const min = minifyCss(src);
  const outName = name.replace(/\.css$/, '.min.css');
  fs.writeFileSync(path.join(OUT_DIR, outName), min, 'utf8');
  totalIn += Buffer.byteLength(src);
  totalOut += Buffer.byteLength(min);
  count++;
  console.log('  ' + name + ' -> ' + outName + '  (' +
    (Buffer.byteLength(src) / 1024).toFixed(1) + ' KB -> ' +
    (Buffer.byteLength(min) / 1024).toFixed(1) + ' KB)');
}
console.log('CSS: ' + (totalIn / 1024).toFixed(1) + ' KB -> ' + (totalOut / 1024).toFixed(1) +
  ' KB  (توفير ' + ((totalIn - totalOut) / 1024).toFixed(1) + ' KB)');
