const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const next = require('eslint-config-next');

module.exports = [
  {
    ignores: ['test_check.js'],
  },
  ...next,
];
