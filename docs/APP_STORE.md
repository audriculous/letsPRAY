# Putting Let’s Pray on the App Store

Let’s Pray is ready to build as an iPhone app with [Capacitor](https://capacitorjs.com). The `ios/` folder is a complete Xcode project: it already has the app icon, launch screen, the `letspray://` link used by Siri shortcuts, and the plugins for notifications, sharing files and links.

What the iPhone app adds over the web version:

- **Push reminders**: a daily reminder at your chosen time and days, plus a follow-up the morning after a dated prayer. They are scheduled on the phone, so no server is needed and they arrive with the app closed. Lock-screen text says only how many prayer points there are unless you turn on details.
- **Buttons on reminders**: press and hold a reminder for *Start praying* or *Remind me in 1 hour*; a follow-up offers *Add update* or *Ask tomorrow*.
- **Widgets**: today's prayers on the Home Screen (small, medium, large) and Lock Screen (counts only). On a Mac running macOS Sonoma or later, the same widget goes on the desktop or in Notification Center straight from the iPhone; the large size is designed for the desktop. Tapping a widget starts a prayer session.
- **Shared lists through iCloud**: share a list with your wife, a prayer partner or a staff team. Invitations go through Messages, Mail or a link using Apple's sharing sheet. Prayer details are end-to-end encrypted in iCloud. Everyone sees the prayer points, notes, updates and answered prayers; when each person last prayed, their pins and how often the list comes up stay their own.
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

1. Choose your own app ID first. In Terminal, in the project folder, run (with your own reverse-domain name):

   ```
   npm run set-app-id -- au.org.yourchurch.letspray
   npm run ios
   ```

   This changes it everywhere at once: the app, the widget (`….widget`), the App Group the two share (`group.…`) and the iCloud container for shared lists (`iCloud.…`).
2. In Xcode, select the **App** target, then **Signing & Capabilities**, and choose your **Team**. Do the same for the **LetsPrayWidgetExtension** target.
3. On both targets, check the **App Groups** capability shows your group ticked. If it is red or unticked, tick it (or press the refresh button) so Xcode registers it with Apple. The widget reads today's prayers through this group.
4. On the **App** target, check the **iCloud** capability: **CloudKit** ticked, and your container (`iCloud.…`) ticked under Containers. If the container shows red, press **+** and create it with that exact name. Shared lists live there.
5. Plug in your iPhone, pick it at the top of the window, and press **Run** (▶).
6. On the iPhone, the first time you turn on a reminder, allow notifications. Then add the widget: touch and hold the Home Screen, tap **Edit → Add Widget**, and choose Let’s Pray.

To try sharing, you need two Apple Accounts (yours and your wife’s, say), each signed in to iCloud on a device with the app. Open a list, tap the share button, and send the invitation; when it is accepted the list appears on the other phone.

I wrote the widget, iCloud sharing and their Xcode set-up without a Mac to build on, so the first build is their real test. If Xcode shows an error, copy it into a Claude Code session on your Mac (or here) and it can be fixed quickly.

Whenever the app’s code changes, run `npm run ios` again before building.

## Publishing

1. In [App Store Connect](https://appstoreconnect.apple.com), create a new app with your bundle identifier.
2. In Xcode choose **Product → Archive**, then **Distribute App** to upload it. Try it with TestFlight first.
3. Before your first App Store release, open the [CloudKit Console](https://icloud.developer.apple.com), choose your container, and **Deploy Schema Changes** to Production. (Testing builds make the record types automatically in Development; the App Store version uses Production.)
4. Fill in the listing:
   - **Screenshots** from the largest iPhone size (run the app in the Simulator and press ⌘S).
   - **Privacy policy URL**: `privacy.html` in this repository, published with the website (for example `https://<your-username>.github.io/letsPRAY/privacy.html`).
   - **App Privacy**: *Data Not Collected*. Prayer points stay on the device; sync goes to the user’s own GitHub account, and shared lists to their own iCloud, both encrypted. Nothing reaches the developer.
   - **Encryption**: App Store Connect asks whether the app uses encryption. Let’s Pray uses standard AES encryption from iOS to protect the user’s own data. Read Apple’s questions carefully and answer for your situation; this kind of use is usually exempt from export paperwork.
5. Submit for review. Apple looks for apps that do more than show a website; the native reminders, follow-ups, share sheet and Siri support help here, so mention them in the review notes.

## On your Mac

- **Widget on the desktop**: on macOS Sonoma or later, signed in to the same Apple Account as your iPhone, right-click the desktop, choose **Edit Widgets**, and pick Let’s Pray under **From iPhone**. Your iPhone needs to be nearby or on the same Wi-Fi.
- **The app itself**: on a Mac with Apple silicon, the iPhone app can run as a Mac app. In App Store Connect, under **Pricing and Availability**, make it available on Apple silicon Macs. Until then, the web version keeps working in Safari (**File → Add to Dock**).
- A fully native Mac app (with its own Mac widget, independent of the iPhone) is possible later. Capacitor doesn’t provide Mac (Mac Catalyst) builds, so it would be a small separate Mac app around the same web code, built and tested on a Mac.

## Updating the icon or launch screen

```
python3 scripts/icon-svg.py .       # needs: pip install fonttools brotli
node scripts/icon-png.cjs .
python3 scripts/ios-assets.py       # needs: pip install pillow
```
