import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, merge, buildSession, streak, dayKey, fingerprint, allTags } from '../js/model.js';

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
