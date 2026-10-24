// Adds permission-purpose strings and plugins to app.json (used by development builds; Expo Go ignores them).
const fs = require('fs');
const path = 'app.json';
const json = JSON.parse(fs.readFileSync(path, 'utf8'));
const expo = json.expo || (json.expo = {});
expo.name = process.env.EXPO_PUBLIC_DISGUISE_NAME || 'FloLog';
expo.plugins = expo.plugins || [];

const wanted = [
  ['expo-audio', { microphonePermission: 'FloLog uses the microphone only when you choose to record audio.' }],
  ['expo-image-picker', { cameraPermission: 'FloLog uses the camera only when you choose to take a photo.' }],
  ['expo-location', { locationWhenInUsePermission: 'FloLog uses your location to find nearby support services and, if you send an alert, to include where you are.' }],
  'expo-secure-store',
];
for (const w of wanted) {
  const name = Array.isArray(w) ? w[0] : w;
  const exists = expo.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === name);
  if (!exists) expo.plugins.push(w);
}
fs.writeFileSync(path, JSON.stringify(json, null, 2));
console.log('app.json patched');
