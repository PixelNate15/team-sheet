import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { dayMonth, shortTime } from '@/lib/format';
import { font, radius, space, type Palette, useTheme } from '@/theme';

import { Card } from './Card';
import { Text } from './Text';

/** Calendar-style date block used on fixture and result cards. */
export function DateBlock({ iso, tone = 'accent' }: { iso: string; tone?: 'accent' | 'success' | 'danger' | 'neutral' }) {
  const { c } = useTheme();
  const { day, month } = dayMonth(iso);
  const bg = { accent: c.accentSoft, success: c.successSoft, danger: c.dangerSoft, neutral: c.surfaceAlt }[tone];
  const fg = { accent: c.accent, success: c.success, danger: c.danger, neutral: c.textMuted }[tone];
  return (
    <View style={[styles.dateBlock, { backgroundColor: bg }]}>
      <Text variant="caption" style={{ color: fg }}>
        {month}
      </Text>
      <Text style={{ color: fg, fontFamily: font.display, fontSize: 24, lineHeight: 28 }}>{day}</Text>
    </View>
  );
}

export function FixtureCard({
  opponent,
  isHome,
  date,
  time,
  location,
  onPress,
  accent,
  chips,
  footer,
  dateTone,
}: {
  opponent: string;
  isHome: boolean;
  date: string;
  time?: string;
  location?: string;
  onPress?: () => void;
  accent?: keyof Palette;
  chips?: ReactNode;
  footer?: ReactNode;
  dateTone?: 'accent' | 'success' | 'danger' | 'neutral';
}) {
  const { c } = useTheme();
  const { weekday } = dayMonth(date);
  return (
    <Card onPress={onPress} accent={accent} accessibilityLabel={`${isHome ? 'Home' : 'Away'} against ${opponent}`}>
      <View style={styles.row}>
        <DateBlock iso={date} tone={dateTone} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.titleRow}>
            <Text variant="caption" color={isHome ? 'success' : 'warning'}>
              {isHome ? 'HOME' : 'AWAY'}
            </Text>
          </View>
          <Text variant="heading" numberOfLines={1}>
            {opponent}
          </Text>
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={13} color={c.textMuted} />
            <Text variant="small" color="textMuted">
              {weekday}
              {time ? ` · ${shortTime(time)}` : ''}
            </Text>
            {location ? (
              <>
                <Ionicons name="location-outline" size={13} color={c.textMuted} style={{ marginLeft: 6 }} />
                <Text variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {location}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
      </View>
      {chips ? <View style={styles.chips}>{chips}</View> : null}
      {footer ? <View style={{ marginTop: space.md }}>{footer}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  dateBlock: {
    width: 54,
    height: 58,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
});
