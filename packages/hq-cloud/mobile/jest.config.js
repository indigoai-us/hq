/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: [
    // pnpm hoists packages under .pnpm — we need to transform RN and Expo packages
    // that ship untranspiled Flow/TS/ESM code.
    "node_modules/(?!(.pnpm|react-native|@react-native|expo|@expo|react-navigation|@react-navigation|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-svg|@testing-library))",
  ],
  setupFiles: ["./jest.setup.js"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
