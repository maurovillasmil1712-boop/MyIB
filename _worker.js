/* MyIB server (Cloudflare Pages, advanced mode).
   Every request comes through here. /api/* is the app's server: accounts, sessions and
   each person's planner, stored in the D1 database bound as DB. Everything else is a
   static file from env.ASSETS, sent with security headers. Pages doesn't publish this
   file, and the check below refuses it too, so it can hold Mauro's own starting planner
   and the hashes of the class code and the admin setup code. */

const USERS = [
  ['alexia', 'Alexia'], ['ana', 'Ana'], ['ariel', 'Ariel'], ['berta', 'Berta'],
  ['carlota', 'Carlota'], ['cata', 'Cata'], ['jorge', 'Jorge'], ['juan', 'Juan'],
  ['luca', 'Luca'], ['mauro', 'Mauro'], ['simon', 'Simón']
];
const NAMES = new Map(USERS);
/* Students outside Sociales 2 IB make their own account (free tier) with a username. */
const FREE_ID = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'myib', 'api', 'support', 'help', 'owner', 'staff',
  'null', 'undefined', 'guest', 'teacher', 'profesor', 'profe', 'moderator', 'mod']);
const MAX_FREE = 500;             /* most accounts outside the class (the admin list shows them all) */
const JOINS_PER_DAY = 150;        /* new outside accounts per day, whole site */
const DEFAULT_BIZUM = '+34 669 448 337';
const DEFAULT_PRICE = { month: 5, once: 15 };   /* MyIB Plus, in euros; Mauro can change it in Settings → Admin */
const PAPER_LINKS_MAX = 30;
const ADMIN = 'mauro';

const ITER = 10000;            /* PBKDF2-SHA256 rounds: ~5 ms, inside the free plan's 10 ms CPU budget */
const SESSION_DAYS = 60;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const WINDOW = 15 * MIN;
const LOGIN_TRIES = 5;         /* wrong passwords for one name from one network, per 15 min */
const NAME_TRIES = 100;        /* password tries for one name from anywhere, per hour */
const IP_TRIES = 60;           /* password tries from one network, per 15 min (a school shares one IP) */
const CODE_TRIES = 5;          /* class-code guesses per person per 15 min */
const SIGNUPS_PER_HOUR = 20;   /* class names and reset codes: new-password tries per network per hour */
const JOINS_PER_HOUR = 60;     /* new outside accounts per network per hour (a school shares one address) */
const SAVES_FREE = 300;        /* saves per 15 min for an account outside the class */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY = 700 * 1024;
const MAX_STATE = 600 * 1024;
const MAX_STATE_FREE = 300 * 1024;   /* 500 outside accounts × 300 KB stays far under the database limit */

/* SHA-256 of the class code and of Mauro's one-time setup code (trimmed, upper case). */
const CLASS_CODE_SHA256 = '7a8cea1e9da1949fe886ce4221f7d306d4b82ea7d3a0998d52f1a9f36044fce8';
const SETUP_CODE_SHA256 = '6bdd2bed392ed67c8d896baedf9619a550ecd1b7e06d67c88c1a03298e781ed1';

/* Mauro's own starting planner. Everyone else starts from the class version in data.js. */
const MAURO_START = {"version":2,"profile":{"name":"Mauro"},"settings":{"theme":"auto","weekend":false,"lastBackup":null},"subjects":[{"id":"eng","name":"English","short":"English","color":"#FF9500","group":"ib","level":"","teacher":"Gerard O.","goal":0,"notes":""},{"id":"math","name":"Math","short":"Math","color":"#FFCC00","group":"ib","level":"SL","teacher":"Ignacio","goal":0,"notes":"Applications & Interpretation SL.\nIA: ¿Existe una relación entre el tempo de una canción y su popularidad en Spotify?"},{"id":"cs","name":"Computer Science","short":"CS","color":"#00C7BE","group":"ib","level":"","teacher":"","goal":0,"notes":"Uses the S. Ambi slots on the school timetable (Tue 10:10, Wed 11:25, Thu 08:15).\nExam dates come from the IB May 2027 schedule, not the school calendar. Add your IA deadlines when you get them."},{"id":"len","name":"Lengua","short":"Lengua","color":"#007AFF","group":"ib","level":"HL","teacher":"Adrián","goal":0,"notes":""},{"id":"ges","name":"Gestión Empresarial","short":"Gestión","color":"#5856D6","group":"ib","level":"HL","teacher":"Fernan","goal":0,"notes":""},{"id":"his","name":"Historia","short":"Historia","color":"#34C759","group":"ib","level":"SL","teacher":"Fernan","goal":0,"notes":""},{"id":"tdc","name":"TDC","short":"TDC","color":"#8E8E93","group":"core","level":"","teacher":"Pedro A","goal":0,"notes":""},{"id":"mono","name":"Monografía","short":"Monografía","color":"#FF2D55","group":"core","level":"","teacher":"Sofía","goal":240,"notes":"RQ: ¿En qué medida fue el colapso económico de Venezuela entre 2013 y 2019 la causa principal de la migración masiva venezolana?\n4,000 words: intro 500 · framework + context 600 · economic collapse 700 · migration 600 · other causes 600 · destinations 400 · analysis 500 · conclusion 300."},{"id":"cas","name":"CAS","short":"CAS","color":"#32ADE6","group":"core","level":"","teacher":"","goal":0,"notes":""},{"id":"tut","name":"Tutoría","short":"Tutoría","color":"#A2845E","group":"other","level":"","teacher":"Gerard O.","goal":0,"notes":""},{"id":"acad","name":"Academy","short":"Academy","color":"#AF52DE","group":"other","level":"","teacher":"","goal":0,"notes":"Tuesdays and Thursdays: help with subjects, IAs, TDC and the Monografía. Course ends 4 May 2027."},{"id":"work","name":"Work","short":"Work","color":"#FF3B30","group":"other","level":"","teacher":"","goal":0,"notes":""}],"periods":[{"id":"p1","start":"08:15","end":"09:15","kind":"class","label":""},{"id":"p2","start":"09:15","end":"10:10","kind":"class","label":""},{"id":"p3","start":"10:10","end":"11:05","kind":"class","label":""},{"id":"br","start":"11:05","end":"11:25","kind":"break","label":"Break"},{"id":"p4","start":"11:25","end":"12:20","kind":"class","label":""},{"id":"p5","start":"12:20","end":"13:15","kind":"class","label":""},{"id":"p6","start":"13:15","end":"14:10","kind":"class","label":""},{"id":"p7","start":"14:10","end":"15:05","kind":"class","label":""},{"id":"pa","start":"17:00","end":"19:00","kind":"class","label":"Afternoon"}],"slots":{"p1|0":{"subject":"tdc"},"p1|2":{"subject":"ges"},"p1|3":{"subject":"cs"},"p1|4":{"subject":"len"},"p2|0":{"subject":"len"},"p2|1":{"subject":"len"},"p2|2":{"subject":"eng"},"p2|3":{"subject":"eng"},"p2|4":{"subject":"tdc"},"p3|0":{"subject":"len"},"p3|1":{"subject":"cs"},"p3|2":{"subject":"eng"},"p3|3":{"subject":"tdc"},"p3|4":{"subject":"eng"},"p4|0":{"subject":"eng"},"p4|1":{"subject":"math"},"p4|2":{"subject":"cs"},"p4|3":{"subject":"len"},"p4|4":{"subject":"ges"},"p5|0":{"subject":"his"},"p5|1":{"subject":"ges"},"p5|2":{"subject":"math"},"p5|3":{"subject":"ges"},"p5|4":{"subject":"ges"},"p6|0":{"subject":"math"},"p6|1":{"subject":"his"},"p6|2":{"subject":"math"},"p6|3":{"subject":"his"},"p6|4":{"subject":"math"},"p7|0":{"subject":"tut"},"pa|1":{"subject":"acad"},"pa|3":{"subject":"acad"},"pa|4":{"subject":"work"}},"events":[{"id":"tdc-exh","type":"deadline","subject":"tdc","title":"Exhibition","detail":"","start":"2026-09-24","end":null,"note":"","done":false},{"id":"mono-conc","type":"deadline","subject":"mono","title":"","detail":"Draft up to the conclusion","start":"2026-09-29","end":null,"note":"","done":false},{"id":"math-ia-rev","type":"deadline","subject":"math","title":"IA","detail":"Review","start":"2026-10-09","end":null,"note":"","done":false},{"id":"mono-full","type":"deadline","subject":"mono","title":"","detail":"Complete draft","start":"2026-10-19","end":null,"note":"","done":false},{"id":"math-ia-full","type":"deadline","subject":"math","title":"IA","detail":"Complete draft","start":"2026-11-06","end":null,"note":"","done":false},{"id":"len-essay-last","type":"deadline","subject":"len","title":"Essay","detail":"Last draft","start":"2026-11-13","end":null,"note":"","done":false},{"id":"mock-1","type":"mock","subject":null,"title":"First mock exams","detail":"","start":"2026-11-25","end":"2026-12-04","note":"","done":false},{"id":"ges-ia-full","type":"deadline","subject":"ges","title":"IA","detail":"Complete draft","start":"2026-12-11","end":null,"note":"","done":false},{"id":"tdc-essay-full","type":"deadline","subject":"tdc","title":"Essay","detail":"Complete draft","start":"2026-12-13","end":null,"note":"","done":false},{"id":"mono-pres","type":"deadline","subject":"mono","title":"","detail":"Presentation","start":"2026-12-16","end":null,"note":"","done":false},{"id":"mono-last","type":"deadline","subject":"mono","title":"","detail":"Last draft","start":"2026-12-20","end":null,"note":"","done":false},{"id":"grades-4","type":"grades","subject":null,"title":"Grades","detail":"4th term","start":"2026-12-21","end":null,"note":"","done":false},{"id":"xmas","type":"holiday","subject":null,"title":"Christmas break","detail":"","start":"2026-12-23","end":"2027-01-11","note":"","done":false},{"id":"math-ia-last","type":"deadline","subject":"math","title":"IA","detail":"Last draft","start":"2027-01-15","end":null,"note":"","done":false},{"id":"tdc-essay-last","type":"deadline","subject":"tdc","title":"Essay","detail":"Last draft","start":"2027-01-22","end":null,"note":"","done":false},{"id":"cas-portfolio","type":"deadline","subject":"cas","title":"Portfolio","detail":"Final submission","start":"2027-02-03","end":null,"note":"","done":false},{"id":"ges-ia-last","type":"deadline","subject":"ges","title":"IA","detail":"Last draft","start":"2027-02-07","end":null,"note":"","done":false},{"id":"mono-final","type":"deadline","subject":"mono","title":"","detail":"Final submission","start":"2027-02-14","end":null,"note":"","done":false},{"id":"len-essay-final","type":"deadline","subject":"len","title":"Essay","detail":"Final submission","start":"2027-02-14","end":null,"note":"","done":false},{"id":"math-ia-final","type":"deadline","subject":"math","title":"IA","detail":"Final submission","start":"2027-02-19","end":null,"note":"","done":false},{"id":"tdc-essay-final","type":"deadline","subject":"tdc","title":"Essay","detail":"Final submission","start":"2027-02-25","end":null,"note":"","done":false},{"id":"ges-ia-final","type":"deadline","subject":"ges","title":"IA","detail":"Final submission","start":"2027-02-26","end":null,"note":"","done":false},{"id":"mock-2","type":"mock","subject":null,"title":"Second mock exams","detail":"","start":"2027-03-01","end":"2027-03-15","note":"","done":false},{"id":"easter","type":"holiday","subject":null,"title":"Easter break","detail":"","start":"2027-03-19","end":"2027-03-29","note":"","done":false},{"id":"grades-5","type":"grades","subject":null,"title":"Grades","detail":"5th term","start":"2027-04-08","end":null,"note":"","done":false},{"id":"ges-p13","type":"exam","subject":"ges","title":"Exam","detail":"Papers 1 & 3","start":"2027-04-27","end":null,"note":"IB May 2027 exam schedule: afternoon session.","done":false},{"id":"ges-p2","type":"exam","subject":"ges","title":"Exam","detail":"Paper 2","start":"2027-04-28","end":null,"note":"IB May 2027 exam schedule: morning session.","done":false},{"id":"cs-p1","type":"exam","subject":"cs","title":"Exam","detail":"Paper 1","start":"2027-04-30","end":null,"note":"IB May 2027 exam schedule: afternoon session. Not on the school calendar, so confirm it with your IB coordinator.","done":false},{"id":"cs-p2","type":"exam","subject":"cs","title":"Exam","detail":"Paper 2","start":"2027-05-03","end":null,"note":"IB May 2027 exam schedule: morning session. Not on the school calendar, so confirm it with your IB coordinator.","done":false},{"id":"his-p12","type":"exam","subject":"his","title":"Exam","detail":"Papers 1 & 2","start":"2027-05-03","end":null,"note":"IB May 2027 exam schedule: afternoon session.","done":false},{"id":"eng-p12","type":"exam","subject":"eng","title":"Exam","detail":"Paper 1 + Paper 2 reading","start":"2027-05-06","end":null,"note":"IB May 2027 exam schedule: afternoon session.","done":false},{"id":"eng-p2l","type":"exam","subject":"eng","title":"Exam","detail":"Paper 2 listening","start":"2027-05-07","end":null,"note":"IB May 2027 exam schedule: morning session.","done":false},{"id":"len-p1","type":"exam","subject":"len","title":"Exam","detail":"Paper 1","start":"2027-05-12","end":null,"note":"IB May 2027 exam schedule: afternoon session.","done":false},{"id":"len-p2","type":"exam","subject":"len","title":"Exam","detail":"Paper 2","start":"2027-05-13","end":null,"note":"IB May 2027 exam schedule: morning session.","done":false},{"id":"math-p1","type":"exam","subject":"math","title":"Exam","detail":"Paper 1","start":"2027-05-13","end":null,"note":"IB May 2027 exam schedule: afternoon session.","done":false},{"id":"math-p2","type":"exam","subject":"math","title":"Exam","detail":"Paper 2","start":"2027-05-14","end":null,"note":"IB May 2027 exam schedule: morning session.","done":false}],"tasks":[{"id":"t-tdc-exh","title":"Final run-through of the TDC exhibition","subject":"tdc","due":"2026-09-24","event":"tdc-exh","est":30,"notes":"","done":false,"doneAt":null,"created":"2026-09-23"},{"id":"t-mono-conc","title":"Write the Monografía up to the conclusion","subject":"mono","due":"2026-09-29","event":"mono-conc","est":null,"notes":"","done":false,"doneAt":null,"created":"2026-09-23"},{"id":"t-math-rev","title":"Finish the Math IA draft for the review","subject":"math","due":"2026-10-08","event":"math-ia-rev","est":null,"notes":"","done":false,"doneAt":null,"created":"2026-09-23"}],"sessions":[],"timer":null};

const COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321',
  '121212', 'password', 'password1', 'qwerty', 'qwerty123', 'abc123', 'abcdef', 'contraseña', 'contrasena', 'iloveyou',
  'myib', 'myib123', 'ibplanner', 'colegio', 'madrid', 'bachillerato']);

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Robots-Tag': 'noindex, nofollow'
};
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra || {}; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api' || path.startsWith('/api/')) {
      try {
        return await route(request, env, url);
      } catch (e) {
        if (e instanceof HttpError) return json(Object.assign({ error: e.code }, e.extra), e.status);
        console.error('MyIB API error:', e && e.stack ? e.stack : e);
        return json({ error: 'server' }, 500);
      }
    }
    let plain = path;
    try { plain = decodeURIComponent(path); } catch (e) { /* keep it raw */ }
    if (/^\/+_(worker\.js|routes\.json|headers|redirects)(\/|$)/i.test(plain)) {
      return send('Not found', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const k in BASE_HEADERS) out.headers.set(k, BASE_HEADERS[k]);
    out.headers.set('Content-Security-Policy', PAGE_CSP);
    if (path === '/sw.js') out.headers.set('Cache-Control', 'no-cache');
    return out;
  }
};

/* =========================================================
   Routing
   ========================================================= */
const ROUTES = {
  'GET /api/users': listUsers,
  'POST /api/signup': signup,
  'POST /api/join': join,
  'POST /api/login': login,
  'POST /api/logout': logout,
  'GET /api/me': me,
  'POST /api/reauth': reauth,
  'POST /api/password': changePassword,
  'GET /api/state': getState,
  'PUT /api/state': putState,
  'GET /api/starter': starter,
  'POST /api/unlock': unlock,
  'POST /api/calendar': newCalendarLink,
  'POST /api/account/delete': deleteAccount,
  'GET /api/admin/users': adminUsers,
  'POST /api/admin/reset': adminReset,
  'POST /api/admin/erase': adminErase,
  'GET /api/admin/export': adminExport,
  'PUT /api/admin/import': adminImport,
  'POST /api/admin/plus': adminPlus,
  'POST /api/admin/config': adminConfig,
  'POST /api/admin/delete': adminDelete
};

async function route(req, env, url) {
  if (!env.DB) throw new HttpError(503, 'setup');
  const db = env.DB;
  await schema(db);
  const head = req.method === 'HEAD';
  const method = head ? 'GET' : req.method;
  const path = url.pathname.replace(/\/+$/, '');
  const c = {
    req, env, db, url,
    now: Date.now(),
    ip: netOf(req.headers.get('CF-Connecting-IP') || 'local'),
    secure: url.protocol === 'https:'
  };
  if (method === 'GET' && path.startsWith('/api/cal/')) return calendarFeed(c, path.slice(9), head);
  if (method !== 'GET') {
    /* CSRF guard: the app always sends this header, and another site can't add it
       without a CORS preflight, which this server never approves. */
    if (req.headers.get('X-MyIB') !== '1') throw new HttpError(403, 'forbidden');
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'forbidden');
  }
  const handler = ROUTES[method + ' ' + path];
  if (!handler) throw new HttpError(method === 'OPTIONS' ? 405 : 404, 'not_found');
  return handler(c);
}

let ready = null;
function schema(db) {
  if (!ready) ready = makeSchema(db).catch((e) => { ready = null; throw e; });
  return ready;
}
async function makeSchema(db) {
  await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, pw TEXT, created_at INTEGER, last_login INTEGER, plus TEXT, cal_token TEXT, reset TEXT, name TEXT, kind TEXT)'),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_cal ON users (cal_token)'),
      db.prepare('CREATE TABLE IF NOT EXISTS planners (user TEXT PRIMARY KEY, data TEXT NOT NULL, rev INTEGER NOT NULL, updated_at INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, reauth_until INTEGER)'),
      db.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user)'),
      db.prepare('CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, since INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)')
  ]);
  /* databases made by an older MyIB lack the newer columns: add them */
  let have = null;
  try { have = new Set(((await db.prepare('PRAGMA table_info(users)').all()).results || []).map((r) => r.name)); } catch (e) { have = null; }
  for (const col of ['reset', 'name', 'kind']) {
    if (have && have.has(col)) continue;
    try { await db.prepare('ALTER TABLE users ADD COLUMN ' + col + ' TEXT').run(); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
  }
}

/* =========================================================
   Responses, bodies, cookies
   ========================================================= */
function send(body, status, headers) {
  const h = new Headers(headers || {});
  for (const k in BASE_HEADERS) h.set(k, BASE_HEADERS[k]);
  h.set('Content-Security-Policy', API_CSP);
  if (!h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
  return new Response(body, { status, headers: h });
}
function json(obj, status, headers) {
  return send(JSON.stringify(obj), status || 200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}));
}
async function readBody(c) {
  const ct = c.req.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, 'json');
  if (Number(c.req.headers.get('Content-Length') || 0) > MAX_BODY) throw new HttpError(413, 'too_big');
  const text = await readLimited(c.req, MAX_BODY);
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new HttpError(400, 'bad_json'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new HttpError(400, 'bad_json');
  return o;
}
/* read at most max bytes, so a huge upload can't exhaust memory */
async function readLimited(req, max) {
  if (!req.body) return '';
  const reader = req.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new HttpError(413, 'too_big'); }
    parts.push(r.value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}
/* Rate limits count an IPv6 address by its /64, since one device can hold a whole /64. */
function netOf(ip) {
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);          /* ::ffff:1.2.3.4 */
  const [head, tail] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const all = tail === undefined ? h : h.concat(Array(Math.max(0, 8 - h.length - t.length)).fill('0'), t);
  return all.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
function isFreeId(id) { return typeof id === 'string' && FREE_ID.test(id) && !RESERVED.has(id) && !NAMES.has(id); }
function userId(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }
/* a class name, or an existing account from outside the class */
async function account(c, v) {
  const id = userId(v);
  if (NAMES.has(id)) return { id, name: NAMES.get(id), kind: 'class' };
  if (!isFreeId(id)) return null;
  const r = await c.db.prepare("SELECT name FROM users WHERE id = ? AND kind = 'free'").bind(id).first();
  return r ? { id, name: r.name || id, kind: 'free' } : null;
}
async function needAccount(c, v) {
  const a = await account(c, v);
  if (!a) throw new HttpError(400, 'user');
  return a;
}
/* a person's own name: 1 to 30 characters, no control or text-direction characters */
function cleanName(v) {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).length <= 30 ? s : '';
}
function readCookie(req, name) {
  const all = req.headers.get('Cookie') || '';
  for (const part of all.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
function sessionCookie(c, token, maxAge) {
  return 'myib_session=' + token + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (c.secure ? '; Secure' : '');
}

/* =========================================================
   Crypto
   ========================================================= */
const te = new TextEncoder();
function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomToken(n) { return b64u(crypto.getRandomValues(new Uint8Array(n))); }
async function sha256hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)));
  let h = '';
  for (let i = 0; i < d.length; i++) h += d[i].toString(16).padStart(2, '0');
  return h;
}
function sameText(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return d === 0;
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return 'pbkdf2-sha256$' + ITER + '$' + b64u(salt) + '$' + b64u(await pbkdf2(pw, salt, ITER));
}
async function checkPassword(pw, stored) {
  const p = String(stored || '').split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2-sha256') return false;
  const iter = Number(p[1]);
  if (!Number.isInteger(iter) || iter < 1000 || iter > 100000) return false;
  return sameBytes(await pbkdf2(pw, unb64u(p[2]), iter), unb64u(p[3]));
}
function plainText(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function newPassword(v, id) {
  if (typeof v !== 'string') throw new HttpError(400, 'weak');
  const pw = v.normalize('NFC');
  if (Array.from(pw).length < 6) throw new HttpError(400, 'weak');
  if (pw.length > 128) throw new HttpError(400, 'long');
  const low = plainText(pw);
  const letters = low.replace(/[^a-z]/g, '');
  const idLetters = id.replace(/[^a-z]/g, '');
  if (COMMON.has(pw.toLowerCase()) || COMMON.has(low) || /^(.)\1+$/.test(low) || (idLetters.length >= 3 && letters === idLetters) || letters === 'myib') {
    throw new HttpError(400, 'common');
  }
  return pw;
}

/* =========================================================
   Rate limits (fixed windows in the attempts table)
   ========================================================= */
/* Count the attempt first (one atomic statement), then refuse if it's over the limit.
   Checking before counting would let parallel requests slip past. */
async function hit(c, key, max, windowMs, code) {
  const r = await c.db.prepare(
    'INSERT INTO attempts (key, count, since) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET ' +
    'count = CASE WHEN attempts.since <= ?3 THEN 1 ELSE attempts.count + 1 END, ' +
    'since = CASE WHEN attempts.since <= ?3 THEN ?2 ELSE attempts.since END RETURNING count, since'
  ).bind(key, c.now, c.now - windowMs).first();
  const n = r ? r.count : 1, since = r ? r.since : c.now;
  if (n > max) throw new HttpError(429, code || 'locked', { wait: Math.max(1, Math.ceil((since + windowMs - c.now) / MIN)) });
  return n;
}
function normCode(v) { return String(v || '').toUpperCase().replace(/[\s-]/g, ''); }
function newResetCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_CHARS[b[i] & 31];
  return s.slice(0, 4) + '-' + s.slice(4);
}

/* =========================================================
   Sessions
   ========================================================= */
function plusOf(id, plus) { return id === ADMIN ? 'admin' : plus === 'class' || plus === 'gift' ? plus : null; }

async function getSession(c) {
  const token = readCookie(c.req, 'myib_session');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const hash = await sha256hex(token);
  const row = await c.db.prepare(
    'SELECT s.user, s.expires_at, s.reauth_until, u.pw IS NOT NULL AS has_pw, u.plus, u.cal_token, u.name, u.kind ' +
    'FROM sessions s JOIN users u ON u.id = s.user WHERE s.token = ?'
  ).bind(hash).first();
  if (!row || row.expires_at <= c.now || !row.has_pw) return null;
  const kind = NAMES.has(row.user) ? 'class' : row.kind === 'free' && isFreeId(row.user) ? 'free' : null;
  if (!kind) return null;
  return {
    token, hash, user: row.user, kind, name: kind === 'class' ? NAMES.get(row.user) : row.name || row.user,
    expires: row.expires_at, reauth: row.reauth_until || 0, plus: row.plus || null, cal: row.cal_token || null
  };
}
async function needUser(c) {
  const s = await getSession(c);
  if (!s) throw new HttpError(401, 'auth');
  return s;
}
async function needAdmin(c) {
  const s = await needUser(c);
  if (s.user !== ADMIN) throw new HttpError(403, 'admin');
  return s;
}
async function payload(c, acct, plusCol, cal) {
  const id = acct.id, plus = plusOf(id, plusCol);
  return Object.assign({
    user: { id, name: acct.name, kind: acct.kind, admin: id === ADMIN, plus },
    cal: plus && cal ? cal : null
  }, await readConf(c));
}

/* =========================================================
   Settings Mauro edits in the app: Bizum number, Plus price, the Past Papers sheet
   ========================================================= */
async function readConf(c) {
  const { results } = await c.db.prepare("SELECT key, value FROM config WHERE key IN ('bizum', 'price', 'papers')").all();
  const m = new Map((results || []).map((r) => [r.key, r.value]));
  let price = null, papers = null;
  try { price = m.has('price') ? cleanPrice(JSON.parse(m.get('price'))) : null; } catch (e) { price = null; }
  try {
    const p = m.has('papers') ? JSON.parse(m.get('papers')) : null;
    papers = p ? Object.assign(cleanPapers(p), { updated: Number(p.updated) || 0 }) : null;
  } catch (e) { papers = null; }
  return {
    /* no saved number means the default one; a saved empty value hides it */
    bizum: m.has('bizum') ? m.get('bizum') || null : DEFAULT_BIZUM,
    price: price || DEFAULT_PRICE,
    /* null: the app shows its built-in Past Papers sheet */
    papers
  };
}
/* admin text: no control or text-direction characters; lines keeps single line breaks */
function cleanText(v, max, lines) {
  if (v == null) return '';
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '');
  s = lines ? s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
            : s.replace(/\s+/g, ' ').trim();
  return Array.from(s).length <= max ? s : null;
}
/* only plain web links (http or https), without a username or password in them */
function cleanUrl(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 800) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname || u.username || u.password) return null;
  return u.href.length <= 1000 ? u.href : null;
}
function cleanPapers(p) {
  const bad = (field, at) => new HttpError(400, 'papers', at === undefined ? { field } : { field, at });
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw bad('all');
  const out = {};
  for (const [k, max, lines] of [['title', 40], ['intro', 400, true], ['head', 60], ['foot', 400, true]]) {
    const t = cleanText(p[k], max, lines);
    if (t === null) throw bad(k);
    out[k] = t;
  }
  const links = p.links == null ? [] : p.links;
  if (!Array.isArray(links) || links.length > PAPER_LINKS_MAX) throw bad('links');
  out.links = links.map((l, i) => {
    if (!l || typeof l !== 'object' || Array.isArray(l)) throw bad('link', i);
    const title = cleanText(l.title, 100), sub = cleanText(l.sub, 160), url = cleanUrl(l.url);
    if (!title) throw bad('title', i);
    if (sub === null) throw bad('sub', i);
    if (!url) throw bad('url', i);
    return { title, sub, url, fresh: l.fresh === true };
  });
  return out;
}
function cleanPrice(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'price');
  const month = Math.round(Number(p.month) * 100) / 100, once = Math.round(Number(p.once) * 100) / 100;
  if (!(month >= 0.5 && month <= 50) || !(once >= 1 && once <= 200)) throw new HttpError(400, 'price');
  return { month, once };
}
function sessionAccount(s) { return { id: s.user, name: s.name, kind: s.kind }; }
async function startSession(c, acct) {
  const id = acct.id;
  const token = randomToken(32);
  const hash = await sha256hex(token);
  await c.db.batch([
    c.db.prepare('INSERT INTO sessions (token, user, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(hash, id, c.now, c.now + SESSION_DAYS * DAY),
    c.db.prepare('UPDATE users SET last_login = ?2 WHERE id = ?1').bind(id, c.now),
    c.db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(c.now),
    c.db.prepare('DELETE FROM attempts WHERE since < ?1 OR key = ?2').bind(c.now - DAY, 'login:' + id + ':' + c.ip)
  ]);
  const u = await c.db.prepare('SELECT plus, cal_token FROM users WHERE id = ?').bind(id).first();
  return json(await payload(c, acct, u && u.plus, u && u.cal_token), 200, { 'Set-Cookie': sessionCookie(c, token, SESSION_DAYS * 86400) });
}

/* =========================================================
   Accounts
   ========================================================= */
async function listUsers(c) {
  const { results } = await c.db.prepare('SELECT id, pw IS NOT NULL AS claimed, reset IS NOT NULL AS locked FROM users').all();
  const rows = new Map((results || []).map((r) => [r.id, r]));
  return json({
    users: USERS.map(([id, name]) => {
      const r = rows.get(id) || {};
      /* code: making a password for this name needs a code (Mauro's setup code, or a reset code) */
      return { id, name, claimed: !!r.claimed, code: !r.claimed && (id === ADMIN || !!r.locked) };
    })
  });
}

/* Claim a class name, or set a new password on a reset account with its code. */
async function signup(c) {
  const b = await readBody(c);
  const id = userId(b.user);
  const isClass = NAMES.has(id);
  if (!isClass && !isFreeId(id)) throw new HttpError(400, 'user');
  const pw = newPassword(b.password, id);
  await hit(c, 'signup:' + c.ip, SIGNUPS_PER_HOUR, 60 * MIN, 'slow');
  const row = await c.db.prepare('SELECT pw IS NOT NULL AS claimed, reset, name, kind FROM users WHERE id = ?').bind(id).first();
  if (!isClass && (!row || row.kind !== 'free')) throw new HttpError(404, 'unknown');
  if (row && row.claimed) throw new HttpError(409, 'taken');
  const code = normCode(b.code);
  const reset = row && row.reset ? row.reset : null;
  if (id === ADMIN) {
    /* Mauro's name needs the setup code, so nobody else can take the admin account. */
    const envCode = normCode(c.env.ADMIN_CODE);
    const ok = code.length >= 8 && code.length <= 64 &&
      (sameText(await sha256hex(code), SETUP_CODE_SHA256) || (envCode.length >= 8 && sameText(code, envCode)));
    if (!ok) throw new HttpError(403, 'setup_code');
  } else if (reset || !isClass) {
    /* after a reset, only the person Mauro gave the code to can make the new password */
    if (!reset || !code || code.length > 64 || !sameText(await sha256hex(code), reset)) throw new HttpError(403, 'reset_code');
  }
  const hash = await hashPassword(pw);
  /* an outside account is only ever updated here: if it was deleted meanwhile, nothing gets made */
  const r = isClass ? await c.db.prepare(
    'INSERT INTO users (id, pw, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET ' +
    'pw = excluded.pw, reset = NULL, created_at = COALESCE(users.created_at, excluded.created_at) ' +
    'WHERE users.pw IS NULL AND users.reset IS ?4'
  ).bind(id, hash, c.now, reset).run() : await c.db.prepare(
    "UPDATE users SET pw = ?2, reset = NULL WHERE id = ?1 AND kind = 'free' AND pw IS NULL AND reset IS ?3"
  ).bind(id, hash, reset).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(409, 'taken');
  return startSession(c, { id, name: isClass ? NAMES.get(id) : row.name || id, kind: isClass ? 'class' : 'free' });
}

/* A new account for a student outside Sociales 2 IB: free tier, empty planner. */
async function join(c) {
  const b = await readBody(c);
  const id = userId(b.user);
  if (!FREE_ID.test(id)) throw new HttpError(400, 'username');
  if (!isFreeId(id)) throw new HttpError(409, 'taken');
  const name = cleanName(b.name);
  if (!name) throw new HttpError(400, 'name');
  const pw = newPassword(b.password, id);
  await hit(c, 'join:' + c.ip, JOINS_PER_HOUR, 60 * MIN, 'slow');
  const q = await c.db.batch([
    c.db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind = 'free'"),
    c.db.prepare("SELECT count, since FROM attempts WHERE key = 'joins:day'")
  ]);
  const n = q[0].results && q[0].results[0], day = q[1].results && q[1].results[0];
  if (n && n.n >= MAX_FREE) throw new HttpError(503, 'full');
  if (day && day.since > c.now - DAY && day.count >= JOINS_PER_DAY) throw new HttpError(429, 'busy', { wait: Math.max(1, Math.ceil((day.since + DAY - c.now) / MIN)) });
  const hash = await hashPassword(pw);
  const r = await c.db.prepare(
    "INSERT INTO users (id, pw, created_at, name, kind) VALUES (?1, ?2, ?3, ?4, 'free') ON CONFLICT(id) DO NOTHING"
  ).bind(id, hash, c.now, name).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(409, 'taken');
  /* only accounts that got made count toward the daily cap; a deleted account with this name leaves nothing behind */
  await c.db.batch([
    c.db.prepare('INSERT INTO attempts (key, count, since) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET ' +
      'count = CASE WHEN attempts.since <= ?3 THEN 1 ELSE attempts.count + 1 END, since = CASE WHEN attempts.since <= ?3 THEN ?2 ELSE attempts.since END')
      .bind('joins:day', c.now, c.now - DAY),
    c.db.prepare('DELETE FROM planners WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id)
  ]);
  return startSession(c, { id, name, kind: 'free' });
}

async function login(c) {
  const b = await readBody(c);
  const id = userId(b.user);
  const isClass = NAMES.has(id);
  if (!isClass && !isFreeId(id)) throw new HttpError(400, 'user');
  const pw = typeof b.password === 'string' ? b.password.normalize('NFC') : '';
  const mine = 'login:' + id + ':' + c.ip, net = 'ip:' + c.ip, name = 'name:' + id;
  /* per name and network first: tries refused here don't count against the name everywhere else */
  const n = await hit(c, mine, LOGIN_TRIES, WINDOW);
  await hit(c, net, IP_TRIES, WINDOW);
  await hit(c, name, NAME_TRIES, 60 * MIN);
  const row = await c.db.prepare('SELECT pw, reset, name, kind FROM users WHERE id = ?').bind(id).first();
  if (!isClass && (!row || row.kind !== 'free')) throw new HttpError(404, 'unknown');
  if (!row || !row.pw) throw new HttpError(404, 'unclaimed', { code: id === ADMIN || !!(row && row.reset) });
  if (!pw || pw.length > 128 || !(await checkPassword(pw, row.pw))) {
    const left = Math.max(0, LOGIN_TRIES - n);
    throw new HttpError(401, 'wrong', left ? { left } : { left: 0, wait: WINDOW / MIN });
  }
  /* a right password doesn't use up any tries (startSession clears this name's tries here) */
  await c.db.prepare('UPDATE attempts SET count = MAX(count - 1, 0) WHERE key IN (?1, ?2)').bind(net, name).run();
  return startSession(c, { id, name: isClass ? NAMES.get(id) : row.name || id, kind: isClass ? 'class' : 'free' });
}

async function logout(c) {
  const token = readCookie(c.req, 'myib_session');
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) await c.db.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256hex(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(c, '', 0) });
}

async function me(c) {
  /* not logged in is a normal answer here (200 with user null), so browsers don't log an error */
  const s = await getSession(c);
  if (!s) return json({ user: null });
  const headers = {};
  if (s.expires - c.now < (SESSION_DAYS - 1) * DAY) {
    /* sliding expiry, at most one write a day */
    await c.db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').bind(c.now + SESSION_DAYS * DAY, s.hash).run();
    headers['Set-Cookie'] = sessionCookie(c, s.token, SESSION_DAYS * 86400);
  }
  return json(await payload(c, sessionAccount(s), s.plus, s.cal), 200, headers);
}

/* Changing a password takes two requests so each one hashes only once (CPU limit):
   /api/reauth checks the current password, then /api/password sets the new one. */
async function reauth(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const pw = typeof b.password === 'string' ? b.password.normalize('NFC') : '';
  const mine = 'login:' + s.user + ':' + c.ip;
  const n = await hit(c, mine, LOGIN_TRIES, WINDOW);
  await hit(c, 'name:' + s.user, NAME_TRIES, 60 * MIN);
  const row = await c.db.prepare('SELECT pw FROM users WHERE id = ?').bind(s.user).first();
  if (!pw || pw.length > 128 || !row || !(await checkPassword(pw, row.pw))) {
    const left = Math.max(0, LOGIN_TRIES - n);
    throw new HttpError(401, 'wrong', left ? { left } : { left: 0, wait: WINDOW / MIN });
  }
  await c.db.batch([
    c.db.prepare('DELETE FROM attempts WHERE key = ?').bind(mine),
    c.db.prepare('UPDATE sessions SET reauth_until = ? WHERE token = ?').bind(c.now + 5 * MIN, s.hash)
  ]);
  return json({ ok: true });
}

async function changePassword(c) {
  const s = await needUser(c);
  if (!(s.reauth > c.now)) throw new HttpError(403, 'reauth');
  const b = await readBody(c);
  const pw = newPassword(b.password, s.user);
  const hash = await hashPassword(pw);
  await c.db.batch([
    c.db.prepare('UPDATE users SET pw = ?1 WHERE id = ?2').bind(hash, s.user),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1 AND token <> ?2').bind(s.user, s.hash),
    c.db.prepare('UPDATE sessions SET reauth_until = NULL WHERE token = ?1').bind(s.hash)
  ]);
  return json({ ok: true });
}

/* =========================================================
   Planner state (optimistic concurrency with rev)
   ========================================================= */
function stateText(st, max) {
  if (!st || typeof st !== 'object' || Array.isArray(st)) throw new HttpError(400, 'bad_state');
  for (const k of ['subjects', 'periods', 'events', 'tasks']) if (!Array.isArray(st[k])) throw new HttpError(400, 'bad_state');
  const t = JSON.stringify(st);
  if (t.length > (max || MAX_STATE)) throw new HttpError(413, 'too_big');
  return t;
}
/* base: null = overwrite, 0 = create only, n = update only if the stored rev is still n.
   A new planner starts its rev at the current time, so revs never repeat after an erase. */
function writePlanner(c, user, data, base) {
  if (base === null) {
    return c.db.prepare(
      'INSERT INTO planners (user, data, rev, updated_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(user) DO UPDATE SET ' +
      'data = excluded.data, rev = planners.rev + 1, updated_at = excluded.updated_at RETURNING rev, updated_at'
    ).bind(user, data, c.now).first();
  }
  if (base === 0) {
    return c.db.prepare(
      'INSERT INTO planners (user, data, rev, updated_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(user) DO NOTHING RETURNING rev, updated_at'
    ).bind(user, data, c.now).first();
  }
  return c.db.prepare(
    'UPDATE planners SET data = ?2, rev = rev + 1, updated_at = ?3 WHERE user = ?1 AND rev = ?4 RETURNING rev, updated_at'
  ).bind(user, data, c.now, base).first();
}

async function getState(c) {
  const s = await needUser(c);
  const who = c.url.searchParams.get('user');
  if (who && who !== s.user) throw new HttpError(403, 'wrong_user');
  const since = Number(c.url.searchParams.get('since'));
  const row = await c.db.prepare(
    'SELECT rev, updated_at, CASE WHEN rev = ?2 THEN NULL ELSE data END AS data FROM planners WHERE user = ?1'
  ).bind(s.user, Number.isInteger(since) ? since : -1).first();
  if (!row) return json({ rev: 0, updated_at: 0, state: null });
  if (row.data === null) return send(null, 204);
  return send('{"rev":' + row.rev + ',"updated_at":' + row.updated_at + ',"state":' + row.data + '}', 200, { 'Content-Type': 'application/json; charset=utf-8' });
}

async function putState(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  /* the tab says whose planner this is; if the browser's login changed meanwhile, refuse */
  if (b.user !== undefined && b.user !== s.user) throw new HttpError(403, 'wrong_user');
  const free = s.kind === 'free';
  const data = stateText(b.state, free ? MAX_STATE_FREE : MAX_STATE);
  /* open sign-ups: an outside account can't flood the database with writes */
  if (free) await hit(c, 'save:' + s.user, SAVES_FREE, WINDOW, 'slow');
  let base = null;
  if (b.force !== true) {
    if (!Number.isInteger(b.rev) || b.rev < 0) throw new HttpError(400, 'rev');
    base = b.rev;
  }
  const out = await writePlanner(c, s.user, data, base);
  if (!out) {
    const cur = await c.db.prepare('SELECT rev, updated_at FROM planners WHERE user = ?').bind(s.user).first();
    throw new HttpError(409, 'conflict', { rev: cur ? cur.rev : 0, updated_at: cur ? cur.updated_at : 0 });
  }
  return json({ rev: out.rev, updated_at: out.updated_at });
}

async function starter(c) {
  const s = await needUser(c);
  return json({ starter: s.user === ADMIN ? MAURO_START : null });
}

/* =========================================================
   MyIB Plus: class code, live calendar
   ========================================================= */
async function unlock(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  if (s.kind !== 'class') throw new HttpError(403, 'class_only');
  const key = 'code:' + s.user;
  const n = await hit(c, key, CODE_TRIES, WINDOW);
  const code = typeof b.code === 'string' ? b.code.normalize('NFC').trim().toUpperCase() : '';
  const ok = code.length > 0 && code.length <= 200 && sameText(await sha256hex(code), CLASS_CODE_SHA256);
  if (!ok) throw new HttpError(403, 'code', { left: Math.max(0, CODE_TRIES - n) });
  let plus = s.plus;
  if (s.user !== ADMIN && !plus) {
    await c.db.prepare("UPDATE users SET plus = 'class' WHERE id = ?").bind(s.user).run();
    plus = 'class';
  }
  await c.db.prepare('DELETE FROM attempts WHERE key = ?').bind(key).run();
  return json(await payload(c, sessionAccount(s), plus, s.cal));
}

/* Someone outside the class can delete their own account (after /api/reauth). */
async function deleteAccount(c) {
  const s = await needUser(c);
  if (s.kind !== 'free') throw new HttpError(403, 'class');
  if (!(s.reauth > c.now)) throw new HttpError(403, 'reauth');
  await removeFree(c, s.user);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(c, '', 0) });
}
function removeFree(c, id) {
  return c.db.batch([
    c.db.prepare('DELETE FROM planners WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id),
    c.db.prepare("DELETE FROM users WHERE id = ?1 AND kind = 'free'").bind(id),
    c.db.prepare('DELETE FROM attempts WHERE key IN (?1, ?2) OR substr(key, 1, ?3) = ?4').bind('name:' + id, 'code:' + id, ('login:' + id + ':').length, 'login:' + id + ':')
  ]);
}

async function newCalendarLink(c) {
  const s = await needUser(c);
  if (!plusOf(s.user, s.plus)) throw new HttpError(403, 'plus');
  const token = randomToken(24);
  await c.db.prepare('UPDATE users SET cal_token = ? WHERE id = ?').bind(token, s.user).run();
  return json({ cal: token });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function icsText(s) { return String(s).replace(/\r/g, '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsFold(line) {
  if (line.length <= 25) return line;          /* 25 UTF-16 units can't pass 75 bytes */
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0), n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function plusDays(iso, n) {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
function buildICS(st, name) {
  const subjects = new Map((Array.isArray(st.subjects) ? st.subjects : [])
    .filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyIB//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText('MyIB · ' + name), 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H'];
  const events = (Array.isArray(st.events) ? st.events : [])
    .filter((e) => e && typeof e.id === 'string' && DATE_RE.test(e.start))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const e of events) {
    const s = subjects.get(e.subject);
    const sName = s && typeof s.name === 'string' ? s.name : '';
    const title = typeof e.title === 'string' ? e.title : '';
    const detail = typeof e.detail === 'string' ? e.detail : '';
    const head = [sName, title].filter(Boolean).join(' · ') || detail || 'Untitled';
    const full = head + (detail && detail !== head ? ' · ' + detail : '');
    const end = DATE_RE.test(e.end) && e.end > e.start ? e.end : e.start;
    L.push('BEGIN:VEVENT', 'UID:' + icsText(e.id) + '@myib.app', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + e.start.replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + plusDays(end, 1).replace(/-/g, ''),
      'SUMMARY:' + icsText(full));
    if (typeof e.note === 'string' && e.note) L.push('DESCRIPTION:' + icsText(e.note.slice(0, 2000)));
    if (sName) L.push('CATEGORIES:' + icsText(sName));
    L.push('TRANSP:TRANSPARENT');
    if ((e.type === 'deadline' || e.type === 'exam') && !e.done) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(full), 'TRIGGER:-PT15H', 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}

async function calendarFeed(c, rest, head) {
  const m = /^([A-Za-z0-9_-]{32})\.ics$/.exec(rest);
  if (!m) throw new HttpError(404, 'not_found');
  const row = await c.db.prepare(
    'SELECT u.id, u.plus, u.name, u.kind, p.data FROM users u LEFT JOIN planners p ON p.user = u.id WHERE u.cal_token = ?'
  ).bind(m[1]).first();
  if (!row || !(NAMES.has(row.id) || row.kind === 'free') || !plusOf(row.id, row.plus)) throw new HttpError(404, 'not_found');
  let st = null;
  try { st = row.data ? JSON.parse(row.data) : null; } catch (e) { st = null; }
  const text = buildICS(st && typeof st === 'object' ? st : {}, NAMES.get(row.id) || row.name || row.id);
  return send(head ? null : text, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'private, max-age=900',
    'Content-Disposition': 'inline; filename="myib.ics"'
  });
}

/* =========================================================
   Admin (Mauro only)
   ========================================================= */
async function adminUsers(c) {
  await needAdmin(c);
  const res = await c.db.batch([
    c.db.prepare('SELECT id, name, kind, pw IS NOT NULL AS claimed, reset IS NOT NULL AS locked, created_at, last_login, plus FROM users'),
    c.db.prepare('SELECT user, rev, updated_at, length(data) AS size FROM planners')
  ]);
  const rows = res[0].results || [];
  const U = new Map(rows.map((r) => [r.id, r]));
  const P = new Map((res[1].results || []).map((r) => [r.user, r]));
  function info(id, name, kind) {
    const a = U.get(id) || {}, p = P.get(id) || {};
    return {
      id, name, kind, admin: id === ADMIN, claimed: !!a.claimed, reset: !a.claimed && !!a.locked,
      created_at: a.created_at || null, last_login: a.last_login || null, plus: plusOf(id, a.plus),
      rev: p.rev || 0, updated_at: p.updated_at || null, size: p.size || 0
    };
  }
  const others = rows.filter((r) => r.kind === 'free' && isFreeId(r.id))
    .sort((a, b) => (b.last_login || b.created_at || 0) - (a.last_login || a.created_at || 0))
    .slice(0, MAX_FREE)
    .map((r) => info(r.id, r.name || r.id, 'free'));
  return json({ users: USERS.map(([id, name]) => info(id, name, 'class')), others });
}

async function adminReset(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const acct = await needAccount(c, b.user), id = acct.id;
  if (id === ADMIN) throw new HttpError(400, 'self');
  /* the password goes; a one-time reset code (only its hash is kept) lets the real person make a new one */
  const code = newResetCode(), hash = await sha256hex(normCode(code));
  const res = await c.db.batch([
    acct.kind === 'class'
      ? c.db.prepare('INSERT INTO users (id, pw, reset) VALUES (?1, NULL, ?2) ON CONFLICT(id) DO UPDATE SET pw = NULL, reset = excluded.reset').bind(id, hash)
      : c.db.prepare("UPDATE users SET pw = NULL, reset = ?2 WHERE id = ?1 AND kind = 'free'").bind(id, hash),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM attempts WHERE key = ?1 OR substr(key, 1, ?2) = ?3').bind('code:' + id, ('login:' + id + ':').length, 'login:' + id + ':')
  ]);
  /* an outside account deleted a moment ago gets no code */
  if (!res[0].meta || !res[0].meta.changes) throw new HttpError(400, 'user');
  return json({ ok: true, code });
}

async function adminErase(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const { id } = await needAccount(c, b.user);
  if (id === ADMIN) throw new HttpError(400, 'self');
  await c.db.batch([
    c.db.prepare('DELETE FROM planners WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id)
  ]);
  return json({ ok: true });
}

async function adminExport(c) {
  await needAdmin(c);
  const acct = await needAccount(c, c.url.searchParams.get('user')), id = acct.id;
  const row = await c.db.prepare('SELECT data, rev FROM planners WHERE user = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'empty');
  const iso = new Date(c.now).toISOString();
  const text = '{"app":"myib","version":3,"user":' + JSON.stringify(id) + ',"name":' + JSON.stringify(acct.name) +
    ',"exported":' + JSON.stringify(iso) + ',"rev":' + row.rev + ',"data":' + row.data + '}';
  return send(text, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="myib-' + id + '-' + iso.slice(0, 10) + '.json"'
  });
}

async function adminImport(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const acct = await needAccount(c, b.user), id = acct.id;
  let d = b.data;
  if (d && typeof d === 'object' && (d.app === 'myib' || d.app === 'ib-planner') && d.data) d = d.data;
  const out = await writePlanner(c, id, stateText(d, acct.kind === 'free' ? MAX_STATE_FREE : MAX_STATE), null);
  return json({ rev: out.rev, updated_at: out.updated_at });
}

async function adminPlus(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const acct = await needAccount(c, b.user), id = acct.id;
  if (id === ADMIN) throw new HttpError(400, 'self');
  const plus = b.on === true ? 'gift' : null;
  const r = acct.kind === 'class'
    ? await c.db.prepare('INSERT INTO users (id, plus) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET plus = excluded.plus').bind(id, plus).run()
    : await c.db.prepare("UPDATE users SET plus = ?2 WHERE id = ?1 AND kind = 'free'").bind(id, plus).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(400, 'user');
  return json({ ok: true, plus });
}

/* Saves only the settings the request names: bizum, price, papers. null puts price or papers back to the default. */
async function adminConfig(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const put = (key, value) => c.db.prepare('INSERT INTO config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value);
  const drop = (key) => c.db.prepare('DELETE FROM config WHERE key = ?1').bind(key);
  const writes = [];
  if (b.bizum !== undefined) {
    const bizum = typeof b.bizum === 'string' ? b.bizum.trim().replace(/\s+/g, ' ') : '';
    if (bizum && !/^\+?[0-9 ]{6,20}$/.test(bizum)) throw new HttpError(400, 'bizum');
    /* an empty value is saved too: it hides the number instead of falling back to the default */
    writes.push(put('bizum', bizum));
  }
  if (b.price !== undefined) writes.push(b.price === null ? drop('price') : put('price', JSON.stringify(cleanPrice(b.price))));
  if (b.papers !== undefined) {
    writes.push(b.papers === null ? drop('papers') : put('papers', JSON.stringify(Object.assign(cleanPapers(b.papers), { updated: c.now }))));
  }
  if (!writes.length) throw new HttpError(400, 'empty');
  await c.db.batch(writes);
  return json(await readConf(c));
}

async function adminDelete(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const acct = await needAccount(c, b.user);
  if (acct.kind !== 'free') throw new HttpError(400, 'class');
  await removeFree(c, acct.id);
  return json({ ok: true });
}
