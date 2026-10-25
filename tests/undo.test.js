import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';

const live = () => Object.values(S.getData().items).filter((i) => !i.deleted);

test('undo a delete brings the prayer point back', () => {
  const id = S.saveItem({ title: 'Undo me', categoryId: 'cat-people' });
  S.deleteItem(id);
  assert.ok(!live().some((i) => i.id === id));
  assert.equal(S.lastUndo().label, 'Deleted');
  S.undo();
  const back = S.getData().items[id];
  assert.equal(back.title, 'Undo me');
  assert.ok(!back.deleted);
  assert.equal(S.lastUndo(), null);
});

test('undo restores with a newer timestamp so it wins on other devices', () => {
  const id = S.saveItem({ title: 'Synced', categoryId: 'cat-people' });
  S.deleteItem(id);
  const deletedAt = S.getData().items[id].updatedAt;
  S.undo();
  assert.ok(S.getData().items[id].updatedAt >= deletedAt);
});

test('undo a batch of adds removes them all', () => {
  const before = live().length;
  S.batch('Added 3', () => ['A', 'B', 'C'].forEach((t) => S.saveItem({ title: t, categoryId: 'cat-church' })));
  assert.equal(live().length, before + 3);
  assert.equal(S.lastUndo().label, 'Added 3');
  S.undo();
  assert.equal(live().length, before);
});

test('undo prayed restores the count and last prayed', () => {
  const id = S.saveItem({ title: 'Count me', categoryId: 'cat-people' });
  S.markPrayed(id);
  assert.equal(S.getData().items[id].prayedCount, 1);
  assert.equal(S.lastUndo().meta.itemId, id);
  S.undo();
  assert.equal(S.getData().items[id].prayedCount, 0);
  assert.equal(S.getData().items[id].lastPrayedAt, 0);
});

test('undo deleting a list restores its points', () => {
  const cat = S.saveCategory({ name: 'Temp', icon: 'star', color: 'sage' });
  const a = S.saveItem({ title: 'In temp', categoryId: cat });
  S.deleteCategory(cat);
  assert.ok(S.getData().items[a].deleted);
  S.undo();
  assert.equal(S.getData().categories[cat].name, 'Temp');
  assert.equal(S.getData().items[a].title, 'In temp');
});

test('undo an edit puts the old wording back', () => {
  const id = S.saveItem({ title: 'First wording', categoryId: 'cat-people' });
  S.saveItem({ id, title: 'Second wording' });
  S.undo();
  assert.equal(S.getData().items[id].title, 'First wording');
});

test('updates are added, count as following up, and can be undone', () => {
  const id = S.saveItem({ title: 'Surgery', categoryId: 'cat-family', eventAt: Date.now() - 2 * 86400000 });
  S.addUpdate(id, 'Went well, now rehab');
  const it = S.getData().items[id];
  assert.equal(it.updates.length, 1);
  assert.equal(it.updates[0].text, 'Went well, now rehab');
  assert.ok(it.followedUpAt > 0);
  S.undo();
  assert.equal((S.getData().items[id].updates || []).length, 0);
});

test('pin and unpin', () => {
  const id = S.saveItem({ title: 'Hospital', categoryId: 'cat-family' });
  S.setPin(id, Date.now() + 86400000);
  assert.ok(S.getData().items[id].pinUntil > Date.now());
  S.setPin(id, 0);
  assert.equal(S.getData().items[id].pinUntil, 0);
});

test('reading plans: add, tick, remove and undo', () => {
  const id = S.addPlan({ kind: 'psalms', start: '2026-10-01', pace: 'daily' });
  S.tick(id, ['0.0'], true);
  assert.equal(S.getData().plans[id].ticks['0.0'].on, true);
  assert.equal(S.lastUndo().label, 'Plan added'); // ticks are not undo steps
  S.removePlan(id);
  assert.ok(S.getData().plans[id].deleted);
  S.undo();
  const back = S.getData().plans[id];
  assert.ok(!back.deleted);
  assert.equal(back.ticks['0.0'].on, true);
  const fresh = S.restartPlan(id, '2026-10-25');
  assert.ok(S.getData().plans[id].deleted);
  assert.deepEqual(S.getData().plans[fresh].ticks, {});
  assert.equal(S.getData().plans[fresh].kind, 'psalms');
});

test('journal pages save without becoming undo steps', () => {
  const before = S.lastUndo();
  S.saveJournal('2026-10-25', { text: 'Psalm 23 today' });
  S.saveJournal('2026-10-25', { photos: [{ id: 'ph1', text: '' }] });
  const page = S.getData().journal['2026-10-25'];
  assert.equal(page.text, 'Psalm 23 today');
  assert.equal(page.photos.length, 1);
  assert.equal(S.lastUndo(), before);
});
