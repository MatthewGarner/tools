import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProjectionBasis} from '../../assets/projection-basis.js';
import {parseRoadmapBasis} from '../planning-context.js';
import {parse as parseRoadmap} from '../../roadmap/parse.js';

const VALUES = [
  'paths "Growth"; answered pricing=yes@2026-08-03',
  'paths "Growth & retention"; assumed groups=no@2026-08-12',
  'paths "Growth"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12',
  'paths "A"',
  'paths ""; assumed x=yes@2026-08-12',
  'paths "A // B"; assumed x=yes@2026-08-12',
  'paths "A"; answered x=yes@2026-08-12; assumed X=no@2026-08-13',
  'paths "A"; answered x=yes@2026-08-12; answered y=no@2026-08-13',
  'paths "A"; unknown x=yes@2026-08-12',
  'paths "A"; assumed x=yes@2026-02-30',
  'paths "A"; assumed x=yes@2026-08-12;',
  'paths "A"; assumed ' + Array.from({length:9}, (_, i) => 'x' + i + '=yes@2026-08-12').join(','),
  'paths "A"; assumed ' + 'x'.repeat(33) + '=yes@2026-08-12',
];

test('Roadmap ownership and Case recognition conform to the shared basis grammar', () => {
  for(const value of VALUES){
    const shared = parseProjectionBasis(value, 0);
    const roadmap = parseRoadmap('basis: ' + value + '\nNOW\nCore: Work');
    const caseBasis = parseRoadmapBasis('title: Projection\nbasis: ' + value + '\nNOW\nCore: Work');
    assert.equal(!!roadmap.basis, !shared.error, 'Roadmap: ' + value);
    assert.equal(!!caseBasis, !shared.error, 'Case: ' + value);
    if(!shared.error){
      assert.deepEqual(roadmap.basis, shared.value);
      assert.deepEqual(caseBasis, {
        source:shared.value.source, known:shared.value.answered, assumed:shared.value.assumed,
      });
    }
  }
});
