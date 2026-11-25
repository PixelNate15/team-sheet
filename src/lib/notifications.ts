import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { updateProfile } from './api';

// Notifications only work in the iOS and Android apps, not on web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ask for permission and store this device's Expo push token on the profile.
 * The database sends pushes directly to Expo (see public.send_push).
 * Returns false if permission was refused or this isn't a real device.
 */
export async function registerForPush(userId: string): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Team updates',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#2F7FF0',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return false;

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push notifications need an EAS project id. Run `npx eas-cli init`.');
    return false;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await updateProfile(userId, { expo_push_token: token, notifications_enabled: true });
    return true;
  } catch (e) {
    console.warn('Could not register for push notifications', e);
    return false;
  }
}

/** Open the relevant screen when a notification is tapped (does nothing on web). */
export const useNotificationRouting: (enabled: boolean) => void =
  Platform.OS === 'web' ? () => {} : useNotificationRoutingNative;

function useNotificationRoutingNative(enabled: boolean) {
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!enabled || !last) return;
    const data = last.notification.request.content.data as { type?: string; fixture_id?: number };
    if (data?.fixture_id && data.type === 'result') {
      router.push({ pathname: '/result/[fixtureId]', params: { fixtureId: String(data.fixture_id) } });
    } else if (data?.fixture_id) {
      router.push({ pathname: '/fixture/[id]', params: { id: String(data.fixture_id) } });
    }
    Notifications.clearLastNotificationResponse();
  }, [enabled, last]);
}
