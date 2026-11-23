import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSignedIn } from '@/lib/auth';
import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

/** Which squad the captain is managing (admins / multi-team captains), plus the switch back to player view. */
export function SquadSwitcher() {
  const { c } = useTheme();
  const { managedSquads, activeSquad, setActiveSquadId } = useSignedIn();

  return (
    <View style={styles.row}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ flex: 1 }}>
        {managedSquads.map((s) => {
          const active = s.id === activeSquad?.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setActiveSquadId(s.id)}
              style={[styles.chip, { backgroundColor: active ? c.accent : c.surface, borderColor: active ? c.accent : c.border }]}>
              <Text variant="smallBold" style={{ color: active ? c.onAccent : c.text }}>
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch to player view"
        onPress={() => router.replace('/')}
        style={[styles.chip, { backgroundColor: c.accentSoft, borderColor: c.accentSoft, flexDirection: 'row', gap: 6 }]}>
        <Ionicons name="person-outline" size={15} color={c.accent} />
        <Text variant="smallBold" color="accent">
          Player view
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center' },
});
