// App Store readiness, checked statically against the iOS sources: the things App Review rejects
// for that can be read from the code. The App Store audit (24 Sep 2026) found the iPhone app told
// users to "add free Kroger API keys in Settings" (a web-only feature), and an in-app purchase
// description with a hard-coded US-dollar price.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const IOS = new URL('../ios/', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(IOS, p), 'utf8');
const swiftFiles = (dir) => fs.readdirSync(path.join(IOS, dir), { recursive: true }).filter((f) => f.endsWith('.swift')).map((f) => path.join(dir, f));
const APP = swiftFiles('App').map((f) => [f, read(f)]);
const all = APP.map(([, s]) => s).join('\n');
const plist = read('App/Resources/Info.plist');
const manifest = read('App/Resources/PrivacyInfo.xcprivacy');

test('every permission the app asks for has its Info.plist usage string (5.1.1)', () => {
  const needs = [
    [/CLLocationManager|requestWhenInUseAuthorization/, 'NSLocationWhenInUseUsageDescription'],
    [/DataScannerViewController|AVCaptureDevice|UIImagePickerController\(\)[\s\S]{0,200}\.camera/, 'NSCameraUsageDescription'],
    [/requestAlwaysAuthorization/, 'NSLocationAlwaysAndWhenInUseUsageDescription'],
    [/CNContactStore/, 'NSContactsUsageDescription'],
    [/EKEventStore/, 'NSCalendarsUsageDescription'],
    [/ATTrackingManager/, 'NSUserTrackingUsageDescription'],
  ];
  for (const [re, key] of needs) if (re.test(all)) assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>[^<]{20,}</string>`), `${key} missing or too short`);
  assert.doesNotMatch(all, /requestAlwaysAuthorization|ATTrackingManager/, 'Always location or tracking would change the privacy answers');
});

test('the privacy manifest declares every required-reason API the app calls', () => {
  const categories = [
    [/UserDefaults/, 'NSPrivacyAccessedAPICategoryUserDefaults'],
    [/\.modificationDate|\.creationDate|contentModificationDate|attributesOfItem|fileModificationDate/, 'NSPrivacyAccessedAPICategoryFileTimestamp'],
    [/volumeAvailableCapacity|systemFreeSize|statfs/, 'NSPrivacyAccessedAPICategoryDiskSpace'],
    [/systemUptime|mach_absolute_time/, 'NSPrivacyAccessedAPICategorySystemBootTime'],
    [/activeInputModes/, 'NSPrivacyAccessedAPICategoryActiveKeyboards'],
  ];
  for (const [re, cat] of categories) if (re.test(all)) assert.ok(manifest.includes(cat), `${cat} is used but not declared`);
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
});

test('the paywall meets 3.1.2: StoreKit prices, auto-renew terms, restore, terms and privacy links, a way out', () => {
  const p = read('App/UI/Paywall/PaywallView.swift');
  assert.match(p, /displayPrice/);
  assert.match(p, /Restore purchases/);
  assert.match(p, /renew automatically/i);
  assert.match(p, /cartworth\.app\/terms/);
  assert.match(p, /cartworth\.app\/privacy/);
  assert.match(p, /cancellationAction/);
  assert.doesNotMatch(p.replace(/\/\/.*$/gm, ''), /"\$\d/, 'a hard-coded price in the paywall');
});

test('in-app purchase text carries no price (it varies by storefront and changes)', () => {
  const kit = read('App/Resources/Products.storekit');
  for (const m of kit.matchAll(/"(?:description|displayName)" : "([^"]*)"/g)) assert.doesNotMatch(m[1], /[$€£]\s?\d|\d+\s?(?:USD|dollars)/i, m[1]);
});

test('Settings links to privacy, terms and support (the App Store Support URL)', () => {
  const s = read('App/UI/Settings/SettingsView.swift');
  for (const p of ['privacy', 'terms', 'support']) assert.match(s, new RegExp(`cartworth\\.app/${p}`));
});

test('debug-only unlocks and QA switches never reach a release build', () => {
  const FLAGS = ['-proUnlocked', '-qaReset', '-qaZip', '-qaHideSponsored', '-qaHideRemoteImages', '-qaPolite', '-qaSeedWatchHistory'];
  for (const [f, s] of APP) {
    const stack = []; // true = inside a DEBUG-only branch
    s.split('\n').forEach((line, n) => {
      const t = line.trim();
      if (/^#if\s+DEBUG\b/.test(t)) return stack.push(true);
      if (/^#if\b/.test(t)) return stack.push(stack.at(-1) ?? false);
      if (/^#else\b/.test(t)) { if (stack.length) stack[stack.length - 1] = !stack.at(-1); return; }
      if (/^#endif\b/.test(t)) return stack.pop();
      const code = line.replace(/\/\/.*$/, '');
      for (const flag of FLAGS) if (code.includes(`"${flag}"`)) assert.ok(stack.includes(true), `${f}:${n + 1}: ${flag} is read outside #if DEBUG`);
    });
  }
});

test('the iPhone app never points at features only the web app has', () => {
  const catalog = read('App/Sources/RetailerCatalog.swift');
  assert.doesNotMatch(catalog, /Kroger API/, 'a Kroger API note: the iPhone app has no Kroger keys setting');
  assert.doesNotMatch(all.replace(/\/\/.*$/gm, ''), /"[^"]*(?:localhost|npm start|the Cartworth server)[^"]*"/, 'server-only wording in a user-facing string');
});

test('export compliance: HTTPS only, so ITSAppUsesNonExemptEncryption is false', () => {
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  assert.doesNotMatch(all, /CommonCrypto|CCCrypt|SecKeyCreateEncryptedData|AES\.GCM|ChaChaPoly/, 'custom encryption would change the export answer');
});

test('the local StoreKit configuration is not copied into the app (d8367eb: the Release archive shipped it)', () => {
  const pbx = read('Cartworth.xcodeproj/project.pbxproj');
  assert.doesNotMatch(pbx, /\.storekit in (?:Resources|Copy)/, 'a .storekit file in a build phase ships inside the app');
  assert.match(pbx, /Products\.storekit \*\/ = \{isa = PBXFileReference/, 'the scheme still needs the file in the project');
  const yml = read('project.yml');
  assert.match(yml, /Resources\/Products\.storekit[\s\S]{0,300}buildPhase: none/, 'xcodegen would put it back in Resources');
});

test('the App Store Connect text fits its fields (the review notes once ran to 4,931 of 4,000)', () => {
  const L = fs.readFileSync(new URL('../marketing/APP_STORE_LISTING.md', import.meta.url), 'utf8').split('\n');
  const at = (heading) => L.findIndex((l) => l.startsWith(heading));
  const fenced = (heading) => { const i = L.indexOf('```', at(heading)); return L.slice(i + 1, L.indexOf('```', i + 1)).join('\n'); };
  const ruled = (heading) => { const i = L.indexOf('---', at(heading)); return L.slice(i + 1, L.indexOf('---', i + 1)).join('\n').trim(); };
  const limits = [['promotional text', fenced('## 3.'), 170], ['description', ruled('## 4.'), 4000], ['keywords', fenced('## 5.'), 100], ["what's new", fenced('## 6.'), 4000], ['App Review notes', fenced('## 10.'), 4000]];
  for (const [name, text, max] of limits) {
    assert.ok(text.length > 0, `${name}: not found`);
    assert.ok(text.length <= max, `${name}: ${text.length} of ${max} characters`);
  }
  assert.doesNotMatch(fenced('## 5.'), /,\s/, 'keywords: a space after a comma costs a character');
  const all = L.join('\n');
  for (const m of all.matchAll(/\| Display Name[^|]*\| `([^`]*)`/g)) assert.ok(m[1].length <= 30, `IAP name ${m[1]}`);
  for (const m of all.matchAll(/\| Description[^|]*\| `([^`]*)`/g)) assert.ok(m[1].length <= 45, `IAP description ${m[1]}`);
  for (const [, s] of all.matchAll(/\*\*Primary\*\* \| `([^`]*)`/g)) assert.ok(s.length <= 30, `name or subtitle ${s}`);
});

test('project.yml and the Xcode project agree on the version and build number (each upload needs a new build)', () => {
  const yml = read('project.yml');
  const pbx = read('Cartworth.xcodeproj/project.pbxproj');
  for (const key of ['MARKETING_VERSION', 'CURRENT_PROJECT_VERSION']) {
    const want = yml.match(new RegExp(`${key}: "?([^"\\n]+)"?`))[1];
    const got = new Set([...pbx.matchAll(new RegExp(`${key} = ([^;]+);`, 'g'))].map((m) => m[1]));
    assert.deepEqual([...got], [want], `${key}: project.yml ${want}, project ${[...got]}`);
  }
});
