const js = require('@eslint/js');
const globals = require('globals');
const nextPlugin = require('eslint-config-next');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['test_check.js'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      next: nextPlugin,
    },
    rules: {
      ...nextPlugin.rules,
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      next: nextPlugin,
    },
    rules: {
      ...nextPlugin.rules,
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
