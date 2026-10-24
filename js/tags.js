// Tag suggestions. Two sources, shown separately in the editor:
//   contextual: what this prayer seems to be about (keyword rules, words
//               you have tagged before, names, tags mentioned in the text)
//   frequent:   the tags you use most, weighted towards this category
import { live } from './model.js';

// Keyword rules for common prayer themes. Each pattern is matched against
// lower-cased text on word boundaries; prefixes end with \w*.
export const THEMES = [
  { tag: 'Health', words: ['sick', 'ill', 'illness', 'health', 'hospital', 'surgery', 'operation', 'cancer', 'chemo\\w*', 'recover\\w*', 'heal\\w*', 'pain', 'diagnos\\w*', 'doctor', 'treatment', 'scan', 'injur\\w*', 'covid', 'flu', 'disease', 'medical', 'rehab'] },
  { tag: 'Mental health', words: ['anxi\\w*', 'depress\\w*', 'mental', 'burnout', 'burnt out', 'panic', 'overwhelm\\w*', 'lonel\\w*', 'struggling'] },
  { tag: 'Peace', words: ['peace', 'calm', 'stress\\w*', 'worr\\w*', 'fear\\w*', 'afraid', 'rest'] },
  { tag: 'Salvation', words: ['salvation', 'saved', 'come to faith', 'know jesus', 'know christ', 'non-?christian', 'unbeliev\\w*', 'gospel', 'repent\\w*', 'born again', 'seeker'] },
  { tag: 'Spiritual growth', words: ['grow\\w*', 'maturity', 'discipleship', 'disciple\\w*', 'faith', 'holiness', 'sanctif\\w*', 'bible reading', 'devotion\\w*', 'walk with'] },
  { tag: 'Guidance', words: ['wisdom', 'wise', 'decision\\w*', 'decide', 'guidance', 'guide', 'direction', 'discern\\w*', 'choice', 'next step\\w*', 'clarity'] },
  { tag: 'Work', words: ['work', 'job', 'jobs', 'career', 'boss', 'employ\\w*', 'interview\\w*', 'promotion', 'workplace', 'redundan\\w*', 'business', 'colleague\\w*'] },
  { tag: 'Study', words: ['study', 'studies', 'exam\\w*', 'uni', 'university', 'school', 'hsc', 'assignment\\w*', 'thesis', 'degree', 'tafe', 'college'] },
  { tag: 'Grief', words: ['grief', 'griev\\w*', 'died', 'death', 'passed away', 'funeral', 'loss', 'mourn\\w*', 'bereave\\w*'] },
  { tag: 'Marriage', words: ['marriage', 'married', 'wife', 'husband', 'spouse', 'wedding', 'engaged', 'engagement'] },
  { tag: 'Relationships', words: ['relationship\\w*', 'friend\\w*', 'dating', 'conflict', 'reconcil\\w*', 'forgive\\w*'] },
  { tag: 'Children', words: ['kids', 'child', 'children', 'son', 'daughter', 'baby', 'babies', 'toddler', 'parenting', 'newborn'] },
  { tag: 'Pregnancy', words: ['pregnan\\w*', 'expecting', 'due date', 'birth', 'ivf', 'fertility', 'miscarriage'] },
  { tag: 'Finances', words: ['money', 'financ\\w*', 'debt', 'rent', 'mortgage', 'bills', 'afford', 'income'] },
  { tag: 'Travel', words: ['travel\\w*', 'trip', 'flight', 'journey', 'holiday', 'overseas', 'visa'] },
  { tag: 'Housing', words: ['house', 'housing', 'move', 'moving', 'rental', 'lease', 'home loan'] },
  { tag: 'Thanksgiving', words: ['thank\\w*', 'grateful', 'gratitude', 'praise', 'answered', 'rejoic\\w*', 'celebrat\\w*'] },
  { tag: 'Ministry', words: ['ministry', 'minister\\w*', 'preach\\w*', 'sermon\\w*', 'serve', 'serving', 'leader\\w*', 'pastor\\w*', 'staff', 'volunteer\\w*', 'kids church', 'music team'] },
  { tag: 'Youth', words: ['youth', 'young adults?', 'teen\\w*', 'students?'] },
  { tag: 'Bible study', words: ['bible study', 'growth group', 'small group', 'home group', 'connect group', 'study group'] },
  { tag: 'Evangelism', words: ['evangeli\\w*', 'outreach', 'share (the )?gospel', 'witness\\w*', 'invite\\w*', 'mission week', 'christianity explored'] },
  { tag: 'Missionaries', words: ['missionar\\w*', 'mission partner\\w*', 'cms', 'support raising', 'deputation'] },
  { tag: 'Persecuted church', words: ['persecut\\w*', 'imprison\\w*', 'underground', 'open doors'] },
  { tag: 'Nations', words: ['nation\\w*', 'country', 'countries', 'government', 'war', 'refugee\\w*', 'unreached'] },
  { tag: 'Unity', words: ['unity', 'united', 'division', 'divided'] },
];

const RULES = THEMES.map((t) => ({
  tag: t.tag,
  re: new RegExp(`\\b(?:${t.words.join('|')})\\b`, 'i'),
}));

const STOPWORDS = new Set(
  ('a an and are as at be been but by can could do for from had has have he her him his how i if in into is it its ' +
    'just me my no not of on or our pray praying prayer please she so that the their them they this to too up us was ' +
    'we were what when who will with would you your god lord jesus christ about all also am any as ask after again ' +
    'over still very well week weeks year years day days today tomorrow upcoming next new good help him her').split(' '),
);

// Words that look like names when capitalised but are not people.
const NOT_NAMES = new Set(
  ('god lord jesus christ holy spirit father i monday tuesday wednesday thursday friday saturday sunday january ' +
    'february march april may june july august september october november december christmas easter church bible ' +
    'pray please thank thanks the').split(' '),
);

export function tokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .split(/[^a-z0-9À-ɏ-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Capitalised words that are not the first word of a sentence.
export function names(text) {
  const out = [];
  const re = /(^|[.!?]\s+|\s)([A-Z][a-zà-ɏ]{2,})(?:[’']s)?\b/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const sentenceStart = m.index === 0 || /[.!?]\s+$/.test(m[1]);
    const word = m[2];
    if (!sentenceStart && !NOT_NAMES.has(word.toLowerCase())) out.push(word);
  }
  return [...new Set(out)];
}

function itemText(item) {
  return `${item.title || ''} ${item.notes || ''}`;
}

export function suggestTags(draft, data, { contextual: nCtx = 6, frequent: nFreq = 8 } = {}) {
  const text = itemText(draft);
  const lower = text.toLowerCase();
  const have = new Set((draft.tags || []).map((t) => t.toLowerCase()));
  const display = new Map(); // lower-case -> preferred spelling
  const scores = new Map();
  const add = (tag, score) => {
    const key = tag.toLowerCase();
    if (have.has(key) || score <= 0) return;
    if (!display.has(key)) display.set(key, tag);
    scores.set(key, (scores.get(key) || 0) + score);
  };

  const items = Object.values(data.items).filter((i) => live(i) && i.id !== draft.id);

  // Usage counts, overall and within this category.
  const usage = new Map();
  const inCategory = new Map();
  for (const item of items) {
    for (const tag of item.tags || []) {
      const key = tag.toLowerCase();
      usage.set(key, (usage.get(key) || 0) + 1);
      if (!display.has(key)) display.set(key, tag);
      if (item.categoryId === draft.categoryId) inCategory.set(key, (inCategory.get(key) || 0) + 1);
    }
  }

  if (text.trim()) {
    // 1. Theme keywords, trusting the title more than the notes.
    const titleLower = (draft.title || '').toLowerCase();
    for (const rule of RULES) if (rule.re.test(lower)) add(rule.tag, rule.re.test(titleLower) ? 3 : 2);

    // 2. An existing tag written in the text, e.g. tag "Sarah" and "pray for Sarah".
    for (const key of usage.keys()) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) add(display.get(key), 4);
    }

    // 3. Learned from your own history: words you have tagged before.
    const wordTag = new Map(); // word -> Map(tag -> count)
    const wordSeen = new Map();
    for (const item of items) {
      if (!(item.tags || []).length) continue;
      for (const w of new Set(tokens(itemText(item)))) {
        wordSeen.set(w, (wordSeen.get(w) || 0) + 1);
        const m = wordTag.get(w) || new Map();
        for (const tag of item.tags) m.set(tag.toLowerCase(), (m.get(tag.toLowerCase()) || 0) + 1);
        wordTag.set(w, m);
      }
    }
    for (const w of new Set(tokens(text))) {
      const m = wordTag.get(w);
      if (!m) continue;
      const seen = wordSeen.get(w);
      for (const [key, n] of m) add(display.get(key), (2.5 * n) / seen);
    }

    // 4. People's names. In person-type lists a title usually starts with
    //    one ("Josh looking for work"), so the first word counts there too.
    for (const name of new Set([...names(draft.title), ...names(draft.notes)])) add(name, 1.5);
    const cat = data.categories[draft.categoryId];
    if (cat && (['person', 'people', 'home'].includes(cat.icon) || /people|family|friend/i.test(cat.name || ''))) {
      const lead = /^([A-Z][a-z\u00e0-\u024f]{2,})(?:[’']s)?\b/.exec((draft.title || '').trim());
      const word = lead && lead[1].toLowerCase();
      if (word && !NOT_NAMES.has(word) && !STOPWORDS.has(word) && !RULES.some((r) => r.re.test(word))) add(lead[1], 1.5);
    }
  }

  // Small nudge towards tags used in this category, so ties break sensibly.
  for (const key of scores.keys()) scores.set(key, scores.get(key) + Math.min(1, (inCategory.get(key) || 0) * 0.25));

  const contextual = [...scores.entries()]
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1] || display.get(a[0]).localeCompare(display.get(b[0])))
    .slice(0, nCtx)
    .map(([key]) => display.get(key));

  const taken = new Set([...have, ...contextual.map((t) => t.toLowerCase())]);
  let frequent = [...usage.keys()]
    .filter((key) => !taken.has(key))
    .sort(
      (a, b) =>
        (inCategory.get(b) || 0) * 2 + usage.get(b) - ((inCategory.get(a) || 0) * 2 + usage.get(a)) ||
        display.get(a).localeCompare(display.get(b)),
    )
    .slice(0, nFreq)
    .map((key) => display.get(key));

  // A fresh install has no history, so offer a few starters.
  if (frequent.length < 3) {
    const starters = ['Thanksgiving', 'Health', 'Guidance', 'Salvation', 'Spiritual growth', 'Work', 'Peace'];
    for (const tag of starters) {
      if (frequent.length >= nFreq) break;
      const key = tag.toLowerCase();
      if (!taken.has(key) && !frequent.some((t) => t.toLowerCase() === key)) frequent.push(tag);
    }
  }

  return { contextual, frequent };
}
