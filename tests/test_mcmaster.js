// McMaster page import: units, parsing, compatibility, and the catalog cross-checks. Run: node tests/test_mcmaster.js
// Fixtures are spec blocks in the layout McMaster's product pages copy as (label line, value line).
const M = require('../mcmaster.js'), C = require('../core.js');
let fails = 0;
const near = (a, b, tol, msg) => { const ok = Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg + `  got ${(+a).toPrecision(7)} want ${(+b).toPrecision(7)}`); };
const yes = (c, msg) => near(c ? 1 : 0, 1, 0, msg);
const page = (title, line2, pn, specs) => `Find alternative products\n${title}\n${line2}\n2-D PDF\n${pn}\n$13.03 per pack of 12\nADD TO ORDER\n` + specs.map(([k, v]) => `${k}\n${v}`).join('\n') + '\nCountry of Origin\nUnited States\n';

near(M.length('2.031"'), 51.5874, 1e-12, 'inches to mm'); near(M.length('16.2 mm'), 16.2, 1e-12, 'mm stays mm');
near(M.force('15 lb.'), 15 * 4.4482216152605, 1e-12, 'lb to N'); near(M.rate('35 lbf/in'), 35 * 4.4482216152605 / 25.4, 1e-12, 'lbf/in to N/mm');
near(M.rate('13 lbf/mm'), 13 * 4.4482216152605, 1e-12, 'lbf/mm to N/mm'); near(M.rate('2.1 N/mm'), 2.1, 1e-12, 'N/mm stays');

// Compression, music wire, rated load and compressed length
{
  const r = M.parse(page('Compression Spring', '1" Long, 0.48" OD, 0.37" ID', '9657K311', [['Material', 'Spring Steel'], ['Length', '1"'], ['OD', '0.48"'], ['ID', '0.37"'], ['Wire Diameter', '0.055"'],
    ['Compressed Length @ Maximum Load', '0.56"'], ['Maximum Load', '15 lb.'], ['Spring Rate', '35 lbf/in'], ['End Type', 'Closed and Ground'], ['Compression Spring Type', 'Straight'], ['Spring Type', 'Compression'], ['Steel Grade', 'Music-Wire Steel'], ['System of Measurement', 'Inch']]));
  yes(r.ok && r.kind === 'compression' && r.pn === '9657K311', 'compression page imports');
  yes(r.model.material === 'A228' && r.model.ends === 'sqGround' && r.model.units === 'US', 'music wire, closed and ground, inch units');
  near(r.model.d, 0.055 * 25.4, 1e-5, 'wire diameter'); near(r.model.D, (0.48 - 0.055) * 25.4, 1e-5, 'mean diameter = OD − d');
  near(C.solve(r.model).k, 35 * 4.4482216152605 / 25.4, 2e-4, 'rate reproduces the catalog rate');
  near(r.model.F2, 15 * 4.4482216152605, 1e-4, 'F₂ is the catalog maximum load');
}
// Extension, loads min/max, extended length cross-check
{
  const r = M.parse(page('Steel Extension Spring', 'with Loop Ends, 1.442" Long, 0.25" OD, 0.029" Wire Diameter', '9654K111', [['Loop Type', 'Single'], ['End Type', 'Loop'], ['Material', 'Spring Steel'], ['Length', '1.442"'], ['OD', '0.25"'], ['Wire Diameter', '0.029"'],
    ['Extended Length @ Maximum Load', '2.48"'], ['Load', 'Minimum'], ['0.67 lb.', 'Maximum'], ['3.37 lb.', 'Spring Rate'], ['2.6 lbf/in', 'Spring Type'], ['Extension', 'System of Measurement'], ['Inch', 'Temper Rating']]));
  yes(r.ok && r.kind === 'extension', 'extension page imports');
  near(r.model.Fi, 0.67 * 4.4482216152605, 1e-4, 'initial tension = catalog minimum load');
  near(r.model.F2, 3.37 * 4.4482216152605, 1e-4, 'F₂ = catalog maximum load');
  const s = C.solve(r.model); near(s.k, 2.6 * 4.4482216152605 / 25.4, 2e-4, 'rate reproduces the catalog rate');
  near(1.442 * 25.4 + (r.model.F2 - r.model.Fi) / s.k, 2.48 * 25.4, 2e-3, 'catalog extended length agrees with L + (F − Fᵢ)/k');
}
// Incompatible: die spring (rectangular wire), conical, torsion, not a spring
{
  const die = M.parse(page('Chrome Silicon Steel Die Spring', 'Green, for 20 mm Hole Diameter, 25 mm Long', '1804N126', [['Length', '25 mm'], ['Wire', 'Thickness'], ['1.91 mm', 'Width'], ['4.19 mm', 'Spring Rate'], ['13 lbf/mm', 'Spring Type'], ['Die', 'End Type']]));
  yes(!die.ok && /rectangular/i.test(die.problems[0]), 'die spring rejected (rectangular wire)');
  const con = M.parse(page('Compression Spring', 'Conical', '1692K11', [['Length', '1"'], ['OD', '0.5"'], ['Wire Diameter', '0.04"'], ['Spring Rate', '10 lbf/in'], ['Compression Spring Type', 'Conical'], ['Spring Type', 'Compression']]));
  yes(!con.ok && /conical/i.test(con.problems[0]), 'conical spring rejected');
  const tor = M.parse(page('Torsion Spring', '90 Degree Angle, 0.484" OD', '9271K51', [['Spring Wind Direction', 'Left Hand']]));
  yes(!tor.ok && /drawing/i.test(tor.problems[0]), 'torsion explains what is missing');
  const junk = M.parse('hello world'); yes(!junk.ok, 'random text rejected');
  const odd = M.parse(page('Compression Spring', '1" Long', '1234K56', [['Length', '1"'], ['OD', '0.5"'], ['Wire Diameter', '0.04"'], ['Spring Rate', '10 lbf/in'], ['Spring Type', 'Compression'], ['Material', 'Inconel X-750']]));
  yes(!odd.ok && /Inconel/.test(odd.problems[0]), 'unknown alloy flagged');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
