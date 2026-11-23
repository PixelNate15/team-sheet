import * as Haptics from 'expo-haptics';
import { forwardRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export type TextFieldRef = ComponentRef<typeof TextInput>;

export const TextField = forwardRef<TextFieldRef, TextFieldProps>(function TextField(
  { label, error, hint, style, multiline, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="smallBold" color="textMuted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.textFaint}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: c.surface,
            color: c.text,
            borderColor: error ? c.danger : c.border,
            minHeight: multiline ? 96 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
            paddingTop: multiline ? space.md : undefined,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** A labelled on/off row. */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[styles.switchRow, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyBold">{label}</Text>
        {description ? (
          <Text variant="small" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: c.accent }} />
    </Pressable>
  );
}

/** iOS-style segmented control that works the same on Android. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[
              styles.segment,
              active && {
                backgroundColor: c.surface,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
            ]}>
            <Text variant="smallBold" color={active ? 'text' : 'textMuted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs + 2 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.md },
  segment: { flex: 1, alignItems: 'center', paddingVertical: space.sm + 2, borderRadius: radius.md - 3 },
});
