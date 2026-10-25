// Home Screen, Lock Screen and Mac desktop widgets (the Mac shows them from
// the iPhone). The app hands the widget a small snapshot of the coming week;
// the widget moves to the next day at midnight on its own.
import { buildSession, weekStats, streak, dayKey, startOfDay, followUps, isPinned } from './model.js';
import { verseFor } from './verses.js';

const DAYS = 7;
const ITEMS = 6;

const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
};

// "Today", "Tomorrow" or "Fri", as seen from `day`.
function whenFrom(eventAt, day) {
  const diff = Math.round((startOfDay(eventAt) - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(eventAt).toLocaleDateString(undefined, { weekday: 'short' });
}

export function snapshot(data, { showNames = true } = {}, now = Date.now()) {
  const days = [];
  for (let i = 0; i < DAYS; i += 1) {
    const day = addDays(now, i);
    const at = i === 0 ? now : day + 9 * 3600000; // judge future days from the morning
    const cards = buildSession(data, 1, at);
    days.push({
      date: dayKey(day),
      count: cards.length,
      followUps: followUps(data, at).length,
      verse: verseFor(0, day),
      items: cards.slice(0, ITEMS).map((c) => {
        const item = data.items[c.itemId];
        const cat = data.categories[c.categoryId];
        return {
          title: item.title,
          list: cat?.name || '',
          color: cat?.color || 'sage',
          pinned: isPinned(item, at),
          when: item.eventAt ? whenFrom(item.eventAt, day) : '',
        };
      }),
    });
  }
  const week = weekStats(data, now);
  return {
    v: 1,
    updatedAt: now,
    showNames,
    streak: streak(data, now),
    prayedOn: data.days[dayKey(now)] ? dayKey(now) : '',
    week: { days: week.daysPrayed, prayers: week.prayers, answered: week.answered },
    days,
  };
}

const plugin = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LetsPrayWidget : undefined);
export const hasWidgets = () => !!plugin();

export async function publish(data, options) {
  const p = plugin();
  if (p) await p.update({ json: JSON.stringify(snapshot(data, options)) });
}
