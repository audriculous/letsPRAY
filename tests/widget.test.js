import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, dayKey } from '../js/model.js';
import { snapshot } from '../js/widget.js';

const NOW = new Date(2026, 9, 24, 10).getTime(); // Saturday
const item = (id, f = {}) => ({ id, categoryId: 'cat-people', title: id, tags: [], createdAt: 1, updatedAt: 1, lastPrayedAt: 0, ...f });

test('a week of days, each with its own session and verse', () => {
  const d = emptyData();
  d.categories.cong = { id: 'cong', name: 'Congregation', icon: 'people', color: 'teal', order: 9, perSession: 2, frequency: 'weekly', weekday: 0, updatedAt: 1 };
  d.items.Sam = item('Sam');
  d.items.Ben = item('Ben', { categoryId: 'cong', lastPrayedAt: NOW - 3600000 });
  const s = snapshot(d, {}, NOW);
  assert.equal(s.days.length, 7);
  assert.equal(s.days[0].date, '2026-10-24');
  assert.equal(s.days[0].count, 1); // Congregation was prayed this week
  assert.equal(s.days[1].count, 2); // Sunday brings it round again
  assert.ok(s.days[1].items.some((i) => i.list === 'Congregation' && i.color === 'teal'));
  assert.ok(s.days[0].verse.ref && s.days[0].verse.ref !== s.days[1].verse.ref);
});

test('dated and pinned points are labelled for the widget', () => {
  const d = emptyData();
  d.items['Mum’s surgery'] = item('Mum’s surgery', { categoryId: 'cat-family', eventAt: new Date(2026, 9, 26).getTime() });
  d.items.Ella = item('Ella', { pinUntil: NOW + 2 * 86400000 });
  const s = snapshot(d, { showNames: false }, NOW);
  assert.equal(s.showNames, false);
  const sat = s.days[0].items;
  assert.equal(sat[0].title, 'Ella');
  assert.equal(sat[0].pinned, true);
  const mon = s.days[2].items.find((i) => i.title === 'Mum’s surgery');
  assert.equal(mon.when, 'Today');
});

test('streak and week totals', () => {
  const d = emptyData();
  d.days[dayKey(NOW)] = 3;
  d.days[dayKey(NOW - 86400000)] = 2;
  const s = snapshot(d, {}, NOW);
  assert.equal(s.streak, 2);
  assert.equal(s.prayedOn, '2026-10-24');
  assert.deepEqual(s.week, { days: 2, prayers: 5, answered: 0 });
});
