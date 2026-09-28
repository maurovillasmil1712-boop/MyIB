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
const MAX_STATE_FREE = 300 * 1024;
const AVATAR_MAX = 120 * 1024;       /* a profile picture: a 320×320 JPEG the app makes, about 30 KB */   /* 500 outside accounts × 300 KB stays far under the database limit */

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
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
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
  'POST /api/admin/delete': adminDelete,
  'PUT /api/avatar': putAvatar,
  'DELETE /api/avatar': deleteAvatar,
  'POST /api/admin/avatar': adminAvatar,
  'GET /api/chat/people': chatPeople,
  'GET /api/chat/find': chatFind,
  'GET /api/chat/list': chatList,
  'GET /api/chat/unread': chatUnread,
  'GET /api/chat/msgs': chatMsgs,
  'POST /api/chat/send': chatSend,
  'POST /api/chat/dm': chatDm,
  'POST /api/chat/group': chatGroup,
  'POST /api/chat/add': chatAdd,
  'POST /api/chat/rename': chatRename,
  'POST /api/chat/leave': chatLeave,
  'POST /api/chat/accept': chatAccept,
  'POST /api/chat/block': chatBlock,
  'POST /api/chat/unsend': chatUnsend,
  'POST /api/chat/report': chatReport,
  'GET /api/admin/reports': adminReports,
  'POST /api/admin/report': adminReport,
  'POST /api/admin/chat': adminChat
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
  if (method === 'GET' && path.startsWith('/api/avatar/')) return getAvatar(c, path.slice(12), head);
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
      db.prepare('CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)'),
      db.prepare('CREATE TABLE IF NOT EXISTS avatars (user TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
      /* chat */
      db.prepare('CREATE TABLE IF NOT EXISTS convs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT, created_by TEXT, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0)'),
      db.prepare('CREATE TABLE IF NOT EXISTS members (conv TEXT NOT NULL, user TEXT NOT NULL, state TEXT NOT NULL, read_seq INTEGER NOT NULL DEFAULT 0, from_seq INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, added_by TEXT, PRIMARY KEY (conv, user)) WITHOUT ROWID'),
      db.prepare('CREATE INDEX IF NOT EXISTS members_user ON members (user, state)'),
      db.prepare('CREATE TABLE IF NOT EXISTS messages (conv TEXT NOT NULL, seq INTEGER NOT NULL, user TEXT, body TEXT NOT NULL, at INTEGER NOT NULL, sys INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, PRIMARY KEY (conv, seq)) WITHOUT ROWID'),
      db.prepare('CREATE INDEX IF NOT EXISTS messages_deleted ON messages (conv, deleted_at) WHERE deleted_at IS NOT NULL'),
      db.prepare('CREATE TABLE IF NOT EXISTS blocks (user TEXT NOT NULL, blocked TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user, blocked)) WITHOUT ROWID'),
      db.prepare('CREATE TABLE IF NOT EXISTS chat_bans (user TEXT PRIMARY KEY, at INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS reports (conv TEXT NOT NULL, seq INTEGER NOT NULL, reporter TEXT NOT NULL, sender TEXT, body TEXT, at INTEGER NOT NULL, PRIMARY KEY (conv, seq, reporter))'),
      db.prepare("INSERT OR IGNORE INTO convs (id, kind, name, created_by, created_at, last_at, last_seq) VALUES ('suggestions', 'channel', 'Suggestions', 'mauro', 0, 0, 0)")
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
  const [conf, av] = await Promise.all([readConf(c), c.db.prepare('SELECT updated_at FROM avatars WHERE user = ?').bind(id).first()]);
  return Object.assign({
    user: { id, name: acct.name, kind: acct.kind, admin: id === ADMIN, plus, avatar: av ? av.updated_at : null },
    cal: plus && cal ? cal : null
  }, conf);
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
  if (rudeText(name) || rudeText(id)) throw new HttpError(400, 'words');
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
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM members WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM blocks WHERE user = ?1 OR blocked = ?1').bind(id),
    c.db.prepare('DELETE FROM chat_bans WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM reports WHERE sender = ?1 OR reporter = ?1').bind(id)
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

/* Anyone can delete their own account (after /api/reauth), except Mauro's admin account. */
async function deleteAccount(c) {
  const s = await needUser(c);
  if (s.user === ADMIN) throw new HttpError(403, 'admin');
  if (!(s.reauth > c.now)) throw new HttpError(403, 'reauth');
  await (s.kind === 'free' ? removeFree(c, s.user) : removeClass(c, s.user));
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(c, '', 0) });
}
function removeFree(c, id) {
  return c.db.batch([
    c.db.prepare("DELETE FROM users WHERE id = ?1 AND kind = 'free'").bind(id),
    ...accountWipe(c, id)
  ]);
}
/* A class member deletes their account: the name goes back on the class list, locked.
   Nobody knows the new code, so Mauro makes a setup code before anyone can use the name again. */
async function removeClass(c, id) {
  const lock = await sha256hex(randomToken(24));
  return c.db.batch([
    c.db.prepare('UPDATE users SET pw = NULL, reset = ?2, plus = NULL, cal_token = NULL, last_login = NULL WHERE id = ?1').bind(id, lock),
    ...accountWipe(c, id),
    c.db.prepare('DELETE FROM reports WHERE sender = ?1').bind(id)
  ]);
}
/* everything an account leaves behind: planner, photo, logins, and its chats */
function accountWipe(c, id) {
  const dms = "SELECT conv FROM members WHERE user = ?1 AND substr(conv, 1, 3) = 'dm:'";
  return [
    c.db.prepare('DELETE FROM planners WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM avatars WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM sessions WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM attempts WHERE key IN (?1, ?2) OR substr(key, 1, ?3) = ?4').bind('name:' + id, 'code:' + id, ('login:' + id + ':').length, 'login:' + id + ':'),
    /* chat: their direct chats go for both people; in groups their messages show as deleted */
    c.db.prepare('DELETE FROM messages WHERE conv IN (' + dms + ')').bind(id),
    c.db.prepare('DELETE FROM convs WHERE id IN (' + dms + ')').bind(id),
    c.db.prepare('DELETE FROM members WHERE conv IN (' + dms + ')').bind(id),
    c.db.prepare("UPDATE messages SET body = '', deleted_at = ?2 WHERE user = ?1 AND sys = 0 AND deleted_at IS NULL").bind(id, c.now),
    c.db.prepare('DELETE FROM members WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM blocks WHERE user = ?1 OR blocked = ?1').bind(id),
    c.db.prepare('DELETE FROM chat_bans WHERE user = ?1').bind(id),
    c.db.prepare('DELETE FROM reports WHERE reporter = ?1').bind(id)
  ];
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
    c.db.prepare('SELECT user, rev, updated_at, length(data) AS size FROM planners'),
    c.db.prepare('SELECT user, updated_at FROM avatars'),
    c.db.prepare('SELECT user FROM chat_bans')
  ]);
  const rows = res[0].results || [];
  const U = new Map(rows.map((r) => [r.id, r]));
  const P = new Map((res[1].results || []).map((r) => [r.user, r]));
  const A = new Map((res[2].results || []).map((r) => [r.user, r.updated_at]));
  const B = new Set((res[3].results || []).map((r) => r.user));
  function info(id, name, kind) {
    const a = U.get(id) || {}, p = P.get(id) || {};
    return {
      id, name, kind, admin: id === ADMIN, claimed: !!a.claimed, reset: !a.claimed && !!a.locked,
      created_at: a.created_at || null, last_login: a.last_login || null, plus: plusOf(id, a.plus),
      rev: p.rev || 0, updated_at: p.updated_at || null, size: p.size || 0, avatar: A.get(id) || null, chat_off: B.has(id)
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

/* =========================================================
   Profile pictures: only people logged in to MyIB can see them
   ========================================================= */
function unb64(s) {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getAvatar(c, rest, head) {
  await needUser(c);
  let id = '';
  try { id = userId(decodeURIComponent(rest)); } catch (e) { id = ''; }
  if (!(NAMES.has(id) || FREE_ID.test(id))) throw new HttpError(404, 'not_found');
  const row = await c.db.prepare('SELECT data FROM avatars WHERE user = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'not_found');
  return send(head ? null : unb64(row.data), 200, {
    'Content-Type': 'image/jpeg',
    /* the app asks for ?v=<time of the upload>, so a new photo gets a new address */
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Disposition': 'inline; filename="avatar.jpg"'
  });
}
/* the app crops and shrinks the photo itself and sends a small JPEG */
async function putAvatar(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const m = typeof b.image === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.image) : null;
  if (!m) throw new HttpError(400, 'image');
  let bytes;
  try { bytes = unb64(m[1]); } catch (e) { throw new HttpError(400, 'image'); }
  if (bytes.length > AVATAR_MAX) throw new HttpError(413, 'too_big');
  if (bytes.length < 125 || bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) throw new HttpError(400, 'image');
  await hit(c, 'avatar:' + s.user, 30, 60 * MIN, 'slow');
  await c.db.prepare(
    'INSERT INTO avatars (user, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(s.user, m[1], c.now).run();
  return json({ avatar: c.now });
}
async function deleteAvatar(c) {
  const s = await needUser(c);
  await c.db.prepare('DELETE FROM avatars WHERE user = ?').bind(s.user).run();
  return json({ avatar: null });
}
/* Mauro can take down anyone's photo */
async function adminAvatar(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const { id } = await needAccount(c, b.user);
  await c.db.prepare('DELETE FROM avatars WHERE user = ?').bind(id).run();
  return json({ ok: true });
}

/* =========================================================
   Chat: direct messages, groups and the Suggestions channel.
   No sockets on the free plan: the app asks for new messages every few seconds while a
   chat is open, and far less often everywhere else. Messages are plain text.
   Classmates reach each other directly; anyone else starts as a request to accept.
   ========================================================= */
const CHANNEL = 'suggestions';
const GROUP_MAX = 50;               /* people in one group, you included */
const MSG_MAX = 2000;               /* characters in one message */
const PAGE = 50;                    /* messages per page when a chat opens or scrolls back */
const MSGS_PER_WINDOW = 150;        /* messages per person per 15 min */
const SUGGESTIONS_PER_HOUR = 10;
const CONV_ID = /^(dm:[a-z0-9_.]{1,20}:[a-z0-9_.]{1,20}|g:[A-Za-z0-9_-]{12}|suggestions)$/;

/* Words MyIB doesn't allow in chat, group names, names or usernames (App Store rule 1.2).
   Matching ignores case, accents, stretched letters and numbers standing in for letters. */
const BLOCKED_WORDS = [
  'nigger', 'niggers', 'nigga', 'niggas', 'negrata', 'negratas', 'faggot', 'faggots', 'fag', 'fags', 'tranny', 'trannies',
  'maricon', 'maricones', 'marica', 'maricas', 'bollera', 'bolleras', 'chink', 'chinks', 'spic', 'spics', 'kike', 'kikes',
  'wetback', 'wetbacks', 'sudaca', 'sudacas', 'retard', 'retards', 'retarded', 'subnormal', 'subnormales',
  'mongolo', 'mongola', 'mongolos', 'mongolas', 'slut', 'sluts', 'whore', 'whores', 'puta', 'putas', 'zorra', 'zorras',
  'kill yourself', 'kill urself', 'kys', 'suicidate', 'matate', 'tirate por un puente', 'tirate de un puente',
  'ojala te mueras', 'ojala te murieras'
];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
function squash(v) {
  return String(v).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[013457@$]/g, (ch) => LEET[ch])
    .replace(/([a-z])\1{2,}/g, '$1$1').split(/[^a-z]+/).filter(Boolean).join(' ');
}
const BLOCKED = BLOCKED_WORDS.map(squash);
function rudeText(v) {
  const t = ' ' + squash(v) + ' ';
  return BLOCKED.some((w) => t.includes(' ' + w + ' '));
}

function convId(v) {
  if (typeof v !== 'string' || !CONV_ID.test(v)) throw new HttpError(400, 'conv');
  return v;
}
function dmId(a, b) { return 'dm:' + (a < b ? a + ':' + b : b + ':' + a); }
function dmPartner(conv, me) { const p = conv.split(':'); return p[1] === me ? p[2] : p[1]; }
/* classmates skip the request step */
function trusted(a, b) { return NAMES.has(a) && NAMES.has(b); }
function nameOf(id, stored) { return NAMES.get(id) || stored || null; }
function seqParam(v) {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'seq');
  return n;
}
function seqOf(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'seq');
  return n;
}
function sysBody(o) { return JSON.stringify(o); }

/* your place in a chat. Everyone reads the Suggestions channel. */
async function membership(c, s, conv) {
  const row = await c.db.prepare(
    'SELECT c.kind, c.name, c.created_by, c.last_seq, m.state, m.read_seq, m.from_seq, ' +
    '(SELECT 1 FROM chat_bans WHERE user = ?2) AS banned ' +
    'FROM convs c LEFT JOIN members m ON m.conv = c.id AND m.user = ?2 WHERE c.id = ?1'
  ).bind(conv, s.user).first();
  if (!row) throw new HttpError(404, 'conv');
  if (row.kind === 'channel') {
    if (!row.state) { row.state = 'in'; row.read_seq = 0; row.from_seq = 0; row.fresh = true; }
  } else if (row.state !== 'in' && row.state !== 'req') {
    throw new HttpError(404, 'conv');
  }
  return row;
}

/* the next message in a chat (or a note like "Ana added Luca"), numbered in order */
function messageStmts(c, conv, user, body, sys) {
  return [
    c.db.prepare('UPDATE convs SET last_seq = last_seq + 1, last_at = ?2 WHERE id = ?1').bind(conv, c.now),
    c.db.prepare('INSERT INTO messages (conv, seq, user, body, at, sys) VALUES (?1, (SELECT last_seq FROM convs WHERE id = ?1), ?2, ?3, ?4, ?5) RETURNING seq')
      .bind(conv, user, body, c.now, sys ? 1 : 0),
    c.db.prepare('UPDATE members SET read_seq = (SELECT last_seq FROM convs WHERE id = ?1) WHERE conv = ?1 AND user = ?2').bind(conv, user)
  ];
}
/* a chat nobody is in any more goes (a direct chat stays while a request waits in it) */
function cleanupStmts(c, conv, dm) {
  return [
    c.db.prepare("DELETE FROM convs WHERE id = ?1 AND kind <> 'channel' AND NOT EXISTS (SELECT 1 FROM members WHERE conv = ?1 AND (state = 'in' OR (state = 'req' AND ?2)))").bind(conv, dm ? 1 : 0),
    c.db.prepare('DELETE FROM messages WHERE conv = ?1 AND NOT EXISTS (SELECT 1 FROM convs WHERE id = ?1)').bind(conv),
    c.db.prepare('DELETE FROM members WHERE conv = ?1 AND NOT EXISTS (SELECT 1 FROM convs WHERE id = ?1)').bind(conv)
  ];
}
function leaveStmt(c, conv, user) {
  return c.db.prepare(
    "UPDATE members SET state = 'left', from_seq = (SELECT last_seq FROM convs WHERE id = ?1), read_seq = (SELECT last_seq FROM convs WHERE id = ?1) WHERE conv = ?1 AND user = ?2"
  ).bind(conv, user);
}
async function blockedPair(c, a, b) {
  return !!(await c.db.prepare('SELECT 1 AS x FROM blocks WHERE (user = ?1 AND blocked = ?2) OR (user = ?2 AND blocked = ?1) LIMIT 1').bind(a, b).first());
}
function notBanned(m) { if (m.banned) throw new HttpError(403, 'chat_off'); }
async function needChat(c, s) {
  if (await c.db.prepare('SELECT 1 AS x FROM chat_bans WHERE user = ?1').bind(s.user).first()) throw new HttpError(403, 'chat_off');
}
/* people you can add: set-up accounts, not you, no block either way */
async function chatTargets(c, s, list, max) {
  if (!Array.isArray(list) || !list.length || list.length > max) throw new HttpError(400, 'users');
  const ids = [...new Set(list.map(userId))].filter((id) => id !== s.user && (NAMES.has(id) || isFreeId(id)));
  if (!ids.length) return [];
  const j = JSON.stringify(ids);
  const res = await c.db.batch([
    c.db.prepare('SELECT id, kind FROM users WHERE pw IS NOT NULL AND id IN (SELECT value FROM json_each(?1))').bind(j),
    c.db.prepare('SELECT user, blocked FROM blocks WHERE (user = ?1 AND blocked IN (SELECT value FROM json_each(?2))) OR (blocked = ?1 AND user IN (SELECT value FROM json_each(?2)))').bind(s.user, j)
  ]);
  const ok = new Set((res[0].results || []).filter((r) => NAMES.has(r.id) || (r.kind === 'free' && isFreeId(r.id))).map((r) => r.id));
  const off = new Set((res[1].results || []).map((r) => (r.user === s.user ? r.blocked : r.user)));
  return ids.filter((id) => ok.has(id) && !off.has(id));
}
/* name null: the account is gone */
function person(r) { return { id: r.id, name: nameOf(r.id, r.name), avatar: r.avatar || null, free: !NAMES.has(r.id) }; }

/* your classmates with an account; people outside the class are found by exact username */
async function chatPeople(c) {
  const s = await needUser(c);
  const ids = USERS.map((u) => u[0]).filter((id) => id !== s.user);
  const { results } = await c.db.prepare(
    'SELECT u.id, a.updated_at AS avatar FROM users u LEFT JOIN avatars a ON a.user = u.id WHERE u.pw IS NOT NULL AND u.id IN (SELECT value FROM json_each(?1))'
  ).bind(JSON.stringify(ids)).all();
  const av = new Map((results || []).map((r) => [r.id, r.avatar]));
  return json({
    dev: ADMIN,
    people: ids.filter((id) => av.has(id)).map((id) => ({ id, name: NAMES.get(id), avatar: av.get(id) || null, free: false }))
  });
}
async function chatFind(c) {
  const s = await needUser(c);
  const id = userId(c.url.searchParams.get('u')).replace(/^@/, '');
  if (!(NAMES.has(id) || FREE_ID.test(id))) return json({ person: null });
  await hit(c, 'find:' + s.user, 60, 60 * MIN, 'slow');
  const r = await c.db.prepare(
    'SELECT u.id, u.name, u.kind, a.updated_at AS avatar FROM users u LEFT JOIN avatars a ON a.user = u.id WHERE u.id = ?1 AND u.pw IS NOT NULL'
  ).bind(id).first();
  if (!r || id === s.user || !(NAMES.has(id) || (r.kind === 'free' && isFreeId(id)))) return json({ person: null });
  return json({ person: person(r) });
}

async function chatList(c) {
  const s = await needUser(c);
  const me = s.user, admin = me === ADMIN;
  const q = [
    /* everyone is in Suggestions; joining starts with everything read */
    c.db.prepare("INSERT OR IGNORE INTO members (conv, user, state, read_seq, from_seq, joined_at) SELECT id, ?1, 'in', last_seq, 0, ?2 FROM convs WHERE id = ?3").bind(me, c.now, CHANNEL),
    /* a direct chat with no messages yet shows only for the person who opened it */
    c.db.prepare(
      "SELECT c.id, c.kind, c.name, c.created_by, c.last_seq, c.last_at, m.state, m.read_seq, m.from_seq FROM members m JOIN convs c ON c.id = m.conv " +
      "WHERE m.user = ?1 AND m.state IN ('in', 'req') AND (c.kind <> 'dm' OR c.last_seq > m.from_seq OR c.created_by = ?1)"
    ).bind(me),
    c.db.prepare(
      "SELECT g.conv, g.seq, g.user, g.body, g.sys, g.deleted_at, u.name FROM members m JOIN convs c ON c.id = m.conv JOIN messages g ON g.conv = c.id AND g.seq = c.last_seq " +
      "LEFT JOIN users u ON u.id = g.user WHERE m.user = ?1 AND m.state IN ('in', 'req') AND c.last_seq > m.from_seq"
    ).bind(me),
    c.db.prepare(
      'SELECT o.conv, o.user AS id, o.state, u.name, u.kind, a.updated_at AS avatar FROM members m JOIN members o ON o.conv = m.conv AND o.user <> m.user ' +
      "LEFT JOIN users u ON u.id = o.user LEFT JOIN avatars a ON a.user = o.user WHERE m.user = ?1 AND m.state IN ('in', 'req') AND m.conv <> ?2"
    ).bind(me, CHANNEL),
    c.db.prepare('SELECT b.blocked AS id, u.name, u.kind, a.updated_at AS avatar FROM blocks b LEFT JOIN users u ON u.id = b.blocked LEFT JOIN avatars a ON a.user = b.blocked WHERE b.user = ?1').bind(me),
    c.db.prepare('SELECT 1 AS x FROM chat_bans WHERE user = ?1').bind(me)
  ];
  if (admin) q.push(c.db.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT conv, seq FROM reports)'));
  const res = await c.db.batch(q);
  const last = new Map((res[2].results || []).map((r) => [r.conv, r]));
  const people = new Map();
  for (const r of res[3].results || []) {
    if (!people.has(r.conv)) people.set(r.conv, []);
    people.get(r.conv).push(Object.assign(person(r), { state: r.state }));
  }
  const convs = (res[1].results || []).map((r) => {
    const l = last.get(r.id);
    return {
      id: r.id, kind: r.kind, name: r.name || null, by: r.created_by, last_seq: r.last_seq, last_at: r.last_at,
      state: r.state, read: r.read_seq, from: r.from_seq,
      last: l ? { seq: l.seq, user: l.user, name: nameOf(l.user, l.name), body: l.deleted_at ? '' : l.body, sys: l.sys, del: l.deleted_at ? 1 : 0 } : null,
      people: people.get(r.id) || []
    };
  });
  const out = {
    now: c.now, dev: ADMIN, off: !!(res[5].results && res[5].results.length),
    blocked: (res[4].results || []).map(person), convs
  };
  if (admin) out.reports = (res[6].results[0] || {}).n || 0;
  return json(out);
}

async function chatUnread(c) {
  const s = await needUser(c);
  const admin = s.user === ADMIN;
  const q = [c.db.prepare(
    "SELECT COUNT(*) AS n FROM members m JOIN convs c ON c.id = m.conv WHERE m.user = ?1 AND m.state IN ('in', 'req') AND c.last_seq > m.read_seq AND (c.kind <> 'channel' OR ?2)"
  ).bind(s.user, admin ? 1 : 0)];
  if (admin) q.push(c.db.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT conv, seq FROM reports)'));
  const res = await c.db.batch(q);
  const out = { unread: (res[0].results[0] || {}).n || 0 };
  if (admin) out.reports = (res[1].results[0] || {}).n || 0;
  return json(out);
}

/* after: new messages past that number; before: an older page; neither: the latest page.
   since: also report messages deleted since then. read=1: you're looking at the chat. */
async function chatMsgs(c) {
  const s = await needUser(c);
  const q = c.url.searchParams;
  const conv = convId(q.get('conv'));
  const m = await membership(c, s, conv);
  const from = m.from_seq || 0;
  const after = seqParam(q.get('after')), before = seqParam(q.get('before')), since = seqParam(q.get('since'));
  const cols = 'SELECT g.seq, g.user, g.body, g.at, g.sys, g.deleted_at, u.name, u.kind, a.updated_at AS avatar FROM messages g ' +
    'LEFT JOIN users u ON u.id = g.user LEFT JOIN avatars a ON a.user = g.user WHERE g.conv = ?1 AND g.seq > ?2';
  const stmts = [];
  if (after !== null) stmts.push(c.db.prepare(cols + ' ORDER BY g.seq LIMIT 200').bind(conv, Math.max(after, from)));
  else if (before !== null) stmts.push(c.db.prepare(cols + ' AND g.seq < ?3 ORDER BY g.seq DESC LIMIT ' + PAGE).bind(conv, from, before));
  else stmts.push(c.db.prepare(cols + ' ORDER BY g.seq DESC LIMIT ' + PAGE).bind(conv, from));
  /* 10 s of overlap, so a delete saved while this ran isn't missed */
  const del = after !== null && since !== null;
  if (del) stmts.push(c.db.prepare('SELECT seq FROM messages WHERE conv = ?1 AND deleted_at >= ?2 AND seq > ?3').bind(conv, since - 10000, from));
  const full = q.get('full') === '1';
  if (full && m.kind !== 'channel') {
    stmts.push(c.db.prepare(
      'SELECT o.user AS id, o.state, u.name, u.kind, a.updated_at AS avatar FROM members o LEFT JOIN users u ON u.id = o.user LEFT JOIN avatars a ON a.user = o.user WHERE o.conv = ?1'
    ).bind(conv));
  }
  if (full && m.kind === 'dm') {
    stmts.push(c.db.prepare('SELECT user FROM blocks WHERE (user = ?1 AND blocked = ?2) OR (user = ?2 AND blocked = ?1)').bind(s.user, dmPartner(conv, s.user)));
  }
  const res = await c.db.batch(stmts);
  const rows = res[0].results || [];
  if (after === null) rows.reverse();
  const people = {};
  const msgs = rows.map((r) => {
    if (r.user && !people[r.user]) people[r.user] = person({ id: r.user, name: r.name, kind: r.kind, avatar: r.avatar });
    return { seq: r.seq, user: r.user, body: r.deleted_at ? '' : r.body, at: r.at, sys: r.sys, del: r.deleted_at ? 1 : 0 };
  });
  const out = { now: c.now, msgs, people };
  if (del) out.deleted = (res[1].results || []).map((r) => r.seq);
  if (after === null) out.more = msgs.length ? msgs[0].seq > from + 1 : false;
  let read = m.read_seq || 0;
  if (q.get('read') === '1') {
    const top = Math.min(m.last_seq, msgs.length && after !== null ? msgs[msgs.length - 1].seq : after !== null ? after : before === null ? m.last_seq : 0);
    if (top > read || m.fresh) {
      read = Math.max(read, top);
      await (m.kind === 'channel'
        ? c.db.prepare("INSERT INTO members (conv, user, state, read_seq, from_seq, joined_at) VALUES (?1, ?2, 'in', ?3, 0, ?4) ON CONFLICT(conv, user) DO UPDATE SET read_seq = MAX(members.read_seq, excluded.read_seq)").bind(conv, s.user, read, c.now)
        : c.db.prepare('UPDATE members SET read_seq = MAX(read_seq, ?3) WHERE conv = ?1 AND user = ?2').bind(conv, s.user, read)).run();
    }
  }
  out.read = read;
  if (full) {
    let at = 1;
    if (del) at++;
    const info = { id: conv, kind: m.kind, name: m.name || null, by: m.created_by, state: m.state, last_seq: m.last_seq, from, off: !!m.banned, people: [] };
    if (m.kind !== 'channel') info.people = (res[at++].results || []).map((r) => Object.assign(person(r), { state: r.state }));
    if (m.kind === 'dm') {
      const b = res[at].results || [];
      info.blocked = b.some((r) => r.user === s.user);          /* you blocked them */
    }
    out.info = info;
  }
  return json(out);
}

async function chatSend(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const conv = convId(b.conv);
  const body = cleanText(b.body, MSG_MAX, true);
  if (body === null) throw new HttpError(400, 'long', { max: MSG_MAX });
  if (!body) throw new HttpError(400, 'empty');
  if (rudeText(body)) throw new HttpError(400, 'words');
  const m = await membership(c, s, conv);
  notBanned(m);
  if (m.state !== 'in') throw new HttpError(403, 'request');
  let dm = null;
  if (m.kind === 'dm') {
    dm = dmPartner(conv, s.user);
    if (await blockedPair(c, s.user, dm)) throw new HttpError(403, 'blocked');
  }
  await hit(c, 'msg:' + s.user, MSGS_PER_WINDOW, WINDOW, 'slow');
  if (m.kind === 'channel' && s.user !== ADMIN) await hit(c, 'sug:' + s.user, SUGGESTIONS_PER_HOUR, 60 * MIN, 'slow');
  /* the app sends retry after a lost answer: if the first try got through, don't post it twice */
  if (b.retry === true) {
    const dup = await c.db.prepare('SELECT seq, at FROM messages WHERE conv = ?1 AND seq > ?2 AND user = ?3 AND body = ?4 AND at > ?5 ORDER BY seq DESC LIMIT 1')
      .bind(conv, Math.max(0, m.last_seq - 30), s.user, body, c.now - 10 * MIN).first();
    if (dup) return json({ seq: dup.seq, at: dup.at });
  }
  const stmts = messageStmts(c, conv, s.user, body, false);
  if (dm) {
    /* someone who deleted this chat gets it back with the new message: as a request, unless you're classmates */
    stmts.push(c.db.prepare("UPDATE members SET state = ?3 WHERE conv = ?1 AND user = ?2 AND state = 'left'").bind(conv, dm, trusted(s.user, dm) ? 'in' : 'req'));
  }
  if (m.kind === 'channel' && m.fresh) {
    stmts.push(c.db.prepare("INSERT OR IGNORE INTO members (conv, user, state, read_seq, from_seq, joined_at) VALUES (?1, ?2, 'in', (SELECT last_seq FROM convs WHERE id = ?1), 0, ?3)").bind(conv, s.user, c.now));
  }
  let res;
  try { res = await c.db.batch(stmts); } catch (e) { throw new HttpError(409, 'conv'); }
  const row = res[1].results && res[1].results[0];
  return json({ seq: row ? row.seq : null, at: c.now });
}

async function chatDm(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const id = userId(b.user);
  if (id === s.user) throw new HttpError(400, 'self');
  const conv = NAMES.has(id) || isFreeId(id) ? dmId(s.user, id) : '';
  if (!conv) throw new HttpError(404, 'user');
  const res = await c.db.batch([
    c.db.prepare('SELECT id, kind FROM users WHERE id = ?1 AND pw IS NOT NULL').bind(id),
    c.db.prepare('SELECT 1 AS x FROM blocks WHERE (user = ?1 AND blocked = ?2) OR (user = ?2 AND blocked = ?1) LIMIT 1').bind(s.user, id),
    c.db.prepare('SELECT 1 AS x FROM chat_bans WHERE user = ?1').bind(s.user),
    c.db.prepare("SELECT state FROM members WHERE conv = ?1 AND user = ?2").bind(conv, s.user)
  ]);
  const u = res[0].results && res[0].results[0];
  if (!u || !(NAMES.has(id) || u.kind === 'free')) throw new HttpError(404, 'user');
  if (res[1].results && res[1].results.length) throw new HttpError(403, 'blocked');
  const mine = res[3].results && res[3].results[0];
  if (mine && mine.state === 'in') return json({ conv });
  if (res[2].results && res[2].results.length) throw new HttpError(403, 'chat_off');
  if (!mine) await hit(c, 'newchat:' + s.user, 40, 60 * MIN, 'slow');
  await c.db.batch([
    c.db.prepare("INSERT OR IGNORE INTO convs (id, kind, created_by, created_at, last_at, last_seq) VALUES (?1, 'dm', ?2, ?3, ?3, 0)").bind(conv, s.user, c.now),
    /* you: in (a request becomes accepted; a chat you deleted stays empty up to now) */
    c.db.prepare("INSERT INTO members (conv, user, state, read_seq, from_seq, joined_at) VALUES (?1, ?2, 'in', (SELECT last_seq FROM convs WHERE id = ?1), (SELECT last_seq FROM convs WHERE id = ?1), ?3) " +
      "ON CONFLICT(conv, user) DO UPDATE SET state = 'in'").bind(conv, s.user, c.now),
    c.db.prepare('INSERT OR IGNORE INTO members (conv, user, state, read_seq, from_seq, joined_at, added_by) VALUES (?1, ?2, ?4, (SELECT last_seq FROM convs WHERE id = ?1), (SELECT last_seq FROM convs WHERE id = ?1), ?3, ?5)')
      .bind(conv, id, c.now, trusted(s.user, id) ? 'in' : 'req', s.user)
  ]);
  return json({ conv });
}

function memberRows(ids, adder) { return JSON.stringify(ids.map((id) => ({ id, st: trusted(adder, id) ? 'in' : 'req' }))); }
const ADD_MEMBERS = "INSERT INTO members (conv, user, state, read_seq, from_seq, joined_at, added_by) " +
  "SELECT ?1, json_extract(j.value, '$.id'), json_extract(j.value, '$.st'), c.last_seq, c.last_seq, ?2, ?3 FROM json_each(?4) AS j, convs c WHERE c.id = ?1 " +
  'ON CONFLICT(conv, user) DO UPDATE SET state = excluded.state, read_seq = excluded.read_seq, from_seq = excluded.from_seq, joined_at = excluded.joined_at, added_by = excluded.added_by';

async function chatGroup(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const name = cleanText(b.name, 40);
  if (name === null) throw new HttpError(400, 'name');
  if (rudeText(name)) throw new HttpError(400, 'words');
  await needChat(c, s);
  const ids = await chatTargets(c, s, b.users, GROUP_MAX - 1);
  if (!ids.length) throw new HttpError(400, 'users');
  await hit(c, 'newchat:' + s.user, 40, 60 * MIN, 'slow');
  const conv = 'g:' + randomToken(9);
  await c.db.batch([
    c.db.prepare("INSERT INTO convs (id, kind, name, created_by, created_at, last_at, last_seq) VALUES (?1, 'group', ?2, ?3, ?4, ?4, 0)").bind(conv, name || null, s.user, c.now),
    c.db.prepare("INSERT INTO members (conv, user, state, read_seq, from_seq, joined_at, added_by) VALUES (?1, ?2, 'in', 0, 0, ?3, ?2)").bind(conv, s.user, c.now),
    c.db.prepare(ADD_MEMBERS).bind(conv, c.now, s.user, memberRows(ids, s.user)),
    ...messageStmts(c, conv, s.user, sysBody({ t: 'new', name: name || '' }), true)
  ]);
  return json({ conv });
}

async function groupOf(c, s, b) {
  const conv = convId(b.conv);
  const m = await membership(c, s, conv);
  if (m.kind !== 'group') throw new HttpError(400, 'group');
  if (m.state !== 'in') throw new HttpError(403, 'request');
  notBanned(m);
  return { conv, m };
}
async function chatAdd(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const { conv } = await groupOf(c, s, b);
  const { results } = await c.db.prepare("SELECT user FROM members WHERE conv = ?1 AND state IN ('in', 'req')").bind(conv).all();
  const now = new Set((results || []).map((r) => r.user));
  const ids = (await chatTargets(c, s, b.users, GROUP_MAX)).filter((id) => !now.has(id));
  if (!ids.length) throw new HttpError(400, 'users');
  if (now.size + ids.length > GROUP_MAX) throw new HttpError(400, 'full', { max: GROUP_MAX });
  await hit(c, 'chatop:' + s.user, 60, 60 * MIN, 'slow');
  /* people added later see the chat from here on */
  await c.db.batch([
    c.db.prepare(ADD_MEMBERS).bind(conv, c.now, s.user, memberRows(ids, s.user)),
    ...messageStmts(c, conv, s.user, sysBody({ t: 'add', who: ids }), true)
  ]);
  return json({ ok: true, added: ids });
}
async function chatRename(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const { conv, m } = await groupOf(c, s, b);
  const name = cleanText(b.name, 40);
  if (name === null) throw new HttpError(400, 'name');
  if (rudeText(name)) throw new HttpError(400, 'words');
  if (name === (m.name || '')) return json({ ok: true });
  await hit(c, 'chatop:' + s.user, 60, 60 * MIN, 'slow');
  await c.db.batch([
    c.db.prepare('UPDATE convs SET name = ?2 WHERE id = ?1').bind(conv, name || null),
    ...messageStmts(c, conv, s.user, sysBody({ t: 'name', name }), true)
  ]);
  return json({ ok: true });
}
/* leave a group, delete a direct chat (for you), or turn down a request */
async function chatLeave(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const conv = convId(b.conv);
  const m = await membership(c, s, conv);
  if (m.kind === 'channel') throw new HttpError(400, 'channel');
  const stmts = m.kind === 'group' && m.state === 'in' ? messageStmts(c, conv, s.user, sysBody({ t: 'left' }), true) : [];
  stmts.push(leaveStmt(c, conv, s.user), ...cleanupStmts(c, conv, m.kind === 'dm'));
  await c.db.batch(stmts);
  return json({ ok: true });
}
async function chatAccept(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const conv = convId(b.conv);
  const m = await membership(c, s, conv);
  if (m.state !== 'req') return json({ ok: true });
  const stmts = [c.db.prepare("UPDATE members SET state = 'in' WHERE conv = ?1 AND user = ?2 AND state = 'req'").bind(conv, s.user)];
  if (m.kind === 'group') stmts.push(...messageStmts(c, conv, s.user, sysBody({ t: 'join' }), true));
  await c.db.batch(stmts);
  return json({ ok: true });
}
async function chatBlock(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const id = userId(b.user);
  if (id === s.user || !(NAMES.has(id) || FREE_ID.test(id))) throw new HttpError(400, 'user');
  if (b.on === false) {
    await c.db.prepare('DELETE FROM blocks WHERE user = ?1 AND blocked = ?2').bind(s.user, id).run();
    return json({ ok: true, blocked: false });
  }
  await hit(c, 'chatop:' + s.user, 60, 60 * MIN, 'slow');
  const conv = dmId(s.user, id);
  await c.db.batch([
    c.db.prepare('INSERT OR IGNORE INTO blocks (user, blocked, at) VALUES (?1, ?2, ?3)').bind(s.user, id, c.now),
    /* your chat with them leaves your list, and so do their group invites */
    leaveStmt(c, conv, s.user),
    ...cleanupStmts(c, conv, true),
    c.db.prepare("UPDATE members SET state = 'left' WHERE user = ?1 AND state = 'req' AND added_by = ?2").bind(s.user, id)
  ]);
  return json({ ok: true, blocked: true });
}
async function chatUnsend(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const conv = convId(b.conv), seq = seqOf(b.seq);
  const m = await membership(c, s, conv);
  /* Mauro keeps Suggestions tidy */
  const mod = s.user === ADMIN && m.kind === 'channel';
  const r = await c.db.prepare(
    "UPDATE messages SET body = '', deleted_at = ?4 WHERE conv = ?1 AND seq = ?2 AND seq > ?6 AND sys = 0 AND deleted_at IS NULL AND (user = ?3 OR ?5)"
  ).bind(conv, seq, s.user, c.now, mod ? 1 : 0, m.from_seq || 0).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, 'message');
  return json({ ok: true });
}
async function chatReport(c) {
  const s = await needUser(c);
  const b = await readBody(c);
  const conv = convId(b.conv), seq = seqOf(b.seq);
  const m = await membership(c, s, conv);
  if (seq <= (m.from_seq || 0)) throw new HttpError(404, 'message');
  const g = await c.db.prepare('SELECT user, body, sys, deleted_at FROM messages WHERE conv = ?1 AND seq = ?2').bind(conv, seq).first();
  if (!g || g.sys || g.deleted_at || !g.user || g.user === s.user) throw new HttpError(404, 'message');
  await hit(c, 'report:' + s.user, 20, 60 * MIN, 'slow');
  /* a copy of the message, so a report still shows it after the sender deletes it */
  await c.db.prepare('INSERT OR IGNORE INTO reports (conv, seq, reporter, sender, body, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(conv, seq, s.user, g.user, g.body, c.now).run();
  return json({ ok: true });
}

/* Mauro: reported messages, newest first, one entry per message */
async function adminReports(c) {
  await needAdmin(c);
  const res = await c.db.batch([
    c.db.prepare(
      'SELECT r.conv, r.seq, r.reporter, r.sender, r.body, r.at, c.kind, c.name, g.seq AS live FROM reports r ' +
      'LEFT JOIN convs c ON c.id = r.conv LEFT JOIN messages g ON g.conv = r.conv AND g.seq = r.seq AND g.body = r.body AND g.deleted_at IS NULL ' +
      'ORDER BY r.at DESC LIMIT 300'
    ),
    c.db.prepare('SELECT user FROM chat_bans')
  ]);
  const rows = res[0].results || [];
  const ids = new Set();
  rows.forEach((r) => { ids.add(r.sender); ids.add(r.reporter); });
  const { results } = await c.db.prepare('SELECT u.id, u.name, u.kind, a.updated_at AS avatar FROM users u LEFT JOIN avatars a ON a.user = u.id WHERE u.id IN (SELECT value FROM json_each(?1))')
    .bind(JSON.stringify([...ids])).all();
  const who = new Map((results || []).map((r) => [r.id, person(r)]));
  const off = new Set((res[1].results || []).map((r) => r.user));
  const pick = (id) => who.get(id) || { id, name: NAMES.get(id) || null, avatar: null, free: !NAMES.has(id) };
  const byMsg = new Map();
  for (const r of rows) {
    const k = r.conv + '#' + r.seq;
    if (!byMsg.has(k)) {
      byMsg.set(k, {
        conv: r.conv, seq: r.seq, kind: r.kind || null, name: r.name || null, body: r.body, at: r.at,
        gone: !r.live, sender: Object.assign(pick(r.sender), { off: off.has(r.sender) }), by: []
      });
    }
    byMsg.get(k).by.push(pick(r.reporter));
  }
  return json({ reports: [...byMsg.values()] });
}
async function adminReport(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const conv = convId(b.conv), seq = seqOf(b.seq);
  const stmts = [];
  /* only the message that was reported: same number and same text as the report's copy */
  if (b.remove === true) {
    stmts.push(c.db.prepare(
      "UPDATE messages SET body = '', deleted_at = ?3 WHERE conv = ?1 AND seq = ?2 AND deleted_at IS NULL AND sys = 0 AND body IN (SELECT body FROM reports WHERE conv = ?1 AND seq = ?2)"
    ).bind(conv, seq, c.now));
  }
  stmts.push(c.db.prepare('DELETE FROM reports WHERE conv = ?1 AND seq = ?2').bind(conv, seq));
  await c.db.batch(stmts);
  return json({ ok: true });
}
/* Mauro can turn chat off for one account: they still read, but can't send */
async function adminChat(c) {
  await needAdmin(c);
  const b = await readBody(c);
  const { id } = await needAccount(c, b.user);
  if (id === ADMIN) throw new HttpError(400, 'self');
  await (b.off === true
    ? c.db.prepare('INSERT OR IGNORE INTO chat_bans (user, at) VALUES (?1, ?2)').bind(id, c.now)
    : c.db.prepare('DELETE FROM chat_bans WHERE user = ?1').bind(id)).run();
  return json({ ok: true, off: b.off === true });
}
