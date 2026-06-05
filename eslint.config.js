const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "logs/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {},
  },
];
