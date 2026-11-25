import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { radius, space, useTheme } from '@/theme';

/** Warm feature panel used for the brand header and the "next fixture" card. */
export function Hero({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const { c } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: c.heroBg }, style]}>
      {/* decorative open loop, echoing the studio mark */}
      <View pointerEvents="none" style={[styles.loop, { borderColor: c.heroLine }]} />
      {children}
    </View>
  );
}

/** Team Sheet app icon: tennis-ball glyph on the Terracotta tile (matches assets/brand). */
export function Logo({ size = 64 }: { size?: number }) {
  const { isDark } = useTheme();
  const tile = isDark ? '#412D27' : '#F6DBC9';
  const glyph = isDark ? '#E99578' : '#A93C28';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Team Sheet">
      <Rect width={64} height={64} rx={20} fill={tile} />
      <G fill="none" stroke={glyph} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={32} cy={32} r={16} />
        <Path d="M20.7 20.7c5.4 6.4 5.4 16.2 0 22.6M43.3 20.7c-5.4 6.4-5.4 16.2 0 22.6" />
      </G>
    </Svg>
  );
}

/** PixelNate159 Software studio mark (open-loop P and spark). */
export function StudioMark({ size = 28, color }: { size?: number; color?: string }) {
  const { c } = useTheme();
  const ink = color ?? c.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" accessibilityLabel="PixelNate159 Software">
      <Path d="M14 48V28a16 16 0 1 1 16 16h-5" fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" />
      <Circle cx={31} cy={27} r={5} fill={ink} />
      <Path d="M46 7h9m-4.5-4.5v9" stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, overflow: 'hidden' },
  loop: {
    position: 'absolute',
    right: -50,
    top: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 14,
  },
});
