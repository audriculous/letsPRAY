import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/model.js';
import { suggestTags, names } from '../js/tags.js';

const item = (id, title, tags, categoryId = 'cat-people') => ({ id, title, notes: '', tags, categoryId, createdAt: 1, updatedAt: 1 });

test('themes from the prayer text', () => {
  const { contextual } = suggestTags({ title: 'Sarah’s surgery on Friday', notes: 'Pray for peace and quick recovery', tags: [], categoryId: 'cat-people' }, emptyData());
  assert.ok(contextual.includes('Health'), contextual.join());
  assert.ok(contextual.includes('Peace'), contextual.join());
});

test('learns from words you have tagged before', () => {
  const d = emptyData();
  d.items.a = item('a', 'Growth group on Tuesday nights', ['Growth group']);
  d.items.b = item('b', 'New people at growth group', ['Growth group']);
  const { contextual } = suggestTags({ title: 'Our growth group study in Mark', tags: [], categoryId: 'cat-church' }, d);
  assert.equal(contextual[0], 'Growth group');
});

test('existing tag named in the text is suggested', () => {
  const d = emptyData();
  d.items.a = item('a', 'Exams', ['Tom']);
  const { contextual } = suggestTags({ title: 'Tom starting a new job', tags: [], categoryId: 'cat-people' }, d);
  assert.ok(contextual.includes('Tom'));
  assert.ok(contextual.includes('Work'));
});

test('does not suggest tags already applied', () => {
  const { contextual } = suggestTags({ title: 'Hospital visit', tags: ['health'], categoryId: 'cat-people' }, emptyData());
  assert.ok(!contextual.map((t) => t.toLowerCase()).includes('health'));
});

test('frequent favours tags used in this list, with starters when empty', () => {
  const d = emptyData();
  d.items.a = item('a', 'x', ['Missionaries'], 'cat-mission');
  d.items.b = item('b', 'y', ['Missionaries'], 'cat-mission');
  d.items.c = item('c', 'z', ['Uni'], 'cat-people');
  d.items.e = item('e', 'w', ['Uni'], 'cat-people');
  d.items.f = item('f', 'v', ['Uni'], 'cat-people');
  const { frequent } = suggestTags({ title: '', tags: [], categoryId: 'cat-mission' }, d);
  assert.equal(frequent[0], 'Missionaries');
  assert.ok(suggestTags({ title: '', tags: [] }, emptyData()).frequent.length >= 3);
});

test('names skip sentence starts and words like God', () => {
  assert.deepEqual(names('Pray that God would help James and Priya. Thanks for Sunday.'), ['James', 'Priya']);
});

test('title themes outrank notes themes', () => {
  const { contextual } = suggestTags({ title: 'Sam and his HSC exams', notes: 'Focus, rest and trusting God', tags: [], categoryId: 'cat-people' }, emptyData());
  assert.equal(contextual[0], 'Study');
});

test('leading name in a person list, but not the first word of the notes', () => {
  const { contextual } = suggestTags({ title: 'Josh looking for work', notes: 'Feeling anxious about rent', tags: [], categoryId: 'cat-people' }, emptyData());
  assert.ok(contextual.includes('Josh'), contextual.join());
  assert.ok(!contextual.includes('Feeling'), contextual.join());
  const church = suggestTags({ title: 'Young adults night', tags: [], categoryId: 'cat-church' }, emptyData());
  assert.ok(!church.contextual.includes('Young'));
});
