import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/theme';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Stack used inside each tab: large titles on iOS, flat themed header everywhere. */
export function useTabHeader(): StackOptions {
  const { c } = useTheme();
  return {
    headerLargeTitle: Platform.OS === 'ios',
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerStyle: { backgroundColor: c.background },
    headerLargeStyle: { backgroundColor: c.background },
    headerTitleStyle: { color: c.text },
    headerLargeTitleStyle: { color: c.text },
    headerTintColor: c.accent,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: c.background },
  };
}

export function TabStack({ title }: { title: string }) {
  const options = useTabHeader();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
