// Spring Bench — UI. Model (always SI internally) → Core.solve → inputs, results, drawing and charts.
// The slider (or hovering a chart) moves the spring through its travel. Autosaves to localStorage;
// files go through the claude.ai `downloads` capability in an artifact, a plain download elsewhere.
(() => {
  'use strict';
  const STORE_KEY = 'spring-bench:model:v1';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = Explain.num;
  let model, res, downloads = null, stateT = 0.6;
  const undoStack = [], redoStack = [];
  const U = () => Explain.UNITS[model.units] || Explain.UNITS.SI;
  const fu = (kind, v, sig) => `${num(v * U()[kind][1], sig)} ${U()[kind][0]}`;

  const DEFAULTS = {
    compression: { Na: 8, ends: 'sqGround', L0: 40, F1: 10, F2: 30, endCond: 'fixedFixed' },
    extension: { Nb: 20, Fi: 5, F1: 10, F2: 25, r1: 0, r2: 0 },
    torsion: { Nb: 5, L1: 20, L2: 20, M1: 50, M2: 150, arbor: 0 },
  };
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(model)); } catch (e) { /* storage unavailable */ } }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3400); }
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function edit(fn) { undoStack.push(JSON.stringify(model)); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; fn(); update(); }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(model)); model = JSON.parse(undoStack.pop()); update(); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(model)); model = JSON.parse(redoStack.pop()); update(); }
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && tag !== 'input') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (e.key === 'Escape' && mathOpen) closeMath();
  });

  function update() {
    res = Core.solve(model);
    persist(); renderInputs(); renderResults(); renderStatus(); syncState(); draw();
    if (mathOpen) renderMath();
  }
  function renderStatus() {
    const st = $('#status'); $('#modelName').textContent = model.name || '';
    if (!res.ok) { st.textContent = res.message; st.classList.add('bad'); return; }
    const n = res.checks.length, pass = res.checks.filter(c => c.status === 'pass').length, fail = res.checks.some(c => c.status === 'fail');
    st.classList.toggle('bad', fail);
    const rate = model.type === 'torsion' ? fu('kt', res.kDeg) : fu('k', res.k);
    st.textContent = `${model.type[0].toUpperCase() + model.type.slice(1)} · ${rate} · ${pass} of ${n} checks pass`;
  }

  // ---------- inputs ----------
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
    for (const k of kids) if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    return e;
  }
  // kind: unit kind for conversion (L, F, M, S, E) or null for plain numbers
  function numField(key, label, kind, o = {}) {
    const f = kind ? U()[kind][1] : 1, v = model[key];
    const inp = h('input', { type: 'number', step: 'any', value: v == null || v === '' ? '' : +(+(v * f).toPrecision(10)).toPrecision(6), 'data-key': key, list: o.list || null });
    inp.addEventListener('change', () => {
      const x = parseFloat(inp.value);
      if (!isFinite(x) || (o.min != null && x < o.min)) { inp.value = +(model[key] * f).toPrecision(6); return; }
      edit(() => { model[key] = x / f; });
    });
    return h('label', { class: 'field' }, h('span', { text: label }), h('span', { class: 'inp' }, inp, kind ? h('em', { text: U()[kind][0] }) : o.unit ? h('em', { text: o.unit }) : null));
  }
  function selField(key, label, options, wide) {
    const s = h('select', { 'data-key': key, class: wide ? 'wide' : null });
    for (const [v, t] of options) s.appendChild(h('option', { value: v, text: t, selected: v === model[key] }));
    s.addEventListener('change', () => edit(() => { model[key] = s.value; }));
    return wide ? h('div', { class: 'field' }, s) : h('label', { class: 'field' }, h('span', { text: label }), s);
  }
  function optField(key, label) {
    const c = h('input', { type: 'checkbox', 'data-key': key }); c.checked = !!model[key];
    c.addEventListener('change', () => edit(() => { model[key] = c.checked; }));
    return h('label', { class: 'optn' }, c, h('span', { text: label }));
  }
  function seg(options, value, onPick) {
    const s = h('div', { class: 'seg' });
    for (const [v, t] of options) s.appendChild(h('button', { text: t, class: v === value ? 'on' : null, onclick: () => onPick(v) }));
    return s;
  }
  function renderInputs() {
    const box = $('#inputs'), focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    box.innerHTML = '';
    const pnIn = h('input', { type: 'text', placeholder: 'e.g. 9657K311', 'data-key': '_pn', value: model.source && model.source.pn || '', autocapitalize: 'characters', spellcheck: 'false' });
    pnIn.addEventListener('keydown', e => { if (e.key === 'Enter') openImport(pnIn.value); });
    box.append(h('h2', { text: 'McMaster-Carr part' }), h('div', { class: 'mmrow' }, h('span', { class: 'inp' }, pnIn), h('button', { class: 'btn small', text: 'Import…', onclick: () => openImport(pnIn.value) })));
    if (model.source && model.source.pn) box.append(h('p', { class: 'srcbadge', html: `From <a href="${model.source.url}" target="_blank" rel="noopener">McMaster ${model.source.pn}</a>${model.source.title ? ': ' + model.source.title.replace(/[<>&]/g, '') : ''}` }));
    box.append(h('h2', { text: 'Spring' }), seg([['compression', 'Compression'], ['extension', 'Extension'], ['torsion', 'Torsion']], model.type, t => edit(() => {
      model.type = t; for (const [k, v] of Object.entries(DEFAULTS[t])) if (model[k] == null) model[k] = v;
    })));
    box.append(h('div', { style: 'height:8px' }), seg([['SI', 'mm, N'], ['US', 'in, lbf']], model.units, u => { model.units = u; update(); }));
    box.append(h('h2', { text: 'Wire' }), selField('material', '', Object.entries(Core.MATERIALS).map(([k, m]) => [k, m.name]), true));
    if (model.material === 'custom') box.append(numField('Sut', 'Tensile strength Sᵤₜ', 'S', { min: 0 }), numField('E', 'E', 'E', { min: 0 }), numField('G', 'G', 'E', { min: 0 }));
    const dl = h('datalist', { id: 'wires' }); for (const w of (model.units === 'US' ? Core.WIRE_IN : Core.WIRE_MM)) dl.append(h('option', { value: w })); box.append(dl);
    box.append(numField('d', 'Wire diameter d', 'L', { min: 0, list: 'wires' }), numField('D', 'Mean diameter D', 'L', { min: 0 }));
    if (res && res.ok) box.append(h('p', { class: 'note', text: `OD ${fu('L', res.OD)}, ID ${fu('L', res.ID)}, index C = ${num(res.C, 3)}` }));
    if (model.type === 'compression') {
      box.append(h('h2', { text: 'Coils and ends' }), numField('Na', 'Active coils Nₐ', null, { min: 0.5 }), selField('ends', 'Ends', Object.entries(Core.ENDS).map(([k, e]) => [k, e.name])), numField('L0', 'Free length L₀', 'L', { min: 0 }));
      box.append(h('h2', { text: 'Working loads' }), numField('F1', 'Force F₁ (min)', 'F', { min: 0 }), numField('F2', 'Force F₂ (max)', 'F', { min: 0 }));
      box.append(h('h2', { text: 'Service' }), selField('endCond', 'Ends held', [['fixedFixed', 'Flat parallel plates'], ['fixedPinned', 'One plate, one pivot'], ['pinnedPinned', 'Both pivoted'], ['fixedFree', 'One end free']]),
        numField('opFreq', 'Cycling frequency', null, { min: 0, unit: 'Hz' }), optField('setRemoved', 'Set removed (preset)'), optField('peened', 'Shot-peened'));
    } else if (model.type === 'extension') {
      box.append(h('h2', { text: 'Coils and hooks' }), numField('Nb', 'Body coils N_b', null, { min: 1 }), numField('Fi', 'Initial tension Fᵢ', 'F', { min: 0 }),
        numField('r1', 'Hook bend radius r₁', 'L', { min: 0 }), numField('r2', 'Hook side radius r₂', 'L', { min: 0 }));
      box.append(h('p', { class: 'note', text: 'Leave r₁ or r₂ at 0 for the usual D/2 and 2d.' }));
      box.append(h('h2', { text: 'Working loads' }), numField('F1', 'Force F₁ (min)', 'F', { min: 0 }), numField('F2', 'Force F₂ (max)', 'F', { min: 0 }), optField('peened', 'Shot-peened'));
    } else {
      box.append(h('h2', { text: 'Coils and legs' }), numField('Nb', 'Body coils N_b', null, { min: 0.5 }), numField('L1', 'Leg length L₁', 'L', { min: 0 }), numField('L2', 'Leg length L₂', 'L', { min: 0 }), numField('arbor', 'Arbor diameter', 'L', { min: 0 }));
      box.append(h('h2', { text: 'Working moments' }), numField('M1', 'Moment M₁ (min)', 'M', { min: 0 }), numField('M2', 'Moment M₂ (max)', 'M', { min: 0 }));
    }
    // Design helpers
    box.append(h('h2', { text: 'Design helpers' }));
    const rk = model.type === 'torsion' ? 'kt' : 'k', target = h('input', { type: 'number', step: 'any', placeholder: 'rate', 'data-key': '_rate' });
    box.append(h('div', { class: 'helper' }, h('span', { class: 'inp' }, target, h('em', { text: U()[rk][0] })), h('button', { class: 'btn small', text: 'Set coils for this rate', onclick: () => {
      const v = parseFloat(target.value); if (!(v > 0)) { toast('Enter a target rate first.'); return; }
      const k = model.type === 'torsion' ? v / U().kt[1] * 360 : v / U().k[1];
      const n = Core.coilsForRate(model, k); if (!(n > 0)) { toast('No positive coil count gives that rate.'); return; }
      edit(() => { if (model.type === 'compression') model.Na = +n.toFixed(2); else model.Nb = +n.toFixed(2); });
      toast(`${model.type === 'compression' ? 'Active' : 'Body'} coils set to ${n.toFixed(2)}.`);
    } })));
    if (model.type === 'compression') box.append(h('div', { class: 'helper' }, h('button', { class: 'btn small', text: 'Free length for 15% overrun', onclick: () => {
      const L0 = Core.freeLengthFor(model, 0.15); if (!L0) return; edit(() => { model.L0 = +L0.toFixed(2); }); toast(`Free length set to ${fu('L', L0)}.`);
    } })));
    box.append(h('div', { class: 'helper' }, h('button', { class: 'btn small', text: 'Snap d to a standard size', onclick: () => {
      const list = model.units === 'US' ? Core.WIRE_IN.map(x => x * 25.4) : Core.WIRE_MM;
      const best = list.reduce((a, b) => Math.abs(b - model.d) < Math.abs(a - model.d) ? b : a);
      edit(() => { model.d = best; }); toast(`Wire diameter set to ${fu('L', best)}.`);
    } })));
    if (focusKey) { const el = box.querySelector(`[data-key="${focusKey}"]`); if (el) el.focus(); }
  }

  // ---------- results ----------
  const ICONS = { pass: '<path d="M4 10l4 4 8-9"/>', warn: '<path d="M10 4v7"/><path d="M10 15v.5"/>', fail: '<path d="M5 5l10 10M15 5L5 15"/>' };
  function renderResults() {
    const box = $('#results'); box.innerHTML = '';
    if (!res.ok) { box.append(h('h2', { text: 'Results' }), h('p', { class: 'note', text: res.message })); return; }
    box.append(h('h2', { text: 'Results' }));
    const stat = (v, l) => h('div', { class: 'stat' }, h('b', { text: v, title: v }), h('span', { text: l }));
    if (model.type === 'compression') box.append(h('div', { class: 'stats' }, stat(fu('k', res.k), 'Rate k'), stat(fu('S', res.Sut, 4), 'Wire Sᵤₜ'), stat(fu('L', res.Ls), 'Solid height'), stat(fu('F', res.Fs), 'Force at solid'), stat(`${num(res.freq, 3)} Hz`, 'Surge frequency'), stat(fu('m', res.mass, 3), 'Mass')));
    else if (model.type === 'extension') box.append(h('div', { class: 'stats' }, stat(fu('k', res.k), 'Rate k'), stat(fu('S', res.Sut, 4), 'Wire Sᵤₜ'), stat(fu('L', res.L0), 'Free length (inside hooks)'), stat(fu('F', res.Fi), 'Initial tension'), stat(fu('m', res.mass, 3), 'Mass'), stat(fu('L', res.wireLength, 4), 'Wire length')));
    else box.append(h('div', { class: 'stats' }, stat(fu('kt', res.kDeg), 'Rate'), stat(fu('S', res.Sut, 4), 'Wire Sᵤₜ'), stat(fu('L', res.Lbody), 'Body length'), stat(fu('L', res.arborMax), 'Max arbor at M₂'), stat(fu('m', res.mass, 3), 'Mass'), stat(num(res.Na, 3), 'Active coils')));
    box.append(h('h2', { text: 'Checks' }));
    const ul = h('ul', { class: 'checks' });
    // check details are written in mm; show them in the chosen units
    const inUnits = t => model.units === 'US' ? t.replace(/(\d*\.?\d+)(–(\d*\.?\d+))? mm/g, (_, a1, _r, b1) => b1 ? `${num(a1 / 25.4, 3)}–${num(b1 / 25.4, 3)} in` : `${num(a1 / 25.4, 3)} in`) : t;
    for (const c of res.checks) ul.append(h('li', { class: c.status }, h('span', { html: `<svg viewBox="0 0 20 20">${ICONS[c.status]}</svg>`, 'aria-label': c.status }), h('div', {}, h('b', { text: c.label }), h('span', { text: inUnits(c.detail) }))));
    box.append(ul);
    const src = model.source;
    if (src && src.listed && model.type !== 'torsion') {
      const L = src.listed, rows = [];
      if (L.rate) rows.push(['Rate', fu('k', L.rate, 4), fu('k', res.k, 4)]);
      if (L.maxLoad) rows.push(['Max load', fu('F', L.maxLoad, 4), model.type === 'compression' ? `n = ${num(Core.solve({ ...model, F2: L.maxLoad }).n2, 3)}` : `n = ${num(Core.solve({ ...model, F2: L.maxLoad }).nBody, 3)}`]);
      if (L.Lc && model.type === 'compression') rows.push(['Length at max load', fu('L', L.Lc, 4), fu('L', model.L0 - (L.maxLoad || model.F2) / res.k, 4)]);
      if (L.Fi != null && model.type === 'extension') rows.push(['Initial tension', fu('F', L.Fi, 4), fu('F', res.Fi, 4)]);
      if (rows.length) {
        box.append(h('h2', { text: `Catalog check · ${src.pn}` }));
        const tc = h('table', { class: 'pts' }); tc.append(h('tr', {}, ...['', 'McMaster', 'Spring Bench'].map(x => h('th', { text: x }))));
        for (const r of rows) tc.append(h('tr', {}, ...r.map(x => h('td', { text: x }))));
        box.append(tc);
      }
    }
    box.append(h('h2', { text: 'Working points' }));
    const t = h('table', { class: 'pts' });
    if (model.type === 'torsion') {
      t.append(h('tr', {}, ...['', 'Moment', 'Angle', 'σ', 'ID′'].map(x => h('th', { text: x }))));
      for (const p of res.points) t.append(h('tr', {}, h('td', { text: p.label }), h('td', { text: fu('M', p.M, 3) }), h('td', { text: `${num(p.deg, 3)}°` }), h('td', { text: fu('S', p.sigma, 3) }), h('td', { text: fu('L', p.IDp, 3) })));
    } else {
      t.append(h('tr', {}, ...['', 'Force', 'Deflection', 'Length', 'τ'].map(x => h('th', { text: x }))));
      for (const p of res.points) t.append(h('tr', {}, h('td', { text: p.label }), h('td', { text: fu('F', p.F, 3) }), h('td', { text: fu('L', p.y, 3) }), h('td', { text: fu('L', p.L, 4) }), h('td', { text: fu('S', p.tau, 3) })));
    }
    box.append(t);
    box.append(h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn primary', text: 'Show the math', onclick: openMath })));
  }

  // ---------- state slider ----------
  const slider = $('#state');
  function curState() { if (!res.ok) return null; return res.state(stateT * res.yMax); }
  function syncState() {
    $('#stateLbl').textContent = { compression: 'Compress', extension: 'Stretch', torsion: 'Twist' }[model.type];
    slider.value = Math.round(stateT * 1000);
    const s = curState(); if (!s) { $('#stateOut').textContent = ''; return; }
    $('#stateOut').textContent = model.type === 'torsion' ? `${num(s.deg, 3)}° · M ${fu('M', s.M, 3)} · σ ${fu('S', s.sigma, 3)}`
      : `y ${fu('L', s.y, 3)} · L ${fu('L', s.L, 4)} · F ${fu('F', s.F, 3)} · τ ${fu('S', s.tau, 3)}`;
  }
  slider.addEventListener('input', () => { stateT = slider.value / 1000; syncState(); draw(); });

  // ---------- canvas ----------
  const cv = $('#cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, charts = [];
  function resize() { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0); draw(); }
  function text(t, x, y, o = {}) {
    ctx.font = o.font || '500 12px "IBM Plex Mono", ui-monospace, monospace'; ctx.fillStyle = o.color || css('--ink-2');
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle'; ctx.fillText(t, x, y);
  }
  function arrow(x1, y1, x2, y2, color, w = 1.8, head = 8) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(a - 0.4), y2 - head * Math.sin(a - 0.4)); ctx.lineTo(x2 - head * Math.cos(a + 0.4), y2 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  function draw() {
    if (!W || !model) return;
    ctx.clearRect(0, 0, W, H); charts = [];
    if (!res.ok) { text(res.message, W / 2, H / 2, { color: css('--fail'), font: '500 14px "IBM Plex Sans", sans-serif' }); return; }
    const narrow = W < 620, topH = narrow ? Math.min(300, H * 0.34) : Math.max(200, H * 0.44);
    drawSpring({ x: 16, y: 6, w: W - 32, h: topH - 12 });
    const rows = narrow ? 1 : 1, gy = topH + 8, list = chartList();
    if (narrow) {
      const ch = (H - gy - 10) / list.length;
      list.forEach((c, i) => drawChart(c, { x: 8, y: gy + i * ch, w: W - 16, h: ch - 10 }));
    } else {
      const cw = (W - 16) / list.length;
      list.forEach((c, i) => drawChart(c, { x: 8 + i * cw, y: gy, w: cw - 10, h: H - gy - 10 }));
    }
    void rows;
  }

  // Helix side view (compression/extension) or end view (torsion).
  function drawSpring(b) {
    const s = curState(), wire = css('--wire'), hi = css('--wire-hi'), d = model.d, D = model.D;
    if (model.type === 'torsion') {
      // End view: coil circle, fixed leg along the top to the left, moving leg from the bottom to the right,
      // rotated counterclockwise (closing toward the fixed leg) by the current angle.
      const Dnow = D * res.Nb / (res.Nb + s.deg / 360), Lm = Math.max(model.L1, model.L2, D);
      const sc = Math.min((b.h - 50) / 2 / (D / 2 + Lm), (b.w / 2 - 40) / (D / 2 + Lm));
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 10, R = Dnow / 2 * sc, l1 = model.L1 * sc, l2 = model.L2 * sc, lw = Math.max(2, d * sc);
      const rot = (x, y, th) => [cx + (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th), cy - (x - cx) * Math.sin(th) + (y - cy) * Math.cos(th)];
      ctx.lineCap = 'round';
      if (+model.arbor > 0) { ctx.fillStyle = css('--grid'); ctx.beginPath(); ctx.arc(cx, cy, model.arbor / 2 * sc, 0, 2 * Math.PI); ctx.fill(); }
      const th = s.deg * Math.PI / 180;
      // free position ghost of the moving leg
      ctx.strokeStyle = css('--ink-3'); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(cx, cy + D / 2 * sc); ctx.lineTo(cx + l2, cy + D / 2 * sc); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = wire; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx - l1, cy - R); ctx.stroke();
      const p0 = rot(cx, cy + R, th), p1 = rot(cx + l2, cy + R, th);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
      ctx.fillStyle = css('--solid'); ctx.fillRect(cx - l1 - 6, cy - R - lw / 2 - 16, 6, 16 + lw);
      text('fixed leg', cx - l1, cy - R - lw / 2 - 26, { color: css('--ink-3'), font: '11px "IBM Plex Sans", sans-serif' });
      if (th > 0.005) {
        const ra = l2 * 0.85;
        ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, ra, Math.atan2(R, ra) , Math.atan2(R, ra) - th, true); ctx.stroke();
        const lm = Math.atan2(R, ra) - th / 2;
        text(`${num(s.deg, 3)}°`, cx + (ra + 22) * Math.cos(lm), cy + (ra + 22) * Math.sin(lm), { color: css('--accent'), font: '600 12px "IBM Plex Mono", monospace' });
      }
      // force at the leg tip, perpendicular, pushing it closed
      const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty), nx = ty / tl, ny = -tx / tl;
      if (s.M > 0) arrow(p1[0] - nx * 44, p1[1] - ny * 44, p1[0] - nx * 6, p1[1] - ny * 6, css('--force'), 2, 8);
      text(`M = ${fu('M', s.M, 3)}`, b.x + 4, b.y + 14, { align: 'left', color: css('--force') });
      text(`coil ID ${fu('L', Dnow - d, 4)} (free ${fu('L', D - d, 4)})${+model.arbor > 0 ? `, arbor ${fu('L', +model.arbor, 3)}` : ''}`, b.x + 4, b.y + 32, { align: 'left', color: css('--ink-3') });
      return;
    }
    // compression / extension side view, to scale
    const ext = model.type === 'extension';
    const Lmax = ext ? res.L0 + res.yMax + D : model.L0;
    const sc = Math.min((b.w - 120) / Lmax, (b.h - 60) / (D + d));
    const cy = b.y + b.h / 2, L = s.L;
    const x0 = b.x + (b.w - (ext ? L + D : L) * sc) / 2;
    const coils = [];
    if (ext) {
      const Nb = res.Nb, pitch = d + s.y / Nb, start = D / 2;
      for (let t = 0; t <= Nb; t += 1 / 48) coils.push([start + d / 2 + t * pitch, t]);
    } else {
      const e = res.ends, half = e.Ne / 2, pa = Math.max(d, (L - d - e.Ne * d) / res.Na), Nt = res.Nt;
      for (let t = 0; t <= Nt + 1e-9; t += 1 / 48) {
        const z = d / 2 + Math.min(t, half) * d + clamp(t - half, 0, res.Na) * pa + Math.max(0, t - half - res.Na) * d;
        coils.push([z, t]);
      }
    }
    const X = z => x0 + z * sc, R = D / 2 * sc, lw = Math.max(1.6, d * sc);
    // back half first, then front half
    for (const front of [false, true]) {
      ctx.strokeStyle = front ? wire : hi; ctx.lineWidth = front ? lw : lw * 0.85; ctx.lineCap = 'round'; ctx.globalAlpha = front ? 1 : 0.55;
      ctx.beginPath(); let on = false;
      for (const [z, t] of coils) {
        const isFront = Math.sin(2 * Math.PI * t) >= 0, x = X(z), y = cy - R * Math.cos(2 * Math.PI * t);
        if (isFront === front) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false;
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    const zEnd = coils[coils.length - 1][0];
    if (ext) {
      // hooks: full loops in the axial plane at both ends
      ctx.strokeStyle = wire; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(X(D / 2) - R + lw / 2, cy, R, Math.PI * 0.5, Math.PI * 2.5 - 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(X(zEnd + d / 2) + R - lw / 2, cy, R, -Math.PI * 0.5, Math.PI * 1.5 - 0.6); ctx.stroke();
      arrow(X(D / 2) - 2 * R - 4, cy, X(D / 2) - 2 * R - 44, cy, css('--force'), 2);
      arrow(X(zEnd + d / 2) + 2 * R + 4, cy, X(zEnd + d / 2) + 2 * R + 44, cy, css('--force'), 2);
      text(`F = ${fu('F', s.F, 3)}`, X(zEnd + d / 2) + 2 * R + 24, cy - R - 16, { color: css('--force') });
    } else {
      // end plates
      ctx.fillStyle = css('--solid'); ctx.globalAlpha = 0.5;
      ctx.fillRect(X(0) - 8, cy - R - 16, 8, 2 * R + 32); ctx.fillRect(X(L), cy - R - 16, 8, 2 * R + 32); ctx.globalAlpha = 1;
      if (s.F > 0) { arrow(X(L) + 54, cy, X(L) + 12, cy, css('--force'), 2.2, 9); text(`F = ${fu('F', s.F, 3)}`, X(L) + 34, cy - 16, { color: css('--force') }); }
      // free length ghost
      ctx.strokeStyle = css('--ink-3'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(model.L0) + 4, cy - R - 16); ctx.lineTo(X(model.L0) + 4, cy + R + 16); ctx.stroke(); ctx.setLineDash([]);
      text('L₀', X(model.L0) + 4, cy - R - 26, { color: css('--ink-3') });
    }
    // dimensions
    const yd = cy + R + 30;
    ctx.strokeStyle = css('--ink-3'); ctx.lineWidth = 1;
    const xa = ext ? X(D / 2) - 2 * R : X(0), xb = ext ? X(zEnd + d / 2) + 2 * R : X(L);
    ctx.beginPath(); ctx.moveTo(xa, yd); ctx.lineTo(xb, yd); ctx.moveTo(xa, yd - 5); ctx.lineTo(xa, yd + 5); ctx.moveTo(xb, yd - 5); ctx.lineTo(xb, yd + 5); ctx.stroke();
    text(`${ext ? 'length inside hooks' : 'length'} ${fu('L', ext ? L : L, 4)}`, (xa + xb) / 2, yd + 12, { color: css('--ink-2') });
    const xo = Math.max(b.x + 14, xa - 26);
    ctx.beginPath(); ctx.moveTo(xo, cy - R - lw / 2); ctx.lineTo(xo, cy + R + lw / 2); ctx.stroke();
    text(`OD ${fu('L', D + d, 3)}`, xo - 4, cy - R - lw / 2 - 10, { align: 'left', color: css('--ink-3') });
  }

  // Chart definitions per spring type: x is deflection (or angle) unless noted.
  function chartList() {
    const t = model.type, list = [];
    const yMax = res.yMax, n = 80, xs = Array.from({ length: n + 1 }, (_, i) => yMax * i / n), states = xs.map(x => res.state(x));
    const Lk = t === 'torsion' ? null : 'L';
    if (t === 'torsion') {
      list.push({ id: 'force', title: 'Moment vs angle', xLabel: '°', yLabel: U().M[0], xf: 1, yf: U().M[1], xs, ys: states.map(q => q.M), color: '--force', pts: res.points.map(p => [p.deg, p.M, p.label]), slide: true });
      list.push({ id: 'stress', title: 'Bending stress', xLabel: '°', yLabel: U().S[0], xf: 1, yf: U().S[1], xs, ys: states.map(q => q.sigma), color: '--stress', pts: res.points.map(p => [p.deg, p.sigma, p.label]), limit: [res.Sy, 'allowable'], slide: true });
      return list;
    }
    list.push({ id: 'force', title: t === 'extension' ? 'Force vs extension' : 'Force vs deflection', xLabel: U()[Lk][0], yLabel: U().F[0], xf: U().L[1], yf: U().F[1], xs, ys: states.map(q => q.F), color: '--force',
      pts: [...res.points.map(p => [p.y, p.F, p.label]), ...(t === 'compression' ? [[res.ys, res.Fs, 'solid']] : [])],
      vline: t === 'compression' && isFinite(res.buckling.yCr) && res.buckling.yCr < res.ys ? [res.buckling.yCr, 'buckles'] : null, slide: true });
    list.push({ id: 'stress', title: 'Shear stress', xLabel: U().L[0], yLabel: U().S[0], xf: U().L[1], yf: U().S[1], xs, ys: states.map(q => q.tau), color: '--stress',
      pts: res.points.map(p => [p.y, p.tau, p.label]), limit: [res.Ssy, 'allowable'], slide: true });
    if (res.fatigue) list.push({ id: 'fatigue', fatigue: res.fatigue, title: 'Fatigue (Gerber)' });
    return list;
  }
  function niceStep(span, n) { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function drawChart(c, b) {
    const pad = { l: 52, r: 12, t: 24, b: 34 }, px = b.x + pad.l, py = b.y + pad.t, pw = b.w - pad.l - pad.r, ph = b.h - pad.t - pad.b;
    if (pw < 60 || ph < 40) return;
    text(c.fatigue ? `${c.title}, ${U().S[0]}` : `${c.title}, ${c.yLabel}`, b.x + 6, b.y + 9, { align: 'left', font: '600 12.5px "IBM Plex Sans Condensed", sans-serif', color: css('--ink-2') });
    let xMax, yMax, xs, ys, xf, yf;
    if (c.fatigue) {
      const f = c.fatigue; xf = yf = U().S[1];
      xMax = f.Ssu * 1.05; yMax = Math.max(f.Sse, f.SseG, f.ta) * 1.1;
    } else {
      xf = c.xf; yf = c.yf; xs = c.xs; ys = c.ys;
      xMax = Math.max(...xs) || 1; yMax = Math.max(...ys, ...(c.limit ? [c.limit[0]] : []), ...c.pts.map(p => p[1])) * 1.1 || 1;
    }
    const X = v => px + v / xMax * pw, Y = v => py + ph - v / yMax * ph;
    // grid + ticks (display units)
    ctx.lineWidth = 1; ctx.strokeStyle = css('--grid');
    const sx = niceStep(xMax * xf, 4), sy = niceStep(yMax * yf, 4);
    for (let v = 0; v <= xMax * xf + 1e-9; v += sx) { const x = Math.round(X(v / xf)) + 0.5; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + ph); ctx.stroke(); text(num(v, 3), x, py + ph + 11, { color: css('--ink-3'), font: '11px "IBM Plex Mono", monospace' }); }
    for (let v = 0; v <= yMax * yf + 1e-9; v += sy) { const y = Math.round(Y(v / yf)) + 0.5; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); text(num(v, 3), px - 6, y, { align: 'right', color: css('--ink-3'), font: '11px "IBM Plex Mono", monospace' }); }
    ctx.strokeStyle = css('--ink-3'); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke();
    if (c.fatigue) {
      const f = c.fatigue, S = U().S[0];
      text('τₘ mean (τₐ alternating up)', px + pw, py + ph + 26, { align: 'right', color: css('--ink-3'), font: '11px "IBM Plex Sans", sans-serif' });
      ctx.strokeStyle = css('--limit'); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const m = f.Ssu * i / 60, a = f.Sse * (1 - (m / f.Ssu) ** 2); i ? ctx.lineTo(X(m), Y(a)) : ctx.moveTo(X(m), Y(a)); } ctx.stroke();
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(0), Y(f.SseG)); ctx.lineTo(X(f.Ssu), Y(0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = css('--ink-3'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(f.Sm), Y(f.Sa)); ctx.stroke();
      ctx.fillStyle = css('--stress'); ctx.beginPath(); ctx.arc(X(f.tm), Y(f.ta), 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = css('--limit'); ctx.beginPath(); ctx.arc(X(f.Sm), Y(f.Sa), 3.5, 0, 2 * Math.PI); ctx.fill();
      text(`n_f = ${num(f.nf, 3)}`, X(f.tm) + 8, Y(f.ta) - 10, { align: 'left', color: css('--stress'), font: '600 12px "IBM Plex Mono", monospace' });
      text('Gerber', X(f.Ssu * 0.72) + 6, Y(f.Sse * (1 - 0.5184)), { align: 'left', color: css('--limit'), font: '11px "IBM Plex Sans", sans-serif' });
      text('Goodman', X(f.Ssu * 0.12) + 8, Y(f.SseG * 0.88) - 4, { align: 'left', color: css('--limit'), font: '11px "IBM Plex Sans", sans-serif' });
      void S;
      return;
    }
    text(`${c.xLabel}`, px + pw, py + ph + 26, { align: 'right', color: css('--ink-3'), font: '11px "IBM Plex Sans", sans-serif' });
    if (c.limit) {
      ctx.strokeStyle = css('--limit'); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, Y(c.limit[0])); ctx.lineTo(px + pw, Y(c.limit[0])); ctx.stroke(); ctx.setLineDash([]);
      text(c.limit[1], px + pw - 4, Y(c.limit[0]) - 9, { align: 'right', color: css('--limit'), font: '11px "IBM Plex Sans", sans-serif' });
    }
    if (c.vline) {
      ctx.strokeStyle = css('--fail'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(c.vline[0]), py); ctx.lineTo(X(c.vline[0]), py + ph); ctx.stroke(); ctx.setLineDash([]);
      text(c.vline[1], X(c.vline[0]) + 4, py + 10, { align: 'left', color: css('--fail'), font: '11px "IBM Plex Sans", sans-serif' });
    }
    ctx.strokeStyle = css(c.color); ctx.lineWidth = 2; ctx.beginPath(); xs.forEach((x, i) => i ? ctx.lineTo(X(x), Y(ys[i])) : ctx.moveTo(X(x), Y(ys[i]))); ctx.stroke();
    for (const [x, y, l] of c.pts) {
      if (x > xMax * 1.0001) continue;
      ctx.fillStyle = l === 'solid' ? css('--solid') : css(c.color); ctx.beginPath(); ctx.arc(X(x), Y(y), 4, 0, 2 * Math.PI); ctx.fill();
      text(l, X(x) - 6, Y(y) - 10, { align: 'right', color: css('--ink-2'), font: '11px "IBM Plex Mono", monospace' });
    }
    // current state
    const s = curState(), sxv = model.type === 'torsion' ? s.deg : s.y, syv = c.id === 'force' ? (model.type === 'torsion' ? s.M : s.F) : (model.type === 'torsion' ? s.sigma : s.tau);
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(sxv) + 0.5, py); ctx.lineTo(X(sxv) + 0.5, py + ph); ctx.stroke();
    ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.arc(X(sxv), Y(syv), 4.5, 0, 2 * Math.PI); ctx.fill();
    if (c.slide) charts.push({ px, pw, py, ph, xMax });
  }
  // Hovering or dragging on a chart moves the spring to that deflection.
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const c = charts.find(q => x >= q.px && x <= q.px + q.pw && y >= q.py && y <= q.py + q.ph);
    if (!c || (e.pointerType === 'touch' && !e.pressure)) return;
    stateT = clamp((x - c.px) / c.pw * c.xMax / res.yMax, 0, 1); syncState(); draw();
  });

  // ---------- math drawer ----------
  let mathOpen = false;
  function renderMath() {
    $('#mathSub').textContent = model.name || '';
    const body = $('#mathBody'), wasOpen = [...body.querySelectorAll('details')].map(d => d.open);
    body.innerHTML = '';
    Explain.explain(model, res).forEach((s, i) => {
      const d = h('details', {}); d.open = wasOpen.length ? !!wasOpen[i] : i < 4;
      d.append(h('summary', { text: s.title }), h('div', { html: s.html })); body.append(d);
    });
  }
  function openMath() { mathOpen = true; renderMath(); $('#math').classList.add('open'); $('#math').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; }
  function closeMath() { mathOpen = false; $('#math').classList.remove('open'); $('#math').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }
  $('#mathBtn').addEventListener('click', () => mathOpen ? closeMath() : openMath());
  $('#mathClose').addEventListener('click', closeMath); $('#scrim').addEventListener('click', closeMath);

  // ---------- files ----------
  async function offerFile(filename, data) {
    if (downloads) { try { await downloads.save({ filename, data }); toast(`Saved ${filename}.`); } catch (err) { if (!err || err.code !== 'declined') toast(`Could not save ${filename} here.`); } return; }
    if (window.claude && window.claude.use) { toast('Saving files is not available in this view.'); return; }
    const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const fileSafe = s => (s || 'spring').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'spring';
  function specCSV() {
    if (!res.ok) return null;
    const rows = [['Spring Bench spec', model.name || ''], ['Type', model.type], ['Material', res.mat.name], ['Wire d', fu('L', model.d, 5)], ['Mean D', fu('L', model.D, 5)], ['OD', fu('L', res.OD, 5)], ['ID', fu('L', res.ID, 5)], ['Index C', num(res.C, 4)]];
    if (model.type === 'compression') rows.push(['Active coils', num(res.Na, 4)], ['Total coils', num(res.Nt, 4)], ['Ends', res.ends.name], ['Free length', fu('L', model.L0, 5)], ['Solid height', fu('L', res.Ls, 5)], ['Rate', fu('k', res.k, 5)]);
    if (model.type === 'extension') rows.push(['Body coils', num(res.Nb, 4)], ['Free length inside hooks', fu('L', res.L0, 5)], ['Initial tension', fu('F', res.Fi, 4)], ['Rate', fu('k', res.k, 5)]);
    if (model.type === 'torsion') rows.push(['Body coils', num(res.Nb, 4)], ['Legs', `${fu('L', model.L1, 4)} / ${fu('L', model.L2, 4)}`], ['Rate', fu('kt', res.kDeg, 5)]);
    for (const p of res.points) rows.push([`At ${p.label}`, model.type === 'torsion' ? `${fu('M', p.M, 4)}, ${num(p.deg, 4)}°, σ ${fu('S', p.sigma, 4)}` : `${fu('F', p.F, 4)}, length ${fu('L', p.L, 5)}, τ ${fu('S', p.tau, 4)}`]);
    for (const c of res.checks) rows.push([`Check: ${c.label}`, `${c.status} (${c.detail})`]);
    return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }
  const fileMenu = $('#fileMenu');
  $('#fileBtn').addEventListener('click', e => { e.stopPropagation(); fileMenu.hidden = !fileMenu.hidden; });
  addEventListener('click', () => { fileMenu.hidden = true; });
  fileMenu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; fileMenu.hidden = true;
    ({ open: () => $('#fileIn').click(), save: () => offerFile(fileSafe(model.name) + '.json', JSON.stringify(model, null, 1)),
      csv: () => { const c = specCSV(); if (c) offerFile(fileSafe(model.name) + '-spec.csv', c); else toast('Fix the design first.'); },
      png: () => cv.toBlob(bl => bl && offerFile(fileSafe(model.name) + '.png', bl), 'image/png') })[b.dataset.act]();
  });
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const m = JSON.parse(await f.text()); if (!m.type || !(m.d > 0)) throw new Error('not a Spring Bench design'); undoStack.push(JSON.stringify(model)); model = m; update(); toast(`Opened ${f.name}.`); }
    catch (err) { toast(`Could not open ${f.name}: ${err.message}.`); }
  });
  const presetSel = $('#presetSel');
  for (const [k, t] of Object.entries(Presets.titles)) presetSel.appendChild(h('option', { value: k, text: t }));
  presetSel.addEventListener('change', () => { const k = presetSel.value; presetSel.value = ''; if (!k) return; undoStack.push(JSON.stringify(model)); const u = model.units; model = Presets.list[k](); model.units = u; stateT = 0.6; update(); toast(`Loaded ${Presets.titles[k]}. Undo brings back your previous design.`); });

  // ---------- McMaster import ----------
  const dlg = $('#mmDialog'); let mmParsed = null;
  function openImport(pn) {
    pn = (pn || '').trim().toUpperCase();
    const link = $('#mmLink'); link.href = /^\d{4,5}[A-Z]\d{1,4}$/.test(pn) ? `https://www.mcmaster.com/${pn}/` : 'https://www.mcmaster.com/springs/';
    link.textContent = /^\d{4,5}[A-Z]\d{1,4}$/.test(pn) ? `${pn} on mcmaster.com` : 'the spring on mcmaster.com';
    $('#mmPaste').value = ''; $('#mmResult').innerHTML = ''; $('#mmUse').disabled = true; mmParsed = null;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('#mmPaste').focus();
  }
  function closeImport() { if (dlg.open) dlg.close(); }
  function previewImport() {
    const r = McMaster.parse($('#mmPaste').value), out = $('#mmResult'); mmParsed = r; out.innerHTML = '';
    if (!$('#mmPaste').value.trim()) { $('#mmUse').disabled = true; return; }
    const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    out.append(h('div', { class: 'verdict ' + (r.ok ? 'ok' : 'bad'), html: r.ok ? `<b>${esc(r.pn || 'Spring')}</b>: ${esc(r.title || r.kind)}. Spring Bench can model this ${r.kind} spring.` : `<b>${esc(r.pn || 'Not imported')}</b>${r.title ? ': ' + esc(r.title) : ''}<br>${r.problems.map(esc).join('<br>')}` }));
    const keys = Object.entries(r.specs).filter(([k, v]) => typeof v === 'string');
    if (r.specs.Load) keys.push(['Load', `min ${r.specs.Load.Minimum || '—'}, max ${r.specs.Load.Maximum || '—'}`]);
    if (keys.length) { const t = h('table', { class: 'mmspecs' }); for (const [k, v] of keys) t.append(h('tr', {}, h('td', { text: k }), h('td', { text: v }))); out.append(t); }
    if (r.notes.length) out.append(h('ul', { class: 'mmnotes' }, ...r.notes.map(n => h('li', { text: n }))));
    $('#mmUse').disabled = !r.ok;
  }
  $('#mmPaste').addEventListener('input', previewImport);
  $('#mmCancel').addEventListener('click', closeImport); $('#mmClose').addEventListener('click', closeImport);
  $('#mmUse').addEventListener('click', () => {
    if (!mmParsed || !mmParsed.ok) return;
    edit(() => { model = Object.assign({}, mmParsed.model); }); stateT = 0.6; syncState(); draw();
    closeImport(); toast(`Imported McMaster ${mmParsed.pn}. Check F₁ and F₂ against your application.`);
  });

  // Read-only hook for tests.
  window.__springBench = { get model() { return JSON.parse(JSON.stringify(model)); }, get result() { return res; } };

  try { const s = localStorage.getItem(STORE_KEY); model = s ? JSON.parse(s) : null; } catch (e) { model = null; }
  if (!model || !model.type) model = Presets.list.smallReturn();
  new ResizeObserver(resize).observe(cv);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => { downloads = null; });
  update();
})();
