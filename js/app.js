import * as S from './store.js';
import * as Sync from './sync.js';
import { activeCategories, itemsIn, answeredItems, buildSession, streak, weekStats, allTags, live, dayKey, startOfDay, merge, listDue, nextDue, findDuplicate, titleKey, isPinned, pinFor, PIN_FOREVER, followUps, latestUpdate, WEEKDAY_NAMES, COLOURS } from './model.js';
import { parseMany } from './parse.js';
import { MIN_PASSPHRASE, normalisePassphrase, ITERATIONS, newSalt, deriveKey, seal, unseal, envelopeKey, isEnvelope } from './crypto.js';
import { loadKey } from './keystore.js';
import * as Notify from './notify.js';
import { suggestTags } from './tags.js';
import { icon, CATEGORY_ICONS } from './icons.js';
import { verseFor } from './verses.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const catColour = (cat) => `--c: var(--cat-${cat?.color || 'sage'})`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const main = $('#view');

// ---------- Formatting ----------

function ago(ts) {
  if (!ts) return 'Not prayed yet';
  const days = Math.round((new Date(dayKey()) - new Date(dayKey(ts))) / 86400000);
  if (days <= 0) return 'Prayed today';
  if (days === 1) return 'Prayed yesterday';
  if (days < 14) return `Prayed ${days} days ago`;
  if (days < 60) return `Prayed ${Math.round(days / 7)} weeks ago`;
  return `Prayed ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const longDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

// "Today", "Tomorrow", or "Fri 30 Oct" (long: "Friday 30 October").
function dateLabel(ts, long = false) {
  const diff = Math.round((startOfDay(ts) - startOfDay()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const opts = long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' };
  if (new Date(ts).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(ts).toLocaleDateString(undefined, opts);
}

// "6 each session" or "6 each Sunday".
const cadence = (cat) => `${cat.perSession} each ${cat.frequency === 'weekly' ? WEEKDAY_NAMES[cat.weekday ?? 0] : 'session'}`;

const pinLabel = (until) => (until >= PIN_FOREVER ? 'Pinned' : `Pinned to ${dateLabel(until).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())}`);
const pinChip = (item) => (isPinned(item) ? `<span class="chip chip-sm chip-pin">${icon('pin')}${esc(pinLabel(item.pinUntil))}</span>` : '');

// "yesterday", "on Friday", "on 12 Oct"
function whenPast(ts) {
  const days = Math.round((startOfDay() - startOfDay(ts)) / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 7) return `on ${new Date(ts).toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `on ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

const dateChip = (ts) => `<span class="chip chip-sm chip-date">${icon('today')}${esc(dateLabel(ts))}</span>`;

// <input type="date"> values are local calendar days.
const fromDateInput = (v) => {
  const [y, m, d] = v.split('-').map(Number);
  return v ? new Date(y, m - 1, d).getTime() : 0;
};

const shortDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  const name = (S.getPrefs().name || '').trim();
  return name ? `${part}, ${esc(name)}` : `Good ${part.toLowerCase()}`;
}

// Session length for today only, like a workout's "today's load".
const SIZES = [
  ['shorter', 'Shorter', 0.5, 'A shorter session today.'],
  ['planned', 'As planned', 1, 'Your usual session.'],
  ['longer', 'Longer', 2, 'A longer session today.'],
];
function sessionSize() {
  const pref = S.getPrefs().sessionSize;
  return SIZES.find(([id]) => pref && pref.day === dayKey() && pref.size === id) || SIZES[1];
}

// Keep the user's spelling of an existing tag; capitalise new ones.
function cleanTag(raw) {
  const t = raw.replace(/\s+/g, ' ').replace(/^#/, '').trim().slice(0, 32);
  if (!t) return '';
  const known = allTags(S.getData()).find((x) => x.tag.toLowerCase() === t.toLowerCase());
  return known ? known.tag : t[0].toUpperCase() + t.slice(1);
}

const tagChips = (tags = []) => tags.map((t) => `<span class="chip chip-sm">${esc(t)}</span>`).join('');

// ---------- Shared pieces ----------

function itemRow(item, { showCat = false } = {}) {
  const cat = S.getData().categories[item.categoryId];
  const meta = [];
  if (showCat && cat) meta.push(`<span class="meta-cat" style="${catColour(cat)}">${esc(cat.name)}</span>`);
  if (!item.answeredAt) meta.push(pinChip(item));
  if (item.eventAt && !item.answeredAt) meta.push(dateChip(item.eventAt));
  meta.push(tagChips(item.tags));
  const update = latestUpdate(item);
  return `<button class="row" data-act="edit-item" data-id="${item.id}">
    <span class="row-dot" style="${catColour(cat)}"></span>
    <span class="row-body">
      <span class="row-title">${esc(item.title)}</span>
      ${update ? `<span class="row-notes row-update">${icon('chat')}${esc(update.text)}</span>` : item.notes ? `<span class="row-notes">${esc(item.notes)}</span>` : ''}
      ${meta.join('') ? `<span class="row-meta">${meta.join('')}</span>` : ''}
    </span>
    <span class="row-side">${item.answeredAt ? icon('answered') : esc(ago(item.lastPrayedAt).replace('Prayed ', '').replace('Not prayed yet', 'New'))}</span>
  </button>`;
}

function header(title, { kicker = '', back = '', actions = '' } = {}) {
  return `<header class="page-head">
    ${back ? `<a class="icon-btn back" href="${back}" aria-label="Back">${icon('back')}</a>` : ''}
    <div class="page-title">
      ${kicker ? `<div class="eyebrow">${kicker}</div>` : ''}
      <h1 class="display${title.replace(/<[^>]*>/g, '').length > 9 ? ' h1-long' : ''}">${title}</h1>
    </div>
    <div class="page-actions">${actions}</div>
  </header>`;
}

function emptyState(title, body, action = '') {
  return `<div class="empty"><div class="empty-mark">${icon('hands')}</div><h3>${title}</h3><p>${body}</p>${action}</div>`;
}

// ---------- Views ----------

const VIEWS = {};

VIEWS.today = () => {
  const data = S.getData();
  const size = sessionSize();
  const cards = buildSession(data, size[2]);
  const prayedToday = !!data.days[dayKey()];
  const verse = verseFor();
  const total = Object.values(data.items).filter((i) => live(i) && !i.answeredAt).length;
  const week = weekStats(data);

  const topbar = `<div class="topbar">
    <a class="wordmark" href="#/today"><span class="wm-a">Let’s</span><span class="wm-b">Pray</span><span class="wm-c"></span></a>
    <div class="topbar-actions">
      <a class="round-btn" href="#/lists" data-act="focus-search" aria-label="Search">${icon('search')}</a>
      <a class="round-btn" href="#/answered" aria-label="Answered">${icon('answered')}</a>
      <a class="round-btn" href="#/settings" aria-label="Settings">${icon('settings')}</a>
    </div>
  </div>`;

  let hero;
  if (!total) {
    hero = `<section class="card hero">
      <div class="eyebrow">Welcome. Let’s get started</div>
      <h2 class="display">Your prayer lists</h2>
      <p class="muted">Add the people, family, church and mission work you want to pray for. Each session brings up a few from every list, so everyone comes round in turn.</p>
      <button class="btn btn-accent btn-wide" data-act="quick-add">${icon('plus')} Add a prayer point</button>
    </section>`;
  } else {
    const lists = [...new Set(cards.map((c) => c.categoryId))].map((id) => data.categories[id].name);
    const eyebrow = lists.length > 3 ? `${lists.slice(0, 2).join(' + ')} + ${lists.length - 2} more` : lists.join(' + ');
    const first = cards[0] && data.items[cards[0].itemId];
    const mins = Math.max(1, Math.round(cards.length * 0.75));
    hero = `<section class="card hero">
      <div class="eyebrow">Up next. ${esc(eyebrow)}</div>
      <div class="hero-top">
        <h2 class="display">${prayedToday ? 'Pray again' : 'Today’s prayers'}</h2>
        <a class="btn btn-accent btn-start" href="#/pray" data-act="begin">Start</a>
      </div>
      <p class="muted">${prayedToday ? 'Prayed today. ' : ''}${plural(cards.length, 'prayer point')} · about ${mins} min</p>
      <div class="label">Session length</div>
      <div class="options" role="radiogroup">${SIZES.map(
        ([id, label]) => `<button role="radio" aria-checked="${id === size[0]}" data-act="size" data-size="${id}">${label}</button>`,
      ).join('')}</div>
      ${first ? `<p class="hero-first"><b>First up: ${esc(first.title)}</b><span>From ${esc(data.categories[first.categoryId].name)}. ${isPinned(first) ? 'Pinned to every session for now.' : size[3]}</span></p>` : ''}
    </section>`;
  }

  const tile = (n, label) => `<div class="tile"><b>${n}</b><span>${label}</span></div>`;
  const weekCard = `<section class="card panel">
    <div class="panel-head">${icon('today')}<h3>This week</h3><span class="panel-meta">${shortDate(week.from)} to ${shortDate(week.to)}</span></div>
    <div class="tiles">${tile(week.daysPrayed, week.daysPrayed === 1 ? 'Day' : 'Days')}${tile(week.prayers, week.prayers === 1 ? 'Prayer' : 'Prayers')}${tile(week.answered, 'Answered')}${tile(streak(data), 'Streak')}</div>
    <p class="panel-foot">“${esc(verse.text)}” <span>${esc(verse.ref)}</span></p>
  </section>`;

  const groups = activeCategories(data)
    .map((cat) => ({ cat, items: cards.filter((c) => c.categoryId === cat.id).map((c) => data.items[c.itemId]) }))
    .filter((g) => g.items.length);

  // Dated prayers whose day has passed: a nudge to ask how it went.
  const ups = followUps(data);
  const followCard = ups.length
    ? `<section class="card panel follow">
      <div class="panel-head">${icon('chat')}<h3>Follow up</h3><span class="panel-meta">${ups.length > 1 ? ups.length : ''}</span></div>
      ${ups
        .slice(0, 5)
        .map((i) => {
          const cat = data.categories[i.categoryId];
          return `<div class="follow-row" style="${catColour(cat)}">
            <p><b>${esc(i.title)}</b> was ${esc(whenPast(i.eventAt))}. Ask how it went?</p>
            <div class="follow-actions">
              <button class="btn btn-sm" data-act="fu-update" data-id="${i.id}">${icon('chat')} Add update</button>
              <button class="btn btn-sm" data-act="fu-answered" data-id="${i.id}">${icon('answered')} Answered</button>
              <button class="btn btn-sm btn-quiet" data-act="fu-later" data-id="${i.id}">Tomorrow</button>
              <button class="btn btn-sm btn-quiet" data-act="fu-done" data-id="${i.id}">Done</button>
            </div>
          </div>`;
        })
        .join('')}
    </section>`
    : '';

  return `${topbar}
    <h1 class="greeting display">${greeting()}</h1>
    ${hero}
    ${followCard}
    ${total ? weekCard : ''}
    ${groups
      .map(
        (g) => `<section class="card panel" style="${catColour(g.cat)}">
        <a class="panel-head" href="#/list/${g.cat.id}">${icon(g.cat.icon)}<h3>${esc(g.cat.name)}</h3><span class="panel-meta">${g.items.length} of ${itemsIn(data, g.cat.id).length} ${icon('chevron')}</span></a>
        <div class="list">${g.items.map((i) => itemRow(i)).join('')}</div>
      </section>`,
      )
      .join('')}`;
};

let query = '';

function searchResults() {
  const data = S.getData();
  const q = query.trim().toLowerCase();
  const hits = Object.values(data.items)
    .filter(
      (i) =>
        live(i) &&
        `${i.title} ${i.notes} ${(i.tags || []).join(' ')} ${i.answerNote || ''}`.toLowerCase().includes(q),
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return hits.length
    ? `<div class="card list">${hits.map((i) => itemRow(i, { showCat: true })).join('')}</div>`
    : `<p class="muted center">Nothing matches “${esc(query)}”.</p>`;
}

function listsBody() {
  if (query.trim()) return searchResults();
  const data = S.getData();
  const tags = allTags(data);
  return `<div class="cat-grid">
      ${activeCategories(data)
        .map((cat) => {
          const n = itemsIn(data, cat.id).length;
          return `<a class="cat-card" href="#/list/${cat.id}" style="${catColour(cat)}">
            <span class="cat-badge">${icon(cat.icon)}</span>
            <span class="cat-name">${esc(cat.name)}</span>
            <span class="cat-count">${n ? plural(n, 'point') : 'Empty'}</span>
          </a>`;
        })
        .join('')}
      <button class="cat-card cat-new" data-act="new-cat">${icon('plus')}<span class="cat-name">New list</span></button>
    </div>
    ${
      tags.length
        ? `<h3 class="section-title">Tags</h3>
      <div class="chips">${tags.map((t) => `<a class="chip" href="#/tag/${encodeURIComponent(t.tag)}">${esc(t.tag)}<span class="chip-n">${t.count}</span></a>`).join('')}</div>`
        : ''
    }`;
}

VIEWS.lists = () => `${header('Lists')}
  <label class="search">${icon('search')}<input id="search" type="search" placeholder="Search prayer points and tags" value="${esc(query)}" autocomplete="off"></label>
  <div id="lists-body">${listsBody()}</div>
`;

VIEWS.list = (id) => {
  const data = S.getData();
  const cat = data.categories[id];
  if (!live(cat)) return VIEWS.lists();
  const items = itemsIn(data, id);
  const answered = answeredItems(data).filter((i) => i.categoryId === id).length;
  return `${header(`<span class="title-ic" style="${catColour(cat)}">${icon(cat.icon)}</span>${esc(cat.name)}`, {
    back: '#/lists',
    kicker: `${plural(items.length, 'prayer point')} · ${cadence(cat)}${
      cat.frequency === 'weekly' && items.length ? ` · ${listDue(data, cat) ? 'due today' : `next ${dateLabel(nextDue(data, cat)).toLowerCase()}`}` : ''
    }`,
    actions: `<button class="icon-btn" data-act="edit-cat" data-id="${id}" aria-label="Edit list">${icon('edit')}</button>`,
  })}
  ${
    items.length
      ? `<div class="card list">${items.map((i) => itemRow(i)).join('')}</div>`
      : emptyState('Nothing here yet', `Add someone or something to pray for in ${esc(cat.name)}. To add lots at once, tap + and paste a list, one per line.`, `<button class="btn" data-act="quick-add" data-cat="${id}">${icon('plus')} Add prayer point</button>`)
  }
  ${answered ? `<a class="link-row" href="#/answered">${icon('answered')} ${plural(answered, 'answered prayer')} from this list ${icon('chevron')}</a>` : ''}
`;
};

VIEWS.tag = (tag) => {
  const data = S.getData();
  const key = tag.toLowerCase();
  const items = Object.values(data.items)
    .filter((i) => live(i) && (i.tags || []).some((t) => t.toLowerCase() === key))
    .sort((a, b) => !!a.answeredAt - !!b.answeredAt || (b.createdAt || 0) - (a.createdAt || 0));
  return `${header(`${icon('tag', 'title-tag')}${esc(tag)}`, { back: '#/lists', kicker: plural(items.length, 'prayer point') })}
    ${items.length ? `<div class="card list">${items.map((i) => itemRow(i, { showCat: true })).join('')}</div>` : emptyState('No prayer points', 'Nothing uses this tag any more.')}`;
};

VIEWS.answered = () => {
  const data = S.getData();
  const items = answeredItems(data);
  return `${header('Answered', { kicker: items.length ? `${plural(items.length, 'answered prayer')} to give thanks for` : 'A record of God’s faithfulness' })}
  ${
    items.length
      ? `<div class="journal">${items
          .map((i) => {
            const cat = data.categories[i.categoryId];
            return `<button class="journal-entry" data-act="edit-item" data-id="${i.id}" style="${catColour(cat)}">
              <span class="journal-date">${longDate(i.answeredAt)}${cat && live(cat) ? ` · ${esc(cat.name)}` : ''}</span>
              <span class="journal-title">${esc(i.title)}</span>
              ${i.answerNote ? `<span class="journal-note">${esc(i.answerNote)}</span>` : ''}
              ${
                (i.updates || []).length
                  ? `<span class="journal-updates">${[...i.updates]
                      .sort((a, b) => a.at - b.at)
                      .map((u) => `<span><i>${esc(new Date(u.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</i>${esc(u.text)}</span>`)
                      .join('')}</span>`
                  : ''
              }
              <span class="journal-meta">${i.prayedCount ? `Prayed ${plural(i.prayedCount, 'time')} over ${plural(Math.max(1, Math.round((i.answeredAt - i.createdAt) / 86400000)), 'day')}` : `Added ${longDate(i.createdAt)}`}</span>
            </button>`;
          })
          .join('')}</div>`
      : emptyState('No answered prayers yet', 'When God answers a prayer, open it and mark it as answered. It will be kept here so you can look back and give thanks.')
  }`;
};

let showReset = false; // "Forgot it?" form while locked
let changingPass = false; // "Change passphrase" form while connected

const passFields = (confirmIt, placeholder = 'Sync passphrase') => `
  <input name="pass" type="password" placeholder="${placeholder}" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" required>
  ${confirmIt ? '<input name="pass2" type="password" placeholder="Type it again" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" required>' : ''}
  <label class="show-pass"><input type="checkbox" data-show-pass> Show passphrase</label>`;

function syncSection() {
  const cfg = S.getPrefs().sync;
  const st = Sync.getStatus();
  const line = (text) => `<div class="sync-line"><span class="sync-dot is-${st.state}"></span><span>${esc(text)}</span>
    ${st.at && st.state === 'ok' ? `<span class="muted">· ${new Date(st.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>` : ''}</div>`;

  if (!cfg) {
    return `<div class="card pad">
      <p>Keep your Mac and iPhone in step through your own GitHub account. Everything is <b>encrypted on this device</b> with a passphrase only you know, so GitHub, or anyone who finds the link, only ever sees scrambled data.</p>
      <ol class="steps">
        <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=Let%27s%20Pray%20sync" target="_blank" rel="noopener">Create a GitHub token</a> with only the <b>gist</b> box ticked.</li>
        <li>Choose a sync passphrase. Four or more random words work well.</li>
        <li>Enter both here, and the same on your other device.</li>
      </ol>
      ${st.state === 'syncing' ? line(st.message) : ''}
      <form class="sync-form" data-form="connect">
        <input name="token" type="password" placeholder="GitHub token (ghp_…)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required>
        ${passFields(true)}
        <p class="error small" data-form-error>${st.state === 'error' ? esc(st.message) : ''}</p>
        <button class="btn btn-primary" type="submit">${icon('lock')} Connect</button>
      </form>
      <p class="muted small">Your passphrase is never stored or sent anywhere. If you forget it, your prayers on each device are safe, and you can choose a new one.</p>
    </div>`;
  }

  if (st.state === 'locked') {
    return `<div class="card pad">
      ${line(st.setup ? 'Encryption needs setting up' : 'Sync paused')}
      <p class="small">${esc(st.message)}</p>
      ${
        showReset
          ? `<form class="sync-form" data-form="reset">
          <p class="small">Choose a new passphrase. This device’s prayers become the sync copy, and your other devices will ask for the new passphrase, then add their prayers back in.</p>
          ${passFields(true, 'New passphrase')}
          <p class="error small" data-form-error></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${icon('lock')} Start again</button><button class="btn btn-quiet" type="button" data-act="sync-forgot">Back</button></div>
        </form>`
          : `<form class="sync-form" data-form="unlock">
          ${passFields(!!st.setup, st.setup ? 'Choose a sync passphrase' : 'Sync passphrase')}
          <p class="error small" data-form-error></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${icon('lock')} ${st.setup ? 'Turn on encryption' : 'Unlock'}</button>${st.setup ? '' : '<button class="btn btn-quiet" type="button" data-act="sync-forgot">Forgot it?</button>'}</div>
        </form>`
      }
    </div>`;
  }

  return `<div class="card pad">
    ${line(st.message || 'Connected')}
    <p class="secure-line">${icon('lock')} End-to-end encrypted. Only devices with your passphrase can read your prayers.</p>
    <div class="btn-row">
      <button class="btn" data-act="sync-now">${icon('sync')} Sync now</button>
      <button class="btn" data-act="sync-change">Change passphrase</button>
      <button class="btn btn-quiet" data-act="sync-off">Disconnect</button>
    </div>
    ${
      changingPass
        ? `<form class="sync-form" data-form="change">
        <p class="small">Your other devices will ask for the new passphrase next time they sync.</p>
        ${passFields(true, 'New passphrase')}
        <p class="error small" data-form-error></p>
        <div class="btn-row"><button class="btn btn-primary" type="submit">${icon('lock')} Save new passphrase</button><button class="btn btn-quiet" type="button" data-act="sync-change">Cancel</button></div>
      </form>`
        : ''
    }
  </div>`;
}

// Redraw the sync card without losing anything half typed.
function refreshSync() {
  const box = $('#sync-section');
  if (!box) return;
  const typed = $$('input[name]', box).map((i) => [i.closest('form')?.dataset.form, i.name, i.value, i.type]);
  box.innerHTML = syncSection();
  for (const [form, name, value, type] of typed) {
    const el = $(`form[data-form="${form}"] input[name="${name}"]`, box);
    if (el) {
      el.value = value;
      el.type = type;
    }
  }
  const shown = $('form input[name="pass"]', box)?.type === 'text';
  $$('[data-show-pass]', box).forEach((c) => (c.checked = shown));
}

// ---------- Reminders ----------

const reminderPrefs = () => ({ ...Notify.DEFAULT_REMINDER, ...S.getPrefs().reminder });
let notifyState = 'unknown';
const pad2 = (n) => String(n).padStart(2, '0');

function remindersSection() {
  const r = reminderPrefs();
  const time = `<label class="time-row"><span>Time</span><input id="rem-time" type="time" data-rem="time" value="${pad2(r.hour)}:${pad2(r.minute)}"></label>`;
  const days = `<div class="days">${WEEKDAY_NAMES.map((d, i) => `<button class="chip" data-act="rem-day" data-day="${i}" aria-pressed="${r.days.includes(i)}" aria-label="${d}">${d.slice(0, 3)}</button>`).join('')}</div>`;
  const toggle = (key, title, hint) => `<label class="switch-row"><span><b>${title}</b><small>${hint}</small></span><input type="checkbox" class="switch" id="rem-${key}" data-rem="${key}" ${r[key] ? 'checked' : ''}></label>`;
  if (Notify.canNotify()) {
    return `<div class="card pad reminders">
      ${toggle('on', 'Daily reminder', 'A notification at the same time each day')}
      <div class="rem-detail" ${r.on ? '' : 'hidden'}>${time}${days}</div>
      ${toggle('followUps', 'Follow-up reminders', 'The morning after a dated prayer, a nudge to ask how it went')}
      ${toggle('details', 'Show details on the lock screen', 'When off, reminders only say how many prayer points there are, so names and needs stay private')}
      ${notifyState === 'denied' ? '<p class="error small">Notifications are turned off for Let’s Pray. Turn them on in iPhone Settings → Let’s Pray → Notifications.</p>' : ''}
    </div>`;
  }
  return `<div class="card pad reminders">
    <p>Daily push reminders arrive once Let’s Pray is installed from the App Store. Until then, add a repeating reminder to your calendar.</p>
    ${time}${days}
    <div class="btn-row"><button class="btn btn-primary" data-act="rem-calendar">${icon('bell')} Add to calendar</button></div>
    <p class="muted small">Follow-ups for dated prayers appear on your Today screen.</p>
  </div>`;
}

const refreshReminders = () => {
  const box = $('#reminders-section');
  if (box) box.innerHTML = remindersSection();
};

let rescheduleTimer;
function scheduleReminders() {
  if (!Notify.canNotify()) return;
  clearTimeout(rescheduleTimer);
  rescheduleTimer = setTimeout(() => Notify.reschedule(S.getData(), reminderPrefs()).catch(() => {}), 1200);
}

async function updateReminder(patch) {
  S.setPrefs({ reminder: { ...reminderPrefs(), ...patch } });
  if (Notify.canNotify() && (patch.on || patch.followUps)) notifyState = await Notify.permission(true);
  scheduleReminders();
  refreshReminders();
}

// ---------- Siri & Shortcuts ----------

const shortcutLink = (save = false) =>
  Notify.isNativeApp() ? `letspray://add?${save ? 'save=1&' : ''}text=` : `${location.origin}${location.pathname}#/add?${save ? 'save=1&' : ''}text=`;

function shortcutSection() {
  return `<div class="card pad">
    <p>Add prayers by voice. Say <b>“Hey Siri, add prayer”</b>, speak it, and Quick add sorts out the list, date and tags.</p>
    <ol class="steps">
      <li>Open the <b>Shortcuts</b> app, tap <b>+</b>, and name the shortcut <b>Add prayer</b>.</li>
      <li>Add the actions <b>Dictate Text</b>, then <b>URL Encode</b>.</li>
      <li>Add <b>URL</b>, paste the link below, then insert <i>URL Encoded Text</i> at the end.</li>
      <li>Add <b>Open URLs</b>.</li>
    </ol>
    <div class="copy-row"><code>${esc(shortcutLink())}</code><button class="btn btn-sm" data-act="copy-link" data-link="${esc(shortcutLink())}">${icon('copy')} Copy</button></div>
    <p class="muted small">To add straight away without checking first, use this link instead:</p>
    <div class="copy-row"><code>${esc(shortcutLink(true))}</code><button class="btn btn-sm" data-act="copy-link" data-link="${esc(shortcutLink(true))}">${icon('copy')} Copy</button></div>
    ${
      Notify.isNativeApp()
        ? ''
        : '<p class="muted small">On iPhone a web link opens Safari rather than the Home Screen app, so adding by voice works best once Let’s Pray is in the App Store. On a Mac it works now.</p>'
    }
  </div>`;
}

// Opened from a Siri shortcut or link: #/add?text=…[&save=1]
function handleAddLink(text, save) {
  if (save && text.trim()) {
    const data = S.getData();
    const list = parseMany(text, data).filter((p) => !findDuplicate(data, p.title));
    if (!list.length) return toast('Already on your lists');
    S.batch(list.length > 1 ? `Added ${list.length}` : 'Added', () => {
      for (const p of list) S.saveItem({ title: p.title, notes: p.notes, categoryId: p.categoryId, tags: p.tags, eventAt: p.date || 0, pinUntil: p.pinUntil || 0 });
    });
    return toast(list.length > 1 ? `Added ${list.length} prayer points` : `Added to ${data.categories[list[0].categoryId]?.name || 'your list'}`, { undo: true });
  }
  openQuickAdd({ text });
}

// ---------- Backups ----------

let backupPanel = ''; // 'export', 'plain' or 'import'
let pendingImport = null; // a locked backup waiting for its passphrase

function backupSection() {
  const synced = !!S.getPrefs().sync;
  let panel = '';
  if (backupPanel === 'export') {
    panel = `<form class="sync-form" data-form="backup-export">
      ${
        synced
          ? `<label class="radio-row"><input type="radio" name="how" value="sync" checked> Lock it with my sync passphrase</label>
             <label class="radio-row"><input type="radio" name="how" value="new"> Choose a different passphrase</label>`
          : ''
      }
      <div class="sync-form" data-new-pass ${synced ? 'hidden' : ''}>${passFields(true, 'Backup passphrase')}</div>
      <p class="error small" data-form-error></p>
      <div class="btn-row"><button class="btn btn-primary" type="submit">${icon('lock')} Export locked backup</button><button class="btn btn-quiet" type="button" data-act="backup-cancel">Cancel</button></div>
      <button class="link-btn small-link" type="button" data-act="backup-plain">Export without a passphrase</button>
    </form>`;
  } else if (backupPanel === 'plain') {
    panel = `<div class="dup-note">${icon('lock')}<span>Anyone who gets an unlocked file can read every prayer in it.</span>
      <button class="btn btn-sm" data-act="backup-plain-go">Export unlocked</button><button class="btn btn-sm btn-quiet" data-act="backup-cancel">Cancel</button></div>`;
  } else if (backupPanel === 'import') {
    panel = `<form class="sync-form" data-form="backup-import">
      <p class="small">This backup is locked. Enter the passphrase it was exported with.</p>
      ${passFields(false, 'Backup passphrase')}
      <p class="error small" data-form-error></p>
      <div class="btn-row"><button class="btn btn-primary" type="submit">${icon('lock')} Unlock and import</button><button class="btn btn-quiet" type="button" data-act="backup-cancel">Cancel</button></div>
    </form>`;
  }
  return `<div class="card pad">
    <p class="muted small">Save everything as one file to keep in iCloud Drive or email to yourself. Backups are locked with a passphrase. Importing merges with what is already here, and can be undone.</p>
    <div class="btn-row">
      <button class="btn" data-act="backup-export">${icon('lock')} Export backup</button>
      <label class="btn">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
    </div>
    ${panel}
  </div>`;
}

const refreshBackup = () => {
  const box = $('#backup-section');
  if (box) box.innerHTML = backupSection();
};

// Hands a file to the person: the share sheet in the App Store app (so it can
// go to Files or Mail), otherwise a normal download.
async function saveFile(name, text, type = 'application/json') {
  const cap = window.Capacitor?.Plugins;
  if (Notify.isNativeApp() && cap?.Filesystem && cap?.Share) {
    const { uri } = await cap.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await cap.Share.share({ title: name, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBackup(record) {
  const envelope = record ? { ...(await seal(S.getData(), record)), backup: true, exportedAt: Date.now() } : S.getData();
  await saveFile(`letspray-backup-${dayKey()}.json`, JSON.stringify(envelope, null, record ? 0 : 2));
  backupPanel = '';
  refreshBackup();
  toast(record ? 'Locked backup saved' : 'Backup saved');
}

VIEWS.settings = () => {
  const data = S.getData();
  const prefs = S.getPrefs();
  const cats = activeCategories(data);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `${header('Settings')}
  <h3 class="section-title">You</h3>
  <div class="card pad">
    <label class="name-row"><span>Your name</span><input id="name" value="${esc(prefs.name || '')}" placeholder="For the greeting on Today" maxlength="24" autocomplete="given-name"></label>
  </div>

  <h3 class="section-title">Sync</h3>
  <div id="sync-section">${syncSection()}</div>

  <h3 class="section-title">Reminders</h3>
  <div id="reminders-section">${remindersSection()}</div>

  <h3 class="section-title">Siri & Shortcuts</h3>
  ${shortcutSection()}

  <h3 class="section-title">Prayer session</h3>
  <div class="card list">
    ${cats
      .map(
        (cat, i) => `<div class="row row-static" style="${catColour(cat)}">
        <span class="row-ic">${icon(cat.icon)}</span>
        <span class="row-body"><span class="row-title">${esc(cat.name)}</span><span class="row-notes">${esc(cadence(cat))}</span></span>
        <span class="stepper">
          <button class="icon-btn sm" data-act="per" data-id="${cat.id}" data-d="-1" aria-label="Fewer">−</button>
          <button class="icon-btn sm" data-act="per" data-id="${cat.id}" data-d="1" aria-label="More">+</button>
          <button class="icon-btn sm" data-act="move" data-id="${cat.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button>
          <button class="icon-btn sm" data-act="move" data-id="${cat.id}" data-d="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button>
        </span>
      </div>`,
      )
      .join('')}
  </div>

  <h3 class="section-title">Appearance</h3>
  <div class="segmented" role="radiogroup">
    ${['auto', 'light', 'dark'].map((t) => `<button role="radio" aria-checked="${prefs.theme === t}" data-act="theme" data-theme="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
  </div>

  <h3 class="section-title">Backup</h3>
  <div id="backup-section">${backupSection()}</div>

  ${
    standalone || Notify.isNativeApp()
      ? ''
      : `<h3 class="section-title">Install</h3>
  <div class="card pad"><p class="small">${
    ios
      ? 'On iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.'
      : 'On Mac: in Safari choose <b>File → Add to Dock</b>, or in Chrome use the install icon in the address bar.'
  } Let’s Pray then opens like an app and works offline.</p></div>`
  }
  <p class="muted small center foot">Let’s Pray · your data lives on this device${prefs.sync ? ', with an encrypted copy in your GitHub account' : ''}.</p>`;
};

// ---------- Prayer session ----------

let session = null;

function startSession() {
  session = { cards: buildSession(S.getData(), sessionSize()[2]), index: 0, prayed: 0 };
}

VIEWS.pray = () => {
  const data = S.getData();
  if (!session) startSession();
  // Skip cards whose item was deleted or answered elsewhere.
  while (session.index < session.cards.length) {
    const it = data.items[session.cards[session.index].itemId];
    if (live(it) && !it.answeredAt) break;
    session.cards.splice(session.index, 1);
  }
  const { cards, index } = session;
  const close = `<button class="icon-btn" data-act="pray-close" aria-label="Close">${icon('x')}</button>`;

  if (!cards.length) {
    return `<div class="pray"><div class="pray-top">${close}</div>
      ${emptyState('Nothing to pray through yet', 'Add some prayer points to your lists first.', '<a class="btn" href="#/lists">Go to lists</a>')}</div>`;
  }

  if (index >= cards.length) {
    const verse = verseFor(1);
    return `<div class="pray"><div class="pray-top">${close}</div>
      <div class="pray-done">
        <div class="done-mark">${icon('check')}</div>
        <h2 class="display">Amen.</h2>
        <p>You prayed for ${plural(session.prayed, 'prayer point')}${streak(data) > 1 ? ` · ${streak(data)} days in a row` : ''}.</p>
        <figure class="verse"><blockquote>${esc(verse.text)}</blockquote><figcaption>${esc(verse.ref)} (NIV)</figcaption></figure>
        <button class="btn btn-accent btn-lg" data-act="pray-close">Done</button>
      </div></div>`;
  }

  const item = data.items[cards[index].itemId];
  const cat = data.categories[item.categoryId];
  return `<div class="pray" style="${catColour(cat)}">
    <div class="pray-top">
      ${close}
      <div class="progress" aria-label="${index + 1} of ${cards.length}"><span style="width:${((index + 1) / cards.length) * 100}%"></span></div>
      <span class="muted small">${index + 1} / ${cards.length}</span>
    </div>
    <article class="pray-card" id="pray-card">
      <div class="eyebrow pray-cat">${icon(cat?.icon || 'star')}${esc(cat?.name || '')}</div>
      <h2 class="pray-title">${esc(item.title)}</h2>
      ${item.notes ? `<p class="pray-notes">${esc(item.notes)}</p>` : ''}
      ${(() => {
        const u = latestUpdate(item);
        return u ? `<div class="pray-update"><span>${icon('chat')} Latest · ${esc(ago(u.at).replace('Prayed ', ''))}</span>${esc(u.text)}</div>` : '';
      })()}
      ${(item.tags || []).length || isPinned(item) ? `<div class="chips">${pinChip(item)}${tagChips(item.tags)}</div>` : ''}
      ${item.eventAt ? `<div class="pray-meta pray-date">${icon('today')} ${esc(dateLabel(item.eventAt, true))}</div>` : ''}
      <div class="pray-meta">${icon('clock')} ${esc(ago(item.lastPrayedAt))}${item.prayedCount ? ` · ${plural(item.prayedCount, 'time')} so far` : ''}</div>
    </article>
    <div class="pray-actions">
      <button class="btn btn-quiet" data-act="pray-back" ${index === 0 ? 'disabled' : ''} aria-label="Previous">${icon('back')}</button>
      <button class="btn" data-act="pray-answered" data-id="${item.id}">${icon('answered')} Answered</button>
      <button class="btn btn-quiet" data-act="pray-skip">Skip</button>
      <button class="btn btn-accent btn-lg pray-amen" data-act="pray-done" data-id="${item.id}">${icon('check')} Prayed</button>
    </div>
    <p class="pray-hint muted small">Swipe left when you have prayed · ← → keys on Mac</p>
  </div>`;
};

function prayAdvance(prayedId) {
  session.index += 1;
  if (prayedId) {
    session.prayed += 1;
    S.markPrayed(prayedId); // triggers a render
  } else render();
}

// Going back to the previous card also un-marks it if Prayed was the last
// thing done, so a mis-tap is easy to fix.
function prayBack() {
  if (!session || session.index === 0) return;
  session.index -= 1;
  const prev = session.cards[session.index];
  const last = S.lastUndo();
  if (last?.label === 'Prayed' && last.meta.itemId === prev?.itemId) {
    session.prayed -= 1;
    S.undo(); // triggers a render
    toast('Prayed un-marked');
  } else render();
}

function bindSwipe() {
  const card = $('#pray-card');
  if (!card) return;
  let x0 = null;
  let dx = 0;
  card.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    dx = 0;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    card.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.5));
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    card.style.transition = '';
    if (dx < -90) {
      card.classList.add('fly-left');
      setTimeout(() => prayAdvance($('[data-act="pray-done"]')?.dataset.id), 160);
    } else if (dx > 90 && session.index > 0) {
      prayBack();
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

// ---------- Sheets ----------

function openSheet(html, { onClose } = {}) {
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('open'));
  const close = () => {
    root.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => root.remove(), 220);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  return { el: $('.sheet', root), close };
}

function autosize(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

function openItemSheet({ id, categoryId, prefill } = {}) {
  const data = S.getData();
  const existing = id ? data.items[id] : null;
  const cats = activeCategories(data);
  const draft = existing
    ? { ...existing, tags: [...(existing.tags || [])] }
    : { title: '', notes: '', tags: [], eventAt: 0, pinUntil: 0, categoryId: categoryId && data.categories[categoryId] ? categoryId : cats[0]?.id, ...prefill };
  if (!isPinned(draft)) draft.pinUntil = 0;

  const answeredBlock = existing?.answeredAt
    ? `<div class="answered-box">${icon('answered')}<div><b>Answered ${longDate(existing.answeredAt)}</b>${existing.answerNote ? `<p>${esc(existing.answerNote)}</p>` : ''}</div></div>`
    : '';

  const { el, close } = openSheet(`
    <div class="sheet-head">
      <button class="btn btn-quiet" data-close>Cancel</button>
      <h2>${existing ? 'Prayer point' : 'New prayer point'}</h2>
      <button class="btn btn-primary" data-save>Save</button>
    </div>
    <div class="sheet-body">
      ${answeredBlock}
      <textarea class="field field-title" name="title" rows="1" placeholder="Who or what are you praying for?" maxlength="140" autocomplete="off" enterkeyhint="next">${esc(draft.title)}</textarea>
      <textarea class="field" name="notes" rows="2" placeholder="Details, a verse, what to ask for…">${esc(draft.notes)}</textarea>

      <div class="field-label">Date <span class="label-hint">optional · comes up first around then</span></div>
      <div class="date-row">
        <input class="field date-input" type="date" name="date" value="${draft.eventAt ? dayKey(draft.eventAt) : ''}">
        <button class="btn btn-quiet" data-clear-date>Clear</button>
      </div>

      <div class="field-label">Pin to every session</div>
      <div class="chips pin-pick" data-pins></div>

      <div class="field-label">List</div>
      <div class="chips cat-pick">${cats
        .map((c) => `<button class="chip chip-cat" data-cat="${c.id}" aria-pressed="${c.id === draft.categoryId}" style="${catColour(c)}">${icon(c.icon)}${esc(c.name)}</button>`)
        .join('')}</div>

      <div class="field-label">Tags</div>
      <div class="tag-box">
        <div class="chips" data-tags></div>
        <input class="tag-input" name="tag" placeholder="Add a tag" autocomplete="off" enterkeyhint="done">
      </div>
      <div data-suggest></div>

      ${
        existing
          ? `<div class="field-label">Updates</div>
        <div class="updates" data-updates></div>
        <div class="update-add">
          <textarea class="field" name="update" rows="1" placeholder="What’s the latest?"></textarea>
          <button class="btn" data-add-update>Add</button>
        </div>
        <div class="sheet-foot">
          ${
            existing.answeredAt
              ? `<button class="btn" data-unanswer>${icon('undo')} Move back to praying</button>`
              : `<button class="btn" data-answer>${icon('answered')} Mark as answered</button>`
          }
          <button class="btn btn-danger" data-delete>${icon('trash')} Delete</button>
        </div>
        <p class="muted small">${esc(ago(existing.lastPrayedAt))}${existing.prayedCount ? ` · ${plural(existing.prayedCount, 'time')} in total` : ''} · added ${longDate(existing.createdAt)}</p>`
          : ''
      }
    </div>`);

  const title = $('[name=title]', el);
  const notes = $('[name=notes]', el);
  const tagInput = $('[name=tag]', el);
  autosize(title);
  autosize(notes);
  if (!existing) setTimeout(() => title.focus(), 250);

  const PINS = [['Off', 0], ['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['Until I unpin', -1]];
  let pinChoice = draft.pinUntil ? (draft.pinUntil >= PIN_FOREVER ? -1 : 'keep') : 0;
  const renderPins = () => {
    const options = [...PINS];
    if (pinChoice === 'keep') options.splice(1, 0, [pinLabel(draft.pinUntil).replace('Pinned to ', 'Until '), 'keep']);
    $('[data-pins]', el).innerHTML = options
      .map(([label, v]) => `<button class="chip" data-pin="${v}" aria-pressed="${v === pinChoice}">${v ? icon('pin') : ''}${esc(label)}</button>`)
      .join('');
  };
  const pinUntilValue = () => (pinChoice === 'keep' ? draft.pinUntil : pinChoice === -1 ? PIN_FOREVER : pinChoice ? pinFor(pinChoice) : 0);

  const renderUpdates = () => {
    const box = $('[data-updates]', el);
    if (!box) return;
    const list = [...(S.getData().items[existing.id]?.updates || [])].sort((a, b) => b.at - a.at);
    box.innerHTML = list.length
      ? list
          .map(
            (u) => `<div class="update"><span class="update-date">${esc(new Date(u.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(u.at).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }))}</span>
            <span class="update-text">${esc(u.text)}</span>
            <button class="icon-btn sm" data-del-update="${u.id}" aria-label="Delete update">${icon('x')}</button></div>`,
          )
          .join('')
      : '<p class="muted small">No updates yet. Add one when you hear how things are going.</p>';
  };

  const renderTags = () => {
    $('[data-tags]', el).innerHTML = draft.tags
      .map((t, i) => `<button class="chip chip-on" data-remove="${i}" aria-label="Remove ${esc(t)}">${esc(t)}${icon('x')}</button>`)
      .join('');
    renderSuggestions();
  };

  const renderSuggestions = () => {
    draft.title = title.value;
    draft.notes = notes.value;
    const typed = tagInput.value.trim().toLowerCase();
    const have = new Set(draft.tags.map((t) => t.toLowerCase()));
    let html = '';
    if (typed) {
      const matches = allTags(S.getData())
        .filter((t) => t.tag.toLowerCase().includes(typed) && !have.has(t.tag.toLowerCase()))
        .slice(0, 8);
      html = `<div class="suggest-row"><span class="suggest-label">Press return to add “${esc(cleanTag(tagInput.value))}”</span>
        ${matches.map((t) => `<button class="chip" data-add="${esc(t.tag)}">${esc(t.tag)}</button>`).join('')}</div>`;
    } else {
      const { contextual, frequent } = suggestTags(draft, S.getData());
      if (contextual.length)
        html += `<div class="suggest-row"><span class="suggest-label">${icon('sparkle')} Suggested</span>${contextual
          .map((t) => `<button class="chip chip-suggest" data-add="${esc(t)}">${icon('plus')}${esc(t)}</button>`)
          .join('')}</div>`;
      if (frequent.length)
        html += `<div class="suggest-row"><span class="suggest-label">${icon('clock')} Frequent</span>${frequent
          .map((t) => `<button class="chip" data-add="${esc(t)}">${icon('plus')}${esc(t)}</button>`)
          .join('')}</div>`;
    }
    $('[data-suggest]', el).innerHTML = html;
  };

  const addTag = (raw) => {
    const t = cleanTag(raw);
    if (t && !draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())) draft.tags.push(t);
    tagInput.value = '';
    renderTags();
  };

  let suggestTimer;
  const queueSuggest = () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(renderSuggestions, 120);
  };
  title.addEventListener('input', queueSuggest);
  notes.addEventListener('input', queueSuggest);
  tagInput.addEventListener('input', () => {
    if (/,/.test(tagInput.value)) {
      tagInput.value.split(',').slice(0, -1).forEach(addTag);
      tagInput.value = tagInput.value.split(',').pop();
    }
    renderSuggestions();
  });
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.value.trim()) addTag(tagInput.value);
    } else if (e.key === 'Backspace' && !tagInput.value && draft.tags.length) {
      draft.tags.pop();
      renderTags();
    }
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      notes.focus();
    }
  });

  const save = () => {
    if (tagInput.value.trim()) addTag(tagInput.value);
    const t = title.value.trim();
    if (!t) {
      title.focus();
      title.classList.add('shake');
      setTimeout(() => title.classList.remove('shake'), 400);
      return;
    }
    const dup = !existing && findDuplicate(S.getData(), t);
    if (dup && !confirm(`“${dup.title}” is already in ${S.getData().categories[dup.categoryId]?.name || 'your lists'}. Add it again?`)) return;
    const pending = $('[name=update]', el)?.value.trim();
    // Only the fields this form edits, so updates added meanwhile are kept.
    const fields = { title: t, notes: notes.value.trim(), tags: draft.tags, categoryId: draft.categoryId, eventAt: fromDateInput($('[name=date]', el).value), pinUntil: pinUntilValue() };
    S.batch(existing ? 'Saved' : 'Added', () => {
      const savedId = S.saveItem(existing ? { id: existing.id, ...fields } : fields);
      if (pending) S.addUpdate(savedId, pending);
    });
    close();
    toast(existing ? 'Saved' : 'Prayer point added', { undo: true });
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cat) {
      draft.categoryId = b.dataset.cat;
      $$('.cat-pick .chip', el).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      renderSuggestions();
    } else if (b.dataset.remove !== undefined) {
      draft.tags.splice(Number(b.dataset.remove), 1);
      renderTags();
    } else if (b.dataset.add) {
      addTag(b.dataset.add);
    } else if ('clearDate' in b.dataset) {
      $('[name=date]', el).value = '';
    } else if (b.dataset.pin !== undefined) {
      pinChoice = b.dataset.pin === 'keep' ? 'keep' : Number(b.dataset.pin);
      renderPins();
    } else if ('addUpdate' in b.dataset) {
      const box = $('[name=update]', el);
      if (!box.value.trim()) return box.focus();
      S.addUpdate(existing.id, box.value);
      box.value = '';
      box.style.height = '';
      renderUpdates();
      toast('Update added', { undo: true });
    } else if (b.dataset.delUpdate) {
      S.deleteUpdate(existing.id, b.dataset.delUpdate);
      renderUpdates();
      toast('Update deleted', { undo: true });
    } else if ('save' in b.dataset) {
      save();
    } else if ('delete' in b.dataset) {
      S.deleteItem(existing.id);
      close();
      toast('Deleted', { undo: true });
    } else if ('answer' in b.dataset) {
      close();
      openAnswerSheet(existing.id);
    } else if ('unanswer' in b.dataset) {
      S.unmarkAnswered(existing.id);
      close();
      toast('Back on your list', { undo: true });
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  });

  renderTags();
  renderPins();
  if (existing) {
    renderUpdates();
    autosize($('[name=update]', el));
  }
}

// A quick update from the follow-up card ("Surgery went well, now rehab").
function openUpdateSheet(id) {
  const item = S.getData().items[id];
  if (!item) return;
  const { el, close } = openSheet(`
    <div class="sheet-head">
      <button class="btn btn-quiet" data-close>Cancel</button>
      <h2>Update</h2>
      <button class="btn btn-primary" data-save>Save</button>
    </div>
    <div class="sheet-body">
      <p class="answer-for">${icon('chat')} ${esc(item.title)}</p>
      <textarea class="field" name="update" rows="3" placeholder="How is it going? What should you keep praying for?"></textarea>
      <p class="muted small">Updates build a short timeline on the prayer point, so you can see how God has been at work.</p>
    </div>`);
  const box = $('[name=update]', el);
  autosize(box);
  setTimeout(() => box.focus(), 250);
  const save = () => {
    if (!box.value.trim()) return box.focus();
    S.addUpdate(id, box.value);
    close();
    toast('Update added', { undo: true });
  };
  $('[data-save]', el).addEventListener('click', save);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  });
}

function openAnswerSheet(id, { onDone } = {}) {
  const item = S.getData().items[id];
  const { el, close } = openSheet(`
    <div class="sheet-head">
      <button class="btn btn-quiet" data-close>Cancel</button>
      <h2>Answered prayer</h2>
      <button class="btn btn-primary" data-save>Save</button>
    </div>
    <div class="sheet-body">
      <p class="answer-for">${icon('answered')} ${esc(item.title)}</p>
      <textarea class="field" name="note" rows="3" placeholder="How did God answer? (optional)"></textarea>
      <p class="muted small">It moves to your Answered journal, so you can look back and give thanks.</p>
    </div>`);
  const note = $('[name=note]', el);
  autosize(note);
  setTimeout(() => note.focus(), 250);
  $('[data-save]', el).addEventListener('click', () => {
    S.markAnswered(id, note.value.trim());
    close();
    toast('Praise God!', { undo: true });
    onDone?.();
  });
}

function openCategorySheet(id) {
  const data = S.getData();
  const existing = id ? data.categories[id] : null;
  const draft = existing ? { ...existing } : { name: '', icon: 'star', color: COLOURS[activeCategories(data).length % COLOURS.length], perSession: 2 };

  const { el, close } = openSheet(`
    <div class="sheet-head">
      <button class="btn btn-quiet" data-close>Cancel</button>
      <h2>${existing ? 'Edit list' : 'New list'}</h2>
      <button class="btn btn-primary" data-save>Save</button>
    </div>
    <div class="sheet-body">
      <input class="field field-title" name="name" placeholder="List name, e.g. Friends, Work, Growth group" value="${esc(draft.name)}" maxlength="40" autocomplete="off">
      <div class="field-label">Icon</div>
      <div class="icon-grid">${CATEGORY_ICONS.map((n) => `<button class="icon-pick" data-icon="${n}" aria-pressed="${n === draft.icon}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>
      <div class="field-label">Colour</div>
      <div class="swatches">${COLOURS.map((c) => `<button class="swatch" data-colour="${c}" aria-pressed="${c === draft.color}" style="--c: var(--cat-${c})" aria-label="${c}"></button>`).join('')}</div>
      <div class="field-label">How often</div>
      <div class="options options-2" role="radiogroup">
        <button role="radio" data-freq="session">Every session</button>
        <button role="radio" data-freq="weekly">Once a week</button>
      </div>
      <div class="days" data-days>${WEEKDAY_NAMES.map((d, i) => `<button class="chip" data-weekday="${i}" aria-label="${d}">${d.slice(0, 3)}</button>`).join('')}</div>
      <p class="muted small" data-freq-hint></p>
      <div class="field-label">Each time</div>
      <div class="per-row">
        <button class="icon-btn" data-per="-1" aria-label="Fewer">−</button>
        <span data-per-label></span>
        <button class="icon-btn" data-per="1" aria-label="More">+</button>
      </div>
      ${existing ? `<div class="sheet-foot"><button class="btn btn-danger" data-delete>${icon('trash')} Delete list</button></div>` : ''}
    </div>`);

  const name = $('[name=name]', el);
  const paint = () => {
    el.style.cssText = `--c: var(--cat-${draft.color})`;
    $('[data-per-label]', el).textContent = `Pray for ${draft.perSession} ${draft.perSession === 1 ? 'point' : 'points'}`;
    const weekly = draft.frequency === 'weekly';
    $$('[data-freq]', el).forEach((x) => x.setAttribute('aria-checked', String(x.dataset.freq === (weekly ? 'weekly' : 'session'))));
    $('[data-days]', el).hidden = !weekly;
    $$('[data-weekday]', el).forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.weekday) === (draft.weekday ?? 0))));
    $('[data-freq-hint]', el).textContent = weekly
      ? `Comes up on ${WEEKDAY_NAMES[draft.weekday ?? 0]}s, ${draft.perSession} at a time, working through the whole list in turn. If you miss the day, it waits until you pray it.`
      : `Comes up every time you pray, ${draft.perSession} at a time.`;
  };
  paint();
  if (!existing) setTimeout(() => name.focus(), 250);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.icon) {
      draft.icon = b.dataset.icon;
      $$('.icon-pick', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    } else if (b.dataset.colour) {
      draft.color = b.dataset.colour;
      $$('.swatch', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paint();
    } else if (b.dataset.freq) {
      draft.frequency = b.dataset.freq;
      if (draft.frequency === 'weekly' && draft.weekday == null) draft.weekday = 0;
      paint();
    } else if (b.dataset.weekday) {
      draft.weekday = Number(b.dataset.weekday);
      paint();
    } else if (b.dataset.per) {
      draft.perSession = Math.min(20, Math.max(0, draft.perSession + Number(b.dataset.per)));
      paint();
    } else if ('save' in b.dataset) {
      const n = name.value.trim();
      if (!n) return name.focus();
      const newId = S.saveCategory({ ...draft, name: n });
      close();
      if (!existing) location.hash = `#/list/${newId}`;
    } else if ('delete' in b.dataset) {
      const count = itemsIn(S.getData(), id).length;
      if (confirm(`Delete “${existing.name}”${count ? ` and its ${plural(count, 'prayer point')}` : ''}?`)) {
        S.deleteCategory(id);
        close();
        toast('List deleted', { undo: true });
        location.hash = '#/lists';
      }
    }
  });
}

// ---------- Quick add ----------

const QUICK_HINTS = [
  'Try “Mum’s surgery on Friday, for peace #health”',
  'Try “Growth group starting Romans next week”',
  'Paste a prayer list: one prayer per line',
  'Use @family to choose a list and #tag to add a tag',
];

function openQuickAdd({ categoryId = '', text = '' } = {}) {
  let added = 0;
  let addedIds = [];
  let parsed = [];
  let includeDups = false; // add repeats in a pasted list anyway
  let confirmDup = false; // a single repeat needs a second press
  // Changes made by hand, which further typing must not undo.
  let pickedList = '';
  let droppedDate = false;
  let droppedPin = false;
  let droppedTags = new Set();
  let extraTags = [];
  const reset = () => {
    pickedList = '';
    droppedDate = false;
    droppedPin = false;
    droppedTags = new Set();
    extraTags = [];
    includeDups = false;
    confirmDup = false;
  };

  // Marks prayers already on a list, or repeated earlier in what was pasted.
  const markDuplicates = (list) => {
    const data = S.getData();
    const seen = new Set();
    for (const p of list) {
      const key = titleKey(p.title);
      p.dup = findDuplicate(data, p.title);
      p.repeat = !p.dup && seen.has(key);
      seen.add(key);
    }
    return list;
  };
  const isDup = (p) => p.dup || p.repeat;
  const dupWhere = (p) => (p.dup ? `Already in ${S.getData().categories[p.dup.categoryId]?.name || 'a list'}` : 'Repeated above');

  const heading = () => {
    const data = S.getData();
    const n = addedIds.filter((id) => live(data.items[id])).length;
    $('[data-heading]', el).textContent = n ? `${n} added` : 'Quick add';
  };
  const stopWatching = S.subscribe(() => heading());

  const { el, close } = openSheet(`
    <div class="sheet-head">
      <button class="btn btn-quiet" data-close>Done</button>
      <h2 data-heading>Quick add</h2>
      <button class="btn btn-primary" data-add disabled>Add</button>
    </div>
    <div class="sheet-body">
      <textarea class="field field-quick" name="q" rows="2" placeholder="Type a prayer in your own words…" autocomplete="off" enterkeyhint="done"></textarea>
      <p class="quick-hint">${icon('sparkle')}<span data-hint>${QUICK_HINTS[Math.floor(Math.random() * QUICK_HINTS.length)]}</span></p>
      <div data-preview></div>
    </div>`, { onClose: () => stopWatching() });

  const input = $('[name=q]', el);
  input.value = text;
  autosize(input);
  setTimeout(() => input.focus(), 250);

  const finalise = (p) => {
    if (parsed.length > 1) return p;
    const tags = p.tags.filter((t) => !droppedTags.has(t.toLowerCase()));
    for (const t of extraTags) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    return { ...p, categoryId: pickedList || p.categoryId, tags, date: droppedDate ? 0 : p.date, pinUntil: droppedPin ? 0 : p.pinUntil };
  };

  const render = () => {
    parsed = markDuplicates(parseMany(input.value, S.getData(), { categoryId }));
    const dups = parsed.filter(isDup).length;
    const toAdd = parsed.length > 1 && !includeDups ? parsed.length - dups : parsed.length;
    const addBtn = $('[data-add]', el);
    addBtn.disabled = !toAdd;
    addBtn.textContent = parsed.length > 1 ? `Add ${toAdd}` : parsed.length && dups ? 'Add anyway' : 'Add';
    $('[data-hint]', el).textContent = parsed.length
      ? parsed.length > 1
        ? `${parsed.length} prayer points, one per line`
        : matchMedia('(hover: hover)').matches ? 'Return to add · Shift+Return for a new line' : 'Check it over, then tap Add'
      : QUICK_HINTS[added % QUICK_HINTS.length];
    const data = S.getData();
    const box = $('[data-preview]', el);
    if (!parsed.length) return (box.innerHTML = '');

    if (parsed.length > 1) {
      box.innerHTML = `${
        dups
          ? `<div class="dup-note">${icon('list')}<span>${plural(dups, 'repeat')} ${includeDups ? 'will be added again' : 'will be skipped'}.</span>
            <button class="link-btn" data-include-dups>${includeDups ? 'Skip them' : 'Add them anyway'}</button></div>`
          : ''
      }<div class="card list quick-many">${parsed
        .map((p) => {
          const cat = data.categories[p.categoryId];
          const skipped = isDup(p) && !includeDups;
          return `<div class="row row-static${skipped ? ' is-dup' : ''}" style="${catColour(cat)}">
            <span class="row-dot"></span>
            <span class="row-body"><span class="row-title">${esc(p.title)}</span>
            <span class="row-meta">${isDup(p) ? `<span class="dup-tag">${esc(dupWhere(p))}</span>` : ''}<span class="meta-cat">${esc(cat?.name || '')}</span>${pinChip(p)}${p.date ? dateChip(p.date) : ''}${tagChips(p.tags)}</span></span>
          </div>`;
        })
        .join('')}</div>`;
      return;
    }

    const p = finalise(parsed[0]);
    const cat = data.categories[p.categoryId];
    const why = pickedList ? '' : p.explicitList ? 'Chosen with @' : categoryId && p.categoryId === categoryId ? 'The list you’re in' : p.why ? `Picked because it ${p.why}` : '';
    const offered = p.suggestions.filter((t) => !p.tags.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 4);
    box.innerHTML = `<div class="card quick-card" style="${catColour(cat)}">
      ${
        p.dup
          ? `<div class="dup-note${confirmDup ? ' shake' : ''}">${icon('list')}<span>${esc(dupWhere(p))}${p.dup.title !== p.title ? `: “${esc(p.dup.title)}”` : ''}</span>
            <button class="link-btn" data-open-dup="${p.dup.id}">Open it</button></div>`
          : ''
      }
      <div class="q-title">${esc(p.title)}</div>
      ${p.notes ? `<div class="q-notes">${esc(p.notes)}</div>` : ''}
      <div class="q-label">List${why ? ` <span>${icon('sparkle')}${esc(why)}</span>` : ''}</div>
      <div class="chips cat-pick">${activeCategories(data)
        .map((c) => `<button class="chip chip-cat" data-pick="${c.id}" aria-pressed="${c.id === p.categoryId}" style="${catColour(c)}">${icon(c.icon)}${esc(c.name)}</button>`)
        .join('')}</div>
      ${
        p.date
          ? `<div class="q-label">Date</div><div class="chips"><button class="chip chip-on" data-drop-date aria-label="Remove date">${icon('today')}${esc(dateLabel(p.date, true))}${icon('x')}</button></div>`
          : ''
      }
      ${
        p.pinUntil
          ? `<div class="q-label">Pinned</div><div class="chips"><button class="chip chip-on" data-drop-pin aria-label="Remove pin">${icon('pin')}Every session${p.pinUntil >= PIN_FOREVER ? ' until you unpin it' : `, until ${esc(dateLabel(p.pinUntil, true))}`}${icon('x')}</button></div>`
          : ''
      }
      <div class="q-label">Tags</div>
      <div class="chips">
        ${p.tags.map((t) => `<button class="chip chip-on" data-drop-tag="${esc(t)}" aria-label="Remove ${esc(t)}">${esc(t)}${icon('x')}</button>`).join('')}
        ${offered.map((t) => `<button class="chip chip-suggest" data-add-tag="${esc(t)}">${icon('plus')}${esc(t)}</button>`).join('')}
        ${!p.tags.length && !offered.length ? '<span class="muted small">None yet. Type #tag to add one.</span>' : ''}
      </div>
      <button class="link-btn" data-more>More details ${icon('chevron')}</button>
    </div>`;
  };

  const add = () => {
    if (!parsed.length) return;
    // A single repeat: the first press points it out, the second adds it.
    if (parsed.length === 1 && parsed[0].dup && !confirmDup) {
      confirmDup = true;
      return render();
    }
    const data = S.getData();
    const items = parsed.map(finalise).filter((p) => parsed.length === 1 || includeDups || !isDup(p));
    const skipped = parsed.length - items.length;
    if (!items.length) return;
    S.batch(items.length > 1 ? `Added ${items.length}` : 'Added', () => {
      for (const p of items) addedIds.push(S.saveItem({ title: p.title, notes: p.notes, categoryId: p.categoryId, tags: p.tags, eventAt: p.date || 0, pinUntil: p.pinUntil || 0 }));
    });
    added += items.length;
    toast(
      items.length > 1
        ? `Added ${items.length} prayer points${skipped ? ` · skipped ${skipped} already there` : ''}`
        : `Added to ${data.categories[items[0].categoryId]?.name || 'your list'}`,
      { undo: true },
    );
    heading();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    reset();
    render();
    input.focus();
  };

  if (text) setTimeout(render, 0);

  let timer;
  input.addEventListener('input', () => {
    confirmDup = false;
    if (!input.value.trim()) reset();
    clearTimeout(timer);
    timer = setTimeout(render, 60);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      clearTimeout(timer);
      render();
      add();
    }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('add' in b.dataset) return add();
    if ('includeDups' in b.dataset) includeDups = !includeDups;
    else if (b.dataset.openDup) {
      close();
      openItemSheet({ id: b.dataset.openDup });
      return;
    } else if (b.dataset.pick) pickedList = b.dataset.pick;
    else if ('dropDate' in b.dataset) droppedDate = true;
    else if ('dropPin' in b.dataset) droppedPin = true;
    else if (b.dataset.dropTag) {
      const key = b.dataset.dropTag.toLowerCase();
      droppedTags.add(key);
      extraTags = extraTags.filter((t) => t.toLowerCase() !== key);
    } else if (b.dataset.addTag) {
      droppedTags.delete(b.dataset.addTag.toLowerCase());
      extraTags.push(b.dataset.addTag);
    } else if ('more' in b.dataset) {
      const p = finalise(parsed[0]);
      close();
      openItemSheet({ prefill: { title: p.title, notes: p.notes, categoryId: p.categoryId, tags: p.tags, eventAt: p.date || 0, pinUntil: p.pinUntil || 0 } });
      return;
    } else return;
    render();
  });
}

// ---------- Toast ----------

let toastTimer;
function toast(msg, { undo = false } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-undo>Undo</button>' : ''}`;
  t.classList.toggle('has-undo', undo);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 1800);
}

function doUndo() {
  const c = S.undo();
  if (c) toast(`Undone: ${c.label.toLowerCase()}`);
}

$('#toast').addEventListener('click', (e) => {
  if (e.target.closest('[data-undo]')) doUndo();
});

// ---------- Actions ----------

const ACTIONS = {
  'quick-add': (b) => openQuickAdd({ categoryId: b.dataset.cat || (route().name === 'list' ? route().arg : '') }),
  'edit-item': (b) => openItemSheet({ id: b.dataset.id }),
  'new-cat': () => openCategorySheet(),
  'edit-cat': (b) => openCategorySheet(b.dataset.id),
  begin: () => startSession(),
  size: (b) => {
    S.setPrefs({ sessionSize: { day: dayKey(), size: b.dataset.size } });
    render();
  },
  'focus-search': () => setTimeout(() => $('#search')?.focus(), 50),
  'pray-done': (b) => prayAdvance(b.dataset.id),
  'pray-skip': () => prayAdvance(),
  'pray-back': () => prayBack(),
  'pray-answered': (b) => openAnswerSheet(b.dataset.id),
  'fu-update': (b) => openUpdateSheet(b.dataset.id),
  'fu-answered': (b) => openAnswerSheet(b.dataset.id),
  'fu-later': (b) => {
    S.followUpLater(b.dataset.id, startOfDay() + 86400000);
    toast('Back tomorrow', { undo: true });
  },
  'fu-done': (b) => {
    S.followedUp(b.dataset.id);
    toast('Followed up', { undo: true });
  },
  'pray-close': () => {
    session = null;
    location.hash = '#/today';
  },
  per: (b) => {
    const cat = S.getData().categories[b.dataset.id];
    S.saveCategory({ ...cat, perSession: Math.min(20, Math.max(0, cat.perSession + Number(b.dataset.d))) });
  },
  move: (b) => {
    const ids = activeCategories(S.getData()).map((c) => c.id);
    const i = ids.indexOf(b.dataset.id);
    const j = i + Number(b.dataset.d);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.reorderCategories(ids);
  },
  theme: (b) => {
    S.setPrefs({ theme: b.dataset.theme });
    applyTheme();
    render();
  },
  'sync-now': () => Sync.syncNow(),
  'sync-off': async () => {
    if (!confirm('Stop syncing on this device? Your prayer points stay here, and the key is removed from this device.')) return;
    await Sync.disconnect();
    render();
  },
  'sync-forgot': () => {
    showReset = !showReset;
    refreshSync();
  },
  'sync-change': () => {
    changingPass = !changingPass;
    refreshSync();
  },
  'backup-export': () => {
    backupPanel = backupPanel === 'export' ? '' : 'export';
    refreshBackup();
  },
  'backup-plain': () => {
    backupPanel = 'plain';
    refreshBackup();
  },
  'backup-plain-go': () => exportBackup(null),
  'backup-cancel': () => {
    backupPanel = '';
    pendingImport = null;
    refreshBackup();
  },
  'rem-day': (b) => {
    const r = reminderPrefs();
    const day = Number(b.dataset.day);
    const days = r.days.includes(day) ? r.days.filter((d) => d !== day) : [...r.days, day].sort();
    if (days.length) updateReminder({ days });
  },
  'rem-calendar': () => saveFile('letspray-reminder.ics', Notify.calendarFile(reminderPrefs()), 'text/calendar'),
  'copy-link': async (b) => {
    try {
      await navigator.clipboard.writeText(b.dataset.link);
      toast('Link copied');
    } catch {
      const code = b.previousElementSibling;
      const range = document.createRange();
      range.selectNodeContents(code);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      toast('Link selected. Copy it from the menu.');
    }
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('.sheet') || b.tagName === 'INPUT') return;
  const fn = ACTIONS[b.dataset.act];
  if (fn) fn(b, e);
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'import') return;
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return toast('That file is not a Let’s Pray backup');
  }
  if (isEnvelope(parsed)) {
    pendingImport = parsed;
    backupPanel = 'import';
    refreshBackup();
    $('#backup-section input[name=pass]')?.focus();
  } else if (parsed && (parsed.items || parsed.categories)) {
    S.mergeIn(parsed, merge);
    toast('Backup imported', { undo: true });
  } else toast('That file is not a Let’s Pray backup');
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'how') {
    const box = $('[data-new-pass]', e.target.closest('form'));
    if (box) box.hidden = e.target.value !== 'new';
  } else if (e.target.dataset.rem) {
    const key = e.target.dataset.rem;
    if (key === 'time') {
      const [hour, minute] = e.target.value.split(':').map(Number);
      if (!Number.isNaN(hour)) updateReminder({ hour, minute: minute || 0 });
    } else updateReminder({ [key]: e.target.checked });
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form^="backup-"]');
  if (!form) return;
  e.preventDefault();
  const error = $('[data-form-error]', form);
  const btn = $('button[type=submit]', form);
  const busy = (on) => {
    btn.disabled = on;
  };
  try {
    if (form.dataset.form === 'backup-export') {
      busy(true);
      if (form.how?.value === 'sync') {
        const record = await loadKey();
        if (!record) throw new Error('Sync is locked on this device. Choose a different passphrase instead.');
        return await exportBackup(record);
      }
      const pass = normalisePassphrase(form.pass.value);
      if (pass.length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters. Four random words work well.`);
      if (normalisePassphrase(form.pass2.value) !== pass) throw new Error('Those two passphrases don’t match.');
      const salt = newSalt();
      return await exportBackup({ key: await deriveKey(pass, salt, ITERATIONS), salt, iterations: ITERATIONS });
    }
    busy(true);
    let data;
    try {
      data = await unseal(pendingImport, await envelopeKey(pendingImport, form.pass.value));
    } catch {
      throw new Error('That passphrase doesn’t open this backup.');
    }
    S.mergeIn(data, merge);
    pendingImport = null;
    backupPanel = '';
    refreshBackup();
    toast('Backup imported', { undo: true });
  } catch (err) {
    if (error) error.textContent = err.message;
    busy(false);
  }
});

const SYNC_FORMS = {
  connect: { busy: 'Encrypting…', done: 'Encrypted sync is on', run: (f, pass) => Sync.connect(f.token.value, pass) },
  unlock: { busy: 'Unlocking…', done: 'Sync unlocked', run: (f, pass) => Sync.unlock(pass) },
  reset: { busy: 'Encrypting…', done: 'Sync started again with your new passphrase', run: (f, pass) => Sync.changePassphrase(pass) },
  change: { busy: 'Encrypting…', done: 'New passphrase saved', run: (f, pass) => Sync.changePassphrase(pass) },
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  const kind = SYNC_FORMS[form?.dataset.form];
  if (!kind) return;
  e.preventDefault();
  const error = $('[data-form-error]', form);
  const pass = normalisePassphrase(form.pass.value);
  if (pass.length < MIN_PASSPHRASE) return (error.textContent = `Use at least ${MIN_PASSPHRASE} characters. Four random words work well.`);
  if (form.pass2 && normalisePassphrase(form.pass2.value) !== pass) return (error.textContent = 'Those two passphrases don’t match.');
  if (form.dataset.form === 'reset' && !confirm('Start sync again with this new passphrase? Your other devices will need it too.')) return;
  const btn = $('button[type=submit]', form);
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = kind.busy;
  try {
    await kind.run(form, pass);
    showReset = false;
    changingPass = false;
    toast(kind.done);
    render();
  } catch (err) {
    // The card may have been redrawn by a status change; show the error in whichever form is there now.
    refreshSync();
    const now = $(`form[data-form] [data-form-error]`, $('#sync-section') || document);
    if (now && !now.textContent) now.textContent = err.message;
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }
});

document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-show-pass]')) return;
  $$('input[name^="pass"]', e.target.closest('form')).forEach((i) => (i.type = e.target.checked ? 'text' : 'password'));
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'name') S.setPrefs({ name: e.target.value.trim() });
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'search') return;
  query = e.target.value;
  $('#lists-body').innerHTML = listsBody();
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.sheet-root') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && S.lastUndo()) {
    e.preventDefault();
    if (route().name === 'pray' && session && S.lastUndo().label === 'Prayed') prayBack();
    else doUndo();
    return;
  }
  const r = route();
  if (r.name === 'pray' && session) {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ($('[data-act="pray-done"]') || $('.pray-done [data-act="pray-close"]'))?.click();
    } else if (e.key === 'ArrowLeft') $('[data-act="pray-back"]:not([disabled])')?.click();
    else if (e.key === 'Escape') ACTIONS['pray-close']();
  } else if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    openQuickAdd({ categoryId: r.name === 'list' ? r.arg : '' });
  } else if (e.key === '/' && r.name === 'lists') {
    e.preventDefault();
    $('#search')?.focus();
  }
});

// ---------- Routing & render ----------

function route() {
  const [name = 'today', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'today', arg: decodeURIComponent(rest.join('/')) };
}

function render() {
  if (location.hash.startsWith('#/add')) {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    history.replaceState(null, '', '#/today');
    setTimeout(() => handleAddLink(q.get('text') || '', q.get('save') === '1'), 0);
  }
  const r = route();
  const view = VIEWS[r.name] || VIEWS.today;
  const scroll = window.scrollY;
  const same = main.dataset.route === location.hash;
  document.body.classList.toggle('praying', r.name === 'pray');
  main.innerHTML = view(r.arg);
  main.dataset.route = location.hash;
  if (same) window.scrollTo(0, scroll);
  const tab = { list: 'lists', tag: 'lists' }[r.name] || r.name;
  $$('.nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  if (r.name === 'pray') bindSwipe();
}

function applyTheme() {
  const t = S.getPrefs().theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

window.addEventListener('hashchange', () => {
  if (route().name !== 'pray') session = null;
  render();
  window.scrollTo(0, 0);
});

S.subscribe((kind) => {
  if (kind !== 'prefs') render();
});
let lastStatus = '';
Sync.onStatus((st) => {
  // Only redraw when something visible changed, so typing isn't interrupted.
  const sig = `${st.state}|${st.message}|${st.state === 'ok' ? Math.floor(st.at / 60000) : ''}`;
  if (sig !== lastStatus) refreshSync();
  lastStatus = sig;
  $('.nav-sync')?.setAttribute('data-state', Sync.getStatus().state);
});

applyTheme();
render();

// In the App Store app: notifications, and letspray:// links from Shortcuts.
if (Notify.isNativeApp()) {
  Notify.onOpen((to) => {
    location.hash = to;
  });
  const openLink = (url) => {
    try {
      const u = new URL(url);
      if (u.hostname === 'add' || u.pathname.replace(/\//g, '') === 'add') location.hash = `#/add?${u.searchParams}`;
    } catch {
      // not a link we handle
    }
  };
  const App = window.Capacitor?.Plugins?.App;
  App?.addListener('appUrlOpen', ({ url }) => openLink(url));
  // A Shortcut can also start the app from closed.
  App?.getLaunchUrl?.().then((r) => r?.url && openLink(r.url)).catch(() => {});
  Notify.permission().then((p) => {
    notifyState = p;
  });
  S.subscribe((kind) => kind !== 'prefs' && scheduleReminders());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleReminders());
  scheduleReminders();
}
Sync.initSync();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
