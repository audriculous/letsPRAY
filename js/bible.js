// Bible reading plans. Pure functions: a plan record holds only what it is
// (kind, chosen books, pace, start date) and the ticks; its days are worked
// out from that each time, so plans stay small and sync quickly.

// The 66 books with their chapter counts.
export const BOOKS = [
  ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
  ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
  ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
  ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
  ['Ecclesiastes', 12], ['Song of Songs', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
  ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9],
  ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
  ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
  ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
  ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
  ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
  ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5],
  ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1],
  ['Jude', 1], ['Revelation', 22],
].map(([name, chapters], i) => ({ name, chapters, testament: i < 39 ? 'ot' : 'nt' }));

const BOOK = Object.fromEntries(BOOKS.map((b) => [b.name, b]));
const OT = BOOKS.filter((b) => b.testament === 'ot').map((b) => b.name);
const NT = BOOKS.filter((b) => b.testament === 'nt').map((b) => b.name);

// Every chapter of these books, in order: [['Genesis', 1], ['Genesis', 2], ...]
export function chaptersOf(names) {
  const out = [];
  for (const name of names) {
    const book = BOOK[name];
    if (book) for (let c = 1; c <= book.chapters; c += 1) out.push([name, c]);
  }
  return out;
}

// Shares `list` across `days` as evenly as it goes, longer days first.
export function split(list, days) {
  const out = [];
  let at = 0;
  for (let d = 0; d < days; d += 1) {
    const end = Math.round(((d + 1) * list.length) / days);
    out.push(list.slice(at, end));
    at = end;
  }
  return out;
}

// Weaves two lists together in proportion, so the shorter one is spread
// through the longer (a psalm every few days alongside the New Testament).
function weave(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && i / a.length <= j / b.length)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

// "Genesis 1–3", "Psalm 23", "Jude", "Genesis 50; Exodus 1–2".
export function label(chapters) {
  const runs = [];
  for (const [book, c] of chapters) {
    const last = runs[runs.length - 1];
    if (last && last.book === book && last.to === c - 1) last.to = c;
    else runs.push({ book, from: c, to: c });
  }
  return runs
    .map(({ book, from, to }) => {
      if (BOOK[book].chapters === 1) return book;
      const name = book === 'Psalms' && from === to ? 'Psalm' : book;
      return from === to ? `${name} ${from}` : `${name} ${from}–${to}`;
    })
    .join('; ');
}

// The NIV on Bible Gateway, which opens in the browser or its app.
export const readLink = (text, version = 'NIV') =>
  `https://www.biblegateway.com/passage/?search=${encodeURIComponent(text.replace(/–/g, '-'))}&version=${version}`;

// ---------- Plans ----------

const DAYS_IN_YEAR = 365;

export const PLANS = [
  { kind: 'year', title: 'Bible in a year', blurb: 'Old Testament every day, with the New Testament and Psalms in turn. About three chapters a day.' },
  { kind: 'nt', title: 'New Testament in a year', blurb: 'One chapter each weekday. Weekends free to catch up.' },
  { kind: 'ot', title: 'Old Testament in a year', blurb: 'Two or three chapters a day. Pairs well with the New Testament plan.' },
  { kind: 'nt90', title: 'New Testament in 90 days', blurb: 'Three chapters a day.' },
  { kind: 'gospels', title: 'Gospels in 30 days', blurb: 'Matthew, Mark, Luke and John. Three chapters a day.' },
  { kind: 'psalms', title: 'Psalms in a month', blurb: 'Five psalms a day.' },
  { kind: 'proverbs', title: 'Proverbs in a month', blurb: 'One chapter for each day of the month.' },
  { kind: 'books', title: 'Book by book', blurb: 'Choose the books and how many chapters a day.' },
];

const KIND = Object.fromEntries(PLANS.map((p) => [p.kind, p]));

// Each day is a list of readings; each reading is a list of chapters.
function build(plan) {
  switch (plan.kind) {
    case 'year': {
      // Psalms run with the New Testament, so every day has some of each.
      const ot = split(chaptersOf(OT.filter((b) => b !== 'Psalms')), DAYS_IN_YEAR);
      const nt = split(weave(chaptersOf(NT), chaptersOf(['Psalms'])), DAYS_IN_YEAR);
      return ot.map((o, d) => [o, nt[d]]);
    }
    case 'ot':
      return split(chaptersOf(OT), DAYS_IN_YEAR).map((r) => [r]);
    case 'nt':
      return chaptersOf(NT).map((c) => [[c]]);
    case 'nt90':
      return split(chaptersOf(NT), 90).map((r) => [r]);
    case 'gospels':
      return split(chaptersOf(['Matthew', 'Mark', 'Luke', 'John']), 30).map((r) => [r]);
    case 'psalms':
      return split(chaptersOf(['Psalms']), 30).map((r) => [r]);
    case 'proverbs':
      return chaptersOf(['Proverbs']).map((c) => [[c]]);
    case 'books': {
      const all = chaptersOf(plan.books || []);
      const per = Math.max(1, Math.min(5, plan.perDay || 1));
      // Exactly that many a day; the last day may be shorter.
      const days = [];
      for (let i = 0; i < all.length; i += per) days.push([all.slice(i, i + per)]);
      return days;
    }
    default:
      return [];
  }
}

// Plans are rebuilt often (every render), so keep the last few.
const cache = new Map();
export function planDays(plan) {
  const key = `${plan.kind}|${(plan.books || []).join(',')}|${plan.perDay || ''}`;
  if (!cache.has(key)) {
    if (cache.size > 20) cache.clear();
    cache.set(key, build(plan).map((day) => day.filter((r) => r.length).map((r) => ({ chapters: r, label: label(r) }))));
  }
  return cache.get(key);
}

export const defaultPace = (kind) => (kind === 'nt' ? 'weekdays' : 'daily');

export function planTitle(plan) {
  if (plan.kind !== 'books') return KIND[plan.kind]?.title || 'Reading plan';
  const books = plan.books || [];
  if (books.length === 1) return books[0];
  if (books.length === 2) return `${books[0]} and ${books[1]}`;
  return `${books[0]} to ${books[books.length - 1]}`;
}

export const tickKey = (day, reading) => `${day}.${reading}`;
export const isTicked = (plan, day, reading) => !!plan.ticks?.[tickKey(day, reading)]?.on;
export const dayDone = (plan, day, days = planDays(plan)) => days[day].every((_, r) => isTicked(plan, day, r));

// "2026-10-25" to a local-midnight timestamp.
export const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

// How many plan days should be read by the end of `now`'s day, counting
// from the start date (weekday plans skip Saturdays and Sundays).
export function dueCount(plan, now = Date.now()) {
  const start = fromKey(plan.start);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (today.getTime() < start) return 0;
  if (plan.pace !== 'weekdays') return Math.round((today.getTime() - start) / 86400000) + 1;
  let n = 0;
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n += 1;
  return n;
}

// Where a plan is up to: the first day not finished, how many are done, and
// whether that is behind, on track or ahead of the calendar.
export function progress(plan, now = Date.now()) {
  const days = planDays(plan);
  const total = days.length;
  let done = 0;
  let next = -1;
  for (let d = 0; d < total; d += 1) {
    if (dayDone(plan, d, days)) done += 1;
    else if (next < 0) next = d;
  }
  const due = Math.min(total, dueCount(plan, now));
  const finished = next < 0;
  const behind = finished ? 0 : Math.max(0, due - next - 1);
  // Up to date once today's reading (or everything due so far) is done.
  const caughtUp = finished || next >= due;
  return { total, done, next, due, behind, caughtUp, finished, percent: !done ? 0 : finished ? 100 : Math.min(99, Math.max(1, Math.round((done / total) * 100))) };
}

const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekday = (d) => d.getDay() % 6 !== 0;

// The calendar date a plan day falls on.
export function dateOfDay(plan, index) {
  const d = new Date(fromKey(plan.start));
  if (plan.pace !== 'weekdays') {
    d.setDate(d.getDate() + index);
    return d.getTime();
  }
  let n = -1;
  for (;;) {
    if (weekday(d)) n += 1;
    if (n === index) return d.getTime();
    d.setDate(d.getDate() + 1);
  }
}

// A start date that makes `index` today's reading: used to move a plan's
// dates along after missing some days, without losing any ticks.
export function startFor(index, pace, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (pace !== 'weekdays') {
    d.setDate(d.getDate() - index);
    return toKey(d);
  }
  let n = 0;
  for (;;) {
    if (weekday(d)) {
      n += 1;
      if (n === index + 1) return toKey(d);
    }
    d.setDate(d.getDate() - 1);
  }
}

// Readings ticked on a given day ("2026-10-25"), for the journal.
export function readOn(plans, key, live = (p) => p && !p.deleted) {
  const out = [];
  for (const plan of Object.values(plans)) {
    if (!live(plan)) continue;
    const days = planDays(plan);
    for (const [k, t] of Object.entries(plan.ticks || {})) {
      if (!t.on || toKey(new Date(t.at)) !== key) continue;
      const [d, r] = k.split('.').map(Number);
      const reading = days[d]?.[r];
      if (reading) out.push({ at: t.at, label: reading.label });
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.label);
}
