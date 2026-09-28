/* MyIB Study Pet: a 2D cartoon puppy drawn in SVG and moved with springs and small scripts.
   No libraries. app.js owns the pet's stats; this file only draws and animates.
   window.MyIBPetEngine = { BREEDS, STAGES, ITEMS, svg(opts), itemSVG(id), mount(el, opts) } */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;
  var GROUND = 244, LANE = 252, XMIN = 72, XMAX = 328, GRAV = 760;
  var LW = 2.6;
  var UID = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function chance(p) { return Math.random() < p; }
  function n2(v) { return Math.round(v * 100) / 100; }
  function pt(x, y) { return n2(x) + ' ' + n2(y); }
  function rotp(x, y, deg) { var r = deg * RAD, c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function attr(e, k, v) { e.setAttribute(k, v); }
  function rgb(h) { var v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + [0, 1, 2].map(function (i) { var c = Math.round(lerp(x[i], y[i], t)); return (c < 16 ? '0' : '') + c.toString(16); }).join('');
  }
  function seeded(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /* smooth curve through points (Catmull-Rom as cubic Beziers) */
  function through(p, move) {
    var d = move === false ? '' : 'M' + pt(p[0][0], p[0][1]);
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += 'C' + pt(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6) + ' ' + pt(c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6) + ' ' + pt(c[0], c[1]);
    }
    return d;
  }
  /* a filled stroke along a chain of points, wide at the start and round at the tip */
  function taper(pts, w0, w1, from) {
    var L = [], R = [], n = pts.length, i0 = from || 0;
    for (var i = i0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      var w = lerp(w0, w1, i / (n - 1)) / 2, nx = -dy / len * w, ny = dx / len * w;
      L.push([pts[i][0] + nx, pts[i][1] + ny]);
      R.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    var e = R[R.length - 1], r = n2(w1 / 2);
    return through(L) + 'A' + r + ' ' + r + ' 0 0 1 ' + pt(e[0], e[1]) + through(R.reverse(), false) + 'Z';
  }

  /* =========================================================
     Breeds, growth stages, accessories
     ========================================================= */
  var BREEDS = [
    { id: 'golden', name: 'Golden Retriever', ears: 'flop', tail: 'plume', cheeks: 1, fluff: 1,
      coats: [
        { id: 'gold', name: 'Golden', base: '#EBA852', light: '#F9DEAC', line: '#A5652B', ear: '#D88F3E' },
        { id: 'cream', name: 'Cream', base: '#F3DAAF', light: '#FDF4E4', line: '#B98F5B', ear: '#E5C38C' }
      ] },
    { id: 'beagle', name: 'Beagle', ears: 'long', tail: 'whip', tip: 1, blaze: 1, socks: 1, belly: 1, chest: 1,
      coats: [
        { id: 'tri', name: 'Tricolour', base: '#CB8543', light: '#FFFFFF', saddle: '#3C312D', line: '#70462A', ear: '#B06C31' },
        { id: 'lemon', name: 'Lemon', base: '#EDC680', light: '#FFFDF7', line: '#A8823F', ear: '#DAA95D' }
      ] },
    { id: 'shiba', name: 'Shiba Inu', ears: 'point', tail: 'curl', cheeks: 1, urajiro: 1, belly: 1, chest: 1, socks: 0.5, maro: 1,
      coats: [
        { id: 'red', name: 'Red', base: '#E38B3C', light: '#FFF6E8', line: '#9E5623', ear: '#D97C2D', inner: '#FFE6CF' },
        { id: 'black', name: 'Black and tan', base: '#3E3532', light: '#F9F0E5', tan: '#CD8E52', line: '#1D1715', ear: '#3E3532', inner: '#F3DCCB' }
      ] },
    { id: 'dalmatian', name: 'Dalmatian', plus: true, ears: 'flop', tail: 'whip', spots: 1,
      coats: [
        { id: 'black', name: 'Black spots', base: '#FFFFFF', light: '#FFFFFF', spot: '#2E2D33', line: '#8F8F9A', ear: '#2E2D33' },
        { id: 'liver', name: 'Liver spots', base: '#FFFFFF', light: '#FFFFFF', spot: '#7C4C30', line: '#A58E80', ear: '#7C4C30', nose: '#6B4029' }
      ] },
    { id: 'husky', name: 'Husky', plus: true, ears: 'point', tail: 'curl', cheeks: 1, fluff: 1, mask: 1, belly: 1, chest: 1, socks: 1, iris: '#4AA3F0',
      coats: [
        { id: 'grey', name: 'Grey', base: '#808A9B', light: '#FFFFFF', line: '#4B5364', ear: '#6F7989', inner: '#F5E4E7' },
        { id: 'copper', name: 'Copper', base: '#BC6D3D', light: '#FFFFFF', line: '#7C4424', ear: '#AB5F33', inner: '#F8E2D7' }
      ] },
    { id: 'corgi', name: 'Corgi', plus: true, ears: 'big', tail: 'stub', leg: 0.62, long: 1.08, blaze: 1, belly: 1, chest: 1, socks: 1,
      coats: [
        { id: 'red', name: 'Red', base: '#E79040', light: '#FFFFFF', line: '#9E5C25', ear: '#DC8336', inner: '#FFE4CE' },
        { id: 'tri', name: 'Tricolour', base: '#C97D3C', light: '#FFFFFF', saddle: '#312B29', line: '#6D4323', ear: '#C97D3C', inner: '#F2DAC8' }
      ] }
  ];
  /* hours = study hours from adoption; scale = size in the scene; head/leg/body = proportions */
  var STAGES = [
    { id: 'newborn', name: 'Newborn', hours: 0, scale: 0.62, head: 1.2, leg: 0.7, body: 0.84 },
    { id: 'puppy', name: 'Puppy', hours: 3, scale: 0.74, head: 1.12, leg: 0.8, body: 0.9 },
    { id: 'junior', name: 'Junior', hours: 12, scale: 0.87, head: 1.05, leg: 0.91, body: 0.96 },
    { id: 'adult', name: 'Adult', hours: 30, scale: 1, head: 1, leg: 1, body: 1 },
    { id: 'legend', name: 'Legend', hours: 80, scale: 1.04, head: 1, leg: 1, body: 1, glow: true }
  ];
  var ITEMS = [
    { id: 'collar', name: 'Red Collar', slot: 'neck', hours: 0 },
    { id: 'bandana', name: 'Blue Bandana', slot: 'neck', hours: 3 },
    { id: 'glasses', name: 'Reading Glasses', slot: 'face', hours: 8 },
    { id: 'party', name: 'Party Hat', slot: 'head', hours: 12 },
    { id: 'bowtie', name: 'Bow Tie', slot: 'neck', hours: 20 },
    { id: 'grad', name: 'Graduation Cap', slot: 'head', hours: 30 },
    { id: 'scarf', name: 'Scarf', slot: 'neck', hours: 0, plus: true },
    { id: 'shades', name: 'Sunglasses', slot: 'face', hours: 5, plus: true },
    { id: 'phones', name: 'Headphones', slot: 'head', hours: 15, plus: true },
    { id: 'crown', name: 'Crown', slot: 'head', hours: 50, plus: true }
  ];
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  function breedOf(id) { return find(BREEDS, id); }
  function coatOf(b, id) { return find(b.coats, id); }
  function stageOf(id) { return find(STAGES, id); }
  function itemOf(id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; }

  /* ear shapes: front = drawn over the head (floppy), at = where they join the head (x, y as parts of R) */
  var EARS = {
    flop: { front: 1, at: [0.8, -0.46], len: 28, w: 15.5, rest: -3, k: 75, c: 6.5 },
    long: { front: 1, at: [0.82, -0.4], len: 35, w: 18, rest: 0, k: 62, c: 5.5 },
    point: { front: 0, at: [0.5, -0.7], len: 23, w: 21, rest: 15, k: 320, c: 19 },
    big: { front: 0, at: [0.48, -0.72], len: 31, w: 25, rest: 17, k: 300, c: 18 }
  };
  /* tails: angles in degrees (SVG, so -90 points up); pose = stand, sit, lie, bow */
  var TAILS = {
    whip: { n: 6, len: 30, w0: 7.4, w1: 2.6, curve: 9, pose: [-150, -170, -176, -118] },
    plume: { n: 7, len: 33, w0: 10, w1: 4.5, curve: 5, pose: [-160, -172, -177, -124], fluffy: 1 },
    curl: { n: 7, len: 33, w0: 11, w1: 6.5, curve: 33, pose: [-112, -118, -138, -100] },
    stub: { n: 3, len: 11, w0: 12, w1: 9.5, curve: 8, pose: [-118, -150, -160, -96] }
  };

  /* =========================================================
     Body measurements and the four base poses
     ========================================================= */
  function torsoD(L, H) {
    var sx = L / 36, sy = H / 21;
    var P = [[-36, 2], [-36, -13, -27, -21, -12, -21], [4, -21, 20, -22, 30, -13], [37, -7, 39, 6, 33, 14], [27, 21, 12, 22, 0, 21], [-14, 20, -29, 21, -34, 12], [-35.5, 9, -36, 5, -36, 2]];
    var d = 'M' + pt(P[0][0] * sx, P[0][1] * sy);
    for (var i = 1; i < P.length; i++) { var q = P[i]; d += 'C' + pt(q[0] * sx, q[1] * sy) + ' ' + pt(q[2] * sx, q[3] * sy) + ' ' + pt(q[4] * sx, q[5] * sy); }
    return d + 'Z';
  }
  var PAW = -4.4;
  function dimsFor(br, st) {
    var L = 35 * st.body * (br.long || 1), H = 20.5, R = 27 * st.head, leg = 33 * st.leg * (br.leg || 1);
    var d = { L: L, H: H, R: R, leg: leg, legW: 11.5, pawRx: 7.4, pawRy: 4.8, st: st, br: br };
    d.torso = torsoD(L, H);
    d.a = { hipF: [L * 0.56, H * 0.3], hipB: [-L * 0.55, H * 0.3], farF: [L * 0.72, H * 0.16], farB: [-L * 0.38, H * 0.16], neck: [L * 0.64, -H * 0.55], tail: [-L * 0.9, -H * 0.42] };
    d.poses = buildPoses(d);
    return d;
  }
  function buildPoses(d) {
    var L = d.L, H = d.H, leg = d.leg, a = d.a, R = d.R;
    function world(cx, cy, rot, sy, p) { var r = rotp(p[0], p[1] * sy, rot); return [cx + r[0], cy + r[1]]; }
    /* stand: legs straight down to the ground */
    var cyS = PAW - leg * 0.97 - a.hipF[1];
    var w = function (p) { return world(0, cyS, 0, 1, p); };
    var stand = { cx: 0, cy: cyS, rot: 0, sy: 1,
      nf: [w(a.hipF)[0] + 1, PAW], ff: [w(a.farF)[0] + 1, PAW - 1.2], nh: [w(a.hipB)[0] + 1, PAW], fh: [w(a.farB)[0] + 1, PAW - 1.2],
      hx: R * 0.26, hy: -R * 0.8, th: [-L * 0.5, H * 0.3, H * 0.52, H * 0.66], tail: 0 };
    /* sit: rear on the ground, chest up */
    var rs = -30, rb = rotp(-L * 0.8, H * 0.92, rs), cxs = -L * 0.1, cys = -1.4 - rb[1];
    w = function (p) { return world(cxs, cys, rs, 1, p); };
    var sit = { cx: cxs, cy: cys, rot: rs, sy: 1,
      nf: [w(a.hipF)[0] + 2, PAW], ff: [w(a.farF)[0] + 2, PAW - 1.2], nh: [w(a.hipB)[0] + L * 0.52, PAW], fh: [w(a.hipB)[0] + L * 0.6, PAW - 1.2],
      hx: R * 0.14, hy: -R * 0.84, th: [-L * 0.42, H * 0.46, H * 0.7, H * 0.72], tail: 1 };
    /* lie: belly on the ground, front paws forward */
    var syL = 0.9, cyl = -1.2 - H * 0.93 * syL;
    w = function (p) { return world(-2, cyl, 0, syL, p); };
    var lie = { cx: -2, cy: cyl, rot: 0, sy: syL,
      nf: [w(a.hipF)[0] + leg * 0.92, PAW], ff: [w(a.hipF)[0] + leg * 0.92 + 5, PAW - 1.2], nh: [w(a.hipB)[0] + L * 0.52, PAW], fh: [w(a.hipB)[0] + L * 0.6, PAW - 1.2],
      hx: R * 0.48, hy: -R * 0.64, th: [-L * 0.44, H * 0.38, H * 0.66, H * 0.62], tail: 2 };
    /* play bow: chest down, rear up */
    var rbw = 17, hb = rotp(a.hipB[0], a.hipB[1], rbw), cyb = (cyS + a.hipB[1]) - hb[1] + 1;
    w = function (p) { return world(3, cyb, rbw, 1, p); };
    var bow = { cx: 3, cy: cyb, rot: rbw, sy: 1,
      nf: [w(a.hipF)[0] + leg * 0.78, PAW], ff: [w(a.hipF)[0] + leg * 0.78 + 5, PAW - 1.2], nh: [w(a.hipB)[0] + 1, PAW], fh: [w(a.farB)[0] + 1, PAW - 1.2],
      hx: R * 0.56, hy: -R * 0.44, th: [-L * 0.5, H * 0.3, H * 0.52, H * 0.66], tail: 3 };
    return { stand: stand, sit: sit, lie: lie, bow: bow };
  }

  /* =========================================================
     Building the puppy (SVG elements, made once per look)
     ========================================================= */
  function headD(R, br) {
    var w = R * (br.cheeks ? 1.2 : 1.16), h = R;
    return 'M' + pt(0, -h) + 'C' + pt(w * 0.6, -h) + ' ' + pt(w, -h * 0.55) + ' ' + pt(w, h * 0.02) +
      'C' + pt(w, h * 0.58) + ' ' + pt(w * 0.62, h * 0.96) + ' ' + pt(0, h * 0.96) +
      'C' + pt(-w * 0.62, h * 0.96) + ' ' + pt(-w, h * 0.58) + ' ' + pt(-w, h * 0.02) +
      'C' + pt(-w, -h * 0.55) + ' ' + pt(-w * 0.6, -h) + ' ' + pt(0, -h) + 'Z';
  }
  function earD(type, E, s) {
    var w = E.w * s, l = E.len * s;
    if (type === 'flop' || type === 'long') {
      return 'M' + pt(-w * 0.32, -2) + 'C' + pt(-w * 0.58, l * 0.28) + ' ' + pt(-w * 0.5, l * 0.82) + ' ' + pt(-w * 0.02, l) +
        'C' + pt(w * 0.42, l * 1.1) + ' ' + pt(w * 0.78, l * 0.82) + ' ' + pt(w * 0.7, l * 0.5) +
        'C' + pt(w * 0.64, l * 0.18) + ' ' + pt(w * 0.42, -2.5) + ' ' + pt(w * 0.1, -4) + 'Z';
    }
    return 'M' + pt(-w * 0.46, 4) + 'C' + pt(-w * 0.42, -l * 0.45) + ' ' + pt(-w * 0.16, -l * 0.86) + ' ' + pt(w * 0.04, -l) +
      'C' + pt(w * 0.24, -l * 0.9) + ' ' + pt(w * 0.52, -l * 0.42) + ' ' + pt(w * 0.5, 4) + 'Z';
  }
  function innerEarD(E, s) {
    var w = E.w * s, l = E.len * s;
    return 'M' + pt(-w * 0.24, 3) + 'C' + pt(-w * 0.22, -l * 0.34) + ' ' + pt(-w * 0.06, -l * 0.62) + ' ' + pt(w * 0.05, -l * 0.72) +
      'C' + pt(w * 0.16, -l * 0.62) + ' ' + pt(w * 0.3, -l * 0.3) + ' ' + pt(w * 0.3, 3) + 'Z';
  }
  function hose(parent, color, line, w, sock) {
    var o = {
      out: el('path', { fill: 'none', stroke: line, 'stroke-width': w + LW * 2, 'stroke-linecap': 'round' }, parent),
      fill: el('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, parent)
    };
    if (sock) o.sock = el('path', { fill: 'none', stroke: sock, 'stroke-width': w, 'stroke-linecap': 'round' }, parent);
    o.paw = el('ellipse', { fill: sock || color, stroke: line, 'stroke-width': LW }, parent);
    return o;
  }

  function Dog(parent, look, pfx) {
    var br = breedOf(look.breed), C = coatOf(br, look.coat), st = stageOf(look.stage);
    var d = this.d = dimsFor(br, st), R = d.R, L = d.L, H = d.H;
    var self0 = this;
    this.br = br; this.C = C; this.st = st; this.look = look;
    var E = this.E = EARS[br.ears], T = this.T = TAILS[br.tail];
    var line = C.line, farCol = mix(C.base, line, 0.22), sockCol = br.socks ? C.light : null;
    this.sockAt = br.socks === 0.5 ? 0.72 : br.leg ? 0.5 : 0.52;
    var g = this.g = el('g', { 'class': 'pd' }, parent);
    var defs = el('defs', null, g);
    var tc = el('clipPath', { id: pfx + 'tc' }, defs); el('path', { d: d.torso }, tc);
    var hc = el('clipPath', { id: pfx + 'hc' }, defs); el('path', { d: headD(R, br) }, hc);
    this.shadow = el('ellipse', { fill: '#000', opacity: 0.14 }, g);
    var body = this.body = el('g', null, g);
    /* tail */
    this.tail = el('path', { fill: C.base, stroke: line, 'stroke-width': LW, 'stroke-linejoin': 'round' }, body);
    if (br.tip || br.mask) this.tailTip = el('path', { fill: C.light, stroke: line, 'stroke-width': LW, 'stroke-linejoin': 'round' }, body);
    if (T.fluffy) this.tailFeather = el('path', { fill: C.light, opacity: 0.85 }, body);
    /* far legs, then the neck outline, then the near front leg; the body covers their tops */
    this.lFH = hose(body, farCol, line, d.legW, sockCol && mix(sockCol, line, 0.18));
    this.lFF = hose(body, farCol, line, d.legW - 0.5, sockCol && mix(sockCol, line, 0.18));
    this.neckOut = el('path', { fill: 'none', stroke: line, 'stroke-width': R * 0.95 + LW * 2, 'stroke-linecap': 'round' }, body);
    this.lNF = hose(body, C.base, line, d.legW - 0.5, sockCol);
    /* torso */
    var tg = this.torsoG = el('g', null, body);
    el('path', { d: d.torso, fill: C.base }, tg);
    var mk = el('g', { 'clip-path': 'url(#' + pfx + 'tc)' }, tg);
    if (C.saddle) el('ellipse', { cx: n2(-L * 0.1), cy: n2(-H * 0.92), rx: n2(L * 0.8), ry: n2(H * 0.64), fill: C.saddle }, mk);
    if (br.belly || br.fluff) el('ellipse', { cx: n2(L * 0.06), cy: n2(H * 0.98), rx: n2(L * 0.8), ry: n2(H * 0.5), fill: C.light, opacity: br.belly ? 1 : 0.75 }, mk);
    if (br.chest) el('ellipse', { cx: n2(L * 0.82), cy: n2(H * 0.18), rx: n2(L * 0.3), ry: n2(H * 0.8), fill: C.light }, mk);
    if (br.fluff && !br.chest) el('path', { d: 'M' + pt(L * 0.5, -H * 1.1) + 'Q' + pt(L * 0.62, -H * 0.1) + ' ' + pt(L * 0.52, H * 0.35) + 'L' + pt(L * 0.64, H * 0.3) + 'L' + pt(L * 0.6, H * 0.62) + 'L' + pt(L * 0.74, H * 0.5) + 'L' + pt(L * 0.74, H * 0.9) + 'L' + pt(L * 1.3, H) + 'L' + pt(L * 1.3, -H * 1.1) + 'Z', fill: C.light }, mk);
    if (br.spots) {
      var rn = seeded(hash(look.breed + look.coat + 'spots'));
      for (var i = 0; i < 9; i++) {
        el('circle', { cx: n2(lerp(-L * 0.35, L * 0.55, (i + rn() * 0.8) / 9)), cy: n2(lerp(-H * 0.8, H * 0.45, rn())), r: n2(2.2 + rn() * 2.2), fill: C.spot }, mk);
      }
    }
    el('path', { d: d.torso, fill: 'none', stroke: line, 'stroke-width': LW }, tg);
    this.neckFill = el('path', { fill: 'none', stroke: C.base, 'stroke-width': R * 0.95, 'stroke-linecap': 'round' }, body);
    /* near hind leg and thigh */
    this.lNH = hose(body, C.base, line, d.legW, sockCol);
    this.thighG = el('g', null, body);
    this.thighAt = el('g', null, this.thighG);
    this.thigh = el('ellipse', { fill: C.base, stroke: line, 'stroke-width': LW, 'stroke-linecap': 'round' }, this.thighAt);
    if (br.spots) [[-3, -5, 2.6], [4, 3, 2.2], [-4, 5, 1.8]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: s[2], fill: C.spot }, self0.thighAt); });
    /* head */
    var hg = this.head = el('g', null, g);
    this.hR = R;
    var es = st.head * 0.95 + 0.05;
    if (!E.front) {
      this.earR = el('g', null, hg); this.earL = el('g', null, hg);
      [this.earR, this.earL].forEach(function (eg) {
        el('path', { d: earD(br.ears, E, es), fill: C.ear, stroke: line, 'stroke-width': LW, 'stroke-linejoin': 'round' }, eg);
        el('path', { d: innerEarD(E, es), fill: C.inner || C.light }, eg);
      });
    }
    if (br.cheeks) {
      var cw = R * 1.2, cc = br.urajiro || br.mask ? C.light : C.base;
      [1, -1].forEach(function (s) {
        el('path', { d: 'M' + pt(s * cw * 0.9, R * 0.12) + 'L' + pt(s * cw * 1.13, R * 0.34) + 'L' + pt(s * cw * 0.96, R * 0.42) + 'L' + pt(s * cw * 1.08, R * 0.6) + 'L' + pt(s * cw * 0.74, R * 0.72) + 'Z',
          fill: cc, stroke: line, 'stroke-width': LW, 'stroke-linejoin': 'round' }, hg);
      });
    }
    this.neckwear = el('g', null, hg);
    var HD = headD(R, br);
    el('path', { d: HD, fill: br.mask ? C.light : C.base }, hg);
    var hm = el('g', { 'clip-path': 'url(#' + pfx + 'hc)' }, hg);
    if (br.mask) {
      el('path', { d: 'M' + pt(-R * 1.3, -R * 0.02) + 'C' + pt(-R * 0.9, -R * 0.12) + ' ' + pt(-R * 0.62, -R * 0.36) + ' ' + pt(-R * 0.27, -R * 0.32) +
        'C' + pt(-R * 0.14, -R * 0.3) + ' ' + pt(-R * 0.08, -R * 0.16) + ' ' + pt(0, -R * 0.04) + 'C' + pt(R * 0.08, -R * 0.16) + ' ' + pt(R * 0.14, -R * 0.3) + ' ' + pt(R * 0.27, -R * 0.32) +
        'C' + pt(R * 0.62, -R * 0.36) + ' ' + pt(R * 0.9, -R * 0.12) + ' ' + pt(R * 1.3, -R * 0.02) + 'L' + pt(R * 1.3, -R * 1.4) + 'L' + pt(-R * 1.3, -R * 1.4) + 'Z', fill: C.base }, hm);
    }
    if (C.tan) [1, -1].forEach(function (s) { el('ellipse', { cx: n2(s * R * 0.72), cy: n2(R * 0.14), rx: n2(R * 0.24), ry: n2(R * 0.18), fill: C.tan }, hm); });
    if (br.urajiro) {
      el('ellipse', { cx: 0, cy: n2(R * 0.66), rx: n2(R * 1.02), ry: n2(R * 0.5), fill: C.light }, hm);
      [1, -1].forEach(function (s) { el('ellipse', { cx: n2(s * R * 0.6), cy: n2(R * 0.32), rx: n2(R * 0.34), ry: n2(R * 0.26), fill: C.light }, hm); });
    }
    if (br.blaze) {
      el('path', { d: 'M' + pt(-R * 0.08, -R * 1.05) + 'C' + pt(-R * 0.1, -R * 0.55) + ' ' + pt(-R * 0.17, -R * 0.25) + ' ' + pt(-R * 0.34, R * 0.2) +
        'L' + pt(R * 0.34, R * 0.2) + 'C' + pt(R * 0.17, -R * 0.25) + ' ' + pt(R * 0.1, -R * 0.55) + ' ' + pt(R * 0.08, -R * 1.05) + 'Z', fill: C.light }, hm);
    }
    if (br.spots) {
      [[-0.58, -0.6, 3.6], [0.5, -0.72, 2.6], [0.8, 0.14, 3], [-0.18, -0.9, 2.2], [-0.86, 0.2, 2.4]].forEach(function (s) {
        el('circle', { cx: n2(s[0] * R), cy: n2(s[1] * R), r: s[2], fill: C.spot }, hm);
      });
    }
    el('ellipse', { cx: n2(-R * 0.36), cy: n2(-R * 0.62), rx: n2(R * 0.3), ry: n2(R * 0.15), fill: '#fff', opacity: 0.2, transform: 'rotate(-18 ' + pt(-R * 0.36, -R * 0.62) + ')' }, hm);
    el('path', { d: HD, fill: 'none', stroke: line, 'stroke-width': LW }, hg);
    if (E.front) {
      this.earR = el('g', null, hg); this.earL = el('g', null, hg);
      [this.earR, this.earL].forEach(function (eg) {
        el('path', { d: earD(br.ears, E, es), fill: C.ear, stroke: line, 'stroke-width': LW, 'stroke-linejoin': 'round' }, eg);
      });
    }
    /* face: everything that slides when the head turns */
    var face = this.face = el('g', null, hg);
    this.muzzle = el('ellipse', { rx: n2(R * 0.45), ry: n2(R * 0.33), fill: C.light }, face);
    this.cheekL = el('ellipse', { rx: n2(R * 0.19), ry: n2(R * 0.12), fill: '#FF8FA8' }, face);
    this.cheekR = el('ellipse', { rx: n2(R * 0.19), ry: n2(R * 0.12), fill: '#FF8FA8' }, face);
    var browCol = br.maro ? (C.tan || C.light) : mix(C.base, line, br.spots ? 0.85 : 0.6);
    this.browL = el('path', { fill: 'none', stroke: browCol, 'stroke-width': br.maro ? 4 : 2.3, 'stroke-linecap': 'round' }, face);
    this.browR = el('path', { fill: 'none', stroke: browCol, 'stroke-width': br.maro ? 4 : 2.3, 'stroke-linecap': 'round' }, face);
    var eyeCol = C.eye || '#2B1F1A', ex = R * 0.17 * (0.9 + 0.1 * st.head), ey = R * 0.2 * (0.9 + 0.1 * st.head);
    this.eyeRx = ex; this.eyeRy = ey;
    var self = this;
    ['eyeL', 'eyeR'].forEach(function (k) {
      var eg = self[k] = el('g', null, face);
      el('ellipse', { rx: n2(ex), ry: n2(ey), fill: eyeCol }, eg);
      if (br.iris) { el('ellipse', { rx: n2(ex * 0.78), ry: n2(ey * 0.8), fill: br.iris }, eg); el('ellipse', { rx: n2(ex * 0.4), ry: n2(ey * 0.44), fill: '#15202C' }, eg); }
      el('circle', { cx: n2(ex * 0.34), cy: n2(-ey * 0.36), r: n2(ex * 0.42), fill: '#fff' }, eg);
      el('circle', { cx: n2(-ex * 0.38), cy: n2(ey * 0.4), r: n2(ex * 0.18), fill: '#fff', opacity: 0.9 }, eg);
    });
    var lidCol = mix(eyeCol, line, 0.3);
    this.happyL = el('path', { fill: 'none', stroke: lidCol, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, face);
    this.happyR = el('path', { fill: 'none', stroke: lidCol, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, face);
    this.mouthIn = el('path', { fill: '#8E2F3A', stroke: mix(line, '#2E2522', 0.5), 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, face);
    this.tongue = el('path', { fill: '#FF8398', stroke: '#D9546E', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, face);
    this.mouth = el('path', { fill: 'none', stroke: mix(line, '#2E2522', 0.5), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, face);
    var nw = R * 0.36, nh = R * 0.25;
    this.nose = el('g', null, face);
    el('path', { d: 'M' + pt(-nw / 2, -nh / 2) + 'Q' + pt(0, -nh * 0.78) + ' ' + pt(nw / 2, -nh / 2) + 'Q' + pt(nw * 0.56, nh * 0.12) + ' ' + pt(0, nh / 2) + 'Q' + pt(-nw * 0.56, nh * 0.12) + ' ' + pt(-nw / 2, -nh / 2) + 'Z', fill: C.nose || '#2E2522' }, this.nose);
    el('ellipse', { cx: n2(-nw * 0.12), cy: n2(-nh * 0.22), rx: n2(nw * 0.18), ry: n2(nh * 0.14), fill: '#fff', opacity: 0.55 }, this.nose);
    this.noseH = nh;
    this.tear = el('path', { d: 'M0 -4.2C2.4 -1.2 3 0.8 3 2A3 3 0 0 1 -3 2C-3 0.8 -2.4 -1.2 0 -4.2Z', fill: '#8FD3FF', stroke: '#3C9BE0', 'stroke-width': 0.9, opacity: 0 }, face);
    this.ballMouth = el('g', { opacity: 0 }, face);
    drawBall(this.ballMouth, 7);
    this.facewear = el('g', null, face);
    this.headwear = el('g', null, hg);
    this.wear = { neck: null, head: null, face: null };
    this.dyn = {};
    this.setWear(look.wear || {});
  }
  Dog.prototype.setWear = function (w) {
    var self = this, R = this.hR;
    [['neck', this.neckwear], ['face', this.facewear], ['head', this.headwear]].forEach(function (s) {
      var id = w[s[0]] || null;
      if (self.wear[s[0]] === id) return;
      self.wear[s[0]] = id;
      while (s[1].firstChild) s[1].removeChild(s[1].firstChild);
      delete self.dyn[s[0]];
      if (id && itemOf(id) && itemOf(id).slot === s[0]) self.dyn[s[0]] = drawItem(id, s[1], R, self) || null;
    });
  };

  /* the tennis ball (also used in the mouth) */
  function drawBall(g, r) {
    el('circle', { r: r, fill: '#D8E84E', stroke: '#8FA32B', 'stroke-width': 1.6 }, g);
    el('path', { d: 'M' + pt(-r * 0.95, -r * 0.3) + 'Q' + pt(0, r * 0.25) + ' ' + pt(r * 0.3, -r * 0.95) + 'M' + pt(-r * 0.3, r * 0.95) + 'Q' + pt(0, -r * 0.2) + ' ' + pt(r * 0.95, r * 0.3), fill: 'none', stroke: '#fff', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
  }

  /* accessories, in head coordinates (R = head size) */
  function drawItem(id, g, R, dog) {
    var ex = R * 0.37, ey = -R * 0.04;
    if (id === 'collar' || id === 'scarf') {
      var dd = 'M' + pt(-R * 0.62, R * 0.62) + 'Q' + pt(0, R * 1.52) + ' ' + pt(R * 0.62, R * 0.62);
      var wide = id === 'scarf' ? 9 : 6;
      el('path', { d: dd, fill: 'none', stroke: id === 'scarf' ? '#8F1D24' : '#8E1B1B', 'stroke-width': wide + 2.8, 'stroke-linecap': 'round' }, g);
      el('path', { d: dd, fill: 'none', stroke: id === 'scarf' ? '#E23B45' : '#E8453C', 'stroke-width': wide, 'stroke-linecap': 'round' }, g);
      if (id === 'scarf') {
        el('path', { d: dd, fill: 'none', stroke: '#FFF4E6', 'stroke-width': wide, 'stroke-dasharray': '3 5' }, g);
        var tailG = el('g', null, g);
        el('path', { d: 'M' + pt(R * 0.3, R * 0.95) + 'L' + pt(R * 0.58, R * 1.62) + 'L' + pt(R * 0.32, R * 1.7) + 'L' + pt(R * 0.12, R * 1.02) + 'Z', fill: '#E23B45', stroke: '#8F1D24', 'stroke-width': 2, 'stroke-linejoin': 'round' }, tailG);
        el('path', { d: 'M' + pt(R * 0.26, R * 1.2) + 'L' + pt(R * 0.46, R * 1.14) + 'M' + pt(R * 0.32, R * 1.42) + 'L' + pt(R * 0.52, R * 1.36), stroke: '#FFF4E6', 'stroke-width': 2.4 }, tailG);
        el('path', { d: 'M' + pt(R * 0.36, R * 1.7) + 'l-1 4M' + pt(R * 0.45, R * 1.67) + 'l0 4.2M' + pt(R * 0.54, R * 1.64) + 'l1 4', stroke: '#E23B45', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, tailG);
      } else {
        el('circle', { cx: 0, cy: n2(R * 1.14), r: 3.8, fill: '#FFCC33', stroke: '#B8860B', 'stroke-width': 1.5 }, g);
      }
      return null;
    }
    if (id === 'bandana') {
      el('path', { d: 'M' + pt(-R * 0.66, R * 0.66) + 'L' + pt(R * 0.66, R * 0.66) + 'Q' + pt(R * 0.3, R * 1.3) + ' ' + pt(0, R * 1.62) + 'Q' + pt(-R * 0.3, R * 1.3) + ' ' + pt(-R * 0.66, R * 0.66) + 'Z', fill: '#3D7EF0', stroke: '#1F4FA8', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
      [[-0.2, 1.08], [0.2, 1.04], [0, 1.34], [-0.42, 0.9], [0.42, 0.88]].forEach(function (p) { el('circle', { cx: n2(p[0] * R), cy: n2(p[1] * R), r: 1.7, fill: '#fff' }, g); });
      return null;
    }
    if (id === 'bowtie') {
      var y = R * 1.06;
      el('path', { d: 'M0 ' + n2(y) + 'L' + pt(-10.5, y - 6.5) + 'Q' + pt(-13, y) + ' ' + pt(-10.5, y + 6.5) + 'Z' + 'M0 ' + n2(y) + 'L' + pt(10.5, y - 6.5) + 'Q' + pt(13, y) + ' ' + pt(10.5, y + 6.5) + 'Z', fill: '#6B5CFF', stroke: '#3A2F9E', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      el('ellipse', { cx: 0, cy: n2(y), rx: 3.4, ry: 3.8, fill: '#4B3FD6', stroke: '#3A2F9E', 'stroke-width': 1.8 }, g);
      return null;
    }
    if (id === 'glasses') {
      var r = dog ? dog.eyeRx * 1.95 : R * 0.33;
      [-1, 1].forEach(function (s) { el('circle', { cx: n2(s * ex), cy: n2(ey), r: n2(r), fill: '#fff', 'fill-opacity': 0.16, stroke: '#3A2B24', 'stroke-width': 2.1 }, g); });
      el('path', { d: 'M' + pt(-ex + r, ey) + 'Q' + pt(0, ey - 4) + ' ' + pt(ex - r, ey) + 'M' + pt(-ex - r, ey) + 'L' + pt(-R * 1.02, ey - 2) + 'M' + pt(ex + r, ey) + 'L' + pt(R * 1.02, ey - 2), fill: 'none', stroke: '#3A2B24', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      return null;
    }
    if (id === 'shades') {
      [-1, 1].forEach(function (s) {
        var cx = s * ex;
        el('path', { d: 'M' + pt(cx - 8.5, ey - 5) + 'L' + pt(cx + 8.5, ey - 5) + 'Q' + pt(cx + 8.8, ey + 6.5) + ' ' + pt(cx, ey + 6.8) + 'Q' + pt(cx - 8.8, ey + 6.5) + ' ' + pt(cx - 8.5, ey - 5) + 'Z', fill: '#17171C', stroke: '#000', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
        el('path', { d: 'M' + pt(cx - 4.5, ey - 2.5) + 'L' + pt(cx - 1.5, ey - 2.5), stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.8 }, g);
      });
      el('path', { d: 'M' + pt(-ex + 8, ey - 4) + 'Q' + pt(0, ey - 7) + ' ' + pt(ex - 8, ey - 4) + 'M' + pt(-ex - 8.5, ey - 4) + 'L' + pt(-R * 1.04, ey - 5) + 'M' + pt(ex + 8.5, ey - 4) + 'L' + pt(R * 1.04, ey - 5), fill: 'none', stroke: '#17171C', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
      return null;
    }
    if (id === 'party') {
      var pg = el('g', { transform: 'translate(' + pt(-R * 0.3, -R * 0.86) + ') rotate(-18)' }, g);
      el('path', { d: 'M-10.5 0L0 -28L10.5 0Q0 3.5 -10.5 0Z', fill: '#FF5FA2', stroke: '#B83271', 'stroke-width': 2, 'stroke-linejoin': 'round' }, pg);
      el('path', { d: 'M-7 -9.3L-5.25 -14L5.25 -14L7 -9.3Z M-3.5 -18.7L-2.1 -22.4L2.1 -22.4L3.5 -18.7Z', fill: '#FFD54A' }, pg);
      el('circle', { cy: -28, r: 4.2, fill: '#fff', stroke: '#D6D6DE', 'stroke-width': 1.4 }, pg);
      return null;
    }
    if (id === 'grad') {
      var gg = el('g', { transform: 'translate(0 ' + n2(-R * 0.86) + ')' }, g);
      el('path', { d: 'M' + pt(-R * 0.52, 2) + 'L' + pt(-R * 0.5, -R * 0.24) + 'Q' + pt(0, -R * 0.36) + ' ' + pt(R * 0.5, -R * 0.24) + 'L' + pt(R * 0.52, 2) + 'Q' + pt(0, -R * 0.12) + ' ' + pt(-R * 0.52, 2) + 'Z', fill: '#2B2C33', stroke: '#15161B', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, gg);
      el('path', { d: 'M' + pt(-R * 1.08, -R * 0.26) + 'L' + pt(0, -R * 0.56) + 'L' + pt(R * 1.08, -R * 0.26) + 'L' + pt(0, R * 0.02) + 'Z', fill: '#33343C', stroke: '#15161B', 'stroke-width': 1.9, 'stroke-linejoin': 'round' }, gg);
      el('circle', { cy: n2(-R * 0.27), r: 2.2, fill: '#FFC933' }, gg);
      var tas = el('g', { transform: 'translate(' + pt(R * 0.02, -R * 0.27) + ')' }, gg);
      el('path', { d: 'M0 0L' + pt(R * 0.8, R * 0.08), fill: 'none', stroke: '#FFC933', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, tas);
      var hang = el('g', { transform: 'translate(' + pt(R * 0.8, R * 0.08) + ')' }, tas);
      el('path', { d: 'M0 0L0 11', stroke: '#FFC933', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, hang);
      el('path', { d: 'M-2.2 10L2.2 10L3 17L-3 17Z', fill: '#FFC933', stroke: '#C29416', 'stroke-width': 1 }, hang);
      return { swing: hang, base: hang.getAttribute('transform') };
    }
    if (id === 'phones') {
      el('path', { d: 'M' + pt(-R * 0.96, R * 0.02) + 'C' + pt(-R * 1.02, -R * 1.34) + ' ' + pt(R * 1.02, -R * 1.34) + ' ' + pt(R * 0.96, R * 0.02), fill: 'none', stroke: '#2F2F35', 'stroke-width': 5.4, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M' + pt(-R * 0.8, -R * 0.62) + 'C' + pt(-R * 0.5, -R * 1.04) + ' ' + pt(R * 0.5, -R * 1.04) + ' ' + pt(R * 0.8, -R * 0.62), fill: 'none', stroke: '#6E6E78', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
      [-1, 1].forEach(function (s) {
        el('rect', { x: n2(s * R * 1.0 - R * 0.19), y: n2(-R * 0.3), width: n2(R * 0.38), height: n2(R * 0.66), rx: n2(R * 0.15), fill: '#FF4F7B', stroke: '#A3264B', 'stroke-width': 2 }, g);
        el('rect', { x: n2(s * R * 1.0 - R * 0.08), y: n2(-R * 0.2), width: n2(R * 0.16), height: n2(R * 0.46), rx: n2(R * 0.07), fill: '#FF86A5' }, g);
      });
      return null;
    }
    if (id === 'crown') {
      var cg = el('g', { transform: 'translate(' + pt(R * 0.08, -R * 0.9) + ') rotate(8)' }, g);
      el('path', { d: 'M' + pt(-R * 0.44, 0) + 'L' + pt(-R * 0.5, -R * 0.4) + 'L' + pt(-R * 0.22, -R * 0.18) + 'L' + pt(0, -R * 0.5) + 'L' + pt(R * 0.22, -R * 0.18) + 'L' + pt(R * 0.5, -R * 0.4) + 'L' + pt(R * 0.44, 0) + 'Q0 ' + n2(R * 0.06) + ' ' + pt(-R * 0.44, 0) + 'Z', fill: '#FFCF3D', stroke: '#B7861A', 'stroke-width': 1.9, 'stroke-linejoin': 'round' }, cg);
      el('circle', { cx: 0, cy: n2(-R * 0.1), r: 2.4, fill: '#FF4D6D', stroke: '#B7861A', 'stroke-width': 1 }, cg);
      [-1, 1].forEach(function (s) { el('circle', { cx: n2(s * R * 0.27), cy: n2(-R * 0.08), r: 1.7, fill: '#4DA3FF', stroke: '#B7861A', 'stroke-width': 0.9 }, cg); });
      [[-0.5, -0.4], [0, -0.5], [0.5, -0.4]].forEach(function (p) { el('circle', { cx: n2(p[0] * R), cy: n2(p[1] * R), r: 2, fill: '#FFE58A', stroke: '#B7861A', 'stroke-width': 1 }, cg); });
      return null;
    }
    return null;
  }

  /* =========================================================
     Posing: P holds every number that moves; this turns it into SVG
     ========================================================= */
  var GAIT_WALK = { nf: 0, ff: Math.PI, nh: Math.PI, fh: 0 };
  var GAIT_RUN = { nf: 0, ff: 0.35, nh: Math.PI, fh: Math.PI + 0.35 };
  Dog.prototype.pose = function (P) {
    var d = this.d, ps = d.poses, R = d.R, L = d.L, a = d.a, leg = d.leg, br = this.br;
    var ws = clamp(P.sit || 0, 0, 1), wl = clamp(P.lie || 0, 0, 1), wb = clamp(P.bow || 0, 0, 1), wsum = ws + wl + wb;
    if (wsum > 1) { ws /= wsum; wl /= wsum; wb /= wsum; }
    var w0 = Math.max(0, 1 - ws - wl - wb);
    function b(k) { return w0 * ps.stand[k] + ws * ps.sit[k] + wl * ps.lie[k] + wb * ps.bow[k]; }
    function b2(k, i) { return w0 * ps.stand[k][i] + ws * ps.sit[k][i] + wl * ps.lie[k][i] + wb * ps.bow[k][i]; }
    var fx = P.faceX == null ? 1 : P.faceX, crouch = P.crouch || 0, gait = P.gait || 0, gph = P.gaitPh || 0, breath = P.breath || 0;
    var cx = b('cx'), cy = b('cy') + crouch * leg * 0.3, rot = b('rot') + (P.lean || 0) + (P.shake || 0), sy = b('sy') * (1 + breath * 0.018);
    if (gait > 1) { rot += Math.sin(gph) * 5 * (gait - 1); cy -= Math.abs(Math.sin(gph)) * 3.2 * (gait - 1); }
    if (gait > 0) cy -= Math.abs(Math.sin(gph)) * 1.3 * Math.min(1, gait);
    var cr = Math.cos(rot * RAD), sr = Math.sin(rot * RAD);
    function W(p) { var x = p[0], y = p[1] * sy; return [cx + x * cr - y * sr, cy + x * sr + y * cr]; }
    var tr = 'translate(' + pt(cx, cy) + ') rotate(' + n2(rot) + ') scale(1 ' + n2(sy) + ')';
    attr(this.body, 'transform', 'scale(' + n2(Math.abs(fx) < 0.02 ? 0.02 * (fx < 0 ? -1 : 1) : fx) + ' 1)');
    attr(this.torsoG, 'transform', tr); attr(this.thighG, 'transform', tr);
    if (this.fluffG) attr(this.fluffG, 'transform', tr);
    attr(this.thighAt, 'transform', 'translate(' + pt(b2('th', 0), b2('th', 1)) + ')');
    var trx = b2('th', 2), tryy = b2('th', 3), circ = Math.PI * (3 * (trx + tryy) - Math.sqrt((3 * trx + tryy) * (trx + 3 * tryy)));
    attr(this.thigh, 'rx', n2(trx)); attr(this.thigh, 'ry', n2(tryy));
    attr(this.thigh, 'stroke-dasharray', n2(circ * 0.556) + ' ' + n2(circ * 0.225) + ' ' + n2(circ * 0.22) + ' 0');

    /* head: follows the neck, plus eating, resting, looking up, nodding */
    var neck = W(a.neck);
    var hc = [neck[0] + b('hx'), neck[1] + b('hy')];
    var hd = P.headDown || 0, hr = P.headRest || 0;
    if (hd) hc = [lerp(hc[0], neck[0] + R * 0.74, hd), lerp(hc[1], -R * 0.86, hd)];
    if (hr) hc = [lerp(hc[0], neck[0] + R * 0.52, hr), lerp(hc[1], Math.max(hc[1], -R * 0.8), hr)];
    if (P.headUp) { hc[0] -= R * 0.06 * P.headUp; hc[1] -= R * 0.14 * P.headUp; }
    hc[0] += P.lagX || 0; hc[1] += (P.lagY || 0) + (P.nod || 0) + breath * 0.6;
    var nd = 'M' + pt(neck[0], neck[1]) + 'L' + pt(hc[0], hc[1]);
    attr(this.neckOut, 'd', nd); attr(this.neckFill, 'd', nd);
    var tilt = (P.headTilt || 0) + ws * -3 + hd * 10 * (fx < 0 ? -1 : 1) + hr * 8 * (fx < 0 ? -1 : 1);

    /* legs */
    var run = clamp(gait - 1, 0, 1), stride = leg * (gait <= 1 ? 0.2 * gait : 0.2 + 0.17 * run), lift = leg * (gait <= 1 ? 0.16 * gait : 0.16 + 0.12 * run);
    var dig = P.dig || 0, dph = P.digPh || 0, scr = P.scratch || 0, sph = P.scratchPh || 0, pawUp = P.pawLift || 0, tuck = P.tuck || 0;
    var self = this;
    [['lNF', a.hipF, 'nf', -1, 1], ['lFF', a.farF, 'ff', -1, 1], ['lNH', a.hipB, 'nh', 1, 0], ['lFH', a.farB, 'fh', 1, 0]].forEach(function (L4) {
      var h = self[L4[0]], hip = W(L4[1]), k = L4[2], front = L4[4];
      var paw = [b2(k, 0), b2(k, 1)];
      if (gait > 0.001) {
        var off = lerp(GAIT_WALK[k], GAIT_RUN[k], run), ph = gph + off;
        paw[0] += stride * Math.cos(ph); paw[1] -= lift * Math.max(0, -Math.sin(ph));
      }
      if (front && dig) {
        var dp = dph + (k === 'ff' ? Math.PI : 0);
        paw[0] += dig * leg * 0.2 * Math.cos(dp); paw[1] -= dig * leg * 0.24 * Math.max(0, Math.sin(dp));
      }
      if (k === 'nf' && pawUp) paw = [lerp(paw[0], hip[0] + leg * 0.62, pawUp), lerp(paw[1], hip[1] + leg * 0.3, pawUp)];
      if (k === 'nh' && scr) paw = [lerp(paw[0], hc[0] - R * 0.62 + 2.5 * Math.sin(sph * 2), scr), lerp(paw[1], hc[1] + R * 0.25 + 3 * Math.sin(sph), scr)];
      if (tuck) paw = [lerp(paw[0], hip[0] + (front ? 5 : -5), tuck), lerp(paw[1], hip[1] + leg * 0.45, tuck)];
      var dx = paw[0] - hip[0], dy = paw[1] - hip[1], dist = Math.hypot(dx, dy) || 1, max = leg * 1.06;
      if (dist > max) { paw = [hip[0] + dx / dist * max, hip[1] + dy / dist * max]; dx = paw[0] - hip[0]; dy = paw[1] - hip[1]; dist = max; }
      var bend = Math.min(leg * 0.34, Math.sqrt(Math.max(0, leg * leg - dist * dist)) * 0.5) * L4[3];
      var qx = (hip[0] + paw[0]) / 2 - dy / dist * bend, qy = (hip[1] + paw[1]) / 2 + dx / dist * bend;
      var dd = 'M' + pt(hip[0], hip[1]) + 'Q' + pt(qx, qy) + ' ' + pt(paw[0], paw[1]);
      attr(h.out, 'd', dd); attr(h.fill, 'd', dd);
      if (h.sock) {
        var t = self.sockAt, u = 1 - t;
        attr(h.sock, 'd', 'M' + pt(u * u * hip[0] + 2 * u * t * qx + t * t * paw[0], u * u * hip[1] + 2 * u * t * qy + t * t * paw[1]) + 'Q' + pt(lerp(qx, paw[0], t), lerp(qy, paw[1], t)) + ' ' + pt(paw[0], paw[1]));
      }
      var up = clamp((PAW - paw[1]) / 7, 0, 1), ang = up * (Math.atan2(paw[1] - qy, paw[0] - qx) / RAD - 90);
      attr(h.paw, 'transform', 'translate(' + pt(paw[0] + 1.6, paw[1] + 0.3) + ') rotate(' + n2(ang) + ')');
      attr(h.paw, 'rx', d.pawRx); attr(h.paw, 'ry', d.pawRy);
    });

    /* tail: a chain of segments, the wag travels from base to tip */
    var TT = this.T, tn = TT.n, seg = TT.len * (0.7 + 0.3 * this.st.body) / tn;
    var tp = TT.pose, base = w0 * tp[0] + ws * tp[1] + wl * tp[2] + wb * tp[3];
    base += (P.tailBase || 0) * (w0 + wb * 0.5);
    var curl = br.tail === 'curl' ? 1 - 0.45 * (P.sad || 0) : 1, pts = [W(a.tail)], wagA = (P.wagAmp || 0) * (wl + ws > 0.5 ? 18 : 26), wph = P.wagPh || 0;
    for (var i = 1; i <= tn; i++) {
      var kk = i / tn, an = (base + TT.curve * curl * (i - 1) + wagA * Math.sin(wph - i * 0.5) * (0.35 + 0.65 * kk)) * RAD, pv = pts[i - 1];
      pts.push([pv[0] + Math.cos(an) * seg, pv[1] + Math.sin(an) * seg]);
    }
    var tw = 0.75 + 0.25 * this.st.head;
    attr(this.tail, 'd', taper(pts, TT.w0 * tw, TT.w1 * tw));
    if (this.tailTip) attr(this.tailTip, 'd', taper(pts, TT.w0 * tw, TT.w1 * tw, Math.round(tn * 0.62)));
    if (this.tailFeather) {
      var fp = pts.map(function (p, j) {
        var q = pts[Math.min(tn, j + 1)], o = pts[Math.max(0, j - 1)], dx2 = q[0] - o[0], dy2 = q[1] - o[1], ln = Math.hypot(dx2, dy2) || 1, s = lerp(TT.w0, TT.w1, j / tn) * tw * 0.28;
        return [p[0] + dy2 / ln * s, p[1] - dx2 / ln * s];
      });
      attr(this.tailFeather, 'd', taper(fp, TT.w0 * tw * 0.42, TT.w1 * tw * 0.5, 2));
    }

    /* shadow stays on the ground */
    var air = P.air || 0;
    attr(this.shadow, 'cx', n2(cx * fx)); attr(this.shadow, 'cy', n2(air - 0.5));
    attr(this.shadow, 'rx', n2((L * 1.1 + wl * 8) * (1 - clamp(air / 260, 0, 0.5)))); attr(this.shadow, 'ry', n2(4.6 * (1 - clamp(air / 260, 0, 0.5))));

    /* head group (not mirrored: the face always looks at you) */
    attr(this.head, 'transform', 'translate(' + pt(hc[0] * fx, hc[1]) + ') rotate(' + n2(tilt) + ')');
    var turn = clamp(P.headTurn || 0, -1, 1), tx = turn * R * 0.28, s = R / 27;
    var E = this.E, ea = E.at, earX = R * ea[0], earY = R * ea[1];
    var perk = P.perk == null ? 0.5 : P.perk, flap = P.earFlap || 0;
    var rest = E.front ? Math.min(E.rest + 4, E.rest - (perk - 0.5) * 24) : E.rest + (0.5 - perk) * 56;
    var gain = E.front ? 1 : 0.45;
    attr(this.earR, 'transform', 'translate(' + pt(earX * (1 - Math.max(0, turn) * 0.16) - tx * 0.3, earY) + ') rotate(' + n2(rest + ((P.earR || 0) + flap) * gain) + ')');
    attr(this.earL, 'transform', 'translate(' + pt(-earX * (1 - Math.max(0, -turn) * 0.16) - tx * 0.3, earY) + ') scale(-1 1) rotate(' + n2(rest + ((P.earL || 0) - flap) * gain) + ')');

    attr(this.muzzle, 'cx', n2(tx * 1.2)); attr(this.muzzle, 'cy', n2(R * 0.37));
    var bl = 0.16 + 0.5 * (P.blush == null ? 0.3 : P.blush);
    [[this.cheekL, -1], [this.cheekR, 1]].forEach(function (c) { attr(c[0], 'cx', n2(c[1] * R * 0.64 + tx * 0.8)); attr(c[0], 'cy', n2(R * 0.3)); attr(c[0], 'opacity', n2(bl)); });

    /* eyes: blink, happy arcs, sad puppy eyes, looking around */
    var happy = clamp(P.happy || 0, 0, 1), sad = clamp(P.sad || 0, 0, 1), big = P.eyeBig || 0;
    var open = clamp((P.eyeOpen == null ? 1 : P.eyeOpen) * (1 - happy), 0, 1);
    var ex = R * 0.37, ey = -R * 0.03 - big * 0.8, lx = (P.lookX || 0) * 1.5 * s, ly = (P.lookY || 0) * 1.3 * s;
    var ew = this.eyeRx * 0.95;
    [[this.eyeL, this.happyL, -1], [this.eyeR, this.happyR, 1]].forEach(function (e) {
      var sd = e[2], far = Math.max(0, sd * turn), x = sd * ex * (1 - far * 0.2) + tx + lx;
      var sc = 1 + big * 0.14 + sad * 0.06;
      attr(e[0], 'transform', 'translate(' + pt(x, ey + ly) + ') scale(' + n2(sc * (1 - far * 0.26)) + ' ' + n2(Math.max(0.06, open) * sc) + ')');
      attr(e[0], 'opacity', open < 0.1 ? 0 : 1);
      var shut = Math.max(happy, clamp(1 - open / 0.35, 0, 1));
      if (shut < 0.02) { attr(e[1], 'opacity', 0); return; }
      var cyv = lerp(3.2, -6, happy) * s, w2 = ew * (1 - far * 0.26) * 1.05, xx = sd * ex * (1 - far * 0.2) + tx, yy = ey + 1.2 * s;
      attr(e[1], 'd', 'M' + pt(xx - w2, yy) + 'Q' + pt(xx, yy + cyv) + ' ' + pt(xx + w2, yy));
      attr(e[1], 'opacity', n2(shut));
    });
    var browUp = big * 2.5 + (P.surprise || 0) * 3;
    [[this.browL, -1], [this.browR, 1]].forEach(function (e) {
      var sd = e[1], far = Math.max(0, sd * turn), bx = sd * ex * (1 - far * 0.2) + tx * 0.9, by = -R * 0.37 - browUp;
      var hl = br.maro ? 1.4 * s : 3.6 * s;
      var ox = bx + sd * hl, oy = by + sad * hl * 0.3, ix = bx - sd * hl, iy = by - sad * hl * 0.8;
      attr(e[0], 'd', 'M' + pt(ox, oy) + 'Q' + pt(bx, by - (br.maro ? 0.4 : 1.4) * s - sad * hl * 0.3) + ' ' + pt(ix, iy));
    });

    /* nose and mouth */
    var nx = tx * 1.35, ny = R * 0.2 + (P.sniff || 0) * 0.8;
    attr(this.nose, 'transform', 'translate(' + pt(nx, ny) + ')');
    var mx = tx * 1.3, my = ny + this.noseH / 2 + 1.4 * s, mo = clamp(P.mouth || 0, 0, 1);
    var frown = clamp((sad - 0.5) * 2, 0, 1) * (1 - clamp(P.mouth || 0, 0, 1));
    if (frown > 0.05) attr(this.mouth, 'd', 'M' + pt(mx, my - 1.4 * s) + 'L' + pt(mx, my + 1 * s) + 'M' + pt(mx - 5.5 * s, my + 5 * s) + 'Q' + pt(mx - 3 * s, my + lerp(5, 0.5, frown) * s) + ' ' + pt(mx, my + 1 * s) + 'Q' + pt(mx + 3 * s, my + lerp(5, 0.5, frown) * s) + ' ' + pt(mx + 5.5 * s, my + 5 * s));
    else attr(this.mouth, 'd', 'M' + pt(mx, my - 1.4 * s) + 'L' + pt(mx, my + 1 * s) + 'M' + pt(mx - 6 * s, my + 1.5 * s) + 'Q' + pt(mx - 3 * s, my + 5 * s) + ' ' + pt(mx, my + 1 * s) + 'Q' + pt(mx + 3 * s, my + 5 * s) + ' ' + pt(mx + 6 * s, my + 1.5 * s));
    var tear = clamp((P.tear || 0), 0, 1);
    attr(this.tear, 'opacity', n2(tear));
    if (tear > 0.02) attr(this.tear, 'transform', 'translate(' + pt(-ex + tx - this.eyeRx * 0.6, ey + this.eyeRy * 1.1 + tear * 5 * s) + ') scale(' + n2(0.7 * s + 0.2) + ')');
    if (mo > 0.04) {
      var mh = 13 * mo * s;
      attr(this.mouthIn, 'd', 'M' + pt(mx - 6.6 * s, my + 1.8 * s) + 'Q' + pt(mx, my + 3 * s) + ' ' + pt(mx + 6.6 * s, my + 1.8 * s) + 'Q' + pt(mx + 7.4 * s, my + 1.8 * s + mh) + ' ' + pt(mx, my + 2.4 * s + mh) + 'Q' + pt(mx - 7.4 * s, my + 1.8 * s + mh) + ' ' + pt(mx - 6.6 * s, my + 1.8 * s) + 'Z');
      attr(this.mouthIn, 'opacity', 1);
    } else attr(this.mouthIn, 'opacity', 0);
    var tg = clamp(P.tongue || 0, 0, 1), lick = clamp(P.lick || 0, 0, 1);
    if (lick > 0.03) {
      var lx2 = mx + 5.5 * s * lick, ly2 = my - 2.5 * s * lick;
      attr(this.tongue, 'd', 'M' + pt(mx - 2.5 * s, my + 2.5 * s) + 'Q' + pt(lx2 + 4 * s, my + 3 * s) + ' ' + pt(lx2, ly2) + 'Q' + pt(lx2 - 3 * s, ly2 + 2 * s) + ' ' + pt(mx - 2.5 * s, my + 2.5 * s) + 'Z');
      attr(this.tongue, 'opacity', 1);
    } else if (tg > 0.03) {
      var tl = (4 + 10 * tg) * s + mo * 4 * s, twd = 7.6 * s, wob = Math.sin(P.tongueWag || 0) * 1.2 * s, top = my + 2.2 * s + mo * 5 * s;
      attr(this.tongue, 'd', 'M' + pt(mx - twd / 2, top) + 'L' + pt(mx - twd / 2 + wob, top + tl - twd / 2) + 'A' + n2(twd / 2) + ' ' + n2(twd / 2) + ' 0 0 0 ' + pt(mx + twd / 2 + wob, top + tl - twd / 2) + 'L' + pt(mx + twd / 2, top) + 'Z');
      attr(this.tongue, 'opacity', 1);
    } else attr(this.tongue, 'opacity', 0);
    attr(this.ballMouth, 'transform', 'translate(' + pt(mx, my + 4 * s) + ')');
    attr(this.ballMouth, 'opacity', P.ball ? 1 : 0);
    attr(this.facewear, 'transform', 'translate(' + n2(tx) + ' 0)');
    if (this.dyn.head && this.dyn.head.swing) attr(this.dyn.head.swing, 'transform', this.dyn.head.base + ' rotate(' + n2(P.tassel || 0) + ')');

    /* where things are, for the scene (dog units, before the dog's own scale) */
    var mr = rotp(mx, my + 4 * s, tilt);
    this.out = { head: [hc[0] * fx, hc[1]], mouth: [hc[0] * fx + mr[0], hc[1] + mr[1]], body: [cx * fx, cy], R: R, L: L, tilt: tilt };
  };

  /* ready-made poses for still pictures */
  var STILL = {
    sit: { sit: 1, mouth: 0.3, tongue: 0.55, perk: 0.62, headTurn: 0.1, headTilt: -5, wagAmp: 0, blush: 0.45, tailBase: 12 },
    happy: { sit: 1, happy: 1, mouth: 0.42, tongue: 0.7, perk: 0.7, headTilt: 7, blush: 0.9, tailBase: 18 },
    stand: { mouth: 0.25, tongue: 0.45, perk: 0.6, headTurn: 0.25, tailBase: 14 },
    sad: { lie: 1, headRest: 0.55, sad: 1, eyeOpen: 0.9, eyeBig: 1, perk: 0, tailBase: -55, headTilt: -5, blush: 0.1 },
    sleep: { lie: 1, headRest: 1, eyeOpen: 0, perk: 0.15, tailBase: -30, blush: 0.4, breath: 0 }
  };

  /* =========================================================
     The garden: sky, hills, doghouse, bowls, day and night
     ========================================================= */
  var FOOD_X = 294, WATER_X = 342, BED_X = 122;
  var PAL = {
    night: { top: '#0E1A3B', bot: '#2C4175', far: '#22375F', near: '#1F4252', grass: '#285239', grass2: '#1E432F', tree: '#1C3A33', cloud: 0.18, stars: 1, sun: 0, moon: 1, tint: 0.24, fire: 1 },
    dawn: { top: '#7C9DE2', bot: '#FFCBA6', far: '#9EBA90', near: '#7CAB70', grass: '#86BF68', grass2: '#6DA855', tree: '#5E9A5A', cloud: 0.9, stars: 0.12, sun: 1, moon: 0, tint: 0.03, fire: 0 },
    day: { top: '#58B4F8', bot: '#D6F1FF', far: '#A5DA90', near: '#7FC96B', grass: '#88D26C', grass2: '#6FBC58', tree: '#5DB35A', cloud: 1, stars: 0, sun: 1, moon: 0, tint: 0, fire: 0 },
    dusk: { top: '#4F4AA0', bot: '#FFA07D', far: '#8B7EA7', near: '#678F6D', grass: '#6BA25B', grass2: '#588F4C', tree: '#4F7D55', cloud: 0.75, stars: 0.35, sun: 1, moon: 0, tint: 0.07, fire: 0.3 }
  };
  var KEYS = [[0, 'night'], [6.5, 'night'], [7.5, 'dawn'], [8.5, 'dawn'], [9.5, 'day'], [18.5, 'day'], [19.5, 'dusk'], [21.5, 'dusk'], [22.5, 'night'], [24, 'night']];
  function paletteAt(h) {
    var i = 0;
    while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
    var a = KEYS[i], b = KEYS[i + 1], t = b[0] > a[0] ? ease((h - a[0]) / (b[0] - a[0])) : 0, A = PAL[a[1]], B = PAL[b[1]], out = {};
    Object.keys(A).forEach(function (k) { out[k] = typeof A[k] === 'number' ? lerp(A[k], B[k], t) : mix(A[k], B[k], t); });
    return out;
  }
  function isNightHour(h) { return h >= 22 || h < 7; }

  function Scene(svg, pfx) {
    var s = this;
    var defs = el('defs', null, svg);
    var sky = el('linearGradient', { id: pfx + 'sky', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 40, x2: 0, y2: GROUND }, defs);
    s.skyTop = el('stop', { offset: '0' }, sky); s.skyBot = el('stop', { offset: '1' }, sky);
    var glow = el('radialGradient', { id: pfx + 'glow' }, defs);
    el('stop', { offset: '0', 'stop-color': '#FFF3B0', 'stop-opacity': '0.9' }, glow); el('stop', { offset: '1', 'stop-color': '#FFF3B0', 'stop-opacity': '0' }, glow);
    var ff = el('radialGradient', { id: pfx + 'ff' }, defs);
    el('stop', { offset: '0', 'stop-color': '#F4FF9A', 'stop-opacity': '1' }, ff); el('stop', { offset: '0.35', 'stop-color': '#DFFF5E', 'stop-opacity': '0.8' }, ff); el('stop', { offset: '1', 'stop-color': '#DFFF5E', 'stop-opacity': '0' }, ff);
    var g = s.g = el('g', null, svg);
    el('rect', { x: -800, y: -800, width: 2000, height: GROUND + 810, fill: 'url(#' + pfx + 'sky)' }, g);
    var skyL = s.skyLayer = el('g', null, g);
    s.stars = el('g', null, skyL);
    var rn = seeded(77), st = [];
    for (var i = 0; i < 40; i++) st.push({ e: el('circle', { cx: n2(rnd0(rn, -260, 660)), cy: n2(rnd0(rn, -120, 150)), r: n2(0.6 + rn() * 1.1), fill: '#fff' }, s.stars), ph: rn() * 6.3, sp: 0.8 + rn() * 2.2 });
    s.starList = st;
    s.sun = el('g', null, skyL);
    el('circle', { r: 34, fill: 'url(#' + pfx + 'glow)' }, s.sun);
    el('circle', { r: 15, fill: '#FFD76A', stroke: '#FFC23A', 'stroke-width': 2 }, s.sun);
    s.moon = el('g', null, skyL);
    el('circle', { r: 30, fill: 'url(#' + pfx + 'glow)', opacity: 0.5 }, s.moon);
    el('circle', { r: 12.5, fill: '#F6F1D8', stroke: '#E2DAB4', 'stroke-width': 1.5 }, s.moon);
    [[-4, -3, 2.6], [4, 2, 1.8], [-1, 5, 1.4]].forEach(function (c) { el('circle', { cx: c[0], cy: c[1], r: c[2], fill: '#E6DFBE' }, s.moon); });
    s.clouds = [];
    [[40, 84, 1], [230, 66, 0.8], [400, 100, 0.9]].forEach(function (c, i) {
      var cg = el('g', null, skyL);
      [[0, 0, 13], [14, -6, 16], [30, 0, 12], [15, 5, 12]].forEach(function (b) { el('circle', { cx: b[0], cy: b[1], r: b[2], fill: '#fff' }, cg); });
      s.clouds.push({ e: cg, x: c[0], y: c[1], s: c[2], v: 3 + i * 1.6 });
    });
    var farL = s.farLayer = el('g', null, g);
    s.far = el('path', { d: through([[-800, 196], [-300, 180], [-120, 190], [30, 170], [150, 186], [262, 164], [372, 182], [480, 170], [700, 190], [1200, 182]]) + 'L1200 ' + (GROUND + 12) + 'L-800 ' + (GROUND + 12) + 'Z' }, farL);
    s.trees = el('g', null, farL);
    [[330, 170, 1], [356, 176, 0.8], [168, 184, 0.75]].forEach(function (t) {
      var tg = el('g', { transform: 'translate(' + t[0] + ' ' + t[1] + ') scale(' + t[2] + ')' }, s.trees);
      el('rect', { x: -2, y: -4, width: 4, height: 12, rx: 1.5, fill: '#8A6446' }, tg);
      el('circle', { cx: 0, cy: -12, r: 9 }, tg); el('circle', { cx: -6, cy: -6, r: 7 }, tg); el('circle', { cx: 6, cy: -6, r: 7 }, tg);
    });
    s.nearLayer = el('g', null, g);
    s.near = el('path', { d: through([[-800, 218], [-200, 212], [0, 206], [100, 216], [210, 208], [320, 218], [430, 208], [620, 216], [1200, 212]]) + 'L1200 ' + (GROUND + 12) + 'L-800 ' + (GROUND + 12) + 'Z' }, s.nearLayer);
    s.ground = el('rect', { x: -800, y: GROUND - 3, width: 2000, height: 900 }, g);
    s.ground2 = el('rect', { x: -800, y: 286, width: 2000, height: 900, opacity: 0.55 }, g);
    s.edge = el('path', { d: 'M-800 ' + (GROUND - 1) + through([[-800, GROUND - 1], [-20, GROUND - 3], [60, GROUND - 1], [160, GROUND - 4], [260, GROUND - 1], [360, GROUND - 3], [460, GROUND - 1], [1200, GROUND - 2]], false) + 'L1200 ' + (GROUND + 4) + 'L-800 ' + (GROUND + 4) + 'Z' }, g);
    /* grass tufts and flowers that sway */
    s.sway = [];
    [[20, 268], [98, 280], [176, 266], [238, 284], [318, 270], [388, 282], [150, 292], [270, 296]].forEach(function (t, i) {
      var tg = el('g', { transform: 'translate(' + t[0] + ' ' + t[1] + ')' }, g);
      var e = el('path', { d: 'M-4 0Q-4 -6 -6 -9Q-2 -5 -1 -1Q0 -8 1 -11Q2 -6 1.5 -1Q3 -6 6 -8Q4 -4 4 0Z' }, tg);
      s.sway.push({ e: e, ph: i * 1.3, a: 5, grass: true });
    });
    [[36, 276, '#FF7EB6'], [212, 290, '#FFD54A'], [372, 272, '#B69CFF'], [160, 268, '#FF9B5E']].forEach(function (f, i) {
      var fg = el('g', { transform: 'translate(' + f[0] + ' ' + f[1] + ')' }, g);
      var e = el('g', null, fg);
      el('path', { d: 'M0 0Q1 -5 0 -10', fill: 'none', stroke: '#4E9A45', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, e);
      var head = el('g', { transform: 'translate(0 -11)' }, e);
      for (var k = 0; k < 5; k++) { var a = k * 72 * RAD; el('circle', { cx: n2(Math.cos(a) * 3), cy: n2(Math.sin(a) * 3), r: 2.6, fill: f[2] }, head); }
      el('circle', { r: 2, fill: '#FFF1A8' }, head);
      s.sway.push({ e: e, ph: i * 2.1, a: 7 });
    });
    /* doghouse with the pet's name */
    var dh = el('g', { transform: 'translate(0 2)' }, g);
    el('ellipse', { cx: 58, cy: GROUND + 1, rx: 44, ry: 5, fill: '#000', opacity: 0.12 }, dh);
    el('path', { d: 'M24 ' + GROUND + 'L24 196L58 170L92 196L92 ' + GROUND + 'Z', fill: '#DDA66E', stroke: '#8A5A33', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, dh);
    el('path', { d: 'M25 210H91M25 224H91M25 238H91', stroke: '#C48D57', 'stroke-width': 1.4 }, dh);
    el('path', { d: 'M15 201L58 164L101 201', fill: 'none', stroke: '#9E2F2A', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dh);
    el('path', { d: 'M15 201L58 164L101 201', fill: 'none', stroke: '#E0584F', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dh);
    el('path', { d: 'M42 ' + GROUND + 'L42 219A16 16 0 0 1 74 219L74 ' + GROUND + 'Z', fill: '#4A2E22', stroke: '#8A5A33', 'stroke-width': 2 }, dh);
    el('rect', { x: 36, y: 181, width: 44, height: 13, rx: 3.5, fill: '#FFF3DD', stroke: '#8A5A33', 'stroke-width': 1.6 }, dh);
    s.sign = el('text', { x: 58, y: 190.8, 'text-anchor': 'middle', 'font-size': 8.4, 'font-weight': 700, fill: '#6B4226', 'font-family': '-apple-system, system-ui, sans-serif' }, dh);
    /* bed */
    var bed = el('g', { transform: 'translate(' + BED_X + ' ' + (LANE + 2) + ')' }, g);
    el('ellipse', { cx: 0, cy: 6, rx: 44, ry: 5, fill: '#000', opacity: 0.12 }, bed);
    el('path', { d: 'M-40 -3Q-42 8 -30 9L30 9Q42 8 40 -3Z', fill: '#5C83CF', stroke: '#3F5FA3', 'stroke-width': 2, 'stroke-linejoin': 'round' }, bed);
    el('ellipse', { cx: 0, cy: -3, rx: 40, ry: 9, fill: '#7FA3EA', stroke: '#3F5FA3', 'stroke-width': 2 }, bed);
    el('ellipse', { cx: 0, cy: -3.5, rx: 30, ry: 5.6, fill: '#B8D0FF', stroke: '#6D8FD8', 'stroke-width': 1.4 }, bed);
    el('path', { d: 'M-33 1Q0 8 33 1', fill: 'none', stroke: '#9DBBF7', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, bed);
    /* bowls */
    s.food = bowl(g, FOOD_X, '#FF5B60', '#B03A3E', '#FF8F92');
    s.kibble = el('g', { opacity: 0 }, s.food);
    [[-9, -11], [-4, -12.5], [1, -11.5], [6, -12.8], [10, -11], [-6, -13.8], [3, -14.4], [-1, -15.5]].forEach(function (k, i) {
      el('ellipse', { cx: k[0], cy: k[1], rx: 3, ry: 2.2, fill: i % 2 ? '#B9763B' : '#9A5F2E', stroke: '#6E4020', 'stroke-width': 0.8 }, s.kibble);
    });
    s.kibbleList = Array.prototype.slice.call(s.kibble.childNodes);
    s.water = bowl(g, WATER_X, '#3D8CF5', '#1E5BB3', '#78B2FF');
    s.waterTop = el('ellipse', { cx: 0, cy: -9.6, rx: 13.2, ry: 2.4, fill: '#9BDBFF', opacity: 0 }, s.water);
    s.waterShine = el('path', { d: 'M-6 -10.2L-1 -10.2', stroke: '#fff', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0 }, s.water);
    s.tint = el('rect', { x: -800, y: -800, width: 2000, height: 2000, fill: '#0A1238', opacity: 0 }, svg);
    s.flies = [];
    var fl = el('g', null, svg);
    for (var j = 0; j < 7; j++) s.flies.push({ e: el('circle', { r: 5, fill: 'url(#' + pfx + 'ff)', opacity: 0 }, fl), ph: j * 0.9, x0: 40 + j * 50, y0: 190 + (j % 3) * 18 });
    s.food.level = 0; s.water.level = 0;
    s.lastPal = -1;
  }
  function rnd0(rn, a, b) { return a + rn() * (b - a); }
  function bowl(g, x, fill, stroke, rim) {
    var b = el('g', { transform: 'translate(' + x + ' ' + (LANE + 5) + ')' }, g);
    el('ellipse', { cx: 0, cy: 4.5, rx: 20, ry: 3.6, fill: '#000', opacity: 0.13 }, b);
    el('path', { d: 'M-17 -9L17 -9Q15.5 3 10 4.2L-10 4.2Q-15.5 3 -17 -9Z', fill: fill, stroke: stroke, 'stroke-width': 2, 'stroke-linejoin': 'round' }, b);
    el('ellipse', { cx: 0, cy: -9, rx: 17, ry: 3.8, fill: rim, stroke: stroke, 'stroke-width': 2 }, b);
    el('ellipse', { cx: 0, cy: -9.2, rx: 13.4, ry: 2.5, fill: mix(stroke, '#000', 0.25) }, b);
    var paw = el('g', { transform: 'translate(0 -2) scale(0.55)', fill: '#fff', opacity: 0.75 }, b);
    el('ellipse', { cx: 0, cy: 2.5, rx: 4.5, ry: 3.6 }, paw);
    [[-5, -2.5], [-1.8, -5], [1.8, -5], [5, -2.5]].forEach(function (t) { el('circle', { cx: t[0], cy: t[1], r: 1.8 }, paw); });
    return b;
  }
  Scene.prototype.paint = function (hour) {
    var p = paletteAt(hour), s = this;
    attr(s.skyTop, 'stop-color', p.top); attr(s.skyBot, 'stop-color', p.bot);
    attr(s.far, 'fill', p.far); attr(s.near, 'fill', p.near); attr(s.ground, 'fill', p.grass); attr(s.ground2, 'fill', p.grass2); attr(s.edge, 'fill', p.grass);
    attr(s.trees, 'fill', p.tree);
    s.sway.forEach(function (w) { if (w.grass) attr(w.e, 'fill', p.grass2); });
    attr(s.stars, 'opacity', n2(p.stars));
    var dayT = clamp((hour - 7) / 15, 0, 1), nightT = ((hour + 24 - 21) % 24) / 10;
    attr(s.sun, 'transform', 'translate(' + pt(lerp(36, 364, dayT), 160 - Math.sin(dayT * Math.PI) * 88) + ')');
    attr(s.sun, 'opacity', n2(p.sun * (hour > 6.6 && hour < 22 ? 1 : 0)));
    attr(s.moon, 'transform', 'translate(' + pt(lerp(40, 360, clamp(nightT, 0, 1)), 150 - Math.sin(clamp(nightT, 0, 1) * Math.PI) * 76) + ')');
    attr(s.moon, 'opacity', n2(p.moon));
    s.clouds.forEach(function (c) { attr(c.e, 'opacity', n2(p.cloud * 0.95)); });
    attr(s.tint, 'opacity', n2(p.tint));
    s.pal = p;
  };
  Scene.prototype.tick = function (dt, t) {
    var s = this;
    s.clouds.forEach(function (c) {
      c.x += c.v * dt; if (c.x > 520) c.x = -140;
      attr(c.e, 'transform', 'translate(' + pt(c.x, c.y) + ') scale(' + c.s + ')');
    });
    s.sway.forEach(function (w) { attr(w.e, 'transform', 'rotate(' + n2(Math.sin(t * 1.3 + w.ph) * w.a) + ')'); });
    var p = s.pal || {};
    if (p.stars > 0.05) s.starList.forEach(function (x) { attr(x.e, 'opacity', n2(0.45 + 0.55 * Math.abs(Math.sin(t * x.sp + x.ph)))); });
    var fo = p.fire || 0;
    s.flies.forEach(function (f, i) {
      if (fo < 0.05) { attr(f.e, 'opacity', 0); return; }
      var x = f.x0 + Math.sin(t * 0.37 + f.ph) * 26 + Math.sin(t * 0.9 + i) * 8, y = f.y0 + Math.sin(t * 0.51 + f.ph * 2) * 14;
      attr(f.e, 'transform', 'translate(' + pt(x, y) + ')');
      attr(f.e, 'opacity', n2(fo * (0.25 + 0.75 * Math.max(0, Math.sin(t * 1.7 + f.ph * 3)))));
    });
  };
  Scene.prototype.setName = function (name) { this.sign.textContent = name; attr(this.sign, 'font-size', n2(clamp(62 / Math.max(4, name.length * 0.62), 6, 9))); };
  Scene.prototype.setFood = function (v) {
    this.food.level = v;
    var n = Math.round(clamp(v, 0, 1) * this.kibbleList.length);
    attr(this.kibble, 'opacity', n ? 1 : 0);
    this.kibbleList.forEach(function (k, i) { attr(k, 'opacity', i < n ? 1 : 0); });
  };
  Scene.prototype.setWater = function (v) {
    this.water.level = v; v = clamp(v, 0, 1);
    attr(this.waterTop, 'opacity', v > 0.02 ? 1 : 0); attr(this.waterShine, 'opacity', v > 0.2 ? 0.8 : 0);
    attr(this.waterTop, 'rx', n2(8 + 5.2 * v)); attr(this.waterTop, 'cy', n2(-7.5 - 2.3 * v));
  };

  /* =========================================================
     The live pet: state, springs, particles, ball, input
     ========================================================= */
  var BLINK = 0.3;   /* seconds, eyes shut and open again */
  var TAU = { sit: 0.16, lie: 0.22, bow: 0.13, crouch: 0.06, tuck: 0.06, lean: 0.2, headTurn: 0.12, headTilt: 0.14, headDown: 0.13, headRest: 0.35, headUp: 0.15,
    lookX: 0.08, lookY: 0.08, eyeOpen: 0.05, happy: 0.1, sad: 0.5, eyeBig: 0.3, surprise: 0.08, mouth: 0.05, tongue: 0.1, lick: 0.05, blush: 0.3, perk: 0.15,
    tailBase: 0.25, wagAmp: 0.2, wagSpeed: 0.25, pawLift: 0.1, scratch: 0.08, dig: 0.08, sniff: 0.05, gait: 0.12, dig2: 0.1 };
  function neutral() {
    return { sit: 0, lie: 0, bow: 0, crouch: 0, tuck: 0, lean: 0, headTurn: 0, headTilt: 0, headDown: 0, headRest: 0, headUp: 0, lookX: 0, lookY: 0, eyeOpen: 1, happy: 0, sad: 0, eyeBig: 0, surprise: 0,
      mouth: 0, tongue: 0, lick: 0, blush: 0.3, perk: 0.55, tailBase: 8, wagAmp: 0.45, wagSpeed: 1, pawLift: 0, scratch: 0, dig: 0, sniff: 0, gait: 0 };
  }
  var HEART = 'M0 3.6C-5.6 -0.4 -4.6 -6.2 0 -3.3C4.6 -6.2 5.6 -0.4 0 3.6Z';
  var STAR = 'M0 -5.5L1.4 -1.4L5.5 0L1.4 1.4L0 5.5L-1.4 1.4L-5.5 0L-1.4 -1.4Z';
  var DROP = 'M0 -4.2C2.4 -1.2 3 0.8 3 2A3 3 0 0 1 -3 2C-3 0.8 -2.4 -1.2 0 -4.2Z';

  function Pet(host, o) {
    var self = this;
    this.host = host; this.o = o || {};
    this.clock = typeof this.o.now === 'function' ? this.o.now : function () { return Date.now(); };
    this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.pfx = 'pm' + (++UID) + '-';
    var svg = this.svg = el('svg', { viewBox: '0 52 400 250', preserveAspectRatio: 'xMidYMax meet', 'class': 'pet-svg', 'aria-hidden': 'true' });
    host.appendChild(svg);
    this.scene = new Scene(svg, this.pfx);
    this.world = el('g', null, svg);
    this.ballShadow = el('ellipse', { rx: 6, ry: 1.8, fill: '#000', opacity: 0 }, this.world);
    this.dogG = el('g', null, this.world);
    this.ballG = el('g', { opacity: 0 }, this.world); drawBall(this.ballG, 6.5);
    this.treatG = el('g', { opacity: 0 }, this.world);
    el('path', { d: 'M-7 -2.2A2.8 2.8 0 1 1 -4.6 -4.4L4.6 -4.4A2.8 2.8 0 1 1 7 -2.2A2.8 2.8 0 1 1 4.6 0L-4.6 0A2.8 2.8 0 1 1 -7 -2.2Z', transform: 'translate(0 2.2)', fill: '#F3C98B', stroke: '#A8753D', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, this.treatG);
    this.flyG = el('g', { opacity: 0 }, this.world);
    this.flyL = el('ellipse', { cx: -3.2, cy: -1, rx: 4, ry: 5.4, fill: '#FFB14E', stroke: '#C9761E', 'stroke-width': 1 }, this.flyG);
    this.flyR = el('ellipse', { cx: 3.2, cy: -1, rx: 4, ry: 5.4, fill: '#FF8A65', stroke: '#C9561E', 'stroke-width': 1 }, this.flyG);
    el('path', { d: 'M0 -4L0 4', stroke: '#4A3426', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, this.flyG);
    this.fxG = el('g', null, svg);
    this.frontTint = el('rect', { x: -800, y: -800, width: 2000, height: 2000, fill: '#0A1238', opacity: 0, 'pointer-events': 'none' }, svg);
    this.x = 190; this.face = 1; this.faceX = 1; this.air = 0; this.vUp = 0; this.sq = 1; this.sqV = 0;
    this.T = neutral(); this.P = neutral(); this.P.faceX = 1;
    this.ph = { gait: 0, wag: 0, breath: 0, dig: 0, scratch: 0, tongue: 0, chew: 0 };
    this.ears = { r: 0, rv: 0, l: 0, lv: 0 }; this.tassel = { a: 0, v: 0 };
    this.lag = { x: 0, vx: 0, y: 0, vy: 0 }; this.prevHead = null; this.prevX = this.x;
    this.blink = { next: rnd(2, 4), left: 0, gap: 0, again: false };
    this.fx = []; this.bubble = null;
    this.ball = { on: false, state: 'none', x: 0, y: 0, vx: 0, vy: 0, spin: 0, ready: false, a: 0 };
    this.fly = { on: false, x: 0, y: 0, a: 0, t: 0 };
    this.treat = { on: false, x: 0, y: 0, vy: 0, a: 0, falling: false };
    this.mood = this.o.mood || 'happy'; this.needs = this.o.needs || { food: 1, water: 1, fun: 1 };
    this.name = this.o.name || '';
    this.t = 0; this.script = null; this.kind = ''; this.queue = []; this.last = ''; this.playing = false;
    this.awakeUntil = 0; this.sleeping = false; this.wet = 0;
    this.petting = { down: false, active: 0, acc: 0, hearts: 0, moved: 0, x: 0, y: 0, t0: 0, total: 0 };
    this.attn = null;
    this.setLook(this.o.look);
    this.scene.setName(this.name);
    this.paintSky(true);
    this.bindInput();
    this.alive = true;
    this.frameFn = function (ts) { self.frame(ts); };
    this.onVis = function () { if (!document.hidden) self.resume(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.pose();
    this.camera(0);
    this.resume();
  }
  Pet.prototype.hour = function () { var d = new Date(this.clock()); return d.getHours() + d.getMinutes() / 60; };
  Pet.prototype.isNight = function () { return isNightHour(this.hour()); };
  Pet.prototype.paintSky = function (force) {
    var h = this.hour(), key = Math.round(h * 12);
    if (!force && key === this.scene.lastPal) return;
    this.scene.lastPal = key; this.scene.paint(h);
    attr(this.frontTint, 'opacity', n2(this.scene.pal.tint * 0.4));
  };
  Pet.prototype.setLook = function (look) {
    look = look || {};
    var key = [look.breed, look.coat, look.stage].join('|');
    if (this.dog && this.lookKey === key) { this.dog.setWear(look.wear || {}); this.look = look; return; }
    if (this.dog) this.dogG.removeChild(this.dog.g);
    this.look = look; this.lookKey = key;
    this.dog = new Dog(this.dogG, look, this.pfx + 'd' + (++UID) + '-');
    this.S = this.dog.st.scale * 0.92;
    this.pose();
  };
  Pet.prototype.setName = function (n) { this.name = n; this.scene.setName(n); };
  Pet.prototype.resume = function () {
    if (!this.alive || this.raf) return;
    this.lastTs = 0;
    this.raf = requestAnimationFrame(this.frameFn);
  };
  Pet.prototype.destroy = function () {
    this.alive = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
  };
  Pet.prototype.frame = function (ts) {
    this.raf = 0;
    if (!this.alive) return;
    if (document.hidden || !this.host.isConnected) return;
    var dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 1 / 60;
    this.lastTs = ts;
    this.t += dt;
    this.step(dt);
    this.raf = requestAnimationFrame(this.frameFn);
  };
  /* the camera: closer on small screens and for small puppies, and it follows the puppy */
  Pet.prototype.camera = function (dt) {
    var w = this.host.clientWidth || 400, k = clamp((this.dog.st.scale - 0.62) / 0.38, 0, 1);
    var W = (w < 560 ? 300 : 400) * lerp(0.84, 1, k), H = W / 1.6;
    var focus = this.ball.on && this.ball.state === 'air' ? lerp(this.x, this.ball.x, 0.35) : this.x + this.face * 16;
    var target = clamp(focus, W / 2, 400 - W / 2);
    this.camX = this.camX == null || dt === 0 ? target : this.camX + (target - this.camX) * (1 - Math.exp(-dt / 0.7));
    var x0 = this.camX - W / 2, y0 = 302 - H, key = n2(x0) + ' ' + n2(y0) + ' ' + n2(W) + ' ' + n2(H);
    if (key === this.vbKey) return;
    this.vbKey = key;
    attr(this.svg, 'viewBox', key);
    var dx = this.camX - 200, sc = this.scene;
    attr(sc.skyLayer, 'transform', 'translate(' + pt(dx * 0.85, (y0 - 52) * 0.9) + ')');
    attr(sc.farLayer, 'transform', 'translate(' + n2(dx * 0.45) + ' 0)');
    attr(sc.nearLayer, 'transform', 'translate(' + n2(dx * 0.2) + ' 0)');
  };
  Pet.prototype.step = function (dt) {
    this.think(dt);
    this.physics(dt);
    this.pose();
    this.camera(dt);
    this.scene.tick(dt, this.t);
    this.tickFx(dt);
    if ((this.t | 0) !== this.lastPaintT) { this.lastPaintT = this.t | 0; if (this.lastPaintT % 5 === 0) this.paintSky(); }
  };

  /* ---------- springs and physics ---------- */
  Pet.prototype.physics = function (dt) {
    var P = this.P, T = this.T, k;
    for (k in TAU) if (T[k] !== undefined) P[k] += (T[k] - P[k]) * (1 - Math.exp(-dt / TAU[k]));
    this.faceX += (this.face - this.faceX) * (1 - Math.exp(-dt / 0.055));
    var ph = this.ph;
    ph.wag += dt * P.wagSpeed * 13;
    ph.breath += dt * (this.sleeping ? 1.5 : 2.5 + P.gait * 1.2);
    ph.gait += dt * (P.gait <= 1 ? 11 * Math.max(0.35, P.gait) : 11 + 6 * (P.gait - 1));
    ph.dig += dt * 17; ph.scratch += dt * 19; ph.tongue += dt * 9;
    /* jumping */
    if (this.air > 0 || this.vUp > 0) {
      this.vUp -= GRAV * dt; this.air += this.vUp * dt;
      if (this.air <= 0) { this.air = 0; if (this.vUp < -60) this.sqV -= Math.min(4.5, -this.vUp * 0.012); this.vUp = 0; this.landed = true; }
    }
    /* squash and stretch, ears, tassel, head lag: small steps keep the springs steady */
    var steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps, E = this.dog.E, ears = this.ears;
    var head = this.dog.out ? this.dog.out.head : [0, 0], hx = this.x + head[0] * this.S, hy = LANE - this.air + head[1] * this.S;
    var vx = 0, vy = 0;
    if (this.prevHead && dt > 0) { vx = (hx - this.prevHead[0]) / dt; vy = (hy - this.prevHead[1]) / dt; }
    this.prevHead = [hx, hy];
    vx = clamp(vx, -400, 400); vy = clamp(vy, -400, 400);
    var tR = clamp(vx * 0.13 - vy * 0.1, -40, 40), tL = clamp(-vx * 0.13 - vy * 0.1, -40, 40);
    var bodyV = clamp((this.x - this.prevX) / Math.max(dt, 1e-3), -300, 300); this.prevX = this.x;
    for (var i = 0; i < steps; i++) {
      this.sqV += (-(this.sq - 1) * 360 - this.sqV * 15) * h; this.sq += this.sqV * h;
      ears.rv += ((tR - ears.r) * E.k - ears.rv * E.c) * h; ears.r += ears.rv * h;
      ears.lv += ((tL - ears.l) * E.k - ears.lv * E.c) * h; ears.l += ears.lv * h;
      this.tassel.v += ((clamp(-vx * 0.2, -50, 50) - this.tassel.a) * 90 - this.tassel.v * 6) * h; this.tassel.a += this.tassel.v * h;
      var lt = clamp(this.vUp * 0.012, -6, 6), lx = clamp(-bodyV * 0.02, -5, 5);
      this.lag.vy += ((lt - this.lag.y) * 220 - this.lag.vy * 16) * h; this.lag.y += this.lag.vy * h;
      this.lag.vx += ((lx - this.lag.x) * 180 - this.lag.vx * 15) * h; this.lag.x += this.lag.vx * h;
    }
    this.sq = clamp(this.sq, 0.72, 1.3);
    /* blinking: one slow blink every 3 to 7.5 seconds, and now and then a double blink */
    var b = this.blink;
    if (b.left > 0) {
      b.left = Math.max(0, b.left - dt);
      if (b.left === 0 && b.again) { b.again = false; b.gap = 0.16; }
    } else if (b.gap > 0) {
      b.gap = Math.max(0, b.gap - dt);
      if (b.gap === 0) b.left = BLINK;
    } else {
      b.next -= dt;
      if (b.next <= 0) { b.left = BLINK; b.next = rnd(3, 7.5); b.again = chance(0.15); }
    }
    this.updateBall(dt); this.updateFly(dt); this.updateTreat(dt);
    this.petTick(dt);
  };
  Pet.prototype.pose = function () {
    if (!this.dog) return;
    /* a blink closes quickly and opens slowly */
    var P = this.P, ph = this.ph, b = this.blink, bk = b.left > 0 ? 1 - b.left / BLINK : 0;
    var blinkMul = bk <= 0 ? 1 : 1 - (bk < 0.35 ? ease(bk / 0.35) : 1 - ease((bk - 0.35) / 0.65));
    var Q = {
      faceX: this.faceX, sit: P.sit, lie: P.lie, bow: P.bow, crouch: P.crouch, tuck: P.tuck, lean: P.lean, shake: this.shakeRot || 0,
      breath: Math.sin(ph.breath) * (this.sleeping ? 1.6 : 1), gait: P.gait, gaitPh: ph.gait, dig: P.dig, digPh: ph.dig, scratch: P.scratch, scratchPh: ph.scratch, pawLift: P.pawLift,
      headTurn: P.headTurn, headTilt: P.headTilt + (this.tiltAdd || 0), headDown: P.headDown, headRest: P.headRest, headUp: P.headUp, nod: this.nod || 0, lagX: this.lag.x, lagY: this.lag.y,
      eyeOpen: P.eyeOpen * blinkMul, happy: P.happy, sad: P.sad, lookX: P.lookX, lookY: P.lookY, eyeBig: P.eyeBig, surprise: P.surprise,
      mouth: P.mouth + (this.chew || 0), tongue: P.tongue, tongueWag: ph.tongue, lick: P.lick, blush: P.blush, sniff: P.sniff * Math.sin(this.t * 38),
      earR: this.ears.r, earL: this.ears.l, perk: P.perk, earFlap: this.earFlap || 0, tailBase: P.tailBase, wagAmp: P.wagAmp, wagPh: ph.wag,
      tassel: this.tassel.a, ball: this.ball.state === 'mouth' ? 1 : 0, air: this.air / this.S, tear: this.tearK || 0
    };
    this.dog.pose(Q);
    var sx = 1 / Math.sqrt(this.sq);
    attr(this.dogG, 'transform', 'translate(' + pt(this.x, LANE - this.air) + ') scale(' + n2(this.S * sx) + ' ' + n2(this.S * this.sq) + ')');
  };
  /* dog units to the scene */
  Pet.prototype.toScene = function (p) { return [this.x + p[0] * this.S, LANE - this.air + p[1] * this.S]; };
  Pet.prototype.headPos = function () { return this.toScene(this.dog.out.head); };
  Pet.prototype.mouthPos = function () { return this.toScene(this.dog.out.mouth); };
  Pet.prototype.onDog = function (x, y) {
    var h = this.headPos(), R = this.dog.out.R * this.S, b = this.toScene(this.dog.out.body), L = this.dog.out.L * this.S;
    if (Math.hypot(x - h[0], y - h[1]) < R * 1.25) return 'head';
    if (Math.abs(x - b[0]) < L * 1.15 && Math.abs(y - b[1]) < 26 * this.S) return 'body';
    return '';
  };

  /* ---------- particles and speech bubbles ---------- */
  Pet.prototype.emit = function (type, x, y, o) {
    if (this.fx.length > 70) return;
    if (this.reduce && type !== 'heart' && type !== 'z' && chance(0.6)) return;
    o = o || {};
    var e, p = { x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, life: o.life || 1, age: 0, rot: o.rot || 0, vr: o.vr || 0, s0: o.s0 || 1, s1: o.s1 == null ? 1 : o.s1, drag: o.drag || 0, wob: o.wob || 0 };
    if (type === 'heart') e = el('path', { d: HEART, fill: o.color || '#FF4F7B', stroke: '#C92C58', 'stroke-width': 0.8 }, this.fxG);
    else if (type === 'star') e = el('path', { d: STAR, fill: o.color || '#FFD54A' }, this.fxG);
    else if (type === 'drop') e = el('path', { d: DROP, fill: '#6CC3FF', stroke: '#2F86D6', 'stroke-width': 0.7 }, this.fxG);
    else if (type === 'dot') e = el('circle', { r: o.r || 1.8, fill: o.color || '#9A5F2E' }, this.fxG);
    else if (type === 'confetti') e = el('rect', { x: -2, y: -1.2, width: 4, height: 2.4, rx: 0.6, fill: o.color || '#FF5FA2' }, this.fxG);
    else if (type === 'text') { e = el('text', { 'text-anchor': 'middle', 'font-size': o.size || 12, 'font-weight': 800, fill: o.color || '#fff', stroke: o.stroke || 'none', 'stroke-width': o.stroke ? 2.6 : 0, 'paint-order': 'stroke', 'font-family': '-apple-system, system-ui, sans-serif' }, this.fxG); e.textContent = o.text; }
    else if (type === 'z') { e = el('text', { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#fff', stroke: '#5B6FB8', 'stroke-width': 2.4, 'paint-order': 'stroke', 'font-family': '-apple-system, system-ui, sans-serif' }, this.fxG); e.textContent = 'z'; }
    else return;
    p.e = e;
    this.fx.push(p);
  };
  Pet.prototype.tickFx = function (dt) {
    var keep = [];
    for (var i = 0; i < this.fx.length; i++) {
      var p = this.fx[i];
      p.age += dt;
      if (p.age >= p.life) { if (p.e.parentNode) p.e.parentNode.removeChild(p.e); continue; }
      p.vy += p.g * dt; if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      var k = p.age / p.life, s = lerp(p.s0, p.s1, k), op = k > 0.7 ? 1 - (k - 0.7) / 0.3 : Math.min(1, p.age / 0.08);
      attr(p.e, 'transform', 'translate(' + pt(p.x + (p.wob ? Math.sin(p.age * 6) * p.wob : 0), p.y) + ') rotate(' + n2(p.rot) + ') scale(' + n2(s) + ')');
      attr(p.e, 'opacity', n2(op));
      keep.push(p);
    }
    this.fx = keep;
    var bb = this.bubble;
    if (bb) {
      bb.age += dt;
      if (bb.age > bb.life) { if (bb.g.parentNode) bb.g.parentNode.removeChild(bb.g); this.bubble = null; }
      else {
        var h = this.headPos(), R = this.dog.out.R * this.S, k2 = bb.age / bb.life;
        var sc = bb.age < 0.12 ? 0.6 + bb.age / 0.12 * 0.4 : 1;
        attr(bb.g, 'transform', 'translate(' + pt(clamp(h[0] + R * 0.9, 40, 360), h[1] - R * 1.55) + ') scale(' + n2(sc) + ')');
        attr(bb.g, 'opacity', n2(k2 > 0.8 ? 1 - (k2 - 0.8) / 0.2 : 1));
      }
    }
  };
  Pet.prototype.say = function (text, life) {
    if (this.bubble && this.bubble.g.parentNode) this.bubble.g.parentNode.removeChild(this.bubble.g);
    var g = el('g', null, this.fxG), w = Math.max(24, text.length * 7 + 14);
    el('rect', { x: n2(-w / 2), y: -25, width: n2(w), height: 19, rx: 9.5, fill: '#fff', stroke: '#2B2B33', 'stroke-width': 1.6 }, g);
    el('path', { d: 'M' + pt(-w / 2 + 8, -6.8) + 'L' + pt(-w / 2 + 3, 1.5) + 'L' + pt(-w / 2 + 15, -6.8), fill: '#fff', stroke: '#2B2B33', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M' + pt(-w / 2 + 8.8, -6.9) + 'L' + pt(-w / 2 + 14.2, -6.9), stroke: '#fff', 'stroke-width': 2.6 }, g);
    var t = el('text', { x: 0, y: -11.6, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#2B2B33', 'font-family': '-apple-system, system-ui, sans-serif' }, g);
    t.textContent = text;
    this.bubble = { g: g, age: 0, life: life || 1.4 };
  };
  Pet.prototype.hearts = function (x, y, n) {
    for (var i = 0; i < (n || 1); i++) this.emit('heart', x + rnd(-6, 6), y + rnd(-4, 2), { vy: rnd(-46, -30), vx: rnd(-14, 14), life: rnd(1, 1.5), s0: 0.6, s1: 1.25, wob: 3 });
  };
  Pet.prototype.sparkle = function (x, y, n, spread) {
    for (var i = 0; i < n; i++) this.emit('star', x + rnd(-spread, spread), y + rnd(-spread, spread) * 0.7, { life: rnd(0.5, 0.9), s0: 0.2, s1: 1.1, vr: rnd(-120, 120), vy: rnd(-20, -5) });
  };

  /* ---------- ball ---------- */
  var BALL_R = 6.5, BALL_FLOOR = LANE + 2 - BALL_R;
  Pet.prototype.showBall = function (x, y, vx, vy) {
    var b = this.ball;
    b.on = true; b.state = 'air'; b.x = x; b.y = y; b.vx = vx || 0; b.vy = vy || 0; b.ready = false; b.a = 1;
  };
  Pet.prototype.hideBall = function () { this.ball.on = false; this.ball.state = 'none'; attr(this.ballG, 'opacity', 0); attr(this.ballShadow, 'opacity', 0); };
  Pet.prototype.updateBall = function (dt) {
    var b = this.ball;
    if (!b.on) return;
    if (b.state === 'air' || b.state === 'ground') {
      if (b.state === 'air') {
        b.vy += GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y >= BALL_FLOOR) {
          b.y = BALL_FLOOR;
          if (b.vy > 90) { b.vy = -b.vy * 0.52; b.vx *= 0.8; this.emit('dot', b.x, b.y + BALL_R, { vx: -20, vy: -30, g: 300, life: 0.4, color: '#8DB76B', r: 1.3 }); this.emit('dot', b.x, b.y + BALL_R, { vx: 20, vy: -30, g: 300, life: 0.4, color: '#8DB76B', r: 1.3 }); }
          else { b.vy = 0; b.state = 'ground'; if (b.dropped) { b.ready = true; b.dropped = false; } }
        }
      } else {
        b.x += b.vx * dt; b.vx *= Math.max(0, 1 - 2.6 * dt);
        if (Math.abs(b.vx) < 3) b.vx = 0;
      }
      if (b.x < 14) { b.x = 14; b.vx = Math.abs(b.vx) * 0.55; }
      if (b.x > 386) { b.x = 386; b.vx = -Math.abs(b.vx) * 0.55; }
      if (b.y < 34) { b.y = 34; b.vy = Math.abs(b.vy) * 0.3; }
      b.spin += b.vx * dt / BALL_R / RAD;
    }
    if (b.state === 'mouth') { var m = this.mouthPos(); b.x = m[0]; b.y = m[1]; }
    var vis = b.state !== 'mouth';
    attr(this.ballG, 'opacity', vis ? 1 : 0);
    attr(this.ballG, 'transform', 'translate(' + pt(b.x, b.y) + ') rotate(' + n2(b.spin) + ')');
    var hgt = BALL_FLOOR - b.y;
    attr(this.ballShadow, 'opacity', vis ? n2(0.18 * (1 - clamp(hgt / 160, 0, 0.8))) : 0);
    attr(this.ballShadow, 'cx', n2(b.x)); attr(this.ballShadow, 'cy', LANE + 2);
    attr(this.ballShadow, 'rx', n2(6 * (1 - clamp(hgt / 200, 0, 0.6))));
  };
  /* where a flying ball will land, roughly */
  Pet.prototype.landX = function () {
    var b = this.ball;
    if (b.state !== 'air') return b.x;
    var dy = BALL_FLOOR - b.y, a = GRAV / 2, t = (-b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 4 * a * dy))) / (2 * a);
    return clamp(b.x + b.vx * t, 14, 386);
  };
  Pet.prototype.throwTo = function (tx) {
    var b = this.ball;
    if (!b.on || b.state === 'mouth' || b.state === 'held') return false;
    tx = clamp(tx, 30, 370);
    var T = clamp(Math.abs(tx - b.x) / 240, 0.55, 1.05);
    if (b.state === 'ground') b.y = BALL_FLOOR - 1;
    b.state = 'air'; b.ready = false; b.dropped = false; b.vx = (tx - b.x) / T; b.vy = -GRAV * T / 2;
    return true;
  };

  /* ---------- butterfly and treat ---------- */
  Pet.prototype.updateFly = function (dt) {
    var f = this.fly;
    if (!f.on) { attr(this.flyG, 'opacity', 0); return; }
    f.t += dt;
    if (f.leave) { f.x += 90 * dt * f.dir; f.y -= 60 * dt; if (f.y < -40) f.on = false; }
    else {
      f.x += (f.tx - f.x) * (1 - Math.exp(-dt / 0.8)) + Math.sin(f.t * 2.3) * 12 * dt;
      f.y += (f.ty - f.y) * (1 - Math.exp(-dt / 0.8)) + Math.cos(f.t * 3.1) * 14 * dt;
    }
    var flap = Math.abs(Math.sin(f.t * 22));
    attr(this.flyL, 'rx', n2(1 + 3 * flap)); attr(this.flyR, 'rx', n2(1 + 3 * flap));
    attr(this.flyL, 'cx', n2(-1 - 2.2 * flap)); attr(this.flyR, 'cx', n2(1 + 2.2 * flap));
    attr(this.flyG, 'opacity', 1);
    attr(this.flyG, 'transform', 'translate(' + pt(f.x, f.y) + ') rotate(' + n2(Math.sin(f.t * 1.7) * 18) + ')');
  };
  Pet.prototype.updateTreat = function (dt) {
    var tr = this.treat;
    if (!tr.on) { attr(this.treatG, 'opacity', 0); return; }
    if (tr.falling) {
      tr.vy += GRAV * dt; tr.y += tr.vy * dt;
      if (tr.y > LANE) { tr.y = LANE; tr.vy = 0; tr.falling = false; }
    }
    attr(this.treatG, 'opacity', 1);
    attr(this.treatG, 'transform', 'translate(' + pt(tr.x, tr.y + (tr.falling || tr.y >= LANE ? 0 : Math.sin(this.t * 3) * 2.5)) + ') rotate(' + n2(tr.falling ? this.t * 400 % 360 : -12) + ')');
  };

  /* ---------- touch and mouse ---------- */
  Pet.prototype.bindInput = function () {
    var self = this, svg = this.svg;
    function sp(e) {
      var m = svg.getScreenCTM();
      if (!m) return null;
      var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      var q = p.matrixTransform(m.inverse());
      return [q.x, q.y];
    }
    function capture(e) { try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
    this.onDown = function (e) {
      if (e.button > 0) return;
      var p = sp(e);
      if (!p) return;
      var b = self.ball, pe = self.petting;
      self.attn = { x: p[0], y: p[1], t: self.t };
      if (self.playing && b.on && b.state !== 'mouth' && Math.hypot(p[0] - b.x, p[1] - b.y) < 28) {
        b.state = 'held'; b.ready = false; b.dropped = false; b.x = p[0]; b.y = Math.min(p[1], BALL_FLOOR); b.samples = [[p[0], p[1], performance.now()]];
        capture(e); e.preventDefault(); return;
      }
      var on = self.onDog(p[0], p[1]);
      if (on) {
        pe.down = true; pe.moved = 0; pe.x = p[0]; pe.y = p[1]; pe.t0 = performance.now(); pe.where = on;
        capture(e); return;
      }
      if (self.playing && b.on && (b.state === 'ground' || b.state === 'air')) { if (self.throwTo(p[0])) self.sparkle(p[0], Math.min(p[1], LANE - 4), 3, 4); }
    };
    this.onMove = function (e) {
      var p = sp(e);
      if (!p) return;
      self.attn = { x: p[0], y: p[1], t: self.t };
      var b = self.ball, pe = self.petting;
      if (b.state === 'held') {
        b.x = clamp(p[0], 14, 386); b.y = clamp(p[1], -40, BALL_FLOOR);
        b.samples.push([b.x, b.y, performance.now()]);
        if (b.samples.length > 8) b.samples.shift();
        return;
      }
      if (pe.down) {
        var d = Math.hypot(p[0] - pe.x, p[1] - pe.y);
        pe.x = p[0]; pe.y = p[1];
        if (d > 0.6 && self.onDog(p[0], p[1])) { pe.moved += d; if (pe.moved > 5) pe.active = self.t; }
      }
    };
    this.onUp = function () {
      var b = self.ball, pe = self.petting;
      if (b.state === 'held') {
        var s = b.samples || [], now = performance.now(), a = s[0], z = s[s.length - 1];
        for (var i = 0; i < s.length; i++) if (now - s[i][2] < 130) { a = s[i]; break; }
        var dt = a && z ? Math.max(16, z[2] - a[2]) / 1000 : 1;
        b.vx = a && z ? clamp((z[0] - a[0]) / dt, -520, 520) : 0; b.vy = a && z ? clamp((z[1] - a[1]) / dt, -520, 600) : 0;
        if (now - (z ? z[2] : 0) > 140) { b.vx = 0; b.vy = 0; }
        b.state = 'air'; b.ready = false;
      }
      if (pe.down) {
        pe.down = false;
        if (pe.moved < 5 && performance.now() - pe.t0 < 450) self.boop();
      }
    };
    this.onLeave = function () { if (!self.petting.down && self.ball.state !== 'held') self.attn = null; };
    this.onKey = function (e) {
      if (e.target !== self.host || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      self.petBurst();
    };
    svg.addEventListener('pointerdown', this.onDown);
    svg.addEventListener('pointermove', this.onMove);
    svg.addEventListener('pointerup', this.onUp);
    svg.addEventListener('pointercancel', this.onUp);
    svg.addEventListener('pointerleave', this.onLeave);
    this.host.addEventListener('keydown', this.onKey);
  };
  /* petting: rubbing counts, every half second of it goes to the app */
  Pet.prototype.petTick = function (dt) {
    var pe = this.petting;
    var active = (pe.down && this.t - pe.active < 0.3) || this.t < (pe.burst || 0);
    this.petActive = active;
    if (!active) return;
    this.lastPet = this.t; this.awakeUntil = Math.max(this.awakeUntil, this.t + 30);
    pe.acc += dt; pe.hearts -= dt;
    if (pe.hearts <= 0) {
      pe.hearts = 0.28;
      var h = this.headPos();
      if (this.t < (pe.burst || 0)) this.hearts(h[0] + rnd(-10, 10), h[1] - 16, 1); else this.hearts(pe.x, pe.y - 6, 1);
    }
    if (pe.acc >= 0.5) { pe.acc -= 0.5; if (this.o.onPet) this.o.onPet(0.5); }
  };
  Pet.prototype.petBurst = function () { this.petting.burst = this.t + 1.3; var h = this.headPos(); this.petting.x = h[0]; this.petting.y = h[1]; };
  Pet.prototype.boop = function () {
    var T = this.T, self = this, h = this.headPos();
    this.awakeUntil = Math.max(this.awakeUntil, this.t + 30);
    if (this.sleeping) { this.script = null; this.kind = ''; this.queue.unshift('wake'); return; }
    this.sqV -= 1.6; this.nodKick = 1;
    T.happy = 1; T.blush = 1;
    this.hearts(h[0], h[1] - 18, 1);
    if (chance(0.25)) { this.say('Achoo!', 0.9); this.later(0.25, function () { self.headShakeKick = 0.5; }); }
    this.later(0.45, function () { T.happy = 0; T.blush = 0.35; });
    if (this.o.onBoop) this.o.onBoop();
  };

  /* ---------- the brain: one script at a time ---------- */
  Pet.prototype.moodBase = function () {
    var m = this.mood, o;
    if (m === 'sad') o = { sad: 1, perk: 0.06, tailBase: -58, wagAmp: 0.06, wagSpeed: 0.5, eyeBig: 0.7, blush: 0.08 };
    else if (m === 'hungry' || m === 'thirsty' || m === 'bored') o = { sad: 0.45, perk: 0.35, tailBase: -14, wagAmp: 0.25, eyeBig: 0.35 };
    else o = { sad: 0, perk: 0.6, tailBase: 10, wagAmp: 0.5 };
    if (this.dog && this.dog.st.id === 'newborn') o.eyeOpen = 0.94;
    return o;
  };
  Pet.prototype.later = function (sec, fn) { (this.timers = this.timers || []).push({ t: this.t + sec, fn: fn }); };
  Pet.prototype.cleanup = function () {
    this.chew = 0; this.nod = 0; this.shakeRot = 0; this.tiltAdd = 0; this.earFlap = 0; this.sleeping = false; this.tearK = 0;
    if (this.ball.state === 'mouth') this.dropBall(false);
    if (this.fly.on && !this.fly.leave) { this.fly.leave = true; this.fly.dir = 1; }
    this.treat.on = false;
    if (!this.playing && this.ball.on && this.ball.state !== 'held') { this.sparkle(this.ball.x, this.ball.y, 4, 6); this.hideBall(); }
  };
  Pet.prototype.run = function (gen, kind, name) {
    this.cleanup();
    var keep = this.T;
    this.T = Object.assign(neutral(), this.moodBase());
    this.T.sit = keep.sit; this.T.lie = keep.lie; this.T.bow = keep.bow;
    this.script = gen; this.kind = kind; this.scriptName = name || kind;
    this.canLook = kind === 'idle';
    this.timers = [];
  };
  Pet.prototype.think = function (dt) {
    var tm = this.timers || [], due = [];
    this.timers = tm.filter(function (x) { if (x.t <= this.t) { due.push(x); return false; } return true; }, this);
    due.forEach(function (x) { x.fn(); });
    if (this.petActive && (this.kind === 'idle' || this.kind === 'sleep') && this.scriptName !== 'petted') this.run(sPetted(this), 'idle', 'petted');
    if (!this.script) this.pickNext();
    var r;
    try { r = this.script.next(dt); } catch (e) { r = { done: true }; if (window.console) console.error(e); }
    if (r.done) { this.script = null; }
    if (this.canLook && this.attn && this.t - this.attn.t < 2.5) this.lookAt(this.attn.x, this.attn.y);
    /* one-off kicks: boop nod, head shake */
    if (this.nodKick > 0) { this.nodKick = Math.max(0, this.nodKick - dt * 4); this.nod = Math.sin((1 - this.nodKick) * Math.PI) * 3.5; }
    if (this.headShakeKick > 0) { this.headShakeKick = Math.max(0, this.headShakeKick - dt); var a = Math.sin(this.t * 60) * this.headShakeKick * 2; this.tiltAdd = a * 14; this.earFlap = a * 30; if (this.headShakeKick === 0) { this.tiltAdd = 0; this.earFlap = 0; } }
  };
  Pet.prototype.pickNext = function () {
    if (this.queue.length) { var a = this.queue.shift(); this.run(ACTIONS[a](this), 'act', a); return; }
    if (this.playing) { this.run(sFetch(this), 'play', 'fetch'); return; }
    var name = this.chooseIdle();
    this.last = name;
    this.run(IDLES[name](this), name === 'sleep' ? 'sleep' : 'idle', name);
  };
  Pet.prototype.chooseIdle = function () {
    var st = this.dog.st.id, m = this.mood, h = this.hour(), W;
    if (this.isNight() && this.t > this.awakeUntil) return 'sleep';
    if (m === 'sad') {
      W = { sadSit: 3, sadLie: 3, stand: 0.8 };
      if (this.needs.food < 0.02 || this.needs.water < 0.02) W.wantBowl = 2.5;
    } else {
      W = { stand: 3, wander: 4, sit: 3, lie: 2, look: 2, sniff: 2, dig: 0.8, scratch: 1.2, yawn: 1, stretch: 1.1, shake: 0.6, bark: 0.7, sleep: 0.35 };
      if (st !== 'newborn') W.zoomies = st === 'puppy' || st === 'junior' ? 1.6 : 0.6;
      if (st === 'puppy' || st === 'junior') W.chaseTail = 1;
      if (h > 7.5 && h < 19.5) W.butterfly = 1.3;
      if (this.dog.wear.head === 'phones') W.vibe = 2;
      if (st === 'newborn') { W.sleep = 2.5; W.lie += 2; W.wander = 2; }
      if (m === 'hungry' || m === 'thirsty') { W.wantBowl = 4; W.zoomies = 0; W.chaseTail = 0; }
      if (m === 'bored') { W.bringBall = 3.5; W.zoomies = 0; }
      if (this.reduce) { W.zoomies = 0; W.chaseTail = 0; W.shake = 0; }
    }
    if (W[this.last] && Object.keys(W).length > 1) W[this.last] *= 0.12;
    var sum = 0, k;
    for (k in W) sum += W[k];
    var r = Math.random() * sum;
    for (k in W) { r -= W[k]; if (r <= 0) return k; }
    return 'stand';
  };
  Pet.prototype.act = function (name) {
    if (!ACTIONS[name]) return;
    this.awakeUntil = Math.max(this.awakeUntil, this.t + 45);
    if (this.kind === 'act') { if (this.queue.length < 3) this.queue.push(name); return; }
    var asleep = this.sleeping || this.scriptName === 'sleep';
    this.run(wake(this, ACTIONS[name](this), asleep), 'act', name);
  };
  Pet.prototype.setPlaying = function (on) {
    on = !!on;
    if (on === this.playing) return;
    this.playing = on;
    this.awakeUntil = Math.max(this.awakeUntil, this.t + 60);
    if (on) { if (this.kind !== 'act') { var asleep = this.sleeping || this.scriptName === 'sleep'; this.run(wake(this, sFetch(this), asleep), 'play', 'fetch'); } }
    else {
      if (this.kind === 'play') { this.script = null; this.kind = ''; }
      if (this.ball.state === 'mouth') this.dropBall(false);
      if (this.ball.on) { this.sparkle(this.ball.x, this.ball.y, 5, 6); this.hideBall(); }
    }
  };
  Pet.prototype.setMood = function (m, needs) {
    if (needs) this.needs = needs;
    if (m === this.mood) return;
    var was = this.mood;
    this.mood = m;
    if ((m === 'sad' || was === 'sad') && (this.kind === 'idle' || this.kind === 'sleep')) this.script = null;
    else { var base = this.moodBase(); this.T.sad = base.sad; this.T.perk = base.perk; this.T.tailBase = base.tailBase; this.T.eyeBig = base.eyeBig || 0; }
  };
  Pet.prototype.setPose = function (name) {
    var T = this.T;
    T.sit = name === 'sit' ? 1 : 0; T.lie = name === 'lie' ? 1 : 0; T.bow = name === 'bow' ? 1 : 0;
    if (name !== 'lie') T.headRest = 0;
  };
  Pet.prototype.lookAt = function (x, y) {
    var h = this.headPos(), T = this.T;
    T.headTurn = clamp((x - h[0]) / 110, -0.9, 0.9);
    T.lookX = clamp((x - h[0]) / 60, -1, 1);
    T.lookY = clamp((y - h[1]) / 60, -1, 1);
  };
  Pet.prototype.mouthReach = function () { var d = this.dog.d; return (d.poses.stand.cx + d.a.neck[0] + d.R * 0.74) * this.S; };
  Pet.prototype.dropBall = function (ready) {
    var b = this.ball, m = this.mouthPos();
    b.on = true; b.state = 'air'; b.x = m[0]; b.y = Math.min(m[1], BALL_FLOOR - 1); b.vx = this.face * 18; b.vy = -30; b.ready = false; b.dropped = ready !== false;
  };

  /* ---------- little generators the scripts are made of ---------- */
  Pet.prototype.wait = function* (sec, fn) {
    var t = 0;
    while (t < sec) { var dt = yield; t += dt; if (fn) fn(Math.min(1, t / sec), dt, t); }
  };
  Pet.prototype.until = function* (cond, max) { var t = 0; while (!cond() && t < (max || 10)) t += (yield); };
  Pet.prototype.turnTo = function* (dir) {
    if (dir === this.face) return;
    this.face = dir;
    if (this.air === 0) { this.vUp = 80; this.air = 0.01; }
    yield* this.wait(0.16);
  };
  Pet.prototype.walkTo = function* (tx, gait) {
    tx = clamp(tx, 32, 368);
    if (Math.abs(tx - this.x) < 2) return;
    var T = this.T, dir = tx > this.x ? 1 : -1;
    if (this.P.sit > 0.3 || this.P.lie > 0.3 || this.P.bow > 0.3) { T.sit = 0; T.lie = 0; T.bow = 0; T.headRest = 0; yield* this.wait(0.28); }
    yield* this.turnTo(dir);
    var sp = (gait === 'run' ? 170 : gait === 'trot' ? 96 : 48) * (0.72 + 0.28 * this.dog.st.scale);
    T.gait = gait === 'run' ? 2 : gait === 'trot' ? 1.35 : 1; T.headTurn = 0.45 * dir; T.sit = 0; T.lie = 0; T.bow = 0;
    var cur = 0, look = this.canLook;
    this.canLook = false;
    while ((tx - this.x) * dir > 0.5) {
      var dt = yield;
      cur = Math.min(sp, cur + sp * 4 * dt);
      var rem = Math.abs(tx - this.x);
      if (rem < 16) cur = Math.max(sp * 0.3, Math.min(cur, rem * 6));
      this.x += dir * cur * dt;
      if ((tx - this.x) * dir < 0) this.x = tx;
    }
    this.x = tx; T.gait = 0; this.canLook = look;
  };
  Pet.prototype.hop = function* (v, fn) {
    this.vUp = v; this.air = 0.01; this.sqV += 2.2;
    while (this.air > 0) { var dt = yield; if (fn) fn(dt); }
  };
  Pet.prototype.yawn = function* () {
    var T = this.T;
    T.headUp = 0.7; T.eyeOpen = 0.12; T.mouth = 1; T.tongue = 0.3; T.perk = Math.max(0, T.perk - 0.2);
    yield* this.wait(1.1);
    T.mouth = 0; T.tongue = 0; T.headUp = 0; T.eyeOpen = 1;
    yield* this.wait(0.25);
    T.lick = 1; yield* this.wait(0.22); T.lick = 0; yield* this.wait(0.2);
  };
  Pet.prototype.headShake = function* () {
    var self = this;
    yield* this.wait(0.5, function (k) { var a = Math.sin(self.t * 60) * (1 - k); self.tiltAdd = a * 14; self.earFlap = a * 30; });
    this.tiltAdd = 0; this.earFlap = 0;
  };
  Pet.prototype.bodyShake = function* (wet) {
    var self = this, T = this.T;
    T.eyeOpen = 0.2; T.happy = 0.3;
    yield* this.wait(0.9, function (k, dt) {
      var a = Math.sin(self.t * 70) * (1 - k);
      self.shakeRot = a * 7; self.tiltAdd = a * 16; self.earFlap = a * 32;
      if (wet && chance(dt * 30)) { var hp = self.headPos(); self.emit('drop', hp[0] + rnd(-22, 22), hp[1] + rnd(-10, 26), { vx: rnd(-90, 90), vy: rnd(-120, -40), g: 520, life: 0.7 }); }
    });
    this.shakeRot = 0; this.tiltAdd = 0; this.earFlap = 0; T.eyeOpen = 1; T.happy = 0;
  };
  Pet.prototype.cuteTilt = function () {
    var T = this.T, s = chance(0.5) ? 1 : -1, self = this;
    T.headTilt = 15 * s; T.perk = 0.95; T.eyeBig = 0.7;
    if (chance(0.3)) this.say('?', 0.9);
    this.later(1.2, function () { T.headTilt = 0; T.perk = self.moodBase().perk; T.eyeBig = self.moodBase().eyeBig || 0; });
  };
  Pet.prototype.sigh = function () { var T = this.T; this.sqV -= 1.1; T.eyeOpen = 0.55; this.later(0.8, function () { T.eyeOpen = 1; }); };

  /* =========================================================
     Scripts: what the puppy does, one at a time
     ========================================================= */
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  var IDLES = {};
  IDLES.stand = function* (p) {
    var T = p.T, tilted = false;
    T.sit = 0; T.lie = 0; T.bow = 0; T.headTurn = rnd(-0.25, 0.25);
    yield* p.wait(rnd(2.2, 4.5), function (k) { if (!tilted && k > 0.35 && chance(0.012)) { tilted = true; p.cuteTilt(); } });
  };
  IDLES.wander = function* (p) {
    var tx = clamp(p.x + rnd(60, 160) * (chance(0.5) ? 1 : -1), XMIN, XMAX);
    if (Math.abs(tx - p.x) < 40) tx = p.x < 200 ? XMAX - 20 : XMIN + 20;
    yield* p.walkTo(tx, chance(0.25) ? 'trot' : 'walk');
    p.T.headTurn = rnd(-0.3, 0.3); p.canLook = true;
    yield* p.wait(rnd(0.5, 1.2));
  };
  IDLES.sit = function* (p) {
    var T = p.T, tilted = false, pant = chance(0.5);
    p.setPose('sit'); T.wagAmp = 0.35; T.mouth = pant ? 0.3 : 0; T.tongue = pant ? 0.55 : 0;
    yield* p.wait(rnd(4, 7.5), function (k) { if (!tilted && k > 0.25 && chance(0.01)) { tilted = true; p.cuteTilt(); } });
    T.sit = 0; T.mouth = 0; T.tongue = 0;
    yield* p.wait(0.3);
  };
  IDLES.lie = function* (p) {
    var T = p.T;
    p.setPose('lie'); T.wagAmp = 0.2;
    yield* p.wait(0.8);
    T.headRest = 0.6;
    yield* p.wait(rnd(4, 8), function (k) { T.eyeOpen = 0.55 + 0.4 * Math.max(0, Math.sin(k * 9)); });
    T.eyeOpen = 1;
    if (chance(0.35)) yield* p.yawn();
    T.headRest = 0; yield* p.wait(0.4);
    T.lie = 0; yield* p.wait(0.4);
  };
  IDLES.look = function* (p) {
    var T = p.T, dir = chance(0.5) ? 1 : -1;
    p.canLook = false; T.perk = 0.9;
    T.headTurn = 0.85 * dir; T.lookX = dir; yield* p.wait(0.9);
    T.headTurn = -0.85 * dir; T.lookX = -dir; yield* p.wait(0.9);
    if (chance(0.3)) { T.surprise = 1; p.say('!', 0.9); yield* p.wait(0.4); T.surprise = 0; }
    T.headTurn = 0; T.lookX = 0; yield* p.wait(0.6);
  };
  IDLES.sniff = function* (p) {
    var T = p.T, tx = clamp(p.x + rnd(40, 90) * (chance(0.5) ? 1 : -1), XMIN, XMAX);
    T.headDown = 0.7; T.sniff = 1; T.perk = 0.5;
    yield* p.walkTo(tx, 'walk');
    T.headDown = 0.85;
    yield* p.wait(rnd(0.8, 1.4));
    T.sniff = 0;
    if (chance(0.4)) yield* IDLES.dig(p);
    T.headDown = 0; yield* p.wait(0.3);
  };
  IDLES.dig = function* (p) {
    var T = p.T;
    T.sit = 0; T.lie = 0; T.bow = 0.35; T.headDown = 0.55; T.dig = 1; T.perk = 0.75; T.wagAmp = 0.9; T.wagSpeed = 1.3;
    yield* p.wait(rnd(1.6, 2.4), function (k, dt) {
      if (chance(dt * 16)) p.emit('dot', p.x + p.face * p.dog.d.L * 0.75 * p.S, LANE - 2, { vx: -p.face * rnd(40, 100), vy: rnd(-100, -50), g: 430, life: 0.7, color: pick(['#8B5A2B', '#6E4526', '#A0703F']), r: rnd(1.2, 2.3) });
    });
    T.dig = 0; T.bow = 0; T.headDown = 0;
    yield* p.wait(0.3);
  };
  IDLES.scratch = function* (p) {
    var T = p.T;
    p.setPose('sit'); yield* p.wait(0.45);
    T.scratch = 1; T.headTilt = -14 * p.face; T.eyeOpen = 0.3; T.happy = 0.5; T.mouth = 0.25; T.tongue = 0.4;
    yield* p.wait(rnd(1.4, 2.2), function () { p.earFlap = Math.sin(p.t * 38) * 10; });
    p.earFlap = 0; T.scratch = 0; T.headTilt = 0; T.eyeOpen = 1; T.happy = 0; T.mouth = 0; T.tongue = 0;
    yield* p.wait(0.3);
    yield* p.headShake();
    T.sit = 0; yield* p.wait(0.3);
  };
  IDLES.yawn = function* (p) { yield* p.yawn(); yield* p.headShake(); };
  IDLES.stretch = function* (p) {
    var T = p.T;
    T.sit = 0; T.lie = 0; p.setPose('bow'); T.eyeOpen = 0.2; T.mouth = 0.55; T.headUp = 0.3; T.wagAmp = 0.3;
    yield* p.wait(1.5);
    T.bow = 0; T.mouth = 0; T.headUp = 0; T.eyeOpen = 1; T.lean = -6;
    yield* p.wait(0.6); T.lean = 0; yield* p.wait(0.3);
    yield* p.headShake();
  };
  IDLES.zoomies = function* (p) {
    var T = p.T, n = 2 + (Math.random() * 2 | 0), right = p.x < 200;
    T.sit = 0; T.lie = 0; p.setPose('bow'); T.wagAmp = 1; T.wagSpeed = 1.6; T.happy = 0.6; T.mouth = 0.5; T.tongue = 0.8;
    yield* p.wait(0.5);
    T.bow = 0;
    for (var i = 0; i < n; i++) {
      var tx = right ? XMAX - rnd(0, 20) : XMIN + rnd(0, 20);
      right = !right;
      T.happy = 0.6; T.mouth = 0.55; T.tongue = 0.9;
      yield* p.walkTo(tx, 'run');
      if (chance(0.5)) { T.tuck = 0.7; yield* p.hop(230); T.tuck = 0; }
    }
    p.setPose('bow'); yield* p.wait(0.6);
    T.bow = 0; p.setPose('sit');
    yield* p.wait(1.4, function () { T.mouth = 0.45 + 0.1 * Math.sin(p.t * 16); });
    T.sit = 0; T.mouth = 0; T.tongue = 0; T.happy = 0;
  };
  IDLES.butterfly = function* (p) {
    var f = p.fly, T = p.T;
    f.on = true; f.leave = false; f.t = 0; f.dir = chance(0.5) ? 1 : -1;
    f.x = f.dir > 0 ? -20 : 420; f.y = rnd(110, 150);
    f.tx = clamp(p.x + rnd(-50, 50), 60, 340); f.ty = rnd(172, 200);
    p.canLook = false; T.perk = 1; p.setPose('sit'); T.surprise = 1; p.say('!', 0.9);
    yield* p.wait(3.2, function () { p.lookAt(f.x, f.y); T.wagAmp = 0.9; T.wagSpeed = 1.4; });
    T.surprise = 0; T.sit = 0;
    var dir = f.x > p.x ? 1 : -1;
    yield* p.turnTo(dir);
    T.crouch = 1; yield* p.wait(0.35, function () { p.lookAt(f.x, f.y); });
    T.crouch = 0; f.leave = true; f.dir = dir;
    var sp = clamp((f.x - p.x) / 0.7, -120, 120);
    T.tuck = 0.8;
    yield* p.hop(300, function (dt) { p.x = clamp(p.x + sp * dt, XMIN, XMAX); p.lookAt(f.x, f.y); });
    T.tuck = 0; p.setPose('sit'); T.headUp = 0.8;
    yield* p.wait(1.2, function () { if (f.on) p.lookAt(f.x, f.y); });
    T.headUp = 0; T.sit = 0; T.headTurn = 0; T.lookX = 0; T.lookY = 0;
    yield* p.wait(0.3);
  };
  IDLES.chaseTail = function* (p) {
    var T = p.T;
    T.sit = 0; T.lie = 0; T.happy = 0.5; T.wagAmp = 1; T.wagSpeed = 1.8; T.mouth = 0.4; T.tongue = 0.6;
    for (var i = 0; i < 4; i++) { yield* p.turnTo(-p.face); T.headTurn = -0.8 * p.face; yield* p.wait(0.1); }
    T.happy = 0; T.mouth = 0.3; T.eyeOpen = 0.7;
    yield* p.wait(1.2, function (k) { p.tiltAdd = Math.sin(p.t * 7) * 12 * (1 - k); });
    p.tiltAdd = 0; T.eyeOpen = 1; p.setPose('sit');
    yield* p.wait(0.8);
    T.sit = 0; T.mouth = 0; T.tongue = 0;
  };
  IDLES.shake = function* (p) { p.T.sit = 0; p.T.lie = 0; yield* p.wait(0.2); yield* p.bodyShake(p.wet > 0); p.wet = 0; };
  IDLES.bark = function* (p) {
    var T = p.T;
    T.perk = 1; T.headTurn = rnd(-0.6, 0.6); p.say('Woof!', 1);
    for (var i = 0; i < 2; i++) { T.mouth = 0.8; p.sqV -= 0.8; yield* p.wait(0.16); T.mouth = 0; yield* p.wait(0.3); }
    yield* p.wait(0.6);
  };
  IDLES.vibe = function* (p) {
    var T = p.T;
    p.setPose('sit'); T.happy = 1; T.wagAmp = 0.8; T.mouth = 0.2;
    yield* p.wait(3.6, function (k, dt) {
      var beat = Math.sin(p.t * 9);
      p.tiltAdd = beat * 9; p.nod = Math.abs(beat) * 2;
      if (chance(dt * 1.8)) { var h = p.headPos(); p.emit('text', h[0] + rnd(-20, 20), h[1] - 24, { text: chance(0.5) ? '♪' : '♫', size: 13, color: '#6B5CFF', stroke: '#fff', vy: -26, vx: rnd(-10, 10), life: 1.3, s0: 0.7, s1: 1.1 }); }
    });
    p.tiltAdd = 0; p.nod = 0; T.sit = 0; T.happy = 0; T.mouth = 0;
  };
  IDLES.sleep = function* (p) {
    var T = p.T, night = p.isNight();
    if (Math.abs(p.x - BED_X) > 6) { T.eyeOpen = 0.7; yield* p.walkTo(BED_X, 'walk'); }
    yield* p.turnTo(-p.face); yield* p.wait(0.2); yield* p.turnTo(1);
    p.setPose('lie'); T.eyeOpen = 0.6; yield* p.wait(0.8);
    T.headRest = 1; T.eyeOpen = 0; T.perk = 0.2; T.tailBase = -20; T.wagAmp = 0; T.blush = 0.5;
    p.sleeping = true; p.canLook = false;
    var zt = 0.8, t = 0, dur = rnd(12, 20);
    while (t < dur || (night && p.isNight() && p.t > p.awakeUntil)) {
      var dt = yield;
      t += dt; zt -= dt;
      if (zt <= 0) { zt = 1.7; var h = p.headPos(); p.emit('z', h[0] + 14, h[1] - 16, { vx: 10, vy: -18, life: 2.2, s0: 0.5, s1: 1.3, wob: 3 }); }
    }
    p.sleeping = false;
    T.eyeOpen = 1; T.headRest = 0; yield* p.wait(0.5);
    yield* p.yawn();
    T.lie = 0; yield* p.wait(0.3);
  };
  IDLES.sadSit = function* (p) {
    var T = p.T;
    T.lie = 0; p.setPose('sit'); T.headTilt = -6 * p.face; T.lookY = 0.3;
    yield* p.wait(rnd(4, 7), function (k, dt) { if (chance(dt * 0.25)) p.sigh(); });
    T.sit = 0; T.headTilt = 0;
  };
  IDLES.sadLie = function* (p) {
    var T = p.T;
    T.sit = 0; p.setPose('lie'); yield* p.wait(0.6);
    T.headRest = 0.8; T.lookY = -0.6; T.eyeBig = 1;
    yield* p.wait(rnd(5, 9), function (k, dt) {
      if (chance(dt * 0.15)) p.say('…', 1.2);
      p.tearK = k > 0.3 && k < 0.8 ? Math.min(1, (k - 0.3) * 6) : Math.max(0, (p.tearK || 0) - dt * 2);
    });
    p.tearK = 0;
    T.headRest = 0; T.lie = 0; yield* p.wait(0.5);
  };
  IDLES.wantBowl = function* (p) {
    var T = p.T, food = p.needs.food <= p.needs.water, bx = food ? FOOD_X : WATER_X;
    yield* p.walkTo(bx - p.mouthReach() - 4, 'walk');
    yield* p.turnTo(1);
    T.headDown = 0.85; T.sniff = 1; yield* p.wait(1.2);
    T.sniff = 0; T.headDown = 0; p.setPose('sit'); T.headTurn = -0.3; T.eyeBig = 1; T.sad = Math.max(T.sad, 0.6);
    p.canLook = true; p.say('…', 1.2);
    yield* p.wait(rnd(3, 5));
    T.sit = 0;
  };
  IDLES.bringBall = function* (p) {
    if (p.playing) return;
    var T = p.T, sx = p.x > 200 ? 40 : 360;
    p.showBall(sx, BALL_FLOOR - 50, 0, 0);
    T.perk = 1; T.surprise = 1; p.say('!', 0.8);
    yield* p.wait(0.7, function () { p.lookAt(p.ball.x, p.ball.y); });
    T.surprise = 0;
    var dir = sx > p.x ? 1 : -1;
    yield* p.walkTo(sx - dir * p.mouthReach(), 'trot');
    T.headDown = 0.9; yield* p.wait(0.25);
    p.ball.state = 'mouth'; T.headDown = 0; T.happy = 0.6;
    yield* p.walkTo(200, 'trot');
    T.headTurn = 0; yield* p.wait(0.2);
    p.dropBall(true);
    p.setPose('bow'); T.wagAmp = 1; T.wagSpeed = 1.6; T.mouth = 0.4; T.tongue = 0.6; p.say('Woof!', 1);
    yield* p.wait(3, function () { p.lookAt(200, 150); });
    T.bow = 0; p.setPose('lie'); T.mouth = 0; T.tongue = 0;
    yield* p.wait(4);
    T.lie = 0; yield* p.wait(0.4);
  };

  /* petting: eyes shut, leaning into your hand, tail going */
  function* sPetted(p) {
    var T = p.T, long = 0;
    if (p.sleeping) { p.sleeping = false; T.headRest = 0; }
    T.happy = 1; T.blush = 0.95; T.wagAmp = 1; T.wagSpeed = 1.7; T.perk = 0.25; T.mouth = 0.35; T.tongue = 0.6; T.headTurn = 0; T.lookX = 0;
    p.canLook = false;
    while (p.t - (p.lastPet || 0) < 0.9) {
      var dt = yield;
      long += dt;
      var hp = p.headPos(), px = p.petting.x;
      T.headTilt = clamp((px - hp[0]) * 0.3, -14, 14);
      T.lean = clamp((px - hp[0]) * 0.06 * p.face, -6, 6);
      if (long > 3.5 && !T.lie) { T.sit = 0; p.setPose('lie'); }
    }
    T.headTilt = 0; T.lean = 0;
    T.lie = 0; p.setPose('sit');
    yield* p.wait(0.5);
    T.happy = 0.4; T.sit = 0;
    yield* p.wait(0.4);
  }

  /* fetch: chase the ball, catch it (in the air if it can), bring it back */
  function* sFetch(p) {
    var T = p.T, b = p.ball;
    if (!b.on) p.showBall(clamp(p.x + p.face * 60, 40, 360), 40, 0, 0);
    T.perk = 1; T.wagAmp = 1; T.wagSpeed = 1.6; p.say('Woof!', 0.9);
    while (p.playing) {
      if (b.state === 'held' || (b.state === 'ground' && b.ready) || (b.state === 'air' && b.dropped) || !b.on) {
        var dir = b.x >= p.x ? 1 : -1;
        if (b.on && dir !== p.face && Math.abs(b.x - p.x) > 24) { yield* p.turnTo(dir); continue; }
        T.sit = 0; T.lie = 0; p.setPose('bow'); T.gait = 0; T.tuck = 0; T.happy = 0.3; T.mouth = 0.45; T.tongue = 0.7; T.wagAmp = 1;
        if (b.on) p.lookAt(b.x, b.y);
        yield;
        continue;
      }
      if (b.state === 'air' || b.state === 'ground') {
        T.bow = 0; T.sit = 0; T.happy = 0.4; T.mouth = 0.5; T.tongue = 0.8;
        var reach = p.mouthReach(), land = p.landX(), d2 = land >= p.x ? 1 : -1;
        if (d2 !== p.face && Math.abs(land - p.x) > reach * 0.6) { T.gait = 0; yield* p.turnTo(d2); continue; }
        var m = p.mouthPos(), dx = b.x - m[0], dy = b.y - m[1], low = b.y > LANE - 34;
        var near = Math.abs(b.x - (p.x + p.face * reach)) < 26;
        T.headDown = low && near && p.air === 0 ? 1 : 0;
        if (Math.hypot(dx, dy) < 11 + 8 * p.S || (low && near && p.P.headDown > 0.75 && Math.abs(dx) < 16)) {
          b.state = 'mouth'; b.vx = 0; b.vy = 0; T.gait = 0; T.tuck = 0; T.headDown = 0; p.sqV -= 1;
          if (p.air > 12) { p.say('Got it!', 0.9); p.sparkle(m[0], m[1], 4, 8); }
          continue;
        }
        if (b.state === 'air' && b.vy > 0 && Math.abs(dx) < 34 && dy < -14 && dy > -64 && p.air === 0) {
          p.vUp = clamp(Math.sqrt(2 * GRAV * (-dy + 6)), 140, 240); p.air = 0.01; p.sqV += 2; T.tuck = 0.7;
        }
        if (p.air === 0) T.tuck = 0;
        var target = land - p.face * reach, dist = target - p.x, sp = 178 * (0.72 + 0.28 * p.dog.st.scale);
        var dt = yield;
        T.gait = Math.abs(dist) > 3 ? 2 : 0;
        p.x = clamp(p.x + clamp(dist, -sp * dt, sp * dt), 32, 368);
        if (b.on) p.lookAt(b.x, b.y);
        continue;
      }
      if (b.state === 'mouth') {
        T.happy = 0.7; T.tuck = 0; T.tongue = 0; T.mouth = 0.3; T.headDown = 0;
        yield* p.until(function () { return p.air === 0; }, 2);
        yield* p.walkTo(clamp(p.homeX || 200, XMIN, XMAX), 'trot');
        if (!p.playing) break;
        T.headTurn = 0; p.setPose('sit');
        yield* p.wait(0.35);
        p.dropBall(true);
        T.sit = 0; p.setPose('bow'); T.happy = 1;
        var hp = p.headPos();
        p.hearts(hp[0], hp[1] - 18, 2);
        if (p.o.onFetch) p.o.onFetch();
        yield* p.wait(0.5);
        continue;
      }
      yield;
    }
  }

  /* waking up first when an action comes during a nap */
  function* wake(p, gen, asleep) {
    if (asleep) {
      var T = p.T;
      p.sleeping = false;
      p.setPose('lie'); T.headRest = 0; T.eyeOpen = 1; T.surprise = 1; T.perk = 0.9;
      yield* p.wait(0.5);
      T.surprise = 0;
      yield* p.yawn();
      T.lie = 0; yield* p.wait(0.3);
    }
    yield* gen;
  }

  var ACTIONS = {};
  ACTIONS.wake = function* (p) { yield* wake(p, (function* () { yield* p.wait(0.2); })(), true); };
  ACTIONS.feed = function* (p) {
    var T = p.T, s = p.scene;
    for (var i = 0; i < 12; i++) p.emit('dot', FOOD_X + rnd(-7, 7), LANE - 64 - i * 4, { vy: 40, g: 700, life: 0.36 + i * 0.012, color: pick(['#9A5F2E', '#B9763B']), r: 2 });
    T.perk = 1; T.surprise = 1; T.wagAmp = 1; T.wagSpeed = 1.5; p.say('!', 0.7);
    yield* p.wait(0.4);
    T.surprise = 0; s.setFood(1);
    yield* p.walkTo(FOOD_X - p.mouthReach(), 'trot');
    yield* p.turnTo(1);
    T.headDown = 1; T.happy = 0.3; T.eyeOpen = 0.6; T.wagAmp = 0.9;
    yield* p.wait(3.6, function (k, dt) {
      p.chew = 0.28 * (0.5 + 0.5 * Math.sin(p.t * 16)); p.nod = Math.sin(p.t * 16) * 1.5;
      s.setFood(1 - k);
      if (chance(dt * 6)) p.emit('dot', FOOD_X + rnd(-10, 10), LANE - 8, { vx: rnd(-40, 40), vy: rnd(-70, -30), g: 420, life: 0.5, color: '#9A5F2E', r: 1.3 });
    });
    p.chew = 0; p.nod = 0; s.setFood(0); T.headDown = 0; T.eyeOpen = 1;
    yield* p.wait(0.3);
    T.lick = 1; yield* p.wait(0.22); T.lick = 0; yield* p.wait(0.15); T.lick = 1; yield* p.wait(0.2); T.lick = 0;
    T.happy = 1; p.setPose('sit');
    var h = p.headPos(); p.hearts(h[0], h[1] - 20, 2);
    yield* p.wait(1.2);
    T.happy = 0; T.sit = 0;
  };
  ACTIONS.water = function* (p) {
    var T = p.T, s = p.scene;
    for (var i = 0; i < 10; i++) p.emit('drop', WATER_X + rnd(-5, 5), LANE - 60 - i * 5, { vy: 60, g: 700, life: 0.33 + i * 0.012 });
    T.perk = 1; T.surprise = 1; T.wagAmp = 1; p.say('!', 0.7);
    yield* p.wait(0.35);
    for (var j = 0; j < 6; j++) p.emit('drop', WATER_X + rnd(-10, 10), LANE - 6, { vx: rnd(-50, 50), vy: rnd(-90, -40), g: 500, life: 0.5 });
    T.surprise = 0; s.setWater(1);
    yield* p.walkTo(WATER_X - p.mouthReach(), 'trot');
    yield* p.turnTo(1);
    T.headDown = 1; T.eyeOpen = 0.45; T.mouth = 0.15;
    yield* p.wait(3.2, function (k, dt) {
      var lap = Math.max(0, Math.sin(p.t * 22));
      T.tongue = lap; p.nod = lap * 1.2;
      s.setWater(1 - k * 0.9);
      if (chance(dt * 7)) p.emit('drop', WATER_X + rnd(-8, 8), LANE - 8, { vx: rnd(-40, 40), vy: rnd(-80, -40), g: 480, life: 0.5, s0: 0.6, s1: 0.6 });
    });
    p.nod = 0; s.setWater(0); T.tongue = 0; T.mouth = 0; T.headDown = 0; T.eyeOpen = 1;
    p.wet = 1;
    yield* p.wait(0.3);
    T.lick = 1; yield* p.wait(0.25); T.lick = 0;
    yield* p.headShake();
    T.happy = 1; p.setPose('sit');
    var h = p.headPos(); p.hearts(h[0], h[1] - 20, 1);
    yield* p.wait(1);
    T.happy = 0; T.sit = 0;
  };
  ACTIONS.treat = function* (p) {
    var T = p.T, tr = p.treat, tx = p.x + p.face * 70;
    if (tx > XMAX - 10 || tx < XMIN + 10) tx = p.x - p.face * 70;
    tx = clamp(tx, XMIN + 10, XMAX - 10);
    tr.on = true; tr.x = tx; tr.y = Math.min(LANE - 84, p.headPos()[1] - p.dog.d.R * p.S * 1.9); tr.falling = false;
    p.sparkle(tx, tr.y, 5, 10);
    T.perk = 1; T.surprise = 1; T.wagAmp = 1; T.wagSpeed = 1.6; p.say('!', 0.7);
    yield* p.wait(0.4);
    T.surprise = 0;
    var dir = tx >= p.x ? 1 : -1;
    yield* p.walkTo(tx - dir * p.mouthReach() * 0.9, 'trot');
    yield* p.turnTo(dir);
    tr.on = true;
    p.setPose('sit'); p.canLook = false;
    yield* p.wait(0.6, function () { p.lookAt(tr.x, tr.y); });
    var trick = pick(['paw', 'spin', 'jump', 'speak', 'bow']);
    if (trick === 'paw') { T.pawLift = 1; T.happy = 0.6; yield* p.wait(1, function () { p.lookAt(tr.x, tr.y); }); T.pawLift = 0; T.happy = 0; }
    else if (trick === 'spin') { T.sit = 0; yield* p.wait(0.25); for (var i = 0; i < 4; i++) yield* p.turnTo(-p.face); yield* p.turnTo(dir); p.setPose('sit'); yield* p.wait(0.35); }
    else if (trick === 'jump') { T.sit = 0; T.crouch = 1; yield* p.wait(0.3); T.crouch = 0; T.tuck = 0.8; yield* p.hop(330, function () { p.lookAt(tr.x, tr.y); }); T.tuck = 0; p.setPose('sit'); yield* p.wait(0.3); }
    else if (trick === 'speak') { p.say('Woof!', 1); for (var j = 0; j < 2; j++) { T.mouth = 0.8; p.sqV -= 0.8; yield* p.wait(0.16); T.mouth = 0; yield* p.wait(0.3); } }
    else { T.sit = 0; p.setPose('bow'); yield* p.wait(1.1, function () { p.lookAt(tr.x, tr.y); }); T.bow = 0; p.setPose('sit'); yield* p.wait(0.3); }
    tr.falling = true; tr.vy = 0;
    yield* p.until(function () { return !tr.falling; }, 2);
    T.sit = 0; T.headDown = 1;
    yield* p.wait(0.3);
    tr.on = false;
    yield* p.wait(1.1, function (k, dt) {
      p.chew = 0.3 * (0.5 + 0.5 * Math.sin(p.t * 18));
      if (chance(dt * 8)) p.emit('dot', tr.x + rnd(-6, 6), LANE - 6, { vx: rnd(-40, 40), vy: rnd(-60, -30), g: 420, life: 0.45, color: '#D9A45F', r: 1.2 });
    });
    p.chew = 0; T.headDown = 0; T.happy = 1; T.blush = 0.9;
    var h = p.headPos(); p.hearts(h[0], h[1] - 18, 3);
    T.lick = 1; yield* p.wait(0.22); T.lick = 0;
    yield* p.wait(1);
    T.happy = 0;
  };
  ACTIONS.celebrate = function* (p) {
    var T = p.T;
    T.happy = 1; T.wagAmp = 1; T.wagSpeed = 1.8; T.mouth = 0.6; T.tongue = 0.7; T.perk = 1; T.sit = 0; T.lie = 0;
    var colors = ['#FF5FA2', '#FFD54A', '#4DA3FF', '#34C759', '#AF52DE', '#FF9500'];
    for (var i = 0; i < 46; i++) p.emit('confetti', rnd(10, 390), rnd(-30, 20), { vx: rnd(-30, 30), vy: rnd(20, 80), g: 120, life: rnd(2, 3), vr: rnd(-400, 400), color: pick(colors), drag: 0.6 });
    var h = p.headPos(); p.sparkle(h[0], h[1], 8, 30);
    for (var j = 0; j < 2; j++) { T.crouch = 1; yield* p.wait(0.2); T.crouch = 0; T.tuck = 0.9; yield* p.hop(320); T.tuck = 0; yield* p.wait(0.15); }
    p.say('Woof!', 1.2);
    p.setPose('sit'); yield* p.wait(1.4);
    T.sit = 0; T.happy = 0; T.mouth = 0; T.tongue = 0;
  };

  /* =========================================================
     Still pictures (breed picker, wardrobe, iPhone widget)
     ========================================================= */
  var measureBox = null;
  function stillSVG(o) {
    o = o || {};
    var br = breedOf(o.breed), look = { breed: br.id, coat: coatOf(br, o.coat).id, stage: stageOf(o.stage).id, wear: o.wear || {} };
    var svg = el('svg', { xmlns: NS, 'class': 'pet-still' });
    var dog = new Dog(svg, look, 'ps' + (++UID) + '-');
    dog.pose(Object.assign({ faceX: o.face || 1 }, STILL[o.pose] || STILL.sit, o.P || {}));
    var box = null;
    try {
      if (!measureBox) { measureBox = document.createElement('div'); measureBox.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden'; }
      if (!measureBox.isConnected) document.body.appendChild(measureBox);
      measureBox.appendChild(svg);
      box = dog.g.getBBox();
      measureBox.removeChild(svg);
    } catch (e) { box = null; }
    var w = o.frame || 150, h = w * (o.aspect || 0.9);
    var cx = box ? box.x + box.width / 2 : -4, bottom = box ? Math.max(8, box.y + box.height + 3) : 8;
    var top = box ? Math.min(box.y - 4, bottom - h) : bottom - h, vh = bottom - top;
    if (vh > h) { w = w * vh / h; h = vh; }
    svg.setAttribute('viewBox', [n2(cx - w / 2), n2(bottom - h), n2(w), n2(h)].join(' '));
    if (o.width) { svg.setAttribute('width', o.width); svg.setAttribute('height', Math.round(o.width * h / w)); }
    return o.node ? svg : new XMLSerializer().serializeToString(svg);
  }

  /* one accessory on its own, for the wardrobe */
  var ITEM_BOX = { neck: '-26 8 52 44', face: '-26 -16 52 28', head: '-34 -60 68 56' };
  function itemSVG(id) {
    var it = itemOf(id);
    if (!it) return '';
    var svg = el('svg', { xmlns: NS, viewBox: ITEM_BOX[it.slot], 'class': 'pet-item', 'aria-hidden': 'true' });
    drawItem(id, el('g', null, svg), 27, null);
    return new XMLSerializer().serializeToString(svg);
  }

  /* the live garden: returns a small handle for app.js */
  function mount(host, o) {
    var p = new Pet(host, o || {});
    return {
      setLook: function (l) { p.setLook(l); },
      setName: function (n) { p.setName(n); },
      setMood: function (m, needs) { p.setMood(m, needs); },
      act: function (name) { p.act(name); },
      play: function (on) { p.setPlaying(on); },
      playing: function () { return p.playing; },
      throwBall: function () {
        if (!p.playing) return;
        var b = p.ball, far = p.x < 200 ? rnd(280, 360) : rnd(40, 120);
        if (!b.on) { p.showBall(p.x, BALL_FLOOR - 1, 0, 0); b.state = 'ground'; }
        p.throwTo(far);
      },
      pet: function () { p.petBurst(); },
      resume: function () { p.resume(); },
      destroy: function () { p.destroy(); },
      busy: function () { return p.kind === 'act' || p.queue.length > 0; },
      idle: function (n) { if (IDLES[n]) p.run(IDLES[n](p), 'idle', n); },
      el: p.svg,
      _p: p
    };
  }

  window.MyIBPetEngine = {
    BREEDS: BREEDS, STAGES: STAGES, ITEMS: ITEMS,
    svg: stillSVG, itemSVG: itemSVG, mount: mount,
    isNight: isNightHour
  };
})();
