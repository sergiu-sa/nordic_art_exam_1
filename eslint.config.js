// Flat config (ESLint 9+). The legacy .eslintrc format was removed in ESLint 9,
// so configuration lives here as an exported array of config objects.
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "prototype/",
      "docs/",
      "assets/",
    ],
  },

  js.configs.recommended,

  // House rules — applied to all linted files for consistency.
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "warn",
      eqeqeq: ["error", "always"],
    },
  },

  // Shipped app code runs in the browser as ES modules.
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },

  // Dev-only config and tests run under Node.
  {
    files: ["**/*.config.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // jsdom-backed unit tests use browser globals in addition to node.
  {
    files: ["tests/unit/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Disable formatting rules that would fight Prettier — must come last.
  prettier,
];
