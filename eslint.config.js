import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', '**/node_modules', 'backend/public'] },
  // In both blocks below, no-unused-vars allows `const { password, ...safe } = user`, `catch (err) {}`
  // and typed default stubs like `addItem: (item) => {}` in context defaults.

  // React frontend
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // The project doesn't use PropTypes
      'react/prop-types': 'off',
      // Apostrophes/quotes in JSX text are fine
      'react/no-unescaped-entities': 'off',
      // Context files export a Provider and the context itself — that's intended
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['invalidateCache'] }],
    },
  },
  {
    // Context providers live alongside their context object by design; test files aren't hot-reloaded
    files: ['src/components/store/**/*.jsx', 'src/**/*.test.{js,jsx}', 'src/test/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Jest globals (describe, it, expect, jest…) in frontend tests, which run under Node
    files: ['src/**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.jest } },
  },
  {
    // Babel config is CommonJS (used only by Jest)
    files: ['babel.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: js.configs.recommended.rules,
  },

  // Node backend, e2e tests + config files
  {
    files: ['backend/**/*.js', 'e2e/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    // Playwright specs also contain callbacks that run inside the page (page.evaluate)
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
