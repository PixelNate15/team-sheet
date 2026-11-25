/**
 * False when email links can't come back to this address: an Expo Go address
 * with an IP (e.g. exp://192.168.1.20:8081/--/auth-callback). Supabase never
 * redirects to IP addresses and silently uses the Site URL (localhost) instead.
 * Only happens in development; real builds use teamsheet://.
 */
export function emailLinksReach(url: string) {
  return !/^exps?:\/\/\d{1,3}(\.\d{1,3}){3}([:/]|$)/.test(url);
}
