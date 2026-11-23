import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatForm, fullName } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

import { Avatar, Chip } from './Bits';
import { Text } from './Text';

export interface Candidate {
  user_id: string;
  first_name: string;
  surname: string;
  form?: number | null;
  status?: 'in' | 'out' | 'waiting' | 'injured';
  note?: string | null;
}

/** Slots in order: Pair 1 player 1, Pair 1 player 2, Pair 2 player 1, Pair 2 player 2. */
export type Slots = [string | null, string | null, string | null, string | null];

export const emptySlots = (): Slots => [null, null, null, null];

const statusChip = {
  in: { label: 'Available', tone: 'success' as const },
  out: { label: 'Unavailable', tone: 'danger' as const },
  waiting: { label: 'No reply', tone: 'neutral' as const },
  injured: { label: 'Injured', tone: 'warning' as const },
};

/**
 * Tap a slot, then tap a player. Replaces the four comboboxes on
 * captain_add_or_edit_fixture.py (which silently blanked unavailable players).
 */
export function PairPicker({
  candidates,
  value,
  onChange,
}: {
  candidates: Candidate[];
  value: Slots;
  onChange: (v: Slots) => void;
}) {
  const { c } = useTheme();
  const [active, setActive] = useState<number>(() => {
    const i = value.findIndex((v) => v == null);
    return i === -1 ? 0 : i;
  });
  const byId = new Map(candidates.map((p) => [p.user_id, p]));

  function pick(userId: string) {
    Haptics.selectionAsync().catch(() => {});
    const next = [...value] as Slots;
    const existing = next.indexOf(userId);
    if (existing !== -1) next[existing] = null; // move, don't duplicate
    next[active] = userId;
    onChange(next);
    const nextEmpty = next.findIndex((v) => v == null);
    if (nextEmpty !== -1) setActive(nextEmpty);
  }

  function clear(i: number) {
    const next = [...value] as Slots;
    next[i] = null;
    onChange(next);
    setActive(i);
  }

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {[0, 1].map((pair) => (
          <View key={pair} style={[styles.pair, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text variant="caption" color="accent">
              PAIR {pair + 1}
            </Text>
            {[0, 1].map((k) => {
              const i = pair * 2 + k;
              const p = value[i] ? byId.get(value[i]!) : null;
              const isActive = active === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`Pair ${pair + 1} player ${k + 1}: ${p ? fullName(p) : 'empty'}`}
                  onPress={() => setActive(i)}
                  style={[
                    styles.slot,
                    {
                      borderColor: isActive ? c.accent : c.border,
                      backgroundColor: isActive ? c.accentSoft : c.surfaceAlt,
                      borderStyle: p ? 'solid' : 'dashed',
                    },
                  ]}>
                  {p ? (
                    <>
                      <Avatar first={p.first_name} surname={p.surname} size={28} />
                      <Text variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                        {p.first_name} {p.surname.charAt(0)}.
                      </Text>
                      <Pressable hitSlop={10} onPress={() => clear(i)} accessibilityLabel="Remove player">
                        <Ionicons name="close-circle" size={18} color={c.textFaint} />
                      </Pressable>
                    </>
                  ) : (
                    <Text variant="small" color={isActive ? 'accent' : 'textFaint'}>
                      {isActive ? 'Choose below' : 'Empty'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="smallBold" color="textMuted">
          Choose Pair {Math.floor(active / 2) + 1}, player {(active % 2) + 1}
        </Text>
        {candidates.length === 0 ? (
          <Text variant="small" color="textFaint">
            No players in this squad yet.
          </Text>
        ) : null}
        {candidates.map((p) => {
          const slot = value.indexOf(p.user_id);
          const chip = p.status ? statusChip[p.status] : null;
          return (
            <Pressable
              key={p.user_id}
              onPress={() => pick(p.user_id)}
              accessibilityRole="button"
              accessibilityLabel={`Pick ${fullName(p)}`}
              style={({ pressed }) => [
                styles.candidate,
                {
                  backgroundColor: slot !== -1 ? c.accentSoft : c.surface,
                  borderColor: slot !== -1 ? c.accent : c.border,
                  opacity: pressed ? 0.7 : p.status === 'out' ? 0.6 : 1,
                },
              ]}>
              <Avatar first={p.first_name} surname={p.surname} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyBold">{fullName(p)}</Text>
                <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
                  {chip ? <Chip label={chip.label} tone={chip.tone} /> : null}
                  {p.note ? (
                    <Text variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {p.note}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="smallBold">{formatForm(p.form)}</Text>
                <Text variant="caption" color="textFaint">
                  FORM
                </Text>
              </View>
              {slot !== -1 ? (
                <View style={[styles.badge, { backgroundColor: c.accent }]}>
                  <Text variant="caption" style={{ color: c.onAccent }}>
                    P{Math.floor(slot / 2) + 1}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flex: 1, gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
