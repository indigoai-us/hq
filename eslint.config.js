import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "template/",
      "examples/",
      // hq-pack-* payload directories ship content to destination HQ instances;
      // their TS/TSX files are reference examples (MDCs, worker configs) that are
      // not compiled by the monorepo. Exclude from monorepo lint.
      "packages/hq-pack-*/knowledge/",
      "packages/hq-pack-*/workers/",
      "packages/hq-pack-*/skills/",
      "packages/hq-pack-*/scripts/",
      "**/*.js",
      "**/*.mjs",
    ],
  },
  {
    rules: {
      // Downgrade to warn for gradual adoption — fix over time
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/triple-slash-reference": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
    },
  },
  // SST infra uses triple-slash references and CommonJS patterns
  {
    files: ["infra/**/*.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  }
);
