// Default Expo Metro config. (The Emergent template wrote a FileStore cache into
// frontend/.metro-cache, which ended up committed to git.)
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
