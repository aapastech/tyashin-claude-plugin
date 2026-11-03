// Code mode: read the site folder the assistant wrote, and check it locally
// against the Tyashin authoring contract BEFORE upload. Mirrors the platform's
// own gates (upload allowlist + static preflight) so problems surface here,
// in the conversation, not as a rejected upload.
//
// Reads only inside the folder it is given; never follows symlinks; skips
// node_modules and build output.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { factsGuard } from './spec-check.mjs';
import { lintSiteCopy } from './humanizer-lint.mjs';

export const ALLOWED_PREFIXES = ['src/', 'public/', 'content/', 'docs/'];
export const ALLOWED_ROOT_FILES = ['tailwind.config.ts', 'README.md'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.open-next', '.wrangler', '.git', '.vercel']);
const TEXT_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'json', 'md', 'mdx', 'txt', 'svg', 'xml', 'html', 'webmanifest']);
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp4', 'webm']);
export const LIMITS = { maxFiles: 600, maxFileBytes: 2 * 1024 * 1024, maxTotalBytes: 15 * 1024 * 1024 };
const PLATFORM_PATHS = new Set(['/blog', '/sitemap.xml', '/robots.txt', '/sitemap-pages.xml', '/feed', '/rss.xml']);

/** Collect uploadable files: [{ path, content, encoding, bytes }]. */
export async function collectSiteFiles(root) {
  const abs = path.resolve(root);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Not a folder: ${root}`);
  const out = [];
  const skipped = [];
  async function walk(rel) {
    for (const e of await fs.readdir(path.join(abs, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) {
        skipped.push(`${r} (symlink)`);
        continue;
      }
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await walk(r);
        continue;
      }
      if (!e.isFile()) continue;
      const allowed = ALLOWED_PREFIXES.some((p) => r.startsWith(p)) || ALLOWED_ROOT_FILES.includes(r);
      if (!allowed || e.name.startsWith('.')) {
        if (!rel) continue; // root-level platform files (package.json etc.) are expected locally
        skipped.push(r);
        continue;
      }
      const ext = (e.name.split('.').pop() || '').toLowerCase();
      const buf = await fs.readFile(path.join(abs, r));
      if (TEXT_EXT.has(ext)) out.push({ path: r, content: buf.toString('utf8'), encoding: 'utf8', bytes: buf.length });
      else if (BINARY_EXT.has(ext) && r.startsWith('public/'))
        out.push({ path: r, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length });
      else skipped.push(`${r} (file type not allowed here)`);
    }
  }
  await walk('');
  return { files: out, skipped };
}

/**
 * Route directories that have child pages, e.g. "/insights" when
 * src/app/insights/[slug]/page.tsx or src/app/insights/foo/page.tsx exists.
 * The directory itself must be dynamic-free. Links built from data
 * (`/insights/${p.slug}`) are valid when their static prefix is one of these.
 */
function parentDirsOf(files) {
  const out = new Set();
  for (const f of files) {
    const m = f.path.match(/^src\/app\/(.*)page\.tsx$/);
    if (!m) continue;
    const segs = m[1].split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
    if (segs.length < 2) continue;
    const parent = segs.slice(0, -1);
    if (parent.some((s) => s.startsWith('['))) continue;
    out.add(`/${parent.join('/')}`);
  }
  return out;
}

// Files that list every page on purpose (sitemap data); they are not links a visitor can follow.
const ROUTE_LIST_FILE = /(^|\/)(site-routes\.[jt]sx?|sitemap[^/]*|route\.[jt]s)$/;

function routeOf(rel) {
  const m = rel.match(/^src\/app\/(.*)page\.tsx$/);
  if (!m) return null;
  const segs = m[1].split('/').filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
  if (segs.some((s) => s.startsWith('['))) return null; // dynamic
  return `/${segs.join('/')}`.replace(/\/$/, '') || '/';
}

/** Visible copy in a TSX/JSON/MD file: JSX text, multi-word string literals, JSON string values, markdown lines. */
function copyOf(file) {
  const out = [];
  if (file.path.endsWith('.json')) {
    try {
      const walk = (v, at) => {
        if (typeof v === 'string') out.push([`${file.path}:${at}`, v]);
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
      };
      walk(JSON.parse(file.content), '');
    } catch {
      /* invalid JSON is a build problem, not a facts problem */
    }
    return out;
  }
  if (/\.(md|mdx|txt)$/.test(file.path)) {
    if (/ASSET-DEBT/i.test(file.path)) return out; // the to-do list may name what is missing
    file.content.split('\n').forEach((l, i) => l.trim() && out.push([`${file.path}:${i + 1}`, l]));
    return out;
  }
  if (!/\.(tsx|ts|jsx|js)$/.test(file.path)) return out;
  const lineAt = (idx) => file.content.slice(0, idx).split('\n').length;
  // JSX text between tags, which often spans several lines.
  for (const m of file.content.matchAll(/>([^<>{}]*[A-Za-z0-9][^<>{}]*)</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && !/^[=&|?:]/.test(t)) out.push([`${file.path}:${lineAt(m.index)}`, t]);
  }
  const lines = file.content.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(import|export \* from)\b/.test(line)) return;
    for (const m of line.matchAll(/(['"`])((?:(?!\1).){3,})\1/g)) {
      const v = m[2];
      if (/\s/.test(v.trim()) && !/^[\w-]+(\s+[\w:/[\].%-]+)+$/.test(v) && !/className|class=/.test(line.slice(0, m.index)))
        out.push([`${file.path}:${i + 1}`, v]);
      else if (/^(tel:|mailto:|https?:\/\/)/.test(v)) out.push([`${file.path}:${i + 1}`, v]);
    }
  });
  return out;
}

/**
 * @returns {{ ok, errors, warnings, summary }}
 */
export function checkSiteFiles(files, intake = {}, confirmedFacts = []) {
  const errors = [];
  const warnings = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const total = files.reduce((n, f) => n + f.bytes, 0);

  if (files.length > LIMITS.maxFiles) errors.push(`${files.length} files (max ${LIMITS.maxFiles})`);
  if (total > LIMITS.maxTotalBytes) errors.push(`site is ${total} bytes (max ${LIMITS.maxTotalBytes})`);
  for (const f of files) if (f.bytes > LIMITS.maxFileBytes) errors.push(`${f.path}: ${f.bytes} bytes (max ${LIMITS.maxFileBytes})`);

  for (const req of ['src/app/layout.tsx', 'src/app/page.tsx', 'src/app/globals.css', 'src/app/privacy/page.tsx', 'src/app/terms/page.tsx', 'src/app/contact/page.tsx', 'tailwind.config.ts'])
    if (!byPath.has(req)) errors.push(`${req} is required`);
  for (const rec of ['src/lib/seo.ts', 'src/app/sitemap-pages.xml/route.ts', 'src/lib/site-routes.ts', 'docs/ASSET-DEBT.md'])
    if (!byPath.has(rec)) warnings.push(`${rec} is missing (see the authoring contract)`);

  const css = byPath.get('src/app/globals.css')?.content ?? '';
  if (css && !/^\s*@import\s+["']tailwindcss["'];\s*\n\s*@config\s+["']\.\.\/\.\.\/tailwind\.config\.ts["'];/.test(css))
    errors.push('src/app/globals.css must start with @import "tailwindcss"; then @config "../../tailwind.config.ts";');
  if (/(^|[\s}])\:root\s*\{[^}]*--brand-/m.test(css) && !/html:root\s*\{[^}]*--brand-/.test(css))
    errors.push('globals.css: declare --brand-* on html:root, not :root — the platform inlines a default :root brand block that would override yours');
  if (/oklch\(var\(|hsl\(var\(/.test(css))
    warnings.push('globals.css wraps a variable in oklch()/hsl(); keep --brand-* values as hex (alpha modifiers break otherwise)');

  if (byPath.has('src/app/sitemap.ts') || byPath.has('src/app/robots.ts'))
    errors.push('do not create src/app/sitemap.ts or robots.ts — Tyashin serves /sitemap.xml and /robots.txt; publish /sitemap-pages.xml instead');

  const routes = new Set(files.map((f) => routeOf(f.path)).filter(Boolean));
  const parentDirs = parentDirsOf(files);
  const linked = new Set();
  const checkInternal = (where, href, kind) => {
    const p = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
    linked.add(p);
    if (!routes.has(p) && !PLATFORM_PATHS.has(p) && !p.startsWith('/blog/') && !/\.\w+$/.test(p))
      errors.push(`${where}: ${kind} to "${p}" but no src/app${p === '/' ? '' : p}/page.tsx exists`);
  };
  /** A link built from data, e.g. `/insights/${p.slug}`: valid when its static prefix is a route directory with pages under it. */
  const checkTemplate = (where, href) => {
    const prefix = href.slice(0, href.indexOf('${'));
    if (!prefix.startsWith('/') || prefix.startsWith('//')) return; // external or fully computed: not ours to judge
    const dir = prefix.replace(/\/+$/, '');
    if (prefix.endsWith('/') && parentDirs.has(dir)) {
      // Every page directly under that directory is reachable through this link.
      for (const r of routes) if (r.startsWith(`${dir}/`) && !r.slice(dir.length + 1).includes('/')) linked.add(r);
      return;
    }
    errors.push(`${where}: link built from data href={\`${href}\`} — no pages exist under src/app${dir || ''}/ for it to open`);
  };
  let poweredBy = false;
  let leadForm = false;
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f.path)) continue;
    const c = f.content;
    for (const m of c.matchAll(/href=\{?\s*(["'`])([^"'`]*)\1/g)) {
      const href = m[2].trim();
      if (m[1] === '`' && href.includes('${')) checkTemplate(f.path, href);
      else if (href === '' || href === '#' || /^javascript:/i.test(href))
        errors.push(`${f.path}: ghost link href="${href}" — every link must open a real page`);
      else if (href.startsWith('/') && !href.startsWith('//')) checkInternal(f.path, href, 'link');
    }
    // Links kept in data: nav/footer config arrays ({ href: '/about' }) and route lists ({ path: '/products/x' }).
    if (/\.(tsx|ts)$/.test(f.path) && !ROUTE_LIST_FILE.test(f.path)) {
      for (const m of c.matchAll(/\b(href|path)\s*:\s*(["'`])([^"'`]*)\2/g)) {
        const [, key, quote, raw] = m;
        const v = raw.trim();
        if (quote === '`' && v.includes('${')) {
          if (key === 'href') checkTemplate(f.path, v);
          continue;
        }
        if (key === 'href' && (v === '' || v === '#' || /^javascript:/i.test(v)))
          errors.push(`${f.path}: ghost link href: "${v}" — every link must open a real page`);
        else if (v.startsWith('/') && !v.startsWith('//') && !/\s/.test(v)) {
          if (key === 'href') checkInternal(f.path, v, 'link');
          else {
            // A page naming its own path (pageMetadata({ path: '/about' })) is not an inbound link.
            const target = v.split(/[?#]/)[0].replace(/\/$/, '') || '/';
            if (target !== routeOf(f.path)) linked.add(target);
          }
        }
      }
    }
    if (/googletagmanager|gtag\(|fbq\(|@sentry\/|hotjar|clarity\.ms|window\.onerror/.test(c))
      errors.push(`${f.path}: analytics/tracking/error-reporting code — Tyashin injects its own; remove it`);
    if (f.path === 'src/app/layout.tsx' && /<script(?![^>]*application\/ld\+json)[^>]*>/.test(c))
      errors.push('src/app/layout.tsx: inline <script> in the layout breaks hydration with the platform scripts — remove it');
    if (/Powered by|Built on|Made with/.test(c) && /https:\/\/tyashin\.com/.test(c)) poweredBy = true;
    if (/contact\/public\/submit/.test(c)) leadForm = true;
  }
  for (const r of routes) {
    if (r !== '/' && !linked.has(r)) errors.push(`page "${r}" has no inbound link (add it to the header, footer or a related section)`);
  }
  if (!poweredBy) errors.push('footer must end with "Powered by Tyashin" linking to https://tyashin.com');
  if (!leadForm) warnings.push('no contact form posts to /api/v1/contact/public/submit — leads will not reach the owner’s dashboard');

  const copy = files.flatMap(copyOf);
  errors.push(...factsGuard(copy, intake, confirmedFacts).errors);
  const slop = lintSiteCopy(copy);
  errors.push(...slop.errors);
  warnings.push(...slop.warnings);
  if (intake.businessName && !files.some((f) => f.content?.includes(intake.businessName)))
    errors.push(`the business name "${intake.businessName}" does not appear anywhere in the site`);

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    summary: { files: files.length, bytes: total, pages: [...routes].sort() },
  };
}
