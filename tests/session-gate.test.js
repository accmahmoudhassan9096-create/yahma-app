/* Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¬Ù„Ø³Ø©.

   Ø§Ù„Ù…Ø´ÙƒÙ„Ø©: Ø§Ù„Ø¯Ø§Ù„Ø© Ø±Ø¯Ù‘Øª Â«Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ§Ù„Ø­Ø©Â» ÙˆØ§Ù„ÙˆØ§Ø¬Ù‡Ø© ÙˆÙ‚Ù‘ÙØª Ø¹Ù†Ø¯
   Ø§Ù„Ø±Ø³Ø§Ù„Ø©. Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù‚Ø§Ø¹Ø¯ Ù‚Ø¯Ø§Ù… Ø²Ø± Ù…ÙŠØªØŒ ÙˆØ§Ù„Ø³Ø¨Ø¨ Ù…Ø¹Ø±ÙˆÙØŒ Ø¨Ø³ Ù…Ø§ÙÙŠØ´ Ø·Ø±ÙŠÙ‚
   Ù„Ù„Ø®Ø±ÙˆØ¬ ØºÙŠØ± Ø¥Ù†Ù‡ ÙŠØ¯ÙˆØ± Ø¹Ù„Ù‰ Ø²Ø± ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ ÙÙŠ Ø§Ù„Ø±Ø§Ø³.

   Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ù„ÙŠ ÙÙŠ core/auth-boot.js Ø¨ØªØ¹Ù…Ù„ Ø§ØªÙ†ÙŠÙ†:

   Ø§Ø³ØªØ¨Ø§Ù‚ÙŠ â€” Ø¨ØªØ¬Ø¯Ø¯ Ø§Ù„ØªÙˆÙƒÙ† Ù„Ùˆ Ø´Ø§Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ Ù‚Ø¨Ù„ Ù…Ø§ Ù†Ø¨Ø¹ØªÙ‡.
              Ø¯ÙŠ Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù„ÙŠ ÙƒØ§Ù† Ù…Ù…ÙƒÙ† ØªØªØ­Ù„ Ù…Ù† ØºÙŠØ± Ù…Ø§ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…
              ÙŠØ­Ø³: Ø§Ù„ØªÙˆÙƒÙ† ÙƒØ§Ù† Ù‡ÙŠØªØ­Ø¯Ø« ÙÙŠ Ø§Ù„Ø®Ù„ÙÙŠØ© Ø¨Ø³ Ù†Ø¨Ø¹ØªÙ‡ Ø§ÙˆÙ„Ø§Ù‹.

   ØªÙØ§Ø¹Ù„ÙŠ â€” Ù„Ùˆ Ø§Ù„Ø±Ø¯ Ù†ÙØ³Ù‡ Ù‚Ø§Ù„ Ø¥Ù† Ø§Ù„Ø¬Ù„Ø³Ø© Ù…Ø´ ØµØ§Ù„Ø­Ø©ØŒ Ø¨ØªØ¹Ø±Ø¶ Ø²Ø±
              Â«ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„Â» Ø¬ÙˆÙ‘Ù‡ Ù†ÙØ³ Ø§Ù„Ø±Ø³Ø§Ù„Ø©.

   Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø¯ÙŠ Ø¨ØªØ­Ù…Ù‘Ù„ Ø§Ù„Ù…Ù„ÙÙŠÙ† ÙƒÙ…Ø§ Ù‡Ù…Ø§ ÙÙŠ node:vmØŒ ÙˆØ¨ØªØ­Ø§ÙƒÙŠ Ø¹Ù…ÙŠÙ„
   Supabase Ø¨Ù€Ù€stub Ø¨ÙŠØªØ­ÙƒÙ… ÙÙŠÙ‡ â€” Ø¹Ø´Ø§Ù† Ù†Ù‚Ø¯Ø± Ù†Ø®ØªØ¨Ø± Ø§Ù„ØªØ¬Ø¯ÙŠØ¯ ÙˆØ§Ù„Ø±ÙØ¶
   ÙˆØ§Ù„Ø¨Ø·Ø¡ ÙˆÙƒÙ„Ù‡Ù… Ù…Ù† ØºÙŠØ± Ø´Ø¨ÙƒØ©. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ===== Ø¹Ù…ÙŠÙ„ Supabase ÙˆÙ‡Ù…ÙŠ =====
   Ø¨ÙŠØªØ­ÙƒÙ… ÙÙŠ: ÙˆØ¬ÙˆØ¯ Ø¬Ù„Ø³Ø©ØŒ Ù‚Ø±Ø¨ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„ØªÙˆÙƒÙ†ØŒ Ù†Ø¬Ø§Ø­/ÙØ´Ù„ Ø§Ù„ØªØ¬Ø¯ÙŠØ¯ØŒ
   ÙˆØ§Ù„Ø±Ø¯ Ø§Ù„Ù„ÙŠ Ø§Ù„Ø¯Ø§Ù„Ø© Ù‡ØªØ±Ø¬Ù‘Ø¹Ù‡. */
function fakeSupabase(opts) {
  const o = opts || {};
  const calls = { getSession: 0, refresh: 0, invoke: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const session = o.noSession ? null : {
    user: { id: 'u1' },
    access_token: 'tok',
    expires_at: o.expiresIn === undefined ? nowSec + 3600 : nowSec + o.expiresIn
  };
  return {
    calls,
    auth: {
      getSession: async () => {
        calls.getSession++;
        if (o.getSessionThrows) throw new Error(o.getSessionThrows);
        return { data: { session }, error: null };
      },
      refreshSession: async () => {
        calls.refresh++;
        if (o.refreshFails) {
          return { data: { session: null }, error: { message: 'refresh_token_not_found' } };
        }
        if (o.refreshThrows) throw new Error(o.refreshThrows);
        return {
          data: { session: { user: { id: 'u1' }, access_token: 'fresh', expires_at: nowSec + 3600 } },
          error: null
        };
      },
      signOut: async () => ({ error: null })
    },
    functions: {
      invoke: async (name, args) => {
        calls.invoke++;
        if (o.invokeThrows) throw new Error(o.invokeThrows);
        if (o.invokeResult) return o.invokeResult;
        return { data: { id: 'new-user-id' }, error: null };
      }
    }
  };
}

/* ===== ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ù„ÙÙŠÙ† ÙÙŠ sandbox ÙˆØ§Ø­Ø¯ =====
   order in index.html: auth-boot (504) Ø«Ù… topbar-ui (521)ØŒ
   ÙØ¨Ù†Ø­Ù…Ù„Ù‡Ù… Ø¨Ù†ÙØ³ Ø§Ù„ØªØ±ØªÙŠØ¨ Ø¹Ø´Ø§Ù† ÙŠahmaEnsureFreshSession ÙŠØ¨Ù‚Ù‰ Ù…ÙˆØ¬ÙˆØ¯
   ÙˆÙ‚Øª Ù…Ø§ topbar-ui ÙŠØ´ØºÙ‘Ù„. */
function boot(opts) {
  const o = opts || {};
  const client = fakeSupabase(o);
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    location: { reload: () => { sandbox.__reloaded = true; } },
    Date,
    Math,
    JSON,
    Intl,
    Promise,
    Response,
    yahmaErr: function () {},
    YahmaData: { markSessionExpired: function (m) { sandbox.__marked = m; } }
  };
  /* auth-boot.js ÙÙŠÙ‡ IIFE Ø¨ÙŠØ¹Ù…Ù„ supabase.createClient ÙˆÙ‚Øª Ø§Ù„ØªØ­Ù…ÙŠÙ„
     ÙˆØ¨ÙŠØ­Ø· window.supabaseClient / supabaseReady. ÙÙ„Ø§Ø²Ù… Ù†Ø¯ÙŠÙ‡
     Â«SDKÂ» ÙˆØ¥Ù„Ø§ ØºÙŠØ± Ø¥Ù†Ù‡ Ù…Ø´ Ù‡ÙŠÙ„Ø§Ù‚ÙŠ Ø¹Ù…ÙŠÙ„ØŒ Ø§Ù„Ù€catch Ø¨ØªØ§Ø¹Ù‡ Ù‡ÙŠØ®Ù„ÙŠ
     supabaseReady=false ÙˆÙŠØ¨Ù‚Ù‰ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¨ÙŠØ®ØªØ¨Ø± Ø­Ø§Ø¬Ø© ØªØ§Ù†ÙŠØ© Ø®Ø§Ù„Øµ.

     createClient Ø¨ÙŠØ±Ø¬Ù‘Ø¹ Ù†ÙØ³ Ø§Ù„Ù€client Ø¹Ø´Ø§Ù† Ù†Ù‚Ø¯Ø± Ù†Ø¹Ø¯Ù‘ Ø¹Ù„ÙŠÙ‡. */
  if (!o.noClient) {
    sandbox.supabase = { createClient: function () { return client; } };
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const noop = function () {};
  /* textContent Ù„Ø§Ø²Ù… ÙŠÙ…Ø³Ø­ Ø§Ù„Ø£Ø¨Ù†Ø§Ø¡ Ø²ÙŠ Ø§Ù„Ù…ØªØµÙØ­ Ø¨Ø§Ù„Ø¸Ø¨Ø·. Ù…Ù† ØºÙŠØ± Ø¯Ù‡
     Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Â«Ù†Ø¯Ø§Ø¡ÙŠÙ† Ù…ØªØªØ§Ù„ÙŠÙŠÙ†Â» Ù‡ÙŠØ´ÙˆÙ Ø§ØªÙ†ÙŠÙ† Ø²Ø±Ø§Ø± Ø­ØªÙ‰ Ù„Ùˆ Ø§Ù„ÙƒÙˆØ¯
     Ø³Ø§Ù„Ø¨ ÙˆØ§Ø­Ø¯ â€” ÙŠØ¹Ù†ÙŠ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¨ÙŠØ­ÙƒÙ… Ø¹Ù„Ù‰ ÙˆÙ‡Ù…ÙŠØ© Ù…Ø´ Ø¹Ù„Ù‰ Ø§Ù„ÙƒÙˆØ¯. */
  const el = () => {
    const node = {
      _text: '', hidden: false, disabled: false, className: '',
      style: {}, dataset: {}, children: [], parentNode: null,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild(c) { this.children.push(c); if (c && c.parentNode === null) c.parentNode = this; return c; },
      addEventListener: noop, removeEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [],
      getAttribute: () => null, setAttribute: noop, remove: noop, focus: noop
    };
    Object.defineProperty(node, 'textContent', {
      get() { return this._text; },
      set(v) { this._text = String(v); this.children.length = 0; },
      enumerable: true, configurable: true
    });
    return node;
  };
  sandbox.document = {
    readyState: 'loading',
    documentElement: { classList: { add: noop, remove: noop, contains: () => false } },
    addEventListener: noop,
    getElementById: () => el(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => el()
  };

  const context = vm.createContext(sandbox);
  for (const rel of ['core/auth-boot.js', 'modules/topbar-invoke.js', 'modules/topbar-ui.js']) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  sandbox.__el = el();
  sandbox.__client = client;
  return sandbox;
}

function sessionReply(body, status) {
  return {
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    },
    data: null
  };
}

/* ================= Ø§Ø³ØªØ¨Ø§Ù‚ÙŠ: ØªØ¬Ø¯ÙŠØ¯ Ø§Ù„ØªÙˆÙƒÙ† ================= */

test('ØªÙˆÙƒÙ† ØµØ§Ù„Ø­ Ø¨Ø¹ÙŠØ¯ â€” Ù…ÙÙŠØ´ ØªØ¬Ø¯ÙŠØ¯ØŒ ÙˆØ§Ù„Ù†Ø¯Ø§Ø¡ Ø¨ÙŠØ­ØµÙ„', async () => {
  const s = boot({ expiresIn: 3600 });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø±ÙØ¶Øª Ø¬Ù„Ø³Ø© ØµØ§Ù„Ø­Ø©: ' + JSON.stringify(gate));
  assert.strictEqual(gate.refreshed, false);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(out.result, 'Ø§Ù„Ù†Ø¯Ø§Ø¡ Ù…Ø§Ø¨ØµÙ„Ø´');
  assert.strictEqual(s.supabaseClient.calls.refresh, 0, 'ØªØ¬Ø¯ÙŠØ¯ Ù…Ù† ØºÙŠØ± Ø¯Ø§Ø¹ÙŠ');
  assert.strictEqual(s.supabaseClient.calls.invoke, 1);
});

test('ØªÙˆÙƒÙ† Ø´Ø§Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ â€” Ø¨Ù†Ø¬Ø¯Ù‘Ø¯Ù‡ Ù‚Ø¨Ù„ Ù…Ø§ Ù†Ø¨Ø¹ØªÙ‡', async () => {
  /* 20 Ø«Ø§Ù†ÙŠØ©: Ø§Ù„Ø¯Ø§Ù„Ø© Ù‡ØªØ±ÙØ¶Ù‡ ÙÙˆØ±Ø§Ù‹. Ø¯Ù‡ Ø§Ù„Ù„ÙŠ ÙƒØ§Ù† Ø¨ÙŠØ­ØµÙ„ ÙˆØ§Ù„Ù…Ø³ØªØ®Ø¯Ù…
     ÙƒØ§Ù† Ø¨ÙŠØ´ÙˆÙ Â«Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ§Ù„Ø­Ø©Â» Ù…Ù† ØºÙŠØ± Ø³Ø¨Ø¨ ÙŠÙ‚Ø¯Ø± ÙŠØªØµØ±Ù Ø¨ÙŠÙ‡. */
  const s = boot({ expiresIn: 20 });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø±ÙØ¶Øª Ø¬Ù„Ø³Ø© Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ¬Ø¯ÙŠØ¯');
  assert.strictEqual(gate.refreshed, true, 'Ø§Ù„ØªØ¬Ø¯ÙŠØ¯ Ù…ØªÙ†ÙÙ‘Ø°Ø´');
  assert.strictEqual(s.supabaseClient.calls.refresh, 1);
});

test('Ø§Ù„ØªØ¬Ø¯ÙŠØ¯ Ø¨ÙŠÙØ´Ù„ â€” Ø±Ø³Ø§Ù„Ø© ÙˆØ§Ø¶Ø­Ø© ÙˆÙ…ÙÙŠØ´ Ù†Ø¯Ø§Ø¡ Ù„Ù„Ø¯Ø§Ù„Ø©', async () => {
  const s = boot({ expiresIn: 20, refreshFails: true });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, false, 'Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ù‚Ø¨Ù„Øª Ø¬Ù„Ø³Ø© Ù…ÙŠØªØ©');
  assert.match(gate.message, /Ø§Ù†ØªÙ‡Øª ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ø¬Ù„Ø³Ø©/);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session', 'Ù…Ø§Ø¨ÙŠÙ„Ù†Ø§Ø´-sdkit ØªÙ…Ø³ÙƒÙ‡');
  assert.strictEqual(s.supabaseClient.calls.invoke, 0, 'Ù†Ø§Ø¯ÙŠÙ†Ø§ Ø§Ù„Ø¯Ø§Ù„Ø© Ø¨ØªÙˆÙƒÙ† Ù…ÙŠØª');
});

test('Ù…ÙÙŠØ´ Ø¬Ù„Ø³Ø© â€” Ù…ÙÙŠØ´ Ù†Ø¯Ø§Ø¡ Ù„Ù„Ø¯Ø§Ù„Ø©', async () => {
  const s = boot({ noSession: true });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
  assert.strictEqual(s.supabaseClient.calls.invoke, 0);
  assert.match(out.reason, /no-session/);
});

test('Supabase Ù…Ø´ Ù…ØªØ§Ø­ â€” Ø±Ø³Ø§Ù„Ø© ØªÙˆØ¬Ù‘Ù‡ Ù„ØªØ­Ø¯ÙŠØ« Ø§Ù„ØªØ·Ø¨ÙŠÙ‚', async () => {
  const s = boot({ noClient: true });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
  assert.strictEqual(s.__client.calls.invoke, 0, 'Ù†Ø§Ø¯ÙŠÙ†Ø§ Ø§Ù„Ø¯Ø§Ù„Ø© Ù…Ù† ØºÙŠØ± Ø¹Ù…ÙŠÙ„');
});

/* Ø§Ù„Ø´Ø¨ÙƒØ© ØªØ¹Ø·Ù‘Ù„Øª Ù…Ø´ Ø¯Ù„ÙŠÙ„ Ø¥Ù† Ø§Ù„Ø¬Ù„Ø³Ø© Ù…ÙŠØªØ© â€” Ù„Ø§Ø²Ù… Ù†Ø¬Ø±Ù‘Ø¨ Ø¹Ø§Ø¯ÙŠ.
   ØºÙŠØ± ÙƒØ¯Ù‡ Ø£ÙŠ Ø´Ø¨ÙƒØ© Ø¶Ø¹ÙŠÙØ© Ù‡ØªØ·Ù„Ù‘Ø¹ Â«Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„Â» ÙˆØ§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù…ÙˆØ¬ÙˆØ¯. */
test('ÙØ´Ù„ Ø§Ù„Ø´Ø¨ÙƒØ© Ù…Ø§Ø¨ÙŠÙ†ÙØ¹Ø´ ÙŠØ³Ø¬Ù‘Ù„ Ø§Ù„Ø¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©', async () => {
  const s = boot({ getSessionThrows: 'Failed to fetch' });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'Ø®Ø·Ø£ Ø´Ø¨ÙƒØ© Ø§ØªØ¹Ø§Ù…Ù„ Ù…Ø¹Ø§Ù‡ ÙƒØ£Ù† Ø§Ù„Ø¬Ù„Ø³Ø© Ù…ÙŠØªØ©');
  assert.strictEqual(gate.unknown, true);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(out.result, 'Ø§ØªÙ…Ù†Ø¹ Ø§Ù„Ù†Ø¯Ø§Ø¡ Ø¨Ø³Ø¨Ø¨ Ø´Ø¨ÙƒØ©');
  assert.strictEqual(s.supabaseClient.calls.invoke, 1);
});

/* ================= ØªÙØ§Ø¹Ù„ÙŠ: Ø§Ù„Ø±Ø¯ Ù†ÙØ³Ù‡ Ø¨ÙŠÙ‚ÙˆÙ„ ================= */

test('Ø±Ø¯ Ø§Ù„Ø¯Ø§Ù„Ø© Â«Ø¬Ù„Ø³Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©Â» â€” Ø¨ØªØ¹Ø±Ø¶ Ø²Ø± ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„', async () => {
  const s = boot({
    expiresIn: 3600,
    invokeResult: sessionReply({ error: 'Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ§Ù„Ø­Ø©' }, 400)
  });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session', 'Ø§Ù„Ø±Ø¯ Ø§ØªØ¹Ø§Ù…Ù„ Ù…Ø¹Ø§Ù‡ ÙƒØ£Ù†Ù‡ Ø¹Ø§Ø¯ÙŠ');
  assert.strictEqual(out.reason, 'server-rejected');
  assert.match(s.__el.textContent, /Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„/);
  assert.strictEqual(s.__marked, s.__el.textContent, 'Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø¹Ù„Ù‘Ù…Ø© Ù…Ø´ Ø§Ù„Ù„ÙŠ Ø§ØªØ¹Ø±Ø¶Øª');
});

test('401 Ù…Ù† Ø§Ù„Ø¯Ø§Ù„Ø© â€” Ù†ÙØ³ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø©', async () => {
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'Ù…ÙÙŠØ´ ØªÙˆÙƒÙ†' }, 401) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
});

test('Ø®Ø·Ø£ Ù…Ø´ Ù…ØªØ¹Ù„Ù‚ Ø¨Ø§Ù„Ø¬Ù„Ø³Ø© â€” Ù…Ø§ÙŠÙ†ÙØ¹Ø´ ÙŠØ¹Ø±Ø¶ Ø²Ø± ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„', async () => {
  /* Ø¯Ù‡ Ù…Ù‡Ù…: Â«Ø§Ù„Ø¨Ø±ÙŠØ¯ Ù…Ø³Ø¬Ù‘Ù„ Ø¨Ø§Ù„ÙØ¹Ù„Â» Ø®Ø·Ø£ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙŠÙ‚Ø¯Ø± ÙŠØªØµØ±Ù Ø¨ÙŠÙ‡.
     Ù„Ùˆ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø¨ØªØ§Ø®Ø¯Ù‡ ÙƒØ¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©ØŒ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¨ÙŠØ¹Ù…Ù„ ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„
     ÙˆØ¨ÙŠØ­Ø§ÙˆÙ„ ØªØ§Ù†ÙŠ ÙˆØ§Ù„Ø­Ø§Ø¬Ø© Ù‡ØªÙØ´Ù„ ØªØ§Ù†ÙŠ. */
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ù…Ø³Ø¬Ù‘Ù„ Ø¨Ø§Ù„ÙØ¹Ù„' }, 409) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(!out.skipped, 'Ø§ØªØ¹Ø§Ù…Ù„ Ù…Ø¹ Ø®Ø·Ø£ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙƒØ£Ù†Ù‡ Ø¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©');
  assert.strictEqual(out.result.error.context.status, 409);
  assert.ok(!/Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©/.test(s.__el.textContent), 'Ø§Ù„Ø±Ø³Ø§Ù„Ø© Ø§ØªØºÙŠÙ‘Ø±Øª Ù„Ø­Ø§Ø¬Ø© Ù…Ø´ Ù…Ø±ØªØ¨Ø·Ø©: ' + s.__el.textContent);
});

test('ÙƒÙˆØ¯ 500 Ù…Ù† Ø§Ù„Ø¯Ø§Ù„Ø© â€” Ù…Ø§ÙŠÙ†ÙØ¹Ø´ ÙŠØ¹Ø±Ø¶ Ø²Ø± ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„', async () => {
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'Ø®Ø·Ø£ Ø¯Ø§Ø®Ù„ÙŠ' }, 500) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(!out.skipped);
});

/* ================= ÙƒØ§Ø´Ù Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ ================= */

/* Ø§Ù„ØªØ´ÙƒÙŠÙ„: Ù†ÙØ³ Ø§Ù„Ø¬Ù…Ù„Ø© Ø¨Ø´Ø¯Ù‘Ø© ÙˆÙ…Ù† ØºÙŠØ±Ù‡Ø§ Ù„Ø§Ø²Ù… ØªØªØªØ¹Ø±Ù Ø²ÙŠ Ø¨Ø¹Ø¶.
   Ø¯Ù‡ Ù…Ø´ ØªÙØµÙŠÙ„ ØªØ¬Ù…ÙŠÙ„ÙŠ â€” Â«Ø³Ø¬Ù‘Ù„Â» ÙÙŠ ÙƒÙˆØ¯Ù†Ø§ ÙƒØ§Ù†Øª Ù…Ù† ØºÙŠØ± U+0651
   ÙˆØ§Ù„Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ù„ÙŠ Ø¨ØªÙˆØµÙ„ Ù…Ù† Ø§Ù„Ù€SDK ÙÙŠÙ‡Ø§ØŒ ÙØ§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© ÙƒØ§Ù†Øª ÙØ§Ø´Ù„Ø©
   Ø¹Ù„Ù‰ Ù†Øµ Ø¨Ù†Ø³Ù„Ù‘Ù…Ù‡ Ø¨Ù†Ø³Ù†Ø§. */
test('Ø§Ù„ØªØ´ÙƒÙŠÙ„ Ù…Ø§Ø¨ÙŠÙØ±Ù‚Ø´ â€” Ø§Ù„Ø¬Ù…Ù„Ø© Ø¨ØªØªØ¹Ø±Ù Ø¨ÙƒÙ„ ØµÙŠØºØ©', () => {
  const s = boot({});
  const f = s.yahmaIsSessionError;
  const pairs = [
    ['Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ', 'Ø³Ø¬Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ'],
    ['ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø£ÙˆÙ„Ù‹Ø§', 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø§ÙˆÙ„Ø§'],
    ['Ø§Ù„Ø¬Ù„Ø³Ø© Ù…ÙÙ†ØªÙ‡ÙŠØ©', 'Ø§Ù„Ø¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©']
  ];
  pairs.forEach((pair) => {
    /* Ù†ØªØ­Ù‚Ù‚ Ø¥Ù† Ø§Ù„ÙƒÙ„Ù…Ø§Øª ÙØ¹Ù„Ø§Ù‹ Ù…Ø®ØªÙ„ÙØ© â€” ÙˆØ¥Ù„Ø§ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± ÙˆÙ‡Ù…ÙŠØ© */
    assert.notStrictEqual(pair[0], pair[1], 'Ø§Ù„ÙƒÙ„Ù…ØªÙŠÙ† ÙˆØ§Ø­Ø¯Ø©: ' + pair[0]);
    assert.strictEqual(f(400, pair[0]), f(400, pair[1]),
      'Ø§Ù„ØªØ´ÙƒÙŠÙ„ ØºÙŠÙ‘Ø± Ø§Ù„Ù†ØªÙŠØ¬Ø©: ' + pair[0] + ' â†’ ' + f(400, pair[0])
      + ' / ' + pair[1] + ' â†’ ' + f(400, pair[1]));
  });
  assert.strictEqual(f(400, 'Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ'), true, 'Ø§Ù„Ø¬Ù…Ù„Ø© Ø¯ÙŠ Ù„Ø§Ø²Ù… ØªØªØ¹Ø±Ù');
  assert.strictEqual(f(400, 'ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø£ÙˆÙ„Ù‹Ø§'), true, 'ÙˆØ¨Ø§Ù„ØªØ´ÙƒÙŠÙ„ Ø§Ù„ÙƒØ§Ù…Ù„ Ø¨Ø±Ø¶Ù‡');
});

test('yahmaIsSessionError Ø¨ÙŠØ¹Ø±Ù Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„ØµØ­', () => {
  const s = boot({});
  const f = s.yahmaIsSessionError;
  /* Ø§Ù„Ø£ÙƒÙˆØ§Ø¯ */
  assert.strictEqual(f(401, ''), true, '401');
  assert.strictEqual(f(403, ''), true, '403');
  assert.strictEqual(f(400, ''), false, '400 Ù…Ø´ Ø¬Ù„Ø³Ø©');
  assert.strictEqual(f(500, ''), false, '500');
  /* Ø§Ù„Ù†ØµÙˆØµ Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© Ø¨ØªØ§Ø¹Ø© Ø¯ÙˆØ§Ù„Ù†Ø§ â€” ÙƒÙ„ ÙˆØ§Ø­Ø¯Ø© Ù„Ø§Ø²Ù… ØªØªØ¹Ø±Ù.
     Â«Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©â€¦Â» ÙˆÂ«â€¦Ø§Ù„Ø¬Ù„Ø³Ø©Â» Ø¯ÙˆÙ„ Ø§Ù„Ù„ÙŠ Ø§Ù„ÙƒØ§Ø´Ù Ø§Ù„Ø£ÙˆÙ„ ÙƒØ§Ù†
     Ø¨ÙŠÙÙˆÙ‘ØªÙ‡Ù…ØŒ ÙˆØ¯ÙŠ Ø¨Ø§Ù„Ø¸Ø¨Ø· Ø±Ø³Ø§ÙŠÙ„ Ø¨ÙˆØ§Ø¨ØªÙ†Ø§. */
  assert.strictEqual(f(400, 'Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ§Ù„Ø­Ø©'), true);
  assert.strictEqual(f(400, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø²'), true);
  assert.strictEqual(f(400, 'Ø§Ù†ØªÙ‡Øª ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ø¬Ù„Ø³Ø© Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø². Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ.'), true);
  assert.strictEqual(f(400, 'Ù…ÙÙŠØ´ Ø¬Ù„Ø³Ø© Ø¯Ø®ÙˆÙ„ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø². Ø³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ.'), true);
  assert.strictEqual(f(400, 'Ø¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©'), true);
  assert.strictEqual(f(400, 'Ø§Ù„Ø¬Ù„Ø³Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©'), true, 'Ø¨Ù€Ø§Ù„Ù€Â«Ø§Ù„Â»');
  /* Â«Ø§Ù„Â» Ø§Ø®ØªÙŠØ§Ø±ÙŠØ© â€” Ø§Ù„Ø¹Ø±Ø¨ÙŠ Ø¨ÙŠÙƒØªØ¨ Â«ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„Â» ÙˆÂ«Ø³Ø¬Ù„ Ø¯Ø®ÙˆÙ„Â» */
  assert.strictEqual(f(400, 'Ø³Ø¬Ù„ Ø¯Ø®ÙˆÙ„ ØªØ§Ù†ÙŠ'), true, 'Ù…Ù† ØºÙŠØ± Â«Ø§Ù„Â»');
  assert.strictEqual(f(400, 'Ø³Ø¬Ù‘Ù„ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ù† Ø¬Ø¯ÙŠØ¯'), true, 'Ø§Ù„Ø´ÙƒÙ„ Ø§Ù„Ù…Ø·ÙˆÙ‘Ù„');
  assert.strictEqual(f(400, 'Ø§Ù„Ø¬Ù„Ø³Ø© Ù…Ù†ØªÙ‡ÙŠØ©. Ø³Ø¬Ù‘Ù„ Ø®Ø±ÙˆØ¬.'), true);
  assert.strictEqual(f(400, 'ÙŠØ¬Ø¨ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø£ÙˆÙ„Ù‹Ø§'), true);
  assert.strictEqual(f(400, 'Ø³Ø¬Ù‘Ù„ Ø®Ø±ÙˆØ¬'), true);
  /* Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠ Ù…Ù† Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© ÙˆÙ…Ù† Ø§Ù„Ù€SDK */
  assert.strictEqual(f(400, 'Missing authorization header'), false, 'Ù…Ø´ Ù…Ù† Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© â€” ÙˆØ¯Ù‡ 401 Ø§Ù„Ù„ÙŠ Ø¨ÙŠØ±Ø¯Ù‡Ø§');
  assert.strictEqual(f(401, 'Missing authorization header'), true);
  assert.strictEqual(f(400, '{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}'), true);
  assert.strictEqual(f(400, 'JWT expired'), true);
  assert.strictEqual(f(400, 'invalid JWT'), true);
  assert.strictEqual(f(400, 'token has expired'), true);
  assert.strictEqual(f(400, 'JWT has expired'), true);
  assert.strictEqual(f(400, 'invalid JWT token'), true);
  assert.strictEqual(f(400, 'Auth session missing'), true);
  /* Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠ Ø¹Ø§Ø¯ÙŠ Ù…Ø§Ù„Ù‡Ø§Ø´ Ø¹Ù„Ø§Ù‚Ø© Ø¨Ø¬Ù„Ø³Ø© */
  assert.strictEqual(f(400, 'Tokenization failed'), false, 'ÙƒÙ„Ù…Ø© ÙÙŠÙ‡Ø§ token Ù…Ø´ Ù…Ø¹Ù†Ø§Ù‡Ø§ Ø¬Ù„Ø³Ø©');
  /* Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… â€” Ù„Ø§Ø²Ù… ØªØ¹Ø¯Ù‘ÙŠ */
  assert.strictEqual(f(400, 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ù…Ø³Ø¬Ù‘Ù„ Ø¨Ø§Ù„ÙØ¹Ù„'), false);
  assert.strictEqual(f(400, 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…'), false);
  assert.strictEqual(f(400, 'ØµÙŠØºØ© Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ ØºÙŠØ± ØµØ­ÙŠØ­Ø©'), false);
  assert.strictEqual(f(400, ''), false);
  assert.strictEqual(f(0, ''), false);
  assert.strictEqual(f(null, null), false, 'Ù…ÙÙŠØ´ status ÙˆÙ†Øµ â€” Ù…ÙÙŠØ´ crash');
  assert.strictEqual(f(undefined, undefined), false);
});

/* ================= Ø²Ø± Ø§Ù„Ø®Ø±ÙˆØ¬ ================= */

test('yahmaSessionGate Ø¨ØªØ¹Ù…Ù„ Ù†Øµ + Ø²Ø±', () => {
  const s = boot({});
  const el = s.__el;
  s.yahmaSessionGate(el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„');
  assert.strictEqual(el.textContent, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„');
  const bar = el.children[el.children.length - 1];
  assert.ok(bar, 'Ù…ÙÙŠØ´ Ø¹Ù†ØµØ± Ù„Ù„Ø²Ø±');
  assert.strictEqual(bar.className, 'yahma-session-gate');
  const btn = bar.children[0];
  assert.ok(btn, 'Ù…ÙÙŠØ´ Ø²Ø±');
  assert.strictEqual(btn.textContent, 'ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„', 'Ø§Ù„Ø²Ø± Ù…Ø§Ù„Ù‡ Ù†Øµ Ù…Ù‚Ø±ÙˆØ¡');
  assert.strictEqual(s.__marked, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„', 'Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø¹Ù„Ù‘Ù…Ø© Ø¶Ø§ÙŠØ¹Ø©');
});

test('Ø§Ù„Ø²Ø± Ø¬ÙˆÙ‘Ù‡ Ø¹Ù†ØµØ± Ø§Ù„Ø±Ø³Ø§Ù„Ø© â€” Ù…Ø´ Ø¬ÙˆÙ‡ Ø£Ø¨ÙˆÙ‡', () => {
  /* Ù„Ùˆ climbedÙ†Ø§ Ù„Ù„Ø£Ø¨ ÙƒÙ†Ø§ Ù‡Ù†Ù…Ø³Ø­ Ø¹Ù†Ø§ØµØ± ØªØ§Ù†ÙŠØ© Ù…Ù† Ø§Ù„Ø´Ø§Ø´Ø©.
     Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø¯Ù‡ Ø¨ÙŠÙ‚ÙÙ„ Ø§Ù„Ø³Ù„ÙˆÙƒ Ø¯Ù‡. */
  const s = boot({});
  const sibling = { textContent: 'Ø¹Ù†ØµØ± ØªØ§Ù†ÙŠ', tagName: 'INPUT' };
  const parent = { children: [], appendChild(c) { this.children.push(c); return c; } };
  const el = { textContent: '', children: [], parentNode: parent, appendChild(c) { this.children.push(c); return c; } };
  parent.children.push(sibling);
  parent.children.push(el);
  s.yahmaSessionGate(el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©');
  assert.ok(el.children.length > 0, 'Ø§Ù„Ø²Ø± Ù…Ø§Ø§ØªØ¶Ø§ÙØ´ Ø¬ÙˆÙ‡ Ø¹Ù†ØµØ± Ø§Ù„Ø±Ø³Ø§Ù„Ø©');
  assert.strictEqual(parent.children.length, 2, 'Ø§Ù„Ø£Ø¨ Ø§ØªÙ…Ø³Ø­ â€” Ø¹Ù†ØµØ± ØªØ§Ù†ÙŠ Ø§ØªØ´Ø§Ù„ Ù…Ù† Ø§Ù„Ø´Ø§Ø´Ø©');
  assert.strictEqual(sibling.textContent, 'Ø¹Ù†ØµØ± ØªØ§Ù†ÙŠ', 'Ø§Ù„Ø£Ø® ØªØºÙŠÙ‘Ø±');
});

test('Ù†Ø¯Ø§Ø¡ÙŠÙ† Ù…ØªØªØ§Ù„ÙŠÙŠÙ† â€” Ø²Ø± ÙˆØ§Ø­Ø¯ Ù…Ø´ Ø§ØªÙ†ÙŠÙ†', () => {
  const s = boot({});
  const el = s.__el;
  s.yahmaSessionGate(el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©');
  s.yahmaSessionGate(el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© ØªØ§Ù†ÙŠ');
  const bars = el.children.filter((c) => c.className === 'yahma-session-gate');
  assert.strictEqual(bars.length, 1, 'Ø§ØªØ²Ø±Ø§Ø±: ' + bars.length);
  assert.strictEqual(el.textContent, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© ØªØ§Ù†ÙŠ');
});

test('yahmaSessionGate Ø¨Ø¹Ù†ØµØ± Ù…Ø§Ù„Ù‡ÙˆØ´ appendChild â€” Ù…Ø§ØªØ±Ø³Ù…ÙŠØ´', () => {
  const s = boot({});
  const bare = { textContent: '', parentNode: null };
  assert.doesNotThrow(() => s.yahmaSessionGate(bare, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©'));
  assert.strictEqual(bare.textContent, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©', 'Ø§Ù„Ù†Øµ Ù„Ø³Ù‡ Ø§ØªÙƒØªØ¨');
});

test('Ø§Ù„Ø²Ø± Ø¨ÙŠØ®Ø±Ø¬ Ù…Ù† Ø§Ù„Ø¬Ù‡Ø§Ø² Ø­ØªÙ‰ Ù„Ùˆ Ø§Ù„Ø´Ø¨ÙƒØ© Ù…Ù‚ÙÙˆÙ„Ø©', async () => {
  const s = boot({});
  let signedOut = false;
  s.yahmaSignOut = async () => { signedOut = true; };
  const el = s.__el;
  s.yahmaSessionGate(el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„');
  const bar = el.children[el.children.length - 1];
  const btn = bar.children[0];
  btn.onclick();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(signedOut, true, 'Ø§Ù„Ø²Ø± Ù…Ø¹Ù…Ù„Ø´ Ø­Ø§Ø¬Ø©');
});

test('yahmaSessionGate Ø¨nil Ù…Ø§ÙŠØ±Ù…ÙŠØ´', () => {
  const s = boot({});
  assert.doesNotThrow(() => s.yahmaSessionGate(null, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©'));
  assert.doesNotThrow(() => s.yahmaSessionGate(undefined, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©'));
});

/* Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø¹Ù„Ù‘Ø§Ù…Ø© Ù„Ø§Ø²Ù… ØªÙˆØµÙ„ Ù„Ù„Ø¨Ù†Ø± Ø§Ù„ØªØ§Ù†ÙŠ ÙƒÙ…Ø§Ù†ØŒ Ù…Ø´ Ø¨Ø³ Ù„Ù„Ø±Ø³Ø§Ù„Ø©.
   Ù…Ù† ØºÙŠØ± ÙƒØ¯Ù‡ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙŠØ¯ÙˆØ³ Ø²Ø± ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„ Ù…Ù† ØºÙŠØ± Ø³Ø¨Ø¨ Ø¸Ø§Ù‡Ø±. */
test(' YahmaData.markSessionExpired Ø¨ØªØªÙ†Ø¯Ø§Ø¡ (Ù„Ù„Ø¨Ù†Ø± Ø§Ù„ØªØ§Ù†ÙŠ ÙƒÙ…Ø§Ù†)', () => {
  const s = boot({});
  let called = 0;
  s.YahmaData.markSessionExpired = function (m) { called++; s.__marked = m; };
  s.yahmaSessionGate(s.__el, 'Ø§Ù†ØªÙ‡Øª Ø¬Ù„Ø³Ø©');
  assert.strictEqual(called, 1, 'Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø¹Ù„Ù‘Ø§Ù…Ø© Ù…Ø§ØªØ¨Ø¹ØªØªØ´ Ù„Ù„Ø¨Ù†Ø±');
});

/* ================= Ø§Ù„Ø£Ø³Ù„Ø§Ùƒ ================= */

test('ÙƒÙ„ Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø¯Ø§Ù„Ø© ÙÙŠ Ø§Ù„Ù„ÙˆØ­Ø© Ø¨ÙŠØ¹Ø¯Ù‘ÙŠ Ø¹Ù„Ù‰ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const code = top.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* Ø§Ù„Ù†Ø¯Ø§Ø¡ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ù…Ø³Ù…ÙˆØ­ ÙÙŠ Ù…ÙƒØ§Ù† ÙˆØ§Ø­Ø¯ Ø¨Ø³: Ø¬ÙˆÙ‘Ù‡ invokeYahmaFunction.
     ÙÙ„Ùˆ Ø²Ø§Ø¯ Ø¹Ù† ÙƒØ¯Ù‡ ÙŠØ¨Ù‚Ù‰ ÙÙŠÙ‡ Ù…Ø³Ø§Ø± Ø¨ÙŠØ¨Ø¹Ø« ØªÙˆÙƒÙ† Ù…Ù† ØºÙŠØ± ØªØ¬Ø¯ÙŠØ¯. */
  const invokes = [...code.matchAll(/supabaseClient\.functions\.invoke\(/g)];
  assert.strictEqual(invokes.length, 1,
    'Ø¹Ø¯Ø¯ Ø§Ù„Ù†Ø¯Ø§Ø¡Ø§Øª Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø© ' + invokes.length + ' â€” Ø§Ù„Ù…ÙØ±ÙˆØ¶ 1 (Ø¯Ø§Ø®Ù„ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ø¨Ø³)');

  /* ÙˆØ§Ù„Ø£Ù‡Ù…: Ø§Ù„Ù…ÙˆØ§Ø¶Ø¹ Ø§Ù„ØªÙ„Ø§ØªØ© ÙƒÙ„Ù‡Ø§ Ø¨ØªØ³ØªØ¹Ù…Ù„ Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©. */
  assert.ok(/invokeYahmaFunction\('admin-create-user'/.test(code), 'Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø´ ÙˆØ§ØµÙ„ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©');
  assert.ok(/invokeYahmaFunction\('admin-delete-user'/.test(code), 'Ø§Ù„Ø­Ø°Ù Ù…Ø´ ÙˆØ§ØµÙ„ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©');
  assert.ok(/invokeYahmaFunction\('send-user-email'/.test(code), 'Ø­ÙØ¸ Ø±Ø³Ø§Ù„Ø© Ø§Ù„ØªØ±Ø­ÙŠØ¨ Ù…Ø´ ÙˆØ§ØµÙ„ Ø¨Ø§Ù„Ø¨ÙˆØ§Ø¨Ø©');
  assert.ok(/async function invokeYahmaFunction/.test(code), 'Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ù…Ø´ Ù…Ø¹Ø±Ù‘ÙØ©');
});

test('Ø§Ù„Ø¨ÙˆØ§Ø¨Ø© Ù…Ø¹Ø±Ù‘ÙØ© Ù‚Ø¨Ù„ Ù…Ø§ topbar-ui ÙŠØ³ØªØ®Ø¯Ù…Ù‡Ø§', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('core/auth-boot.js');
  const b = html.indexOf('modules/topbar-ui.js');
  assert.ok(a > -1 && b > -1, 'ÙˆØ§Ø­Ø¯ Ù…Ù† Ø§Ù„Ù…Ù„ÙÙŠÙ† Ù…Ø´ Ù…ØªØ­Ù…Ù‘Ù„');
  assert.ok(a < b, 'auth-boot Ù„Ø§Ø²Ù… ÙŠØªØ­Ù…Ù‘Ù„ Ù‚Ø¨Ù„ topbar-ui');
});

test('Ø§Ù„ØªÙ†Ø³ÙŠÙ‚ Ù…ÙˆØ¬ÙˆØ¯ ÙÙŠ CSS (ÙˆØ§Ù„Ø²Ø± ÙŠØ¨Ø§Ù† Ù…Ø´ Ù†Øµ Ù…Ø®ÙÙŠ)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', '04-dark-overrides.css'), 'utf8');
  assert.ok(/\.yahma-session-gate/.test(css), 'Ù…ÙÙŠØ´ ØªÙ†Ø³ÙŠÙ‚ Ù„Ù„Ø²Ø±');
  assert.ok(/body\.dark-mode \.yahma-session-gate/.test(css), 'Ù…ÙÙŠØ´ Ù†Ø³Ø®Ø© Ù„Ù„ÙˆØ¶Ø¹ Ø§Ù„Ù„ÙŠÙ„ÙŠ');
});

