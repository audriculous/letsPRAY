import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/model.js';
import { outgoing, applyIncoming, listForZone } from '../js/share.js';
import * as S from '../js/store.js';

const item = (id, f = {}) => ({ id, categoryId: 'cat-family', title: id, notes: '', tags: [], createdAt: 1, updatedAt: 1, sharedAt: 1, lastPrayedAt: 0, prayedCount: 0, ...f });

test('only shared fields are sent, never when you prayed or pins', () => {
  const d = emptyData();
  d.categories['cat-family'].sharedAt = 5;
  d.items.m = item('m', { title: 'Mum’s surgery', notes: 'Peace', lastPrayedAt: 99, prayedCount: 7, pinUntil: 123, followedUpAt: 4, sharedAt: 10 });
  const out = outgoing(d, d.categories['cat-family']);
  const list = out.find((r) => r.type === 'List');
  assert.deepEqual(JSON.parse(list.json), { name: 'Family', icon: 'home', color: 'clay', catId: 'cat-family' });
  const prayer = JSON.parse(out.find((r) => r.id === 'm').json);
  assert.equal(prayer.title, 'Mum’s surgery');
  for (const personal of ['lastPrayedAt', 'prayedCount', 'pinUntil', 'followedUpAt', 'categoryId']) assert.ok(!(personal in prayer), personal);
});

test('only what changed since last time is sent; moved-out points become removals', () => {
  const d = emptyData();
  d.items.a = item('a', { sharedAt: 5 });
  d.items.b = item('b', { sharedAt: 20 });
  d.items.c = item('c', { categoryId: 'cat-people', sharedAt: 30 }); // moved to another list
  const out = outgoing(d, d.categories['cat-family'], { since: 10, sentIds: ['a', 'b', 'c'] }, 99);
  assert.deepEqual(out.map((r) => [r.id, r.deleted]), [['b', false], ['c', true]]);
});

test('incoming edits win only when newer, and keep personal fields', () => {
  const d = emptyData();
  d.items.m = item('m', { title: 'Old', lastPrayedAt: 50, prayedCount: 3, sharedAt: 10 });
  applyIncoming(d, 'cat-family', [{ id: 'm', type: 'Prayer', json: JSON.stringify({ title: 'Older' }), sharedAt: 5, deleted: false }]);
  assert.equal(d.items.m.title, 'Old');
  applyIncoming(d, 'cat-family', [{ id: 'm', type: 'Prayer', json: JSON.stringify({ title: 'New', updates: [{ id: 'u', at: 1, text: 'Went well' }] }), sharedAt: 20, deleted: false }]);
  assert.equal(d.items.m.title, 'New');
  assert.equal(d.items.m.updates[0].text, 'Went well');
  assert.equal(d.items.m.lastPrayedAt, 50);
  assert.equal(d.items.m.prayedCount, 3);
});

test('new points arrive in the list; deletes remove them; moves into my own lists are respected', () => {
  const d = emptyData();
  applyIncoming(d, 'sh-list-x', [{ id: 'n', type: 'Prayer', json: JSON.stringify({ title: 'Ben', notes: 'Exams' }), sharedAt: 3, deleted: false }]);
  assert.equal(d.items.n.categoryId, 'sh-list-x');
  assert.equal(d.items.n.prayedCount, 0);
  applyIncoming(d, 'sh-list-x', [{ id: 'n', type: 'Prayer', json: '{}', sharedAt: 4, deleted: true }]);
  assert.equal(d.items.n.deleted, true);
  d.items.k = item('k', { categoryId: 'cat-people', sharedAt: 1 });
  applyIncoming(d, 'sh-list-x', [{ id: 'k', type: 'Prayer', json: '{}', sharedAt: 9, deleted: true }]);
  assert.ok(!d.items.k.deleted);
});

test('someone else’s list gets its own id, mine keeps its id on my other devices', () => {
  const d = emptyData();
  const theirs = listForZone(d, { zone: 'list-abc', scope: 'shared', ownerName: '_owner', ownerDisplay: 'Sue', records: [{ id: 'list', type: 'List', json: JSON.stringify({ name: 'Family', icon: 'home', color: 'clay', catId: 'cat-family' }), sharedAt: 2 }] });
  assert.equal(theirs.id, 'sh-list-abc');
  assert.equal(d.categories['cat-family'].name, 'Family'); // my own Family list untouched
  assert.equal(d.categories['sh-list-abc'].share.owner, 'Sue');
  assert.equal(d.categories['sh-list-abc'].share.role, 'member');
  const d2 = emptyData();
  const mine = listForZone(d2, { zone: 'list-def', scope: 'private', ownerName: '__defaultOwner__', records: [{ id: 'list', type: 'List', json: JSON.stringify({ name: 'Staff team', icon: 'people', color: 'teal', catId: 'cat-staff' }), sharedAt: 2 }] });
  assert.equal(mine.id, 'cat-staff');
  assert.equal(d2.categories['cat-staff'].share.role, 'owner');
  assert.equal(listForZone(d2, { zone: 'list-def', scope: 'private', records: [] }).created, false);
});

test('the store marks shared changes but not personal ones', () => {
  const id = S.saveItem({ title: 'Shared?', categoryId: 'cat-family' });
  const first = S.getData().items[id].sharedAt;
  assert.ok(first > 0);
  const later = () => new Promise((r) => setTimeout(r, 5));
  return later().then(async () => {
    S.markPrayed(id);
    S.setPin(id, Date.now() + 1000);
    S.followedUp(id);
    assert.equal(S.getData().items[id].sharedAt, first);
    await later();
    S.addUpdate(id, 'Home from hospital');
    assert.ok(S.getData().items[id].sharedAt > first);
    const afterUpdate = S.getData().items[id].sharedAt;
    await later();
    S.saveItem({ id, title: 'Shared?' }); // nothing shared changed
    assert.equal(S.getData().items[id].sharedAt, afterUpdate);
    S.deleteItem(id);
    assert.equal(S.getData().items[id].categoryId, 'cat-family'); // so the removal reaches the right list
  });
});
