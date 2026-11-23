import { useColorScheme } from 'react-native';

/**
 * Design tokens. The brand blue (#4F9DFF) and the light/dark palettes come
 * from Original_Code/constants.py, refined for contrast on mobile.
 */
const light = {
  background: '#F3F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EBF0F7',
  border: '#DFE6F0',
  text: '#0F172A',
  textMuted: '#5B6B82',
  textFaint: '#94A3B8',
  accent: '#2F7FF0',
  accentPressed: '#1F6AD6',
  accentSoft: '#E2EDFF',
  onAccent: '#FFFFFF',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  ball: '#D4F53C',
  heroStart: '#1D4ED8',
  heroEnd: '#4F9DFF',
  onHero: '#FFFFFF',
  shadow: 'rgba(15, 23, 42, 0.08)',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0A0F1E',
  surface: '#141B2E',
  surfaceAlt: '#1B2440',
  border: '#26314F',
  text: '#F1F5F9',
  textMuted: '#A3B1C6',
  textFaint: '#64748B',
  accent: '#66B2FF',
  accentPressed: '#4FA3FF',
  accentSoft: '#15294A',
  onAccent: '#0A0F1E',
  success: '#4ADE80',
  successSoft: '#0F2E1C',
  danger: '#F87171',
  dangerSoft: '#3A1418',
  warning: '#FBBF24',
  warningSoft: '#3A2A08',
  ball: '#D4F53C',
  heroStart: '#1E3A8A',
  heroEnd: '#2F7FF0',
  onHero: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.4)',
};

export const palettes = { light, dark };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  smallBold: { fontSize: 14, lineHeight: 19, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.4 },
  stat: { fontSize: 28, lineHeight: 32, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
};

export type TypeVariant = keyof typeof type;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, isDark };
}

/** Deterministic avatar colour from a name, so each player keeps their colour. */
const avatarHues = [212, 262, 330, 18, 152, 190, 40, 290];
export function avatarColor(seed: string, isDark: boolean) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = avatarHues[h % avatarHues.length];
  return isDark
    ? { bg: `hsl(${hue}, 45%, 26%)`, fg: `hsl(${hue}, 90%, 82%)` }
    : { bg: `hsl(${hue}, 85%, 92%)`, fg: `hsl(${hue}, 60%, 32%)` };
}
