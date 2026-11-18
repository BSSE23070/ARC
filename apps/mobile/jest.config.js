/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // One test run covers the app and the shared packages it is built from.
  roots: ['<rootDir>/src', '<rootDir>/../../packages'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // The icon library ships ES modules for the app; Jest needs its CommonJS build.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
