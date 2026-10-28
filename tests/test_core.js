// Spring checks against independent derivations and handbook values. Run: node tests/test_core.js
const C = require('../core.js'), P = require('../presets.js');
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg + `  got ${(+a).toPrecision(7)} want ${(+b).toPrecision(7)}`); };
const base = { type: 'compression', material: 'A228', d: 2, D: 16, Na: 8, ends: 'sqGround', L0: 60, F1: 20, F2: 60, endCond: 'fixedFixed', setRemoved: false, peened: false };

// 1. Rate from strain energy of the twisted wire: y = ∂U/∂F with U = T²L/(2GJ), T = FD/2, L = πDNa
{
  const r = C.solve(base), G = 81700, J = Math.PI * 2 ** 4 / 32, L = Math.PI * 16 * 8, F = 10;
  const y = F * 16 * 16 * L / (4 * G * J);
  near(r.k, F / y, 1e-12, 'compression rate equals strain-energy result');
}
// 2. Curvature factors at C = 8
near(C.bergstrasser(8), 34 / 29, 1e-12, 'Bergsträsser K_B(8) = 34/29');
near(C.wahl(8), 31 / 28 + 0.615 / 8, 1e-12, 'Wahl K_W(8) = 31/28 + 0.615/8');
// 3. Music wire strength: Shigley lists Sut = 201/d^0.145 kpsi (d in inches); for d = 0.037 in that is ≈ 324 kpsi
{
  const d = 0.037 * 25.4, S = C.strength({ material: 'A228', d }).Sut;
  near(S / 6.894757, 201 / Math.pow(0.037, 0.145), 5e-3, 'music wire Sut(0.037 in) matches the inch-unit constants');
}
// 4. Solid height and pitch by end type (Shigley table 10-1)
{
  const d = 2, Na = 8;
  near(C.solve({ ...base, ends: 'plain' }).Ls, d * (Na + 1), 1e-12, 'plain: Ls = d(Nt+1), Nt = Na');
  near(C.solve({ ...base, ends: 'plainGround' }).Ls, d * (Na + 1), 1e-12, 'plain ground: Ls = d·Nt, Nt = Na+1');
  near(C.solve({ ...base, ends: 'squared' }).Ls, d * (Na + 3), 1e-12, 'squared: Ls = d(Nt+1), Nt = Na+2');
  near(C.solve({ ...base, ends: 'sqGround' }).Ls, d * (Na + 2), 1e-12, 'squared ground: Ls = d·Nt');
  const r = C.solve(base); near(r.p * Na + 2 * d, base.L0, 1e-12, 'squared ground pitch reproduces L0');
}
// 5. Buckling: for steel (E 207, G 79.3 GPa) the absolute-stability limit is L0 < 2.63 D/α
{
  const r = C.solve({ ...base, material: 'custom', Sut: 1800, E: 207000, G: 79300 });
  near(r.buckling.Lcrit * r.buckling.alpha / base.D, 2.63, 2e-3, 'buckling constant 2.63 for steel');
}
// 6. Gerber point lies on the Gerber line and on the load line
{
  const r = C.solve(base), f = r.fatigue;
  near(f.Sa / f.Sse + (f.Sm / f.Ssu) ** 2, 1, 1e-10, 'Gerber: Sa/Sse + (Sm/Ssu)² = 1');
  near(f.Sa / f.Sm, f.ta / f.tm, 1e-10, 'Gerber: on the load line');
  near(f.Sse, 241 / (1 - (379 / f.Ssu) ** 2), 1e-12, 'Zimmerli unpeened endurance converted to fully reversed');
}
// 7. Surge frequency, both ends fixed: f = d/(2π Na D²) · sqrt(G/(2ρ))  (SI, wave equation)
{
  const r = C.solve(base), d = 0.002, D = 0.016, Na = 8, G = 81.7e9, rho = 7850;
  near(r.freq, d / (2 * Math.PI * Na * D * D) * Math.sqrt(G / (2 * rho)), 1e-9, 'surge frequency matches the wave-equation form');
}
// 8. Stress: τ = K_B 8FD/πd³ at F2
{
  const r = C.solve(base); near(r.points[1].tau, C.bergstrasser(8) * 8 * 60 * 16 / (Math.PI * 8), 1e-12, 'shear stress at F₂');
}
// 9. Extension: Na = Nb + G/E, L0 = (2C − 1 + Nb)d, hook factor (K)_A for C1 = C
{
  const m = { type: 'extension', material: 'A228', d: 1.5, D: 12, Nb: 20, Fi: 8, F1: 15, F2: 40, peened: false };
  const r = C.solve(m), Cc = 8;
  near(r.Na, 20 + 81700 / 203400, 1e-12, 'extension: Na = Nb + G/E');
  near(r.L0, (2 * Cc - 1 + 20) * 1.5, 1e-12, 'extension: L0 = (2C − 1 + Nb)d');
  near(r.KA, (4 * Cc * Cc - Cc - 1) / (4 * Cc * (Cc - 1)), 1e-12, 'extension: hook bending factor');
  near(r.points[1].y, (40 - 8) / r.k, 1e-12, 'extension: deflection starts after initial tension');
  near(r.tauIrange[0] + r.tauIrange[1], 2 * 231 / Math.exp(0.105 * Cc), 1e-12, 'extension: preferred initial-stress band centered on 231/e^(0.105C)');
}
// 10. Torsion: k' = d⁴E/(10.8 D Na) per turn, D' = D·Nb/(Nb + θ)
{
  const m = { type: 'torsion', material: 'A228', d: 1.5, D: 12, Nb: 6, L1: 25, L2: 25, M1: 100, M2: 300 };
  const r = C.solve(m), Na = 6 + 50 / (3 * Math.PI * 12);
  near(r.Na, Na, 1e-12, 'torsion: Na = Nb + (L1+L2)/(3πD)');
  near(r.kTurn, 1.5 ** 4 * 203400 / (10.8 * 12 * Na), 1e-12, 'torsion: rate per turn');
  const p = r.points[1]; near(p.Dp, 12 * 6 / (6 + 300 / r.kTurn), 1e-12, 'torsion: coil diameter tightens under load');
}
// 11. Helpers invert correctly
{
  const Na = C.coilsForRate(base, 5); near(C.solve({ ...base, Na }).k, 5, 1e-12, 'coils for a target rate');
  const L0 = C.freeLengthFor(base, 0.15); near(C.solve({ ...base, L0 }).xi, 0.15, 1e-9, 'free length for 15% overrun');
}
// 12. Every example solves
for (const [k, t] of Object.entries(P.titles)) { const r = C.solve(P.list[k]()); near(r.ok ? 1 : 0, 1, 0, `example ${t} solves${r.ok ? '' : ': ' + r.message}`); }
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
