const nextConfig = require('eslint-config-next');

module.exports = [
  ...nextConfig,
  {
    ignores: ['test_check.js'],
  },
];
