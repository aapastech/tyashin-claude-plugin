// Local checks on a site spec BEFORE it is sent to Tyashin.
//
// The platform's renderer "repairs rather than rejects": a bad colour becomes
// a default, an unknown link becomes /contact, a renamed business gets its
// real name back. That keeps a build from failing, but it also means a spec
// mistake ships silently. These checks catch the mistakes first, so the user
// sees and approves what is actually published:
//
//   1. structure — the exact JSON Schema the renderer was built for
//   2. platform rules — pages, nav, hero, links, legal pages, colours
//   3. FACTS GUARD — phone numbers, emails, links and numbers that appear in
//      the copy but were never supplied by the owner. Invented facts are the
//      one mistake a website must never make.
//   4. craft — copy budgets, clichés, contrast (warnings, not blockers)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lintSiteCopy } from './humanizer-lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT = JSON.parse(
  readFileSync(path.join(here, '..', 'spec', 'site-spec.contract.json'), 'utf8')
);

// ── 1. JSON Schema (the subset the exported contract uses) ─────────────

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

export function validateSchema(value, schema, at = '', out = []) {
  if (schema.const !== undefined && value !== schema.const) {
    out.push(`${at || '(root)'}: must be ${JSON.stringify(schema.const)}`);
    return out;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    out.push(`${at || '(root)'}: must be one of ${schema.enum.join(', ')}`);
    return out;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((s) => validateSchema(value, s, at, []).length === 0);
    if (matches.length !== 1) {
      const type = value && typeof value === 'object' ? value.type : undefined;
      const branch = schema.oneOf.find((s) => s.properties?.type?.const === type);
      if (branch) return validateSchema(value, branch, at, out);
      out.push(
        `${at || '(root)'}: unknown section type ${JSON.stringify(type)} (allowed: ${schema.oneOf
          .map((s) => s.properties?.type?.const)
          .filter(Boolean)
          .join(', ')})`
      );
    }
    return out;
  }
  if (schema.type) {
    const t = typeOf(value);
    const ok =
      schema.type === t ||
      (schema.type === 'number' && (t === 'integer' || t === 'number')) ||
      (Array.isArray(schema.type) && schema.type.includes(t));
    if (!ok) {
      out.push(`${at || '(root)'}: expected ${schema.type}, got ${t}`);
      return out;
    }
  }
  if (schema.type === 'object' && value && typeof value === 'object') {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) out.push(`${at ? `${at}.` : ''}${key}: required`);
    }
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) validateSchema(v, sub, at ? `${at}.${key}` : key, out);
      else if (schema.additionalProperties === false)
        out.push(`${at ? `${at}.` : ''}${key}: unknown field`);
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validateSchema(item, schema.items, `${at}[${i}]`, out));
  }
  return out;
}

// ── helpers ────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const LEGAL = new Set(['/privacy', '/terms']);

function normalisePath(p) {
  const cleaned = `/${String(p).trim().toLowerCase()}`
    .replace(/\/+/g, '/')
    .replace(/[^a-z0-9\-/]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/-|-\//g, '/')
    .replace(/\/$/, '');
  return cleaned || '/';
}

function digits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/** Every string in a value, with its JSON path. */
export function strings(value, at = '', out = []) {
  if (typeof value === 'string') out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) strings(v, at ? `${at}.${k}` : k, out);
  return out;
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const CLICHES = [
  'welcome to our website',
  'one-stop shop',
  'one stop shop',
  'go above and beyond',
  'cutting-edge',
  'cutting edge',
  'world-class',
  'second to none',
  'look no further',
];

/** Contact links the renderer will accept as CTA hrefs, derived from the intake (same as the platform). */
export function contactLinks(intake = {}) {
  const c = intake.contact ?? {};
  const d = (v) => String(v ?? '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const links = [];
  if (c.phone) links.push(`tel:${d(c.phone)}`);
  if (c.whatsapp) links.push(`https://wa.me/${d(c.whatsapp).replace(/^\+/, '')}`);
  if (c.email) links.push(`mailto:${c.email}`);
  return links;
}

/**
 * The facts guard, shared by the spec checker and the code-mode checker.
 * `entries` are [where, text] pairs of copy. Anything that reads as a hard
 * fact (phone, email, URL, money, %, "N+", years, counts) must trace back to
 * the intake or to a statement the owner made (confirmedFacts).
 */
const STATUTE_BEFORE = /\b(?:Act|Rules|Regulations|Code)\s*,?\s*$/;
const STRUCTURAL_URL = /^https?:\/\/(www\.)?(tyashin\.com|schema\.org|sitemaps\.org|w3\.org)(\/|$)/i;

export function factsGuard(entries, intake = {}, confirmedFacts = []) {
  const known = [...strings(intake).map(([, v]) => v), ...confirmedFacts.map(String)].join(' \n ');
  const knownDigits = new Set(
    [...known.matchAll(/\+?\d[\d\s().-]{5,}\d/g)].map((m) => digits(m[0])).filter((d) => d.length >= 7)
  );
  const knownLower = known.toLowerCase();
  const errors = [];
  const reported = new Set();
  const flag = (msg) => {
    if (!reported.has(msg)) {
      reported.add(msg);
      errors.push(msg);
    }
  };
  for (const [where, text] of entries) {
    for (const m of text.matchAll(/\+?\d[\d\s().-]{5,}\d/g)) {
      // A bare digit run assigned in code (max-age=31536000, timeout=8640000) is a value, not a phone.
      if (/^\d+$/.test(m[0]) && /[\w-]\s*=\s*$/.test(text.slice(0, m.index))) continue;
      const d = digits(m[0]);
      if (d.length >= 7 && ![...knownDigits].some((k) => k.endsWith(d) || d.endsWith(k)))
        flag(`FACT NOT SUPPLIED at ${where}: "${m[0].trim()}" looks like a phone number the owner never gave`);
    }
    for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]*\w/g)) {
      if (!knownLower.includes(m[0].toLowerCase()))
        flag(`FACT NOT SUPPLIED at ${where}: email "${m[0]}" was never given by the owner`);
    }
    for (const m of text.matchAll(/https?:\/\/[^\s"')`]+/g)) {
      const url = m[0];
      // Not claims about the business: the platform credit, schema/sitemap
      // namespaces, URLs built from code (template expressions), and WhatsApp
      // links to a number the owner gave.
      if (STRUCTURAL_URL.test(url) || url.includes('${')) continue;
      const wa = url.match(/^https:\/\/wa\.me\/(\d{7,})/);
      if (wa && [...knownDigits].some((k) => k.endsWith(wa[1]) || wa[1].endsWith(k))) continue;
      if (!knownLower.includes(url.toLowerCase()))
        flag(`FACT NOT SUPPLIED at ${where}: URL "${m[0]}" was never given by the owner`);
    }
    for (const m of text.matchAll(/(?:[$€£₹]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|\+|k\b|years?\b|yrs?\b|clients?\b|customers?\b|projects?\b)|\b(?:19|20)\d{2}\b)/gi)) {
      const token = m[0].trim();
      // The year in a law's name ("IT Rules, 2021", "DPDP Act, 2023", "Act 2000") is part of the name, not a claim.
      if (/^(?:19|20)\d{2}$/.test(token) && STATUTE_BEFORE.test(text.slice(0, m.index))) continue;
      const bare = token.replace(/[^\d.,]/g, '');
      if (!bare || knownLower.includes(token.toLowerCase()) || knownLower.includes(bare)) continue;
      flag(
        `FACT NOT SUPPLIED at ${where}: "${token}" is a number the owner never gave — remove it or confirm it with them (then pass it in confirmedFacts)`
      );
    }
  }
  return { errors, knownLower };
}

// ── 2–4. Rules ─────────────────────────────────────────────────────────

/**
 * @param spec            the site spec
 * @param intake          what the owner told us (the platform's intake shape)
 * @param confirmedFacts  extra statements the owner made verbatim (quotes, numbers, years)
 * @returns {{ ok: boolean, errors: string[], warnings: string[], summary: object }}
 */
export function checkSpec(spec, intake = {}, confirmedFacts = []) {
  const errors = validateSchema(spec, CONTRACT.schema);
  const warnings = [];
  if (errors.length) {
    return { ok: false, errors, warnings, summary: null };
  }

  // Business name is a fact: the platform overwrites any other name.
  if (!intake.businessName) {
    errors.push('intake.businessName: required — ask the owner for the exact business name');
  } else if (spec.brand.name.trim() !== intake.businessName.trim()) {
    errors.push(
      `brand.name "${spec.brand.name}" must equal the business name the owner gave ("${intake.businessName}")`
    );
  }

  for (const [k, v] of Object.entries(spec.design.palette)) {
    if (!HEX.test(v)) errors.push(`design.palette.${k}: "${v}" is not a #rrggbb colour`);
  }
  if (!errors.some((e) => e.startsWith('design.palette'))) {
    const p = spec.design.palette;
    const pairs = [
      ['onPrimary on primary (buttons)', p.onPrimary, p.primary, 4.5],
      ['foreground on background (body text)', p.foreground, p.background, 4.5],
      ['white text on ink (footer, dark sections)', '#ffffff', p.ink, 4.5],
    ];
    for (const [label, fg, bg, min] of pairs) {
      const ratio = contrast(fg, bg);
      if (ratio < min)
        errors.push(
          `contrast ${label} is ${ratio.toFixed(2)}:1 — needs at least ${min}:1 (WCAG AA)`
        );
    }
    if (p.ink.toLowerCase() === '#000000')
      warnings.push('design.palette.ink is pure black — use a dark colour that belongs to the brand');
  }

  // Pages
  const paths = spec.pages.map((pg) => normalisePath(pg.path));
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
  if (dupes.length) errors.push(`duplicate page paths: ${[...new Set(dupes)].join(', ')}`);
  for (const p of ['/', '/contact', '/privacy', '/terms']) {
    if (!paths.includes(p)) errors.push(`pages: "${p}" is required`);
  }
  if (spec.pages.length < 4 || spec.pages.length > 10)
    errors.push(`pages: ${spec.pages.length} pages — keep it between 4 and 10`);
  if (paths[0] !== '/') warnings.push('pages: put "/" first');
  const nav = spec.pages.filter((pg) => pg.inNav && !['/', ...LEGAL].includes(normalisePath(pg.path)));
  if (nav.length > 6) errors.push(`navigation has ${nav.length} pages — at most 6`);
  for (const pg of spec.pages) {
    if (pg.inNav && pg.label.trim().split(/\s+/).length > 2)
      warnings.push(`${pg.path}: nav label "${pg.label}" — keep labels to 2 words`);
  }

  // Sections
  const allowedHrefs = new Set([...paths, ...contactLinks(intake)]);
  const ownerUrls = new Set(
    [intake.existingWebsite, ...(intake.style?.references ?? [])].filter(Boolean)
  );
  let heroes = 0;
  const checkHref = (href, where) => {
    const h = String(href).trim();
    if (!h || h.startsWith('#')) {
      errors.push(`${where}: link "${h}" goes nowhere — every link must open a real page`);
      return;
    }
    if (allowedHrefs.has(h)) return;
    if (/^https:\/\//.test(h)) {
      if (!ownerUrls.has(h))
        errors.push(
          `${where}: link "${h}" was not supplied by the owner — use a page path or a contact link, or confirm the URL with the owner and add it to the intake`
        );
      return;
    }
    if (!allowedHrefs.has(normalisePath(h.split(/[#?]/)[0])))
      errors.push(`${where}: link "${h}" goes nowhere (allowed: ${[...allowedHrefs].join(', ')})`);
  };
  for (const pg of spec.pages) {
    const at = pg.path;
    if ((pg.title ?? '').length > 60) warnings.push(`${at}: title is ${pg.title.length} chars (≤ 60)`);
    const dl = (pg.description ?? '').length;
    if (dl < 120 || dl > 155) warnings.push(`${at}: description is ${dl} chars (aim for 120–155)`);
    if (!pg.sections.length) errors.push(`${at}: page has no sections`);
    pg.sections.forEach((s, i) => {
      const where = `${at} sections[${i}] (${s.type})`;
      if (s.type === 'custom')
        errors.push(
          `${where}: custom sections are not available when publishing from Claude — use kit sections`
        );
      if (s.type === 'hero') {
        heroes += 1;
        if (normalisePath(at) !== '/') errors.push(`${where}: only the home page has a hero; set "heading" instead`);
      }
      for (const key of ['primaryCta', 'secondaryCta']) if (s[key]) checkHref(s[key].href, `${where}.${key}`);
      if (s.type === 'features') for (const it of s.items) if (it.href) checkHref(it.href, where);
      if ('headline' in s && s.headline && s.headline.trim().split(/\s+/).length > 9)
        warnings.push(`${where}: headline has ${s.headline.trim().split(/\s+/).length} words (≤ 9)`);
      if (['stats', 'testimonials', 'gallery', 'faq'].includes(s.type) && !s.items?.length)
        errors.push(`${where}: empty section — remove it`);
    });
    const last = pg.sections[pg.sections.length - 1];
    if (!LEGAL.has(normalisePath(at)) && last && last.type !== 'cta')
      warnings.push(`${at}: end the page with a "cta" section`);
  }
  if (heroes !== 1) errors.push(`site has ${heroes} hero sections — exactly one, on "/"`);
  // Leads: the /contact page's contact section carries the enquiry form, so
  // messages reach the owner's Tyashin Leads inbox (the form is opt-in in the kit).
  const contactPage = spec.pages.find((pg) => normalisePath(pg.path) === '/contact');
  if (contactPage) {
    const cs = contactPage.sections.filter((s) => s.type === 'contact');
    if (!cs.length)
      errors.push('/contact: add a "contact" section with "form": true so enquiries reach the owner\'s Leads inbox');
    else if (!cs.some((s) => s.form === true))
      errors.push('/contact: set "form": true on the contact section so enquiries reach the owner\'s Leads inbox');
  }
  for (const col of spec.footer.columns) for (const l of col.links) checkHref(l.href, 'footer');
  if (spec.footer.columns.length > 3) warnings.push('footer: at most 3 columns are rendered');

  // ── FACTS GUARD ──
  const guard = factsGuard(
    strings(spec).filter(
      ([where]) =>
        !(where.startsWith('design.palette') || /\.href$/.test(where) || where.endsWith('.path'))
    ),
    intake,
    confirmedFacts
  );
  errors.push(...guard.errors);
  const knownLower = guard.knownLower;
  const reported = new Set(guard.errors);
  const flag = (msg) => {
    if (!reported.has(msg)) {
      reported.add(msg);
      errors.push(msg);
    }
  };
  for (const pg of spec.pages) {
    for (const s of pg.sections) {
      if (s.type === 'testimonials') {
        for (const t of s.items) {
          if (!knownLower.includes(t.quote.trim().toLowerCase().slice(0, 40)))
            flag(`FACT NOT SUPPLIED at ${pg.path} testimonials: the quote from "${t.name}" is not one the owner supplied — testimonials must be real, verbatim quotes`);
        }
      }
    }
  }

  // Copy must not read like AI wrote it (platform humanizer rules).
  const slop = lintSiteCopy(
    strings(spec).filter(
      ([where]) =>
        // Only what visitors read: not design notes, voice notes, asset debt or enums.
        !/^design\.|^brand\.voice|^assetDebt|\.(href|path|icon|variant|type|aspect|imageSide|brief)$|^seoKeywords/.test(where)
    )
  );
  errors.push(...slop.errors);
  warnings.push(...slop.warnings);

  // Craft
  for (const [where, text] of strings(spec)) {
    const lower = text.toLowerCase();
    for (const c of CLICHES) if (lower.includes(c)) warnings.push(`${where}: cliché "${c}"`);
  }

  const summary = {
    business: spec.brand.name,
    thesis: spec.design.thesis,
    palette: spec.design.palette,
    fonts: `${spec.design.headingFont} / ${spec.design.bodyFont}`,
    pages: spec.pages.map((pg) => `${normalisePath(pg.path)} — ${pg.label}`),
    sections: spec.pages.reduce((n, pg) => n + pg.sections.length, 0),
    assetDebt: spec.assetDebt.length,
  };
  return { ok: errors.length === 0, errors, warnings, summary };
}
