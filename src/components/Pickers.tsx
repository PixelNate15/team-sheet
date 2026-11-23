import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { mediumDate, parseDate, shortTime, timeToDate, toIsoDate, toTime } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

/**
 * 0-10 rating picker. Replaces the original custom slider; starts unset so
 * feedback can't be submitted with untouched zeros.
 */
export function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.ratingHeader}>
        <Text variant="bodyBold">{label}</Text>
        <Text variant="heading" color={value == null ? 'textFaint' : 'accent'}>
          {value == null ? '–' : `${value}/10`}
        </Text>
      </View>
      <View style={styles.ratingRow} accessibilityRole="adjustable" accessibilityLabel={label}>
        {Array.from({ length: 11 }, (_, n) => {
          const active = value != null && n <= value;
          const current = n === value;
          return (
            <Pressable
              key={n}
              accessibilityLabel={`${n} out of 10`}
              hitSlop={4}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(n);
              }}
              style={[
                styles.ratingDot,
                {
                  backgroundColor: active ? c.accent : c.surfaceAlt,
                  transform: [{ scale: current ? 1.15 : 1 }],
                },
              ]}>
              <Text variant="caption" style={{ color: active ? c.onAccent : c.textMuted }}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PickerButton({
  icon,
  label,
  text,
  onPress,
}: {
  icon: 'calendar-outline' | 'time-outline';
  label: string;
  text: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs + 2, flex: 1 }}>
      <Text variant="smallBold" color="textMuted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text}`}
        onPress={onPress}
        style={[styles.pickerButton, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name={icon} size={18} color={c.accent} />
        <Text variant="body">{text}</Text>
      </Pressable>
    </View>
  );
}

/** Date field: native dialog on Android, compact inline picker on iOS. */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: string; // yyyy-mm-dd
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const { c, isDark } = useTheme();
  const date = parseDate(value);

  if (Platform.OS === 'ios') {
    return (
      <View style={{ gap: space.xs + 2, flex: 1 }}>
        <Text variant="smallBold" color="textMuted">
          {label}
        </Text>
        <View style={[styles.pickerButton, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="calendar-outline" size={18} color={c.accent} />
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            accentColor={c.accent}
            themeVariant={isDark ? 'dark' : 'light'}
            onValueChange={(_e, d) => onChange(toIsoDate(d))}
          />
        </View>
      </View>
    );
  }

  return (
    <PickerButton
      icon="calendar-outline"
      label={label}
      text={mediumDate(value)}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: date,
          mode: 'date',
          minimumDate,
          onValueChange: (_e, d) => onChange(toIsoDate(d)),
        })
      }
    />
  );
}

/** Time field (HH:MM), 24-hour, 5-minute steps. */
export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string; // HH:MM
  onChange: (time: string) => void;
}) {
  const { c, isDark } = useTheme();
  const date = timeToDate(value);

  if (Platform.OS === 'ios') {
    return (
      <View style={{ gap: space.xs + 2, flex: 1 }}>
        <Text variant="smallBold" color="textMuted">
          {label}
        </Text>
        <View style={[styles.pickerButton, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="time-outline" size={18} color={c.accent} />
          <DateTimePicker
            value={date}
            mode="time"
            display="compact"
            minuteInterval={5}
            accentColor={c.accent}
            themeVariant={isDark ? 'dark' : 'light'}
            onValueChange={(_e, d) => onChange(toTime(d))}
          />
        </View>
      </View>
    );
  }

  return (
    <PickerButton
      icon="time-outline"
      label={label}
      text={shortTime(value)}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          minuteInterval: 5,
          onValueChange: (_e, d) => onChange(toTime(d)),
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  ratingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ratingDot: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
