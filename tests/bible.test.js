import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS, PLANS, chaptersOf, split, label, planDays, progress, dueCount, dateOfDay, startFor, readOn, tickKey, readLink, defaultPace } from '../js/bible.js';
import { emptyData, merge, fingerprint } from '../js/model.js';

const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const chapters = (days) => days.flat().reduce((n, r) => n + r.chapters.length, 0);

test('the books add up to 1,189 chapters', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(chaptersOf(BOOKS.filter((b) => b.testament === 'ot').map((b) => b.name)).length, 929);
  assert.equal(chaptersOf(BOOKS.filter((b) => b.testament === 'nt').map((b) => b.name)).length, 260);
});

test('every plan covers each of its chapters exactly once', () => {
  const expected = { year: [365, 1189], ot: [365, 929], nt: [260, 260], nt90: [90, 260], gospels: [30, 89], psalms: [30, 150], proverbs: [31, 31] };
  for (const [kind, [days, ch]] of Object.entries(expected)) {
    const plan = planDays({ kind });
    assert.equal(plan.length, days, kind);
    assert.equal(chapters(plan), ch, kind);
    const seen = new Set(plan.flat().flatMap((r) => r.chapters.map((c) => c.join(' '))));
    assert.equal(seen.size, ch, `${kind} has no repeats`);
  }
  assert.equal(PLANS.length, 8);
});

test('bible in a year reads some Old Testament every day', () => {
  const days = planDays({ kind: 'year' });
  assert.ok(days.every((d) => d.length === 2));
  assert.deepEqual(days[0].map((r) => r.label), ['Genesis 1–2', 'Matthew 1']);
  assert.ok(days.some((d) => d[1].label.startsWith('Psalm ')));
});

test('book by book splits chapters evenly', () => {
  const days = planDays({ kind: 'books', books: ['Ruth', 'Jonah'], perDay: 3 });
  assert.equal(days.length, 3);
  assert.deepEqual(days.map((d) => d[0].label), ['Ruth 1–3', 'Ruth 4; Jonah 1–2', 'Jonah 3–4']);
  assert.deepEqual(split([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]]);
});

test('labels read naturally', () => {
  assert.equal(label([['Psalms', 23]]), 'Psalm 23');
  assert.equal(label([['Psalms', 1], ['Psalms', 2]]), 'Psalms 1–2');
  assert.equal(label([['Jude', 1]]), 'Jude');
  assert.equal(label([['Genesis', 50], ['Exodus', 1]]), 'Genesis 50; Exodus 1');
  assert.equal(readLink('Genesis 1–3'), 'https://www.biblegateway.com/passage/?search=Genesis%201-3&version=NIV');
});

test('progress knows when you are behind, on track or done for today', () => {
  const plan = { kind: 'gospels', start: '2026-10-20', pace: 'daily', ticks: {} };
  const now = at(2026, 10, 22);
  assert.equal(dueCount(plan, now), 3);
  assert.equal(progress(plan, now).behind, 2);
  plan.ticks[tickKey(0, 0)] = { on: true, at: now };
  plan.ticks[tickKey(1, 0)] = { on: true, at: now };
  assert.equal(progress(plan, now).behind, 0);
  assert.equal(progress(plan, now).caughtUp, false);
  plan.ticks[tickKey(2, 0)] = { on: true, at: now };
  const p = progress(plan, now);
  assert.equal(p.caughtUp, true);
  assert.equal(p.next, 3);
  assert.equal(p.done, 3);
});

test('weekday plans skip weekends', () => {
  const plan = { kind: 'nt', start: '2026-10-24', pace: defaultPace('nt') }; // a Saturday
  assert.equal(plan.pace, 'weekdays');
  assert.equal(new Date(dateOfDay(plan, 0)).getDay(), 1);
  assert.equal(dueCount(plan, at(2026, 10, 25)), 0);
  assert.equal(dueCount(plan, at(2026, 10, 27)), 2);
});

test('moving the dates makes the next reading today', () => {
  for (const pace of ['daily', 'weekdays']) {
    const now = at(2026, 10, 28);
    const start = startFor(5, pace, now);
    assert.equal(dueCount({ start, pace }, now), 6, pace);
  }
});

test('readings ticked on a day show in that day’s journal', () => {
  const plans = { a: { id: 'a', kind: 'psalms', start: '2026-10-01', ticks: { '0.0': { on: true, at: at(2026, 10, 25) }, '1.0': { on: false, at: at(2026, 10, 25) } } } };
  assert.deepEqual(readOn(plans, '2026-10-25'), ['Psalms 1–5']);
  assert.deepEqual(readOn(plans, '2026-10-24'), []);
});

test('ticks from two devices merge one by one', () => {
  const a = emptyData();
  const b = emptyData();
  const plan = { id: 'p', kind: 'year', start: '2026-10-01', pace: 'daily', createdAt: 1 };
  a.plans.p = { ...plan, updatedAt: 10, ticks: { '0.0': { on: true, at: 10 } } };
  b.plans.p = { ...plan, updatedAt: 12, ticks: { '0.1': { on: true, at: 12 }, '0.0': { on: false, at: 5 } } };
  const m = merge(a, b);
  assert.equal(m.plans.p.ticks['0.0'].on, true);
  assert.equal(m.plans.p.ticks['0.1'].on, true);
  assert.equal(m.plans.p.updatedAt, 12);
  // A removed plan stays removed.
  b.plans.p = { id: 'p', deleted: true, updatedAt: 20 };
  assert.equal(merge(a, b).plans.p.deleted, true);
  assert.notEqual(fingerprint(a), fingerprint(merge(a, b)));
});

test('journal pages sync, latest edit wins', () => {
  const a = emptyData();
  const b = emptyData();
  a.journal['2026-10-25'] = { id: '2026-10-25', text: 'phone', photos: [], updatedAt: 5 };
  b.journal['2026-10-25'] = { id: '2026-10-25', text: 'mac', photos: [{ id: 'ph1', text: 'read' }], updatedAt: 9 };
  b.journal['2026-10-24'] = { id: '2026-10-24', text: 'yesterday', photos: [], updatedAt: 1 };
  const m = merge(a, b);
  assert.equal(m.journal['2026-10-25'].text, 'mac');
  assert.equal(Object.keys(m.journal).length, 2);
  assert.notEqual(fingerprint(a), fingerprint(m));
});
