import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: ViewStyle;
  full?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
  full = true,
}: ButtonProps) {
  const { c } = useTheme();

  const palette: Record<Variant, { bg: string; fg: string; pressed: string }> = {
    primary: { bg: c.accent, fg: c.onAccent, pressed: c.accentPressed },
    secondary: { bg: c.accentSoft, fg: c.accent, pressed: c.surfaceAlt },
    ghost: { bg: 'transparent', fg: c.accent, pressed: c.surfaceAlt },
    danger: { bg: c.dangerSoft, fg: c.danger, pressed: c.surfaceAlt },
    success: { bg: c.success, fg: '#FFFFFF', pressed: c.success },
  };
  const p = palette[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: pressed ? p.pressed : p.bg, alignSelf: full ? 'stretch' : 'flex-start' },
        // Disabled buttons look disabled (the original redrew them in the same colour).
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={p.fg} /> : null}
          <Text variant={size === 'sm' ? 'smallBold' : 'bodyBold'} style={{ color: p.fg }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round icon-only button (e.g. header actions). */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'accent',
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label: string;
  tone?: 'accent' | 'muted';
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        { backgroundColor: tone === 'accent' ? c.accentSoft : c.surfaceAlt, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={tone === 'accent' ? c.accent : c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 52, paddingHorizontal: space.xl },
  sm: { minHeight: 38, paddingHorizontal: space.lg },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
