import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, space, useTheme } from '@/theme';

/** Blue gradient panel used for the brand header and the "next fixture" card. */
export function Hero({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const { c } = useTheme();
  return (
    <LinearGradient
      colors={[c.heroStart, c.heroEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, style]}>
      {/* decorative court lines */}
      <View pointerEvents="none" style={styles.courtA} />
      <View pointerEvents="none" style={styles.courtB} />
      {children}
    </LinearGradient>
  );
}

/** App mark: tennis ball in a rounded square. */
export function Logo({ size = 64 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: 'rgba(255,255,255,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
      }}>
      <Ionicons name="tennisball" size={size * 0.56} color={c.ball} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, overflow: 'hidden' },
  courtA: {
    position: 'absolute',
    right: -40,
    top: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  courtB: {
    position: 'absolute',
    right: 60,
    top: -10,
    bottom: -10,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
