import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUpcomingShiftText} from './extract.mjs';

const screenshotText=`Shop Tech Scheduler
Employee Sign out
My Shifts
Team Calendar
My Availability
My Preferences
6.0
HRS THIS WEEK
20
HRS REQUESTED
Upcoming Shifts
Mustang ’60
Assigned
Mon, Oct 19 at 4:00 PM → Mon, Oct 19 at 6:00 PM
📍 Mustang ’60
Request Pickup
Hangar
Assigned
Tue, Oct 20 at 4:00 PM → Tue, Oct 20 at 6:00 PM
📍 Hangar
Request Pickup
Mustang ’60
Assigned
Wed, Oct 21 at 4:00 PM → Wed, Oct 21 at 6:00 PM
📍 Mustang ’60
Request Pickup`;
const now = new Date('2026-10-19T16:28:00.000Z');

test('parses all three screenshot shifts, including correct locations and PDT offsets',()=>{
 const shifts=parseUpcomingShiftText(screenshotText,'America/Los_Angeles',now);
 assert.equal(shifts.length,3);
 assert.deepEqual(shifts.map(s=>s.location),['Mustang ’60','Hangar','Mustang ’60']);
 assert.deepEqual(shifts.map(s=>s.start),[
  '2026-10-19T16:00:00.000-07:00',
  '2026-10-20T16:00:00.000-07:00',
  '2026-10-21T16:00:00.000-07:00'
 ]);
 assert.equal(shifts[0].end,'2026-10-19T18:00:00.000-07:00');
 assert.match(shifts[1].title,/Hangar/);
});

test('does not import pending/requested shifts',()=>{
 const text=screenshotText+'\nHangar\nPending\nThu, Oct 22 at 4:00 PM → Thu, Oct 22 at 6:00 PM\n📍 Hangar\nRequest Pickup';
 assert.equal(parseUpcomingShiftText(text,'America/Los_Angeles',now).length,3);
});

test('fails safely if UI no longer includes the heading',()=>{
 assert.throws(()=>parseUpcomingShiftText('Some other screen','America/Los_Angeles',now),/Upcoming Shifts/);
});

test('year rolls forward near New Year based on weekday',()=>{
 const text='Upcoming Shifts\nHangar\nAssigned\nMon, Jan 4 at 4:00 PM → Mon, Jan 4 at 6:00 PM\n📍 Hangar\nRequest Pickup';
 const shifts=parseUpcomingShiftText(text,'America/Los_Angeles',new Date('2026-12-27T12:00:00Z'));
 assert.equal(shifts[0].start,'2027-01-04T16:00:00.000-08:00');
});

test('stable ID remains the same if the shift time changes on the same day and at the same location',()=>{
 const changed=screenshotText.replace('Mon, Oct 19 at 4:00 PM → Mon, Oct 19 at 6:00 PM','Mon, Oct 19 at 3:00 PM → Mon, Oct 19 at 7:00 PM');
 const before=parseUpcomingShiftText(screenshotText,'America/Los_Angeles',now);
 const after=parseUpcomingShiftText(changed,'America/Los_Angeles',now);
 assert.equal(before[0].id,after[0].id);
 assert.notEqual(before[0].start,after[0].start);
});
