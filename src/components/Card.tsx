import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

import { radius, space, type Palette, useTheme } from '@/theme';

interface CardProps extends PropsWithChildren {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  /** Coloured edge to show status (selected / win / loss ...). */
  accent?: keyof Palette;
  tone?: 'default' | 'soft';
  selected?: boolean;
  padded?: boolean;
  accessibilityLabel?: string;
}

export function Card({
  children,
  onPress,
  onLongPress,
  style,
  accent,
  tone = 'default',
  selected,
  padded = true,
  accessibilityLabel,
}: CardProps) {
  const { c } = useTheme();

  // Brand cards are flat warm surfaces with a fine border, no drop shadow.
  const base: ViewStyle = {
    backgroundColor: tone === 'soft' ? c.surfaceAlt : c.surface,
    borderRadius: radius.lg,
    padding: padded ? space.lg : 0,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? c.accent : c.border,
    overflow: 'hidden',
  };

  const content = (
    <>
      {accent ? <View style={[styles.accent, { backgroundColor: c[accent] }]} /> : null}
      {children}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={[base, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, style, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
});
