// Reminders. In the App Store app (Capacitor) these are real iPhone
// notifications, scheduled on the device: no server, and they arrive with
// the app closed. In a browser, a repeating calendar event stands in.
import { buildSession, startOfDay, live } from './model.js';

const DAY = 86400000;
const DAILY_BASE = 1000; // ids 1000..1029 for the next 30 days
const FOLLOW_BASE = 2000; // ids 2000..2019 for follow-ups
const DAYS_AHEAD = 30; // iOS keeps at most 64 pending notifications
const MAX_FOLLOW_UPS = 20;

export const DEFAULT_REMINDER = { on: false, hour: 7, minute: 0, days: [0, 1, 2, 3, 4, 5, 6], details: false, followUps: true };

const LN = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LocalNotifications : undefined);
export const isNativeApp = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
export const canNotify = () => isNativeApp() && !!LN();

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
};
const atTime = (day, r) => {
  const d = new Date(day);
  d.setHours(r.hour, r.minute, 0, 0);
  return d;
};

// Everything to schedule from now, as plain objects (kept pure for testing).
// Without "details", nothing personal shows on the lock screen.
export function plan(data, reminder, now = Date.now()) {
  const r = { ...DEFAULT_REMINDER, ...reminder };
  const out = [];
  if (r.on) {
    for (let i = 0; i < DAYS_AHEAD; i += 1) {
      const day = addDays(now, i);
      if (!r.days.includes(new Date(day).getDay())) continue;
      const when = atTime(day, r);
      if (when.getTime() <= now) continue;
      const cards = buildSession(data, 1, when.getTime());
      const first = cards[0] && data.items[cards[0].itemId];
      const count = cards.length ? plural(cards.length, 'prayer point') : 'Your prayer lists';
      const body = r.details && first ? `${count} today, starting with ${first.title}.` : `${count} today.`;
      out.push({ id: DAILY_BASE + i, title: 'Time to pray', body, schedule: { at: when, allowWhileIdle: true }, extra: { route: '#/today' } });
    }
  }
  if (r.followUps) {
    const today = startOfDay(now);
    const dated = Object.values(data.items)
      .filter((i) => live(i) && !i.answeredAt && i.eventAt && startOfDay(i.eventAt) >= addDays(today, -1))
      .filter((i) => (i.followedUpAt || 0) < startOfDay(i.eventAt))
      .sort((a, b) => a.eventAt - b.eventAt)
      .slice(0, MAX_FOLLOW_UPS);
    dated.forEach((item, k) => {
      const when = atTime(addDays(item.eventAt, 1), r);
      if (when.getTime() <= now) return;
      out.push({
        id: FOLLOW_BASE + k,
        title: 'How did it go?',
        body: r.details ? `${item.title} was yesterday. Ask how it went.` : 'Something you prayed about was yesterday. Ask how it went.',
        schedule: { at: when, allowWhileIdle: true },
        extra: { route: '#/today' },
      });
    });
  }
  return out;
}

// 'granted', 'denied', 'prompt' or 'unavailable' (not the App Store app).
export async function permission(ask = false) {
  const ln = LN();
  if (!ln) return 'unavailable';
  const res = ask ? await ln.requestPermissions() : await ln.checkPermissions();
  return res.display;
}

// Replace our scheduled notifications with a fresh plan.
export async function reschedule(data, reminder) {
  const ln = LN();
  if (!ln) return;
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => n.id >= DAILY_BASE && n.id < FOLLOW_BASE + MAX_FOLLOW_UPS);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if ((await ln.checkPermissions()).display !== 'granted') return;
  const list = plan(data, reminder);
  if (list.length) await ln.schedule({ notifications: list });
}

// Tapping a notification opens the app where it points.
export function onOpen(fn) {
  LN()?.addListener('localNotificationActionPerformed', (e) => fn(e.notification?.extra?.route || '#/today'));
}

// A repeating calendar event with an alert, for the web version.
export function calendarFile(reminder, now = Date.now()) {
  const r = { ...DEFAULT_REMINDER, ...reminder };
  const pad = (n) => String(n).padStart(2, '0');
  const start = new Date(startOfDay(now));
  start.setHours(r.hour, r.minute, 0, 0);
  const local = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(r.hour)}${pad(r.minute)}00`;
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const rule = r.days.length === 7 ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${r.days.map((d) => codes[d]).join(',')}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Let’s Pray//Reminder//EN',
    'BEGIN:VEVENT',
    `UID:letspray-daily-${stamp}@letspray`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local}`,
    'DURATION:PT15M',
    `RRULE:${rule}`,
    'SUMMARY:Pray',
    'DESCRIPTION:Open Let’s Pray for today’s prayer points.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Time to pray',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
