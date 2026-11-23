import { Text as RNText, type TextProps } from 'react-native';

import { type Palette, type TypeVariant, type as typeScale, useTheme } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: keyof Palette;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  return <RNText style={[typeScale[variant], { color: c[color], textAlign: align }, style]} {...rest} />;
}
