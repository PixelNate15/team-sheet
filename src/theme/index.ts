import { useColorScheme } from 'react-native';

/**
 * Design tokens: PixelNate159 Software "Terracotta" brand (light + dark).
 * Core roles (canvas, surface, ink, muted, primary, on-primary, focus, border,
 * secondary, danger, tile) are the approved brand values; the remaining roles
 * (soft fills, pressed, warning, faint) are derived within the same family.
 */
const light = {
  background: '#FAF1E3', // canvas
  surface: '#FFFAF2',
  surfaceAlt: '#F4E7D6',
  border: '#DAC7B6',
  /** Outline for controls that must be identifiable (border is too subtle). */
  outline: '#6F554A',
  text: '#30231F', // ink
  textMuted: '#6F554A',
  textFaint: '#7E6759',
  accent: '#A93C28', // primary action
  accentPressed: '#8E3020',
  accentSoft: '#F6DBC9', // icon tile
  onAccent: '#FFFFFF',
  focus: '#2E624F',
  secondary: '#2E624F', // supporting sage accent
  success: '#2E624F',
  successSoft: '#DCE9DF',
  onSuccess: '#FFFFFF',
  danger: '#9D2925',
  dangerSoft: '#F7DCD7',
  warning: '#86541A',
  warningSoft: '#F5E6C8',
  heroBg: '#F6DBC9',
  onHero: '#30231F',
  onHeroMuted: '#6F554A',
  heroLine: 'rgba(169, 60, 40, 0.14)',
  heroChip: 'rgba(48, 35, 31, 0.08)',
  scrim: 'rgba(48, 35, 31, 0.45)',
  shadow: 'rgba(48, 35, 31, 0.08)',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#211916',
  surface: '#2C221E',
  surfaceAlt: '#352A25',
  border: '#584437',
  outline: '#CDB5A4',
  text: '#F8EBDB',
  textMuted: '#CDB5A4',
  textFaint: '#A08A7C',
  accent: '#E99578',
  accentPressed: '#F0AA91',
  accentSoft: '#412D27',
  onAccent: '#2D130B',
  focus: '#ABCDB6',
  secondary: '#A8C8B1',
  success: '#A8C8B1',
  successSoft: '#22332A',
  onSuccess: '#13261C',
  danger: '#FFAA9D',
  dangerSoft: '#46221F',
  warning: '#E8C07A',
  warningSoft: '#3A2C14',
  heroBg: '#412D27',
  onHero: '#F8EBDB',
  onHeroMuted: '#CDB5A4',
  heroLine: 'rgba(233, 149, 120, 0.16)',
  heroChip: 'rgba(248, 235, 219, 0.1)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  shadow: 'rgba(0, 0, 0, 0.4)',
};

export const palettes = { light, dark };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** The brand uses one 14 px component radius; pill is for chips and avatars. */
export const radius = { sm: 10, md: 14, lg: 14, xl: 14, pill: 999 } as const;

/** Font families loaded in the root layout (see `brandFonts`). */
export const font = {
  display: 'DMSerifDisplay_400Regular',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

// Each weight is its own family, so variants set fontFamily and never fontWeight.
export const type = {
  hero: { fontFamily: font.display, fontSize: 38, lineHeight: 44 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 32 },
  heading: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  bodyBold: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 19 },
  smallBold: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  stat: { fontFamily: font.display, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums' as const] },
};

export type TypeVariant = keyof typeof type;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, isDark };
}

/** Deterministic avatar colour from a name, so each player keeps their colour. Warm, muted hues. */
const avatarHues = [12, 28, 145, 160, 200, 330, 40, 280];
export function avatarColor(seed: string, isDark: boolean) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = avatarHues[h % avatarHues.length];
  return isDark
    ? { bg: `hsl(${hue}, 25%, 24%)`, fg: `hsl(${hue}, 55%, 82%)` }
    : { bg: `hsl(${hue}, 45%, 89%)`, fg: `hsl(${hue}, 45%, 30%)` };
}
