import { tokens } from './tokens.generated';

export { tokens };

export const colors = tokens.color;
export const fonts = tokens.font;
export const space = tokens.space;
export const radius = tokens.radius;
export const size = tokens.size;

/** Text styles, ready to spread into a React Native style. */
export const typography = tokens.type;
export type TypographyVariant = keyof typeof typography;

/** Any colour token that is a single value (not the primitive palette group). */
export type ColorToken = Exclude<keyof typeof colors, 'primitive'>;
