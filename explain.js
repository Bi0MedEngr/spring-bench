// Spring Bench — units for display and "show the math" (formula, then the numbers, then the result).
const Explain = (() => {
  'use strict';
  const C = typeof Core !== 'undefined' ? Core : require('./core.js');
  const lbf = 4.4482216152605;
  // [label, factor from SI (mm, N, MPa, N/mm, N·mm, N·mm/°, kg)]
  const UNITS = {
    SI: { L: ['mm', 1], F: ['N', 1], S: ['MPa', 1], k: ['N/mm', 1], M: ['N·mm', 1], kt: ['N·mm/°', 1], m: ['g', 1000], E: ['MPa', 1] },
    US: { L: ['in', 1 / 25.4], F: ['lbf', 1 / lbf], S: ['kpsi', 1 / 6.894757], k: ['lbf/in', 25.4 / lbf], M: ['lbf·in', 1 / (lbf * 25.4)], kt: ['lbf·in/°', 1 / (lbf * 25.4)], m: ['oz', 35.27396], E: ['kpsi', 1 / 6.894757] },
  };
  const MINUS = '−';
  function num(v, sig = 4) {
    if (!isFinite(v)) return v > 0 ? '∞' : '—';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v);
    let s = a >= 1e6 || a < 1e-3 ? v.toExponential(2).replace(/e([+-])(\d+)/, (_, sg, e) => `×10${sup((sg === '-' ? '-' : '') + e)}`) : String(+v.toPrecision(sig));
    return s.replace('-', MINUS);
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sup(n) { return String(n).split('').map(ch => SUP[ch] || ch).join(''); }
  const sub = s => `<sub>${s}</sub>`;
  // value in display units with its unit label
  const fmtU = (u, kind, v, sig) => `${num(v * u[kind][1], sig)} ${u[kind][0]}`;
  const eq = lines => `<div class="eqs">${lines.map(l => l.startsWith('=') ? `<div class="sub">${l}</div>` : l.startsWith('→') ? `<div class="res">${l.slice(1).trim()}</div>` : `<div>${l}</div>`).join('')}</div>`;

  function explain(m, r) {
    if (!r || !r.ok) return [{ title: 'No solution', html: `<p>${r ? r.message : ''}</p>` }];
    const u = UNITS[m.units] || UNITS.SI, L = (v, s) => fmtU(u, 'L', v, s), F = (v, s) => fmtU(u, 'F', v, s), S = (v, s) => fmtU(u, 'S', v, s);
    const out = [];
    const d = m.d, D = m.D;
    // Material
    let h = m.material === 'custom'
      ? `<p>Custom material: S${sub('ut')} entered directly.</p>` + eq([`S${sub('ut')} = ${S(r.Sut)}`])
      : `<p>Spring wire gets stronger as it gets thinner. Its minimum tensile strength follows S${sub('ut')} = A / d<sup>m</sup> (A in MPa·mm<sup>m</sup>, d in mm).</p>` +
        eq([`${r.mat.name}: A = ${r.mat.A} MPa·mm<sup>m</sup>, m = ${r.mat.m}`, `S${sub('ut')} = ${r.mat.A} / ${num(d)}<sup>${r.mat.m}</sup>`, `→ S${sub('ut')} = ${S(r.Sut)}`]);
    h += `<p>Moduli: E = ${fmtU(u, 'E', r.E)}, G = ${fmtU(u, 'E', r.G)}.</p>`;
    out.push({ title: 'Wire strength', html: h });
    // Geometry
    h = `<p>The spring index C = D/d sets how sharply the wire is curved. Curvature raises the stress on the inside of each coil, so the plain torsion stress is multiplied by a correction factor.</p>`;
    h += eq([`C = D / d = ${num(D)} / ${num(d)}`, `→ C = ${num(r.C)}`,
      `K${sub('B')} = (4C + 2) / (4C − 3) = ${num(r.KB)} &nbsp; (Bergsträsser, used here)`, `= Wahl factor K${sub('W')} = (4C − 1)/(4C − 4) + 0.615/C = ${num(r.KW)}, for comparison`,
      `OD = D + d = ${L(r.OD)}, &nbsp; ID = D − d = ${L(r.ID)}`]);
    out.push({ title: 'Index and curvature factor', html: h });

    if (m.type === 'compression') {
      const e = r.ends;
      h = eq([`End type: ${e.name}, N${sub('e')} = ${e.Ne} inactive coil${e.Ne === 1 ? '' : 's'}`, `N${sub('t')} = N${sub('a')} + N${sub('e')} = ${num(r.Na)} + ${e.Ne} = ${num(r.Nt)}`,
        `→ Solid height L${sub('s')} = ${L(r.Ls)}`, `Pitch p = ${L(r.p)}, helix angle ${num(r.helix, 3)}°`]);
      out.push({ title: 'Coils, solid height, pitch', html: h });
      h = `<p>Each coil acts like a twisted bar: the force F twists the wire with torque F·D/2. Adding up the twist along the wire length π·D·N${sub('a')} gives the rate:</p>`;
      h += eq([`k = G·d⁴ / (8·D³·N${sub('a')})`, `= ${num(r.G)}·${num(d)}⁴ / (8·${num(D)}³·${num(r.Na)})`, `→ k = ${fmtU(u, 'k', r.k)}`]);
      out.push({ title: 'Spring rate', html: h });
      h = `<p>Shear stress at the inside of the coil: τ = K${sub('B')}·8·F·D / (π·d³).</p>` + eq(r.points.flatMap(p => [`${p.label} = ${F(p.F)}: deflection y = F/k = ${L(p.y)}, length ${L(p.L)}`, `= τ = ${num(r.KB)}·8·${num(p.F)}·${num(D)} / (π·${num(d)}³) = ${S(p.tau)}`]));
      h += `<p>Allowable static shear stress: ${Math.round(r.Ssy / r.Sut * 100)}% of S${sub('ut')} for this material ${m.setRemoved ? 'with set removed' : 'without set removal'} (Shigley table 10-6): S${sub('sy')} = ${S(r.Ssy)}. At F${sub('2')}, n = S${sub('sy')}/τ = ${num(r.n2, 3)}.</p>`;
      out.push({ title: 'Working forces and stress', html: h });
      h = `<p>If the spring is ever pushed flat, it must survive that too.</p>` + eq([`y${sub('s')} = L${sub('0')} − L${sub('s')} = ${num(m.L0 * u.L[1])} − ${num(r.Ls * u.L[1])} = ${L(r.ys)}`, `F${sub('s')} = k·y${sub('s')} = ${F(r.Fs)}`, `τ${sub('s')} = ${S(r.tauS)}`, `→ n${sub('s')} = S${sub('sy')}/τ${sub('s')} = ${num(r.ns, 3)} (want ≥ 1.2)`,
        `Fractional overrun ξ = y${sub('s')}/y${sub('2')} − 1 = ${num(r.xi, 3)} (want ≥ 0.15)`, `Coil clearance at F${sub('2')}: ${L(r.clash)} per coil`]);
      out.push({ title: 'Closing solid', html: h });
      const b = r.buckling;
      h = `<p>A long spring between plates can bow sideways like a column. α depends on how the ends are held (${num(b.alpha)} here).</p>` +
        eq([`Absolutely stable if L${sub('0')} &lt; (π·D/α)·√(2(E − G)/(2G + E)) = ${L(b.Lcrit)}`, `L${sub('0')} = ${L(m.L0)} → ${b.absolute ? 'absolutely stable' : 'can buckle'}`,
          ...(b.absolute ? [] : [`λ${sub('eff')} = α·L${sub('0')}/D = ${num(b.lam)}, C₁′ = ${num(b.C1)}, C₂′ = ${num(b.C2)}`, `y${sub('cr')} = L${sub('0')}·C₁′·[1 − √(1 − C₂′/λ${sub('eff')}²)]`, `→ buckles at y = ${isFinite(b.yCr) ? L(b.yCr) : 'never'} (working max ${L(Math.max(...r.points.map(p => p.y)))})`])]);
      out.push({ title: 'Buckling', html: h });
      h = `<p>Fast cycling can excite waves running along the coils (surge). The first natural frequency should be well above the operating frequency.</p>` +
        eq([`active mass m = ρ·π²·d²·D·N${sub('a')}/4 = ${fmtU(u, 'm', r.massActive)}`, `f = ${m.endCond === 'fixedFree' ? '¼' : '½'}·√(k/m)`, `→ f = ${num(r.freq)} Hz${+m.opFreq > 0 ? ` (operating ${num(m.opFreq)} Hz)` : ''}`]);
      h += `<p>Total spring mass ${fmtU(u, 'm', r.mass)}, wire length ${L(r.wireLength)}.</p>`;
      out.push({ title: 'Surge frequency', html: h });
    }
    if (m.type === 'extension') {
      h = `<p>Extension springs are wound tight with built-in initial tension F${sub('i')}: they don't stretch until the load exceeds it. The hooks add a little flexibility, counted as extra active coils.</p>` +
        eq([`N${sub('a')} = N${sub('b')} + G/E = ${num(r.Nb)} + ${num(r.G / r.E)} = ${num(r.Na)}`, `k = G·d⁴ / (8·D³·N${sub('a')}) = ${fmtU(u, 'k', r.k)}`, `Free length inside hooks L${sub('0')} = (2C − 1 + N${sub('b')})·d = ${L(r.L0)}`]);
      out.push({ title: 'Coils, rate, free length', html: h });
      h = `<p>Initial tension that can be wound in reliably depends on the index. Preferred range of the uncorrected initial stress (Shigley):</p>` +
        eq([`τ${sub('i')} = 231/e^(0.105C) ± 6.9·(4 − (C − 3)/6.5) MPa`, `= ${S(r.tauIrange[0])} to ${S(r.tauIrange[1])}, which is F${sub('i')} = ${F(r.FiRange[0])} to ${F(r.FiRange[1])}`, `→ F${sub('i')} = ${F(r.Fi)} gives τ${sub('i')} = ${S(r.tauI)}`]);
      out.push({ title: 'Initial tension', html: h });
      h = eq(r.points.flatMap(p => [`${p.label} = ${F(p.F)}: stretch y = (F − F${sub('i')})/k = ${L(p.y)}`, `= body τ = K${sub('B')}·8FD/(πd³) = ${S(p.tau)}`, `= hook bending σ${sub('A')} = F·[(K)${sub('A')}·16D/(πd³) + 4/(πd²)] = ${S(p.sigA)}`, `= hook torsion τ${sub('B')} = (K)${sub('B')}·8FD/(πd³) = ${S(p.tauB)}`]));
      h += `<p>Hook factors: C₁ = 2r₁/d = ${num(r.C1h)}, (K)${sub('A')} = (4C₁² − C₁ − 1)/(4C₁(C₁ − 1)) = ${num(r.KA)}; C₂ = 2r₂/d = ${num(r.C2h)}, (K)${sub('B')} = (4C₂ − 1)/(4C₂ − 4) = ${num(r.KBh)}.</p>`;
      h += `<p>Allowables (fractions of S${sub('ut')}, Shigley table 10-7): body ${S(r.Ssy)}, hook torsion ${S(r.SsyB)}, hook bending ${S(r.SyA)}. Safety factors at F${sub('2')}: body ${num(r.nBody, 3)}, hook bending ${num(r.nA, 3)}, hook torsion ${num(r.nB, 3)}.</p>`;
      out.push({ title: 'Body and hook stresses', html: h });
    }
    if (m.type === 'torsion') {
      h = `<p>A torsion spring's wire is bent, not twisted, so E sets the rate. The legs add a little flexibility; the constant 10.8 includes coil friction (Shigley).</p>` +
        eq([`N${sub('a')} = N${sub('b')} + (L₁ + L₂)/(3πD) = ${num(r.Nb)} + ${num((r.L1 + r.L2) / (3 * Math.PI * D))} = ${num(r.Na)}`, `k′ = d⁴·E / (10.8·D·N${sub('a')}) = ${fmtU(u, 'M', r.kTurn)} per turn`, `→ ${fmtU(u, 'kt', r.kDeg)}`]);
      out.push({ title: 'Rate', html: h });
      h = `<p>Bending stress at the inside of the coil: σ = K${sub('i')}·32·M/(π·d³), with K${sub('i')} = (4C² − C − 1)/(4C(C − 1)) = ${num(r.KI)}.</p>` +
        eq(r.points.flatMap(p => [`${p.label} = ${fmtU(u, 'M', p.M)}: rotation ${num(p.deg, 3)}° (${num(p.turns, 3)} turn)`, `= σ = ${S(p.sigma)}; coil diameter tightens to D′ = D·N${sub('b')}/(N${sub('b')} + θ) = ${L(p.Dp)}, ID′ = ${L(p.IDp)}`]));
      h += `<p>Allowable bending stress: ${Math.round(r.Sy / r.Sut * 100)}% of S${sub('ut')} (Shigley) = ${S(r.Sy)}; n at M${sub('2')} = ${num(r.n2, 3)}. A supporting arbor should be about 10% smaller than the smallest ID: ≤ ${L(r.arborMax)}.</p>`;
      out.push({ title: 'Stress and coil tightening', html: h });
    }
    if (r.fatigue) {
      const f = r.fatigue;
      h = `<p>For a load cycling between F${sub('1')} and F${sub('2')}, the stress has a mean τ${sub('m')} and an alternating part τ${sub('a')}. Zimmerli's spring-steel data (d &lt; 10 mm, ${m.peened ? 'shot-peened' : 'unpeened'}) gives S${sub('sa')} = ${f.ZSa} MPa at S${sub('sm')} = ${f.ZSm} MPa; converted to a fully reversed endurance limit with the Gerber line:</p>` +
        eq([`τ${sub('a')} = ${S(f.ta)}, τ${sub('m')} = ${S(f.tm)}`, `S${sub('su')} = 0.67·S${sub('ut')} = ${S(f.Ssu)}`, `S${sub('se')} = S${sub('sa')} / (1 − (S${sub('sm')}/S${sub('su')})²) = ${S(f.Sse)}`,
          `Gerber on the load line: S${sub('a')} = r²S${sub('su')}²/(2S${sub('se')})·[−1 + √(1 + (2S${sub('se')}/(rS${sub('su')}))²)], r = τ${sub('a')}/τ${sub('m')}`, `= S${sub('a')} = ${S(f.Sa)}`, `→ n${sub('f')} = S${sub('a')}/τ${sub('a')} = ${num(f.nf, 3)} (Goodman gives ${num(f.nfGoodman, 3)})`]);
      if (r.fatigueA) h += `<p>Hooks: bending n${sub('f')} = ${num(r.fatigueA.nf, 3)} (endurance S${sub('se')}/0.577 = ${S(r.fatigueA.Se)} against S${sub('ut')}); torsion n${sub('f')} = ${num(r.fatigueB.nf, 3)}.</p>`;
      out.push({ title: 'Fatigue', html: h });
    }
    out.push({ title: 'Method and limits', html: `<p>Formulas and allowable-stress fractions follow Shigley's <i>Mechanical Engineering Design</i>, chapter 10. Strength constants are minimums from that table; check them against your wire supplier's certificate. Rates ignore direct shear and coil-to-coil contact; real springs vary by roughly ±10% in rate without a tolerance class. Fatigue uses Zimmerli's data for d &lt; 10 mm and is not computed for torsion springs.</p>` });
    return out;
  }
  return { explain, num, UNITS };
})();
if (typeof module !== 'undefined') module.exports = Explain;
