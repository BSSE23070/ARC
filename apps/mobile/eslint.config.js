// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'] },
  {
    // Screens are built from @arc/ui components and @arc/tokens only, so a
    // Figma change is a token or component edit, never a hunt through screens.
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'Use a colour token from @arc/tokens instead of a raw hex value.',
        },
        {
          selector: 'Property[key.name=/^(fontSize|fontFamily|fontWeight|lineHeight|letterSpacing)$/]',
          message: 'Use <Text variant="..."> from @arc/ui instead of raw type styles.',
        },
      ],
    },
  },
]);
