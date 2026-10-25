// Changes the app's identifier everywhere it appears, including the widget
// (<id>.widget), the shared App Group (group.<id>) the two use together, and
// the iCloud container for shared lists (iCloud.<id>).
// Usage: npm run set-app-id -- au.org.yourchurch.letspray
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'capacitor.config.json',
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App/Info.plist',
  'ios/App/App/App.entitlements',
  'ios/App/App/WidgetBridgePlugin.swift',
  'ios/App/App/CloudSharePlugin.swift',
  'ios/App/LetsPrayWidget/LetsPrayWidget.entitlements',
  'ios/App/LetsPrayWidget/LetsPrayWidget.swift',
];

const next = process.argv[2];
if (!/^[a-zA-Z][\w-]*(\.[a-zA-Z][\w-]*){2,}$/.test(next || '')) {
  console.error('Give a reverse-domain ID, for example: npm run set-app-id -- au.org.yourchurch.letspray');
  process.exit(1);
}
const current = JSON.parse(readFileSync('capacitor.config.json', 'utf8')).appId;
if (current === next) {
  console.log(`Already ${next}`);
  process.exit(0);
}
for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  const count = text.split(current).length - 1;
  writeFileSync(file, text.split(current).join(next));
  console.log(`${file}: ${count} change${count === 1 ? '' : 's'}`);
}
console.log(`App ID is now ${next} (widget ${next}.widget, App Group group.${next}).`);
