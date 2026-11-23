import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useTheme } from '@/theme';

import { Text } from './Text';

export interface SheetOption {
  text: string;
  onPress: () => void;
  destructive?: boolean;
}

interface SheetState {
  title: string;
  message?: string;
  options: SheetOption[];
}

/**
 * Cross-platform list of choices. Android's Alert only shows 3 buttons, so
 * pickers with many options (teams, captains, divisions) use this instead.
 */
export function useActionSheet(): [ReactNode, (title: string, options: SheetOption[], message?: string) => void] {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SheetState | null>(null);

  const show = useCallback((title: string, options: SheetOption[], message?: string) => setState({ title, options, message }), []);
  const close = () => setState(null);

  const element = (
    <Modal visible={!!state} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + space.md }]}>
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        {state ? (
          <>
            <Text variant="heading" align="center">
              {state.title}
            </Text>
            {state.message ? (
              <Text variant="small" color="textMuted" align="center" style={{ marginTop: 4 }}>
                {state.message}
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: 420, marginTop: space.md }}>
              {state.options.map((o, i) => (
                <Pressable
                  key={`${o.text}-${i}`}
                  accessibilityRole="button"
                  onPress={() => {
                    close();
                    // Run after the sheet has animated away, so a follow-up sheet or alert can open.
                    setTimeout(o.onPress, 320);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { borderTopColor: c.border, backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
                  ]}>
                  <Text variant="bodyBold" color={o.destructive ? 'danger' : 'accent'} align="center">
                    {o.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={[styles.cancel, { backgroundColor: c.surfaceAlt }]}>
              <Text variant="bodyBold" align="center">
                Cancel
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Modal>
  );

  return [element, show];
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingTop: space.sm },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.md },
  option: { paddingVertical: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  cancel: { marginTop: space.md, paddingVertical: space.lg, borderRadius: radius.md },
});
