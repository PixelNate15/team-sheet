import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '@/theme';

interface ScreenProps extends PropsWithChildren {
  /** Pull-to-refresh handler. */
  onRefresh?: () => Promise<unknown>;
  /** Content pinned below the scroll view (e.g. a save button). */
  footer?: ReactNode;
  /** Screens without a native header need the top safe area. */
  padTop?: boolean;
  contentStyle?: ViewStyle;
}

/** Standard scrolling screen. Works with native (large-title) headers. */
export function Screen({ children, onRefresh, footer, padTop, contentStyle }: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        // iOS: make room for the keyboard so the focused field can scroll into view.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={[
          styles.content,
          { paddingTop: padTop ? insets.top + space.lg : space.lg, paddingBottom: footer ? space.lg : insets.bottom + 96 },
          contentStyle,
        ]}
        refreshControl={
          refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} /> : undefined
        }>
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + space.md, backgroundColor: c.background, borderTopColor: c.border },
          ]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** Vertical stack with consistent spacing. */
export function Stack({ gap = space.md, style, children }: PropsWithChildren<{ gap?: number; style?: ViewStyle }>) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({
  gap = space.sm,
  style,
  children,
  wrap,
}: PropsWithChildren<{ gap?: number; style?: ViewStyle; wrap?: boolean }>) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
