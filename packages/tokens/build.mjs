// Turns tokens.json (the Figma export) into src/tokens.generated.ts.
// Run with: npm run tokens     Never edit the generated file by hand.
import StyleDictionary from 'style-dictionary';

StyleDictionary.registerFormat({
  name: 'arc/typescript',
  format: ({ dictionary }) => {
    // Rebuild the nested shape of tokens.json, keeping only resolved values.
    const tree = {};
    for (const token of dictionary.allTokens) {
      let node = tree;
      token.path.slice(0, -1).forEach((key) => (node = node[key] ??= {}));
      node[token.path.at(-1)] = token.$value ?? token.value;
    }
    return [
      '// GENERATED FILE. Do not edit. Source: packages/tokens/tokens.json',
      '// Regenerate with: npm run tokens',
      '',
      `export const tokens = ${JSON.stringify(tree, null, 2)} as const;`,
      '',
    ].join('\n');
  },
});

const sd = new StyleDictionary({
  source: ['tokens.json'],
  log: { verbosity: 'default' },
  platforms: {
    ts: {
      // Unique names (colorBg, sizeAvatar, ...); our format writes by path instead.
      transforms: ['name/camel'],
      buildPath: 'src/',
      files: [{ destination: 'tokens.generated.ts', format: 'arc/typescript' }],
    },
  },
});

await sd.buildAllPlatforms();
