// Spring Bench — read a McMaster-Carr spring product page (text copied from the page) into a design.
// Pure: parse(text) → { ok, pn, kind, title, specs, model, notes, problems, listed }.
// McMaster lists OD, ID, wire diameter, length, rate and loads but not coil counts; active coils are
// backed out from the listed rate with the material's G, which also makes the computed rate match exactly.
const McMaster = (() => {
  'use strict';
  const C = typeof Core !== 'undefined' ? Core : require('./core.js');
  const LBF = 4.4482216152605;
  const LABELS = ['Spring Type', 'Compression Spring Type', 'Material', 'Steel Grade', 'Length', 'OD', 'ID', 'Wire Diameter', 'Wire', 'Thickness', 'Width',
    'Compressed Length @ Maximum Load', 'Extended Length @ Maximum Load', 'Deflection @ Maximum Load', 'Maximum Load', 'Spring Rate', 'End Type', 'Loop Type',
    'Load', 'Minimum', 'Maximum', 'Finish', 'Maximum Temperature', 'System of Measurement', 'Deflection Angle', 'Maximum Torque', 'Leg Length', 'Wind Direction',
    'Spring Wind Direction', 'Number of Coils', 'Total Coils', 'Active Coils', 'Torque', 'Hole Diameter', 'For Hole Diameter', 'For Shaft Diameter', 'Load Rating'];

  // "2.031\"", "0.08 in.", "16.2 mm" → mm
  function length(v) {
    if (!v) return null; const m = String(v).replace(',', '').match(/(-?\d*\.?\d+)\s*(mm|cm|m\b|"|in\.?|inch|ft\.?|')?/i); if (!m) return null;
    const x = parseFloat(m[1]), u = (m[2] || '').toLowerCase();
    return u === 'mm' ? x : u === 'cm' ? x * 10 : u === 'm' ? x * 1000 : u.startsWith('ft') || u === "'" ? x * 304.8 : x * 25.4;
  }
  // "15 lb.", "3.37 lbf", "20 N", "2 kg" → N
  function force(v) {
    if (!v) return null; const m = String(v).replace(',', '').match(/(-?\d*\.?\d+)\s*(lbf|lbs?\.?|N\b|kN|kgf?|oz)?/i); if (!m) return null;
    const x = parseFloat(m[1]), u = (m[2] || 'lb').toLowerCase();
    return u === 'n' ? x : u === 'kn' ? x * 1000 : u.startsWith('kg') ? x * 9.80665 : u === 'oz' ? x * LBF / 16 : x * LBF;
  }
  // "35 lbf/in", "13 lbf/mm", "2.1 N/mm", "6 lb./in." → N/mm
  function rate(v) {
    if (!v) return null; const s = String(v).replace(',', ''), m = s.match(/(-?\d*\.?\d+)\s*([a-z.]+)\s*\/\s*([a-z.]+)/i); if (!m) return null;
    const x = parseFloat(m[1]), f = force('1 ' + m[2].replace(/\.$/, '')), l = length('1 ' + m[3].replace(/\.$/, ''));
    return f && l ? x * f / l : null;
  }
  // "60 in.-lbs.", "0.5 N·m" → N·mm
  function torque(v) {
    if (!v) return null; const s = String(v).toLowerCase(), m = s.match(/(-?\d*\.?\d+)/); if (!m) return null; const x = parseFloat(m[1]);
    if (/n\s*[·.-]?\s*m\b/.test(s) && !/mm/.test(s)) return x * 1000; if (/n\s*[·.-]?\s*mm/.test(s)) return x;
    if (/ft/.test(s)) return x * LBF * 304.8; return x * LBF * 25.4;
  }
  const notRated = v => !v || /not rated/i.test(v);

  // Pull label → value pairs from page text (labels on their own line, value on the next; also "Label: value" and tab-separated).
  function specsOf(text) {
    const lines = String(text).replace(/\r/g, '').split(/\n|\t/).map(s => s.trim()).filter(Boolean);
    const specs = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const colon = line.match(/^([A-Za-z@ ]+?):\s*(.+)$/);
      if (colon && LABELS.includes(colon[1].trim())) { if (!(colon[1].trim() in specs)) specs[colon[1].trim()] = colon[2].trim(); continue; }
      if (!LABELS.includes(line)) continue;
      if (line === 'Load' || line === 'Wire') {
        // Load / Minimum v / Maximum v  and  Wire / Thickness v / Width v
        const sub = {};
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 2) { if (['Minimum', 'Maximum', 'Thickness', 'Width'].includes(lines[j])) sub[lines[j]] = lines[j + 1]; else break; }
        if (Object.keys(sub).length) { specs[line] = sub; i += 2 * Object.keys(sub).length; }
        continue;
      }
      if (['Minimum', 'Maximum', 'Thickness', 'Width'].includes(line)) continue;
      const v = lines[i + 1];
      if (v != null && !LABELS.includes(v) && !(line in specs)) { specs[line] = v; i++; }
    }
    return specs;
  }

  const MATERIAL_MAP = [
    [/music/i, 'A228', null], [/oil[- ]?tempered/i, 'A229', null], [/hard[- ]?drawn/i, 'A227', null],
    [/chrome[- ]?silicon/i, 'A401', null], [/chrome[- ]?vanadium/i, 'A232', null],
    [/302|18-8|304 stainless/i, 'A313', null], [/^stainless steel$/i, 'A313', 'Listed only as "stainless steel"; assumed 302 (ASTM A313).'],
    [/^spring steel$/i, 'A228', 'Listed only as "spring steel"; assumed music wire (A228).'],
  ];
  function materialOf(specs) {
    const grade = specs['Steel Grade'] || '', mat = specs.Material || '';
    for (const [re, key, note] of MATERIAL_MAP) if (re.test(grade)) return { key, note };
    for (const [re, key, note] of MATERIAL_MAP) if (re.test(mat)) return { key, note };
    return { key: null, name: grade || mat };
  }
  const ENDS = [[/closed and ground|squared and ground/i, 'sqGround'], [/closed|squared/i, 'squared'], [/open and ground|plain and ground/i, 'plainGround'], [/open|plain/i, 'plain']];

  function parse(text) {
    const t = String(text || '');
    const pnM = t.match(/\b\d{4,5}[A-Z]\d{1,4}\b/), pn = pnM ? pnM[0] : null;
    const titleM = t.match(/\n\s*((?:[A-Za-z-]+ )*(?:Compression|Extension|Torsion|Die) Spring)\s*\n\s*([^\n]+)/);
    const title = titleM ? `${titleM[1]}, ${titleM[2].trim()}` : '';
    const specs = specsOf(t), notes = [], problems = [];
    const type = (specs['Spring Type'] || titleM && titleM[1] || '').toLowerCase();
    const kind = /die/.test(type) ? 'die' : /compression/.test(type) ? 'compression' : /extension/.test(type) ? 'extension' : /torsion/.test(type) ? 'torsion' : null;
    const out = { ok: false, pn, title, kind, specs, notes, problems, model: null, listed: {} };
    if (!kind) { problems.push('This doesn’t look like a McMaster spring page (no "Spring Type" found). Copy the whole product page and paste it again.'); return out; }
    if (kind === 'die' || specs.Wire && (specs.Wire.Thickness || specs.Wire.Width) || specs.Thickness) { problems.push('Rectangular-wire (die) spring: the round-wire formulas here don’t apply.'); return out; }
    if (specs['Compression Spring Type'] && !/straight/i.test(specs['Compression Spring Type'])) { problems.push(`${specs['Compression Spring Type']} spring: only straight (cylindrical) springs are supported.`); return out; }
    if (kind === 'torsion') {
      problems.push('McMaster\u2019s torsion spring pages don\u2019t list the wire diameter, leg lengths or coil count in the page text (they\u2019re on the 2-D drawing). Switch to Torsion and enter them from the drawing.');
      return out;
    }
    const mat = materialOf(specs);
    if (!mat.key) problems.push(`Material "${mat.name || 'not listed'}" isn’t in the strength table; pick a material and enter its strength after importing.`);
    else if (mat.note) notes.push(mat.note);
    const d = length(specs['Wire Diameter']), OD = length(specs.OD), ID = length(specs.ID), L = length(specs.Length), k = rate(specs['Spring Rate']);
    const miss = [['Wire Diameter', d], ['OD', OD], ['Length', L], ['Spring Rate', k]].filter(q => !q[1]).map(q => q[0]);
    if (miss.length) { problems.push(`Missing ${miss.join(', ')} on the page; can’t size the spring without ${miss.length > 1 ? 'them' : 'it'}.`); return out; }
    const D = OD - d;
    if (ID && Math.abs(OD - ID - 2 * d) > 0.04 * d + 0.02) notes.push(`OD − ID = ${(OD - ID).toFixed(3)} mm, but 2 × wire = ${(2 * d).toFixed(3)} mm; using OD and wire diameter.`);
    const key = mat.key || 'A228';
    const base = { units: /inch/i.test(specs['System of Measurement'] || '') || /"/.test(specs.OD || '') ? 'US' : 'SI', material: mat.key || 'custom', d, D, setRemoved: false, peened: false, opFreq: 0, arbor: 0, endCond: 'fixedFixed' };
    const { E, G } = C.strength({ material: key, d });
    out.listed = { rate: k, length: L, OD, ID };
    if (kind === 'compression') {
      const Na = G * d ** 4 / (8 * D ** 3 * k);
      let ends = 'sqGround'; const et = specs['End Type'] || '';
      for (const [re, v] of ENDS) if (re.test(et)) { ends = v; break; }
      if (!et) notes.push('End type not listed; assumed closed and ground.');
      const m = { ...base, type: 'compression', Na, ends, L0: L, F1: 0, F2: 0 };
      const Fmax = notRated(specs['Maximum Load']) ? null : force(specs['Maximum Load']), Lc = length(specs['Compressed Length @ Maximum Load']);
      const r = C.solve({ ...m, F2: 1 });
      if (Fmax) { m.F2 = Fmax; out.listed.maxLoad = Fmax; }
      else if (Lc) { m.F2 = k * (L - Lc); notes.push('Maximum load not listed; F₂ set from the compressed length at maximum load.'); }
      else if (r.ok) { m.F2 = +(0.8 * r.Fs).toPrecision(4); notes.push('McMaster doesn’t rate a maximum load for this spring; F₂ set to 80% of the force to close it solid. Change it to your load.'); }
      if (Lc) {
        out.listed.Lc = Lc;
        const pred = L - (Fmax || m.F2) / k;
        notes.push(`Catalog compressed length at max load ${Lc.toFixed(2)} mm; L₀ − F/k gives ${pred.toFixed(2)} mm.`);
        if (r.ok && r.Ls > Lc + 0.02 * L) notes.push(`Computed solid height ${r.Ls.toFixed(2)} mm is longer than the catalog compressed length: the end type or rate on the page may not match this model.`);
      }
      notes.push(`Active coils backed out from the catalog rate: Nₐ = Gd⁴/(8D³k) = ${Na.toFixed(2)}.`);
      notes.push('F₁ set to 0 (load from free length). Set it to your preload for an accurate fatigue check.');
      out.model = m;
    } else {
      const Na = G * d ** 4 / (8 * D ** 3 * k), Nb = Na - G / E;
      const ld = specs.Load || {}, Fmin = notRated(ld.Minimum) ? 0 : force(ld.Minimum), Fmax = notRated(ld.Maximum) ? null : force(ld.Maximum);
      const m = { ...base, type: 'extension', Nb, Fi: Fmin || 0, F1: Fmin || 0, F2: 0, r1: 0, r2: 0 };
      const Le = length(specs['Extended Length @ Maximum Load']);
      if (Fmax) { m.F2 = Fmax; out.listed.maxLoad = Fmax; }
      else if (Le) m.F2 = (Fmin || 0) + k * (Le - L);
      else { m.F2 = +((Fmin || 0) * 3 || 1).toPrecision(4); notes.push('Maximum load not listed; F₂ is a placeholder. Enter your load.'); }
      out.listed.Fi = Fmin;
      notes.push(`Initial tension taken as McMaster’s minimum load (${(Fmin || 0).toFixed(2)} N).`);
      notes.push(`Body coils backed out from the catalog rate: N_b = Gd⁴/(8D³k) − G/E = ${Nb.toFixed(2)}.`);
      const pred = (2 * (D / d) - 1 + Nb) * d;
      notes.push(`Catalog length ${L.toFixed(2)} mm; machine-loop formula (2C − 1 + N_b)d gives ${pred.toFixed(2)} mm inside the loops.`);
      if (Le && Fmax) notes.push(`Catalog extended length at max load ${Le.toFixed(2)} mm; L + (F − Fᵢ)/k gives ${(L + (Fmax - (Fmin || 0)) / k).toFixed(2)} mm.`);
      if (!/loop|hook/i.test(specs['End Type'] || 'loop')) notes.push(`End type "${specs['End Type']}": hook stresses assume standard machine loops.`);
      out.model = m;
    }
    out.model.name = `McMaster ${pn || ''}${title ? ' · ' + title : ''}`.trim();
    out.model.source = { vendor: 'McMaster-Carr', pn, title, url: pn ? `https://www.mcmaster.com/${pn}/` : null, listed: out.listed };
    out.ok = !problems.length;
    return out;
  }
  return { parse, specsOf, length, force, rate, torque };
})();
if (typeof module !== 'undefined') module.exports = McMaster;
