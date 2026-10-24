// Plain-English parsing for Quick add, all on the device.
// "Pray for Mum's surgery on Friday, for peace #health" becomes
//   title "Mum's surgery", notes "Peace", list Family, date Friday,
//   tags Health (and any other clear themes).
import { activeCategories, allTags, live, startOfDay } from './model.js';
import { names, leadingName, tokens, suggestTags, isPersonList } from './tags.js';

// ---------- Dates ----------

const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_DAYS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 'a couple of': 2, 'a few': 3 };
// Small joining words that belong to the date phrase and go with it.
const LEAD = String.raw`(?:\b(?:on|by|from|until|till|before|after)\s+)?`;

const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
};
const dateOf = (y, m, d) => new Date(y, m, d).getTime();

// Easter Sunday (Gregorian), for Good Friday, Easter and Pentecost.
function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return dateOf(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}

// A date without a year means this year, unless that was over a month ago.
function withYear(today, m, d, y) {
  if (y) return dateOf(y < 100 ? 2000 + y : y, m, d);
  const t = dateOf(new Date(today).getFullYear(), m, d);
  return t < addDays(today, -30) ? dateOf(new Date(today).getFullYear() + 1, m, d) : t;
}

// The next time a yearly day comes round (today counts).
function upcoming(today, fn) {
  const y = new Date(today).getFullYear();
  const t = fn(y);
  return t >= today ? t : fn(y + 1);
}

const nextWeekday = (today, dow, strictlyAfter) => {
  let diff = (dow - new Date(today).getDay() + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  return addDays(today, diff);
};

const DATE_RULES = [
  // 31 Oct, 31st of October 2026
  [new RegExp(String.raw`${LEAD}(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH})\b(?:,?\s+(\d{4}))?`, 'i'),
    (m, t) => withYear(t, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1], +m[3] || 0)],
  // Oct 31, October 31st
  [new RegExp(String.raw`${LEAD}(${MONTH})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?`, 'i'),
    (m, t) => withYear(t, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2], +m[3] || 0)],
  // 31/10 or 31/10/26 (Australian day/month order)
  [new RegExp(String.raw`${LEAD}\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b`, 'i'),
    (m, t) => (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 ? withYear(t, +m[2] - 1, +m[1], +m[3] || 0) : null)],
  [/\b(?:the\s+)?day after tomorrow\b/i, (m, t) => addDays(t, 2)],
  [new RegExp(String.raw`${LEAD}\btomorrow(?:\s+(?:morning|afternoon|evening|night))?\b`, 'i'), (m, t) => addDays(t, 1)],
  [/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i, (m, t) => t],
  [/\b(?:(this|next)\s+weekend|(?:on|over) the weekend)\b/i,
    (m, t) => {
      const dow = new Date(t).getDay();
      const sat = dow === 0 ? addDays(t, -1) : nextWeekday(t, 6, false);
      const base = dow === 0 ? t : sat; // on a Sunday, "this weekend" is today
      return m[1] && m[1].toLowerCase() === 'next' ? addDays(sat, 7) : base;
    }],
  [/\b(?:early\s+)?next week\b/i, (m, t) => nextWeekday(t, 1, true)],
  [/\bnext month\b/i, (m, t) => dateOf(new Date(t).getFullYear(), new Date(t).getMonth() + 1, 1)],
  [new RegExp(String.raw`\bin\s+(\d+|a couple of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month)s?\b`, 'i'),
    (m, t) => {
      const n = Number(m[1]) || NUMBERS[m[1].toLowerCase()];
      const unit = m[2].toLowerCase();
      if (unit === 'month') {
        const d = new Date(t);
        return dateOf(d.getFullYear(), d.getMonth() + n, d.getDate());
      }
      return addDays(t, unit === 'week' ? n * 7 : n);
    }],
  [new RegExp(String.raw`${LEAD}\b(christmas eve|christmas(?: day)?|good friday|easter(?: sunday| day)?|pentecost|new year[’']?s(?: day)?|new year[’']?s eve|anzac day|australia day)\b`, 'i'),
    (m, t) => {
      const name = m[1].toLowerCase().replace(/[’']/g, '');
      if (name === 'christmas eve') return upcoming(t, (y) => dateOf(y, 11, 24));
      if (name.startsWith('christmas')) return upcoming(t, (y) => dateOf(y, 11, 25));
      if (name === 'good friday') return upcoming(t, (y) => addDays(easter(y), -2));
      if (name.startsWith('easter')) return upcoming(t, easter);
      if (name === 'pentecost') return upcoming(t, (y) => addDays(easter(y), 49));
      if (name === 'new years eve') return upcoming(t, (y) => dateOf(y, 11, 31));
      if (name.startsWith('new year')) return upcoming(t, (y) => dateOf(y, 0, 1));
      if (name === 'anzac day') return upcoming(t, (y) => dateOf(y, 3, 25));
      return upcoming(t, (y) => dateOf(y, 0, 26));
    }],
  // A bare weekday is a date only where it reads like one ("surgery Friday",
  // "Friday night"), not when it describes something ("Sunday sermon").
  // Plurals ("on Sundays") are routines, not dates.
  [new RegExp(String.raw`\b(?:(on|by|from|until|till|before|after|this coming|this|next|coming)\s+)?(${WEEKDAYS.join('|')})(s?)\b(?:(\s+(?:morning|afternoon|evening|night|arvo))\b|(?=(\s*(?:$|[,.;:!?)\-–—])))|)`, 'i'),
    (m, t) => (m[3] || (!m[1] && m[4] === undefined && m[5] === undefined) ? null : nextWeekday(t, WEEKDAYS.indexOf(m[2].toLowerCase()), !!m[1] && /next/i.test(m[1])))],
  [/\b(on|this|next)\s+(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/i,
    (m, t) => nextWeekday(t, SHORT_DAYS[m[2].toLowerCase()], m[1].toLowerCase() === 'next')],
];

// Returns { date, text, index, end } for the first date phrase found, or null.
export function parseDate(text, now = Date.now()) {
  const today = startOfDay(now);
  for (const [re, fn] of DATE_RULES) {
    const m = re.exec(text);
    if (!m) continue;
    const date = fn(m, today);
    if (date == null) continue;
    // Named days stay in the title ("Christmas outreach"), others are removed.
    const keep = /christmas|easter|good friday|pentecost|new year|anzac|australia day/i.test(m[0]);
    let index = m.index;
    let phrase = m[0];
    // "Friday 31 Oct": the weekday before an explicit date goes too.
    const before = text.slice(0, index);
    const wd = new RegExp(String.raw`(?:\b(?:on)\s+)?\b(?:${WEEKDAYS.join('|')}|mon|tue|wed|thu|fri|sat|sun),?\s*$`, 'i').exec(before);
    if (wd && /\d/.test(phrase)) {
      index = wd.index;
      phrase = text.slice(index, m.index + m[0].length);
    }
    return { date, text: phrase.trim(), index, end: m.index + m[0].length, keep };
  }
  return null;
}

// ---------- Lists ----------

const FAMILY = /\b(mum|mom|mummy|mother|dad|daddy|parents?|brother|sister|siblings?|wife|husband|son|daughter|kids|children|grandma|grandpa|grandmother|grandfather|grandparents?|nan|nanna|nana|poppy|aunt(?:y|ie)?|uncle|cousins?|niece|nephew|in-laws?|family|step(?:mum|dad|son|daughter)|my baby|our baby)\b/i;
const CHURCH = /\b(church|session(?: meeting)?|youth(?: group| camp| night)?|growth groups?|bible stud(?:y|ies)|small groups?|home groups?|kids church|sunday school|sermons?|preach\w*|church staff|elders?|deacons?|ministry|ministries|music team|congregation|pastor|minister|presbytery|presbyterian|sunday services?|young adults|mission week|church plant\w*)\b/i;
const MISSION = new RegExp(
  String.raw`\b(missionar(?:y|ies)|mission partners?|cms|omf|interserve|wycliffe|bible translation|overseas|unreached|persecut\w*|support raising|deputation|` +
    'cambodia|laos|vietnam|thailand|myanmar|indonesia|malaysia|philippines|japan|china|mongolia|north korea|india|nepal|pakistan|bangladesh|sri lanka|' +
    'afghanistan|iran|iraq|syria|lebanon|turkey|egypt|sudan|ethiopia|kenya|tanzania|uganda|rwanda|congo|nigeria|senegal|mozambique|zambia|malawi|' +
    'madagascar|south africa|africa|asia|middle east|papua new guinea|png|vanuatu|solomon islands|fiji|timor|ukraine|russia|peru|bolivia|chile|brazil|' +
    'argentina|mexico|haiti|uzbekistan|kazakhstan|central asia|north africa|yemen|israel|gaza)\\b',
  'i',
);

function findList(cats, defaultId, nameRe) {
  return cats.find((c) => c.id === defaultId) || cats.find((c) => nameRe.test(c.name));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Picks the most likely list and says why, e.g. { id, why: 'mentions “mum”' }.
export function detectList(text, data, title = text) {
  const cats = activeCategories(data);
  if (!cats.length) return { id: '', why: '' };
  const scores = new Map();
  const add = (cat, score, why) => {
    if (!cat) return;
    const cur = scores.get(cat.id) || { score: 0, why: '' };
    scores.set(cat.id, { score: cur.score + score, why: cur.why || why });
  };

  // A list named in the text ("growth group", "uni friends").
  for (const cat of cats) {
    const base = escapeRe(cat.name.toLowerCase().replace(/s$/, ''));
    if (base.length > 2 && new RegExp(`\\b${base}s?\\b`, 'i').test(text)) add(cat, 5, `mentions “${cat.name.toLowerCase()}”`);
  }
  const rule = (re, id, nameRe) => {
    const m = re.exec(text);
    if (m) add(findList(cats, id, nameRe), 3, `mentions “${m[1].toLowerCase()}”`);
  };
  rule(FAMILY, 'cat-family', /famil/i);
  rule(CHURCH, 'cat-church', /church/i);
  rule(MISSION, 'cat-mission', /mission/i);

  // Learned from where you have filed similar prayers before.
  const seen = new Map();
  for (const item of Object.values(data.items)) {
    if (!live(item) || !data.categories[item.categoryId] || !live(data.categories[item.categoryId])) continue;
    for (const w of new Set(tokens(`${item.title} ${item.notes || ''}`))) {
      const m = seen.get(w) || new Map();
      m.set(item.categoryId, (m.get(item.categoryId) || 0) + 1);
      seen.set(w, m);
    }
  }
  for (const w of new Set(tokens(text))) {
    const m = seen.get(w);
    if (!m) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    for (const [id, n] of m) add(data.categories[id], (2.5 * n) / total, `like your other “${w}” prayers`);
  }

  // People's names point to People. A name opening the prayer ("Ben would
  // find a church") is the subject, and counts more if you have used it before.
  const people = findList(cats, 'cat-people', /people|friend/i) || cats.find(isPersonList);
  const lead = leadingName(title);
  const opensWithKeyword = [FAMILY, CHURCH, MISSION].some((re) => re.exec(title)?.index === 0);
  if (lead && !opensWithKeyword) {
    const key = lead.toLowerCase();
    const known =
      allTags(data).some((t) => t.tag.toLowerCase() === key) ||
      Object.values(data.items).some((i) => live(i) && (i.title || '').toLowerCase().startsWith(key + ' '));
    add(people, known ? 3.5 : 1.5, `starts with ${lead}`);
  } else if (names(text)[0]) add(people, 1.5, `mentions ${names(text)[0]}`);

  const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (best && best[1].score >= 1) return { id: best[0], why: best[1].why };
  return { id: (people || cats[0]).id, why: '' };
}

// ---------- The whole prayer ----------

const PRAY_LEAD = /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:pray(?:ing)?|prayers?)\s+(?:for|that|about|over)\s+/i;
const THANKS_LEAD = /^(?:thank\s+(?:god|you)(?:\s+(?:lord|god|jesus))?|praise(?:\s+(?:god|the lord))?|(?:give\s+)?thanks(?:giving)?|thank)(?:\s+(?:for|that)\b)?\s*/i;
// Stands in for a comma that followed a removed date, so it can split the
// title from the details; anywhere else it goes back to being a comma.
const MARK = '\u0001';
// Where the title ends and the details begin.
const SPLIT = /\s*\u0001\s*|\s+[-–—]\s+|:\s+|;\s+|\.\s+(?=\S)|,\s+(?=(?:for|that|and that|so that|asking for|especially|pray(?:ing)? for|praying)\b)/i;

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function tidy(s) {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*(?=[,;:.]|$)/g, '')
    .replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '')
    .replace(/\s+\b(?:on|at|this|by|for|from|until|in)$/i, '')
    .trim();
}

export function parsePrayer(input, data, { categoryId = '', now = Date.now() } = {}) {
  let text = ` ${input.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '')} `;
  const out = { title: '', notes: '', categoryId: '', why: '', explicitList: false, tags: [], suggestions: [], date: 0, dateText: '' };

  // #tags, matched to the spelling you already use.
  const known = allTags(data);
  const tagOf = (raw) => {
    const t = raw.replace(/[-_]+/g, ' ').trim();
    const k = known.find((x) => x.tag.toLowerCase() === t.toLowerCase());
    return k ? k.tag : cap(t);
  };
  text = text.replace(/(^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu, (all, sp, word) => {
    out.tags.push(tagOf(word));
    return sp;
  });

  // @list
  const cats = activeCategories(data);
  text = text.replace(/(^|\s)@([\p{L}\d][\p{L}\d_-]*)/gu, (all, sp, word) => {
    const q = word.toLowerCase().replace(/[-_]/g, '');
    const cat = cats.find((c) => c.name.toLowerCase().replace(/\s+/g, '').startsWith(q));
    if (!cat) return all;
    out.categoryId = cat.id;
    out.explicitList = true;
    return sp;
  });

  const found = parseDate(text, now);
  if (found) {
    out.date = found.date;
    out.dateText = found.text;
    if (!found.keep) {
      // "Mum's surgery on Friday, for peace": the comma after the date starts the details.
      const rest = text.slice(found.end);
      const before = text.slice(0, found.index);
      text = /^\s*,/.test(rest) && before.trim() ? `${before}${MARK}${rest.replace(/^\s*,\s*/, '')}` : `${before} ${rest}`;
    }
  }

  text = tidy(text);
  let thanks = false;
  if (PRAY_LEAD.test(text)) text = text.replace(PRAY_LEAD, '');
  else if (THANKS_LEAD.test(text) && /^(?:give\s+)?(?:thank|praise)/i.test(text)) {
    thanks = true;
    text = text.replace(THANKS_LEAD, '');
  }

  const split = SPLIT.exec(text);
  let title = text;
  let notes = '';
  if (split) {
    title = text.slice(0, split.index);
    notes = text.slice(split.index + split[0].length);
  } else if (text.indexOf(', ') > 0) {
    // A plain comma splits when both sides are phrases: "The Nguyens in
    // Cambodia, language learning", but not "Mum, Dad and the kids".
    const at = text.indexOf(', ');
    const words = (s) => s.trim().split(/\s+/).length;
    if (words(text.slice(0, at)) >= 2 && words(text.slice(at + 2)) >= 2) {
      title = text.slice(0, at);
      notes = text.slice(at + 2);
    }
  }
  const comma = (s) => s.replace(/\s*\u0001\s*/g, ', ');
  out.title = cap(tidy(comma(title)).replace(/\.$/, ''));
  out.notes = cap(tidy(comma(notes).replace(/^(?:for|and|asking for)\s+/i, '')));

  if (!out.explicitList) {
    const detected = detectList(`${out.title}. ${out.notes}`, data, out.title);
    out.categoryId = categoryId && data.categories[categoryId] ? categoryId : detected.id;
    out.why = out.categoryId === detected.id ? detected.why : '';
  }

  // Tags: clear themes are applied, the rest offered.
  if (thanks) out.tags.push(tagOf('Thanksgiving'));
  const sugg = suggestTags({ title: out.title, notes: out.notes, tags: out.tags, categoryId: out.categoryId }, data);
  for (const t of sugg.strong.slice(0, 3)) if (!out.tags.some((x) => x.toLowerCase() === t.toLowerCase())) out.tags.push(t);
  out.suggestions = sugg.contextual.filter((t) => !out.tags.some((x) => x.toLowerCase() === t.toLowerCase()));
  out.tags = out.tags.filter((t, i) => out.tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
  return out;
}

// One prayer per line, so a pasted prayer list becomes several points.
export function parseMany(input, data, opts) {
  return input
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parsePrayer(line, data, opts))
    .filter((p) => p.title);
}
