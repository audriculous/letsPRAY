import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, merge, buildSession, streak, dayKey, fingerprint, allTags, weekStats, listDue, nextDue } from '../js/model.js';

const item = (id, fields = {}) => ({ id, categoryId: 'cat-people', title: id, tags: [], createdAt: 1, updatedAt: 1, lastPrayedAt: 0, answeredAt: 0, ...fields });

test('fresh devices share the same default categories', () => {
  const merged = merge(emptyData(), emptyData());
  assert.equal(Object.keys(merged.categories).length, 4);
});

test('latest edit wins per record', () => {
  const a = emptyData();
  const b = emptyData();
  a.items.x = item('x', { title: 'old', updatedAt: 5 });
  b.items.x = item('x', { title: 'new', updatedAt: 9 });
  b.items.y = item('y');
  const m = merge(a, b);
  assert.equal(m.items.x.title, 'new');
  assert.ok(m.items.y);
  assert.equal(merge(b, a).items.x.title, 'new');
});

test('deletes propagate as tombstones', () => {
  const a = emptyData();
  const b = emptyData();
  a.items.x = item('x', { updatedAt: 5 });
  b.items.x = { id: 'x', deleted: true, updatedAt: 6 };
  assert.equal(merge(a, b).items.x.deleted, true);
});

test('renamed default category beats untouched default', () => {
  const a = emptyData();
  const b = emptyData();
  b.categories['cat-people'] = { ...b.categories['cat-people'], name: 'Friends', updatedAt: 3 };
  assert.equal(merge(a, b).categories['cat-people'].name, 'Friends');
});

test('fingerprint ignores key order', () => {
  const a = emptyData();
  const b = emptyData();
  a.items.x = item('x');
  a.items.y = item('y');
  b.items.y = item('y');
  b.items.x = item('x');
  assert.equal(fingerprint(a), fingerprint(b));
});

test('session rotates least recently prayed first and skips answered', () => {
  const d = emptyData();
  d.categories['cat-people'].perSession = 2;
  d.items.a = item('a', { lastPrayedAt: 300 });
  d.items.b = item('b', { lastPrayedAt: 100 });
  d.items.c = item('c', { lastPrayedAt: 0 });
  d.items.d = item('d', { lastPrayedAt: 0, answeredAt: 50 });
  const ids = buildSession(d).map((c) => c.itemId);
  assert.deepEqual(ids, ['c', 'b']);
});

test('streak counts consecutive days', () => {
  const d = emptyData();
  const now = new Date(2026, 9, 24, 12).getTime();
  const DAY = 86400000;
  d.days[dayKey(now - DAY)] = true;
  d.days[dayKey(now - 2 * DAY)] = true;
  assert.equal(streak(d, now), 2);
  d.days[dayKey(now)] = true;
  assert.equal(streak(d, now), 3);
});

test('allTags counts case-insensitively', () => {
  const d = emptyData();
  d.items.a = item('a', { tags: ['Health'] });
  d.items.b = item('b', { tags: ['health', 'Work'] });
  assert.deepEqual(allTags(d).map((t) => [t.tag, t.count]), [['Health', 2], ['Work', 1]]);
});

test('day counts merge by taking the higher count', () => {
  const a = emptyData();
  const b = emptyData();
  a.days['2026-10-20'] = true;
  a.days['2026-10-21'] = 4;
  b.days['2026-10-21'] = 2;
  b.days['2026-10-22'] = 3;
  const m = merge(a, b);
  assert.deepEqual(m.days, { '2026-10-20': 1, '2026-10-21': 4, '2026-10-22': 3 });
});

test('session length scales each list, keeping at least one', () => {
  const d = emptyData();
  d.categories['cat-people'].perSession = 3;
  d.categories['cat-family'].perSession = 1;
  for (let i = 0; i < 8; i++) d.items['p' + i] = item('p' + i);
  for (let i = 0; i < 8; i++) d.items['f' + i] = item('f' + i, { categoryId: 'cat-family' });
  const count = (scale, cat) => buildSession(d, scale).filter((c) => c.categoryId === cat).length;
  assert.equal(count(0.5, 'cat-people'), 2);
  assert.equal(count(0.5, 'cat-family'), 1);
  assert.equal(count(2, 'cat-people'), 6);
});

test('week stats total the last seven days', () => {
  const d = emptyData();
  const now = new Date(2026, 9, 24, 12).getTime();
  d.days[dayKey(now)] = 3;
  d.days[dayKey(now - 2 * 86400000)] = true;
  d.days[dayKey(now - 9 * 86400000)] = 5;
  d.items.a = item('a', { answeredAt: now - 86400000 });
  const s = weekStats(d, now);
  assert.equal(s.daysPrayed, 2);
  assert.equal(s.prayers, 4);
  assert.equal(s.answered, 1);
});

test('weekly lists come up on their day and carry over until prayed', () => {
  const d = emptyData();
  d.categories.cong = { id: 'cong', name: 'Congregation', icon: 'people', color: 'teal', order: 9, perSession: 6, frequency: 'weekly', weekday: 0, updatedAt: 1 };
  for (let i = 0; i < 40; i++) d.items['c' + i] = item('c' + i, { categoryId: 'cong', lastPrayedAt: 0 });
  const sat = new Date(2026, 9, 24, 9).getTime(); // Saturday
  const sun = new Date(2026, 9, 25, 9).getTime();
  const mon = new Date(2026, 9, 26, 9).getTime();
  const fromCong = (now) => buildSession(d, 1, now).filter((c) => c.categoryId === 'cong');
  // Never prayed yet: due straight away, six names.
  assert.equal(fromCong(sat).length, 6);
  // Prayed on Saturday: not due again until Sunday.
  for (const c of fromCong(sat)) d.items[c.itemId].lastPrayedAt = sat;
  assert.equal(listDue(d, d.categories.cong, sat + 3600000), false);
  assert.equal(dayKey(nextDue(d, d.categories.cong, sat + 3600000)), '2026-10-25');
  // Sunday: due, and the next six names come round.
  const sunday = fromCong(sun).map((c) => c.itemId);
  assert.equal(sunday.length, 6);
  assert.ok(sunday.every((id) => d.items[id].lastPrayedAt === 0));
  // Missed Sunday: still due on Monday.
  assert.equal(listDue(d, d.categories.cong, mon), true);
  // Prayed on Monday: next is the following Sunday.
  d.items[sunday[0]].lastPrayedAt = mon;
  assert.equal(dayKey(nextDue(d, d.categories.cong, mon)), '2026-11-01');
});
