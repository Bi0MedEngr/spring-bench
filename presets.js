// Worked examples (SI: N, mm). Each is solved in tests/test_core.js.
const Presets = (() => {
  const common = { units: 'SI', setRemoved: false, peened: false, endCond: 'fixedFixed', opFreq: 0, arbor: 0 };
  const list = {
    valve() {
      return { ...common, name: 'Engine valve spring', type: 'compression', material: 'A401', d: 4.5, D: 25, Na: 6, ends: 'sqGround', L0: 58.2, F1: 300, F2: 750, peened: true, opFreq: 25, setRemoved: true };
    },
    penClick() {
      return { ...common, name: 'Pen click spring', type: 'compression', material: 'A313', d: 0.3, D: 2.6, Na: 12, ends: 'squared', L0: 10.4, F1: 0.6, F2: 1.5, endCond: 'fixedFixed' };
    },
    smallReturn() {
      return { ...common, name: 'Small return spring', type: 'compression', material: 'A228', d: 0.6, D: 5.0, Na: 10, ends: 'sqGround', L0: 14.3, F1: 2, F2: 6 };
    },
    tallSlender() {
      return { ...common, name: 'Long slender spring (buckles)', type: 'compression', material: 'A228', d: 1.2, D: 10, Na: 14, ends: 'sqGround', L0: 45, F1: 10, F2: 30, endCond: 'pinnedPinned' };
    },
    door() {
      return { ...common, name: 'Screen door extension spring', type: 'extension', material: 'A227', d: 2.5, D: 18, Nb: 40, Fi: 34, F1: 45, F2: 110, r1: 9, r2: 5 };
    },
    small_ext() {
      return { ...common, name: 'Small extension spring', type: 'extension', material: 'A228', d: 0.8, D: 6, Nb: 24, Fi: 3, F1: 6, F2: 12, r1: 3, r2: 1.6 };
    },
    clothespin() {
      return { ...common, name: 'Clothespin torsion spring', type: 'torsion', material: 'A228', d: 1.6, D: 8, Nb: 3.5, L1: 25, L2: 25, M1: 150, M2: 420, arbor: 3 };
    },
    hinge() {
      return { ...common, name: 'Lid hinge torsion spring', type: 'torsion', material: 'A313', d: 1.1, D: 9, Nb: 6, L1: 20, L2: 30, M1: 30, M2: 90, arbor: 6 };
    },
  };
  const titles = { valve: 'Engine valve spring', penClick: 'Pen click spring', smallReturn: 'Small return spring', tallSlender: 'Long slender spring (buckles)', door: 'Screen door extension spring', small_ext: 'Small extension spring', clothespin: 'Clothespin torsion spring', hinge: 'Lid hinge torsion spring' };
  return { list, titles };
})();
if (typeof module !== 'undefined') module.exports = Presets;
