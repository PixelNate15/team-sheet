import * as Linking from 'expo-linking';

import { supabase } from './supabase';

/**
 * Where Supabase's email links (sign-up confirmation, password reset) send
 * the user back to: the app's own auth-callback screen.
 *   Expo Go:     exp://<computer-ip>:8081/--/auth-callback  (LAN)
 *                exps://<id>.on.expo.app/--/auth-callback    (`npm run start:tunnel`, HTTPS)
 *   Real build:  teamsheet://auth-callback
 * All three schemes must be in Supabase → Authentication → URL Configuration → Redirect URLs
 * (`exp://**`, `exps://**`, `teamsheet://**`), otherwise Supabase falls back to the Site URL.
 * Supabase never redirects to a raw IP address, even when `exp://**` is allowed, so
 * test email links in Expo Go with the tunnel (or in a development build).
 */
export function authRedirectUrl() {
  return Linking.createURL('auth-callback');
}

export type AuthLinkResult =
  | { status: 'signed-in'; type: string | null }
  | { status: 'error'; message: string };

/** Supabase puts the result in the URL fragment (#...), and sometimes errors in the query (?...). */
function linkParams(url: string) {
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((v, k) => params.set(k, v));
  }
  return params;
}

/** Turn the tokens in an email link into a signed-in session. */
export async function completeAuthLink(url: string): Promise<AuthLinkResult> {
  const p = linkParams(url);
  const type = p.get('type');

  const linkError = p.get('error_description') ?? p.get('error');
  if (linkError) {
    return { status: 'error', message: linkError.replace(/\+/g, ' ') };
  }

  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!error) return { status: 'signed-in', type };
    // The same link reopened (e.g. after a reload): fine if we're already signed in.
    const { data } = await supabase.auth.getSession();
    if (data.session) return { status: 'signed-in', type };
    return { status: 'error', message: error.message };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) return { status: 'signed-in', type };
  return { status: 'error', message: 'This link has expired or has already been used.' };
}
