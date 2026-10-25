import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/model.js';
import { plan, calendarFile } from '../js/notify.js';

const NOW = new Date(2026, 9, 24, 10).getTime(); // Saturday 10am
const item = (id, f = {}) => ({ id, categoryId: 'cat-family', title: id, tags: [], createdAt: 1, updatedAt: 1, lastPrayedAt: 0, ...f });

test('daily reminders for the next month on chosen days, starting tomorrow when today’s time has passed', () => {
  const d = emptyData();
  d.items.a = item('Mum’s knee surgery');
  const list = plan(d, { on: true, hour: 7, minute: 0, days: [0, 3], followUps: false }, NOW);
  assert.ok(list.length >= 8 && list.length <= 10);
  assert.ok(list.every((n) => [0, 3].includes(n.schedule.at.getDay()) && n.schedule.at.getHours() === 7));
  assert.equal(list[0].schedule.at.getDate(), 25); // Sunday, not today
  assert.ok(list.length <= 64);
});

test('no names on the lock screen unless details are switched on', () => {
  const d = emptyData();
  d.items.a = item('Mum’s knee surgery', { eventAt: new Date(2026, 9, 26).getTime() });
  const quiet = plan(d, { on: true }, NOW);
  assert.ok(quiet.every((n) => !n.body.includes('Mum')), JSON.stringify(quiet.map((n) => n.body)));
  const detailed = plan(d, { on: true, details: true }, NOW);
  assert.ok(detailed.some((n) => n.body.includes('Mum’s knee surgery')));
});

test('a follow-up the morning after a dated prayer, unless already followed up', () => {
  const d = emptyData();
  d.items.a = item('Surgery', { eventAt: new Date(2026, 9, 26).getTime() });
  d.items.b = item('Interview', { eventAt: new Date(2026, 9, 27).getTime(), followedUpAt: new Date(2026, 9, 27, 18).getTime() });
  d.items.c = item('Answered', { eventAt: new Date(2026, 9, 28).getTime(), answeredAt: NOW });
  const ups = plan(d, { on: false, followUps: true, hour: 8 }, NOW);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].title, 'How did it go?');
  assert.equal(ups[0].schedule.at.getDate(), 27);
  assert.equal(ups[0].schedule.at.getHours(), 8);
});

test('calendar file repeats on the chosen days with an alert', () => {
  const ics = calendarFile({ hour: 6, minute: 45, days: [1, 2, 3, 4, 5] }, NOW);
  assert.match(ics, /DTSTART:20261024T064500/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(calendarFile({ days: [0, 1, 2, 3, 4, 5, 6] }, NOW), /RRULE:FREQ=DAILY/);
  assert.ok(ics.includes('\r\n'));
});

test('reminders carry their buttons, and today’s is skipped once prayed', () => {
  const d = emptyData();
  d.items.a = item('Surgery', { eventAt: new Date(2026, 9, 26).getTime() });
  const early = new Date(2026, 9, 24, 5).getTime(); // before the 7am reminder
  const before = plan(d, { on: true, followUps: true }, early);
  assert.equal(before[0].schedule.at.getDate(), 24);
  assert.ok(before.filter((n) => n.title === 'Time to pray').every((n) => n.actionTypeId === 'PRAY'));
  const follow = before.find((n) => n.title === 'How did it go?');
  assert.equal(follow.actionTypeId, 'FOLLOW');
  assert.equal(follow.extra.itemId, 'Surgery');
  d.days['2026-10-24'] = 4;
  assert.equal(plan(d, { on: true, followUps: false }, early)[0].schedule.at.getDate(), 25);
});
