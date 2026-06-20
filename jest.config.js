/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './.babelrc' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(next|next/dist)/)',
  ],
};

module.exports = config;
