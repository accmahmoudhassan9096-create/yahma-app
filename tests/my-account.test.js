/* Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø´Ø§Ø´Ø© Â«Ø¨ÙŠØ§Ù†Ø§ØªÙŠÂ» â€” Ø§Ù„ØªØ­Ù‚Ù‚ ÙˆØ§Ù„Ù‚ÙˆØ§Ø¹Ø¯.
   Ù†ÙØ³ Ù†Ù‡Ø¬ Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª: Ø¨Ù†Ø­Ù…Ù‘Ù„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ ÙÙŠ sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadModule() {
  const sandbox = { console, window: null, alert: function () {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = undefined;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'modules', 'my-account.js'), 'utf8'),
    sandbox,
    { filename: 'my-account.js' }
  );
  return sandbox.YahmaMyAccount;
}

const M = loadModule();

/* ===== Ø±Ù‚Ù… Ø§Ù„Ù‡ÙˆÙŠØ© (Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©: 10 Ø£Ø±Ù‚Ø§Ù…) ===== */
test('Ø±Ù‚Ù… Ø§Ù„Ù‡ÙˆÙŠØ©: 10 Ø£Ø±Ù‚Ø§Ù…', () => {
  assert.strictEqual(M.validate({ national_id: '' }), '', 'ÙØ§Ø¶ÙŠ Ù…Ù‚Ø¨ÙˆÙ„');
  assert.strictEqual(M.validate({}), '', 'ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ Ù…Ù‚Ø¨ÙˆÙ„');
  assert.strictEqual(M.validate({ national_id: '1234567890' }), '', '10 Ø£Ø±Ù‚Ø§Ù… ØµØ­');
  assert.ok(M.validate({ national_id: '123456789' }), '9 Ø£Ø±Ù‚Ø§Ù… Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ national_id: '12345678901' }), '11 Ø±Ù‚Ù… Ù…Ø±ÙÙˆØ¶');
  /* Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…ØµØ±ÙŠ 14 Ø±Ù‚Ù… ÙƒØ§Ù† Ù…Ù‚Ø¨ÙˆÙ„ Ù‚Ø¨Ù„ â€” Ù„Ø§Ø²Ù… ÙŠØªØ±ÙØ¶ Ø¯Ù„ÙˆÙ‚ØªÙŠ */
  assert.ok(M.validate({ national_id: '29801011234567' }), '14 Ø±Ù‚Ù… Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ national_id: 'Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©Ù ' }), 'Ø£Ø±Ù‚Ø§Ù… Ø¹Ø±Ø¨ÙŠØ© Ù…Ø±ÙÙˆØ¶Ø©');
  assert.ok(M.validate({ national_id: '12345a7890' }), 'Ø­Ø±Ù Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ national_id: '1234 567890' }), 'Ù…Ø³Ø§ÙØ§Øª Ù…Ø±ÙÙˆØ¶Ø©');
  assert.ok(M.validate({ national_id: '123-4567890' }), 'Ø´Ø±Ø·Ø© Ù…Ø±ÙÙˆØ¶Ø©');
});

/* ===== Ø§Ù„Ø¬ÙˆØ§Ù„ (Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©: 10 Ø£Ø±Ù‚Ø§Ù… ØªØ¨Ø¯Ø£ Ø¨Ù€05) ===== */
test('Ø§Ù„Ø¬ÙˆØ§Ù„: 10 Ø£Ø±Ù‚Ø§Ù… ØªØ¨Ø¯Ø£ Ø¨Ù€05', () => {
  assert.strictEqual(M.validate({ phone: '' }), '');
  assert.strictEqual(M.validate({ phone: '0512345678' }), '', '05 + 8 Ø£Ø±Ù‚Ø§Ù…');
  assert.strictEqual(M.validate({ phone: '0501234567' }), '', '050 Ù…Ù‚Ø¨ÙˆÙ„');
  assert.strictEqual(M.validate({ phone: '0599999999' }), '', '0599 Ù…Ù‚Ø¨ÙˆÙ„');
  assert.ok(M.validate({ phone: '0412345678' }), '04 Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ phone: '0612345678' }), '06 Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ phone: '5012345678' }), 'Ù…Ù† ØºÙŠØ± 0 Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ phone: '051234567' }), '9 Ø£Ø±Ù‚Ø§Ù… Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ phone: '05123456789' }), '11 Ø±Ù‚Ù… Ù…Ø±ÙÙˆØ¶');
  /* ØµÙŠØº ÙƒØ§Ù†Øª Ù…Ù‚Ø¨ÙˆÙ„Ø© Ù‚Ø¨Ù„ ÙˆÙ„Ø§Ø²Ù… ØªØ±ÙØ¶ */
  assert.ok(M.validate({ phone: '+966512345678' }), 'ØµÙŠØºØ© Ø¯ÙˆÙ„ÙŠØ© Ù…Ø±ÙÙˆØ¶Ø©');
  assert.ok(M.validate({ phone: '051 234 5678' }), 'Ù…Ø³Ø§ÙØ§Øª Ù…Ø±ÙÙˆØ¶Ø©');
  assert.ok(M.validate({ phone: 'abc' }), 'Ø­Ø±ÙˆÙ Ù…Ø±ÙÙˆØ¶Ø©');
});

/* ===== ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯ ===== */
test('ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯: ÙÙŠ Ø§Ù„Ù…Ø§Ø¶ÙŠ ÙˆÙ…Ø¹Ù‚ÙˆÙ„', () => {
  assert.strictEqual(M.validate({ birth_date: '' }), '');
  assert.strictEqual(M.validate({ birth_date: '1990-05-17' }), '');
  assert.ok(M.validate({ birth_date: '2999-01-01' }), 'Ø§Ù„Ù…Ø³ØªÙ‚Ø¨Ù„ Ù…Ø±ÙÙˆØ¶');
  assert.ok(M.validate({ birth_date: '1899-12-31' }), 'Ù‚Ø¨Ù„ 1900 Ù…Ø±ÙÙˆØ¶');
  /* Ø§Ù„Ù†Ù‡Ø§Ø±Ø¯Ø© Ù…Ø³Ù…ÙˆØ­Ø© â€” Ù…ÙÙŠØ´ Ø­Ø¯ Ø¨ÙŠØªÙˆÙ„Ø¯ Ø¨Ø§Ù„Ù„ÙŠÙ„ */
  const t = new Date();
  const s = t.getFullYear() + '-' + (t.getMonth() < 9 ? '0' : '') + (t.getMonth() + 1) +
    '-' + (t.getDate() < 10 ? '0' : '') + t.getDate();
  assert.strictEqual(M.validate({ birth_date: s }), '', 'Ø§Ù„Ù†Ù‡Ø§Ø±Ø¯Ø© Ù…Ø³Ù…ÙˆØ­Ø©');
});

/* ===== ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ===== */
test('ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±: Ù„Ø§Ø²Ù… Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙˆØ§Ù„ØªØ£ÙƒÙŠØ¯ Ù…Ø·Ø§Ø¨Ù‚', () => {
  assert.strictEqual(M.validatePassword('old1234', 'new12345', 'new12345'), '', 'Ø§Ù„Ù…Ù‚Ø¨ÙˆÙ„');
  assert.ok(M.validatePassword('', 'new12345', 'new12345'), 'Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ù…Ø·Ù„ÙˆØ¨Ø©');
  assert.ok(M.validatePassword('old1234', 'short', 'short'), 'Ù‚ØµÙŠØ±Ø© Ù…Ø±ÙÙˆØ¶Ø©');
  assert.ok(M.validatePassword('old1234', 'new12345', 'different'), 'Ø§Ù„ØªØ£ÙƒÙŠØ¯ Ù…Ø´ Ù…Ø·Ø§Ø¨Ù‚');
  assert.ok(M.validatePassword('old1234', 'old1234', 'old1234'), 'Ù†ÙØ³ Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ù…Ø±ÙÙˆØ¶Ø©');
  assert.strictEqual(M.validatePassword('old1234', '12345678', '12345678'), '',
    '8 Ø­Ø±ÙˆÙ Ø¨Ø§Ù„Ø¸Ø¨Ø· Ù…Ù‚Ø¨ÙˆÙ„Ø© â€” Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù…Ø´ Ø£ÙƒØ¨Ø±');
});

/* ===== Ø§Ù„ØªÙˆØ§ÙÙ‚ Ù…Ø¹ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© =====

   âš ï¸ Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© Ø¨Ø§Ù„Ù†Øµ ÙƒØ§Ù†Øª Ù‡ØªØ¶Ù„Ù‘Ù„Ù†Ø§: ØªØ¹Ø¨ÙŠØ± Ø§Ù„Ø¬ÙˆØ§Ù„ ÙÙŠ JS Ù…ÙƒØªÙˆØ¨
   [0-9 -] ÙˆÙÙŠ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© [0-9 \-] â€” Ù†ÙØ³ Ø§Ù„Ù…Ø¹Ù†Ù‰ Ø¨Ø§Ù„Ø¸Ø¨Ø·ØŒ Ù…Ø®ØªÙ„Ù
   Ø§Ù„ØªÙ‡Ø±ÙŠØ¨. ÙØ§Ù„Ù…Ù‚Ø§Ø±Ù†Ø© Ø§Ù„Ù†ØµÙŠØ© ÙƒØ§Ù†Øª Ù‡ØªÙØ´Ù„ ÙˆØªØ®Ù„Ù‘ÙŠÙ†Ø§ Ù†ØµÙ„Ù‘Ø­ Ù†Øµ Ø³Ù„ÙŠÙ….

   ÙØ¨Ù†Ù‚Ø§Ø±Ù† **Ø§Ù„Ø³Ù„ÙˆÙƒ**: Ù†ÙØ³ Ø§Ù„Ø¹ÙŠÙ†Ø© Ù…Ù† Ø§Ù„Ù‚ÙŠÙ…ØŒ Ù†ÙØ³ Ø§Ù„Ø­ÙƒÙ….
   Ø¯Ù‡ Ø¨ÙŠÙ„Ù‚Ø· Ø£ÙŠ Ø§Ø®ØªÙ„Ø§Ù Ø­Ù‚ÙŠÙ‚ÙŠ ÙÙŠ Ø§Ù„Ù…Ø¹Ù†Ù‰ ÙˆÙŠØ¹Ø¯Ù‘ÙŠ Ø§Ø®ØªÙ„Ø§Ù Ø§Ù„ØªÙ‡Ø±ÙŠØ¨. */
function sqlPatternOf(label) {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const m = new RegExp(label + " ~ '([^']+)'").exec(sql);
  assert.ok(m, 'Ù‚ÙŠØ¯ ' + label + ' Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©');
  return new RegExp(m[1].replace(/\\\\/g, '\\'));
}

const SAMPLES = [
  '0512345678', '0501234567', '0412345678', '0612345678', '5012345678',
  '051234567', '05123456789', '+966512345678', '051 234 5678', '051-2345678',
  '0512a45678', '0599999999', '0000000000', '0021234567'
];

test('Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¬ÙˆØ§Ù„ ÙÙŠ JS Ø¨ØªÙ‚Ø¨Ù„ Ù†ÙØ³ Ø§Ù„Ø¹ÙŠÙ†Ø© Ø§Ù„Ù„ÙŠ Ø¨ØªÙ‚Ø¨Ù„Ù‡Ø§ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©', () => {
  const sqlRe = sqlPatternOf('phone');
  const jsRe = new RegExp(M.PHONE_RE.source);
  let compared = 0;
  SAMPLES.forEach((s) => {
    /* Ù†ÙØ³ Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯: Ø§Ù„ÙØ±Ø§Øº Ù…Ø³Ù…ÙˆØ­ ÙˆÙ†Ø¹ØªØ¨Ø±Ù‡ Â«Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯Â» */
    if (s === '' || s.trim() === '') return;
    const probe = s.trim();
    assert.strictEqual(jsRe.test(probe), sqlRe.test(probe),
      'Ø§Ø®ØªÙ„Ø§Ù Ø¹Ù„Ù‰ Â«' + probe + 'Â» Ø¨ÙŠÙ† JS ÙˆØ§Ù„Ù‚Ø§Ø¹Ø¯Ø©');
    compared++;
  });
  assert.ok(compared >= 10, 'Ù‚Ø§Ø±Ù†Øª ' + compared + ' Ù‚ÙŠÙ…Ø©');
});

const NID_SAMPLES = [
  '1234567890', '123456789', '12345678901', '29801011234567',
  'Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©Ù ', '12345a7890', '1234 567890', '0000000000', '1010101010'
];

test('Ù‚Ø§Ø¹Ø¯Ø© Ø±Ù‚Ù… Ø§Ù„Ù‡ÙˆÙŠØ© ÙÙŠ JS Ø¨ØªÙ‚Ø¨Ù„ Ù†ÙØ³ Ø§Ù„Ø¹ÙŠÙ†Ø©', () => {
  const sqlRe = sqlPatternOf('national_id');
  const jsRe = new RegExp(M.NATIONAL_ID_RE.source);
  let compared = 0;
  NID_SAMPLES.forEach((s) => {
    assert.strictEqual(jsRe.test(s), sqlRe.test(s), 'Ø§Ø®ØªÙ„Ø§Ù Ø¹Ù„Ù‰ Â«' + s + 'Â»');
    compared++;
  });
  assert.ok(compared >= 8, 'Ù‚Ø§Ø±Ù†Øª ' + compared + ' Ù‚ÙŠÙ…Ø©');
});

test('Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„Ø«Ù„Ø§Ø«Ø© Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  assert.ok(/national_id ~ '/.test(sql), 'Ù‚ÙŠØ¯ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚ÙˆÙ…ÙŠ');
  assert.ok(/phone ~ '/.test(sql), 'Ù‚ÙŠØ¯ Ø§Ù„Ø¬ÙˆØ§Ù„');
  assert.ok(sql.includes('birth_date <= current_date'), 'Ù‚ÙŠØ¯ ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯');
  assert.ok(sql.includes("birth_date > date '1900-01-01'"), 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„Ù…ÙŠÙ„Ø§Ø¯');
});

test('Ø­Ø§Ø±Ø³ Ø§Ù„Ø£Ø¹Ù…Ø¯Ø© Ø¨ÙŠÙ‚ÙÙ„ Ø§Ù„Ø¯ÙˆØ± ÙˆØ§Ù„ÙØ±Ø¹ ÙˆØ§Ù„Ø£Ù‚Ø³Ø§Ù… ÙˆØ§Ù„Ø¨Ø±ÙŠØ¯', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const flat = sql.replace(/\s+/g, ' ');
  ['role', 'branch_name', 'allowed_tabs', 'email', 'id'].forEach((col) => {
    assert.ok(flat.includes('new.' + col + ' is distinct from old.' + col),
      'Ø§Ù„Ø¹Ù…ÙˆØ¯ ' + col + ' Ù…Ù‚ÙÙˆÙ„ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø¹Ø§Ø¯ÙŠ');
  });
  /* ÙˆØ§Ù„Ù„ÙŠ Ù…ÙØªÙˆØ­ Ù„Ø§Ø²Ù… ÙŠÙƒÙˆÙ† Ø´Ø®ØµÙŠ Ø¨Ø³ */
  ['national_id', 'birth_date', 'phone'].forEach((col) => {
    assert.ok(flat.indexOf('new.' + col + ' is distinct') === -1,
      col + ' Ù…ÙØªÙˆØ­ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… â€” Ù…Ø§ ÙŠØªÙ‚ÙÙ„Ø´');
  });
});

/* Ø§Ù„ØªÙ†Ø¶ÙŠÙ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ÙƒØªØ§Ø¨Ø©: Ø§Ù„Ø­Ù‚Ù„ Ø¨ÙŠÙ‚Ø¨Ù„ Ù„ØµÙ‚ Ù†Øµ ÙÙŠÙ‡ Ù…Ø³Ø§ÙØ§Øª ÙˆØ´Ø±Ø·Ø§Øª
   ÙˆØ§Ù„Ø­Ø±ÙˆÙØŒ ÙÙŠØ´ÙŠÙ„Ù‡Ø§ ÙÙˆØ±Ù‹Ø§. Ø§Ù„Ø´Ø§Ø´Ø© Ù„Ùˆ Ø³Ø§Ø¨ØªÙ‡Ø§ Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙƒØ§Ù† Ù‡ÙŠÙƒØªØ¨
   Â«051-234 5678Â» ÙˆØ§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ù‡ØªØ±ÙØ¶Ù‡ Ø¨Ø±Ø³Ø§Ù„Ø© Ø¨Ø¹Ø¯ Ù…Ø§ ÙŠØ¶ØºØ· Ø­ÙØ¸. */
test('Ø§Ù„ØªÙ†Ø¶ÙŠÙ Ø¨ÙŠØ´ÙŠÙ„ ÙƒÙ„ Ø­Ø§Ø¬Ø© ØºÙŠØ± Ø§Ù„Ø£Ø±Ù‚Ø§Ù…', () => {
  const mk = (max) => {
    const el = { value: '', maxLength: max, selectionStart: 0,
                 setSelectionRange(a, b) { this.selectionStart = a; this._b = b; } };
    return el;
  };
  const nid = mk(10);
  nid.value = '101-010 1010'; M.digitsOnly(nid);
  assert.strictEqual(nid.value, '1010101010', 'Ø´Ø±Ø·Ø© ÙˆÙ…Ø³Ø§ÙØ§Øª Ø´ÙÙŠÙ„Øª');

  const phone = mk(10);
  phone.value = '+966512345678'; M.digitsOnly(phone);
  /* Ø§Ù„Ø¹Ù„Ø§Ù…Ø© Ø¨ØªØ´Ø§Ù„ ÙˆØ§Ù„Ø¨Ø§Ù‚ÙŠ ÙŠÙØ¶Ù„ Ø²ÙŠ Ù…Ø§ Ù‡Ùˆ â€” Ø§Ù„Ù‚Øµ Ø§Ù„ØµØ§Ù…Øª Ø§ØªØ´Ø§Ù„ØŒ
     ÙÙ€validate Ù‡Ùˆ Ø§Ù„Ù„ÙŠ Ø¨ÙŠØ±ÙØ¶ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø·ÙˆÙŠÙ„. */
  assert.strictEqual(phone.value, '966512345678', 'Ø§Ù„Ø¹Ù„Ø§Ù‚Ø© Ø§ØªØ´Ø§Ù„Øª ÙˆØ§Ù„Ø¨Ø§Ù‚ÙŠ Ø²ÙŠ Ù…Ø§ Ù‡Ùˆ');
  assert.ok(M.validate({ phone: phone.value }), 'ÙˆØ§Ù„ØªÙ†Ø¶ÙŠÙ Ù„ÙˆØ­Ø¯Ù‡ Ù…Ø§ Ø¨ÙŠØ³Ù…Ø­Ø´ Ø¨Ø±Ù‚Ù… Ø£Ø·ÙˆÙ„');

  const arabic = mk(10);
  arabic.value = 'Ù Ù¥Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨'; M.digitsOnly(arabic);
  assert.strictEqual(arabic.value, '0512345678', 'Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø§ØªØ­ÙˆÙ„Øª ÙˆØ§ØªÙ‚Ø¨Ù„Øª');
});

/* â›” Ø§Ù„Ø¨Ø§Ø¬ Ø¯Ù‡ Ø§ØªÙ„Ù‚Ø· Ø¨Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¹Ù„Ù‰ Ø§Ù„Ø¥Ù†ØªØ§Ø¬:
   Ø§Ù„ÙƒÙˆØ¯ ÙƒØ§Ù† Ø¨ÙŠÙ‚Øµ Ø£ÙŠ Ø±Ù‚Ù… Ø£Ø·ÙˆÙ„ Ù…Ù† maxLength. Ù„ØµÙ‚ Ø¬ÙˆØ§Ù„ 11 Ø®Ø§Ù†Ø© ÙƒØ§Ù†
   Ø¨ÙŠÙ†ØªÙ‡ÙŠ Ø¨Ù€10 Ø®Ø§Ù†Ø§Øª ÙˆÙŠØªØ®Ø²Ù‘Ù† ØºÙ„Ø· â€” ÙˆØ§Ù„Ø´Ø§Ø´Ø© Ø¨ØªÙ‚ÙˆÙ„ Â«ØªÙ… Ø§Ù„Ø­ÙØ¸Â».
   Ø§Ù„Ø±Ù‚Ù… Ø§Ù„ØºÙ„Ø· Ø§Ù„Ù…ØªØ®Ø²Ù‘Ù† Ø£Ø³ÙˆØ£ Ø¨ÙƒØªÙŠØ± Ù…Ù† Ø±ÙØ¶ Ø§Ù„Ù„ØµÙ‚. */
test('Ø§Ù„ØªÙ†Ø¶ÙŠÙ Ù…Ø§ Ø¨ÙŠÙ‚ØµÙ‘Ø´ Ø§Ù„Ø·ÙˆÙ„ Ø¨ØµÙ…Øª â€” Ø§Ù„ØªØ­Ù‚Ù‚ Ù‡Ùˆ Ø§Ù„Ù„ÙŠ ÙŠÙ…Ù†Ø¹', () => {
  const el = { value: '', maxLength: 10, selectionStart: 0,
               setSelectionRange(a, b) { this.selectionStart = a; this._b = b; } };
  el.value = '05123456789';        /* 11 Ø®Ø§Ù†Ø© */
  M.digitsOnly(el);
  assert.strictEqual(el.value.length, 11, 'Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø·ÙˆÙŠÙ„ Ø§ØªØ±Ùƒ Ø²ÙŠ Ù…Ø§ Ù‡Ùˆ');
  /* ÙÙ€validate Ù„Ø§Ø²Ù… ÙŠØ±ÙØ¶Ù‡ â€” ÙˆØ¯Ù‡ Ø§Ù„Ù„ÙŠ Ø¨ÙŠÙ…Ù†Ø¹ Ø§Ù„ØªØ®Ø²ÙŠÙ† */
  assert.ok(M.validate({ phone: el.value }), 'Ø§Ù„ØªØ­Ù‚Ù‚ ÙŠØ±ÙØ¶ 11 Ø®Ø§Ù†Ø© Ø¬ÙˆØ§Ù„');
  assert.ok(M.validate({ national_id: '12345678901' }), 'Ø§Ù„ØªØ­Ù‚Ù‚ ÙŠØ±ÙØ¶ 11 Ø®Ø§Ù†Ø© Ù‡ÙˆÙŠØ©');
});

test('Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ÙˆØ§Ø­Ø¯ ÙÙŠ ÙƒÙ„ Ø§Ù„Ø´Ø§Ø´Ø§Øª', () => {
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const auth = fs.readFileSync(path.join(ROOT, 'core', 'auth-boot.js'), 'utf8');
  const mine = fs.readFileSync(path.join(ROOT, 'modules', 'my-account.js'), 'utf8');
  assert.ok(M.MIN_PASSWORD >= 8, 'Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ 8 Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„');
  assert.ok(topbar.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'Ù†Ù…ÙˆØ°Ø¬ Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ³ØªØ®Ø¯Ù… Ù†ÙØ³ Ø§Ù„Ø­Ø¯');
  assert.ok(auth.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'Ø´Ø§Ø´Ø© Ø§Ø³ØªØ¹Ø§Ø¯Ø© ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø¨Ù†ÙØ³ Ø§Ù„Ø­Ø¯');
  assert.ok(mine.includes("MIN_PASSWORD = " + M.MIN_PASSWORD), 'Ø§Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¨Ù†ÙØ³ Ø§Ù„Ø­Ø¯');
});

/* Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ø¨ØªÙ‚Ø±Ø£ ØµÙ profile ÙˆØ§Ø­Ø¯ ÙˆØªØ¹Ø±Ø¶Ù‡. Ù„Ùˆ Ø§Ù„Ø£Ø¹Ù…Ø¯Ø©
   Ø§Ù„Ø´Ø®ØµÙŠØ© Ù…Ø´ ÙÙŠ Ø§Ù„Ø§Ø³ØªØ¹Ù„Ø§Ù… Ù…Ø´ Ù‡ØªØ¸Ù‡Ø± Ø®Ø§Ù„Øµ Ù…Ù‡Ù…Ø§ Ø§ØªÙƒØªØ¨Øª ÙÙŠ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©. */
test('Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ø¨ØªØ¬ÙŠØ¨ Ø§Ù„Ø£Ø¹Ù…Ø¯Ø© Ø§Ù„Ø´Ø®ØµÙŠØ© ÙˆØ¨ØªØ¹Ø±Ø¶Ù‡Ø§', () => {
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const select = /from\('profiles'\)\.select\(([^)]*)\)/.exec(topbar);
  assert.ok(select, 'ÙÙŠ Ø§Ø³ØªØ¹Ù„Ø§Ù… profiles');
  ['national_id', 'birth_date', 'phone'].forEach((col) => {
    assert.ok(select[1].includes(col), col + ' Ù…Ø´ ÙÙŠ Ø§Ù„Ø§Ø³ØªØ¹Ù„Ø§Ù… â€” Ù…Ø´ Ù‡ÙŠØ¸Ù‡Ø± Ù„Ù„Ù…Ø¯ÙŠØ±');
    assert.ok(topbar.includes('u.' + col), col + ' Ù…Ø´ Ø¨ÙŠØªÙ‚Ø±Ø£ Ù…Ù† Ø§Ù„ØµÙ');
  });
  /* ÙˆØ§Ù„Ù‚ÙŠÙ… Ø§Ù„ÙØ§Ø¶ÙŠØ© Ù„Ø§Ø²Ù… ØªÙ‚ÙˆÙ„ Â«Ù…Ø´ Ù…Ø³Ø¬Ù‘Ù„Â» Ù…Ø´ ØªØ¨Ù‚Ù‰ ÙØ±Ø§Øº ØµØ§Ù…Øª */
  assert.ok(topbar.includes('Ù…Ø´ Ù…Ø³Ø¬Ù‘Ù„'), 'ÙÙŠÙ‡ Ù†Øµ ÙˆØ§Ø¶Ø­ Ù„Ù„Ù‚ÙŠÙ… Ø§Ù„ÙØ§Ø¶ÙŠØ©');
});

test('Ø§Ù„Ù…Ø¯ÙŠØ± ÙŠØ¹Ø¯Ù‘Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø´Ø®ØµÙŠØ© Ø¨Ù†ÙØ³Ù‡ â€” Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© ØªØ³Ù…Ø­ Ø¨ÙŠÙ‡', () => {
  /* trigger Ø¨ÙŠØ±Ø¬Ù‘Ø¹ Ø²ÙŠ Ù…Ø§ Ù‡Ùˆ Ù„Ùˆ Ø§Ù„Ù…Ø¯ÙŠØ±ØŒ ÙÙ…ÙÙŠØ´ Ù…Ø§Ù†Ø¹ ÙÙŠ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© */
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const flat = sql.replace(/\s+/g, ' ');
  assert.ok(/if v_admin then\s*return new;/.test(flat),
    'Ø§Ù„Ù…Ø¯ÙŠØ± ÙŠØ¹Ø¯Ù‘ÙŠ Ù…Ù† ØºÙŠØ± Ù‚ÙŠÙˆØ¯ â€” ÙˆØ¯Ù‡ Ø§Ù„Ù„ÙŠ ÙŠØ³Ù…Ø­Ù„Ù‡ ÙŠØ¹Ø¯Ù‘Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª');
  /* ÙˆØ§Ù„ÙˆØ§Ø¬Ù‡Ø© Ù„Ø§Ø²Ù… ØªØ¨Ø¹Øª Ø§Ù„Ø£Ø¹Ù…Ø¯Ø© Ù…Ø¹ Ø²Ø± Ø§Ù„Ø­ÙØ¸ */
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  assert.ok(/payload\.phone\s*=/.test(topbar) && /payload\.national_id\s*=/.test(topbar)
    && /payload\.birth_date\s*=/.test(topbar), 'Ø²Ø± Ø§Ù„Ø­ÙØ¸ Ø¨ÙŠØ¨Ø¹Øª Ø§Ù„Ø£Ø¹Ù…Ø¯Ø© Ø§Ù„Ø«Ù„Ø§Ø«Ø©');
});
