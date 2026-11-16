import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography, type ColorToken, type TypographyVariant } from '@arc/tokens';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
};

/** All text in the app goes through this, so type styles come only from tokens. */
export function Text({ variant = 'body', color, align, style, ...rest }: TextProps) {
  // In the designs, body copy is secondary grey; everything else is primary.
  const resolved = color ?? (variant === 'body' ? 'textSecondary' : 'textPrimary');
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: colors[resolved] },
        variant === 'label' && { textTransform: 'uppercase' },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
