/* MyIB: app logic. Vanilla JS, no build step.
   Each person's planner lives in their MyIB account (the /api server, stored in
   Cloudflare D1). This browser keeps a copy so the app opens offline. */
(function () {
  'use strict';

  /* =========================================================
     Helpers
     ========================================================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var HEX = /^#[0-9a-f]{6}$/i;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  var ID = /^[\w-]{1,48}$/;
  var TYPES = ['deadline', 'exam', 'mock', 'holiday', 'grades', 'other'];
  var TYPE_ORDER = { exam: 0, deadline: 1, grades: 2, other: 3, mock: 4, holiday: 5 };
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var PALETTE = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7', '#32ADE6', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93'];
  /* v1 colours → iOS system colours (only applied to colours nobody changed) */
  var V1_COLORS = { '#EE7418': '#FF9500', '#F0C814': '#FFCC00', '#0FAE9B': '#00C7BE', '#3D8BF2': '#007AFF', '#5A3CC8': '#5856D6', '#1F7A36': '#34C759', '#64748B': '#8E8E93', '#E54F8B': '#FF2D55', '#74C442': '#32ADE6', '#B8B0A6': '#A2845E', '#B044D8': '#AF52DE', '#92400E': '#FF3B30' };

  function uid(prefix) {
    var rnd = '';
    try {
      var a = new Uint32Array(2); crypto.getRandomValues(a);
      rnd = a[0].toString(36) + a[1].toString(36).slice(0, 3);
    } catch (e) { rnd = Math.random().toString(36).slice(2, 10); }
    return (prefix || 'x') + '-' + rnd;
  }
  function clip(v, max, multiline) {
    var s = String(v == null ? '' : v);
    if (!multiline) s = s.replace(/\s+/g, ' ');
    return s.slice(0, max).trim();
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

  /* time (append ?now=2026-11-26T10:30 to the URL to preview another moment) */
  var OFFSET = 0;
  try {
    var qNow = new URLSearchParams(location.search).get('now');
    if (qNow) { var tNow = Date.parse(qNow); if (!isNaN(tNow)) OFFSET = tNow - Date.now(); }
  } catch (e) { /* ignore */ }
  function nowMs() { return Date.now() + OFFSET; }
  function now() { return new Date(nowMs()); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parts(s) { return s.split('-').map(Number); }
  function fromISO(s) { var p = parts(s); return new Date(p[0], p[1] - 1, p[2]); }
  function today() { return toISO(now()); }
  function addDays(s, n) { var p = parts(s); return toISO(new Date(p[0], p[1] - 1, p[2] + n)); }
  function dayNum(s) { var p = parts(s); return Date.UTC(p[0], p[1] - 1, p[2]) / 864e5; }
  function diff(a, b) { return Math.round(dayNum(b) - dayNum(a)); }
  function dow(s) { return (fromISO(s).getDay() + 6) % 7; }
  function toMin(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function minToTime(m) { m = Math.max(0, Math.min(1439, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowMin() { var d = now(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function fDay(s) { var d = fromISO(s); return DAYS[dow(s)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fLong(s) { var d = fromISO(s); return DAYS_LONG[dow(s)] + ' ' + d.getDate() + ' ' + MONTH_LONG[d.getMonth()]; }
  function fShort(s) { var d = fromISO(s); return d.getDate() + ' ' + MON[d.getMonth()]; }
  function rel(n) {
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n < 0) return (-n) + ' days ago';
    return 'in ' + n + ' days';
  }
  function dur(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + 'm';
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }
  function fmtClock(secs) { secs = Math.max(0, Math.round(secs)); return Math.floor(secs / 60) + ':' + pad(secs % 60); }
  function onColor(hex) {
    var n = parseInt(hex.slice(1), 16);
    var ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    var L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return L > 0.179 ? '#141722' : '#FFFFFF';
  }

  /* =========================================================
     Storage + data model
     ========================================================= */
  var LEGACY_KEY = 'ib-planner:data';   /* IB Planner kept everything here before accounts existed */
  var ADMIN_ID = 'mauro';
  var storageOK = true;
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { storageOK = false; return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { storageOK = false; return false; } }
  function sdel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function sjson(k) { try { var v = JSON.parse(sget(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  var DEFAULTS = window.IB_DEFAULTS;
  var BLANK = window.IB_BLANK;
  /* usernames for accounts outside Sociales 2 IB (the server checks the same rule) */
  var FREE_ID = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
  var GUIDE = ['new', 'on', 'done'];
  /* [setting value, name, swatch colour] (MyIB Plus) */
  var ACCENTS = [['', 'Blue', '#007AFF'], ['indigo', 'Indigo', '#5856D6'], ['purple', 'Purple', '#AF52DE'], ['pink', 'Pink', '#FF2D55'], ['orange', 'Orange', '#FF9500'], ['green', 'Green', '#34C759'], ['teal', 'Teal', '#30B0C7'], ['graphite', 'Graphite', '#8E8E93']];
  var SESSIONS = { may: 'May', nov: 'November', spec: 'Specimen' };

  function cleanSubject(s) {
    if (!s || typeof s !== 'object' || !ID.test(s.id)) return null;
    var name = str(s.name, 60).trim() || 'Untitled';
    return {
      id: s.id,
      name: name,
      short: str(s.short, 18).trim() || shortFrom(name),
      color: HEX.test(s.color) ? s.color.toUpperCase() : '#8E8E93',
      group: ['ib', 'core', 'other'].indexOf(s.group) >= 0 ? s.group : 'ib',
      level: s.level === 'SL' || s.level === 'HL' ? s.level : '',
      teacher: str(s.teacher, 60).trim(),
      goal: Math.max(0, Math.min(2400, Math.round(Number(s.goal) || 0))),
      notes: str(s.notes, 4000)
    };
  }
  function iconInk(hex) {
    var n = parseInt(hex.slice(1), 16);
    var ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] > 0.45 ? '#1C1C1E' : '#FFFFFF';
  }
  function badge(s) { var sh = s.short.replace(/[^\p{L}\p{N}]/gu, ''); return /^[A-Z]{2,3}$/.test(sh) ? sh : (sh.charAt(0).toUpperCase() + sh.charAt(1).toLowerCase()); }
  function shortFrom(name) { return name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 18); }
  function cleanPeriod(p) {
    if (!p || typeof p !== 'object' || !ID.test(p.id) || !TIME.test(p.start) || !TIME.test(p.end) || toMin(p.end) <= toMin(p.start)) return null;
    return { id: p.id, start: p.start, end: p.end, kind: p.kind === 'break' ? 'break' : 'class', label: str(p.label, 40).trim() };
  }
  function cleanEvent(e, sid) {
    if (!e || typeof e !== 'object' || !ID.test(e.id) || !DATE.test(e.start)) return null;
    return {
      id: e.id,
      type: TYPES.indexOf(e.type) >= 0 ? e.type : 'other',
      subject: sid.has(e.subject) ? e.subject : null,
      title: str(e.title, 80).trim(),
      detail: str(e.detail, 80).trim(),
      start: e.start,
      end: DATE.test(e.end) && e.end > e.start ? e.end : null,
      note: str(e.note, 2000),
      done: !!e.done
    };
  }
  function cleanTask(t, sid, eid) {
    if (!t || typeof t !== 'object' || !ID.test(t.id)) return null;
    var title = str(t.title, 200).trim();
    if (!title) return null;
    var est = Math.round(Number(t.est));
    return {
      id: t.id,
      title: title,
      subject: sid.has(t.subject) ? t.subject : null,
      due: DATE.test(t.due) ? t.due : null,
      event: eid.has(t.event) ? t.event : null,
      est: est > 0 ? Math.min(1440, est) : null,
      notes: str(t.notes, 2000),
      done: !!t.done,
      doneAt: DATE.test(t.doneAt) ? t.doneAt : null,
      created: DATE.test(t.created) ? t.created : today()
    };
  }
  function cleanSession(x, sid) {
    if (!x || typeof x !== 'object' || !ID.test(x.id) || !DATE.test(x.date)) return null;
    var m = Math.round(Number(x.minutes));
    if (!(m >= 1 && m <= 720)) return null;
    return { id: x.id, subject: sid.has(x.subject) ? x.subject : null, date: x.date, minutes: m };
  }
  function cleanTimer(t, sid) {
    if (!t || typeof t !== 'object') return null;
    var len = Math.round(Number(t.len)), st = Number(t.startedAt);
    if (!(len >= 1 && len <= 240) || !isFinite(st)) return null;
    var pa = t.pausedAt == null ? null : Number(t.pausedAt);
    return { subject: sid.has(t.subject) ? t.subject : null, len: len, startedAt: st, pausedAt: isFinite(pa) && pa !== null ? pa : null, pausedTotal: Math.max(0, Number(t.pausedTotal) || 0) };
  }
  function cleanPaper(x, sid) {
    if (!x || typeof x !== 'object' || !ID.test(x.id)) return null;
    var max = Number(x.max), score = Number(x.score), yr = Math.round(Number(x.year));
    if (!(max > 0 && max <= 1000) || !(score >= 0 && score <= max)) return null;
    return {
      id: x.id,
      subject: sid.has(x.subject) ? x.subject : null,
      year: yr >= 1990 && yr <= 2100 ? yr : null,
      session: SESSIONS[x.session] ? x.session : '',
      paper: str(x.paper, 60).trim(),
      score: Math.round(score * 10) / 10,
      max: Math.round(max * 10) / 10,
      date: DATE.test(x.date) ? x.date : today()
    };
  }
  function uniq(list) {
    var seen = new Set();
    return list.filter(function (x) { if (!x || seen.has(x.id)) return false; seen.add(x.id); return true; });
  }

  /* Validate anything that comes from storage or an imported file before the app touches it. */
  function sanitize(input) {
    var D = clone(DEFAULTS);
    var src = input && typeof input === 'object' ? input : D;
    function pick(k) { return Object.prototype.hasOwnProperty.call(src, k) ? src[k] : D[k]; }
    var out = { version: 2 };
    var fromVersion = Number(src.version) || 1;
    var prof = pick('profile') || {};
    out.profile = { name: typeof prof.name === 'string' ? prof.name.slice(0, 40) : D.profile.name };
    var st = pick('settings') || {};
    out.settings = {
      theme: ['auto', 'light', 'dark'].indexOf(st.theme) >= 0 ? st.theme : 'auto',
      weekend: !!st.weekend,
      lastBackup: DATE.test(st.lastBackup) ? st.lastBackup : null,
      accent: ACCENTS.some(function (a) { return a[0] && a[0] === st.accent; }) ? st.accent : '',
      /* setup guide for empty planners: new = welcome sheet next, on = checklist on Today */
      guide: GUIDE.indexOf(st.guide) >= 0 ? st.guide : 'done'
    };
    out.subjects = uniq((Array.isArray(pick('subjects')) ? pick('subjects') : []).map(cleanSubject));
    if (fromVersion < 2) out.subjects.forEach(function (x) { if (V1_COLORS[x.color]) x.color = V1_COLORS[x.color]; });
    var sid = new Set(out.subjects.map(function (s) { return s.id; }));
    out.periods = uniq((Array.isArray(pick('periods')) ? pick('periods') : []).map(cleanPeriod))
      .sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
    var pid = new Set(out.periods.map(function (p) { return p.id; }));
    out.slots = {};
    var slots = pick('slots');
    if (slots && typeof slots === 'object') {
      Object.keys(slots).forEach(function (k) {
        var bits = k.split('|'), day = Number(bits[1]), v = slots[k];
        if (bits.length !== 2 || !pid.has(bits[0]) || !(day >= 0 && day <= 6) || !v || typeof v !== 'object' || !sid.has(v.subject)) return;
        var c = { subject: v.subject };
        ['teacher', 'room', 'note'].forEach(function (f) { var x = str(v[f], 80).trim(); if (x) c[f] = x; });
        if (TIME.test(v.start) && TIME.test(v.end) && toMin(v.end) > toMin(v.start)) { c.start = v.start; c.end = v.end; }
        out.slots[bits[0] + '|' + day] = c;
      });
    }
    out.events = uniq((Array.isArray(pick('events')) ? pick('events') : []).map(function (e) { return cleanEvent(e, sid); }));
    var eid = new Set(out.events.map(function (e) { return e.id; }));
    out.tasks = uniq((Array.isArray(pick('tasks')) ? pick('tasks') : []).map(function (t) { return cleanTask(t, sid, eid); }));
    out.sessions = uniq((Array.isArray(pick('sessions')) ? pick('sessions') : []).map(function (x) { return cleanSession(x, sid); })).slice(-4000);
    out.papers = uniq((Array.isArray(pick('papers')) ? pick('papers') : []).map(function (x) { return cleanPaper(x, sid); })).slice(-1000);
    out.timer = cleanTimer(pick('timer'), sid);
    return out;
  }

  /* =========================================================
     Account, server calls, sync
     ========================================================= */
  var MODE = 'boot';          /* boot, then auth (log in), then app */
  var ME = null;              /* { id, name, kind: class | free, admin, plus } */
  var CONF = blankConf();     /* what the server sends with your account: calendar link and Mauro's settings */
  var S = sanitize(clone(DEFAULTS));
  function plusOn() { return !!(ME && ME.plus); }
  /* an account outside Sociales 2 IB (free tier, own username) */
  function isFree() { return !!(ME && ME.kind === 'free'); }
  function startData() { return clone(isFree() ? BLANK : DEFAULTS); }

  function blankConf() { return { cal: null, bizum: null, price: null, papers: null }; }
  function setConf(d) {
    CONF.cal = d.cal || null;
    CONF.bizum = d.bizum || null;
    CONF.price = cleanPrice(d.price);
    CONF.papers = cleanPapersConf(d.papers);
  }
  function confForCache() { return { user: ME, cal: CONF.cal, bizum: CONF.bizum, price: CONF.price, papers: CONF.papers }; }
  var PRICE_DEFAULT = { month: 5, once: 15 };
  function cleanPrice(p) {
    if (!p || typeof p !== 'object') return null;
    var m = Number(p.month), o = Number(p.once);
    return m >= 0.5 && m <= 50 && o >= 1 && o <= 200 ? { month: m, once: o } : null;
  }
  function euro(n) { var c = Math.round(n * 100); return (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100)) + ' €'; }
  function priceText() { var p = CONF.price || PRICE_DEFAULT; return euro(p.month) + ' a month, or ' + euro(p.once) + ' once for the whole school year'; }
  /* only plain web links (http or https) ever become an href */
  function webUrl(v) {
    if (typeof v !== 'string' || !v || v.length > 1000) return '';
    try {
      var u = new URL(v);
      return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname && !u.username && !u.password ? u.href : '';
    } catch (e) { return ''; }
  }
  function cleanPapersConf(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.links)) return null;
    return {
      title: str(p.title, 40).trim(), intro: str(p.intro, 400).trim(), head: str(p.head, 60).trim(), foot: str(p.foot, 400).trim(),
      links: p.links.slice(0, 30).map(function (l) {
        var url = l && typeof l === 'object' ? webUrl(l.url) : '';
        var title = url ? str(l.title, 100).trim() : '';
        return title ? { title: title, sub: str(l.sub, 160).trim(), url: url, fresh: l.fresh === true } : null;
      }).filter(Boolean),
      updated: Number(p.updated) || 0
    };
  }

  /* Every server call goes through here. The server refuses changes without the X-MyIB header (CSRF check). */
  function api(method, path, body, opts) {
    opts = opts || {};
    var init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { 'X-MyIB': '1', 'Accept': 'application/json' } };
    if (body != null) { init.headers['Content-Type'] = 'application/json'; init.body = typeof body === 'string' ? body : JSON.stringify(body); }
    if (opts.keepalive) init.keepalive = true;
    var ctrl = !opts.keepalive && typeof AbortController === 'function' ? new AbortController() : null, timer = null;
    if (ctrl) { init.signal = ctrl.signal; timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 20000); }
    return fetch(path, init).then(function (res) {
      clearTimeout(timer);
      var ct = res.headers.get('Content-Type') || '';
      if (res.status === 204 || ct.indexOf('application/json') < 0) return { status: res.status, data: null, json: false };
      return res.json().then(function (d) { return { status: res.status, data: d, json: true }; }, function () { return { status: res.status, data: null, json: false }; });
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* This browser's copy of your planner, so MyIB opens offline and never loses an unsynced change. */
  function cacheKey(id) { return 'myib:cache:' + id; }
  function readCache(id) {
    var c = id ? sjson(cacheKey(id)) : null;
    return c && c.v === 1 && c.me && c.me.user && c.me.user.id === id && c.state && typeof c.state === 'object' ? c : null;
  }
  /* base = the planner as the server last had it (at rev); merges need it */
  function writeCache() {
    if (!ME) return;
    var ok = sset(cacheKey(ME.id), '{"v":1,"me":' + JSON.stringify(confForCache()) + ',"rev":' + SYNC.rev +
      ',"pending":' + SYNC.pending + ',"savedAt":' + SYNC.savedAt + ',"state":' + JSON.stringify(S) + ',"base":' + (SYNC.base || 'null') + '}');
    if (!ok) renderBanner();
  }
  function useCache(c) {
    S = sanitize(c.state);
    SYNC.rev = c.rev || 0; SYNC.pending = !!c.pending; SYNC.savedAt = c.savedAt || 0; SYNC.hadCache = true;
    SYNC.base = c.base && typeof c.base === 'object' ? JSON.stringify(c.base) : null;
  }

  function freshSync() {
    return { rev: 0, base: null, pending: false, gen: 0, savedAt: 0, inflight: false, pulling: false, checking: false, resolving: false, needRender: false, timer: null, online: true, lastPull: Date.now(), lastMe: Date.now(), retry: 0, wantPull: false, needsLoad: false, hadCache: false, tooBig: false };
  }

  /* Three-way merge, for when this device and another one both changed the planner since
     the last sync. Lists merge item by item (by id) and maps key by key, against the last
     copy both sides shared. When both sides changed the same item, this device wins. */
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function keyed(list) { var o = Object.create(null); (Array.isArray(list) ? list : []).forEach(function (x) { if (x && x.id != null) o[x.id] = x; }); return o; }
  function pick3(b, m, t) { return same(m, b) ? t : m; }
  function mergeList(base, mine, theirs) {
    var B = keyed(base), M = keyed(mine), T = keyed(theirs), out = [], seen = new Set();
    (Array.isArray(theirs) ? theirs : []).concat(Array.isArray(mine) ? mine : []).forEach(function (x) {
      if (!x || x.id == null || seen.has(x.id)) return;
      seen.add(x.id);
      var v = pick3(B[x.id], M[x.id], T[x.id]);
      if (v) out.push(v);
    });
    return out;
  }
  function mergeMap(base, mine, theirs) {
    function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
    base = obj(base); mine = obj(mine); theirs = obj(theirs);
    var out = {};
    Object.keys(theirs).concat(Object.keys(mine), Object.keys(base)).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(out, k)) return;
      var v = pick3(base[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  function mergeState(base, mine, theirs) {
    /* sanitize first: every copy gets the same key order, so equal items compare equal */
    base = base && typeof base === 'object' ? sanitize(base) : {};
    mine = sanitize(mine); theirs = sanitize(theirs);
    var out = { version: 2 };
    ['subjects', 'periods', 'events', 'tasks', 'sessions', 'papers'].forEach(function (k) { out[k] = mergeList(base[k], mine[k], theirs[k]); });
    ['slots', 'settings', 'profile'].forEach(function (k) { out[k] = mergeMap(base[k], mine[k], theirs[k]); });
    out.timer = pick3(base.timer, mine.timer, theirs.timer) || null;
    return sanitize(out);
  }
  function parseBase() { try { return SYNC.base ? JSON.parse(SYNC.base) : null; } catch (e) { return null; } }
  /* take in the server's copy: merged with ours when we have unsynced changes */
  function takeServer(d) {
    var theirs = JSON.stringify(d.state);
    if (SYNC.pending || dirty) {
      S = mergeState(parseBase(), S, d.state);
      SYNC.pending = true; SYNC.gen++;
    } else {
      S = sanitize(d.state);
    }
    SYNC.rev = d.rev; SYNC.base = theirs; undoSnap = null;
    writeCache();
  }
  var SYNC = freshSync();

  var dirty = false, saveTimer = null, persistAsked = false;
  function save() { if (!ME) return; dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150); }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty || !ME) return;
    dirty = false;
    SYNC.pending = true; SYNC.gen++; SYNC.savedAt = Date.now(); SYNC.tooBig = false;
    writeCache();
    schedulePush(1200);
    if (!persistAsked) {
      persistAsked = true;
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* ignore */ }
    }
  }
  function schedulePush(ms) { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(function () { SYNC.timer = null; push(); }, ms); }
  function retryPush() { SYNC.retry = Math.min(SYNC.retry + 1, 5); schedulePush(Math.min(60000, 2000 * Math.pow(2, SYNC.retry))); }

  /* Send the planner to the server. A 409 means another device saved in between:
     fetch its copy, merge, and send again. */
  function push(opts) {
    opts = opts || {};
    if (!ME || MODE !== 'app' || !SYNC.pending || SYNC.inflight || SYNC.resolving || SYNC.needsLoad || SYNC.tooBig) return Promise.resolve();
    clearTimeout(SYNC.timer); SYNC.timer = null;
    SYNC.inflight = true;
    var sync = SYNC, gen = SYNC.gen, sent = JSON.stringify(S);
    var body = '{"user":' + JSON.stringify(ME.id) + ',"state":' + sent + (opts.force ? ',"force":true}' : ',"rev":' + SYNC.rev + '}');
    return api('PUT', '/api/state', body, { keepalive: !!opts.keepalive && body.length < 60000 }).then(function (r) {
      sync.inflight = false;
      if (sync !== SYNC) return;
      if (r.status === 200 && r.data) {
        SYNC.rev = r.data.rev; SYNC.base = sent; SYNC.retry = 0;
        if (SYNC.gen === gen) SYNC.pending = false;
        setOnline(true); writeCache();
        if (SYNC.pending) schedulePush(600);
        return;
      }
      if (r.status === 409) { if ((opts.tries || 0) >= 3) { retryPush(); return; } return resolveConflict((opts.tries || 0) + 1); }
      if (r.status === 401) return sessionLost();
      if (r.status === 403 && r.data && r.data.error === 'wrong_user') return reconnect();
      if (r.status === 413) { SYNC.tooBig = true; renderBanner(); return; }
      if (r.status === 503 && r.data && r.data.error === 'setup') return setupNeeded();
      retryPush();
    }, function () {
      sync.inflight = false;
      if (sync !== SYNC) return;
      setOnline(false); retryPush();
    });
  }

  /* Bring in changes made on another device. Waits while a sheet is open or you're typing. */
  function pull() {
    if (!ME || MODE !== 'app' || SYNC.needsLoad || SYNC.pulling || SYNC.inflight || SYNC.pending || dirty) return Promise.resolve();
    if (dlg.open || !idle()) { SYNC.wantPull = true; return Promise.resolve(); }
    var sync = SYNC, rev = SYNC.rev;
    SYNC.pulling = true; SYNC.lastPull = Date.now(); SYNC.wantPull = false;
    return api('GET', '/api/state?since=' + rev + '&user=' + encodeURIComponent(ME.id)).then(function (r) {
      sync.pulling = false;
      if (sync !== SYNC) return;
      if (r.status === 401) return sessionLost();
      if (r.status === 403 && r.data && r.data.error === 'wrong_user') return reconnect();
      if (r.status === 204) { setOnline(true); return; }
      if (r.status !== 200 || !r.data) return;
      setOnline(true);
      if (SYNC.pending || dirty || SYNC.rev !== rev) return;
      if (dlg.open || !idle()) { SYNC.wantPull = true; return; }
      if (r.data.state == null) { if (rev > 0) return startFresh(); return; }
      takeServer(r.data);
      render();
    }, function () {
      sync.pulling = false;
      if (sync === SYNC) setOnline(false);
    });
  }
  /* A sheet keeps references into the planner, so the merge waits until it closes. */
  function resolveConflict(tries) {
    var sync = SYNC;
    SYNC.resolving = true;
    function later() { setTimeout(function () { if (sync === SYNC) resolveConflict(tries); }, 1500); }
    if (dlg.open) { later(); return Promise.resolve(); }
    return api('GET', '/api/state?user=' + encodeURIComponent(ME.id)).then(function (r) {
      if (sync !== SYNC || !ME) return;
      if (dlg.open && r.status === 200) { later(); return; }
      SYNC.resolving = false;
      if (r.status === 401) return sessionLost();
      if (r.status !== 200 || !r.data) { retryPush(); return; }
      if (r.data.state == null) { SYNC.rev = 0; SYNC.base = null; return push({ tries: tries }); }
      takeServer(r.data);
      softRender();
      return push({ tries: tries });
    }, function () { if (sync === SYNC) { SYNC.resolving = false; setOnline(false); retryPush(); } });
  }
  /* don't redraw under someone's typing; the clock redraws once they stop */
  function softRender() { if (idle()) render(); else SYNC.needRender = true; }

  function setOnline(on) {
    if (SYNC.online === on) return;
    SYNC.online = on;
    renderBanner();
    if (on && SYNC.pending && !SYNC.inflight) schedulePush(300);
  }

  /* First contact after logging in: settle this browser's copy against the server's. */
  function loadServerState() {
    var sync = SYNC;
    return api('GET', '/api/state?user=' + encodeURIComponent(ME.id)).then(function (r) {
      if (sync !== SYNC || !ME) return;
      if (r.status === 401) return sessionLost();
      if (r.status === 403 && r.data && r.data.error === 'wrong_user') { reconnect(); throw new Error('wrong_user'); }
      if (r.status === 503 && r.data && r.data.error === 'setup') return setupNeeded();
      if (r.status !== 200 || !r.data) throw new Error('state ' + r.status);
      SYNC.needsLoad = false;
      setOnline(true);
      var d = r.data;
      if (d.state == null) {
        /* never reached the server: upload this browser's copy. Synced before: it was erased on purpose. */
        if (SYNC.hadCache && SYNC.pending && SYNC.rev === 0) return push({ force: true });
        return startFresh();
      }
      if (SYNC.pending && d.rev === SYNC.rev) return push();
      takeServer(d);
      if (MODE === 'app') render();
      if (SYNC.pending) return push();
    });
  }

  /* A brand-new account: the class planner, an empty one for students outside the class,
     or for Mauro his own starting planner (or what this browser saved before accounts existed). */
  function firstState() {
    if (!ME.admin) return Promise.resolve(startData());
    var legacy = legacyData();
    if (legacy && !legacyDone(ME.id)) { markLegacy(ME.id); return Promise.resolve(legacy); }
    return api('GET', '/api/starter').then(function (r) {
      if (r.status !== 200 || !r.data) throw new Error('starter ' + r.status);
      return r.data.starter || clone(DEFAULTS);
    });
  }
  function startFresh() {
    var sync = SYNC;
    return firstState().then(function (st) {
      if (sync !== SYNC || !ME) return;
      S = sanitize(st);
      SYNC.rev = 0; SYNC.base = null; SYNC.pending = true; SYNC.gen++; SYNC.savedAt = Date.now();
      writeCache();
      if (MODE === 'app') { render(); return push(); }
    });
  }

  function reconnect() {
    if (!ME || SYNC.checking) return;
    var sync = SYNC;
    SYNC.checking = true;
    api('GET', '/api/me', null, { timeout: 10000 }).then(function (r) {
      sync.checking = false;
      if (sync !== SYNC || !ME) return;
      if (r.status === 200 && r.data && r.data.user) {
        if (r.data.user.id !== ME.id) return enterApp(r.data, true);
        applyMe(r.data); setOnline(true);
        if (SYNC.needsLoad) return loadServerState().catch(function () { setOnline(false); });
        return SYNC.pending ? push() : pull();
      }
      if (r.status === 401 || (r.status === 200 && r.data && r.data.user === null)) return sessionLost();
      if (r.status === 503 && r.data && r.data.error === 'setup') return setupNeeded();
      setOnline(false);
    }, function () {
      sync.checking = false;
      if (sync === SYNC) setOnline(false);
    });
  }
  function applyMe(d) {
    var had = plusOn(), before = JSON.stringify([CONF.price, CONF.papers]);
    ME = d.user; setConf(d); SYNC.lastMe = Date.now();
    writeCache();
    var changed = before !== JSON.stringify([CONF.price, CONF.papers]);
    if (had !== plusOn()) { applyTheme(); scheduleNag(); }
    /* never redraw under someone's typing: softRender waits until they stop */
    if ((had !== plusOn() || changed) && MODE === 'app' && !dlg.open) softRender();
  }

  window.addEventListener('pagehide', function () { flush(); push({ keepalive: true }); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { flush(); push(); return; }
    if (MODE !== 'app') return;
    /* reconnect also picks up Mauro's latest settings (new past papers, prices) */
    if (!SYNC.online || SYNC.needsLoad || Date.now() - SYNC.lastMe > 10 * 60000) reconnect();
    else if (Date.now() - SYNC.lastPull > 15000) pull();
  });
  window.addEventListener('online', function () { if (MODE === 'app') reconnect(); });

  /* Planner saved in this browser before accounts existed (IB Planner v1/v2). */
  function legacyData() {
    var d = sjson(LEGACY_KEY);
    return d && Array.isArray(d.subjects) && Array.isArray(d.events) && Array.isArray(d.periods) ? d : null;
  }
  function legacyDone(id) { var l = sjson('myib:legacy'); return !!(l && l[id]); }
  function markLegacy(id) { var l = sjson('myib:legacy') || {}; l[id] = 1; sset('myib:legacy', JSON.stringify(l)); }

  /* view settings, per person and per device */
  function blankUI() { return { tab: 'today', calMonth: null, calSel: null, calMode: 'month', hidden: [], showPast: false, ttDay: null, taskFilter: 'all', showDone: false, focusSubject: null, focusLen: 25, todayWhich: null, paperSubject: '' }; }
  var UI = blankUI();
  function loadUI(id) {
    var tab = UI.tab;
    UI = blankUI();
    UI.tab = tab;
    var u = sjson('myib:ui:' + id) || {};
    if (u.calMode === 'agenda') UI.calMode = 'agenda';
    if (Array.isArray(u.hidden)) UI.hidden = u.hidden.filter(function (x) { return typeof x === 'string' && ID.test(x); });
    UI.showPast = !!u.showPast;
    if (typeof u.taskFilter === 'string' && ID.test(u.taskFilter)) UI.taskFilter = u.taskFilter;
    UI.showDone = !!u.showDone;
    if (typeof u.focusSubject === 'string' && ID.test(u.focusSubject)) UI.focusSubject = u.focusSubject;
    if (Number.isInteger(u.focusLen) && u.focusLen >= 5 && u.focusLen <= 180) UI.focusLen = u.focusLen;
    if (typeof u.paperSubject === 'string' && ID.test(u.paperSubject)) UI.paperSubject = u.paperSubject;
  }
  function saveUI() {
    if (!ME) return;
    sset('myib:ui:' + ME.id, JSON.stringify({ calMode: UI.calMode, hidden: UI.hidden, showPast: UI.showPast, taskFilter: UI.taskFilter, showDone: UI.showDone, focusSubject: UI.focusSubject, focusLen: UI.focusLen, paperSubject: UI.paperSubject }));
  }

  /* lookups */
  function subj(id) { if (!id) return null; for (var i = 0; i < S.subjects.length; i++) if (S.subjects[i].id === id) return S.subjects[i]; return null; }
  function evById(id) { if (!id) return null; for (var i = 0; i < S.events.length; i++) if (S.events[i].id === id) return S.events[i]; return null; }
  function taskById(id) { for (var i = 0; i < S.tasks.length; i++) if (S.tasks[i].id === id) return S.tasks[i]; return null; }
  function periodById(id) { for (var i = 0; i < S.periods.length; i++) if (S.periods[i].id === id) return S.periods[i]; return null; }
  function evEnd(e) { return e.end || e.start; }
  function covers(e, d) { return e.start <= d && evEnd(e) >= d; }
  function byStart(a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : evEnd(a) < evEnd(b) ? -1 : evEnd(a) > evEnd(b) ? 1 : 0; }
  function evOrder(a, b) { return (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || byStart(a, b) || (evTitle(a) < evTitle(b) ? -1 : 1); }
  function holidayOn(d) { for (var i = 0; i < S.events.length; i++) { var e = S.events[i]; if (e.type === 'holiday' && covers(e, d)) return e; } return null; }
  function cvar(s) { return s ? '--c:' + s.color + ';--on:' + onColor(s.color) : ''; }
  function nameOrGeneral(id) { var s = subj(id); return s ? s.name : 'general study'; }

  /* event naming: subject · title, with the stage/paper as a separate detail */
  function evTitle(e) {
    var s = subj(e.subject), p = [];
    if (s) p.push(s.name);
    if (e.title) p.push(e.title);
    return p.join(' · ') || e.detail || 'Untitled';
  }
  function evShort(e) {
    var s = subj(e.subject), p = [];
    if (s) p.push(s.short);
    if (e.title) p.push(e.title);
    return p.join(' · ') || e.detail || 'Event';
  }
  function evDetail(e) { return evTitle(e) === e.detail ? '' : e.detail; }
  function evFull(e) { var d = evDetail(e); return evTitle(e) + (d ? ' · ' + d : ''); }
  function evSwatch(e) {
    var s = subj(e.subject);
    if (s) return '<i class="sw" style="' + cvar(s) + '"></i>';
    var k = ['mock', 'holiday', 'grades'].indexOf(e.type) >= 0 ? e.type : 'none';
    return '<i class="sw ' + k + '"></i>';
  }
  function evLabel(e) { return '<span class="lbl">' + evSwatch(e) + '<span>' + esc(evTitle(e)) + '</span></span>'; }
  function evDetailHTML(e) {
    var d = evDetail(e);
    if (!d) return '';
    return e.type === 'exam' ? '<span class="minipill">' + esc(d) + '</span>' : '<span class="detail">' + esc(d) + '</span>';
  }
  function shortPaper(d) { return String(d || 'Exam').replace(/Papers? (\d)/g, 'P$1').replace(/ & (\d)/g, ' & P$1'); }

  /* timetable */
  function slotKey(pid, d) { return pid + '|' + d; }
  function slotTimes(p, sl) { return sl && sl.start ? { start: sl.start, end: sl.end } : { start: p.start, end: p.end }; }
  function blocksFor(d) {
    if (holidayOn(d)) return [];
    var wd = dow(d), out = [];
    S.periods.forEach(function (p) {
      if (p.kind === 'break') return;
      var sl = S.slots[slotKey(p.id, wd)];
      var s = sl && subj(sl.subject);
      if (!s) return;
      var t = slotTimes(p, sl);
      out.push({ p: p, sl: sl, s: s, start: t.start, end: t.end });
    });
    return out.sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
  }
  function nextSchoolDay(from) {
    for (var i = 1; i <= 90; i++) { var d = addDays(from, i); if (blocksFor(d).length) return d; }
    return null;
  }
  function slotCounts() {
    var days = S.settings.weekend ? 7 : 5, c = {};
    var cls = new Set(S.periods.filter(function (p) { return p.kind === 'class'; }).map(function (p) { return p.id; }));
    Object.keys(S.slots).forEach(function (k) {
      var b = k.split('|');
      if (cls.has(b[0]) && Number(b[1]) < days) { var s = S.slots[k].subject; c[s] = (c[s] || 0) + 1; }
    });
    return c;
  }

  /* timer + study log */
  function timerState() {
    var t = S.timer;
    if (!t) return null;
    var n = nowMs();
    var elapsed = Math.max(0, (t.pausedAt != null ? t.pausedAt : n) - t.startedAt - t.pausedTotal);
    var total = t.len * 60000;
    return { subject: t.subject, len: t.len, elapsed: elapsed, total: total, remaining: Math.max(0, total - elapsed), running: t.pausedAt == null, startedAt: t.startedAt };
  }
  /* A timer's session id comes from its start time, so two open devices finishing the
     same synced timer log it once (the merge keeps one copy per id). */
  function timerId(st) { return 'ss-t' + Math.round(st.startedAt).toString(36); }
  function logSession(sid, minutes, date, id) {
    id = id || uid('ss');
    if (S.sessions.some(function (x) { return x.id === id; })) return;
    S.sessions.push({ id: id, subject: subj(sid) ? sid : null, date: DATE.test(date) ? date : today(), minutes: Math.max(1, Math.min(720, Math.round(minutes))) });
    if (S.sessions.length > 4000) S.sessions = S.sessions.slice(-4000);
  }

  /* =========================================================
     Icons (inline SVG, stroke = currentColor)
     ========================================================= */
  var IC = {
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.4L12 4l8 6.4V19a1 1 0 0 1-1 1h-4.4v-5.6H9.4V20H5a1 1 0 0 1-1-1z"/></svg>',
    timetable: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 14.8h18M9 4v16M15 4v16"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.3l2.7 2.7L16 9.6"/></svg>',
    subjects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.8C4 4.8 4.8 4 5.8 4H11v16H5.8C4.8 20 4 19.2 4 18.2z"/><path d="M13 4h5.2c1 0 1.8.8 1.8 1.8v12.4c0 1-.8 1.8-1.8 1.8H13z"/><path d="M6.8 8h1.8M15.4 8h1.8"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4L18 12z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9M5 19.5h14"/></svg>',
    updown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5.5M6.5 11L12 5.5 17.5 11"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5"/></svg>',
    tick: '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/></svg>',
    out: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5L11 13M18 14v4.2a1.3 1.3 0 0 1-1.3 1.3H5.8a1.3 1.3 0 0 1-1.3-1.3V7.3A1.3 1.3 0 0 1 5.8 6H10"/></svg>',
    key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15.5" r="3.8"/><path d="M10.8 12.8L19 4.6M16 7.6l2.5 2.5M13.8 9.8l1.9 1.9"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7M10 12h10M16.5 8.5L20 12l-3.5 3.5"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="16.8" cy="9.4" r="2.5"/><path d="M16 14.4c2.4-.2 4 1.4 4.5 4"/></svg>',
    paper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7l4 4v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.5 3.5v4h4M8.5 12h7M8.5 15.5h7"/></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.7 1.8-1.6 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4.3-3.8-7.5-8.5-7.5z"/><circle cx="7.8" cy="11.2" r="1"/><circle cx="10.6" cy="7.6" r="1"/><circle cx="15" cy="8.2" r="1"/></svg>',
    timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M9.5 3h5M18.3 6.7l1.3-1.3"/></svg>',
    quiet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 16.5V11a5.8 5.8 0 0 1 9.4-4.5M17.8 10.5v6l1.5 1.5H8M10 20.5a2.2 2.2 0 0 0 4 0M4 4l16 16"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></svg>'
  };
  function icon(n) { return IC[n] || ''; }

  /* =========================================================
     Shell: nav, theme, banner, toast, dialog
     ========================================================= */
  var TABS = [['today', 'Today'], ['timetable', 'Timetable'], ['calendar', 'Calendar'], ['tasks', 'Tasks'], ['subjects', 'Subjects']];
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  /* Before anyone logs in, use the look this device used last time. */
  function currentTheme() {
    var t = ME ? S.settings.theme : sget('myib:theme');
    return ['auto', 'light', 'dark'].indexOf(t) >= 0 ? t : 'auto';
  }
  function effectiveDark() { var t = currentTheme(); return t === 'dark' || (t === 'auto' && !!(mqDark && mqDark.matches)); }
  function applyTheme() {
    var t = currentTheme(), root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    var acc = plusOn() ? S.settings.accent : '';
    if (acc) root.setAttribute('data-accent', acc); else root.removeAttribute('data-accent');
    $$('meta[name="theme-color"]').forEach(function (m) {
      var dark = t === 'auto' ? /dark/.test(m.getAttribute('media') || '') : t === 'dark';
      m.setAttribute('content', dark ? '#040507' : '#EDF0F6');
    });
  }
  if (mqDark) {
    var onScheme = function () { if (MODE === 'app' && currentTheme() === 'auto') renderNav(); };
    if (mqDark.addEventListener) mqDark.addEventListener('change', onScheme); else if (mqDark.addListener) mqDark.addListener(onScheme);
  }
  var navBuilt = false;
  function renderNav() {
    if (!navBuilt) {
      var html = TABS.map(function (t) {
        return '<button type="button" data-act="tab" data-tab="' + t[0] + '">' + icon(t[0]) + '<span>' + t[1] + '</span></button>';
      }).join('');
      $('#top-nav').innerHTML = html;
      $('#tabbar').innerHTML = html;
      var sb = $('#settings-btn');
      sb.innerHTML = icon('settings');
      sb.title = 'Settings and backup';
      navBuilt = true;
    }
    $$('#top-nav [data-tab], #tabbar [data-tab]').forEach(function (b) {
      if (b.dataset.tab === UI.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var dark = effectiveDark(), tb = $('#theme-btn');
    tb.innerHTML = icon(dark ? 'sun' : 'moon');
    tb.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    tb.title = dark ? 'Light theme' : 'Dark theme';
  }
  function renderBanner() {
    var b = $('#banner'), msg = '';
    if (MODE === 'app') {
      if (!SYNC.online) msg = 'Offline. Your changes are saved on this device and sync when you’re back online.';
      else if (SYNC.tooBig) msg = 'Your planner is too big to sync. Delete some old tasks or study sessions.';
      else if (!storageOK) msg = 'This browser blocks storage, so MyIB can’t keep a copy here. Changes still save to your account while you’re online.';
    }
    if (msg) { b.innerHTML = '<span class="pillnote">' + esc(msg) + '</span>'; b.hidden = false; }
    else { b.hidden = true; b.innerHTML = ''; }
  }

  /* The toast is a popover where supported, so it shows above open sheets too. */
  var toastTimer = null, undoSnap = null;
  var toastEl = $('#toast'), toastPop = !!(toastEl && typeof toastEl.showPopover === 'function');
  if (toastPop) { toastEl.setAttribute('popover', 'manual'); toastEl.hidden = false; }
  function snapshot() { return JSON.stringify(S); }
  function toast(msg, snap) {
    undoSnap = snap || null;
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (snap ? '<button type="button" class="btn small" data-act="undo">Undo</button>' : '');
    if (toastPop) {
      try { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); toastEl.showPopover(); } catch (e) { /* ignore */ }
    } else toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, snap ? 6500 : 2800);
  }
  function hideToast() {
    if (toastPop) { try { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); } catch (e) { /* ignore */ } }
    else toastEl.hidden = true;
    undoSnap = null;
  }
  /* brief confirmation on a button inside a sheet */
  function flash(el, label) {
    if (!el) return;
    var old = el.innerHTML;
    el.innerHTML = icon('check') + esc(label);
    el.classList.add('flashed');
    setTimeout(function () { if (el.isConnected) { el.innerHTML = old; el.classList.remove('flashed'); } }, 2000);
  }

  var dlg = $('#dlg');
  var dlgSubmit = null, dlgBack = null, curSheet = null;
  var coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
  function openDialog(o) {
    var left = o.back ? '<button type="button" class="nav-btn back" data-act="dlg-back">' + icon('left') + '<span>' + esc(o.backLabel || 'Back') + '</span></button>'
             : o.onSubmit ? '<button type="button" class="nav-btn" data-act="dlg-close">Cancel</button>' : '<span aria-hidden="true"></span>';
    var right = o.onSubmit ? '<button type="submit" class="nav-btn strong' + (o.submitDanger ? ' danger' : '') + '">' + esc(o.submitLabel || 'Save') + '</button>'
                           : '<button type="button" class="nav-btn strong" data-act="dlg-close">' + esc(o.doneLabel || 'Done') + '</button>';
    dlgBack = o.back || null;
    dlg.innerHTML =
      '<form class="sheet" tabindex="-1" novalidate autocomplete="off">' +
        '<div class="grabber" aria-hidden="true"></div>' +
        '<header class="sheet-head">' + left + '<h2 id="dlg-title">' + esc(o.title) + '</h2>' + right + '</header>' +
        '<div class="sheet-body">' + o.body +
          (o.danger ? '<div class="group"><button type="button" class="row row-btn danger" data-act="' + o.danger.act + '" data-id="' + esc(o.danger.id) + '">' + esc(o.danger.label) + '</button></div>' : '') +
        '</div>' +
      '</form>';
    dlgSubmit = o.onSubmit || null;
    dlg.classList.toggle('wide', !!o.wide);
    if (!dlg.open) dlg.showModal();
    var first = $('.sheet-body [autofocus]', dlg);
    if (first && !coarse.matches) first.focus();
    else $('.sheet', dlg).focus({ preventScroll: true });
    $('.sheet-body', dlg).scrollTop = 0;
  }
  /* iOS-style grouped form rows */
  function grp(rows, head, foot) {
    return (head ? '<p class="group-head">' + head + '</p>' : '') + '<div class="group">' + rows + '</div>' + (foot ? '<p class="group-foot">' + foot + '</p>' : '');
  }
  function rField(o) {
    var af = o.autofocus ? ' autofocus' : '';
    if (o.area) return '<label class="row"><span class="sr">' + esc(o.label) + '</span><textarea class="row-field" name="' + o.name + '" id="' + o.id + '" maxlength="' + o.max + '" placeholder="' + esc(o.placeholder || o.label) + '"' + af + '>' + esc(o.value) + '</textarea></label>';
    return '<label class="row"><span class="sr">' + esc(o.label) + '</span><input class="row-field" type="text" name="' + o.name + '" id="' + o.id + '" maxlength="' + o.max + '" value="' + esc(o.value) + '" placeholder="' + esc(o.placeholder || o.label) + '"' + af + '></label>';
  }
  function rText(label, name, id, value, placeholder, max, attrs) {
    return '<label class="row"><span class="row-label">' + esc(label) + '</span><input class="row-field right" type="text" name="' + name + '" id="' + id + '" maxlength="' + max + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '"' + (attrs || '') + '></label>';
  }
  function rPw(label, name, id, auto, autofocus) {
    return '<label class="row"><span class="sr">' + esc(label) + '</span><input class="row-field" type="password" name="' + name + '" id="' + id + '" maxlength="128" autocomplete="' + auto + '" autocapitalize="off" spellcheck="false" placeholder="' + esc(label) + '"' + (autofocus ? ' autofocus' : '') + '></label>';
  }
  /* a row that opens another sheet, with a value and a chevron on the right */
  function rNav(ic, label, act, value, attrs) {
    return '<button type="button" class="row row-btn nav-row" data-act="' + act + '"' + (attrs || '') + '>' + (ic ? icon(ic) : '') + '<span class="row-label">' + esc(label) + '</span>' +
      (value ? '<span class="row-meta">' + esc(value) + '</span>' : '') + icon('chev') + '</button>';
  }
  function rSelect(label, name, id, options, attrs) {
    return '<label class="row"><span class="row-label">' + esc(label) + '</span><span class="row-value"><span class="row-select-wrap"><select class="row-select" name="' + name + '" id="' + id + '"' + (attrs || '') + '>' + options + '</select>' + icon('updown') + '</span></span></label>';
  }
  function rPill(label, type, name, id, value, attrs) {
    return '<label class="row"><span class="row-label">' + esc(label) + '</span><input class="row-pill" type="' + type + '" name="' + name + '" id="' + id + '" value="' + esc(value || '') + '"' + (attrs || '') + '></label>';
  }
  function rSwitch(label, name, id, on) {
    return '<label class="row"><span class="row-label">' + esc(label) + '</span><input class="ios-switch" type="checkbox" role="switch" name="' + name + '" id="' + id + '"' + (on ? ' checked' : '') + '></label>';
  }
  function rButton(label, act, attrs, cls) {
    return '<button type="button" class="row row-btn ' + (cls || '') + '" data-act="' + act + '"' + (attrs || '') + '>' + label + '</button>';
  }
  function optionList(pairs, sel) {
    return pairs.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(sel) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function closeDialog() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () {
    dlgSubmit = null; dlgBack = null; curSheet = null; dlg.innerHTML = '';
    if (settingsTouched) { settingsTouched = false; render(); }
    if (SYNC.wantPull) setTimeout(pull, 60);
  });
  /* avatars: a coloured circle with the first letter */
  var KNOWN = ['alexia', 'ana', 'ariel', 'berta', 'carlota', 'cata', 'jorge', 'juan', 'luca', 'mauro', 'simon'];
  var AVATAR = ['#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#32ADE6', '#00C7BE', '#34C759', '#A2845E', '#FF3B30', '#30B0C7', '#8E8E93'];
  function avatarColor(id) {
    var i = KNOWN.indexOf(id);
    if (i < 0) { i = 0; for (var k = 0; k < id.length; k++) i = (i * 31 + id.charCodeAt(k)) >>> 0; }
    return AVATAR[i % AVATAR.length];
  }
  function avatar(id, name, size) {
    var c = avatarColor(String(id));
    return '<span class="avatar' + (size ? ' ' + size : '') + '" style="--c:' + c + ';color:' + iconInk(c) + '" aria-hidden="true">' + esc(Array.from(String(name || '?'))[0].toUpperCase()) + '</span>';
  }
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); });
  dlg.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!dlgSubmit) return;
    var r = dlgSubmit(new FormData(e.target), e.target);
    if (r !== false) closeDialog();
  });
  function fieldError(sel, msg) {
    var el = $(sel, dlg);
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    var row = el.closest('.row');
    if (row) row.classList.add('invalid');
    var g = el.closest('.group');
    var m = g && g.nextElementSibling && g.nextElementSibling.classList.contains('err') ? g.nextElementSibling : null;
    if (!m) {
      m = document.createElement('p');
      m.className = 'group-foot err';
      m.setAttribute('role', 'alert');
      (g || el).after(m);
    }
    m.textContent = msg;
    el.focus();
  }
  function arm(el, label) {
    if (el.dataset.armed === '1') return true;
    var old = el.textContent;
    el.dataset.armed = '1';
    el.textContent = label || 'Press again to delete';
    el.classList.add('armed');
    setTimeout(function () { if (el.isConnected) { el.dataset.armed = ''; el.textContent = old; el.classList.remove('armed'); } }, 3500);
    return false;
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    (dlg.open ? dlg : document.body).appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* =========================================================
     Render
     ========================================================= */
  var VIEWS = {};
  var FOCUS_ATTRS = ['data-act', 'data-change', 'data-id', 'data-tab', 'data-date', 'data-p', 'data-d', 'data-which', 'data-mode', 'data-len', 'data-step'];
  function cssEsc(v) { return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'); }
  function focusKey(el) {
    var v = $('#view');
    if (!el || el === document.body || el === v || !v.contains(el)) return null;
    if (el.id) return '#' + cssEsc(el.id);
    var sel = FOCUS_ATTRS.filter(function (a) { return el.hasAttribute(a); }).map(function (a) { return '[' + a + '="' + cssEsc(el.getAttribute(a)) + '"]'; }).join('');
    return sel ? el.tagName.toLowerCase() + sel : null;
  }
  function render() {
    if (MODE !== 'app') return;
    applyTheme();
    renderNav();
    renderBanner();
    var v = $('#view');
    var fk = focusKey(document.activeElement);
    v.innerHTML = (VIEWS[UI.tab] || VIEWS.today)();
    v.setAttribute('data-view', UI.tab);
    if (fk) { var back = $(fk, v); if (back) back.focus({ preventScroll: true }); }
    updateTimerUI();
  }
  function go(tab) {
    if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'today';
    var changed = UI.tab !== tab;
    UI.tab = tab;
    if (location.hash.slice(1) !== tab) { try { history.pushState(null, '', '#' + tab); } catch (e) { location.hash = tab; } }
    render();
    if (changed) { window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); }
  }
  window.addEventListener('popstate', function () {
    var h = location.hash.slice(1);
    UI.tab = TABS.some(function (t) { return t[0] === h; }) ? h : 'today';
    closeDialog();
    render();
  });

  /* ---------- shared bits ---------- */
  function subjectOptions(sel, noneLabel) {
    function grp(g, label) {
      var list = S.subjects.filter(function (s) { return s.group === g; });
      if (!list.length) return '';
      return '<optgroup label="' + label + '">' + list.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</optgroup>';
    }
    return '<option value="">' + esc(noneLabel) + '</option>' + grp('ib', 'IB subjects') + grp('core', 'Core') + grp('other', 'Other');
  }
  function whenInfo(e, t) {
    if (e.end && e.start <= t && e.end >= t) return { txt: 'Until ' + fShort(e.end), cls: 'live' };
    var n = diff(t, e.start);
    return { txt: rel(n), cls: n < 0 ? '' : n <= 1 ? 'urgent' : n <= 7 ? 'soon' : '' };
  }
  function dateChip(d, t) {
    var x = fromISO(d);
    return '<span class="datechip' + (d === t ? ' today' : '') + '" aria-hidden="true"><span class="wd">' + DAYS[dow(d)] + '</span><b>' + x.getDate() + '</b><span class="mo">' + MON[x.getMonth()] + '</span></span>';
  }
  function upRow(e, t, o) {
    o = o || {};
    var w = whenInfo(e, t);
    var range = e.end ? '<span class="detail">' + esc(fShort(e.start)) + ' – ' + esc(fShort(e.end)) + '</span>' : '';
    return '<button type="button" class="up-row' + (e.done ? ' done' : '') + (o.past ? ' past' : '') + '" data-act="ev-open" data-id="' + e.id + '">' +
      (o.noDate ? '' : dateChip(e.start, t)) +
      '<span class="up-main">' + evLabel(e) + evDetailHTML(e) + range + '</span>' +
      '<span class="when ' + (e.done ? '' : w.cls) + '">' + esc(e.done ? 'Done' : w.txt) + '</span>' +
      '<span class="sr">, ' + esc(fLong(e.start)) + '</span>' +
    '</button>';
  }
  function taskSort(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    var ad = a.due || '9999-99-99', bd = b.due || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
  }
  function dueLabel(x, t) {
    if (!x.due) return null;
    var n = diff(t, x.due);
    if (x.done) return { txt: 'Due ' + fDay(x.due), cls: '' };
    if (n < 0) return { txt: n === -1 ? 'Overdue · yesterday' : 'Overdue · ' + fDay(x.due), cls: 'overdue' };
    if (n === 0) return { txt: 'Due today', cls: 'today' };
    if (n === 1) return { txt: 'Due tomorrow', cls: '' };
    if (n < 7) return { txt: 'Due ' + DAYS_LONG[dow(x.due)], cls: '' };
    return { txt: 'Due ' + fDay(x.due), cls: '' };
  }
  function taskRow(x, t) {
    var s = subj(x.subject), e = evById(x.event), due = dueLabel(x, t), meta = [];
    if (s) meta.push('<span class="m"><i class="sw" style="' + cvar(s) + '"></i>' + esc(s.short) + '</span>');
    if (due) meta.push('<span class="m ' + due.cls + '">' + esc(due.txt) + '</span>');
    if (e) meta.push('<span class="m">For ' + esc(evShort(e)) + (evDetail(e) ? ' · ' + esc(evDetail(e)) : '') + '</span>');
    if (x.est) meta.push('<span class="m">' + esc(dur(x.est)) + '</span>');
    return '<li class="task' + (x.done ? ' done' : '') + '">' +
      '<label class="check" style="' + cvar(s) + '"><input type="checkbox" data-change="task-done" data-id="' + x.id + '"' + (x.done ? ' checked' : '') + ' aria-label="Done: ' + esc(x.title) + '"><span class="box">' + icon('check') + '</span></label>' +
      '<button type="button" class="task-main" data-act="task-open" data-id="' + x.id + '"><span class="task-title">' + esc(x.title) + '</span>' +
      (meta.length ? '<span class="task-meta">' + meta.join('') + '</span>' : '') + '</button>' +
    '</li>';
  }

  /* ---------- Today ---------- */
  VIEWS.today = function () {
    var t = today(), h = now().getHours();
    var greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening';
    var name = ME ? ME.name : S.profile.name.trim();
    var td = fromISO(t);
    return '<section class="hero">' +
        '<div>' +
          '<p class="hero-day">' + DAYS_LONG[dow(t)] + '</p>' +
          '<h1 class="display">' + td.getDate() + ' ' + MONTH_LONG[td.getMonth()] + '</h1>' +
          '<p class="sub">' + esc(greet) + (name ? ', ' + esc(name) : '') + '</p>' +
          headsUp(t) +
        '</div>' +
        countdown(t) +
        guideCard() +
      '</section>' +
      '<div class="today-cols">' +
        '<div class="col">' + cardClasses(t) + cardFocus() + '</div>' +
        '<div class="col">' + cardComing(t) + cardTasksToday(t) + '</div>' +
      '</div>';
  };

  /* ---------- setup guide (empty planners) ---------- */
  function hasIBSubjects() { return S.subjects.some(function (s) { return s.group === 'ib'; }); }
  function guideSteps() {
    return [
      { act: 'guide-subjects', done: hasIBSubjects(), title: 'Add your subjects', sub: 'Pick your IB subjects from a list.' },
      { act: 'guide-timetable', done: Object.keys(S.slots).length > 0, title: 'Fill in your timetable', sub: 'Tap a slot, then pick the class.' },
      { act: 'guide-dates', done: S.events.length > 0, title: 'Add your dates', sub: 'Deadlines, mock exams, IB exams.' },
      { act: 'guide-task', done: S.tasks.length > 0, title: 'Add a task', sub: 'Something you need to do this week.' }
    ];
  }
  function guideOn() { return S.settings.guide === 'new' || S.settings.guide === 'on'; }
  /* while the guide still has steps left, the support pop-up waits */
  function guideBusy() { return guideOn() && guideSteps().some(function (x) { return !x.done; }); }
  function guideCard() {
    if (!guideOn()) return '';
    var steps = guideSteps(), n = steps.filter(function (x) { return x.done; }).length, all = n === steps.length;
    var list = steps.map(function (x, i) {
      return '<li><button type="button" class="guide-step' + (x.done ? ' done' : '') + '" data-act="' + x.act + '">' +
        '<span class="gs-num" aria-hidden="true">' + (x.done ? icon('check') : i + 1) + '</span>' +
        '<span class="two-line"><b>' + esc(x.title) + '</b><span>' + esc(x.done ? 'Done' : x.sub) + '</span></span>' + icon('chev') +
        (x.done ? '<span class="sr">, done</span>' : '') + '</button></li>';
    }).join('');
    return '<section class="card c-guide" aria-labelledby="h-guide">' +
        '<header class="card-head"><h2 id="h-guide">' + (all ? 'You’re all set' : 'Set up MyIB') + '</h2>' +
          '<button type="button" class="link" data-act="guide-hide">' + (all ? 'Close' : 'Hide') + '</button></header>' +
        '<div class="guide-progress"><div class="guide-bar" aria-hidden="true"><i style="width:' + Math.round(n / steps.length * 100) + '%"></i></div>' +
          '<span class="guide-count">' + n + ' of ' + steps.length + ' done</span></div>' +
        (all ? '<p class="empty">Your planner is ready. Settings has more: a backup, calendar export and MyIB Plus.</p>' : '<ol class="guide-steps">' + list + '</ol>') +
      '</section>';
  }

  function headsUp(t) {
    var hol = holidayOn(t);
    if (hol) {
      var back = nextSchoolDay(evEnd(hol));
      return '<button type="button" class="heads-up calm" data-act="ev-open" data-id="' + hol.id + '">' + esc(evTitle(hol)) + (back ? ' · back ' + esc(fDay(back)) : '') + '</button>';
    }
    var soon = S.events.filter(function (e) { return !e.done && (e.type === 'deadline' || e.type === 'exam') && e.start >= t && diff(t, e.start) <= 2; }).sort(evOrder)[0];
    if (soon) {
      var n = diff(t, soon.start);
      return '<button type="button" class="heads-up" data-act="ev-open" data-id="' + soon.id + '">' + esc(evFull(soon)) + ' ' + (n === 0 ? 'is today' : n === 1 ? 'is tomorrow' : 'in 2 days') + '</button>';
    }
    var mock = S.events.filter(function (e) { return e.type === 'mock' && covers(e, t); })[0];
    if (mock) {
      return '<button type="button" class="heads-up" data-act="ev-open" data-id="' + mock.id + '">' + esc(evTitle(mock)) + ' · day ' + (diff(mock.start, t) + 1) + ' of ' + (diff(mock.start, evEnd(mock)) + 1) + '</button>';
    }
    return '';
  }

  function countdown(t) {
    var exams = S.events.filter(function (e) { return e.type === 'exam'; }).sort(byStart);
    var num, label, sub;
    if (!exams.length) { num = '–'; label = ''; sub = 'Add your exam dates in the calendar.'; }
    else {
      var first = exams[0], last = exams[exams.length - 1];
      if (t < first.start) {
        var n = diff(t, first.start);
        num = String(n); label = n === 1 ? 'day to go' : 'days to go';
        sub = 'First paper ' + fDay(first.start) + ' · ' + (subj(first.subject) ? subj(first.subject).name : evTitle(first));
      } else if (t <= evEnd(last)) {
        var left = exams.filter(function (e) { return e.start >= t; });
        num = String(left.length); label = left.length === 1 ? 'exam left' : 'exams left';
        sub = left.length ? 'Next: ' + evFull(left[0]) + ' · ' + fDay(left[0].start) : '';
      } else { num = '0'; label = 'to go'; sub = 'Exams are done.'; }
    }
    var mock = S.events.filter(function (e) { return e.type === 'mock' && evEnd(e) >= t; }).sort(byStart)[0];
    var mockVal = !mock ? '–' : mock.start <= t ? 'On now' : diff(t, mock.start) === 1 ? 'Tomorrow' : 'in ' + diff(t, mock.start) + ' days';
    var n14 = S.events.filter(function (e) { return e.type === 'deadline' && !e.done && e.start >= t && diff(t, e.start) <= 14; }).length;
    return '<div class="count" role="group" aria-label="Countdowns">' +
        '<p class="count-cap">IB exams</p>' +
        '<div class="count-row"><span class="count-num">' + esc(num) + '</span><span class="count-label">' + esc(label) + '</span></div>' +
        '<p class="count-sub">' + esc(sub) + '</p>' +
        schoolEnds(t) +
        '<ul class="count-mini">' +
          '<li><span>' + esc(mock ? evTitle(mock) : 'Mock exams') + '</span><b>' + esc(mockVal) + '</b></li>' +
          '<li><span>Deadlines, next 14 days</span><b>' + n14 + '</b></li>' +
        '</ul>' +
      '</div>';
  }

  /* days until the last day of school, for each IB year (dates in data.js) */
  var SCHOOL_END = (Array.isArray(window.IB_SCHOOL_END) ? window.IB_SCHOOL_END : []).filter(function (x) { return Array.isArray(x) && typeof x[0] === 'string' && DATE.test(x[1]); });
  function schoolEnds(t) {
    if (!SCHOOL_END.length) return '';
    return '<div class="count-school"><p class="count-cap school">School ends</p><ul class="count-mini school">' + SCHOOL_END.map(function (x) {
      var n = diff(t, x[1]);
      var val = n > 1 ? n + ' days' : n === 1 ? 'Tomorrow' : n === 0 ? 'Today' : 'Done';
      return '<li><span>' + esc(x[0]) + ' · ' + esc(fDay(x[1])) + '</span><b>' + esc(val) + '</b></li>';
    }).join('') + '</ul></div>';
  }

  function cardClasses(t) {
    var todays = blocksFor(t);
    var nm = nowMin();
    var overToday = !todays.length || nm >= toMin(todays[todays.length - 1].end);
    var nextDay = nextSchoolDay(t);
    var which = UI.todayWhich || (overToday && nextDay ? 'next' : 'today');
    if (which === 'next' && !nextDay) which = 'today';
    var d = which === 'today' ? t : nextDay;
    var gap = nextDay ? diff(t, nextDay) : 0;
    var nextLabel = !nextDay ? '' : gap === 1 ? 'Tomorrow' : gap < 7 ? DAYS_LONG[dow(nextDay)] : 'Next school day';
    var title = which === 'today' ? "Today's classes" : gap < 7 ? nextLabel + "'s classes" : 'Back to school';
    var hol = holidayOn(d), blocks = blocksFor(d), body;
    if (hol) body = '<p class="empty">No classes: <b>' + esc(evTitle(hol)) + '</b>.</p>';
    else if (!blocks.length) body = '<p class="empty">No classes ' + (which === 'today' ? 'today' : 'that day') + '.' + (nextDay && which === 'today' ? ' Next school day: <b>' + esc(fDay(nextDay)) + '</b>.' : '') + '</p>';
    else body = (which === 'today' && overToday ? '<p class="day-note">That\'s it for today.</p>' : '') + '<ol class="daylist">' + dayListHTML(d, which === 'today') + '</ol>';
    return '<section class="card c-classes" aria-labelledby="h-classes">' +
        '<header class="card-head"><h2 id="h-classes">' + esc(title) + '<span class="hint">' + esc(fDay(d)) + '</span></h2>' +
          (nextDay ? '<div class="seg" role="group" aria-label="Which day">' +
            '<button type="button" data-act="today-which" data-which="today" aria-pressed="' + (which === 'today') + '">Today</button>' +
            '<button type="button" data-act="today-which" data-which="next" aria-pressed="' + (which === 'next') + '">' + esc(nextLabel) + '</button>' +
          '</div>' : '') +
        '</header>' + body +
        '<button type="button" class="link more-link" data-act="tab" data-tab="timetable">Edit timetable</button>' +
      '</section>';
  }

  function dayListHTML(d, live) {
    var blocks = blocksFor(d);
    if (!blocks.length) return '';
    var nm = live ? nowMin() : -1;
    var first = toMin(blocks[0].start), last = toMin(blocks[blocks.length - 1].end);
    var items = blocks.map(function (b) { return { kind: 'b', b: b, st: toMin(b.start), en: toMin(b.end) }; });
    S.periods.forEach(function (p) {
      if (p.kind === 'break' && toMin(p.start) >= first && toMin(p.end) <= last) items.push({ kind: 'br', p: p, st: toMin(p.start), en: toMin(p.end) });
    });
    items.sort(function (a, b) { return a.st - b.st; });
    var html = '', prevEnd = null, nextMarked = false;
    items.forEach(function (it) {
      if (prevEnd != null && it.st - prevEnd >= 25) {
        html += '<li class="dl-row free"><span class="dl-time">' + minToTime(prevEnd) + '</span><div class="dl-block"><span class="dl-meta">Free · ' + esc(dur(it.st - prevEnd)) + '</span></div></li>';
      }
      if (it.kind === 'br') {
        html += '<li class="dl-row brk"><span class="dl-time">' + it.p.start + '</span><div class="dl-band">' + esc(it.p.label || 'Break') + ' · ' + esc(dur(it.en - it.st)) + '</div></li>';
      } else {
        var b = it.b, cls = '', tag = '', prog = '';
        if (live) {
          if (nm >= it.en) cls = 'past';
          else if (nm >= it.st) {
            cls = 'now';
            tag = '<span class="now-tag">Now · ' + esc(dur(Math.max(1, Math.ceil(it.en - nm)))) + ' left</span>';
            prog = '<span class="prog" style="width:' + ((nm - it.st) / (it.en - it.st) * 100).toFixed(1) + '%"></span>';
          } else if (!nextMarked) {
            nextMarked = true;
            tag = '<span class="next-tag">Next' + (it.st - nm <= 120 ? ' · in ' + esc(dur(Math.max(1, Math.ceil(it.st - nm)))) : '') + '</span>';
          }
        }
        var meta = [b.sl.teacher || b.s.teacher, b.sl.room, b.sl.note].filter(Boolean).join(' · ');
        html += '<li class="dl-row ' + cls + '"><span class="dl-time">' + b.start + '<small>' + b.end + '</small></span>' +
          '<button type="button" class="dl-block" style="' + cvar(b.s) + '" data-act="tt-cell" data-p="' + b.p.id + '" data-d="' + dow(d) + '">' +
            '<span class="dl-top"><span class="dl-name">' + esc(b.s.name) + '</span>' + tag + '</span>' +
            (meta ? '<span class="dl-meta">' + esc(meta) + '</span>' : '') + prog +
          '</button></li>';
      }
      prevEnd = Math.max(prevEnd == null ? 0 : prevEnd, it.en);
    });
    return html;
  }

  function cardComing(t) {
    var list = S.events.filter(function (e) { return !e.done && evEnd(e) >= t; }).sort(byStart).slice(0, 6);
    return '<section class="card c-coming" aria-labelledby="h-coming">' +
        '<header class="card-head"><h2 id="h-coming">Coming up</h2><button type="button" class="link" data-act="cal-agenda">All dates</button></header>' +
        (list.length ? '<ul class="uplist">' + list.map(function (e) { return '<li>' + upRow(e, t) + '</li>'; }).join('') + '</ul>'
          : '<p class="empty">Nothing coming up. Add deadlines in the calendar.</p>') +
      '</section>';
  }

  function cardTasksToday(t) {
    var soon = S.tasks.filter(function (x) { return !x.done && x.due && diff(t, x.due) <= 3; }).sort(taskSort);
    var undated = S.tasks.filter(function (x) { return !x.done && !x.due; }).length;
    return '<section class="card c-tasks" aria-labelledby="h-tasks">' +
        '<header class="card-head"><h2 id="h-tasks">Tasks<span class="hint">next 3 days</span></h2><button type="button" class="link" data-act="tab" data-tab="tasks">All tasks</button></header>' +
        '<form class="quick" data-form="quick-task" autocomplete="off">' +
          '<input type="text" name="title" id="quick-title" maxlength="200" placeholder="Add a task for today (#math sets the subject)" aria-label="New task for today">' +
          '<button type="submit" class="btn primary" aria-label="Add task">' + icon('plus') + '</button>' +
        '</form>' +
        (soon.length ? '<ul class="tasklist">' + soon.map(function (x) { return taskRow(x, t); }).join('') + '</ul>'
          : '<p class="empty">Nothing due in the next 3 days.' + (undated ? ' ' + undated + ' task' + (undated > 1 ? 's have' : ' has') + ' no date.' : '') + '</p>') +
      '</section>';
  }

  var RING_C = 2 * Math.PI * 66;
  function cardFocus() {
    var st = timerState();
    var sel = st ? st.subject : (subj(UI.focusSubject) ? UI.focusSubject : '');
    var len = st ? st.len : UI.focusLen;
    var opts = '<option value="">General study</option>' + S.subjects.filter(function (s) { return s.group !== 'other'; }).map(function (s) {
      return '<option value="' + s.id + '"' + (sel === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var go = !st ? '<button type="button" class="round-btn go" data-act="focus-start">Start</button>'
      : st.running ? '<button type="button" class="round-btn pause" data-act="focus-pause">Pause</button>'
      : '<button type="button" class="round-btn go" data-act="focus-resume">Resume</button>';
    return '<section class="card c-focus" aria-labelledby="h-focus">' +
        '<header class="card-head"><h2 id="h-focus">Focus</h2><button type="button" class="link" data-act="focus-log">Log time by hand</button></header>' +
        '<div class="focus-row">' +
          '<div class="ring' + (st && !st.running ? ' paused' : '') + '">' +
            '<svg viewBox="0 0 148 148" aria-hidden="true"><circle class="trk" cx="74" cy="74" r="66"/><circle class="arc" id="ring-arc" cx="74" cy="74" r="66" stroke-linecap="round" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="0"/></svg>' +
            '<div class="ring-num" role="timer" aria-live="off"><b id="ring-time">' + fmtClock(len * 60) + '</b><span id="ring-sub">' + (st ? (st.running ? 'Focusing' : 'Paused') : 'Ready') + '</span></div>' +
          '</div>' +
          '<div class="focus-controls">' +
            '<span class="select-pill"><select id="focus-subject" data-change="focus-subject" aria-label="Subject"' + (st ? ' disabled' : '') + '>' + opts + '</select>' + icon('updown') + '</span>' +
            '<div class="seg" role="group" aria-label="Session length">' + [25, 45, 60].map(function (m) {
              return '<button type="button" data-act="focus-len" data-len="' + m + '" aria-pressed="' + (len === m) + '"' + (st ? ' disabled' : '') + '>' + m + ' min</button>';
            }).join('') +
              '<button type="button" data-act="focus-custom" aria-pressed="' + ([25, 45, 60].indexOf(len) < 0) + '"' + (st ? ' disabled' : '') + '>' + ([25, 45, 60].indexOf(len) < 0 ? len + ' min' : 'Other') + '</button>' +
            '</div>' +
            '<div class="btns">' +
              '<button type="button" class="round-btn stop" data-act="focus-cancel"' + (st ? '' : ' disabled') + '>Cancel</button>' + go +
            '</div>' +
            (st ? '<button type="button" class="link" data-act="focus-finish">Finish now and log it</button>' : '') +
          '</div>' +
        '</div>' + weekBars() +
      '</section>';
  }

  function weekBars() {
    var t = today(), mon = addDays(t, -dow(t)), sun = addDays(mon, 6);
    var mins = {}, total = 0;
    S.sessions.forEach(function (x) {
      if (x.date >= mon && x.date <= sun) { var k = x.subject || ''; mins[k] = (mins[k] || 0) + x.minutes; total += x.minutes; }
    });
    var rows = [];
    S.subjects.forEach(function (s) { var m = mins[s.id] || 0; if (m > 0 || s.goal > 0) rows.push({ s: s, m: m, goal: s.goal }); });
    if (mins['']) rows.push({ s: null, m: mins[''], goal: 0 });
    rows.sort(function (a, b) { return b.m - a.m || b.goal - a.goal; });
    var max = Math.max.apply(null, [1].concat(rows.map(function (r) { return Math.max(r.m, r.goal); })));
    var anyGoal = rows.some(function (r) { return r.goal > 0; });
    var list = rows.map(function (r) {
      var tip = (r.s ? r.s.name : 'General study') + ': ' + dur(r.m) + (r.goal ? ' of a ' + dur(r.goal) + ' goal' : '') + ' this week';
      return '<li class="bar-row" title="' + esc(tip) + '">' +
          '<span class="bar-label"><i class="sw" style="' + cvar(r.s) + '"></i><span class="t">' + esc(r.s ? r.s.short : 'General') + '</span></span>' +
          '<span class="bar-track" role="img" aria-label="' + esc(tip) + '">' +
            (r.m ? '<span class="bar-fill" style="width:' + (r.m / max * 100).toFixed(1) + '%"></span>' : '') +
            (r.goal ? '<span class="bar-goal" style="left:' + (r.goal / max * 100).toFixed(1) + '%"></span>' : '') +
          '</span>' +
          '<span class="bar-val">' + esc(dur(r.m)) + '</span>' +
        '</li>';
    }).join('');
    return '<div class="focus-week">' +
        '<div class="fw-head"><h3>This week</h3><span>' + (total ? esc(dur(total)) + ' studied' : 'Nothing logged yet') + '</span></div>' +
        (rows.length ? '<ul class="bars">' + list + '</ul>' + (anyGoal ? '<p class="fw-legend"><i></i>Weekly goal (set it on the subject)</p>' : '')
          : '<p class="empty">Finish a focus session and your study time shows up here.</p>') +
      '</div>';
  }

  function updateTimerUI() {
    var st = timerState();
    var tEl = $('#ring-time'), arc = $('#ring-arc');
    if (st) {
      if (st.remaining <= 0) { completeTimer(); return; }
      var secs = Math.ceil(st.remaining / 1000);
      if (tEl) tEl.textContent = fmtClock(secs);
      if (arc) arc.setAttribute('stroke-dashoffset', (RING_C * (1 - st.remaining / st.total)).toFixed(2));
      document.title = fmtClock(secs) + ' · ' + (subj(st.subject) ? subj(st.subject).short : 'Focus') + ' · MyIB';
    } else {
      if (arc) arc.setAttribute('stroke-dashoffset', '0');
      document.title = 'MyIB';
    }
  }
  function completeTimer() {
    var st = timerState();
    if (!st) return;
    S.timer = null;
    logSession(st.subject, st.len, toISO(new Date(st.startedAt)), timerId(st));
    save();
    chime();
    try { if (navigator.vibrate) navigator.vibrate([180, 80, 180]); } catch (e) { /* ignore */ }
    render();
    toast('Session done: ' + dur(st.len) + ' of ' + nameOrGeneral(st.subject) + ' logged');
  }
  var actx = null;
  function unlockAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function chime() {
    if (!actx) return;
    try {
      var t0 = actx.currentTime;
      [880, 1175, 1568].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), at = t0 + i * 0.22;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
        o.connect(g); g.connect(actx.destination);
        o.start(at); o.stop(at + 0.4);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- Timetable ---------- */
  VIEWS.timetable = function () {
    var days = S.settings.weekend ? 7 : 5, t = today(), td = dow(t), hol = holidayOn(t), nm = nowMin();
    var g = '<div class="tt-corner" aria-hidden="true"></div>';
    for (var d = 0; d < days; d++) g += '<div class="tt-dayhead' + (d === td && !hol ? ' today' : '') + '">' + DAYS[d] + '</div>';
    S.periods.forEach(function (p) {
      g += timeButton(p);
      if (p.kind === 'break') { g += '<div class="tt-break">' + esc(p.label || 'Break') + '</div>'; return; }
      for (var dd = 0; dd < days; dd++) g += ttCell(p, dd, td, nm, hol);
    });
    var counts = slotCounts(), filled = Object.keys(S.slots).length;
    var legend = S.subjects.filter(function (s) { return counts[s.id]; })
      .sort(function (a, b) { return counts[b.id] - counts[a.id]; })
      .map(function (s) { return '<span><i class="sw" style="' + cvar(s) + '"></i>' + esc(s.name) + ' <b>' + counts[s.id] + '</b></span>'; }).join('');
    /* an almost empty timetable shows a faint + in every free slot, so phones show where to tap */
    var sparse = filled < 5 ? ' tt-sparse' : '';
    var tip = filled ? '' : '<div class="card tip" role="note"><p><b>Your timetable is empty.</b> ' +
      (hasIBSubjects() ? 'Tap a slot to add a class. Tap a time to change it to your school’s times.' : 'Add your subjects first, then tap a slot to put a class in it.') + '</p>' +
      (hasIBSubjects() ? '' : '<button type="button" class="btn primary" data-act="guide-subjects">' + icon('plus') + 'Add Subjects</button>') + '</div>';
    return '<div class="page-head">' +
        '<div><h1 class="display">Timetable</h1><p class="sub">' + (isFree() ? 'Tap a slot to add a class. Tap a time to edit the row.' : '2º BI B · tap a class to change it, tap a time to edit the row.') + '</p></div>' +
        '<div class="actions">' +
          '<label class="switch"><input type="checkbox" id="tt-weekend" data-change="tt-weekend"' + (S.settings.weekend ? ' checked' : '') + '>Weekend</label>' +
          '<button type="button" class="btn" data-act="tt-add-row">' + icon('plus') + 'Add row</button>' +
        '</div>' +
      '</div>' + tip +
      '<div class="tt-desktop' + sparse + '"><div class="tt" style="--days:' + days + '">' + g + '</div></div>' +
      '<div class="tt-mobile' + sparse + '">' + ttMobile(days, td, nm, hol) + '</div>' +
      (legend ? '<div class="legend" aria-label="Slots per week">' + legend + '</div>' : '') +
      '<p class="tt-foot">' + (isFree() ? 'The rows start with the school’s bell times; tap a time to change one. Numbers show classes per week.' : 'Times come from the printed timetable; tap a time to fix one. Numbers show slots per week.') + '</p>';
  };
  function timeButton(p) {
    var brk = p.kind === 'break';
    return '<button type="button" class="tt-time' + (brk ? ' brk' : '') + '" data-act="tt-period" data-p="' + p.id + '" aria-label="Edit row ' + p.start + ' to ' + p.end + '">' +
      '<b>' + p.start + '</b><span>' + p.end + '</span>' + (p.label && !brk ? '<em>' + esc(p.label) + '</em>' : '') + '</button>';
  }
  function ttCell(p, d, td, nm, hol) {
    var sl = S.slots[slotKey(p.id, d)], s = sl && subj(sl.subject);
    if (!s) return '<button type="button" class="tt-cell empty" data-act="tt-cell" data-p="' + p.id + '" data-d="' + d + '" aria-label="Add a class on ' + DAYS_LONG[d] + ' at ' + p.start + '">' + icon('plus') + '</button>';
    var tm = slotTimes(p, sl);
    var live = !hol && d === td && nm >= toMin(tm.start) && nm < toMin(tm.end);
    var meta = [sl.teacher || s.teacher, sl.room].filter(Boolean).join(' · ');
    return '<button type="button" class="tt-cell' + (live ? ' now' : '') + '" style="' + cvar(s) + '" data-act="tt-cell" data-p="' + p.id + '" data-d="' + d + '" aria-label="' + esc(DAYS_LONG[d] + ' ' + tm.start + ', ' + s.name + (meta ? ', ' + meta : '')) + '">' +
      '<span class="n">' + esc(s.short) + '</span>' +
      (meta ? '<span class="m">' + esc(meta) + '</span>' : '') +
      (sl.start ? '<span class="x">' + sl.start + '–' + sl.end + '</span>' : '') +
      (sl.note ? '<span class="m">' + esc(sl.note) + '</span>' : '') +
    '</button>';
  }
  function ttMobile(days, td, nm, hol) {
    var day = UI.ttDay;
    if (day == null || day >= days) day = td < days ? td : 0;
    var tabs = '<div class="seg tt-days" style="--days:' + days + '" role="group" aria-label="Day">';
    for (var d = 0; d < days; d++) tabs += '<button type="button" class="' + (d === td ? 'today' : '') + '" data-act="tt-day" data-d="' + d + '" aria-pressed="' + (d === day) + '">' + DAYS[d] + '</button>';
    tabs += '</div>';
    var rows = S.periods.map(function (p) {
      if (p.kind === 'break') return '<li class="dl-row brk">' + timeButton(p) + '<div class="dl-band">' + esc(p.label || 'Break') + '</div></li>';
      return '<li class="dl-row">' + timeButton(p) + ttCell(p, day, td, nm, hol) + '</li>';
    }).join('');
    return tabs + '<ol class="daylist glass">' + rows + '</ol>';
  }

  /* ---------- Calendar ---------- */
  function visible(e) { return UI.hidden.indexOf(e.subject || '_school') < 0; }
  VIEWS.calendar = function () {
    var t = today();
    if (!UI.calMonth) UI.calMonth = t.slice(0, 7);
    if (!UI.calSel) UI.calSel = t;
    var ym = UI.calMonth.split('-').map(Number), y = ym[0], m = ym[1];
    var agenda = UI.calMode === 'agenda';
    var head = '<div class="page-head">' +
        '<div class="cal-title"><h1 class="display">' + (agenda ? 'All dates' : esc(MONTH_LONG[m - 1]) + ' <span>' + y + '</span>') + '</h1></div>' +
        '<div class="actions">' +
          '<div class="seg" role="group" aria-label="View"><button type="button" data-act="cal-mode" data-mode="month" aria-pressed="' + !agenda + '">Month</button><button type="button" data-act="cal-mode" data-mode="agenda" aria-pressed="' + agenda + '">List</button></div>' +
          (agenda ? '' :
            '<button type="button" class="icon-btn" data-act="cal-step" data-step="-1" aria-label="Previous month">' + icon('left') + '</button>' +
            '<button type="button" class="btn" data-act="cal-today">Today</button>' +
            '<button type="button" class="icon-btn" data-act="cal-step" data-step="1" aria-label="Next month">' + icon('right') + '</button>') +
          '<button type="button" class="btn primary" data-act="ev-new">' + icon('plus') + 'Event</button>' +
        '</div>' +
      '</div>';
    var panel = UI.calSel && UI.calSel.slice(0, 7) === UI.calMonth ? dayPanel(UI.calSel, t) : monthPanel(y, m, t);
    return head + filterChips() + (agenda ? agendaHTML(t) : '<div class="cal-layout">' + monthHTML(y, m, t) + panel + '</div>');
  };
  function monthPanel(y, m, t) {
    var first = y + '-' + pad(m) + '-01', last = toISO(new Date(y, m, 0));
    var evs = S.events.filter(function (e) { return visible(e) && e.start <= last && evEnd(e) >= first; }).sort(byStart);
    return '<aside class="daypanel" aria-labelledby="dp-h">' +
        '<h2 id="dp-h">' + MONTH_LONG[m - 1] + ' ' + y + '</h2>' +
        '<p class="dp-sub">' + (evs.length ? evs.length + ' date' + (evs.length > 1 ? 's' : '') + ' this month' : 'Nothing scheduled this month') + ' · pick a day for details</p>' +
        (evs.length ? '<ul class="dp-list dated">' + evs.map(function (e) { return '<li>' + upRow(e, t) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="dp-actions"><button type="button" class="btn small" data-act="ev-new" data-date="' + (t >= first && t <= last ? t : first) + '">' + icon('plus') + 'Event</button></div>' +
      '</aside>';
  }

  function filterChips() {
    var used = new Set(S.events.map(function (e) { return e.subject || '_school'; }));
    var items = S.subjects.filter(function (s) { return used.has(s.id); }).map(function (s) { return { id: s.id, name: s.short, style: cvar(s), cls: '' }; });
    if (used.has('_school')) items.push({ id: '_school', name: 'School dates', style: '', cls: 'mock' });
    if (items.length < 2) return '';
    var hidden = new Set(UI.hidden);
    return '<div class="filters" role="group" aria-label="Show or hide subjects">' + items.map(function (i) {
      return '<button type="button" class="chip" data-act="cal-filter" data-id="' + i.id + '" aria-pressed="' + !hidden.has(i.id) + '"><i class="sw ' + i.cls + '" style="' + i.style + '"></i>' + esc(i.name) + '</button>';
    }).join('') + (hidden.size ? '<button type="button" class="link" data-act="cal-filter-all">Show all</button>' : '') + '</div>';
  }

  function monthHTML(y, m, t) {
    var first = y + '-' + pad(m) + '-01';
    var start = addDays(first, -dow(first));
    var lastDay = toISO(new Date(y, m, 0));
    var end = addDays(lastDay, 6 - dow(lastDay));
    var evs = S.events.filter(visible);
    var multi = evs.filter(function (e) { return !!e.end; }).sort(byStart);
    var singles = evs.filter(function (e) { return !e.end; });
    var tasks = S.tasks.filter(function (x) { return x.due && (!x.subject || UI.hidden.indexOf(x.subject) < 0); });
    var html = '<div class="month"><div class="mhead" aria-hidden="true">' + DAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>';
    for (var ws = start; ws <= end; ws = addDays(ws, 7)) {
      var we = addDays(ws, 6);
      var segs = multi.filter(function (e) { return e.start <= we && evEnd(e) >= ws; }).map(function (e) {
        return { e: e, s: e.start < ws ? ws : e.start, en: evEnd(e) > we ? we : evEnd(e) };
      });
      var laneEnds = [];
      segs.forEach(function (sg) {
        var lane = -1;
        for (var i = 0; i < laneEnds.length; i++) if (laneEnds[i] < sg.s) { lane = i; break; }
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(sg.en); } else laneEnds[lane] = sg.en;
        sg.lane = lane;
      });
      var lanes = laneEnds.length;
      var w = '<div class="wk" style="grid-template-rows:var(--num-h) ' + (lanes ? 'repeat(' + lanes + ',var(--lane-h)) ' : '') + 'minmax(var(--stack-h),auto)">';
      var i2, d;
      for (i2 = 0; i2 < 7; i2++) {
        d = addDays(ws, i2);
        var out = d.slice(0, 7) !== UI.calMonth;
        var dayItems = singles.filter(function (e) { return e.start === d; }).length + segs.filter(function (sg) { return sg.s <= d && sg.en >= d; }).length + tasks.filter(function (x) { return x.due === d; }).length;
        w += '<button type="button" class="mday' + (i2 === 0 ? ' c1' : '') + (i2 >= 5 ? ' wknd' : '') + (d === UI.calSel ? ' sel' : '') + '" style="grid-column:' + (i2 + 1) + '" data-act="cal-sel" data-date="' + d + '" aria-label="' + esc(fLong(d) + (dayItems ? ', ' + dayItems + ' item' + (dayItems > 1 ? 's' : '') : '')) + '"' + (d === UI.calSel ? ' aria-current="date"' : '') + '></button>';
        w += '<span class="mnum' + (out ? ' out' : '') + (d === t ? ' today' : d === UI.calSel ? ' sel' : '') + '" style="grid-column:' + (i2 + 1) + '" aria-hidden="true">' + fromISO(d).getDate() + '</span>';
      }
      segs.forEach(function (sg) {
        var e = sg.e, c1 = diff(ws, sg.s) + 1, c2 = diff(ws, sg.en) + 2;
        var cls = ['bar', e.type === 'mock' ? 'mock' : e.type === 'holiday' ? 'holiday' : '', e.start < ws ? 'cont-l' : '', evEnd(e) > we ? 'cont-r' : '', e.done ? 'done' : ''].filter(Boolean).join(' ');
        w += '<button type="button" class="' + cls + '" style="grid-row:' + (2 + sg.lane) + ';grid-column:' + c1 + ' / ' + c2 + ';' + cvar(subj(e.subject)) + '" data-act="ev-open" data-id="' + e.id + '" title="' + esc(evFull(e) + ' · ' + fShort(e.start) + ' – ' + fShort(evEnd(e))) + '">' + esc(evTitle(e)) + '</button>';
      });
      for (i2 = 0; i2 < 7; i2++) {
        d = addDays(ws, i2);
        var items = singles.filter(function (e) { return e.start === d; }).sort(evOrder).map(function (e) { return { k: 'e', e: e }; })
          .concat(tasks.filter(function (x) { return x.due === d; }).sort(taskSort).map(function (x) { return { k: 't', x: x }; }));
        var MAX = 3, cut = items.length > MAX ? MAX - 1 : MAX, st = '';
        items.forEach(function (it, idx) {
          var extra = idx >= cut;
          st += it.k === 'e' ? mpEvent(it.e, extra) : mpTask(it.x, extra);
        });
        if (items.length > cut) st += '<button type="button" class="more" data-act="cal-sel" data-date="' + d + '">+' + (items.length - cut) + ' more</button>';
        w += '<div class="mstack" style="grid-row:' + (2 + lanes) + ';grid-column:' + (i2 + 1) + '">' + st + '</div>';
      }
      html += w + '</div>';
    }
    return html + '</div>';
  }
  function mpEvent(e, extra) {
    var cls = ['mp', e.type === 'exam' ? 'exam' : '', e.type === 'grades' ? 'grades' : '', e.done ? 'done' : '', extra ? 'extra' : ''].filter(Boolean).join(' ');
    var d = evDetail(e);
    return '<button type="button" class="' + cls + '" style="' + cvar(subj(e.subject)) + '" data-act="ev-open" data-id="' + e.id + '" title="' + esc(evFull(e)) + '">' +
      '<span class="t">' + esc(evShort(e)) + '</span>' + (d ? '<span class="d">' + esc(d) + '</span>' : '') + '</button>';
  }
  function mpTask(x, extra) {
    return '<button type="button" class="mp task' + (x.done ? ' done' : '') + (extra ? ' extra' : '') + '" style="' + cvar(subj(x.subject)) + '" data-act="task-open" data-id="' + x.id + '" title="' + esc('Task: ' + x.title) + '"><span class="t">' + esc(x.title) + '</span></button>';
  }
  function dayPanel(d, t) {
    var evs = S.events.filter(function (e) { return covers(e, d) && visible(e); }).sort(evOrder);
    var tasks = S.tasks.filter(function (x) { return x.due === d; }).sort(taskSort);
    var blocks = blocksFor(d), n = diff(t, d);
    var sub = rel(n) + ' · ' + (holidayOn(d) ? 'no school' : blocks.length ? blocks.length + ' class' + (blocks.length > 1 ? 'es' : '') + ', ' + blocks[0].start + '–' + blocks[blocks.length - 1].end : 'no classes');
    return '<aside class="daypanel" aria-labelledby="dp-h">' +
        '<h2 id="dp-h">' + esc(fLong(d)) + '</h2><p class="dp-sub">' + esc(sub) + '</p>' +
        (evs.length ? '<ul class="dp-list">' + evs.map(function (e) { return '<li>' + upRow(e, t, { noDate: true }) + (e.note ? '<p class="dp-note">' + esc(e.note) + '</p>' : '') + '</li>'; }).join('') + '</ul>'
          : '<p class="empty dp-h">No deadlines or exams.</p>') +
        (tasks.length ? '<h3 class="eyebrow dp-h">Tasks due</h3><ul class="tasklist">' + tasks.map(function (x) { return taskRow(x, t); }).join('') + '</ul>' : '') +
        '<div class="dp-actions"><button type="button" class="btn small" data-act="ev-new" data-date="' + d + '">' + icon('plus') + 'Event</button><button type="button" class="btn small" data-act="task-new" data-date="' + d + '">' + icon('plus') + 'Task</button></div>' +
      '</aside>';
  }
  function agendaHTML(t) {
    var evs = S.events.filter(visible).filter(function (e) { return UI.showPast || evEnd(e) >= t; }).sort(byStart);
    var tools = '<div class="ag-tools"><label class="switch"><input type="checkbox" id="cal-past" data-change="cal-past"' + (UI.showPast ? ' checked' : '') + '>Show past dates</label></div>';
    if (!evs.length) return '<div class="agenda">' + tools + '<p class="empty">No dates to show.</p></div>';
    var groups = [], idx = {};
    evs.forEach(function (e) {
      var k = e.start.slice(0, 7);
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ k: k, list: [] }); }
      groups[idx[k]].list.push(e);
    });
    return '<div class="agenda">' + tools + groups.map(function (g) {
      var p = g.k.split('-').map(Number);
      return '<section class="ag-month"><h2 class="eyebrow">' + MONTH_LONG[p[1] - 1] + ' ' + p[0] + '</h2><ul class="ag-list">' +
        g.list.map(function (e) { return '<li>' + upRow(e, t, { past: evEnd(e) < t }) + '</li>'; }).join('') + '</ul></section>';
    }).join('') + '</div>';
  }

  /* ---------- Tasks ---------- */
  VIEWS.tasks = function () {
    var t = today(), f = UI.taskFilter;
    if (f !== 'all' && f !== '_none' && !subj(f)) f = UI.taskFilter = 'all';
    var all = S.tasks.filter(function (x) { return f === 'all' || x.subject === f || (f === '_none' && !x.subject); });
    var open = all.filter(function (x) { return !x.done; });
    var t1 = addDays(t, 1);
    var groups = [
      ['over', 'Overdue', function (x) { return x.due && x.due < t; }],
      ['today', 'Today', function (x) { return x.due === t; }],
      ['tomorrow', 'Tomorrow', function (x) { return x.due === t1; }],
      ['week', 'Next 7 days', function (x) { return x.due && x.due > t1 && diff(t, x.due) <= 7; }],
      ['later', 'Later', function (x) { return x.due && diff(t, x.due) > 7; }],
      ['nodate', 'No date', function (x) { return !x.due; }]
    ];
    var body = '';
    groups.forEach(function (g) {
      var list = open.filter(g[2]).sort(taskSort);
      if (list.length) body += '<section class="tgroup ' + g[0] + '"><h2 class="eyebrow">' + g[1] + '<span class="n">' + list.length + '</span></h2><ul class="tasklist glass">' + list.map(function (x) { return taskRow(x, t); }).join('') + '</ul></section>';
    });
    var done = all.filter(function (x) { return x.done; }).sort(function (a, b) { return (b.doneAt || '') < (a.doneAt || '') ? -1 : (b.doneAt || '') > (a.doneAt || '') ? 1 : 0; });
    if (UI.showDone && done.length) body += '<section class="tgroup"><h2 class="eyebrow">Completed<span class="n">' + done.length + '</span></h2><ul class="tasklist glass">' + done.slice(0, 150).map(function (x) { return taskRow(x, t); }).join('') + '</ul></section>';
    if (!open.length) body = emptyTasks(t) + body;
    var dueWeek = open.filter(function (x) { return x.due && diff(t, x.due) <= 7; }).length;
    var pre = f !== 'all' && f !== '_none' ? f : '';
    return '<div class="page-head"><div><h1 class="display">Tasks</h1><p class="sub">' + open.length + ' open' + (dueWeek ? ' · ' + dueWeek + ' due within a week' : '') + '</p></div></div>' +
      '<form class="task-add" data-form="task-add" autocomplete="off">' +
        '<input class="ta-title" type="text" name="title" id="ta-title" maxlength="200" placeholder="New task (#math sets the subject)" aria-label="New task">' +
        '<span class="select-pill"><select name="subject" id="ta-subject" aria-label="Subject">' + subjectOptions(pre, 'No subject') + '</select>' + icon('updown') + '</span>' +
        '<input type="date" name="due" id="ta-due" value="' + t + '" aria-label="Due date">' +
        '<button type="submit" class="btn primary">' + icon('plus') + 'Add</button>' +
      '</form>' +
      '<div class="tfilters">' + taskFilterChips() + '<label class="switch"><input type="checkbox" id="tasks-done" data-change="tasks-done"' + (UI.showDone ? ' checked' : '') + '>Show completed</label></div>' +
      '<div class="tgroups">' + body + '</div>';
  };
  function taskFilterChips() {
    var used = new Set(S.tasks.map(function (x) { return x.subject || '_none'; }));
    var items = [{ id: 'all', name: 'All', s: null }].concat(S.subjects.filter(function (s) { return used.has(s.id); }).map(function (s) { return { id: s.id, name: s.short, s: s }; }));
    if (used.has('_none')) items.push({ id: '_none', name: 'No subject', s: null });
    return '<div class="filters flat" role="group" aria-label="Filter tasks by subject">' + items.map(function (i) {
      return '<button type="button" class="chip radio" data-act="task-filter" data-id="' + i.id + '" aria-pressed="' + (UI.taskFilter === i.id) + '">' + (i.s ? '<i class="sw" style="' + cvar(i.s) + '"></i>' : '') + esc(i.name) + '</button>';
    }).join('') + '</div>';
  }
  function emptyTasks(t) {
    var next = S.events.filter(function (e) { return !e.done && (e.type === 'deadline' || e.type === 'exam') && e.start >= t; }).sort(byStart).slice(0, 3);
    return '<div class="card"><p class="empty"><b>No open tasks.</b>' + (next.length ? ' Break your next deadlines into steps:' : '') + '</p>' +
      (next.length ? '<div class="suggest">' + next.map(function (e) {
        return '<button type="button" class="btn" data-act="task-new" data-event="' + e.id + '">' + icon('plus') + '<span>' + esc(evFull(e)) + ' <span class="detail">· ' + esc(fDay(e.start)) + '</span></span></button>';
      }).join('') + '</div>' : '') + '</div>';
  }

  /* ---------- Subjects ---------- */
  VIEWS.subjects = function () {
    var t = today(), counts = slotCounts(), mon = addDays(t, -dow(t)), sun = addDays(mon, 6), studied = {};
    S.sessions.forEach(function (x) { if (x.subject && x.date >= mon && x.date <= sun) studied[x.subject] = (studied[x.subject] || 0) + x.minutes; });
    function card(s) {
      var evs = S.events.filter(function (e) { return e.subject === s.id; }).sort(byStart);
      var next = evs.filter(function (e) { return !e.done && e.type !== 'exam' && evEnd(e) >= t; })[0];
      var exams = evs.filter(function (e) { return e.type === 'exam'; });
      var open = S.tasks.filter(function (x) { return x.subject === s.id && !x.done; }).length;
      var doneN = S.tasks.filter(function (x) { return x.subject === s.id && x.done; }).length;
      var n = counts[s.id] || 0;
      var slotsTxt = n ? (s.group === 'other' ? n + '× a week' : n + ' class' + (n > 1 ? 'es' : '') + ' a week') : '';
      var line = [s.teacher, slotsTxt].filter(Boolean).join(' · ');
      var rows = [];
      if (next) {
        var what = [next.title, evDetail(next)].filter(Boolean).join(' · ') || evTitle(next);
        rows.push('<span class="kv"><span class="k">Next</span><span>' + esc(what) + ' · ' + esc(fDay(next.start)) + ' <em>' + esc(rel(diff(t, next.start)).toLowerCase()) + '</em></span></span>');
      }
      if (exams.length) rows.push('<span class="kv"><span class="k">Exams</span><span>' + exams.map(function (e) { return esc(shortPaper(e.detail) + ' ' + fDay(e.start)); }).join('<br>') + '</span></span>');
      if (open || doneN) rows.push('<span class="kv"><span class="k">Tasks</span><span>' + open + ' open' + (doneN ? ' · ' + doneN + ' done' : '') + '</span></span>');
      if (s.goal) {
        var m = studied[s.id] || 0;
        rows.push('<span class="kv"><span class="k">Study</span><span>' + esc(dur(m)) + ' of ' + esc(dur(s.goal)) + ' this week<span class="meter" aria-hidden="true"><i style="width:' + Math.min(100, m / s.goal * 100).toFixed(0) + '%"></i></span></span></span>');
      }
      var pp = plusOn() ? S.papers.filter(function (x) { return x.subject === s.id; }) : [];
      if (pp.length) rows.push('<span class="kv"><span class="k">Papers</span><span>' + pp.length + ' done · ' + paperAvg(pp) + '% average</span></span>');
      return '<button type="button" class="scard" style="' + cvar(s) + '" data-act="subj-open" data-id="' + s.id + '">' +
          '<span class="sc-top"><span class="sc-icon" aria-hidden="true" style="color:' + iconInk(s.color) + '">' + esc(badge(s)) + '</span><span class="sc-name">' + esc(s.name) + '</span>' + (s.level ? '<span class="lvl">' + s.level + '</span>' : '') + '</span>' +
          (line ? '<span class="sc-line">' + esc(line) + '</span>' : '') + rows.join('') +
          (s.notes ? '<span class="sc-notes">' + esc(s.notes) + '</span>' : '') +
        '</button>';
    }
    function group(g, label) {
      var list = S.subjects.filter(function (s) { return s.group === g; });
      return list.length ? '<section class="sgroup"><h2 class="eyebrow">' + label + '</h2><div class="sgrid">' + list.map(card).join('') + '</div></section>' : '';
    }
    var tip = hasIBSubjects() ? '' : '<div class="card tip" role="note"><p><b>No IB subjects yet.</b> Pick yours from the list, then tap each one to set its level and teacher.</p>' +
      '<button type="button" class="btn primary" data-act="guide-subjects">' + icon('plus') + 'Pick Subjects</button></div>';
    return '<div class="page-head"><div><h1 class="display">Subjects</h1><p class="sub">Teachers, levels, dates and weekly study goals.</p></div>' +
        '<div class="actions"><button type="button" class="btn" data-act="papers">' + icon('paper') + 'Past papers' + (papersNew() ? '<span class="tag-new">New</span>' : '') + '</button>' +
        '<button type="button" class="btn" data-act="subj-new">' + icon('plus') + 'Add subject</button></div></div>' +
      tip + group('ib', 'IB subjects') + group('core', 'Core') + group('other', 'Other');
  };

  /* =========================================================
     Sheets
     ========================================================= */
  var settingsTouched = false;

  function openEvent(id, preset) {
    preset = preset || {};
    var e = id ? evById(id) : null;
    if (id && !e) return;
    var v = e || { type: 'deadline', subject: preset.subject || '', title: '', detail: '', start: preset.date || UI.calSel || today(), end: null, note: '', done: false };
    var t = today();
    var typeOpts = optionList([['deadline', 'Deadline'], ['exam', 'Exam'], ['mock', 'Mock exams'], ['holiday', 'Holiday'], ['grades', 'Grades'], ['other', 'Other']], v.type);
    var linked = e ? S.tasks.filter(function (x) { return x.event === e.id; }).sort(taskSort) : [];
    var body =
      grp(rField({ label: 'Title', name: 'title', id: 'ev-title', value: v.title, max: 80, placeholder: 'Title (IA, Essay, Exam…)', autofocus: !e }) +
          rField({ label: 'Detail', name: 'detail', id: 'ev-detail', value: v.detail, max: 80, placeholder: 'Detail (Last draft, Paper 2…)' })) +
      grp(rSelect('Subject', 'subject', 'ev-subject', subjectOptions(v.subject || '', 'None (school date)')) +
          rSelect('Type', 'type', 'ev-type', typeOpts)) +
      grp(rPill('Date', 'date', 'start', 'ev-start', v.start, ' required') +
          rPill('Last day', 'date', 'end', 'ev-end', v.end || ''), '', 'Add a last day for dates that run over several days, like mock exams or holidays.') +
      grp(rField({ area: true, label: 'Notes', name: 'note', id: 'ev-note', value: v.note, max: 2000, placeholder: 'Notes' })) +
      grp(rSwitch('Done / handed in', 'done', 'ev-done', v.done)) +
      (e && e.type !== 'holiday' ? grp(
        (linked.length ? '<ul class="tasklist">' + linked.map(function (x) { return taskRow(x, t); }).join('') + '</ul>' : '') +
        rButton(icon('plus') + 'Add a task for this', 'task-new', ' data-event="' + e.id + '"'),
        'Tasks for this', linked.length ? '' : 'Break it into steps you can tick off.') : '');
    openDialog({
      title: e ? 'Edit Event' : 'New Event',
      body: body,
      submitLabel: e ? 'Save' : 'Add',
      danger: e ? { label: 'Delete Event', act: 'ev-delete', id: e.id } : null,
      onSubmit: function (fd) {
        var start = fd.get('start');
        if (!DATE.test(start)) { fieldError('#ev-start', 'Pick a date.'); return false; }
        var end = fd.get('end');
        if (end && DATE.test(end) && end < start) { fieldError('#ev-end', 'The last day can’t come before the first.'); return false; }
        var data = {
          type: TYPES.indexOf(fd.get('type')) >= 0 ? fd.get('type') : 'other',
          subject: subj(fd.get('subject')) ? fd.get('subject') : null,
          title: clip(fd.get('title'), 80), detail: clip(fd.get('detail'), 80),
          start: start, end: DATE.test(end) && end > start ? end : null,
          note: clip(fd.get('note'), 2000, true), done: fd.get('done') === 'on'
        };
        if (!data.subject && !data.title && !data.detail) { fieldError('#ev-title', 'Add a title or pick a subject.'); return false; }
        if (e) Object.assign(e, data); else S.events.push(Object.assign({ id: uid('ev') }, data));
        save(); render();
        toast(e ? 'Event saved' : 'Event added');
      }
    });
  }

  function openTask(id, preset) {
    preset = preset || {};
    var x = id ? taskById(id) : null;
    if (id && !x) return;
    var t = today();
    var pe = preset.event ? evById(preset.event) : null;
    var v = x || {
      title: '', subject: preset.subject || (pe && pe.subject) || '',
      due: preset.date || (pe ? addDays(pe.start, -1) : t), event: pe ? pe.id : '', est: null, notes: '', done: false
    };
    if (!x && pe && v.due < t) v.due = t;
    var evOpts = S.events.filter(function (e) { return e.type !== 'holiday' && (evEnd(e) >= t || e.id === v.event); }).sort(byStart).map(function (e) {
      return '<option value="' + e.id + '"' + (e.id === v.event ? ' selected' : '') + '>' + esc(fDay(e.start) + ' · ' + evFull(e)) + '</option>';
    }).join('');
    var ests = [['', 'Not set'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1 h 30'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']];
    if (!ests.some(function (o) { return String(o[0]) === String(v.est || ''); })) ests.push([v.est, dur(v.est)]);
    var body =
      grp(rField({ label: 'Task', name: 'title', id: 'tk-title', value: v.title, max: 200, placeholder: 'Task', autofocus: !x }) +
          rField({ area: true, label: 'Notes', name: 'notes', id: 'tk-notes', value: v.notes, max: 2000, placeholder: 'Notes' })) +
      grp(rSelect('Subject', 'subject', 'tk-subject', subjectOptions(v.subject || '', 'None')) +
          rSelect('For deadline', 'event', 'tk-event', '<option value="">None</option>' + evOpts)) +
      grp(rPill('Due', 'date', 'due', 'tk-due', v.due || '') +
          rSelect('Time needed', 'est', 'tk-est', optionList(ests, v.est || ''))) +
      (x ? grp(rSwitch('Done', 'done', 'tk-done', x.done)) : '');
    openDialog({
      title: x ? 'Edit Task' : 'New Task',
      body: body,
      submitLabel: x ? 'Save' : 'Add',
      danger: x ? { label: 'Delete Task', act: 'task-delete', id: x.id } : null,
      onSubmit: function (fd) {
        var title = clip(fd.get('title'), 200);
        if (!title) { fieldError('#tk-title', 'Write what the task is.'); return false; }
        var due = fd.get('due'), est = parseInt(fd.get('est'), 10);
        var data = {
          title: title, subject: subj(fd.get('subject')) ? fd.get('subject') : null, due: DATE.test(due) ? due : null,
          event: evById(fd.get('event')) ? fd.get('event') : null, est: est > 0 ? est : null, notes: clip(fd.get('notes'), 2000, true)
        };
        if (x) {
          var was = x.done;
          Object.assign(x, data);
          x.done = fd.get('done') === 'on';
          if (x.done && !was) x.doneAt = t;
          if (!x.done) x.doneAt = null;
        } else S.tasks.push(Object.assign({ id: uid('t'), done: false, doneAt: null, created: t }, data));
        save(); render();
        toast(x ? 'Task saved' : 'Task added');
      }
    });
  }

  function openCell(pid, d) {
    var p = periodById(pid);
    if (!p || !(d >= 0 && d <= 6)) return;
    var key = slotKey(pid, d), sl = S.slots[key] || null, cur = sl ? sl.subject : '', s = subj(cur);
    var pick = '<label class="row pick"><input type="radio" name="subject" value=""' + (!s ? ' checked' : '') + '><span class="dot none"></span><span class="row-label">Free</span>' + icon('tick') + '</label>' +
      S.subjects.map(function (x) {
        return '<label class="row pick" style="' + cvar(x) + '"><input type="radio" name="subject" value="' + x.id + '"' + (x.id === cur ? ' checked' : '') + '>' +
          '<span class="dot"></span><span class="row-label">' + esc(x.name) + '</span>' + (x.teacher ? '<span class="row-meta">' + esc(x.teacher) + '</span>' : '') + icon('tick') + '</label>';
      }).join('');
    var body =
      grp(pick, 'Subject') +
      grp(rText('Teacher', 'teacher', 'c-teacher', sl && sl.teacher, s && s.teacher ? s.teacher : 'Subject default', 60) +
          rText('Room', 'room', 'c-room', sl && sl.room, 'Optional', 40) +
          rText('Note', 'note', 'c-note', sl && sl.note, 'Optional', 80), 'Details') +
      grp(rPill('Starts', 'time', 'cstart', 'c-start', sl && sl.start) +
          rPill('Ends', 'time', 'cend', 'c-end', sl && sl.end), 'Own time', 'Leave both empty to use ' + p.start + '–' + p.end + '. An empty teacher uses the subject’s teacher.');
    openDialog({
      title: DAYS_LONG[d] + ' · ' + p.start,
      body: body,
      onSubmit: function (fd) {
        var sid = fd.get('subject');
        if (!sid || !subj(sid)) delete S.slots[key];
        else {
          var c = { subject: sid };
          var teacher = clip(fd.get('teacher'), 60), room = clip(fd.get('room'), 40), note = clip(fd.get('note'), 80);
          if (teacher) c.teacher = teacher;
          if (room) c.room = room;
          if (note) c.note = note;
          var cs = fd.get('cstart'), ce = fd.get('cend');
          if (cs || ce) {
            if (!TIME.test(cs) || !TIME.test(ce)) { fieldError(TIME.test(cs) ? '#c-end' : '#c-start', 'Set both times, or clear both.'); return false; }
            if (toMin(ce) <= toMin(cs)) { fieldError('#c-end', 'The end has to be after the start.'); return false; }
            c.start = cs; c.end = ce;
          }
          S.slots[key] = c;
        }
        save(); render();
        toast('Timetable updated');
      }
    });
  }

  function openPeriod(pid) {
    var p = pid ? periodById(pid) : null;
    if (pid && !p) return;
    var last = S.periods[S.periods.length - 1];
    var v = p || { start: last ? last.end : '16:00', end: last ? minToTime(Math.min(toMin(last.end) + 60, 1439)) : '17:00', kind: 'class', label: '' };
    var used = p ? Object.keys(S.slots).filter(function (k) { return k.indexOf(p.id + '|') === 0; }).length : 0;
    var body =
      grp(rPill('Starts', 'time', 'start', 'p-start', v.start, ' required autofocus') +
          rPill('Ends', 'time', 'end', 'p-end', v.end, ' required')) +
      grp(rText('Label', 'label', 'p-label', v.label, v.kind === 'break' ? 'Break' : 'Optional', 40) +
          rSelect('Row type', 'kind', 'p-kind', optionList([['class', 'Classes'], ['break', 'Break']], v.kind)), '',
          'Rows sort themselves by start time.' + (used ? ' This row has ' + used + ' slot' + (used > 1 ? 's' : '') + '; deleting it removes them.' : ''));
    openDialog({
      title: p ? 'Edit Row' : 'New Row',
      body: body,
      submitLabel: p ? 'Save' : 'Add',
      danger: p ? { label: 'Delete Row', act: 'period-delete', id: p.id } : null,
      onSubmit: function (fd) {
        var start = fd.get('start'), end = fd.get('end');
        if (!TIME.test(start)) { fieldError('#p-start', 'Pick a start time.'); return false; }
        if (!TIME.test(end) || toMin(end) <= toMin(start)) { fieldError('#p-end', 'The end has to be after the start.'); return false; }
        var data = { start: start, end: end, kind: fd.get('kind') === 'break' ? 'break' : 'class', label: clip(fd.get('label'), 40) };
        if (p) Object.assign(p, data); else S.periods.push(Object.assign({ id: uid('p') }, data));
        S.periods.sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
        save(); render();
        toast(p ? 'Row saved' : 'Row added');
      }
    });
  }

  function openSubject(id) {
    var s = id ? subj(id) : null;
    if (id && !s) return;
    var freeColor = PALETTE.filter(function (c) { return !S.subjects.some(function (x) { return x.color === c; }); })[0] || PALETTE[0];
    var v = s || { name: '', short: '', color: freeColor, group: 'ib', level: '', teacher: '', goal: 0, notes: '' };
    var custom = PALETTE.indexOf(v.color) < 0;
    var sw = PALETTE.map(function (c) {
      return '<label class="swatch" style="--c:' + c + '"><input type="radio" name="color" value="' + c + '"' + (v.color === c ? ' checked' : '') + ' aria-label="Colour ' + c + '"><span></span></label>';
    }).join('') +
      '<label class="swatch custom"><input type="radio" name="color" value="custom"' + (custom ? ' checked' : '') + ' tabindex="-1" aria-hidden="true"><span></span></label>' +
      '<span class="colorpick-wrap"><input type="color" class="colorpick" name="customColor" id="s-color" value="' + (custom ? v.color.toLowerCase() : '#888888') + '" aria-label="Pick your own colour"></span>';
    var evs = s ? S.events.filter(function (e) { return e.subject === s.id; }).sort(byStart) : [];
    var body =
      grp(rField({ label: 'Name', name: 'name', id: 's-name', value: v.name, max: 60, placeholder: 'Name', autofocus: !s }) +
          rText('Short name', 'short', 's-short', v.short, 'Used where space is tight', 18)) +
      grp('<div class="swatches">' + sw + '</div>', 'Colour') +
      grp(rSelect('Group', 'group', 's-group', optionList([['ib', 'IB subject'], ['core', 'Core'], ['other', 'Other']], v.group)) +
          rSelect('Level', 'level', 's-level', optionList([['', 'Not set'], ['SL', 'SL'], ['HL', 'HL']], v.level)) +
          rPill('Weekly goal (hours)', 'number', 'goal', 's-goal', v.goal ? String(+(v.goal / 60).toFixed(2)) : '', ' min="0" max="40" step="0.5" inputmode="decimal" placeholder="0"') +
          rText('Teacher', 'teacher', 's-teacher', v.teacher, 'Optional', 60)) +
      grp(rField({ area: true, label: 'Notes', name: 'notes', id: 's-notes', value: v.notes, max: 4000, placeholder: 'Notes: IA topic, research question, word counts…' })) +
      (s ? (evs.length ? grp('<ul class="dlg-list">' + evs.map(function (e) {
            return '<li><span>' + esc([e.title, evDetail(e)].filter(Boolean).join(' · ') || evTitle(e)) + '</span><span class="muted">' + esc(fDay(e.start)) + '</span></li>';
          }).join('') + '</ul>', 'Dates') : '<p class="group-head">Dates</p><p class="group-foot">No dates yet. Add them from the calendar.</p>') : '');
    openDialog({
      title: s ? s.name : 'New Subject',
      body: body,
      wide: true,
      submitLabel: s ? 'Save' : 'Add',
      danger: s ? { label: 'Delete Subject', act: 'subj-delete', id: s.id } : null,
      onSubmit: function (fd) {
        var name = clip(fd.get('name'), 60);
        if (!name) { fieldError('#s-name', 'Give the subject a name.'); return false; }
        var color = fd.get('color');
        if (color === 'custom') color = fd.get('customColor');
        if (!HEX.test(color || '')) color = '#8E8E93';
        var goalH = parseFloat(String(fd.get('goal') || '').replace(',', '.'));
        var data = {
          name: name, short: clip(fd.get('short'), 18) || shortFrom(name), color: color.toUpperCase(),
          group: ['ib', 'core', 'other'].indexOf(fd.get('group')) >= 0 ? fd.get('group') : 'ib',
          level: fd.get('level') === 'SL' || fd.get('level') === 'HL' ? fd.get('level') : '',
          teacher: clip(fd.get('teacher'), 60),
          goal: goalH > 0 ? Math.min(2400, Math.round(goalH * 60)) : 0,
          notes: clip(fd.get('notes'), 4000, true)
        };
        if (s) Object.assign(s, data); else S.subjects.push(Object.assign({ id: uid('s') }, data));
        save(); render();
        toast(s ? 'Subject saved' : 'Subject added');
      }
    });
  }

  function openLog() {
    var sel = subj(UI.focusSubject) ? UI.focusSubject : '';
    var opts = '<option value="">General study</option>' + S.subjects.filter(function (s) { return s.group !== 'other'; }).map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var body = grp(rSelect('Subject', 'subject', 'lg-subject', opts) +
      rPill('Minutes', 'number', 'minutes', 'lg-min', '30', ' min="1" max="720" step="5" inputmode="numeric" autofocus') +
      rPill('Date', 'date', 'date', 'lg-date', today()), '', 'For study you did without the timer.');
    openDialog({
      title: 'Log Study Time', body: body, submitLabel: 'Log',
      onSubmit: function (fd) {
        var m = parseInt(fd.get('minutes'), 10);
        if (!(m >= 1 && m <= 720)) { fieldError('#lg-min', 'Enter between 1 and 720 minutes.'); return false; }
        var sid = subj(fd.get('subject')) ? fd.get('subject') : null;
        logSession(sid, m, DATE.test(fd.get('date')) ? fd.get('date') : today());
        save(); render();
        toast(dur(m) + ' of ' + nameOrGeneral(sid) + ' logged');
      }
    });
  }

  function openSettings() {
    curSheet = openSettings;
    settingsTouched = false;
    var lb = S.settings.lastBackup, p = plusOn(), free = isFree();
    var who = (p ? plusLabel() : free ? 'Free account' : 'MyIB account') + (free ? ' · @' + ME.id : '');
    var body =
      grp('<div class="row acct">' + avatar(ME.id, ME.name) + '<span class="two-line"><b>' + esc(ME.name) + '</b><span>' + esc(who) + '</span></span></div>' +
          rNav('key', 'Change Password', 'pw-open') +
          '<button type="button" class="row row-btn danger-text" data-act="logout">' + icon('logout') + '<span class="row-label">Log Out</span></button>',
          'Account', syncText()) +
      grp(rNav('star', p ? 'MyIB Plus' : 'Get MyIB Plus', 'plus-open', p ? 'On' : '') +
          rNav('heart', 'Support the Dev', 'support-open')) +
      grp('<div class="row wrap"><span class="row-label">Appearance</span><span class="row-value"><span class="seg" role="group" aria-label="Appearance">' +
        [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
          return '<button type="button" data-act="set-theme" data-theme="' + o[0] + '" aria-pressed="' + (S.settings.theme === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</span></span></div>') +
      accentGroup() +
      liveCalGroup() +
      grp(rButton(icon('calendar') + 'Export to Calendar (.ics)', 'ics-export'), 'Calendar file',
          'A one-time copy of every date for Apple or Google Calendar, with a reminder at 09:00 the day before each deadline and exam.') +
      grp(rButton(icon('download') + 'Export Backup', 'backup-export') + rButton(icon('upload') + 'Import Backup', 'backup-import') +
          '<input type="file" id="import-file" accept="application/json,.json" hidden>', 'Backup',
          'Your planner already saves to your account. A backup is an extra copy you keep as a file. ' + (lb ? 'Last backup: ' + esc(fDay(lb)) + '.' : 'No backup yet.')) +
      legacyGroup() +
      (ME.admin ? grp(rNav('users', 'Manage Accounts', 'admin-open') +
          rNav('paper', 'Past Papers Section', 'admin-papers', CONF.papers ? 'Edited' : 'Default') +
          rNav('star', 'Plus Price', 'admin-price', euro((CONF.price || PRICE_DEFAULT).month) + ' a month') +
          rNav('heart', 'Bizum Number', 'admin-bizum', CONF.bizum || 'Not set'), 'Admin',
          'Only you see this. Manage accounts, change the Past Papers links and text, set the Plus price and your Bizum number.') : '') +
      (free ? grp(rNav('check', guideOn() ? 'Setup Guide' : 'Show Setup Guide', 'guide-show', guideOn() ? 'On Today' : '')) : '') +
      grp('<div class="row"><span class="row-label">Keyboard</span><span class="row-value"><span class="kbd">1</span>–<span class="kbd">5</span>&nbsp;sections · <span class="kbd">N</span>&nbsp;task · <span class="kbd">E</span>&nbsp;event</span></div>') +
      grp(rButton(free ? 'Start Over' : 'Reset to Starting Data', 'reset-all', '', 'danger'), '', free
        ? 'Empties your timetable, dates and tasks and keeps only the IB core. Export a backup first if you want to keep your changes.'
        : 'Puts back the starting timetable, calendar and tasks. Export a backup first if you want to keep your changes.') +
      (free ? grp(rButton('Delete Account', 'account-delete', '', 'danger'), '', 'Deletes your account and your planner from MyIB for good.') : '');
    openDialog({ title: 'Settings', body: body });
  }
  function plusLabel() { return ME.plus === 'admin' ? 'MyIB Plus · owner' : ME.plus === 'class' ? 'MyIB Plus · class code' : 'MyIB Plus'; }
  function syncText() {
    if (!SYNC.online) return 'Offline. Changes are saved on this device and sync when you’re back online.';
    if (SYNC.pending || dirty) return 'Saving your changes…';
    return 'Your planner saves to your account and syncs to every device where you log in.';
  }
  function accentGroup() {
    var cur = plusOn() ? S.settings.accent || '' : '';
    return grp('<div class="swatches accents" role="group" aria-label="App colour">' + ACCENTS.map(function (a) {
        return '<button type="button" class="accent-sw" data-act="set-accent" data-accent="' + a[0] + '" style="--c:' + a[2] + '" aria-pressed="' + (cur === a[0]) + '" aria-label="' + a[1] + '" title="' + a[1] + '">' + icon('check') + '</button>';
      }).join('') + '</div>', 'App colour', plusOn() ? '' : 'Colours come with MyIB Plus.');
  }
  function calUrl() { return CONF.cal && /^[A-Za-z0-9_-]{32}$/.test(CONF.cal) ? location.origin + '/api/cal/' + CONF.cal + '.ics' : ''; }
  function liveCalGroup() {
    if (!plusOn()) return grp(rNav('star', 'Live Calendar with Plus', 'plus-open'), 'Live calendar', 'Plus puts your deadlines and exams in Apple or Google Calendar and keeps them up to date.');
    var url = calUrl();
    if (!url) return grp(rButton(icon('calendar') + 'Turn On Live Calendar', 'cal-link'), 'Live calendar', 'Get a private link your calendar app checks every few hours, so new dates show up by themselves.');
    return grp('<a class="row row-btn" href="' + esc(url.replace(/^https?:/, 'webcal:')) + '">' + icon('calendar') + 'Subscribe in Calendar</a>' +
        rButton(icon('copy') + 'Copy Link', 'cal-copy') +
        rButton(icon('refresh') + 'Make a New Link', 'cal-link'),
      'Live calendar', 'Apple Calendar: tap Subscribe. Google Calendar: Other calendars → From URL, then paste the link. Anyone with the link can see your dates; a new link turns the old one off.');
  }
  function legacyGroup() {
    if (!legacyData() || legacyDone(ME.id)) return '';
    return grp(rButton(icon('upload') + 'Bring Back Old Planner', 'legacy-use') + rButton('Hide This', 'legacy-hide'), 'This browser',
      'This browser still has a planner saved before MyIB had accounts. Bringing it back replaces your current planner.');
  }

  function busyForm(form, on) {
    if (!form) return false;
    if (on && form.dataset.busy === '1') return true;
    form.dataset.busy = on ? '1' : '';
    var b = form.querySelector('[type="submit"]');
    if (b) b.disabled = !!on;
    return false;
  }

  /* Changing a password: the server checks the current one first (/api/reauth), then saves the new one. */
  function openPassword() {
    curSheet = openPassword;
    var body =
      '<input class="sr" type="text" name="username" value="' + esc(ME.id) + '" autocomplete="username" tabindex="-1" aria-hidden="true">' +
      grp(rPw('Current password', 'current', 'cp-cur', 'current-password', true)) +
      grp(rPw('New password', 'next', 'cp-new', 'new-password') + rPw('Repeat new password', 'again', 'cp-again', 'new-password'), '',
          'At least 6 characters. Your other devices get logged out.');
    openDialog({
      title: 'Change Password', body: body, submitLabel: 'Change', back: openSettings, backLabel: 'Settings',
      onSubmit: function (fd, form) {
        var cur = String(fd.get('current') || ''), nx = String(fd.get('next') || ''), again = String(fd.get('again') || '');
        if (!cur) { fieldError('#cp-cur', 'Enter your current password.'); return false; }
        if (failedBefore(ME.id, cur)) { $('#cp-cur', dlg).value = ''; fieldError('#cp-cur', SAME_PW); return false; }
        var curFilled = autofilled($('#cp-cur', dlg));
        if (Array.from(nx).length < 6) { fieldError('#cp-new', 'Use at least 6 characters.'); return false; }
        if (nx !== again) { fieldError('#cp-again', 'The new passwords don’t match.'); return false; }
        if (busyForm(form, true)) return false;
        api('POST', '/api/reauth', { password: cur }).then(function (r) {
          var d = r.data || {};
          if (r.status === 401 && d.error === 'wrong') { markFailed(ME.id, cur); throw { sel: '#cp-cur', clear: true, msg: wrongText(d, curFilled) }; }
          if (r.status === 401) { sessionLost(); throw { quiet: true }; }
          if (r.status === 429) throw { sel: '#cp-cur', msg: 'Too many tries. Wait ' + (d.wait || 15) + ' min.' };
          if (r.status !== 200) throw { sel: '#cp-cur', msg: 'Something went wrong. Try again.' };
          return api('POST', '/api/password', { password: nx });
        }).then(function (r) {
          var d = r.data || {};
          if (r.status === 400 && d.error === 'common') throw { sel: '#cp-new', msg: 'That password is too easy to guess. Try another.' };
          if (r.status !== 200) throw { sel: '#cp-new', msg: 'Something went wrong. Try again.' };
          closeDialog();
          toast('Password changed. Your other devices were logged out.');
        }).catch(function (e) {
          busyForm(form, false);
          if (e && e.quiet) return;
          if (e && e.sel) { if (e.clear && $(e.sel, dlg)) $(e.sel, dlg).value = ''; fieldError(e.sel, e.msg); }
          else fieldError('#cp-cur', 'Can’t reach MyIB. Check your connection.');
        });
        return false;
      }
    });
  }

  /* Accounts outside the class can delete themselves: password check first (/api/reauth), then /api/account/delete. */
  function openDeleteAccount() {
    curSheet = openDeleteAccount;
    var body =
      '<input class="sr" type="text" name="username" value="' + esc(ME.id) + '" autocomplete="username" tabindex="-1" aria-hidden="true">' +
      '<div class="plus-hero"><h3>Delete @' + esc(ME.id) + '?</h3><p>Your account, your planner and your logins on every device go for good. Nobody can bring them back, not even Mauro.</p></div>' +
      grp(rButton(icon('download') + 'Export Backup First', 'backup-export')) +
      grp(rPw('Password', 'current', 'da-pw', 'current-password', false), 'Type your password to confirm');
    openDialog({
      title: 'Delete Account', body: body, submitLabel: 'Delete', submitDanger: true, back: openSettings, backLabel: 'Settings',
      onSubmit: function (fd, form) {
        var pw = String(fd.get('current') || '');
        if (!pw) { fieldError('#da-pw', 'Enter your password.'); return false; }
        if (failedBefore(ME.id, pw)) { $('#da-pw', dlg).value = ''; fieldError('#da-pw', SAME_PW); return false; }
        var filled = autofilled($('#da-pw', dlg));
        if (busyForm(form, true)) return false;
        var id = ME.id;
        api('POST', '/api/reauth', { password: pw }).then(function (r) {
          var d = r.data || {};
          if (r.status === 401 && d.error === 'wrong') { markFailed(ME.id, pw); $('#da-pw', dlg).value = ''; throw { msg: wrongText(d, filled) }; }
          if (r.status === 401) { sessionLost(); throw { quiet: true }; }
          if (r.status === 429) throw { msg: 'Too many tries. Wait ' + (d.wait || 15) + ' min.' };
          if (r.status !== 200) throw { msg: 'Something went wrong. Try again.' };
          return api('POST', '/api/account/delete', {});
        }).then(function (r) {
          if (r.status !== 200) throw { msg: 'Couldn’t delete it (error ' + r.status + '). Try again.' };
          stopApp();
          sdel(cacheKey(id)); sdel('myib:last'); sdel('myib:ui:' + id); sdel('myib:nag:' + id); sdel('myib:papers:' + id);
          showAuth({});
          toast('Your account is deleted');
        }).catch(function (e) {
          busyForm(form, false);
          if (e && e.quiet) return;
          fieldError('#da-pw', e && e.msg ? e.msg : 'Can’t reach MyIB. Check your connection.');
        });
        return false;
      }
    });
  }

  /* ---------- Welcome + subject picker (empty planners) ---------- */
  function openWelcome() {
    curSheet = openWelcome;
    /* shown once: from now on the checklist on Today takes over */
    S.settings.guide = 'on'; save();
    var first = String(ME.name || '').split(' ')[0];
    var steps = guideSteps().map(function (x, i) {
      return '<div class="row perk"><span class="perk-ic num" style="--c:' + ['#007AFF', '#34C759', '#FF9500', '#AF52DE'][i] + '">' + (i + 1) + '</span><span class="two-line"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span></div>';
    }).join('');
    var body =
      '<div class="plus-hero"><img class="welcome-logo" src="icons/icon-192.png" alt="" width="64" height="64"><h3>Welcome' + (first ? ', ' + esc(first) : '') + '!</h3>' +
        '<p>MyIB keeps your timetable, deadlines, exams and study time in one place. Your planner starts empty. Four steps get it ready:</p></div>' +
      grp(steps) +
      grp(rButton('Start With My Subjects', 'guide-subjects', '', 'center strong')) +
      '<p class="group-foot plus-fine">The steps stay on Today until you finish them.</p>';
    openDialog({ title: 'Welcome to MyIB', body: body, doneLabel: 'Later' });
  }

  /* Common IB subjects by group. [name, short name] */
  var IB_PICK = [
    ['Language and literature', [['English A: Language and Literature', 'English A'], ['English A: Literature', 'English Lit'], ['Spanish A: Language and Literature', 'Spanish A'], ['Spanish A: Literature', 'Spanish Lit']]],
    ['Language acquisition', [['English B', 'English B'], ['French B', 'French B'], ['German B', 'German B'], ['Spanish B', 'Spanish B'], ['French ab initio', 'French'], ['Italian ab initio', 'Italian']]],
    ['Individuals and societies', [['Business Management', 'Business'], ['Economics', 'Economics'], ['History', 'History'], ['Geography', 'Geography'], ['Psychology', 'Psychology'], ['Philosophy', 'Philosophy'], ['Global Politics', 'Politics'], ['Digital Society', 'Digital Soc']]],
    ['Sciences', [['Biology', 'Biology'], ['Chemistry', 'Chemistry'], ['Physics', 'Physics'], ['Computer Science', 'CS'], ['Environmental Systems and Societies', 'ESS'], ['Sports, Exercise and Health Science', 'SEHS'], ['Design Technology', 'Design Tech']]],
    ['Mathematics', [['Math: Analysis and Approaches', 'Math AA'], ['Math: Applications and Interpretation', 'Math AI']]],
    ['The arts', [['Visual Arts', 'Visual Arts'], ['Music', 'Music'], ['Theatre', 'Theatre'], ['Film', 'Film'], ['Dance', 'Dance']]]
  ];
  function openSubjectPicker() {
    curSheet = openSubjectPicker;
    var have = new Set(S.subjects.map(function (s) { return norm(s.name); }));
    var body = IB_PICK.map(function (g, gi) {
      return grp('<div class="pick-chips">' + g[1].map(function (x, i) {
        var got = have.has(norm(x[0]));
        return '<button type="button" class="pick-chip' + (got ? ' have' : '') + '" data-act="pick-subj" data-i="' + gi + '.' + i + '" aria-pressed="' + got + '"' + (got ? ' disabled' : '') + '>' +
          (got ? icon('check') : '') + esc(x[0]) + '</button>';
      }).join('') + '</div>', 'Group ' + (gi + 1) + ' · ' + g[0]);
    }).join('') +
      grp(rField({ label: 'Another subject', name: 'other', id: 'sp-other', value: '', max: 60, placeholder: 'Another subject (type its name)' }), 'Not in the list?',
          'After adding them, tap a subject on the Subjects page to set its level (SL or HL), teacher and colour.');
    openDialog({
      title: 'Your Subjects', body: body, wide: true, submitLabel: 'Add',
      onSubmit: function (fd) {
        var picked = $$('.pick-chip[aria-pressed="true"]:not(.have)', dlg).map(function (b) {
          var ix = b.dataset.i.split('.').map(Number), x = IB_PICK[ix[0]] && IB_PICK[ix[0]][1][ix[1]];
          return x ? { name: x[0], short: x[1] } : null;
        }).filter(Boolean);
        var other = clip(fd.get('other'), 60);
        if (other && !have.has(norm(other))) picked.push({ name: other, short: shortFrom(other) });
        if (!picked.length) { fieldError('#sp-other', 'Tap the subjects you take, or type one here.'); return false; }
        var used = new Set(S.subjects.map(function (s) { return s.color; }));
        var free = PALETTE.filter(function (c) { return !used.has(c) && c !== '#8E8E93'; });
        picked.forEach(function (x, i) {
          S.subjects.push({ id: uid('s'), name: x.name, short: x.short, color: free[i] || PALETTE[i % PALETTE.length], group: 'ib', level: '', teacher: '', goal: 0, notes: '' });
        });
        save();
        var n = picked.length, toTimetable = guideOn() && !Object.keys(S.slots).length;
        if (toTimetable) { closeDialog(); go('timetable'); toast(n + (n === 1 ? ' subject' : ' subjects') + ' added. Now tap a slot to add a class.'); }
        else { render(); toast(n + (n === 1 ? ' subject' : ' subjects') + ' added'); }
      }
    });
  }

  /* ---------- MyIB Plus (price: Settings → Admin → Plus Price) ---------- */
  var PLUS_PERKS = [
    ['calendar', '#FF3B30', 'Live calendar', 'Your deadlines and exams in Apple or Google Calendar, updating by themselves.'],
    ['paper', '#007AFF', 'Past-paper tracker', 'Log every past paper you do and see your average per subject.'],
    ['palette', '#AF52DE', 'App colours', 'Pick the colour MyIB uses for buttons and highlights.'],
    ['timer', '#FF9500', 'Any timer length', 'Focus sessions from 5 to 180 minutes.'],
    ['quiet', '#34C759', 'No more pop-ups', 'The support pop-up stops showing up.']
  ];
  var eggTaps = [];
  function openPlus(back) {
    curSheet = function () { openPlus(back); };
    eggTaps = [];
    var p = plusOn();
    var perks = PLUS_PERKS.map(function (x) {
      return '<div class="row perk"><span class="perk-ic" style="--c:' + x[1] + '">' + icon(x[0]) + '</span><span class="two-line"><b>' + esc(x[2]) + '</b><span>' + esc(x[3]) + '</span></span></div>';
    }).join('');
    var how = isFree()
      ? (CONF.bizum ? 'Until online payments open, send Mauro a Bizum (' + esc(CONF.bizum) + ') with your username, @' + esc(ME.id) + ', in the message. He’ll switch Plus on for your account.'
                    : 'Until online payments open, ask Mauro to switch Plus on for your account (@' + esc(ME.id) + ').')
      : (CONF.bizum ? 'Until online payments open, send Mauro a Bizum (' + esc(CONF.bizum) + ') and he’ll switch Plus on for you.' : 'Until online payments open, ask Mauro to switch Plus on for you.');
    var buy = p ? '' :
      grp('<div class="row"><span class="row-label">Price</span><span class="row-value price">' + esc(priceText()) + '</span></div>' +
          '<button type="button" class="row row-btn center" disabled>Pay with PayPal · coming soon</button>', 'Get Plus', how);
    var body =
      '<div class="plus-hero"><span class="plus-badge">' + icon('star') + '</span><h3>MyIB Plus</h3><p>' + (p ? 'Plus is on. Everything below is unlocked.' : 'More tools for the IB year.') + '</p></div>' +
      grp(perks) + buy +
      '<p class="group-foot plus-fine">Questions about your <span class="egg" data-act="egg">subscription</span>? Ask Mauro.</p>' +
      '<div class="egg-box" id="egg-box" hidden>' +
        grp('<label class="row"><span class="sr">Class code</span><input class="row-field egg-field" type="text" name="code" id="egg-code" maxlength="120" placeholder="UNLOCK EVERYTHING" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"></label>' +
            rButton('Unlock', 'egg-unlock', '', 'center strong')) +
      '</div>';
    openDialog({ title: 'MyIB Plus', body: body, back: back || null });
  }
  /* Tap "subscription" five times and the class-code box shows up. */
  function eggTap() {
    var t = Date.now();
    eggTaps = eggTaps.filter(function (x) { return t - x < 4000; });
    eggTaps.push(t);
    if (eggTaps.length < 5) return;
    eggTaps = [];
    var box = $('#egg-box', dlg);
    if (!box || !box.hidden) return;
    box.hidden = false;
    dlgSubmit = function () { eggUnlock(); return false; };
    var f = $('#egg-code', dlg);
    if (f) { f.focus(); f.scrollIntoView({ block: 'nearest' }); }
  }
  function eggUnlock() {
    var f = $('#egg-code', dlg), btn = $('[data-act="egg-unlock"]', dlg);
    if (!f || (btn && btn.disabled)) return;
    var code = f.value.trim();
    if (!code) { fieldError('#egg-code', 'Type the class code.'); return; }
    if (btn) btn.disabled = true;
    api('POST', '/api/unlock', { code: code }).then(function (r) {
      if (btn) btn.disabled = false;
      var d = r.data || {};
      if (r.status === 200 && d.user) {
        applyMe(d); closeDialog(); render();
        toast('Everything’s unlocked. Enjoy MyIB Plus!');
        return;
      }
      if (r.status === 401) return sessionLost();
      if (r.status === 403 && d.error === 'class_only') return fieldError('#egg-code', 'Class codes only work for Sociales 2 IB accounts.');
      if (r.status === 403) return fieldError('#egg-code', d.left ? 'That’s not the class code. ' + d.left + (d.left === 1 ? ' try' : ' tries') + ' left.' : 'That’s not the class code.');
      if (r.status === 429) return fieldError('#egg-code', 'Too many tries. Wait ' + (d.wait || 15) + ' min.');
      fieldError('#egg-code', 'Something went wrong. Try again.');
    }, function () {
      if (btn) btn.disabled = false;
      fieldError('#egg-code', 'Can’t reach MyIB. Check your connection.');
    });
  }

  /* ---------- Support the dev (also the pop-up) ---------- */
  var NAG_HOURS = 3, nagTimer = null;
  function openSupport(back, auto) {
    curSheet = function () { openSupport(back, auto); };
    var b = CONF.bizum;
    var body =
      '<div class="plus-hero"><span class="plus-badge heart">' + icon('heart') + '</span><h3>Support the dev!</h3>' +
        '<p>MyIB is free and has no ads. ' + (isFree() ? 'Mauro, an IB student, builds it in his spare time.' : 'Mauro builds it for your class in his spare time.') +
        ' If it saves you time, send him a Bizum. Any amount helps.</p></div>' +
      (b ? grp('<div class="row"><span class="row-label">Bizum</span><span class="row-value num">' + esc(b) + '</span></div>' + rButton(icon('copy') + 'Copy Number', 'copy-bizum'),
          'Send a Bizum', 'Open your bank app, tap Bizum, paste the number and send what you like.') : '') +
      grp(rNav('star', plusOn() ? 'MyIB Plus' : 'See MyIB Plus', 'plus-open', plusOn() ? 'On' : ''), '', plusOn() ? '' : 'Plus turns this pop-up off and unlocks the extra tools.') +
      (ME.admin ? '<p class="group-foot">This is what your classmates see.' + (b ? '' : ' Add your Bizum number in Settings → Admin.') + '</p>' : '');
    openDialog({ title: 'Support MyIB', body: body, back: back || null, doneLabel: auto ? 'Not Now' : 'Done' });
  }
  /* The pop-up: 45 s after opening, then at most every NAG_HOURS per device. Plus turns it off. */
  function scheduleNag() {
    clearTimeout(nagTimer); nagTimer = null;
    if (!ME || plusOn()) return;
    var key = 'myib:nag:' + ME.id, last = Number(sget(key)) || 0;
    var wait = Math.max(45000, last + NAG_HOURS * 3600000 - Date.now());
    nagTimer = setTimeout(function tryNag() {
      nagTimer = null;
      if (!ME || MODE !== 'app' || plusOn()) return;
      if (dlg.open || !idle() || document.hidden) { nagTimer = setTimeout(tryNag, 20000); return; }
      if (guideBusy()) { nagTimer = setTimeout(tryNag, 60000); return; }
      sset(key, String(Date.now()));
      openSupport(null, true);
      scheduleNag();
    }, Math.min(wait, 2147000000));
  }
  function copyText(text, el, label) {
    function done(ok) { if (ok) flash(el, label || 'Copied'); else toast('Couldn’t copy. Select it and copy it by hand.'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      (dlg.open ? dlg : document.body).appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }

  /* ---------- Past papers ----------
     Mauro edits this sheet in Settings → Admin → Past Papers Section (the server keeps his version).
     Until he saves one, everyone sees this default. */
  var PAPERS_DEFAULT = {
    title: 'Past Papers', intro: '', head: 'Where to get them',
    foot: 'These are the IB’s own sources. Your teachers can also share the past papers the school has.',
    links: [
      { title: 'IB Store: exam prep', sub: 'Official exam packs, sold by subject', url: 'https://www.follettibstore.com/main/ib-exam-prep', fresh: false },
      { title: 'IB Questionbank', sub: 'Official practice questions with markschemes', url: 'https://questionbank.ibo.org/', fresh: false }
    ],
    updated: 0
  };
  function papersConf() { return CONF.papers || PAPERS_DEFAULT; }
  function papersSeenKey() { return 'myib:papers:' + (ME ? ME.id : ''); }
  /* the Past papers button says New until you open the sheet after Mauro adds links marked New */
  function papersNew() {
    var P = CONF.papers;
    return !!(ME && P && P.updated && P.links.some(function (l) { return l.fresh; }) && P.updated > (Number(sget(papersSeenKey())) || 0));
  }
  function lines(s) { return esc(s).replace(/\n/g, '<br>'); }
  function paperAvg(list) { return Math.round(list.reduce(function (a, x) { return a + x.score / x.max; }, 0) / list.length * 100); }
  function fmtNum(n) { return String(Math.round(n * 10) / 10); }
  function paperTitle(x) {
    var s = subj(x.subject);
    var when = x.session ? SESSIONS[x.session] + (x.year ? ' ' + x.year : '') : (x.year ? String(x.year) : '');
    return [s ? s.short : '', when, x.paper].filter(Boolean).join(' · ') || 'Past paper';
  }
  function openPapers() {
    curSheet = openPapers;
    var P = papersConf();
    if (papersNew()) settingsTouched = true;         /* redraw the page behind, so its New tag goes */
    if (P.updated) sset(papersSeenKey(), String(P.updated));
    var links = P.links.map(function (l) {
      var href = webUrl(l.url);
      if (!href) return '';
      return '<a class="row row-btn link-row" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + icon('link') +
        '<span class="two-line"><b>' + esc(l.title) + (l.fresh ? '<span class="tag-new">New</span>' : '') + '</b>' + (l.sub ? '<span>' + esc(l.sub) + '</span>' : '') + '</span>' + icon('out') + '</a>';
    }).join('');
    var body = (P.intro ? '<p class="papers-intro">' + lines(P.intro) + '</p>' : '') +
      (links ? grp(links, P.head ? esc(P.head) : '', P.foot ? lines(P.foot) : '') : P.foot ? '<p class="group-foot">' + lines(P.foot) + '</p>' : '') +
      (plusOn() ? papersLog() : grp(rNav('star', 'Track Your Scores with Plus', 'plus-open'), 'Your papers', 'Log each past paper you do and see your average per subject.')) +
      (ME.admin ? grp(rNav('paper', 'Edit This Section', 'admin-papers'), '', 'Only you see this button.') : '');
    openDialog({ title: P.title || 'Past Papers', body: body, wide: true });
  }

  /* ---------- Admin: Past Papers editor ---------- */
  var PE = { back: null };
  function openPapersEditor(draft, focusSel) {
    var P = draft || clone(papersConf());
    curSheet = function () { openPapersEditor(P); };
    var n = P.links.length;
    var links = P.links.map(function (l, i) {
      var k = i + 1;
      return '<p class="group-head">Link ' + k + '</p><div class="group pe-link">' +
        rField({ label: 'Link ' + k + ' title', name: 'lt' + i, id: 'pe-lt-' + i, value: l.title, max: 100, placeholder: 'Title, like Math AA HL · May 2024' }) +
        rField({ label: 'Link ' + k + ' subtitle', name: 'ls' + i, id: 'pe-ls-' + i, value: l.sub, max: 160, placeholder: 'Subtitle (optional), like Paper 1 + markscheme' }) +
        '<label class="row"><span class="sr">Link ' + k + ' address</span><input class="row-field pe-url" type="url" name="lu' + i + '" id="pe-lu-' + i + '" maxlength="800" value="' + esc(l.url) +
          '" placeholder="Link, like https://drive.google.com/…" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
        rSwitch('“New” tag', 'ln' + i, 'pe-ln-' + i, l.fresh) +
        '<div class="row pe-tools">' +
          '<button type="button" class="btn small" data-act="pe-move" data-i="' + i + '" data-step="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move link ' + k + ' up">' + icon('up') + 'Up</button>' +
          '<button type="button" class="btn small" data-act="pe-move" data-i="' + i + '" data-step="1"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move link ' + k + ' down">' + icon('down') + 'Down</button>' +
          '<button type="button" class="btn small danger" data-act="pe-remove" data-i="' + i + '" aria-label="Remove link ' + k + '">Remove</button>' +
        '</div></div>';
    }).join('');
    var body =
      grp(rText('Title', 'title', 'pe-title', P.title, 'Past Papers', 40) +
          rField({ area: true, label: 'Intro', name: 'intro', id: 'pe-intro', value: P.intro, max: 400, placeholder: 'Intro at the top (optional), like: New this month: Math and History.' }),
          'Top of the sheet') +
      grp(rText('Heading', 'head', 'pe-head', P.head, 'Where to get them', 60), 'Links', 'The small heading above the links.') +
      links +
      grp(rButton(icon('plus') + 'Add Link', 'pe-add', n >= 30 ? ' disabled' : ''), '', n ? '' : 'No links yet. Students then see only the intro and the text below.') +
      grp(rField({ area: true, label: 'Text under the links', name: 'foot', id: 'pe-foot', value: P.foot, max: 400, placeholder: 'Text under the links (optional)' }), 'Under the links',
          'Students see changes the next time they open MyIB. Links open in a new tab. Turn on “New” for this month’s papers: the Past papers button then shows a New tag until each student opens the sheet.');
    openDialog({
      title: 'Edit Past Papers', body: body, wide: true, submitLabel: 'Save',
      back: PE.back || openSettings, backLabel: PE.back === openPapers ? 'Papers' : 'Settings',
      danger: CONF.papers ? { label: 'Reset to Default', act: 'pe-reset', id: '' } : null,
      onSubmit: function (fd, form) { savePapers(form); return false; }
    });
    /* after adding, moving or removing a link, keep the keyboard where it was */
    [].concat(focusSel || []).some(function (sel) {
      var f = $(sel, dlg);
      if (!f) return false;
      f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'center' });
      return true;
    });
  }
  function readPapersForm(form) {
    var fd = new FormData(form), links = [];
    for (var i = 0; i < $$('.pe-link', form).length; i++) {
      links.push({ title: String(fd.get('lt' + i) || ''), sub: String(fd.get('ls' + i) || ''), url: String(fd.get('lu' + i) || ''), fresh: fd.get('ln' + i) === 'on' });
    }
    return { title: String(fd.get('title') || ''), intro: String(fd.get('intro') || ''), head: String(fd.get('head') || ''), foot: String(fd.get('foot') || ''), links: links };
  }
  function savePapers(form) {
    var d = readPapersForm(form), links = [], at = [];
    for (var i = 0; i < d.links.length; i++) {
      var l = d.links[i], t = clip(l.title, 100), s = clip(l.sub, 160), u = l.url.trim();
      if (!t && !s && !u) continue;                    /* an empty link just goes */
      if (!t) return fieldError('#pe-lt-' + i, 'Give link ' + (i + 1) + ' a title.');
      if (!u) return fieldError('#pe-lu-' + i, 'Paste the link for “' + t + '”.');
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      var href = webUrl(u);
      if (!href) return fieldError('#pe-lu-' + i, 'That isn’t a web link. Paste the full address, starting with https://');
      links.push({ title: t, sub: s, url: href, fresh: l.fresh });
      at.push(i);
    }
    var body = { title: clip(d.title, 40), intro: clip(d.intro, 400, true), head: clip(d.head, 60), foot: clip(d.foot, 400, true), links: links };
    if (busyForm(form, true)) return;
    api('POST', '/api/admin/config', { papers: body }).then(function (r) {
      busyForm(form, false);
      var e = r.data || {};
      if (r.status === 200 && r.data) { setConf(Object.assign({ cal: CONF.cal }, r.data)); writeCache(); PE.back = null; openPapers(); toast('Past Papers updated for everyone'); return; }
      if (r.status === 401) return sessionLost();
      if (r.status === 400 && e.error === 'papers') {
        var k = { title: 't', sub: 's', url: 'u', link: 't' }[e.field];
        if (e.at != null && k && at[e.at] != null) return fieldError('#pe-l' + k + '-' + at[e.at], e.field === 'url' ? 'That link isn’t allowed. Use a normal https:// address.' : 'Shorten this a little.');
        if (e.field === 'links') return fieldError('#pe-title', 'That’s too many links. The most is 30.');
        return fieldError('#pe-' + (['title', 'intro', 'head', 'foot'].indexOf(e.field) >= 0 ? e.field : 'title'), 'Shorten this a little.');
      }
      fieldError('#pe-title', 'Couldn’t save it (error ' + r.status + '). Try again.');
    }, function () { busyForm(form, false); fieldError('#pe-title', 'Can’t reach MyIB. Check your connection.'); });
  }

  /* ---------- Admin: Plus price ---------- */
  function openPrice() {
    curSheet = openPrice;
    var p = CONF.price || PRICE_DEFAULT;
    openDialog({
      title: 'Plus Price', submitLabel: 'Save', back: openSettings, backLabel: 'Settings',
      body: grp(rPill('A month (€)', 'number', 'month', 'pr-month', String(p.month), ' min="0.5" max="50" step="0.5" inputmode="decimal"') +
                rPill('Whole year, once (€)', 'number', 'once', 'pr-once', String(p.once), ' min="1" max="200" step="1" inputmode="decimal"'), '',
                'Shows on the MyIB Plus sheet: “' + esc(priceText()) + '”. People still pay you by Bizum, so this changes the text only.'),
      onSubmit: function (fd, form) {
        var m = parseFloat(String(fd.get('month') || '').replace(',', '.')), o = parseFloat(String(fd.get('once') || '').replace(',', '.'));
        if (!(m >= 0.5 && m <= 50)) { fieldError('#pr-month', 'Pick between 0,50 € and 50 €.'); return false; }
        if (!(o >= 1 && o <= 200)) { fieldError('#pr-once', 'Pick between 1 € and 200 €.'); return false; }
        if (busyForm(form, true)) return false;
        api('POST', '/api/admin/config', { price: { month: m, once: o } }).then(function (r) {
          busyForm(form, false);
          if (r.status === 200 && r.data) { setConf(Object.assign({ cal: CONF.cal }, r.data)); writeCache(); openSettings(); toast('Price saved: ' + priceText()); }
          else if (r.status === 401) sessionLost();
          else fieldError('#pr-month', 'Couldn’t save it. Try again.');
        }, function () { busyForm(form, false); fieldError('#pr-month', 'Can’t reach MyIB. Check your connection.'); });
        return false;
      }
    });
  }
  function papersLog() {
    var list = S.papers.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var by = {}, order = [];
    list.forEach(function (x) { var k = x.subject || ''; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(x); });
    var avgs = order.map(function (k) {
      var s = subj(k), arr = by[k];
      return '<div class="row"><span class="row-label lbl"><i class="sw" style="' + cvar(s) + '"></i><span>' + esc(s ? s.name : 'No subject') + '</span></span>' +
        '<span class="row-value">' + arr.length + ' paper' + (arr.length > 1 ? 's' : '') + ' · <b class="pct">' + paperAvg(arr) + '%</b></span></div>';
    }).join('');
    var rows = list.slice(0, 300).map(function (x) {
      var s = subj(x.subject);
      return '<button type="button" class="row row-btn paper-row" data-act="paper-open" data-id="' + x.id + '"><i class="sw" style="' + cvar(s) + '"></i>' +
        '<span class="two-line"><b>' + esc(paperTitle(x)) + '</b><span>' + esc(fDay(x.date) + ' · ' + fmtNum(x.score) + ' / ' + fmtNum(x.max)) + '</span></span>' +
        '<span class="row-value pct">' + Math.round(x.score / x.max * 100) + '%</span></button>';
    }).join('');
    return (avgs ? grp(avgs, 'Averages') : '') +
      grp(rows + rButton(icon('plus') + 'Log a Paper', 'paper-new'), 'Your papers', list.length ? '' : 'Log each past paper you do to see your average per subject.');
  }
  function openPaper(id) {
    var x = id ? S.papers.filter(function (p) { return p.id === id; })[0] : null;
    if (id && !x) return;
    curSheet = function () { openPaper(id); };
    var v = x || { subject: subj(UI.paperSubject) ? UI.paperSubject : '', year: null, session: 'may', paper: '', score: '', max: '', date: today() };
    var years = [['', 'Not set']];
    for (var y = now().getFullYear(); y >= 2010; y--) years.push([y, String(y)]);
    var body =
      grp(rSelect('Subject', 'subject', 'pp-subject', subjectOptions(v.subject || '', 'None')) +
          rSelect('Session', 'session', 'pp-session', optionList([['may', 'May'], ['nov', 'November'], ['spec', 'Specimen'], ['', 'Not set']], v.session)) +
          rSelect('Year', 'year', 'pp-year', optionList(years, v.year || '')) +
          rText('Paper', 'paper', 'pp-paper', v.paper, 'Paper 1, HL…', 60)) +
      grp(rPill('Your score', 'number', 'score', 'pp-score', v.score === '' ? '' : String(v.score), ' min="0" max="1000" step="0.5" inputmode="decimal"') +
          rPill('Out of', 'number', 'max', 'pp-max', v.max === '' ? '' : String(v.max), ' min="1" max="1000" step="0.5" inputmode="decimal"') +
          rPill('Done on', 'date', 'date', 'pp-date', v.date), '', 'Use the markscheme total for “Out of”.');
    openDialog({
      title: x ? 'Edit Paper' : 'Log a Paper', body: body, submitLabel: x ? 'Save' : 'Add', back: openPapers, backLabel: 'Papers',
      danger: x ? { label: 'Delete Paper', act: 'paper-delete', id: x.id } : null,
      onSubmit: function (fd) {
        var score = parseFloat(String(fd.get('score') || '').replace(',', '.')), max = parseFloat(String(fd.get('max') || '').replace(',', '.'));
        if (!(score >= 0)) { fieldError('#pp-score', 'Enter your score.'); return false; }
        if (!(max > 0 && max <= 1000)) { fieldError('#pp-max', 'Enter the total marks.'); return false; }
        if (score > max) { fieldError('#pp-score', 'Your score can’t be above the total.'); return false; }
        var data = {
          subject: subj(fd.get('subject')) ? fd.get('subject') : null,
          session: SESSIONS[fd.get('session')] ? fd.get('session') : '',
          year: parseInt(fd.get('year'), 10) || null,
          paper: clip(fd.get('paper'), 60),
          score: Math.round(score * 10) / 10, max: Math.round(max * 10) / 10,
          date: DATE.test(fd.get('date')) ? fd.get('date') : today()
        };
        if (x) Object.assign(x, data); else S.papers.push(Object.assign({ id: uid('pp') }, data));
        UI.paperSubject = data.subject || ''; saveUI();
        save(); render();
        openPapers();
        toast(x ? 'Paper saved' : 'Paper logged');
        return false;
      }
    });
  }

  function openFocusLen() {
    curSheet = openFocusLen;
    openDialog({
      title: 'Timer Length', submitLabel: 'Set',
      body: grp(rPill('Minutes', 'number', 'minutes', 'fl-min', String(UI.focusLen), ' min="5" max="180" step="5" inputmode="numeric" autofocus'), '', 'Anything from 5 to 180 minutes.'),
      onSubmit: function (fd) {
        var m = parseInt(fd.get('minutes'), 10);
        if (!(m >= 5 && m <= 180)) { fieldError('#fl-min', 'Pick between 5 and 180 minutes.'); return false; }
        UI.focusLen = m; saveUI(); render();
      }
    });
  }

  /* ---------- Admin (Mauro) ---------- */
  var ADMIN_LIST = null, ADMIN_OTHERS = [], RESET_CODES = {};
  function ago(ms) {
    if (!ms) return 'never';
    var d = new Date(ms), n = diff(toISO(d), toISO(new Date()));
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 30) return n + ' days ago';
    return fShort(toISO(d)) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function kb(n) { return n < 1024 ? n + ' B' : Math.round(n / 1024) + ' KB'; }
  function sheetMessage(html) { var b = $('.sheet-body', dlg); if (b) b.innerHTML = html; }
  function openAdmin() {
    curSheet = openAdmin;
    openDialog({ title: 'Accounts', body: '<div class="sheet-loading" role="status"><span class="spinner" aria-hidden="true"></span><span class="sr">Loading</span></div>', back: openSettings, backLabel: 'Settings' });
    api('GET', '/api/admin/users').then(function (r) {
      if (curSheet !== openAdmin) return;
      if (r.status === 401) return sessionLost();
      if (r.status !== 200 || !r.data || !Array.isArray(r.data.users)) return sheetMessage('<p class="group-foot err">Couldn’t load the accounts. Try again.</p>');
      ADMIN_LIST = r.data.users; ADMIN_OTHERS = Array.isArray(r.data.others) ? r.data.others : [];
      sheetMessage(adminListHTML());
    }, function () { if (curSheet === openAdmin) sheetMessage('<p class="group-foot err">Can’t reach MyIB. Check your connection.</p>'); });
  }
  function adminRow(u) {
    var st = u.admin ? 'You' : u.reset ? (u.last_login ? 'Waiting for reset code' : 'Waiting for setup code') : !u.claimed ? 'No password yet' : 'Last login ' + ago(u.last_login);
    var free = u.kind === 'free';
    return '<button type="button" class="row row-btn acct-row" data-act="admin-user" data-id="' + esc(u.id) + '"' + (free ? ' data-find="' + esc(norm(u.name + ' ' + u.id)) + '"' : '') + '>' + avatar(u.id, u.name) +
      '<span class="two-line"><b>' + esc(u.name) + '</b><span>' + esc((free ? '@' + u.id + ' · ' : '') + st) + '</span></span>' +
      (u.plus && !u.admin ? '<span class="tag-plus">Plus</span>' : '') + icon('chev') + '</button>';
  }
  function adminListHTML() {
    var claimed = ADMIN_LIST.filter(function (u) { return u.claimed; }).length, n = ADMIN_OTHERS.length;
    var find = n > 8 ? '<label class="row adm-find"><span class="sr">Find a student</span><input class="row-field" type="search" id="adm-q" placeholder="Find by name or username" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' : '';
    return grp(ADMIN_LIST.map(adminRow).join(''), 'Sociales 2 IB · ' + claimed + ' of ' + ADMIN_LIST.length + ' set up',
        'Tap a name to download or restore their planner, reset their password or give them Plus.') +
      (n ? grp(find + ADMIN_OTHERS.map(adminRow).join(''), 'Other students · ' + n,
        'Free accounts made with “I’m not in Sociales 2 IB”, latest login first. If one pays by Bizum, tap them and Give Plus.')
         : '<p class="group-head">Other students</p><p class="group-foot">Nobody from outside the class has an account yet. They make one on the login screen with “I’m not in Sociales 2 IB”.</p>');
  }
  function filterAdmin(q) {
    q = norm(q.trim());
    $$('.acct-row[data-find]', dlg).forEach(function (b) { b.hidden = !!q && b.dataset.find.indexOf(q) < 0; });
  }
  function adminUser(id) { return (ADMIN_LIST || []).concat(ADMIN_OTHERS).filter(function (x) { return x.id === id; })[0] || null; }
  function reloadAdmin(id) {
    return api('GET', '/api/admin/users').then(function (r) {
      if (r.status === 200 && r.data && Array.isArray(r.data.users)) { ADMIN_LIST = r.data.users; ADMIN_OTHERS = Array.isArray(r.data.others) ? r.data.others : []; }
      if (dlg.open && id) openAdminUser(id);
    });
  }
  function openAdminUser(id) {
    var u = adminUser(id);
    if (!u) return;
    curSheet = function () { openAdminUser(id); };
    var free = u.kind === 'free';
    var plusTxt = u.plus === 'admin' ? 'Owner' : u.plus === 'class' ? 'Class code' : u.plus === 'gift' ? 'Given by you' : 'Off';
    var codeWord = u.last_login ? 'reset code' : 'setup code';
    var info =
      (free ? '<div class="row"><span class="row-label">Username</span><span class="row-value">@' + esc(u.id) + '</span></div>' +
              '<div class="row"><span class="row-label">Account made</span><span class="row-value">' + esc(u.created_at ? ago(u.created_at) : 'Unknown') + '</span></div>' : '') +
      '<div class="row"><span class="row-label">Password</span><span class="row-value">' + (u.claimed ? 'Set' : u.reset ? 'Waiting for ' + codeWord : 'Not set yet') + '</span></div>' +
      '<div class="row"><span class="row-label">Last login</span><span class="row-value">' + esc(u.last_login ? ago(u.last_login) : 'Never') + '</span></div>' +
      '<div class="row"><span class="row-label">Planner saved</span><span class="row-value">' + esc(u.updated_at ? ago(u.updated_at) + ' · ' + kb(u.size) : 'Nothing yet') + '</span></div>' +
      '<div class="row"><span class="row-label">MyIB Plus</span><span class="row-value">' + esc(plusTxt) + '</span></div>';
    var d = ' data-id="' + esc(u.id) + '"', code = RESET_CODES[u.id];
    var body = grp(info) +
      (code && u.reset ? grp('<div class="row"><span class="row-label">' + (u.last_login ? 'Reset code' : 'Setup code') + '</span><span class="row-value reset-code">' + esc(code) + '</span></div>' +
          rButton(icon('copy') + 'Copy Code', 'admin-copy-code', d), 'Give this to ' + esc(u.name),
          (free ? 'They tap “I’m not in Sociales 2 IB”, then Log In with @' + esc(u.id) + '. MyIB asks for this code and a new password.'
                : 'They pick their name, type this code and make a new password.') + ' It works once. Only you can see it, and only until you close MyIB.') : '') +
      grp((u.updated_at ? rButton(icon('download') + 'Download Planner', 'admin-export', d) : '') +
          rButton(icon('upload') + 'Restore From File', 'admin-import', d) +
          '<input type="file" id="admin-file" accept="application/json,.json" hidden' + d + '>', 'Planner',
          'Download saves their planner as a file you can send them; they open it with Settings → Import Backup. Restore puts a backup file back into their account.') +
      (u.admin ? '' :
        grp(rButton(icon('star') + (u.plus ? 'Remove Plus' : 'Give Plus'), 'admin-plus', d + ' data-on="' + (u.plus ? '0' : '1') + '"')) +
        (u.claimed || u.reset ?
          grp((u.claimed ? rButton('Reset Password', 'admin-reset', d, 'danger') : rButton('Make a New Code', 'admin-reset', d, 'danger')) +
              (u.updated_at ? rButton('Erase Planner', 'admin-erase', d, 'danger') : ''), '',
            'Reset Password logs ' + esc(u.name) + ' out and gives you a one-time code, so only they can make the new password. The planner stays.' +
            (u.updated_at ? ' Erase Planner deletes the saved planner for good and logs them out.' : ''))
        : grp(rButton(icon('key') + 'Make a Setup Code', 'admin-reset', d), 'Before they sign up',
            'Anyone who picks a name first can set its password. A setup code makes sure only ' + esc(u.name) + ' can: give it to them and they type it when they make their password.')) +
        (free ? grp(rButton('Delete Account', 'admin-delete', d, 'danger'), '', 'Deletes @' + esc(u.id) + ', their planner and their logins for good. The username becomes free again.') : ''));
    openDialog({ title: u.name, body: body, back: openAdmin, backLabel: 'Accounts' });
  }
  function adminImportFile(input) {
    var file = input.files && input.files[0], id = input.dataset.id;
    if (!file || !id) return;
    var btn = $('[data-act="admin-import"]', dlg);
    if (file.size > 5e6) { input.value = ''; toast('That file is too big to be a planner backup'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      input.value = '';
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { toast('That file isn’t a MyIB backup'); return; }
      var data = obj && (obj.app === 'myib' || obj.app === 'ib-planner') && obj.data ? obj.data : obj;
      if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.events) || !Array.isArray(data.periods)) { toast('That file isn’t a MyIB backup'); return; }
      api('PUT', '/api/admin/import', { user: id, data: sanitize(data) }).then(function (r) {
        if (r.status === 200) { flash(btn, 'Restored'); reloadAdmin(null); }
        else toast('Couldn’t restore it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    };
    reader.onerror = function () { input.value = ''; toast('Could not read that file'); };
    reader.readAsText(file);
  }

  function openBizum() {
    curSheet = openBizum;
    openDialog({
      title: 'Bizum Number', submitLabel: 'Save', back: openSettings, backLabel: 'Settings',
      body: grp(rText('Number', 'bizum', 'bz-num', CONF.bizum || '', '612 345 678', 20, ' inputmode="tel" autocomplete="off"'), '',
        'Shows in the Support the Dev pop-up and on the Plus sheet, for your class and for students outside it. Leave it empty to hide it.'),
      onSubmit: function (fd, form) {
        var v = clip(fd.get('bizum'), 20);
        if (v && !/^\+?[0-9 ]{6,20}$/.test(v)) { fieldError('#bz-num', 'Use digits only, like 612 345 678.'); return false; }
        if (busyForm(form, true)) return false;
        api('POST', '/api/admin/config', { bizum: v }).then(function (r) {
          busyForm(form, false);
          if (r.status === 200 && r.data) { setConf(Object.assign({ cal: CONF.cal }, r.data)); writeCache(); openSettings(); toast(CONF.bizum ? 'Bizum number saved' : 'Bizum number removed'); }
          else fieldError('#bz-num', 'Couldn’t save it. Try again.');
        }, function () { busyForm(form, false); fieldError('#bz-num', 'Can’t reach MyIB. Check your connection.'); });
        return false;
      }
    });
  }

  /* =========================================================
     Backup, import, calendar export
     ========================================================= */
  function exportBackup() {
    var t = today();
    S.settings.lastBackup = t;
    save(); flush();
    download('myib-backup-' + t + '.json', JSON.stringify({ app: 'myib', version: 3, user: ME ? ME.id : null, exported: new Date().toISOString(), data: S }, null, 2), 'application/json');
    toast('Backup downloaded');
  }
  function importFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5e6) { input.value = ''; toast('That file is too big to be a planner backup'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      input.value = '';
      try {
        var obj = JSON.parse(String(reader.result));
        var data = obj && (obj.app === 'myib' || obj.app === 'ib-planner') && obj.data ? obj.data : obj;
        if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.events) || !Array.isArray(data.periods)) throw new Error('not a backup');
        var snap = snapshot();
        S = sanitize(data);
        save(); flush();
        closeDialog(); render();
        toast('Backup restored', snap);
      } catch (err) {
        toast('That file isn’t a MyIB backup');
      }
    };
    reader.onerror = function () { input.value = ''; toast('Could not read that file'); };
    reader.readAsText(file);
  }
  function icsText(s) { return String(s).replace(/\r/g, '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function icsFold(line) {
    var out = [], cur = '', bytes = 0;
    Array.from(line).forEach(function (ch) {
      var cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildICS() {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyIB//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:MyIB'];
    S.events.slice().sort(byStart).forEach(function (e) {
      L.push('BEGIN:VEVENT', 'UID:' + e.id + '@myib.app', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + e.start.replace(/-/g, ''),
        'DTEND;VALUE=DATE:' + addDays(evEnd(e), 1).replace(/-/g, ''),
        'SUMMARY:' + icsText(evFull(e)));
      if (e.note) L.push('DESCRIPTION:' + icsText(e.note));
      var s = subj(e.subject);
      if (s) L.push('CATEGORIES:' + icsText(s.name));
      L.push('TRANSP:TRANSPARENT');
      if ((e.type === 'deadline' || e.type === 'exam') && !e.done) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(evFull(e)), 'TRIGGER:-PT15H', 'END:VALARM');
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }

  /* =========================================================
     Events
     ========================================================= */
  function parseTags(raw) {
    var subject = null;
    var title = raw.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, function (m, sp, tag) {
      if (subject) return m;
      var q = norm(tag);
      var hit = S.subjects.filter(function (s) { return norm(s.id) === q || norm(s.short) === q || norm(s.name) === q; })[0] ||
        S.subjects.filter(function (s) { return norm(s.short).indexOf(q) === 0 || norm(s.name).split(/\s+/).some(function (w) { return w.indexOf(q) === 0; }); })[0];
      if (hit) { subject = hit.id; return sp; }
      return m;
    }).replace(/\s{2,}/g, ' ').trim();
    return { title: title || raw, subject: subject };
  }
  function newTask(title, sid, due) {
    return { id: uid('t'), title: title, subject: subj(sid) ? sid : null, due: due, event: null, est: null, notes: '', done: false, doneAt: null, created: today() };
  }
  function refocus(sel) { var el = $(sel); if (el) el.focus(); }

  var ACT = {
    tab: function (el) { go(el.dataset.tab); },
    'theme-toggle': function () { S.settings.theme = effectiveDark() ? 'light' : 'dark'; sset('myib:theme', S.settings.theme); save(); render(); },
    settings: function () { openSettings(); },
    'today-which': function (el) { UI.todayWhich = el.dataset.which === 'next' ? 'next' : 'today'; render(); },
    'cal-agenda': function () { UI.calMode = 'agenda'; saveUI(); go('calendar'); },
    'cal-mode': function (el) { UI.calMode = el.dataset.mode === 'agenda' ? 'agenda' : 'month'; saveUI(); render(); },
    'cal-step': function (el) {
      var p = UI.calMonth.split('-').map(Number), d = new Date(p[0], p[1] - 1 + Number(el.dataset.step), 1);
      UI.calMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      UI.calSel = today().slice(0, 7) === UI.calMonth ? today() : null;
      render();
    },
    'cal-today': function () { var t = today(); UI.calMonth = t.slice(0, 7); UI.calSel = t; render(); },
    'cal-sel': function (el) {
      var d = el.dataset.date;
      if (!DATE.test(d)) return;
      UI.calSel = d;
      if (d.slice(0, 7) !== UI.calMonth) UI.calMonth = d.slice(0, 7);
      render();
      if (window.matchMedia && window.matchMedia('(max-width: 1080px)').matches) { var dp = $('.daypanel'); if (dp) dp.scrollIntoView({ block: 'nearest' }); }
    },
    'cal-filter': function (el) {
      var id = el.dataset.id, h = UI.hidden.slice(), i = h.indexOf(id);
      if (i >= 0) h.splice(i, 1); else h.push(id);
      UI.hidden = h; saveUI(); render();
    },
    'cal-filter-all': function () { UI.hidden = []; saveUI(); render(); },
    'ev-open': function (el) { openEvent(el.dataset.id); },
    'ev-new': function (el) { openEvent(null, { date: el.dataset.date }); },
    'ev-delete': function (el) {
      if (!arm(el)) return;
      var id = el.dataset.id, snap = snapshot();
      S.events = S.events.filter(function (e) { return e.id !== id; });
      S.tasks.forEach(function (x) { if (x.event === id) x.event = null; });
      closeDialog(); save(); render(); toast('Event deleted', snap);
    },
    'task-open': function (el) { openTask(el.dataset.id); },
    'task-new': function (el) { openTask(null, { date: el.dataset.date, event: el.dataset.event, subject: el.dataset.subject }); },
    'task-delete': function (el) {
      if (!arm(el)) return;
      var id = el.dataset.id, snap = snapshot();
      S.tasks = S.tasks.filter(function (x) { return x.id !== id; });
      closeDialog(); save(); render(); toast('Task deleted', snap);
    },
    'task-filter': function (el) { UI.taskFilter = el.dataset.id; saveUI(); render(); },
    'tt-cell': function (el) { openCell(el.dataset.p, Number(el.dataset.d)); },
    'tt-period': function (el) { openPeriod(el.dataset.p); },
    'tt-add-row': function () { openPeriod(null); },
    'tt-day': function (el) { UI.ttDay = Number(el.dataset.d); render(); },
    'period-delete': function (el) {
      if (!arm(el)) return;
      var id = el.dataset.id, snap = snapshot();
      S.periods = S.periods.filter(function (p) { return p.id !== id; });
      Object.keys(S.slots).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete S.slots[k]; });
      closeDialog(); save(); render(); toast('Row deleted', snap);
    },
    'subj-open': function (el) { openSubject(el.dataset.id); },
    'subj-new': function () { openSubject(null); },
    'subj-delete': function (el) {
      if (!arm(el)) return;
      var id = el.dataset.id, snap = snapshot();
      S.subjects = S.subjects.filter(function (s) { return s.id !== id; });
      Object.keys(S.slots).forEach(function (k) { if (S.slots[k].subject === id) delete S.slots[k]; });
      S.events.forEach(function (e) { if (e.subject === id) e.subject = null; });
      S.tasks.forEach(function (x) { if (x.subject === id) x.subject = null; });
      S.sessions.forEach(function (x) { if (x.subject === id) x.subject = null; });
      S.papers.forEach(function (x) { if (x.subject === id) x.subject = null; });
      if (S.timer && S.timer.subject === id) S.timer.subject = null;
      closeDialog(); save(); render(); toast('Subject deleted', snap);
    },
    'focus-len': function (el) { var m = Number(el.dataset.len); UI.focusLen = [25, 45, 60].indexOf(m) >= 0 ? m : 25; saveUI(); render(); },
    'focus-start': function () {
      unlockAudio();
      S.timer = { subject: subj(UI.focusSubject) ? UI.focusSubject : null, len: UI.focusLen, startedAt: nowMs(), pausedAt: null, pausedTotal: 0 };
      save(); render();
    },
    'focus-pause': function () { if (!S.timer || S.timer.pausedAt != null) return; S.timer.pausedAt = nowMs(); save(); render(); },
    'focus-resume': function () {
      unlockAudio();
      if (!S.timer || S.timer.pausedAt == null) return;
      S.timer.pausedTotal += nowMs() - S.timer.pausedAt; S.timer.pausedAt = null;
      save(); render();
    },
    'focus-finish': function () {
      var st = timerState();
      if (!st) return;
      var m = Math.floor(st.elapsed / 60000);
      S.timer = null;
      if (m >= 1) { logSession(st.subject, m, toISO(new Date(st.startedAt)), timerId(st)); toast(dur(m) + ' of ' + nameOrGeneral(st.subject) + ' logged'); }
      else toast('Under a minute, so nothing was logged');
      save(); render();
    },
    'focus-cancel': function () { var snap = snapshot(); S.timer = null; save(); render(); toast('Timer cancelled', snap); },
    'focus-log': function () { openLog(); },
    'backup-export': function () { exportBackup(); },
    'backup-import': function () { var f = $('#import-file'); if (f) f.click(); },
    'ics-export': function () { download('myib.ics', buildICS(), 'text/calendar;charset=utf-8'); toast('Calendar file downloaded'); },
    'reset-all': function (el) {
      if (!arm(el, isFree() ? 'Press again to empty your planner' : 'Press again to reset')) return;
      var snap = snapshot(), keep = { theme: S.settings.theme, accent: S.settings.accent };
      function apply(st) {
        S = sanitize(st);
        S.settings.theme = keep.theme; S.settings.accent = keep.accent;
        if (isFree()) S.settings.guide = 'on';
        closeDialog(); save(); render(); toast(isFree() ? 'Your planner is empty again' : 'Starting data restored', snap);
      }
      if (!ME.admin) return apply(startData());
      api('GET', '/api/starter').then(function (r) {
        if (r.status === 200 && r.data) apply(r.data.starter || clone(DEFAULTS));
        else toast('Couldn’t load your starting data. Try again.');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'dlg-close': function () { closeDialog(); },
    'dlg-back': function () { var b = dlgBack; dlgBack = null; if (b) b(); else closeDialog(); },
    'set-theme': function (el) {
      var th = el.dataset.theme;
      if (['auto', 'light', 'dark'].indexOf(th) < 0) return;
      S.settings.theme = th; sset('myib:theme', th); save(); applyTheme(); renderNav(); settingsTouched = true;
      $$('[data-act="set-theme"]', dlg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === th)); });
    },
    'set-accent': function (el) {
      var a = el.dataset.accent || '';
      if (!ACCENTS.some(function (x) { return x[0] === a; })) return;
      if (!plusOn()) { if (a) openPlus(openSettings); return; }
      S.settings.accent = a; save(); applyTheme(); settingsTouched = true;
      $$('[data-act="set-accent"]', dlg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.accent === a)); });
    },
    'focus-custom': function () { if (plusOn()) openFocusLen(); else openPlus(); },

    /* log in */
    'auth-pick': function (el) {
      if (!authUser(el.dataset.id)) return;
      AUTH.pick = el.dataset.id; AUTH.step = 'password'; AUTH.err = ''; AUTH.reason = ''; AUTH.show = false;
      renderAuth(true);
    },
    'auth-back': function () { AUTH.step = 'names'; AUTH.pick = null; AUTH.err = ''; AUTH.reason = ''; renderAuth(); },
    'auth-show': function (el) {
      AUTH.show = !AUTH.show;
      $$('#au-pw, #au-pw2').forEach(function (i) { i.type = AUTH.show ? 'text' : 'password'; });
      el.textContent = AUTH.show ? 'Hide' : 'Show';
      el.setAttribute('aria-pressed', String(AUTH.show));
    },
    'auth-retry': function () { checkSession(); },
    'auth-other': function () { AUTH.step = 'other'; AUTH.mode = 'join'; AUTH.err = ''; AUTH.reason = ''; AUTH.show = false; renderAuth(true); },
    'auth-mode': function (el) {
      var m = el.dataset.mode === 'login' ? 'login' : 'join';
      if (AUTH.mode === m) return;
      AUTH.mode = m; AUTH.err = ''; AUTH.reason = '';
      renderAuth(true);
    },

    /* account */
    'pw-open': function () { openPassword(); },
    logout: function (el) { logout(el); },
    'plus-open': function () { openPlus(dlg.open ? curSheet : null); },
    'support-open': function () { openSupport(dlg.open ? curSheet : null); },
    egg: function () { eggTap(); },
    'egg-unlock': function () { eggUnlock(); },
    /* the bank app wants the 9 national digits, without +34 or spaces */
    'copy-bizum': function (el) { if (CONF.bizum) copyText(CONF.bizum.replace(/\s+/g, '').replace(/^(\+|00)34(?=\d{9}$)/, ''), el, 'Copied'); },
    'cal-link': function (el) {
      if (CONF.cal && !arm(el, 'Press again: the old link stops working')) return;
      api('POST', '/api/calendar', {}).then(function (r) {
        if (r.status === 200 && r.data && r.data.cal) {
          CONF.cal = r.data.cal; writeCache();
          openSettings();
          var c = $('[data-act="cal-copy"]', dlg);
          if (c) c.scrollIntoView({ block: 'center' });
        } else if (r.status === 401) sessionLost();
        else toast('Couldn’t make a link. Try again.');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'cal-copy': function (el) { var u = calUrl(); if (u) copyText(u, el, 'Link copied'); },
    'legacy-use': function (el) {
      var d = legacyData();
      if (!d || !arm(el, 'Press again to replace your planner')) return;
      var snap = snapshot();
      S = sanitize(d); markLegacy(ME.id);
      closeDialog(); save(); render(); toast('Old planner is back', snap);
    },
    'legacy-hide': function () { markLegacy(ME.id); openSettings(); },
    'account-delete': function () { openDeleteAccount(); },

    /* setup guide */
    'guide-subjects': function () { openSubjectPicker(); },
    'guide-timetable': function () { closeDialog(); go('timetable'); },
    'guide-dates': function () { openEvent(null, {}); },
    'guide-task': function () {
      closeDialog();
      if (UI.tab !== 'today') go('today');
      var q = $('#quick-title');
      if (q) { q.scrollIntoView({ block: 'center' }); q.focus({ preventScroll: true }); toast('Type the task, then press Enter'); }
    },
    'guide-hide': function () {
      var all = !guideBusy();
      S.settings.guide = 'done'; save(); render();
      if (!all && isFree()) toast('Guide hidden. Settings → Show Setup Guide brings it back.');
    },
    'guide-show': function () { S.settings.guide = 'on'; save(); closeDialog(); go('today'); },
    'pick-subj': function (el) { el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true')); },

    /* past papers */
    papers: function () { openPapers(); },
    'paper-new': function () { openPaper(null); },
    'paper-open': function (el) { openPaper(el.dataset.id); },
    'paper-delete': function (el) {
      if (!arm(el)) return;
      var id = el.dataset.id, snap = snapshot();
      S.papers = S.papers.filter(function (x) { return x.id !== id; });
      save(); render(); openPapers(); toast('Paper deleted', snap);
    },

    /* admin */
    'admin-open': function () { openAdmin(); },
    'admin-bizum': function () { openBizum(); },
    'admin-price': function () { openPrice(); },
    'admin-papers': function () { PE.back = curSheet === openPapers ? openPapers : null; openPapersEditor(null); },
    'pe-add': function () {
      var d = readPapersForm($('.sheet', dlg));
      if (d.links.length >= 30) return;
      d.links.push({ title: '', sub: '', url: '', fresh: true });
      openPapersEditor(d, '#pe-lt-' + (d.links.length - 1));
    },
    'pe-remove': function (el) {
      var i = Number(el.dataset.i), d = readPapersForm($('.sheet', dlg)), l = d.links[i];
      if (!l) return;
      if ((l.title || l.url) && !arm(el, 'Remove?')) return;
      d.links.splice(i, 1);
      openPapersEditor(d, d.links.length ? '#pe-lt-' + Math.min(i, d.links.length - 1) : '[data-act="pe-add"]');
    },
    'pe-move': function (el) {
      var i = Number(el.dataset.i), j = i + Number(el.dataset.step), d = readPapersForm($('.sheet', dlg));
      if (!d.links[i] || !d.links[j]) return;
      var t = d.links[i]; d.links[i] = d.links[j]; d.links[j] = t;
      openPapersEditor(d, ['[data-act="pe-move"][data-i="' + j + '"][data-step="' + el.dataset.step + '"]:not([disabled])', '#pe-lt-' + j]);
    },
    'pe-reset': function (el) {
      if (!arm(el, 'Press again: back to the default links')) return;
      api('POST', '/api/admin/config', { papers: null }).then(function (r) {
        if (r.status === 200 && r.data) { setConf(Object.assign({ cal: CONF.cal }, r.data)); writeCache(); openPapersEditor(null); toast('Past Papers are back to the default'); }
        else if (r.status === 401) sessionLost();
        else toast('Couldn’t reset it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'admin-delete': function (el) {
      if (!arm(el, 'Press again to delete for good')) return;
      var id = el.dataset.id;
      api('POST', '/api/admin/delete', { user: id }).then(function (r) {
        if (r.status === 200) { delete RESET_CODES[id]; toast('@' + id + ' deleted'); openAdmin(); }
        else if (r.status === 401) sessionLost();
        else toast('Couldn’t delete it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'admin-user': function (el) { openAdminUser(el.dataset.id); },
    'admin-export': function (el) {
      var id = el.dataset.id;
      api('GET', '/api/admin/export?user=' + encodeURIComponent(id)).then(function (r) {
        if (r.status === 200 && r.data) { download('myib-' + id + '-' + today() + '.json', JSON.stringify(r.data, null, 2), 'application/json'); flash(el, 'Downloaded'); }
        else if (r.status === 404) toast('There’s no saved planner yet');
        else toast('Couldn’t download it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'admin-import': function () { var f = $('#admin-file', dlg); if (f) f.click(); },
    'admin-copy-code': function (el) { var c = RESET_CODES[el.dataset.id]; if (c) copyText(c, el, 'Copied'); },
    'admin-plus': function (el) {
      var id = el.dataset.id, on = el.dataset.on === '1';
      api('POST', '/api/admin/plus', { user: id, on: on }).then(function (r) {
        if (r.status === 200) { reloadAdmin(id); toast(on ? 'Plus is on for them' : 'Plus removed'); }
        else toast('Couldn’t change it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'admin-reset': function (el) {
      var fresh = /Setup Code/.test(el.textContent);
      if (!fresh && !arm(el, 'Press again to reset the password')) return;
      var id = el.dataset.id;
      api('POST', '/api/admin/reset', { user: id }).then(function (r) {
        if (r.status === 200 && r.data && r.data.code) { RESET_CODES[id] = r.data.code; reloadAdmin(id); toast(fresh ? 'Setup code made. Give it to them.' : 'Password reset. Give them the code.'); }
        else toast('Couldn’t reset it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    'admin-erase': function (el) {
      if (!arm(el, 'Press again to erase for good')) return;
      var id = el.dataset.id;
      api('POST', '/api/admin/erase', { user: id }).then(function (r) {
        if (r.status === 200) { reloadAdmin(id); toast('Planner erased'); }
        else toast('Couldn’t erase it (error ' + r.status + ')');
      }, function () { toast('Can’t reach MyIB. Check your connection.'); });
    },
    undo: function () {
      if (!undoSnap) return;
      try { S = sanitize(JSON.parse(undoSnap)); } catch (e) { return; }
      undoSnap = null; save(); render(); toast('Undone');
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('change', function (e) {
    var el = e.target, k = el.dataset ? el.dataset.change : null;
    if (k === 'task-done') {
      var x = taskById(el.dataset.id);
      if (!x) return;
      var snap = snapshot();
      x.done = el.checked;
      x.doneAt = x.done ? today() : null;
      save();
      if (x.done) toast('Nice, task done', snap);
      setTimeout(render, 260);
    } else if (k === 'focus-subject') { UI.focusSubject = el.value || null; saveUI(); }
    else if (k === 'tt-weekend') { S.settings.weekend = el.checked; save(); render(); }
    else if (k === 'cal-past') { UI.showPast = el.checked; saveUI(); render(); }
    else if (k === 'tasks-done') { UI.showDone = el.checked; saveUI(); render(); }
    else if (el.id === 'import-file') importFile(el);
    else if (el.id === 'admin-file') adminImportFile(el);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') {
      el.removeAttribute('aria-invalid');
      var row = el.closest('.row'), g = el.closest('.group');
      if (row) row.classList.remove('invalid');
      if (g && g.nextElementSibling && g.nextElementSibling.classList.contains('err')) g.nextElementSibling.remove();
    }
    if (el.id && el.id.indexOf('au-') === 0) {
      var ae = $('#au-err'); if (ae) ae.hidden = true; AUTH.err = '';
      /* keep what's typed when the form switches between New Account and Log In */
      if (el.id === 'au-user') AUTH.uname = el.value;
      else if (el.id === 'au-name') AUTH.name = el.value;
    }
    if (el.id === 'adm-q') filterAdmin(el.value);
    if (el.id === 's-color') {
      var r = $('input[name="color"][value="custom"]', dlg);
      if (r) { r.checked = true; r.closest('.swatch').style.setProperty('--c', el.value); }
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.closest('dialog')) return;
    e.preventDefault();
    if (f.dataset.form === 'auth') { authSubmit(f); return; }
    if (f.dataset.form === 'auth-other') { otherSubmit(f); return; }
    if (MODE !== 'app') return;
    var fd = new FormData(f), raw = clip(fd.get('title'), 200), parsed;
    if (f.dataset.form === 'quick-task') {
      if (!raw) { refocus('#quick-title'); return; }
      parsed = parseTags(raw);
      S.tasks.push(newTask(parsed.title, parsed.subject, today()));
      save(); render(); refocus('#quick-title');
      toast('Task added');
    } else if (f.dataset.form === 'task-add') {
      if (!raw) { refocus('#ta-title'); return; }
      parsed = parseTags(raw);
      var sid = parsed.subject || fd.get('subject');
      var due = fd.get('due');
      S.tasks.push(newTask(parsed.title, sid, DATE.test(due) ? due : null));
      save(); render(); refocus('#ta-title');
      toast('Task added');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (MODE !== 'app' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || dlg.open) return;
    var tg = e.target;
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    var i = '12345'.indexOf(e.key);
    if (i >= 0 && e.key.length === 1) { e.preventDefault(); go(TABS[i][0]); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTask(null, {}); }
    else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); openEvent(null, {}); }
  });

  /* Another tab on this device: follow its logouts, and its synced changes when this tab has none of its own. */
  window.addEventListener('storage', function (e) {
    if (!ME || MODE !== 'app') return;
    if (e.key === 'myib:bye' && e.newValue) { stopApp(); showAuth({}); return; }
    if (e.key !== cacheKey(ME.id) || !e.newValue || dirty || SYNC.pending || dlg.open) return;
    try {
      var c = JSON.parse(e.newValue);
      if (!c || c.pending || !c.state || !(c.rev > SYNC.rev)) return;
      S = sanitize(c.state); SYNC.rev = c.rev; SYNC.base = c.base ? JSON.stringify(c.base) : null; undoSnap = null;
      render();
    } catch (err) { /* ignore */ }
  });

  /* clock: timer every second, live views every minute */
  var lastMinute = -1, lastDay = null;
  function idle() {
    var a = document.activeElement;
    var typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && $('#view').contains(a);
    return !dlg.open && !typing;
  }
  function tick() {
    if (MODE !== 'app') return;
    if (S.timer) updateTimerUI();
    if (SYNC.needRender && idle()) { SYNC.needRender = false; render(); }
    var d = now(), m = d.getHours() * 60 + d.getMinutes(), day = toISO(d);
    if (day !== lastDay) {
      var prev = lastDay;
      lastDay = day;
      UI.todayWhich = null;
      if (prev && UI.calSel === prev) UI.calSel = day;
      if (prev && idle()) render();
    }
    if (m !== lastMinute) {
      lastMinute = m;
      if ((UI.tab === 'today' || UI.tab === 'timetable') && idle()) render();
    }
  }

  /* =========================================================
     Log in, log out, offline start
     ========================================================= */
  /* step: names (the class), password (a class name), other (students outside the class: mode join, login or reset) */
  var AUTH = { step: 'names', users: null, pick: null, reason: '', err: '', busy: false, offline: false, show: false, mode: 'join', uname: '', name: '' };
  var authBox = $('#auth');

  function setMode(m) {
    MODE = m;
    var b = document.body;
    b.classList.remove('mode-boot', 'mode-auth', 'mode-app');
    b.classList.add('mode-' + m);
  }
  function brandHTML() {
    return '<div class="auth-brand"><img class="auth-logo" src="icons/icon-192.png" alt="" width="64" height="64"><p class="auth-name">MyIB</p><p class="auth-tag">IB planner · 2026–27</p></div>';
  }
  function showSplash() {
    setMode('boot');
    authBox.innerHTML = '<div class="auth-card splash" role="status">' + brandHTML() + '<span class="spinner" aria-hidden="true"></span><span class="sr">Loading</span></div>';
  }
  function showNotice(title, html, action) {
    stopApp();
    setMode('auth');
    authBox.innerHTML = '<section class="auth-card" aria-labelledby="auth-h">' + brandHTML() +
      '<h1 class="auth-q" id="auth-h">' + esc(title) + '</h1><p class="auth-note">' + html + '</p>' +
      (action ? '<button type="button" class="btn primary auth-go" data-act="auth-retry">' + esc(action) + '</button>' : '') + '</section>';
  }
  function setupNeeded() {
    showNotice('MyIB isn’t connected to its database yet',
      'If you run MyIB: in Cloudflare, open this Pages project → Settings → Bindings, add a D1 database with the variable name <b>DB</b>, then deploy again.', 'Try Again');
  }
  function serverDown() { showNotice('Can’t reach MyIB right now', 'Check your connection and try again in a moment.', 'Try Again'); }

  /* Leave the app: save what's pending to this browser's copy, then clear the screen. */
  function stopApp() {
    flush();
    clearTimeout(SYNC.timer);
    clearTimeout(nagTimer); nagTimer = null;
    SYNC = freshSync();
    closeDialog(); hideToast();
    ME = null; CONF = blankConf();
    S = sanitize(clone(DEFAULTS));
    document.documentElement.removeAttribute('data-accent');
    document.title = 'MyIB';
    $('#view').innerHTML = '';
    renderBanner();
  }
  function showApp(fresh) {
    setMode('app');
    var h = location.hash.slice(1), t = today();
    /* a fresh log in starts on Today; a reload keeps the section in the address */
    if (fresh) { UI.tab = 'today'; try { history.replaceState(null, '', '#today'); } catch (e) { /* ignore */ } }
    else UI.tab = TABS.some(function (x) { return x[0] === h; }) ? h : (UI.tab || 'today');
    UI.calMonth = t.slice(0, 7); UI.calSel = t; UI.todayWhich = null;
    if (!subj(UI.focusSubject)) {
      var nx = S.events.filter(function (e) { return e.subject && (e.type === 'deadline' || e.type === 'exam') && !e.done && e.start >= t; }).sort(byStart)[0];
      UI.focusSubject = nx ? nx.subject : null;
    }
    var bs = $('.brand-sub');
    if (bs) bs.textContent = isFree() ? 'IB · 2026–27' : '2º BI · 2026–27';
    render();
    $('#view').focus({ preventScroll: true });
    scheduleNag();
    welcomeIfNew();
  }
  /* a brand-new empty planner opens with the welcome sheet, once */
  function welcomeIfNew() {
    setTimeout(function () {
      if (MODE === 'app' && ME && S.settings.guide === 'new' && !dlg.open) openWelcome();
    }, 350);
  }

  function authUser(id) {
    id = id || AUTH.pick;
    return (AUTH.users || []).filter(function (u) { return u.id === id; })[0] || null;
  }
  function showAuth(o) {
    o = o || {};
    stopApp();
    setMode('auth');
    /* a username from outside the class goes to its own log in form */
    var outside = o.pick && KNOWN.indexOf(o.pick) < 0;
    AUTH.step = outside ? 'other' : o.pick ? 'password' : 'names';
    AUTH.pick = outside ? null : o.pick || null;
    if (outside) { AUTH.mode = 'login'; AUTH.uname = o.pick; }
    AUTH.reason = o.reason || ''; AUTH.err = ''; AUTH.busy = false; AUTH.show = false; AUTH.offline = false;
    renderAuth();
    loadUsers();
  }
  function loadUsers() {
    /* the outside-student form doesn't need the list, so it never redraws under someone's typing */
    function redraw() { if (MODE === 'auth' && !AUTH.busy && AUTH.step !== 'other') renderAuth(); }
    return api('GET', '/api/users', null, { timeout: 10000 }).then(function (r) {
      if (r.status === 503 && r.data && r.data.error === 'setup') return setupNeeded();
      if (r.status === 200 && r.data && Array.isArray(r.data.users)) { AUTH.users = r.data.users; AUTH.offline = false; }
      else if (!AUTH.users) AUTH.offline = true;
      redraw();
    }, function () {
      if (!AUTH.users) AUTH.offline = true;
      redraw();
    });
  }
  function renderAuth(fromTap) {
    if (MODE !== 'auth') return;
    if (AUTH.step === 'other') {
      authBox.innerHTML = authOtherHTML();
      var first = AUTH.mode === 'join' ? ['#au-name', '#au-user', '#au-pw'] : AUTH.mode === 'reset' ? ['#au-code'] : ['#au-user', '#au-pw'];
      var target = first.map(function (s) { return $(s); }).filter(function (el) { return el && !el.value; })[0];
      if (target && (fromTap || !coarse.matches)) target.focus();
      return;
    }
    var u = AUTH.step === 'password' ? authUser() : null;
    if (AUTH.step === 'password' && AUTH.users && !u) AUTH.step = 'names';
    var keep = u && $('#au-pw') ? $('#au-pw').value : '';
    authBox.innerHTML = u ? authPasswordHTML(u) : authNamesHTML();
    var f = u && $('#au-pw');
    if (f) {
      if (keep) f.value = keep;
      if (fromTap || !coarse.matches) f.focus();
    }
  }
  function authNamesHTML() {
    var list = AUTH.users, body;
    if (list) {
      body = '<ul class="who">' + list.map(function (u) {
        return '<li><button type="button" class="who-btn" data-act="auth-pick" data-id="' + esc(u.id) + '">' + avatar(u.id, u.name, 'lg') +
          '<span class="who-name">' + esc(u.name) + '</span>' + (u.claimed ? '' : '<span class="who-new">New</span>') + '</button></li>';
      }).join('') + '</ul>';
    } else if (AUTH.offline) {
      body = '<p class="auth-note">Can’t reach MyIB. Check your connection.</p><button type="button" class="btn primary auth-go" data-act="auth-retry">Try Again</button>';
    } else {
      body = '<div class="sheet-loading" role="status"><span class="spinner" aria-hidden="true"></span><span class="sr">Loading</span></div>';
    }
    return '<section class="auth-card" aria-labelledby="auth-h">' + brandHTML() +
        '<h1 class="auth-q" id="auth-h">Who’s using MyIB?</h1>' + body +
        '<button type="button" class="auth-alt" data-act="auth-other"><span class="two-line"><b>I’m not in Sociales 2 IB</b><span>Make your own free account</span></span>' + icon('chev') + '</button>' +
        '<p class="auth-foot">Your planner is private. Only you can open it, with your own password.</p>' +
      '</section>';
  }

  /* Students outside the class: New Account, Log In, or (after Mauro resets it) a new password with his code. */
  function authOtherHTML() {
    var m = AUTH.mode, join = m === 'join', reset = m === 'reset', type = AUTH.show ? 'text' : 'password';
    var title = join ? 'Your own MyIB' : reset ? 'New password' : 'Welcome back';
    var sub = join ? 'Free for every IB student. Your planner starts empty, and a short guide helps you fill it in.'
            : reset ? 'Enter the code Mauro gave you, then pick a new password.'
            : AUTH.reason || 'Log in with your username.';
    function field(label, name, id, auto, max, value, extra) {
      return '<label class="row"><span class="sr">' + label + '</span><input class="row-field" type="text" name="' + name + '" id="' + id + '" maxlength="' + max +
        '" autocomplete="' + auto + '" spellcheck="false" placeholder="' + label + '" value="' + esc(value || '') + '"' + (extra || '') + '></label>';
    }
    function pw(label, name, id, auto, withShow) {
      return '<label class="row"><span class="sr">' + label + '</span><input class="row-field" type="' + type + '" name="' + name + '" id="' + id + '" maxlength="128" autocomplete="' + auto +
        '" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + label + '">' +
        (withShow ? '<button type="button" class="show-pw" data-act="auth-show" aria-pressed="' + AUTH.show + '" aria-controls="' + id + '">' + (AUTH.show ? 'Hide' : 'Show') + '</button>' : '') + '</label>';
    }
    return '<form class="auth-card" data-form="auth-other" novalidate aria-labelledby="auth-h">' +
        '<button type="button" class="auth-back" data-act="auth-back">' + icon('left') + '<span>Names</span></button>' +
        '<img class="auth-logo small" src="icons/icon-192.png" alt="" width="52" height="52">' +
        '<h1 class="auth-hi" id="auth-h">' + title + '</h1>' +
        '<p class="auth-sub">' + esc(sub) + '</p>' +
        (reset ? '' : '<div class="seg auth-seg" role="group" aria-label="Account">' +
          '<button type="button" data-act="auth-mode" data-mode="join" aria-pressed="' + join + '">New Account</button>' +
          '<button type="button" data-act="auth-mode" data-mode="login" aria-pressed="' + !join + '">Log In</button></div>') +
        '<div class="group auth-fields">' +
          (join ? field('First name', 'name', 'au-name', 'given-name', 30, AUTH.name, ' autocapitalize="words"') : '') +
          field('Username', 'username', 'au-user', 'username', 20, AUTH.uname, ' autocapitalize="none" autocorrect="off" inputmode="email"' + (reset ? ' readonly' : '')) +
          (reset ? field('Code from Mauro', 'code', 'au-code', 'off', 40, '', ' autocapitalize="characters" autocorrect="off"') : '') +
          pw(join || reset ? 'New password' : 'Password', 'password', 'au-pw', join || reset ? 'new-password' : 'current-password', true) +
          (join || reset ? pw('Repeat password', 'confirm', 'au-pw2', 'new-password', false) : '') +
        '</div>' +
        (join ? '<p class="auth-hint">Your username: 3 to 20 lowercase letters, numbers, dots or underscores. You log in with it on every device.</p>' : '') +
        '<p class="auth-err" id="au-err" role="alert"' + (AUTH.err ? '' : ' hidden') + '>' + esc(AUTH.err) + '</p>' +
        '<button type="submit" class="btn primary auth-go"' + (AUTH.busy ? ' disabled' : '') + '>' + (join ? 'Create Account' : reset ? 'Save New Password' : 'Log In') + '</button>' +
        '<p class="auth-foot">' + (join ? 'Your planner is private. Only you can open it, with your own password.' : 'Forgot your password? Ask Mauro to reset it. Your planner stays safe.') + '</p>' +
      '</form>';
  }
  function otherSubmit(form) {
    if (AUTH.busy) return;
    var fd = new FormData(form), m = AUTH.mode;
    /* MyIB shows usernames as @name, so people may type the @ too */
    var uname = String(fd.get('username') || '').trim().toLowerCase().replace(/^@+/, ''), pw = String(fd.get('password') || ''), name = '';
    AUTH.uname = uname;
    var au = $('#au-user'); if (au) au.value = uname;
    if (m === 'join') {
      name = clip(fd.get('name'), 30);
      AUTH.name = name;
      if (!name) return authError('Enter your first name.', '#au-name');
      if (!FREE_ID.test(uname)) return authError('Pick a username with 3 to 20 lowercase letters, numbers, dots or underscores.', '#au-user');
      if (KNOWN.indexOf(uname) >= 0) return authError('That username is taken. Try another.', '#au-user');
    } else if (!uname || !FREE_ID.test(uname)) {
      return authError(uname ? 'Check your username: it has 3 to 20 lowercase letters, numbers, dots or underscores.' : 'Enter your username.', '#au-user');
    }
    if (!pw) return authError(m === 'login' ? 'Enter your password.' : 'Pick a password.', '#au-pw');
    if (m === 'login' && failedBefore(uname, pw)) return authError(SAME_PW, '#au-pw', true);
    var filled = m === 'login' && autofilled($('#au-pw'));
    if (m !== 'login') {
      if (Array.from(pw).length < 6) return authError('Use at least 6 characters.', '#au-pw');
      if (pw !== String(fd.get('confirm') || '')) return authError('The two passwords don’t match.', '#au-pw2');
      if (m === 'reset' && !String(fd.get('code') || '').trim()) return authError('Enter the code Mauro gave you.', '#au-code');
    }
    authBusy(true);
    var req = m === 'join' ? api('POST', '/api/join', { user: uname, name: name, password: pw })
            : m === 'reset' ? api('POST', '/api/signup', { user: uname, password: pw, code: String(fd.get('code') || '') })
            : api('POST', '/api/login', { user: uname, password: pw });
    req.then(function (r) {
      authBusy(false);
      var d = r.data || {};
      if (r.status === 200 && d.user) {
        AUTH.err = ''; AUTH.name = '';
        /* a brand-new account: any copy this browser kept under the same username belonged to a deleted one */
        if (m === 'join') { sdel(cacheKey(d.user.id)); sdel('myib:ui:' + d.user.id); sdel('myib:papers:' + d.user.id); }
        return enterApp(d, true);
      }
      if (r.status === 400 && d.error === 'username') return authError('Pick a username with 3 to 20 lowercase letters, numbers, dots or underscores.', '#au-user');
      if (r.status === 400 && d.error === 'name') return authError('Enter your first name.', '#au-name');
      if (r.status === 400 && d.error === 'user') return authError('Check your username.', '#au-user');
      if (r.status === 400 && d.error === 'common') return authError('That password is too easy to guess. Try another.', '#au-pw', true);
      if (r.status === 400 && (d.error === 'weak' || d.error === 'long')) return authError(d.error === 'weak' ? 'Use at least 6 characters.' : 'That password is too long.', '#au-pw');
      if (r.status === 409 && m === 'join') return authError('That username is taken. Try another.', '#au-user');
      if (r.status === 409) { AUTH.mode = 'login'; AUTH.err = 'This account already has a password. Log in with it.'; return renderAuth(true); }
      if (r.status === 404 && d.error === 'unknown') return authError('There’s no account called @' + uname + '. Check the spelling, or tap New Account.', '#au-user');
      if (r.status === 404 && d.error === 'unclaimed') {
        if (d.code) { AUTH.mode = 'reset'; AUTH.err = 'Mauro reset your password. Enter the code he gave you and pick a new one.'; return renderAuth(true); }
        return authError('That name has no password yet. Go back to Names and pick it to make one.', '#au-user');
      }
      if (r.status === 401 && d.error === 'wrong') { markFailed(uname, pw); return authError(wrongText(d, filled), '#au-pw', true); }
      if (r.status === 403 && d.error === 'reset_code') return authError('That code isn’t right. Ask Mauro for it again.', '#au-code', true);
      if (r.status === 429 && d.error === 'busy') return authError('Lots of people joined MyIB today. Try again in ' + (d.wait > 90 ? Math.round(d.wait / 60) + ' hours.' : d.wait + ' min.'), '#au-user');
      if (r.status === 429) return authError(d.error === 'slow' ? 'Too many new accounts from this network. Try again in ' + d.wait + ' min.' : 'Too many tries. Wait ' + d.wait + ' min, then try again.', m === 'join' ? '#au-user' : '#au-pw', m !== 'join');
      if (r.status === 503 && d.error === 'full') return authError('MyIB has no room for new accounts right now. Ask Mauro.', '#au-user');
      if (r.status === 503 && d.error === 'setup') return setupNeeded();
      authError('Something went wrong. Try again.', '#au-pw');
    }, function () {
      authBusy(false);
      authError('Can’t reach MyIB. Check your connection.', '#au-pw');
    });
  }
  function authPasswordHTML(u) {
    var create = !u.claimed, admin = u.id === ADMIN_ID, needCode = create && (admin || u.code), type = AUTH.show ? 'text' : 'password';
    var sub = !create ? (AUTH.reason || 'Enter your password.') : admin ? 'Create your password, then enter your setup code.' :
      u.code ? 'Enter the code Mauro gave you, then pick a password.' :
      'Create a password to keep your planner private. You’ll use it on every device.';
    return '<form class="auth-card" data-form="auth" novalidate aria-labelledby="auth-h">' +
        '<button type="button" class="auth-back" data-act="auth-back">' + icon('left') + '<span>Names</span></button>' +
        avatar(u.id, u.name, 'xl') +
        '<h1 class="auth-hi" id="auth-h">' + (create ? 'Welcome, ' : 'Hi, ') + esc(u.name) + '</h1>' +
        '<p class="auth-sub">' + esc(sub) + '</p>' +
        '<input class="sr" type="text" name="username" value="' + esc(u.id) + '" autocomplete="username" tabindex="-1" aria-hidden="true">' +
        '<div class="group auth-fields">' +
          '<label class="row"><span class="sr">' + (create ? 'New password' : 'Password') + '</span><input class="row-field" type="' + type + '" name="password" id="au-pw" maxlength="128" autocomplete="' + (create ? 'new-password' : 'current-password') + '" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + (create ? 'New password' : 'Password') + '">' +
            '<button type="button" class="show-pw" data-act="auth-show" aria-pressed="' + AUTH.show + '" aria-controls="au-pw">' + (AUTH.show ? 'Hide' : 'Show') + '</button></label>' +
          (create ? '<label class="row"><span class="sr">Repeat password</span><input class="row-field" type="' + type + '" name="confirm" id="au-pw2" maxlength="128" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Repeat password"></label>' : '') +
          (needCode ? '<label class="row"><span class="sr">' + (admin ? 'Setup code' : 'Code from Mauro') + '</span><input class="row-field" type="text" name="code" id="au-code" maxlength="40" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="' + (admin ? 'Setup code' : 'Code from Mauro') + '"></label>' : '') +
        '</div>' +
        '<p class="auth-err" id="au-err" role="alert"' + (AUTH.err ? '' : ' hidden') + '>' + esc(AUTH.err) + '</p>' +
        '<button type="submit" class="btn primary auth-go"' + (AUTH.busy ? ' disabled' : '') + '>' + (create ? 'Create Password' : 'Log In') + '</button>' +
        '<p class="auth-foot">' + (create ? 'At least 6 characters. Pick something only you know.' : 'Forgot your password? Ask Mauro to reset it. Your planner stays safe.') + '</p>' +
      '</form>';
  }
  /* Saved passwords: Safari or iCloud Keychain can keep an old password, and then the one it fills in
     fails every time. MyIB spots a password the browser filled in, says so, and never sends a password
     that just failed again, so it doesn't use up your tries. Only a short fingerprint is kept, in memory. */
  var FAILED = [];
  function pwPrint(user, pw) {
    var h = 2166136261, s = user + '\n' + pw;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h + ':' + s.length;
  }
  function failedBefore(user, pw) { return FAILED.indexOf(pwPrint(user, pw)) >= 0; }
  function markFailed(user, pw) { FAILED.push(pwPrint(user, pw)); if (FAILED.length > 20) FAILED.shift(); }
  function autofilled(el) {
    if (!el) return false;
    try { if (el.matches(':autofill')) return true; } catch (e) { /* older browsers */ }
    try { return el.matches(':-webkit-autofill'); } catch (e) { return false; }
  }
  var SAME_PW = 'That’s the password that just failed, so MyIB didn’t send it again. If your browser filled it in, its saved password is out of date: type yours instead.';
  function wrongText(d, filled) {
    var tail = d.left ? d.left + (d.left === 1 ? ' try' : ' tries') + ' left.' : 'Wait ' + (d.wait || 15) + ' minutes, then try again.';
    return (filled ? 'The password your browser filled in is wrong, so its saved one is out of date. Type yours instead. ' : 'Wrong password. ') + tail;
  }
  function authError(msg, sel, clear) {
    AUTH.err = msg;
    var e = $('#au-err');
    if (e) { e.textContent = msg; e.hidden = false; }
    var f = sel ? $(sel) : null;
    if (f) { if (clear) f.value = ''; f.focus(); }
  }
  function authBusy(on) {
    AUTH.busy = on;
    var b = $('.auth-go', authBox);
    if (b) { b.disabled = on; b.classList.toggle('busy', on); }
  }
  function authSubmit(form) {
    if (AUTH.busy) return;
    var u = authUser();
    if (!u) return;
    var fd = new FormData(form), pw = String(fd.get('password') || ''), create = !u.claimed;
    if (!pw) return authError('Enter your password.', '#au-pw');
    if (!create && failedBefore(u.id, pw)) return authError(SAME_PW, '#au-pw', true);
    var filled = !create && autofilled($('#au-pw'));
    if (create) {
      if (Array.from(pw).length < 6) return authError('Use at least 6 characters.', '#au-pw');
      if (pw !== String(fd.get('confirm') || '')) return authError('The two passwords don’t match.', '#au-pw2');
      if ((u.id === ADMIN_ID || u.code) && !String(fd.get('code') || '').trim()) return authError(u.id === ADMIN_ID ? 'Enter your setup code.' : 'Enter the code Mauro gave you.', '#au-code');
    }
    authBusy(true);
    var req = create ? api('POST', '/api/signup', { user: u.id, password: pw, code: String(fd.get('code') || '') })
                     : api('POST', '/api/login', { user: u.id, password: pw });
    req.then(function (r) {
      authBusy(false);
      var d = r.data || {};
      if (r.status === 200 && d.user) { u.claimed = true; AUTH.err = ''; return enterApp(d, true); }
      if (r.status === 401 && d.error === 'wrong') { markFailed(u.id, pw); return authError(wrongText(d, filled), '#au-pw', true); }
      if (r.status === 429) return authError(d.error === 'slow' ? 'Too many new passwords from this network. Try again in ' + d.wait + ' min.' : 'Too many tries. Wait ' + d.wait + ' min, then try again.', '#au-pw', true);
      if (r.status === 404 && d.error === 'unclaimed') { u.claimed = false; AUTH.err = u.name + ' has no password yet. Create one.'; return renderAuth(); }
      if (r.status === 409 && d.error === 'taken') { u.claimed = true; AUTH.err = 'Someone already made a password for ' + u.name + '. If that wasn’t you, tell Mauro.'; return renderAuth(); }
      if (r.status === 400 && d.error === 'common') return authError('That password is too easy to guess. Try another.', '#au-pw', true);
      if (r.status === 400 && d.error === 'weak') return authError('Use at least 6 characters.', '#au-pw');
      if (r.status === 403 && d.error === 'setup_code') return authError('That setup code isn’t right.', '#au-code', true);
      if (r.status === 403 && d.error === 'reset_code') { u.code = true; if (!$('#au-code')) { AUTH.err = 'This name needs a code from Mauro. Ask him for it.'; return renderAuth(); } return authError('That code isn’t right. Ask Mauro for it again.', '#au-code', true); }
      if (r.status === 503 && d.error === 'setup') return setupNeeded();
      authError('Something went wrong. Try again.', '#au-pw');
    }, function () {
      authBusy(false);
      authError('Can’t reach MyIB. Check your connection.', '#au-pw');
    });
  }

  function enterApp(d, fresh) {
    sdel('myib:bye');
    FAILED = [];
    authBox.innerHTML = '';
    stopApp();
    ME = d.user; setConf(d);
    sset('myib:last', ME.id);
    loadUI(ME.id);
    var cache = readCache(ME.id);
    if (cache) {
      useCache(cache);
      showApp(fresh);
    } else {
      showSplash();
    }
    SYNC.needsLoad = true;
    var sync = SYNC;
    return loadServerState().then(function () {
      if (sync !== SYNC || !ME) return;
      if (MODE === 'boot') showApp(fresh);
      if (SYNC.pending && !SYNC.inflight) schedulePush(300);
    }, function () {
      if (sync !== SYNC || !ME) return;
      if (MODE === 'app') { setOnline(false); return; }
      showNotice('Couldn’t open your planner', 'Check your connection and try again.', 'Try Again');
    });
  }
  /* No connection at start-up: open the last account from this browser's copy. */
  function enterOffline(cache) {
    stopApp();
    ME = cache.me.user; setConf(cache.me);
    loadUI(ME.id);
    useCache(cache);
    SYNC.needsLoad = true; SYNC.online = false;
    showApp();
  }
  function sessionLost() {
    if (!ME) return;
    showAuth({ pick: ME.id, reason: 'You’ve been logged out on this device. Log in again to keep syncing.' });
  }
  function logout(el) {
    flush();
    if (SYNC.pending && !arm(el, 'Not synced yet. Press again to log out')) { push(); return; }
    var id = ME.id;
    sset('myib:bye', '1');
    api('POST', '/api/logout', {}).then(function (r) { if (r.status === 200) sdel('myib:bye'); }, function () {});
    stopApp();
    sdel(cacheKey(id)); sdel('myib:last');
    showAuth({});
  }
  function checkSession() {
    showSplash();
    if (sget('myib:bye')) {
      /* a logout that didn't reach the server last time */
      api('POST', '/api/logout', {}).then(function (r) { if (r.status === 200) sdel('myib:bye'); }, function () {}).then(function () { showAuth({}); });
      return;
    }
    api('GET', '/api/me', null, { timeout: 9000 }).then(function (r) {
      if (r.status === 200 && r.data && r.data.user) return enterApp(r.data);
      if (r.status === 401 || (r.status === 200 && r.data && r.data.user === null)) {
        var last = sget('myib:last');
        return showAuth({ pick: last && readCache(last) ? last : null });
      }
      if (r.status === 503 && r.data && r.data.error === 'setup') return setupNeeded();
      serverDown();
    }, function () {
      var cache = readCache(sget('myib:last'));
      if (cache) return enterOffline(cache);
      showAuth({});
    });
  }
  /* new versions: ask for a fresh sw.js every 30 minutes and when MyIB comes back on screen */
  var updateReady = false, swReg = null, lastSwCheck = Date.now();
  function checkForUpdate() {
    if (!swReg || Date.now() - lastSwCheck < 30 * 60000) return;
    lastSwCheck = Date.now();
    swReg.update().catch(function () {});
  }
  /* never under an open sheet, someone's typing or a save on its way; unsaved changes go to this browser's copy first */
  function reloadWhenQuiet() {
    if (!updateReady) return;
    var a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox';
    if (dlg.open || typing || AUTH.busy || SYNC.inflight || SYNC.resolving) { setTimeout(reloadWhenQuiet, 3000); return; }
    flush();
    location.reload();
  }
  function heartbeat() {
    if (MODE !== 'app' || !ME || document.hidden) return;
    if (!SYNC.online || SYNC.needsLoad || Date.now() - SYNC.lastMe > 30 * 60000) { reconnect(); return; }
    if (SYNC.pending && !SYNC.inflight && !SYNC.timer) { push(); return; }
    if (SYNC.wantPull || Date.now() - SYNC.lastPull > 120000) pull();
  }

  /* =========================================================
     Boot
     ========================================================= */
  (function boot() {
    applyTheme();
    var nd = now();
    lastDay = today();
    lastMinute = nd.getHours() * 60 + nd.getMinutes();
    setInterval(tick, 1000);
    setInterval(heartbeat, 30000);
    checkSession();
    if ('serviceWorker' in navigator) {
      /* After a new upload, its service worker takes over (sw.js skips waiting) and this page
         reloads at a quiet moment, so nobody has to reload by hand to get the new version. */
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) { hadController = true; return; }      /* first install: already up to date */
        updateReady = true;
        reloadWhenQuiet();
      });
      if (location.protocol === 'https:') {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js').then(function (reg) { swReg = reg; }, function () {});
        });
      }
      setInterval(checkForUpdate, 5 * 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) checkForUpdate(); });
    }
  })();
})();
