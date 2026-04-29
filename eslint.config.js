// This project uses Biome for linting and formatting.
// This file satisfies tooling that checks for an ESLint config.
// TypeScript files are excluded — Biome handles all TS linting.
module.exports = [
  {
    ignores: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
      "node_modules/**",
      ".next/**",
      "dist/**",
      ".turbo/**",
    ],
  },
];
