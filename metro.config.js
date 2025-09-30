const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for GLB files
config.resolver.assetExts.push('glb', 'gltf', 'bin');

module.exports = config;