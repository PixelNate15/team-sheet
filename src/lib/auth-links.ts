import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { emailLinksReach } from './email-links';
import { supabase } from './supabase';

/**
 * Where Supabase's email links (sign-up confirmation, password reset) send
 * the user back to: the app's own auth-callback screen.
 *   Real build:  teamsheet://auth-callback
 *   Expo Go:     exps://<id>.on.expo.app/--/auth-callback  (`npm run start:tunnel`)
 * Redirect URLs `exp://**`, `exps://**` and `teamsheet://**` must be allowed in
 * Supabase → Authentication → URL Configuration, or links fall back to the Site URL.
 *
 * Supabase never redirects to an IP address. Expo Go may reach the dev server by
 * its Wi-Fi IP even in tunnel mode (e.g. from its Development servers list), and
 * then rewrites the app's own addresses to that IP. In that case we ask the dev
 * server for its manifest, which still names the tunnel, and use that instead.
 */
export async function authRedirectUrl(): Promise<string> {
  const url = Linking.createURL('auth-callback');
  if (emailLinksReach(url)) return url;
  const tunnel = (await devServerTunnelHost(url)) ?? sameConfigTunnelHost();
  return tunnel ? `exps://${tunnel}/--/auth-callback` : url;
}

/** False when Supabase can't send email links back to this session (see email-links.ts). */
export async function emailLinksReachThisApp() {
  return emailLinksReach(await authRedirectUrl());
}

function tunnelHostOrNull(host: string | null | undefined) {
  const h = host?.replace(/\/.*$/, '');
  return h && emailLinksReach(`exps://${h}`) ? h : null;
}

function sameConfigTunnelHost() {
  return tunnelHostOrNull(Constants.expoConfig?.hostUri);
}

/** Development only: read the tunnel's host from the dev server's own manifest. */
async function devServerTunnelHost(url: string): Promise<string | null> {
  const server = url.match(/^exps?:\/\/([^/]+)/)?.[1];
  if (!__DEV__ || !server) return null;
  try {
    const res = await fetch(`http://${server}/`, {
      headers: { Accept: 'application/expo+json', 'expo-platform': Platform.OS },
    });
    const manifest = (await res.json()) as { extra?: { expoClient?: { hostUri?: string } } };
    return tunnelHostOrNull(manifest.extra?.expoClient?.hostUri);
  } catch {
    return null;
  }
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
  return {
    status: 'error',
    message: url.includes('#')
      ? 'This link has expired or has already been used.'
      : 'The link reached the app without its sign-in details.',
  };
}
