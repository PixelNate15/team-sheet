import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { parseDate, timeToDate } from './format';
import type { FixtureRow } from './types';

/** How long a fixture is blocked out for: 4 rubbers of doubles plus warm-up. */
const FIXTURE_HOURS = 3;

/**
 * expo-calendar isn't included in Expo Go (SDK 58), only in development and
 * store builds, so the "Add to calendar" button is hidden in Expo Go.
 */
export const calendarAvailable =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/**
 * Open the phone's own "new event" sheet, pre-filled with the fixture. No
 * calendar permission is needed: the player reviews and saves it themselves.
 * Uses the legacy API on purpose: in SDK 58 the plain `expo-calendar` export
 * of this function throws, and the new object API needs full calendar
 * permission and a calendar picker.
 * Returns true if the event was saved (iOS reports this; Android always says "done").
 */
export async function addFixtureToCalendar(f: FixtureRow): Promise<boolean> {
  // Loaded only when used, so Expo Go never touches the missing native module.
  const Calendar = await import('expo-calendar/legacy');
  const start = timeToDate(f.start_time, parseDate(f.fixture_date));
  const end = new Date(start.getTime() + FIXTURE_HOURS * 60 * 60 * 1000);
  const team = f.squads?.name ? ` (${f.squads.name})` : '';

  const result = await Calendar.createEventInCalendarAsync({
    title: `Tennis: ${f.is_home ? 'vs' : '@'} ${f.opponent_name}${team}`,
    startDate: start,
    endDate: end,
    location: f.location,
    notes: [f.is_home ? 'Home fixture' : 'Away fixture', f.notes].filter(Boolean).join('\n\n'),
  });
  return result.action === 'saved' || result.action === 'done';
}
