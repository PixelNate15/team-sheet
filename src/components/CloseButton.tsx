import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

/**
 * A clear "Close" for pop-up screens (modals and sheets), so nobody has to know
 * to swipe down. Swiping down still works too.
 */
export function CloseButton({ label = 'Close' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 6, paddingHorizontal: 2 })}>
      <Text variant="bodyBold" style={{ color: c.accent }}>
        {label}
      </Text>
    </Pressable>
  );
}
