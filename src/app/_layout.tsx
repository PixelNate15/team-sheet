import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/Bits';
import { AuthProvider, useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { registerForPush, useNotificationRouting } from '@/lib/notifications';
import { space, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Refetch stale data when the app comes back to the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ThemedApp() {
  const { c, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
    },
  };
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, me, meError, isLoading, canCaptain, userId, refreshMe, signOut } = useAuth();
  const { c } = useTheme();
  const signedIn = !!session;
  const inClub = !!me?.membership;

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  // Register this device for push once the player is in a club.
  const wantsPush = inClub && me?.profile.notifications_enabled;
  useEffect(() => {
    if (wantsPush && userId) registerForPush(userId).catch(() => {});
  }, [wantsPush, userId]);

  useNotificationRouting(inClub);

  if (isLoading) return null;

  if (signedIn && !me && meError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: c.background }}>
        <EmptyState icon="cloud-offline-outline" title="Can’t reach the club" message={errorMessage(meError)} />
        <Button title="Try again" onPress={() => refreshMe()} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    );
  }

  const header = {
    headerShown: true,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.background },
    headerTintColor: c.accent,
    headerTitleStyle: { color: c.text },
  };
  const modal = { ...header, presentation: 'modal' as const };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
      <Stack.Protected guard={signedIn && inClub}>
        <Stack.Screen name="(member)" />
        <Stack.Screen name="fixture/[id]" options={{ ...header, title: 'Fixture' }} />
        <Stack.Screen name="result/[fixtureId]" options={{ ...header, title: 'Result' }} />
        <Stack.Screen name="league/[divisionId]" options={{ ...header, title: 'League table' }} />
        <Stack.Screen
          name="availability/[fixtureId]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: c.background },
          }}
        />
        <Stack.Screen name="give-feedback/[matchId]" options={{ ...modal, title: 'Rate your partner' }} />
        <Stack.Screen name="injury" options={{ ...modal, title: 'Injury status' }} />
        <Stack.Screen name="profile" options={{ ...modal, title: 'Profile' }} />

        <Stack.Protected guard={canCaptain}>
          <Stack.Screen name="(captain)" />
          <Stack.Screen name="player/[id]" options={{ ...header, title: 'Player' }} />
          <Stack.Screen name="add-players" options={{ ...modal, title: 'Add players' }} />
          <Stack.Screen name="fixture-edit" options={{ ...modal, title: 'Fixture' }} />
          <Stack.Screen name="result-entry/[fixtureId]" options={{ ...modal, title: 'Enter result' }} />
        </Stack.Protected>
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !inClub}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="reset-password" options={{ ...header, title: 'New password' }} />
      </Stack.Protected>

      {/* Email links land here whatever the sign-in state. */}
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}
