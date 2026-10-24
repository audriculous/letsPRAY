import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, dayKey, buildSession } from '../js/model.js';
import { parsePrayer, parseMany, parseDate, detectList } from '../js/parse.js';

// Saturday 24 October 2026, mid-morning.
const NOW = new Date(2026, 9, 24, 10).getTime();
const day = (y, m, d) => dayKey(new Date(y, m - 1, d).getTime());
const when = (text) => {
  const r = parseDate(text, NOW);
  return r && dayKey(r.date);
};
const parse = (text, data = emptyData(), opts = {}) => parsePrayer(text, data, { now: NOW, ...opts });

test('relative and weekday dates', () => {
  assert.equal(when('surgery on Friday'), day(2026, 10, 30));
  assert.equal(when('surgery next Friday'), day(2026, 10, 30));
  assert.equal(when('interview tomorrow morning'), day(2026, 10, 25));
  assert.equal(when('exams next week'), day(2026, 10, 26));
  assert.equal(when('moving in 2 weeks'), day(2026, 11, 7));
  assert.equal(when('camp in a few days'), day(2026, 10, 27));
  assert.equal(when('this weekend'), day(2026, 10, 24));
  assert.equal(when('next month'), day(2026, 11, 1));
  assert.equal(when('Sarah tonight'), day(2026, 10, 24));
  assert.equal(when('on Sundays'), null);
  assert.equal(when('Sunday sermon series in Mark'), null);
  assert.equal(when('Mum’s surgery Friday'), day(2026, 10, 30));
  assert.equal(when('youth Friday night'), day(2026, 10, 30));
  assert.equal(parse('Session meeting Tuesday night, unity').title, 'Session meeting');
});

test('explicit dates use Australian order and roll into next year', () => {
  assert.equal(when('scan on 31 Oct'), day(2026, 10, 31));
  assert.equal(when('scan 3/11'), day(2026, 11, 3));
  assert.equal(when('wedding on March 14th'), day(2027, 3, 14));
  assert.equal(when('baby due 5th of January 2027'), day(2027, 1, 5));
  assert.equal(when('results came on 20 Oct'), day(2026, 10, 20));
});

test('church calendar days', () => {
  assert.equal(when('Christmas'), day(2026, 12, 25));
  assert.equal(when('Easter camp'), day(2027, 3, 28));
  assert.equal(parse('Christmas outreach planning').title, 'Christmas outreach planning');
  assert.equal(when('Good Friday service'), day(2027, 3, 26));
});

test('the example prayer', () => {
  const p = parse('Pray for Mum’s surgery on Friday, for peace and a quick recovery #health');
  assert.equal(p.title, 'Mum’s surgery');
  assert.equal(p.notes, 'Peace and a quick recovery');
  assert.equal(p.categoryId, 'cat-family');
  assert.match(p.why, /mum/);
  assert.equal(dayKey(p.date), day(2026, 10, 30));
  assert.ok(p.tags.includes('Health'));
  assert.ok(p.tags.includes('Peace') || p.suggestions.includes('Peace'));
});

test('a dash or colon splits title from details', () => {
  const p = parse('Josh - job interview tomorrow, wisdom and calm');
  assert.equal(p.title, 'Josh');
  assert.equal(p.notes, 'Job interview, wisdom and calm');
  assert.equal(p.categoryId, 'cat-people');
});

test('lists from keywords, countries, names and @mentions', () => {
  assert.equal(parse('Growth group starting Romans').categoryId, 'cat-church');
  assert.equal(parse('The Nguyens in Cambodia, language learning').categoryId, 'cat-mission');
  assert.equal(parse('Priya exploring Christianity').categoryId, 'cat-people');
  assert.equal(parse('Session meeting Tuesday night').categoryId, 'cat-church');
  assert.equal(parse('Young adults growth group').categoryId, 'cat-church');
  assert.equal(parse('Ella: anxiety about Year 12 exams').categoryId, 'cat-people');
  const p = parse('Car rego and budget @fam');
  assert.equal(p.categoryId, 'cat-family');
  assert.equal(p.explicitList, true);
  assert.equal(p.title, 'Car rego and budget');
});

test('a list opened from keeps priority unless @ says otherwise', () => {
  assert.equal(parse('Mum’s birthday', emptyData(), { categoryId: 'cat-church' }).categoryId, 'cat-church');
  assert.equal(parse('Mum’s birthday @family', emptyData(), { categoryId: 'cat-church' }).categoryId, 'cat-family');
});

test('custom list named in the text', () => {
  const d = emptyData();
  d.categories.uni = { id: 'uni', name: 'Uni friends', icon: 'people', color: 'teal', order: 9, perSession: 2, updatedAt: 1 };
  assert.equal(detectList('Catch up with uni friends after exams', d).id, 'uni');
});

test('learns where similar prayers were filed', () => {
  const d = emptyData();
  d.categories.work = { id: 'work', name: 'Workplace', icon: 'briefcase', color: 'sand', order: 9, perSession: 2, updatedAt: 1 };
  for (const t of ['Sarah at the bakery', 'Bakery staff Christmas party', 'New bakery manager'])
    d.items[t] = { id: t, title: t, notes: '', tags: [], categoryId: 'work', createdAt: 1, updatedAt: 1 };
  assert.equal(parse('Long shifts at the bakery', d).categoryId, 'work');
});

test('thanks become Thanksgiving', () => {
  const p = parse('Thank God for Dad’s new job');
  assert.equal(p.title, 'Dad’s new job');
  assert.ok(p.tags.includes('Thanksgiving'));
  assert.equal(p.categoryId, 'cat-family');
});

test('hashtags reuse your existing spelling', () => {
  const d = emptyData();
  d.items.a = { id: 'a', title: 'x', notes: '', tags: ['HSC'], categoryId: 'cat-people', createdAt: 1, updatedAt: 1 };
  assert.deepEqual(parse('Exams #hsc #mental-health', d).tags.slice(0, 2), ['HSC', 'Mental health']);
});

test('several lines become several prayers, bullets stripped', () => {
  const list = parseMany('- Mum’s surgery Friday\n\n• Growth group\n3. Missionaries in Japan', emptyData(), { now: NOW });
  assert.deepEqual(list.map((p) => [p.title, p.categoryId]), [
    ['Mum’s surgery', 'cat-family'],
    ['Growth group', 'cat-church'],
    ['Missionaries in Japan', 'cat-mission'],
  ]);
});

test('dated points come first in a session and always make it in', () => {
  const d = emptyData();
  d.categories['cat-family'].perSession = 1;
  d.items.old = { id: 'old', title: 'old', tags: [], categoryId: 'cat-family', createdAt: 1, updatedAt: 1, lastPrayedAt: 0 };
  d.items.dated = { id: 'dated', title: 'dated', tags: [], categoryId: 'cat-family', createdAt: 2, updatedAt: 1, lastPrayedAt: NOW, eventAt: new Date(2026, 9, 26).getTime() };
  assert.deepEqual(buildSession(d, 1, NOW).map((c) => c.itemId), ['dated']);
});

test('a plain comma splits phrases but not a list of names', () => {
  const a = parse('The Nguyens in Cambodia, language learning');
  assert.deepEqual([a.title, a.notes], ['The Nguyens in Cambodia', 'Language learning']);
  assert.equal(parse('Mum, Dad and the kids').title, 'Mum, Dad and the kids');
});
