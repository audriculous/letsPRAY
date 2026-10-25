# Putting Let’s Pray on the App Store

Let’s Pray is ready to build as an iPhone app with [Capacitor](https://capacitorjs.com). The `ios/` folder is a complete Xcode project: it already has the app icon, launch screen, the `letspray://` link used by Siri shortcuts, and the plugins for notifications, sharing files and links.

What the iPhone app adds over the web version:

- **Push reminders**: a daily reminder at your chosen time and days, plus a follow-up the morning after a dated prayer. They are scheduled on the phone, so no server is needed and they arrive with the app closed. Lock-screen text says only how many prayer points there are unless you turn on details.
- **Siri and Shortcuts**: `letspray://add?text=…` opens Quick add, even from closed.
- **Backups and calendar files** open the share sheet, so they can go to Files, iCloud Drive or Mail.

## What you need

- A Mac with the latest **Xcode** (free from the Mac App Store).
- **Node.js** 22 or newer (<https://nodejs.org>).
- An **Apple Developer Program** membership to publish (US$99 a year, charged in local currency). You can test on your own iPhone without it.

## Build and run on your iPhone

```
git clone https://github.com/audriculous/letsPRAY
cd letsPRAY
npm install
npm run ios
```

`npm run ios` copies the app into `www/`, updates the Xcode project and opens it. Then in Xcode:

1. Select the **App** target, then **Signing & Capabilities**. Choose your **Team**.
2. Change the **Bundle Identifier** from `com.letspray.app` to one you own, such as `au.org.yourchurch.letspray`. Put the same value in `appId` in `capacitor.config.json`.
3. Plug in your iPhone, pick it at the top of the window, and press **Run** (▶).
4. On the iPhone, the first time you turn on a reminder, allow notifications.

Whenever the app’s code changes, run `npm run ios` again before building.

## Publishing

1. In [App Store Connect](https://appstoreconnect.apple.com), create a new app with your bundle identifier.
2. In Xcode choose **Product → Archive**, then **Distribute App** to upload it. Try it with TestFlight first.
3. Fill in the listing:
   - **Screenshots** from the largest iPhone size (run the app in the Simulator and press ⌘S).
   - **Privacy policy URL**: `privacy.html` in this repository, published with the website (for example `https://<your-username>.github.io/letsPRAY/privacy.html`).
   - **App Privacy**: *Data Not Collected*. Prayer points stay on the device, and sync goes straight to the user’s own GitHub account, encrypted.
   - **Encryption**: App Store Connect asks whether the app uses encryption. Let’s Pray uses standard AES encryption from iOS to protect the user’s own data. Read Apple’s questions carefully and answer for your situation; this kind of use is usually exempt from export paperwork.
4. Submit for review. Apple looks for apps that do more than show a website; the native reminders, follow-ups, share sheet and Siri support help here, so mention them in the review notes.

## Updating the icon or launch screen

```
python3 scripts/icon-svg.py .       # needs: pip install fonttools brotli
node scripts/icon-png.cjs .
python3 scripts/ios-assets.py       # needs: pip install pillow
```
