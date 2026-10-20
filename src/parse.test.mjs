import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShift, stableShiftId } from './parse.mjs';

test('parses October afternoon shifts with Los Angeles offset',()=>{
  const s = parseShift('2026-10-19','1:00 PM','5:30 PM','America/Los_Angeles');
  assert.equal(s.start,'2026-10-19T13:00:00.000-07:00');
  assert.equal(s.end,'2026-10-19T17:30:00.000-07:00');
});

test('overnight shift extends to following day',()=>{
  const s = parseShift('2026-10-19','10:00 PM','2:00 AM','America/Los_Angeles');
  assert.match(s.end,/2026-10-20T02:00/);
});

test('default stable id does not depend on time of day',()=>{
  assert.equal(stableShiftId('','2026-10-19',1),'day:2026-10-19:shift:1');
});
