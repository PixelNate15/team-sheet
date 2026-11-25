import { emailLinksReach } from '../email-links';

describe('emailLinksReach', () => {
  it('rejects Expo Go addresses with an IP (Supabase sends those to localhost)', () => {
    expect(emailLinksReach('exp://192.168.1.20:8081/--/auth-callback')).toBe(false);
    expect(emailLinksReach('exps://10.0.0.5/--/auth-callback')).toBe(false);
  });

  it('accepts the tunnel and real-build addresses', () => {
    expect(emailLinksReach('exps://c-abc-123.on.expo.app/--/auth-callback')).toBe(true);
    expect(emailLinksReach('exp://abc.exp.direct/--/auth-callback')).toBe(true);
    expect(emailLinksReach('teamsheet://auth-callback')).toBe(true);
  });
});
