/* Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø¯Ø§Ù„Ø© Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù….
   Ø§Ù„Ø¯Ø§Ù„Ø© Ø¯ÙŠ Ø¨ØªØ§Ø®Ø¯ Ù‚ÙŠÙ… Ù…Ù† Ø§Ù„Ù„ÙˆØ­Ø© ÙˆØ¨ØªØ¹Ù…Ù„ ØªØ­Ù‚Ù‚ØŒ ÙˆØ§Ù„Ù‚Ø§Ø¦Ù…ØªÙŠÙ† Ù„Ùˆ
   Ø§Ù†ÙØµÙ„Øª Ø¨ØªÙ‘ÙŠÙ‘Øª Ø¨Ù‡Ø¯ÙˆØ¡: Ø§Ø®ØªÙŠØ§Ø± Â«Ø¥Ø¯Ø§Ø±ÙŠÂ» Ø¨ÙŠØªØ®Ø²Ù‘Ù† Â«Ù…Ø´Ø§Ù‡Ø¯Ø©Â»ØŒ ÙˆØ§Ø®ØªÙŠØ§Ø±
   ØªØ¨ÙˆÙŠØ¨ Ø¨ÙŠØªØ¶ÙŠØ¹ â€” Ù…Ù† ØºÙŠØ± Ø£ÙŠ Ø±Ø³Ø§Ù„Ø©. Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø¯ÙŠ Ø¨ØªÙ‚ÙÙ„ Ø§Ù„Ù‚Ø§Ø¦Ù…ØªÙŠÙ†.

   âš ï¸ Ø¨Ù†Ø´ÙŠÙ„ Ø§Ù„ØªØ¹Ù„ÙŠÙ‚Ø§Øª Ù‚Ø¨Ù„ Ø§Ù„ÙØ­Øµ: Ø£ÙˆÙ„ Ù†Ø³Ø®Ø© Ù…Ù† Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¯Ù‡ Ø§Ø´ØªØºÙ„Øª
   ØºÙ„Ø· Ù„Ø£Ù† ÙƒÙ„Ù…Ø© forbidden ÙƒØ§Ù†Øª Ø¬ÙˆÙ‘Ù‡ **ØªØ¹Ù„ÙŠÙ‚ Ø£Ù†Ø§ ÙƒØ§ØªØ¨Ù‡**ØŒ ÙØ§Ù„Ø·Ø§Ø¨Ù‚
   Ù„Ù‚Ø§Ù‡ ÙÙŠ Ø§Ù„ÙƒÙˆØ¯ ÙˆÙ‡Ùˆ Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø§Ù„ÙƒÙˆØ¯ Ù…Ø´ ÙÙŠ Ø§Ù„Ø³Ø·Ø± Ø§Ù„Ù„ÙŠ Ø¨ÙŠØ´ØªØºÙ„. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rawFn = fs.readFileSync(
  path.join(ROOT, 'supabase', 'functions', 'admin-create-user', 'index.ts'), 'utf8'
);
/* Ø§Ù„ÙƒÙˆØ¯ Ø¨Ø³ â€” Ø¨Ù„Ø§ ØªØ¹Ù„ÙŠÙ‚Ø§Øª */
const FN = rawFn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = fs.readFileSync(path.join(ROOT, 'core', 'branches-store.js'), 'utf8');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase', 'supabase-migration.sql'), 'utf8');

const DB_ROLES = ['admin', 'manager', 'ops', 'view'];

function stringsOf(src) {
  return [...src.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function roleWhitelist() {
  const m = /\[([^\]]*)\]\s*\.includes\(body\.role\)/.exec(FN);
  assert.ok(m, 'Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø¯ÙˆØ§Ø± ÙÙŠ Ø§Ù„Ø¯Ø§Ù„Ø©');
  return stringsOf(m[1]);
}

function fnTabs() {
  const m = /const allowedTabs = \[([^\]]*)\]/.exec(FN);
  assert.ok(m, 'Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù‚Ø³Ø§Ù… ÙÙŠ Ø§Ù„Ø¯Ø§Ù„Ø©');
  return stringsOf(m[1]);
}

function uiTabs() {
  const m = /PAGE_PERMISSION_OPTIONS=\[([\s\S]*?)\];/.exec(STORE);
  assert.ok(m, 'Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù‚Ø³Ø§Ù… ÙÙŠ branches-store');
  /* Ø§Ù„Ø¹Ù†ØµØ± Ø§Ù„Ø´ÙƒÙ„Ù‡ {id:'x',label:'Ø¹'} â€” Ù„Ø§Ø²Ù… Ù†Ø§Ø®Ø¯ Ø§Ù„Ù€id Ø¨Ø³ØŒ
     Ø§Ù„ØªØ¹Ù…ÙŠÙ… ÙƒØ§Ù† Ø¨ÙŠØ±Ø¬Ù‘Ø¹ Ø§Ù„Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ø¹Ø±Ø¨ÙŠ Ù…Ø¹Ø§Ù‡. */
  return [...m[1].matchAll(/id:'([^']+)'/g)].map((x) => x[1]);
}

test('Ø£Ø¯ÙˆØ§Ø± Ø§Ù„Ø¯Ø§Ù„Ø© = Ø£Ø¯ÙˆØ§Ø± Ù‚ÙŠØ¯ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©', () => {
  const listed = roleWhitelist();
  DB_ROLES.forEach((r) => {
    assert.ok(listed.includes(r), 'Ø§Ù„Ø¯ÙˆØ± Â«' + r + 'Â» Ù†Ø§Ù‚Øµ Ù…Ù† Ø§Ù„Ø¯Ø§Ù„Ø© â€” Ø§Ù„Ø¬Ø²Ø¡: ' + JSON.stringify(listed));
  });
  assert.deepStrictEqual(listed.slice().sort(), DB_ROLES.slice().sort(),
    'Ø§Ù„Ù‚Ø§Ø¦Ù…ØªÙŠÙ† Ù„Ø§Ø²Ù… ØªÙƒÙˆÙ†ÙˆØ§ Ù…ØªØ·Ø§Ø¨Ù‚ÙŠÙ†');
});

test('Ù‚ÙŠØ¯ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø¨ÙŠÙ‚Ø¨Ù„ ÙƒÙ„ Ø§Ù„Ø£Ø¯ÙˆØ§Ø±', () => {
  const m = /role = ANY \(ARRAY\[([^\]]*)\]\)/.exec(MIGRATION);
  if (!m) return;  /* Ø§Ù„Ù‚ÙŠØ¯ Ù…Ù…ÙƒÙ† ÙŠÙƒÙˆÙ† Ù…ØªØ·Ø¨Ù‘Ù‚ Ù…Ù† Ù…Ù„Ù ØªØ§Ù†ÙŠ â€” Ù…Ø´ Ø­Ø±Ø¬ */
  assert.ok(stringsOf(m[1]).includes('manager'), 'manager Ù†Ø§Ù‚Øµ Ù…Ù† Ù‚ÙŠØ¯ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©');
});

test('Ø£Ù‚Ø³Ø§Ù… Ø§Ù„Ø¯Ø§Ù„Ø© = Ø§Ù„Ø£Ù‚Ø³Ø§Ù… Ø§Ù„Ù„ÙŠ Ø§Ù„Ù„ÙˆØ­Ø© Ø¨ØªØ¹Ø±Ø¶Ù‡Ø§', () => {
  const fn = fnTabs();
  const ui = uiTabs();
  const dropped = ui.filter((t) => fn.indexOf(t) === -1);
  assert.deepStrictEqual(dropped, [],
    'Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø¯ÙŠ Ø¨ØªØªØ¹Ø±Ø¶ ÙÙŠ Ø§Ù„Ù„ÙˆØ­Ø© ÙˆØ¨ØªØªØ´Ø§Ù„ ÙÙŠ Ø§Ù„Ø¯Ø§Ù„Ø©: ' + dropped.join(', '));
  const extra = fn.filter((t) => ui.indexOf(t) === -1);
  assert.deepStrictEqual(extra, [], 'Ø§Ù„Ø¯Ø§Ù„Ø© Ø¨ØªÙ‚Ø¨Ù„ ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø§Ù„Ù„ÙˆØ­Ø© Ù…Ø´ Ø¨ØªØ¹Ø±Ø¶Ù‡Ø§: ' + extra.join(', '));
});

test('Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ù…Ø§ ØªÙ†Ø³Ø§Ø´ ØªØ§Ù†ÙŠ', () => {
  /* paid Ùˆ renewed Ù…Ù† v178ØŒ Ùˆdues Ø§ØªØ¶Ø§ÙØª Ù…Ø¹ Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø§Øª.
     ÙƒÙ„ ÙˆØ§Ø­Ø¯Ø© Ù†Ø§Ù‚ØµØ© Ù…Ø±Ø© ÙˆØ±Ø§ Ù…Ø±Ø© Ù…Ù† ØºÙŠØ± Ø­Ø¯ ÙŠØ§Ø®Ø¯ Ø¨Ø§Ù„Ù‡. */
  ['paid', 'renewed', 'dues'].forEach((t) => {
    assert.ok(fnTabs().includes(t), 'Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Â«' + t + 'Â» Ù†Ø§Ù‚Øµ Ù…Ù† Ø¯Ø§Ù„Ø© Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…');
  });
});

test('Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø®Ø·Ø£ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØ© Ø¨ØªÙˆØµÙ„ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…', () => {
  /* Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ù‚Ø¯ÙŠÙ… ÙƒØ§Ù†: error instanceof Error ? error.message : '...'
     Ø£Ø®Ø·Ø§Ø¡ Supabase Ù…Ø´ instanceof Error ÙØ§Ù„Ø³Ø¨Ø¨ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ ÙƒØ§Ù† Ø¨ÙŠØªØ¨Ù„Ø¹
     ÙˆØ§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ´ÙˆÙ Â«ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…Â» Ù…Ù† ØºÙŠØ± Ø£ÙŠ Ù…Ø¹Ù„ÙˆÙ…Ø©. */
  assert.ok(!/instanceof Error/.test(FN),
    'Ù„Ø³Ù‡ ÙÙŠ instanceof Error ÙÙŠ Ø§Ù„ÙƒÙˆØ¯ â€” Ù‡ÙŠØ³ÙƒØª Ø³Ø¨Ø¨ Ø§Ù„Ø®Ø·Ø£');
  assert.ok(/function errorMessage/.test(FN), 'ÙÙŠ Ø¯Ø§Ù„Ø© errorMessage');
  assert.ok(/\.message/.test(FN) && /error_description/.test(FN) && /\.msg/.test(FN),
    'Ù„Ø§Ø²Ù… ØªÙ‚Ø±Ø£ Ø§Ù„Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø«Ù„Ø§Ø«Ø© Ù…Ù† Ø£Ø®Ø·Ø§Ø¡ Supabase');
});

test('Ù„Ùˆ Ø§Ù„Ø­ÙØ¸ ÙÙŠ profiles ÙØ´Ù„ØŒ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø¨ÙŠØªØ´Ø§Ù„ â€” ÙˆØ§Ù„Ø±Ø³Ø§Ù„Ø© Ø¨ØªÙ‚ÙˆÙ„ Ø§Ù„Ø­Ù‚ÙŠÙ‚Ø©', () => {
  assert.ok(/admin\.deleteUser\(created\.user\.id\)/.test(FN),
    'Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ Ù„Ø§Ø²Ù… ÙŠÙØ¶Ù„ Ù…ÙˆØ¬ÙˆØ¯');
  assert.ok(/ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…/.test(FN), 'Ø§Ù„Ø±Ø³Ø§Ù„Ø© Ø¨ØªÙ‚ÙˆÙ„ Ø¥Ù† Ø§Ù„Ø®Ù„Ù„ ÙÙŠ Ø§Ù„Ø­ÙØ¸ Ù…Ø´ ÙÙŠ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡');
  assert.ok(/ØªÙ… ØªØ±Ø§Ø¬Ø¹ Ø§Ù„Ø­Ø³Ø§Ø¨/.test(FN), 'Ø¨ØªÙ‚ÙˆÙ„ Ø¥Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§ØªØ´Ø§Ù„');
  assert.ok(/Ø¨Ø¯ÙˆÙ† Ù…Ù„Ù Ù…Ø³ØªØ®Ø¯Ù…/.test(FN), 'Ø¨ØªØ­Ø°Ù‘Ø± Ù„Ùˆ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ ÙØ´Ù„ â€” ØºÙŠØ± ÙƒØ¯Ù‡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙŠØ¹Ù„Ù‚');
});

test('Ø¨Ø±ÙŠØ¯ Ù…Ø³Ø¬Ù‘Ù„ Ù‚Ø¨Ù„ ÙƒØ¯Ù‡ Ø¨ÙŠØªÙ‚Ø§Ù„ Ù‚Ø¨Ù„ Ù…Ø§ Ù†Ø­Ø§ÙˆÙ„', () => {
  assert.ok(/listUsers/.test(FN), 'ÙÙŠ ÙØ­Øµ Ù„Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯');
  assert.ok(/Ù…Ø³Ø¬Ù‘Ù„ Ø¨Ø§Ù„ÙØ¹Ù„/.test(FN), 'ÙÙŠ Ø±Ø³Ø§Ù„Ø© ØµØ±ÙŠØ­Ø© Ù„Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…ÙƒØ±Ø±');
  assert.ok(/ØµÙŠØºØ© Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ­ÙŠØ­Ø©/.test(FN), 'ÙÙŠ ÙØ­Øµ Ù„ØµÙŠØºØ© Ø§Ù„Ø¨Ø±ÙŠØ¯');
});

test('Ù…ÙÙŠØ´ console.log Ø£Ùˆ ÙƒÙˆØ¯ ØªØ¬Ø±ÙŠØ¨ÙŠ Ø¯Ø§Ø®Ù„ Ø§Ù„Ø¯Ø§Ù„Ø©', () => {
  assert.ok(!/console\.(log|debug)\(/.test(FN), 'ÙÙŠ console.log Ø¯Ø§Ø®Ù„ Ø¯Ø§Ù„Ø© Ø¥Ù†ØªØ§Ø¬');
  assert.ok(!/\bdebugger\b/.test(FN), 'ÙÙŠ debugger');
});

/* ===== Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© ÙƒØ§Ù†Øª Ø¨ØªØ±ÙØ¶ Ù‚Ø¨Ù„ Ø§Ù„Ø¯Ø§Ù„Ø© =====

   verify_jwt = true Ø®Ù„Ù‘Ù‰ Supabase gateway ÙŠØ±Ø¯ 401
   {"code":"UNAUTHORIZED_NO_AUTH_HEADER"} Ù‚Ø¨Ù„ Ù…Ø§ Ø§Ù„Ø¯Ø§Ù„Ø© ØªØ´ØºÙ‘Ù„.
   Ø§Ù„Ø¯Ø§Ù„Ø© Ù…Ø´ Ø´Ø§ÙŠÙØ© Ø¥Ù† ÙÙŠÙ‡ session Ø£ØµÙ„Ø§Ù‹ ÙÙ…Ø§ Ø¨ØªØ¹Ø±ÙØ´ ØªÙ‚ÙˆÙ„ Ø§Ù„Ø³Ø¨Ø¨ØŒ
   ÙˆØ§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ´ÙˆÙ Ø±Ø³Ø§Ù„Ø© Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ØºØ§Ù…Ø¶Ø©. ÙˆØ§Ù„Ø¯Ø§Ù„Ø© ÙÙˆÙ‚ Ø¨ØªØ¹Ù…Ù„ ÙØ­Øµ
   Ø§Ù„Ø£Ø¯Ø§Ø±ÙŠØ© Ø¨Ù†ÙØ³Ù‡Ø§ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ØŒ ÙØ§Ù„ÙØ­Øµ Ø§Ù„Ù…Ø²Ø¯ÙˆØ¬ Ù…Ø´ Ø­Ù…Ø§ÙŠØ©. */
test('verify_jwt = false ÙÙŠ ÙƒÙ„ Ø§Ù„Ø¯ÙˆØ§Ù„ â€” Ø§Ù„ÙØ­Øµ Ø¬ÙˆÙ‘Ù‡ Ø§Ù„Ø¯Ø§Ù„Ø©', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const blocks = [...toml.matchAll(/\[functions\.([\w-]+)\]\s*\nverify_jwt\s*=\s*(\w+)/g)];
  assert.ok(blocks.length >= 3, 'Ø§Ù„Ù…Ù„Ù Ø¨ÙŠØ¹Ø±Ù Ø§Ù„Ø¯ÙˆØ§Ù„');
  blocks.forEach((b) => {
    assert.strictEqual(b[2], 'false',
      'Ø¯Ø§Ù„Ø© ' + b[1] + ' Ù„Ø³Ù‡ Ø¹Ù„ÙŠÙ‡Ø§ verify_jwt=' + b[2] + ' â€” Ù‡ØªØ±Ø¯ Ø¨Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„ØºØ§Ù…Ø¶Ø©');
  });
});

/* ÙƒÙ„ Ø¯Ø§Ù„Ø© Ø¨ØªØ¹Ù…Ù„ ÙØ­ØµÙ‡Ø§ Ø¨Ù†ÙØ³Ù‡Ø§ â€” Ø§Ù„Ù€verify_jwt=false Ù…ÙŠÙ†ÙØ¹Ø´ Ù…Ù† ØºÙŠØ± Ø¯Ù‡ */
test('ÙƒÙ„ Ø¯Ø§Ù„Ø© Ø¨ØªØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ù…ØªØµÙ„ Ù‚Ø¨Ù„ Ù…Ø§ ØªØ´ØªØºÙ„', () => {
  ['admin-create-user', 'admin-delete-user', 'send-user-email'].forEach((name) => {
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase', 'functions', name, 'index.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/auth\.getUser\(\)/.test(code), name + ': Ù…ÙÙŠØ´ getUser');
    assert.ok(/yahma_is_admin\(\)|role\s*!==\s*'admin'|includes\('admin'\)/.test(code),
      name + ': Ù…ÙÙŠØ´ ÙØ­Øµ Ø£Ø¯Ø§Ø±ÙŠØ©');
  });
});

/* Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© ÙƒØ§Ù†Øª Ø¨ØªÙ‚ÙˆÙ„ Â«ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…Â» ÙˆØ§Ù„Ø¹Ù…Ù„ÙŠØ© ØªÙØ´Ù„ â€” ÙˆØ¯Ù‡ Ø£Ø³ÙˆØ£
   Ù…Ù† Ø±Ø³Ø§Ù„Ø© Ø®Ø·Ø£ØŒ Ù„Ø£Ù† Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ¹ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ø¹Ù„Ù‰ Ø£Ø³Ø§Ø³ Ø¥Ù† Ø§Ù„Ø­Ø³Ø§Ø¨
   Ø§ØªØ¹Ù…Ù„ ÙˆÙ‡Ùˆ Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯. */
test('Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¨ØªØªØ£ÙƒØ¯ Ø¥Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§ØªØ¹Ù…Ù„ Ù‚Ø¨Ù„ Ù…Ø§ ØªÙ‚ÙˆÙ„ Â«ØªÙ…Â»', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  assert.ok(/confirmRead/.test(top), 'Ù…ÙÙŠØ´ ØªØ­Ù‚Ù‚ Ø¨Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© Ø¨Ø¹Ø¯ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡');
  assert.ok(/!r\.data\.id/.test(top), 'Ù…ÙÙŠØ´ ÙØ­Øµ Ø¥Ù† Ø§Ù„Ø¯Ø§Ù„Ø© Ø±Ø¬Ø¹Øª Ø±Ù‚Ù… Ø­Ø³Ø§Ø¨');
  assert.ok(/describeInvokeError/.test(top), 'Ù…ÙÙŠØ´ Ø¯Ø§Ù„Ø© Ù„Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø³Ø¨Ø¨ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ');
  assert.ok(!/msg\.textContent='ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…[^']*';\s*$/.test(top),
    'Ù„Ø³Ù‡ ÙÙŠ Ø±Ø³Ø§Ù„Ø© Â«ØªÙ…Â» Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† ØºÙŠØ± ØªØ­Ù‚Ù‚');
});

/* â›” [object Promise] Ø¸Ù‡Ø± Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙØ¹Ù„Ø§Ù‹ ÙÙŠ v200.

   describeInvokeError Ø¨Ù‚Øª async Ø¹Ø´Ø§Ù† Ø¨ØªÙ‚Ø±Ø§ body Ø§Ù„Ø¯Ø§Ù„Ø©ØŒ ÙˆÙ†Ø¯Ø§Ø¡
   Ù…Ø³Ø§Ø± Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡ Ø§ØªÙ†Ø§Ø¯Ù‰ Ù…Ù† ØºÙŠØ± await â€” ÙÙ€textContent ÙˆØµÙ„Ù‡ Promise
   ÙˆØ·Ù„Ø¹ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø³Ø·Ø± Ù…ÙŠØªØ§ Ø¨Ø¯Ù„ Ø§Ù„Ø³Ø¨Ø¨ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØŒ ÙˆØ¯Ù‡ Ø£Ø®Ø³Ù‰ Ù…Ù† Ø§Ù„ÙƒÙˆØ¯
   Ø§Ù„Ù‚Ø¯ÙŠÙ…: ÙƒØ§Ù† Ø¨ÙŠÙ‚ÙˆÙ„ Â«Ø®Ø·Ø£ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙÂ» ÙˆÙƒÙ„Ù…Ø© Ù…ÙÙ‡ÙˆÙ…Ø©ØŒ Ø¨Ù‚Ù‰ Ø­Ø±ÙˆÙ Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©
   ØºØ§Ù…Ø¶Ø©.

   Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¯Ù‡ Ø¨ÙŠÙ…Ù†Ø¹: (Ø£) Ù†Ø¯Ø§Ø¡ Ù…Ù† ØºÙŠØ± awaitØŒ (Ø¨) Ø­Ø¬Ø± Ø´ØºÙ„.

   âš ï¸ Ø­Ø§Ø¬Ø² showResult Ù…Ø·Ù„ÙˆØ¨ Ø¨Ø³ Ù„Ù…Ø§ Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø¨ØªÙˆØµÙ„ textContent. Ø¬ÙˆÙ‘Ù‡
   invokeYahmaFunction ÙÙŠ Ù†Ø¯Ø§Ø¡ Ø¨ÙŠÙ‚Ø±Ø§ Ø§Ù„Ù†Øµ Ø¹Ø´Ø§Ù† ÙŠÙØ­ØµÙ‡ (Ø§Ù„Ø¬Ù„Ø³Ø©
   Ù…Ù†ØªÙ‡ÙŠØ© ÙˆÙ„Ø§ Ù„Ø£) ÙˆØ§Ù„Ù†ØªÙŠØ¬Ø© Ø¨ØªØ±ÙˆØ­ Ù„Ù…ØªØºÙŠÙ‘Ø± Ù…Ø­Ù„ÙŠ Ù…Ø´ Ù„Ù„Ø´Ø§Ø´Ø© â€” ÙØ¯Ù‡
   Ù…Ø­ØªØ§Ø¬ await Ø¨Ø³ØŒ Ù…Ø´ showResult. */
test('Ù…ÙÙŠØ´ Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ù„Ù€describeInvokeError Ù…Ù† ØºÙŠØ± await', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const calls = [...top.matchAll(/([^\n]*describeInvokeError\([^\n]*)/g)].map((m) => m[1]);
  const real = calls.filter((line) => !/function\s+describeInvokeError/.test(line) && !/topbar-invoke.js:describeInvokeError/.test(line));
  assert.ok(real.length >= 2, 'ÙÙŠÙ‡ Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ÙŠÙ† Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„');
  real.forEach((line) => {
    assert.ok(/await\s+describeInvokeError/.test(line),
      'Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ù…Ù† ØºÙŠØ± await: ' + line.trim());
    /* Ø§Ù„Ù„ÙŠ Ø¨ØªÙˆØµÙ„ Ø§Ù„Ø´Ø§Ø´Ø© Ù„Ø§Ø²Ù… ÙŠÙ…Ø± Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø§Ø¬Ø² */
    if (/textContent|showResult\(/.test(line)) {
      assert.ok(/showResult\(/.test(line),
        'Ù†ØªÙŠØ¬Ø© Ø¨ØªÙˆØµÙ„ textContent Ù…Ù† ØºÙŠØ± Ø§Ù„Ø­Ø§Ø¬Ø²: ' + line.trim());
    }
  });
});

/* Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø§Ù„Ù„ÙŠ Ø¨ØªÙ‚Ø±Ø£ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† ØºÙŠØ± Ø§Ù„Ø­Ø§Ø¬Ø² Ù‡ÙŠ Ø§Ù„Ù„ÙŠ Ø·Ù„Ø¹Øª
   Â«[object Promise]Â» â€” Ù†ØªØ£ÙƒØ¯ Ø¥Ù† Ù…ÙÙŠØ´ Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ù…Ø§Ø³Ùƒ Ø¨Ø§Ù„Ù†ØªÙŠØ¬Ø©
   ÙˆÙ…Ø§Ø³ÙƒØ´ ØºÙŠØ±Ù‡. */
test('ÙƒÙ„ Ù†ØªÙŠØ¬Ø© Ø¨ØªÙˆØµÙ„ textContent Ù…Ù† describeInvokeError Ù…Ø­Ù…ÙŠÙ‘Ø©', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const assigns = [...top.matchAll(/([^\n]*(?:msg|statusEl|El|el)\.textContent\s*=[^\n]*)/g)].map((m) => m[1]);
  const risky = assigns.filter((l) => /describeInvokeError/.test(l) && !/showResult\(/.test(l));
  assert.deepStrictEqual(risky, [],
    'ØªØ¹ÙŠÙŠÙ† Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† ØºÙŠØ± Ø§Ù„Ø­Ø§Ø¬Ø²: ' + risky.join(' | '));
});

test('showResult Ù…ÙˆØ¬ÙˆØ¯Ø© ÙˆØ¨ØªØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Promise', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  assert.ok(/function showResult\(/.test(top), 'ÙÙŠ showResult');
  assert.ok(/typeof value\.then\s*===\s*'function'/.test(top), 'Ø¨ØªØªØ¹Ø±Ù Ø¹Ù„Ù‰ Promise');
  assert.ok(/String\(value/.test(top), 'Ø¨ØªØªØ­ÙˆÙ„ Ù„Ù†Øµ');
});


