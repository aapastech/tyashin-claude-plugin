// "Does this read like AI wrote it?" — the same rule table Tyashin uses for
// its own sites, exported into spec/site-spec.contract.json (`humanizer`), so
// this lint and the platform's cannot drift. Mirrors the platform's lintCopy:
// tiered pattern hits, at most one hit per span, and em dashes as a tell.

import { readFileSync } from 'node:fs';

const CONTRACT = JSON.parse(
  readFileSync(new URL('../spec/site-spec.contract.json', import.meta.url), 'utf8')
);

const RULES = (CONTRACT.humanizer?.rules ?? []).map((r) => ({
  ...r,
  patterns: r.patterns.map((p) => new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`)),
}));

export const HUMANIZER_BLOCK = CONTRACT.humanizer?.block ?? '';

/** @returns {{ words, hits: {rule,tier,match}[], needsRewrite: boolean }} */
export function lintCopy(text) {
  const prose = String(text ?? '');
  const words = (prose.match(/[A-Za-zÀ-ɏ]+(?:['’][a-z]+)?/g) || []).length;
  const hits = [];
  const taken = [];
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      re.lastIndex = 0;
      for (const m of prose.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (taken.some(([a, b]) => start < b && end > a)) continue;
        taken.push([start, end]);
        hits.push({ rule: rule.id, tier: rule.tier, match: m[0].trim().slice(0, 80) });
      }
    }
  }
  const emDashes = (prose.match(/—/g) || []).length;
  if (emDashes >= 2 && emDashes / Math.max(words, 1) > 1 / 250) hits.push({ rule: 'em-dash', tier: 2, match: `${emDashes} em dashes` });
  const tier1 = hits.filter((h) => h.tier === 1).length;
  const weighted = hits.reduce((n, h) => n + (h.tier === 1 ? 1 : h.tier === 2 ? 0.5 : 0.25), 0);
  const density = words ? (weighted / words) * 100 : 0;
  const needsRewrite =
    tier1 >= 2 || (tier1 >= 1 && words < 80) || (hits.length >= 2 && density >= 1.5) || hits.some((h) => h.rule === 'em-dash');
  return { words, hits, needsRewrite };
}

/**
 * Lint every copy string ([where, text] pairs) as one body of prose, the way
 * a reader meets the site. Returns errors when it needs a rewrite (the
 * platform's own bar), otherwise the individual hits as warnings.
 */
export function lintSiteCopy(entries) {
  const text = entries.map(([, t]) => t).join('\n');
  const report = lintCopy(text);
  const locate = (match) => entries.find(([, t]) => t.includes(match))?.[0] ?? 'copy';
  const lines = report.hits.map((h) =>
    h.rule === 'em-dash'
      ? `AI-SOUNDING COPY: ${h.match} across the site — rewrite them as commas, full stops or parentheses`
      : `AI-SOUNDING COPY at ${locate(h.match)}: "${h.match}" (${h.rule}) — rewrite it plainly`
  );
  return report.needsRewrite ? { errors: lines, warnings: [] } : { errors: [], warnings: lines };
}
