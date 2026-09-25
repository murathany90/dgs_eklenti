import test from 'node:test';
import assert from 'node:assert/strict';
import { displayEquipmentType, presentUserText, primaryDisplayName } from '../../src/presentation/equipmentPresentation.ts';

test('presentation registry translates internal equipment class and enum text', () => {
  const value = presentUserText('ElmTerm B9466 · ElmLne H5846 · NON_CONVERGED · BUS_BRANCH · COMPLETE_UNVALIDATED');
  for (const internal of ['ElmTerm', 'ElmLne', 'NON_CONVERGED', 'BUS_BRANCH', 'COMPLETE_UNVALIDATED']) assert.equal(value.includes(internal), false);
  assert.match(value, /Bara/);
  assert.match(value, /Enerji İletim Hattı/);
  assert.match(value, /Yakınsamadı/);
});

test('technical class IDs stay internal to the display formatter', () => {
  assert.equal(displayEquipmentType('ElmGenStat'), 'Üretim Ünitesi');
  assert.deepEqual(primaryDisplayName('ÜRGÜP – ELBİSTAN TES', 'H5846'), { primary: 'ÜRGÜP – ELBİSTAN TES', secondary: 'H5846' });
  assert.deepEqual(primaryDisplayName('', 'B9466'), { primary: 'B9466', secondary: 'B9466' });
});
