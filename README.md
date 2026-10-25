# Let’s Pray

A calm, tidy prayer list that runs as a web app on iPhone and Mac, keeps both in sync, and is ready to publish as an iPhone app (see [Putting Let’s Pray on the App Store](docs/APP_STORE.md)). Inspired by Prayer Mate: your prayer points live in lists, and each session brings up a few from every list so everyone comes round in turn.

## What it does

- **Lists**: People, Family, Church and Mission to start with. Add, rename, recolour, reorder or delete lists, and choose how many points from each list come up each time.
- **How often**: each list comes up every session, or once a week on a day you choose. A weekly list (say your congregation, 6 names each Sunday) works through everyone in turn, and if you miss the day it waits until you pray it.
- **Quick add**: the + in the corner (or press N on a Mac). Type a prayer in your own words and it is sorted for you as you type:
  - *Title and details*: "Pray for Mum's surgery on Friday, for peace" becomes *Mum's surgery* with the note *Peace*.
  - *List*: from words like mum, growth group, missionary or a country, a name, a list you mention, or where you filed similar prayers before. It shows why it picked the list, and you can tap another.
  - *Date*: tomorrow, Friday, next week, in 3 weeks, 31 Oct, 31/10, Christmas, Easter and more. Dated points come first in sessions around that day.
  - *Tags*: clear themes are added for you; `#tag` adds your own and `@list` picks a list.
  - Paste several lines (a prayer bulletin, or a congregation list) and each line becomes its own prayer point.
  - All of this runs on the device: nothing is sent anywhere.
- **Today**: a greeting (set your name in Settings), an *Up next* card with **Start**, a *Shorter / As planned / Longer* choice for today's session, and a *This week* card showing days prayed, prayers, answered prayers and your streak.
- **Prayer sessions**: one card at a time. Tap *Prayed* (or swipe left; on Mac use the arrow keys), *Skip*, or *Answered*. The least recently prayed points come first.
- **Tags** on every prayer point, with two kinds of suggestion while you type:
  - *Suggested*: based on what the prayer is about. Theme words (surgery → Health, exams → Study, missionary → Missionaries and so on), names in the text, existing tags mentioned in the text, and words you have tagged before (it learns from your own tagging).
  - *Frequent*: the tags you use most, weighted towards the list you are in.
- **Updates**: add an update to a prayer point instead of rewriting it ("Surgery went well, now rehab"). Each one keeps a dated timeline, shown on its card in sessions and in the Answered journal.
- **Follow-ups**: the day after a dated prayer, Today asks *how did it go?*, with Add update, Answered, Tomorrow and Done.
- **Pins**: put an urgent prayer into every session for 3 days, a week, 2 weeks or until you unpin it. Quick add understands "pray every day this week", "daily for 2 weeks" and `#pin`.
- **Reminders**: in the iPhone app, a daily push reminder at your chosen time and days, and a follow-up reminder the morning after a dated prayer. Lock-screen text stays private unless you turn on details. The web version offers a repeating calendar event instead.
- **Siri and Shortcuts**: a shortcut can open Quick add with dictated text ("Hey Siri, add prayer"). Settings shows the link and the steps.
- **Undo**: deleting, marking answered, saving an edit or adding prayers shows an *Undo* button for a few seconds (⌘Z on a Mac). In a prayer session, going back a card un-marks a mis-tapped *Prayed*. An undo also syncs, so a restored prayer comes back on your other devices.
- **No duplicates**: Quick add spots prayers you already have, even written differently ("Sue and Ben Carter" matches "Ben & Sue Carter"). Pasted lists skip repeats unless you choose to add them; a single repeat needs a second press.
- **Answered journal**: mark a prayer as answered with a note on how God answered, and look back over them later.
- **Search** across every prayer point, note and tag, and browse by tag.
- Light and dark mode, works offline, a short NIV verse on prayer each day.

The look follows Lemme Werk Out (bold condensed italic headings, soft cards on warm grey, one accent colour) with the colours toned down to dusty rose and sage. Fonts are Barlow and Barlow Condensed, bundled in `fonts/` under the SIL Open Font Licence (`fonts/OFL.txt`).

## Using it

The app is plain HTML, CSS and JavaScript with no build step.

**Run locally:** `npm start`, then open <http://localhost:8080>.

**Put it online (GitHub Pages):**

1. In the repository on GitHub, go to *Settings → Pages* and set *Source* to **GitHub Actions**.
2. Merge to `main`. The workflow runs the tests and publishes the site at `https://<your-username>.github.io/<repo-name>/`.

GitHub Pages on a private repository needs a paid GitHub plan. If the repository is private on a free plan, either make it public (prayer data is never stored in the repository, only in your private gist) or host the same files on Netlify or Cloudflare Pages.

**Install it:**

- *iPhone*: open the site in Safari, tap Share, then **Add to Home Screen**.
- *Mac*: in Safari choose **File → Add to Dock**, or in Chrome click the install icon in the address bar.

## Syncing between Mac and iPhone

Sync goes through a gist in your own GitHub account, so there is no server to run, and everything is **end-to-end encrypted**: GitHub only ever holds scrambled data.

1. Create a token at <https://github.com/settings/tokens/new?scopes=gist&description=Let%27s%20Pray%20sync> with only the **gist** box ticked. Pick an expiry you are happy with.
2. Choose a sync passphrase of at least 10 characters. Four or more random words work well.
3. In the app, open *Settings → Sync*, enter the token and passphrase, and tap *Connect*. Do the same on the other device.

The app syncs when it opens, when it comes back to the foreground, and a few seconds after each change. Each prayer point and list merges on its own, so edits on different devices do not overwrite each other; if the same point is edited on both, the later edit wins.

### How your data is protected

- **Encrypted before it leaves the device.** Your passphrase is turned into a 256-bit key with PBKDF2 (SHA-256, 600,000 rounds, random salt), and the data is sealed with AES-256-GCM, with a fresh random IV for every upload. This uses the browser's built-in Web Crypto.
- **The passphrase is never stored or sent.** Each device keeps only the derived key, in IndexedDB, marked non-extractable so it can be used but not read or copied out.
- **Wrong or changed passphrases are caught.** GCM detects a wrong key or altered data, and the app stops rather than overwrite good data. If you change the passphrase on one device, the others pause and ask for the new one.
- **No readable history.** GitHub keeps every version of a gist, and a "secret" gist is only unlisted, not private: anyone with its link can read it. So whenever the encryption changes (turning it on, or a new passphrase), the data moves to a brand new gist and the old ones are deleted, history and all. Data from the earlier unencrypted version is moved the same way.
- **Forgot the passphrase?** Your prayers on each device are untouched. Choose *Forgot it?*, set a new passphrase, and that device's prayers become the sync copy; the other devices then ask for the new passphrase and merge their own prayers back in.

What it does not cover: prayer points stored on each device are protected by that device's own lock (your iPhone passcode and Mac login), and backup files you export are not encrypted, so keep them somewhere safe. The GitHub token is stored on each device; it can only read and write gists, and you can revoke it on GitHub at any time.

## Backups

*Settings → Backup* saves everything as one file, locked with a passphrase (your sync passphrase or a new one). Importing asks for the passphrase, merges with what is already there, and can be undone. Unlocked backups are still possible if you choose, with a warning.

## Development

```
npm test        # unit tests for merging, sessions, tags, parsing and encryption
```

| File | Purpose |
| --- | --- |
| `js/model.js` | Data shape, merge rules, session rotation, streaks |
| `js/tags.js` | Tag suggestion engine and theme keywords |
| `js/parse.js` | Quick add: plain-English parsing of titles, lists, dates and tags |
| `js/store.js` | Local storage and edits |
| `js/sync.js` | GitHub Gist sync |
| `js/crypto.js` | End-to-end encryption for sync (PBKDF2 + AES-GCM) |
| `js/keystore.js` | Keeps the non-extractable sync key in IndexedDB |
| `js/notify.js` | Reminders: iPhone notifications, and the calendar fallback |
| `ios/` | The Xcode project for the iPhone app (Capacitor) |
| `privacy.html` | Privacy policy for the App Store listing |
| `js/app.js` | Views, prayer session, editors |
| `sw.js` | Offline cache. Bump `VERSION` when you change files |

To add or adjust tag themes, edit `THEMES` in `js/tags.js`.

The app icon is the wordmark drawn from the bundled fonts. To regenerate it: `python3 scripts/icon-svg.py .` then `node scripts/icon-png.cjs .`
