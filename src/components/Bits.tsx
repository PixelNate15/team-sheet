import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

import { initials } from '@/lib/format';
import { avatarColor, radius, space, type Palette, useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Avatar({
  first,
  surname,
  size = 44,
  ring,
}: {
  first: string;
  surname: string;
  size?: number;
  ring?: keyof Palette;
}) {
  const { c, isDark } = useTheme();
  const col = avatarColor(`${first} ${surname}`, isDark);
  // The line height must grow with the font size, or the body style's 22px
  // line height clips the initials on large avatars (e.g. the player screen).
  const fontSize = Math.round(size * 0.38);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: col.bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: ring ? c[ring] : undefined,
      }}>
      <Text
        style={{ color: col.fg, fontSize, lineHeight: Math.round(fontSize * 1.2), fontWeight: '800' }}
        allowFontScaling={false}>
        {initials(first, surname)}
      </Text>
    </View>
  );
}

type ChipTone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

export function Chip({ label, tone = 'neutral', icon }: { label: string; tone?: ChipTone; icon?: IconName }) {
  const { c } = useTheme();
  const tones: Record<ChipTone, { bg: string; fg: string }> = {
    accent: { bg: c.accentSoft, fg: c.accent },
    success: { bg: c.successSoft, fg: c.success },
    danger: { bg: c.dangerSoft, fg: c.danger },
    warning: { bg: c.warningSoft, fg: c.warning },
    neutral: { bg: c.surfaceAlt, fg: c.textMuted },
  };
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={t.fg} /> : null}
      <Text variant="caption" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color="textMuted" style={{ textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function EmptyState({
  icon = 'tennisball-outline',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: { title: string; onPress: () => void };
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>
        <Ionicons name={icon} size={28} color={c.accent} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="small" color="textMuted" align="center">
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.title} onPress={action.onPress} variant="secondary" size="sm" full={false} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : (error as { message?: string })?.message;
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn’t load this"
      message={msg ?? 'Check your connection and try again.'}
      action={onRetry ? { title: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: space.xxl * 2, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} size="large" />
    </View>
  );
}

/** Skeleton placeholder blocks while lists load. */
export function Skeleton({ count = 3, height = 84 }: { count?: number; height?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ height, borderRadius: radius.lg, backgroundColor: c.surfaceAlt, opacity: 1 - i * 0.2 }} />
      ))}
    </View>
  );
}

/** Label / value row for detail screens (replaces the old 2-column grids). */
export function InfoRow({ icon, label, value, last }: { icon: IconName; label: string; value: ReactNode; last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons name={icon} size={17} color={c.textMuted} />
      </View>
      <Text variant="small" color="textMuted" style={{ width: 96 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text variant="bodyBold">{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** Big number with a caption (stats tiles). */
export function Stat({ label, value, tone, style }: { label: string; value: string; tone?: keyof Palette; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      <Text variant="stat" color={tone ?? 'text'}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted" style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

/** Small round icon used in list rows and banners. */
export function IconBubble({ icon, tone = 'accent', size = 40 }: { icon: IconName; tone?: ChipTone; size?: number }) {
  const { c } = useTheme();
  const map: Record<ChipTone, [string, string]> = {
    accent: [c.accentSoft, c.accent],
    success: [c.successSoft, c.success],
    danger: [c.dangerSoft, c.danger],
    warning: [c.warningSoft, c.warning],
    neutral: [c.surfaceAlt, c.textMuted],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </View>
  );
}

/** Tappable settings-style row. */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  tone = 'accent',
  chevron = true,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  tone?: ChipTone;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.listRow}>
      <IconBubble icon={icon} tone={tone} size={36} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyBold" color={tone === 'danger' ? 'danger' : 'text'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  infoIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
