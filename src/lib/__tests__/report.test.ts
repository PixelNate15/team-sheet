import { seasonReportHtml } from '../report';
import type { SeasonReport } from '../types';

const report: SeasonReport = {
  club: 'Test <Club>',
  season: 'Winter 2026/27',
  generated_at: '2026-11-26T10:00:00Z',
  squads: [
    {
      name: '1st Team',
      division: 'Division 1',
      fixtures: [
        { date: '2026-10-14', opponent: 'Oakwood TC', is_home: false, sets_won: 6, sets_lost: 3 },
        { date: '2026-11-04', opponent: "St Mary's", is_home: true, sets_won: 3, sets_lost: 6 },
        { date: '2026-12-05', opponent: 'Hillside', is_home: true, sets_won: null, sets_lost: null },
      ],
      players: [{ name: 'Tom Reid', fixtures: 2, rubbers: 4, wins: 3, form: 0.5512 }],
      fees_outstanding_pence: 1500,
    },
  ],
};

describe('seasonReportHtml', () => {
  const html = seasonReportHtml(report);

  it('summarises each team’s record and fees', () => {
    expect(html).toContain('Played 2 · Won 1 · Drawn 0 · Lost 1');
    expect(html).toContain('Fees outstanding £15');
    expect(html).toContain('Won 6–3');
    expect(html).toContain('No result');
  });

  it('lists players with win % and form', () => {
    expect(html).toMatch(/Tom Reid<\/td><td class="num">2<\/td><td class="num">4<\/td><td class="num">3<\/td><td class="num">75%<\/td><td class="num">0.55/);
  });

  it('escapes names so they can’t break the page', () => {
    expect(html).toContain('Test &lt;Club&gt;');
    expect(html).toContain('St Mary&#39;s');
    expect(html).not.toContain('<Club>');
  });
});
