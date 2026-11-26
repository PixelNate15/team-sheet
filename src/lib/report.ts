import { formatPence, mediumDate } from './format';
import type { SeasonReport, SquadAwards } from './types';

const esc = (s: string | number | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function outcome(won: number | null, lost: number | null) {
  if (won == null || lost == null) return { label: 'No result', cls: 'muted' };
  if (won > lost) return { label: `Won ${won}–${lost}`, cls: 'win' };
  if (won < lost) return { label: `Lost ${won}–${lost}`, cls: 'loss' };
  return { label: `Drew ${won}–${lost}`, cls: 'muted' };
}

/** The season report as a printable HTML page in the Terracotta style. */
export function seasonReportHtml(r: SeasonReport, awards: SquadAwards[] = []): string {
  const squads = r.squads
    .map((s) => {
      const played = s.fixtures.filter((f) => f.sets_won != null);
      const w = played.filter((f) => (f.sets_won ?? 0) > (f.sets_lost ?? 0)).length;
      const l = played.filter((f) => (f.sets_won ?? 0) < (f.sets_lost ?? 0)).length;
      const d = played.length - w - l;
      const fixtures = s.fixtures.length
        ? s.fixtures
            .map((f) => {
              const o = outcome(f.sets_won, f.sets_lost);
              return `<tr><td>${esc(mediumDate(f.date))}</td><td>${f.is_home ? 'vs' : '@'} ${esc(f.opponent)}</td><td class="${o.cls}">${esc(o.label)}</td></tr>`;
            })
            .join('')
        : '<tr><td colspan="3" class="muted">No fixtures this season.</td></tr>';
      const players = s.players.length
        ? s.players
            .map(
              (p) =>
                `<tr><td>${esc(p.name)}</td><td class="num">${p.fixtures}</td><td class="num">${p.rubbers}</td><td class="num">${p.wins}</td><td class="num">${p.rubbers ? Math.round((p.wins * 100) / p.rubbers) : 0}%</td><td class="num">${p.form == null ? '–' : Number(p.form).toFixed(2)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="6" class="muted">No rubbers played yet.</td></tr>';
      const teamAwards = awards.find((a) => a.squad === s.name)?.awards ?? [];
      const awardsHtml = teamAwards.length
        ? `<h3>Awards</h3><table><tbody>${teamAwards
            .map((a) => `<tr><td class="award">${esc(a.title)}</td><td>${esc(a.winner)}</td><td class="muted">${esc(a.detail)}</td></tr>`)
            .join('')}</tbody></table>`
        : '';
      return `
      <section>
        <h2>${esc(s.name)}</h2>
        <p class="sub">${s.division ? `${esc(s.division)} · ` : ''}Played ${played.length} · Won ${w} · Drawn ${d} · Lost ${l}${s.fees_outstanding_pence ? ` · Fees outstanding ${esc(formatPence(s.fees_outstanding_pence))}` : ''}</p>
        ${awardsHtml}
        <h3>Fixtures</h3>
        <table><thead><tr><th>Date</th><th>Opponent</th><th>Result (sets)</th></tr></thead><tbody>${fixtures}</tbody></table>
        <h3>Players</h3>
        <table><thead><tr><th>Player</th><th class="num">Fixtures</th><th class="num">Rubbers</th><th class="num">Won</th><th class="num">Win %</th><th class="num">Form</th></tr></thead><tbody>${players}</tbody></table>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 36px; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #30231F; background: #FFFAF2; font-size: 12px; }
  h1, h2 { font-family: "DM Serif Display", Georgia, serif; font-weight: 400; margin: 0; }
  h1 { font-size: 30px; }
  h2 { font-size: 22px; margin-top: 8px; }
  h3 { font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #6F554A; }
  .sub { color: #6F554A; margin: 4px 0 0; }
  header { border-bottom: 2px solid #A93C28; padding-bottom: 12px; margin-bottom: 8px; }
  section { padding: 12px 0 18px; border-bottom: 1px solid #DAC7B6; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #6F554A; border-bottom: 1px solid #DAC7B6; padding: 4px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #F4E7D6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .win { color: #2E624F; font-weight: 600; }
  .loss { color: #9D2925; font-weight: 600; }
  .muted { color: #7E6759; }
  .award { font-weight: 600; color: #A93C28; white-space: nowrap; }
  footer { margin-top: 16px; color: #7E6759; font-size: 10px; }
</style></head>
<body>
  <header>
    <h1>${esc(r.club)}</h1>
    <p class="sub">Season report · ${esc(r.season)}</p>
  </header>
  ${squads || '<p class="muted">No teams to report on.</p>'}
  <footer>Made with Team Sheet · ${esc(new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))} · Form: about 0.5 means holding your own.</footer>
</body></html>`;
}
