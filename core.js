// Spring Bench — helical spring design (compression, extension, torsion). Pure functions, no DOM.
// Internal units: N, mm, MPa (N/mm²), N·mm, kg, Hz. The UI converts for US units.
// Method and constants follow Shigley's Mechanical Engineering Design (Budynas & Nisbett), ch. 10.
const Core = (() => {
  'use strict';

  // Minimum tensile strength Sut = A / d^m (MPa, d in mm). class: allowable-stress family.
  const MATERIALS = {
    A228: { name: 'Music wire (ASTM A228)', A: 2211, m: 0.145, E: 203400, G: 81700, rho: 7850, dmin: 0.10, dmax: 6.5, cls: 'cd' },
    A227: { name: 'Hard-drawn wire (A227)', A: 1783, m: 0.190, E: 197900, G: 80000, rho: 7850, dmin: 0.7, dmax: 12, cls: 'cd' },
    A229: { name: 'Oil-tempered wire (A229)', A: 1855, m: 0.187, E: 196500, G: 77200, rho: 7850, dmin: 0.5, dmax: 12, cls: 'ht' },
    A232: { name: 'Chrome-vanadium (A232)', A: 2005, m: 0.168, E: 203400, G: 77200, rho: 7850, dmin: 0.8, dmax: 11, cls: 'ht' },
    A401: { name: 'Chrome-silicon (A401)', A: 1974, m: 0.108, E: 203400, G: 77200, rho: 7850, dmin: 1.6, dmax: 9.5, cls: 'ht' },
    A313: { name: '302 stainless (A313)', A: 1867, m: 0.146, E: 193000, G: 69000, rho: 7920, dmin: 0.3, dmax: 2.5, cls: 'ss' },
    custom: { name: 'Custom (enter Sut, E, G)', A: 0, m: 0, E: 200000, G: 79000, rho: 7850, dmin: 0, dmax: Infinity, cls: 'cd' },
  };
  // Allowable stress as a fraction of Sut (Shigley tables 10-6 and 10-7, lower ends of the ranges).
  const ALLOW = {
    // compression, static: before / after set removal
    comp: { cd: [0.45, 0.60], ht: [0.50, 0.65], ss: [0.35, 0.55] },
    // extension: body torsion, hook torsion (B), hook bending (A)
    ext: { cd: [0.45, 0.40, 0.75], ht: [0.50, 0.40, 0.80], ss: [0.35, 0.30, 0.55] },
    // torsion springs: bending
    tor: { cd: 0.80, ht: 0.85, ss: 0.60 },
  };
  // End types: active-to-total coils, free length and solid height (Shigley table 10-1).
  const ENDS = {
    plain: { name: 'Plain', Ne: 0, Ls: (d, Nt) => d * (Nt + 1), L0: (p, d, Na) => p * Na + d, p: (L0, d, Na) => (L0 - d) / Na },
    plainGround: { name: 'Plain and ground', Ne: 1, Ls: (d, Nt) => d * Nt, L0: (p, d, Na) => p * (Na + 1), p: (L0, d, Na) => L0 / (Na + 1) },
    squared: { name: 'Squared (closed)', Ne: 2, Ls: (d, Nt) => d * (Nt + 1), L0: (p, d, Na) => p * Na + 3 * d, p: (L0, d, Na) => (L0 - 3 * d) / Na },
    sqGround: { name: 'Squared and ground', Ne: 2, Ls: (d, Nt) => d * Nt, L0: (p, d, Na) => p * Na + 2 * d, p: (L0, d, Na) => (L0 - 2 * d) / Na },
  };
  // Buckling end-condition constant α (Shigley table 10-2).
  const ALPHA = { fixedFixed: 0.5, fixedPinned: 0.707, pinnedPinned: 1, fixedFree: 2 };
  // Zimmerli fatigue data, d < 10 mm, all steels (MPa): [Ssa, Ssm]
  const ZIMMERLI = { unpeened: [241, 379], peened: [398, 534] };

  const wahl = C => (4 * C - 1) / (4 * C - 4) + 0.615 / C;
  const bergstrasser = C => (4 * C + 2) / (4 * C - 3);
  function strength(m) {
    const mat = MATERIALS[m.material] || MATERIALS.A228;
    if (m.material === 'custom') return { mat, Sut: +m.Sut || 0, E: +m.E || mat.E, G: +m.G || mat.G, rho: +m.rho || mat.rho };
    return { mat, Sut: mat.A / Math.pow(m.d, mat.m), E: mat.E, G: mat.G, rho: mat.rho };
  }
  // Gerber fatigue factor of safety on the load line through (τm, τa); Sse from Zimmerli, Ssu = 0.67 Sut.
  function gerber(ta, tm, Ssu, Sse) {
    if (ta <= 0) return { Sa: Infinity, Sm: tm, nf: Infinity };
    if (tm <= 0) return { Sa: Sse, Sm: 0, nf: Sse / ta };
    const r = ta / tm, Sa = r * r * Ssu * Ssu / (2 * Sse) * (-1 + Math.sqrt(1 + (2 * Sse / (r * Ssu)) ** 2));
    return { Sa, Sm: Sa / r, nf: Sa / ta };
  }
  function goodman(ta, tm, Ssu, SseG) { return { nf: 1 / (ta / SseG + tm / Ssu) }; }

  function fatigueBlock(m, Sut, Fa, Fm, toTau) {
    const [ZSa, ZSm] = m.peened ? ZIMMERLI.peened : ZIMMERLI.unpeened;
    const Ssu = 0.67 * Sut, Sse = ZSa / (1 - (ZSm / Ssu) ** 2), SseG = ZSa / (1 - ZSm / Ssu);
    const ta = toTau(Fa), tm = toTau(Fm), g = gerber(ta, tm, Ssu, Sse);
    return { ZSa, ZSm, Ssu, Sse, SseG, ta, tm, Sa: g.Sa, Sm: g.Sm, nf: g.nf, nfGoodman: goodman(ta, tm, Ssu, SseG).nf, valid: m.d < 10 };
  }

  function check(list, id, label, ok, detail, warn) { list.push({ id, label, status: ok ? 'pass' : warn ? 'warn' : 'fail', detail }); }

  function solve(m) {
    const d = +m.d, D = +m.D;
    if (!(d > 0) || !(D > d)) return { ok: false, message: 'Mean diameter must be larger than the wire diameter.' };
    const { mat, Sut, E, G, rho } = strength(m);
    if (!(Sut > 0)) return { ok: false, message: 'Enter the wire’s tensile strength.' };
    const C = D / d, KB = bergstrasser(C), KW = wahl(C), cls = mat.cls;
    const tauOf = F => KB * 8 * F * D / (Math.PI * d ** 3);
    const r = { ok: true, type: m.type, mat, Sut, E, G, rho, C, KB, KW, OD: D + d, ID: D - d, checks: [] };
    const ck = r.checks;
    check(ck, 'index', 'Spring index C between 4 and 12', C >= 4 && C <= 12, `C = ${C.toFixed(2)}`, C >= 3 && C <= 16);
    if (m.material !== 'custom') check(ck, 'wire', 'Wire size in the material’s range', d >= mat.dmin && d <= mat.dmax, `${mat.dmin}–${mat.dmax} mm`, true);

    if (m.type === 'compression') {
      const Na = +m.Na, ends = ENDS[m.ends] || ENDS.sqGround, Nt = Na + ends.Ne, L0 = +m.L0;
      const k = G * d ** 4 / (8 * D ** 3 * Na);
      const Ls = ends.Ls(d, Nt), p = ends.p(L0, d, Na), ys = L0 - Ls, Fs = k * ys;
      const Ssy = ALLOW.comp[cls][m.setRemoved ? 1 : 0] * Sut;
      Object.assign(r, { Na, Nt, k, L0, Ls, p, ys, Fs, Ssy, ends });
      if (!(ys > 0)) return { ok: false, message: 'Free length is shorter than the solid height: add length or remove coils.' };
      const pts = [['F₁', +m.F1], ['F₂', +m.F2]].map(([label, F]) => ({ label, F, y: F / k, L: L0 - F / k, tau: tauOf(F) }));
      r.points = pts;
      const F2 = Math.max(pts[0].F, pts[1].F), F1 = Math.min(pts[0].F, pts[1].F), y2 = F2 / k;
      r.tauS = tauOf(Fs); r.ns = Ssy / r.tauS; r.n2 = Ssy / tauOf(F2);
      r.xi = ys / y2 - 1;
      r.helix = Math.atan(p / (Math.PI * D)) * 180 / Math.PI;
      r.clash = (L0 - y2 - Ls) / Na;
      // buckling
      const alpha = ALPHA[m.endCond] || ALPHA.fixedFixed, lam = alpha * L0 / D;
      const C1 = E / (2 * (E - G)), C2 = 2 * Math.PI ** 2 * (E - G) / (2 * G + E);
      const Lcrit = Math.PI * D / alpha * Math.sqrt(2 * (E - G) / (2 * G + E));
      const yCr = C2 / lam ** 2 < 1 ? L0 * C1 * (1 - Math.sqrt(1 - C2 / lam ** 2)) : Infinity;
      r.buckling = { alpha, lam, C1, C2, Lcrit, yCr, absolute: L0 < Lcrit };
      // surge frequency and mass
      const massActive = rho * Math.PI ** 2 * d * d * D * Na / 4 * 1e-9; // kg
      r.mass = rho * Math.PI * d * d / 4 * Math.PI * D * Nt * 1e-9;
      r.wireLength = Math.PI * D * Nt;
      r.freq = (m.endCond === 'fixedFree' ? 0.25 : 0.5) * Math.sqrt(k * 1000 / massActive);
      r.massActive = massActive;
      check(ck, 'coils', 'Active coils between 3 and 15', Na >= 3 && Na <= 15, `Nₐ = ${+Na.toFixed(2)}`, Na >= 2);
      check(ck, 'solid', 'Survives being closed solid (nₛ ≥ 1.2)', r.ns >= 1.2, `nₛ = ${r.ns.toFixed(2)}`, r.ns >= 1);
      check(ck, 'work', 'Static stress at F₂ (n ≥ 1.2)', r.n2 >= 1.2, `n = ${r.n2.toFixed(2)}`, r.n2 >= 1);
      check(ck, 'overrun', 'Room before solid at F₂ (ξ ≥ 0.15)', r.xi >= 0.15, `ξ = ${r.xi.toFixed(2)}`, r.xi > 0);
      check(ck, 'buckle', 'Does not buckle at F₂', y2 < r.buckling.yCr, r.buckling.absolute ? 'absolutely stable' : `buckles at ${r.buckling.yCr.toFixed(1)} mm`);
      if (F2 > F1 && F1 >= 0) {
        r.fatigue = fatigueBlock(m, Sut, (F2 - F1) / 2, (F2 + F1) / 2, tauOf);
        check(ck, 'fatigue', 'Fatigue, Gerber (n_f ≥ 1.5)', r.fatigue.nf >= 1.5, `n_f = ${r.fatigue.nf.toFixed(2)}${r.fatigue.valid ? '' : ' (Zimmerli data is for d < 10 mm)'}`, r.fatigue.nf >= 1.1);
      }
      if (+m.opFreq > 0) check(ck, 'surge', 'Surge frequency ≥ 15× operating', r.freq >= 15 * m.opFreq, `${r.freq.toFixed(0)} Hz vs ${15 * m.opFreq} Hz`, r.freq >= 8 * m.opFreq);
      r.state = y => ({ y, L: L0 - y, F: k * y, tau: tauOf(k * y) });
      r.yMax = ys;
      return r;
    }

    if (m.type === 'extension') {
      const Nb = +m.Nb, Na = Nb + G / E, k = G * d ** 4 / (8 * D ** 3 * Na), Fi = +m.Fi || 0;
      const L0 = (2 * C - 1 + Nb) * d; // machine half-loops at both ends
      const r1 = +m.r1 || D / 2, r2 = +m.r2 || 2 * d, C1h = 2 * r1 / d, C2h = 2 * r2 / d;
      const KA = (4 * C1h * C1h - C1h - 1) / (4 * C1h * (C1h - 1)), KBh = (4 * C2h - 1) / (4 * C2h - 4);
      const sigA = F => F * (KA * 16 * D / (Math.PI * d ** 3) + 4 / (Math.PI * d * d));
      const tauB = F => KBh * 8 * F * D / (Math.PI * d ** 3);
      const [fb, fh, fa] = ALLOW.ext[cls];
      const Ssy = fb * Sut, SsyB = fh * Sut, SyA = fa * Sut;
      // preferred initial tension range (uncorrected stress, MPa)
      const tauI = 8 * Fi * D / (Math.PI * d ** 3), tauImid = 231 / Math.exp(0.105 * C), tauIband = 6.9 * (4 - (C - 3) / 6.5);
      const FiOf = t => t * Math.PI * d ** 3 / (8 * D);
      Object.assign(r, { Nb, Na, k, Fi, L0, Lbody: (Nb + 1) * d, r1, r2, C1h, C2h, KA, KBh, Ssy, SsyB, SyA, tauI, tauIrange: [tauImid - tauIband, tauImid + tauIband], FiRange: [FiOf(tauImid - tauIband), FiOf(tauImid + tauIband)] });
      const pts = [['F₁', +m.F1], ['F₂', +m.F2]].map(([label, F]) => ({ label, F, y: Math.max(0, F - Fi) / k, L: L0 + Math.max(0, F - Fi) / k, tau: tauOf(F), sigA: sigA(F), tauB: tauB(F) }));
      r.points = pts;
      const F2 = Math.max(pts[0].F, pts[1].F), F1 = Math.min(pts[0].F, pts[1].F);
      r.nBody = Ssy / tauOf(F2); r.nA = SyA / sigA(F2); r.nB = SsyB / tauB(F2);
      r.mass = rho * Math.PI * d * d / 4 * (Math.PI * D * Nb + 2 * Math.PI * D) * 1e-9;
      r.wireLength = Math.PI * D * (Nb + 2);
      check(ck, 'coils', 'Body coils ≥ 3', Nb >= 3, `N_b = ${Nb}`);
      check(ck, 'body', 'Body stress at F₂ (n ≥ 1.2)', r.nBody >= 1.2, `n = ${r.nBody.toFixed(2)}`, r.nBody >= 1);
      check(ck, 'hookA', 'Hook bending at F₂ (n ≥ 1.2)', r.nA >= 1.2, `n = ${r.nA.toFixed(2)}`, r.nA >= 1);
      check(ck, 'hookB', 'Hook torsion at F₂ (n ≥ 1.2)', r.nB >= 1.2, `n = ${r.nB.toFixed(2)}`, r.nB >= 1);
      check(ck, 'initial', 'Initial tension in the preferred range', tauI >= r.tauIrange[0] && tauI <= r.tauIrange[1], `${r.FiRange[0].toFixed(1)}–${r.FiRange[1].toFixed(1)} N`, true);
      if (F2 > F1 && F1 >= 0) {
        const fb2 = fatigueBlock(m, Sut, (F2 - F1) / 2, (F2 + F1) / 2, tauOf), fB = fatigueBlock(m, Sut, (F2 - F1) / 2, (F2 + F1) / 2, tauB);
        // hook bending: Sse/0.577 against Sut (Shigley sec. 10-12)
        const Se = fb2.Sse / 0.577, sa = sigA((F2 - F1) / 2), sm = sigA((F2 + F1) / 2), gA = gerber(sa, sm, Sut, Se);
        r.fatigue = fb2; r.fatigueB = fB; r.fatigueA = { Se, sa, sm, nf: gA.nf };
        const nmin = Math.min(fb2.nf, fB.nf, gA.nf);
        check(ck, 'fatigue', 'Fatigue, body and hooks (n_f ≥ 1.5)', nmin >= 1.5, `body ${fb2.nf.toFixed(2)}, hook bend ${gA.nf.toFixed(2)}, hook torsion ${fB.nf.toFixed(2)}`, nmin >= 1.1);
      }
      r.state = y => { const F = Fi + k * y; return { y, L: L0 + y, F, tau: tauOf(F) }; };
      r.yMax = Math.max(...pts.map(q => q.y)) * 1.3 || L0 * 0.5;
      return r;
    }

    // torsion
    const Nb = +m.Nb, L1 = +m.L1 || 0, L2 = +m.L2 || 0, Na = Nb + (L1 + L2) / (3 * Math.PI * D);
    const kTurn = d ** 4 * E / (10.8 * D * Na), kDeg = kTurn / 360;
    const KI = (4 * C * C - C - 1) / (4 * C * (C - 1));
    const sig = M => KI * 32 * M / (Math.PI * d ** 3);
    const Sy = ALLOW.tor[cls] * Sut;
    Object.assign(r, { Nb, Na, kTurn, kDeg, KI, Sy, L1, L2, Lbody: d * (Nb + 1) });
    const pts = [['M₁', +m.M1], ['M₂', +m.M2]].map(([label, M]) => {
      const turns = M / kTurn, Dp = D * Nb / (Nb + turns);
      return { label, M, deg: turns * 360, turns, sigma: sig(M), Dp, IDp: Dp - d };
    });
    r.points = pts;
    const M2 = Math.max(pts[0].M, pts[1].M), p2 = pts[0].M > pts[1].M ? pts[0] : pts[1];
    r.n2 = Sy / sig(M2);
    r.arborMax = 0.9 * p2.IDp;
    r.mass = rho * Math.PI * d * d / 4 * (Math.PI * D * Nb + L1 + L2) * 1e-9;
    r.wireLength = Math.PI * D * Nb + L1 + L2;
    check(ck, 'coils', 'Body coils ≥ 3', Nb >= 3, `N_b = ${Nb}`);
    check(ck, 'stress', 'Bending stress at M₂ (n ≥ 1.2)', r.n2 >= 1.2, `n = ${r.n2.toFixed(2)}`, r.n2 >= 1);
    if (+m.arbor > 0) check(ck, 'arbor', 'Coils clear the arbor at M₂', +m.arbor <= r.arborMax, `ID at M₂ ${p2.IDp.toFixed(2)} mm; arbor ≤ ${r.arborMax.toFixed(2)} mm`);
    r.state = deg => { const M = kDeg * deg; return { deg, M, sigma: sig(M) }; };
    r.yMax = Math.max(...pts.map(q => q.deg)) * 1.3 || 90;
    return r;
  }

  // Number of active coils that gives rate k (compression and extension), or rate per turn (torsion).
  function coilsForRate(m, k) {
    const { E, G } = strength(m), d = +m.d, D = +m.D;
    if (m.type === 'compression') return G * d ** 4 / (8 * D ** 3 * k);
    if (m.type === 'extension') return G * d ** 4 / (8 * D ** 3 * k) - G / E;
    const Na = d ** 4 * E / (10.8 * D * k); return Na - ((+m.L1 || 0) + (+m.L2 || 0)) / (3 * Math.PI * D);
  }
  // Free length that leaves fractional overrun xi at the larger working force (compression).
  function freeLengthFor(m, xi = 0.15) {
    const r = solve(Object.assign({}, m, { L0: 1e6 }));
    if (!r.ok) return null;
    const y2 = Math.max(+m.F1, +m.F2) / r.k;
    return r.Ls + (1 + xi) * y2;
  }

  const WIRE_MM = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0];
  const WIRE_IN = [0.010, 0.012, 0.014, 0.016, 0.018, 0.020, 0.022, 0.024, 0.026, 0.029, 0.031, 0.033, 0.035, 0.037, 0.039, 0.041, 0.043, 0.045, 0.047, 0.049, 0.051, 0.055, 0.059, 0.063, 0.067, 0.071, 0.075, 0.080, 0.085, 0.090, 0.095, 0.100, 0.106, 0.112, 0.118, 0.125, 0.133, 0.142, 0.148, 0.156, 0.162, 0.170, 0.177, 0.180, 0.192, 0.207, 0.225, 0.250];

  return { MATERIALS, ALLOW, ENDS, ALPHA, ZIMMERLI, wahl, bergstrasser, strength, gerber, solve, coilsForRate, freeLengthFor, WIRE_MM, WIRE_IN };
})();
if (typeof module !== 'undefined') module.exports = Core;
