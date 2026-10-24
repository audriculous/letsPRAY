# Let’s Pray

A calm, tidy prayer list that runs as a web app on iPhone and Mac and keeps both in sync. Inspired by Prayer Mate: your prayer points live in lists, and each session brings up a few from every list so everyone comes round in turn.

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

Sync goes through a single **private GitHub Gist** in your own account, so there is no server to run.

1. Create a token at <https://github.com/settings/tokens/new?scopes=gist&description=Let%27s%20Pray%20sync> with only the **gist** box ticked. Pick an expiry you are happy with.
2. In the app, open *Settings → Sync*, paste the token and tap *Connect*. Do the same on the other device.

The first device creates the gist; the second finds it. The app syncs when it opens, when it comes back to the foreground, and a few seconds after each change. Each prayer point and list merges on its own, so edits on different devices do not overwrite each other; if the same point is edited on both, the later edit wins.

The token is stored only on each device. Anyone with the token can read and edit your gists, so do not share it. Disconnecting leaves your prayer points on the device.

## Backups

*Settings → Backup* exports everything as a JSON file. Importing a backup merges it with what is already on the device.

## Development

```
npm test        # unit tests for merging, sessions and tag suggestions
```

| File | Purpose |
| --- | --- |
| `js/model.js` | Data shape, merge rules, session rotation, streaks |
| `js/tags.js` | Tag suggestion engine and theme keywords |
| `js/parse.js` | Quick add: plain-English parsing of titles, lists, dates and tags |
| `js/store.js` | Local storage and edits |
| `js/sync.js` | GitHub Gist sync |
| `js/app.js` | Views, prayer session, editors |
| `sw.js` | Offline cache. Bump `VERSION` when you change files |

To add or adjust tag themes, edit `THEMES` in `js/tags.js`.

The app icon is the wordmark drawn from the bundled fonts. To regenerate it: `python3 scripts/icon-svg.py .` then `node scripts/icon-png.cjs .`
