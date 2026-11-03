// Code mode: the owner's own Claude writes the whole site; the plugin checks
// and uploads it. The platform builds it in an isolated environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSiteFiles, checkSiteFiles } from '../mcp/code-check.mjs';
import { openInBrowser } from '../mcp/tools.mjs';
import { createServer } from '../mcp/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, 'fixtures', 'code-site');
const intake = JSON.parse(readFileSync(path.join(here, 'fixtures', 'example-intake.json'), 'utf8'));
const copySite = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'code-site-'));
  cpSync(SITE, dir, { recursive: true });
  return dir;
};

test('the fixture site (written to the contract) passes clean', async () => {
  const { files } = await collectSiteFiles(SITE);
  const r = checkSiteFiles(files, intake);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.summary.pages, ['/', '/about', '/contact', '/privacy', '/terms']);
});

test('collect: skips node_modules, build output, symlinks and local platform files', async () => {
  const dir = copySite();
  writeFileSync(path.join(dir, 'package.json'), '{}');
  cpSync(path.join(dir, 'src'), path.join(dir, 'node_modules', 'x'), { recursive: true });
  symlinkSync('/etc/hosts', path.join(dir, 'src', 'hosts.ts'));
  const { files, skipped } = await collectSiteFiles(dir);
  assert.ok(!files.some((f) => f.path.includes('node_modules') || f.path === 'package.json'));
  assert.ok(skipped.some((s) => s.includes('hosts.ts')));
});

test('catches invented facts, ghost links, dead links, trackers, missing credit and plain :root tokens', async () => {
  const dir = copySite();
  const page = path.join(dir, 'src/app/about/page.tsx');
  writeFileSync(
    page,
    readFileSync(page, 'utf8')
      .replace('Every piece starts', 'Trusted by 500+ families since 1998. Every piece starts')
      .replace('href="/contact"', 'href="/portfolio"') + '\nexport const x = <a href="#">Soon</a>;\n'
  );
  const layout = path.join(dir, 'src/app/layout.tsx');
  writeFileSync(layout, readFileSync(layout, 'utf8').replace('<Header />', '<Header /><script>gtag("js")</script>'));
  const footer = path.join(dir, 'src/components/Footer.tsx');
  writeFileSync(footer, readFileSync(footer, 'utf8').replace('Powered by', 'Site by'));
  const css = path.join(dir, 'src/app/globals.css');
  writeFileSync(css, readFileSync(css, 'utf8').replace('html:root {', ':root {'));
  const { files } = await collectSiteFiles(dir);
  const r = checkSiteFiles(files, intake);
  const has = (s) => assert.ok(r.errors.some((e) => e.includes(s)), `missing error: ${s}\n${r.errors.join('\n')}`);
  has('"500+"');
  has('"1998"');
  has('ghost link href="#"');
  has('link to "/portfolio"');
  has('analytics/tracking');
  has('inline <script>');
  has('Powered by Tyashin');
  has('html:root');
});

test('the browser opener only ever opens https Tyashin (or localhost) URLs', () => {
  const opened = [];
  const run = (cmd, args) => {
    opened.push(args.at(-1));
    return { on() {}, unref() {} };
  };
  assert.equal(openInBrowser('https://admin.tyashin.com/device?code=ABCD-EFGH', {}, run), true);
  assert.equal(openInBrowser('http://localhost:5173/device', {}, run), true);
  assert.equal(openInBrowser('https://evil.example/device', {}, run), false);
  assert.equal(openInBrowser('file:///etc/passwd', {}, run), false);
  assert.equal(openInBrowser('https://admin.tyashin.com/device', { TYASHIN_NO_BROWSER: '1' }, run), false);
  assert.deepEqual(opened, ['https://admin.tyashin.com/device?code=ABCD-EFGH', 'http://localhost:5173/device']);
});

test('upload: refuses without approval or with errors; sends only site files; returns the connect-domain link at the end', async () => {
  const TOKEN = 'tya_pat_x';
  const calls = [];
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const p = new URL(url).pathname.replace(/^\/api\/v1/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ p, body });
    if (p === '/projects/p1/website/uploads') return json(202, { success: true, data: { id: 'r9', phase: 'queued' } });
    if (p.startsWith('/projects/p1/website/runs/r9/events'))
      return json(200, { success: true, data: { events: [], lastSeq: 3, run: { phase: 'done', phaseLabel: 'live', progress: 100, siteUrl: 'https://hp.sites.tyashin.com' } } });
    if (p === '/authoring/starter') return json(200, { success: true, data: { files: { 'package.json': '{"name":"x"}', '../evil': 'x' } } });
    return json(404, { success: false, error: { code: 'NOT_FOUND', message: p } });
  };
  const server = createServer({
    env: { TYASHIN_API_URL: 'https://api.test', TYASHIN_TOKEN: TOKEN, TYASHIN_CONFIG_DIR: os.tmpdir() },
    fetchImpl,
    sleep: async () => {},
    opener: () => false,
  });
  const call = async (name, args) => {
    const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    return { isError: Boolean(res.result.isError), payload: JSON.parse(res.result.content[0].text) };
  };

  const dir = copySite();
  const starter = await call('tyashin_starter_files', { dir });
  assert.deepEqual(starter.payload.written, ['package.json']);

  const notApproved = await call('tyashin_upload_site', { projectId: 'p1', dir, intake, userApproved: false });
  assert.equal(notApproved.isError, true);

  const bad = copySite();
  writeFileSync(path.join(bad, 'src/app/terms/page.tsx'), 'export default function T(){return <a href="#">x</a>}\n');
  const refused = await call('tyashin_upload_site', { projectId: 'p1', dir: bad, intake, userApproved: true });
  assert.equal(refused.isError, true);
  assert.equal(calls.filter((c) => c.p.endsWith('/uploads')).length, 0);

  const ok = await call('tyashin_upload_site', { projectId: 'p1', dir, intake, userApproved: true });
  assert.equal(ok.payload.runId, 'r9');
  const sent = calls.find((c) => c.p.endsWith('/uploads')).body;
  assert.ok(sent.files.every((f) => /^(src|public|content|docs)\/|^tailwind\.config\.ts$|^README\.md$/.test(f.path)));
  assert.ok(!sent.files.some((f) => f.path === 'package.json'));
  assert.equal(sent.confirmReplace, false);

  const done = await call('tyashin_build_status', { projectId: 'p1', runId: 'r9' });
  assert.equal(done.payload.siteUrl, 'https://hp.sites.tyashin.com');
  assert.match(done.payload.connectDomainUrl, /^https:\/\/admin\.tyashin\.com\/projects\/p1\?tab=domains/);
});

test('humanizer: AI-sounding copy in the site code is refused', async () => {
  const dir = copySite();
  const page = path.join(dir, 'src/app/about/page.tsx');
  writeFileSync(
    page,
    readFileSync(page, 'utf8').replace(
      'Every piece starts with a visit and a tape measure.',
      'In today’s fast-paced world, our meticulous craft is a testament to quality.'
    )
  );
  const { files } = await collectSiteFiles(dir);
  const r = checkSiteFiles(files, intake);
  assert.ok(r.errors.some((e) => e.startsWith('AI-SOUNDING COPY')), r.errors.join('\n'));
});

// ── Links built from data (finding 4) ──────────────────────────────────
const addFile = (dir, rel, content) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), content);
};

test('links from data: template-literal hrefs into a route directory and config-array hrefs/paths count as links', async () => {
  const dir = copySite();
  // /insights/<slug> pages, linked only through a template literal built from data.
  addFile(dir, 'src/app/insights/page.tsx', "export default function I(){return <p>Notes</p>}\n");
  addFile(dir, 'src/app/insights/first-note/page.tsx', "export default function A(){return <p>One</p>}\n");
  addFile(dir, 'src/app/insights/second-note/page.tsx', "export default function B(){return <p>Two</p>}\n");
  addFile(
    dir,
    'src/components/InsightList.tsx',
    "import Link from 'next/link';\nconst posts = [{ slug: 'first-note' }, { slug: 'second-note' }];\n" +
      'export function InsightList(){return <ul>{posts.map((p) => <li key={p.slug}><Link href={`/insights/${p.slug}`}>Read</Link></li>)}</ul>}\n'
  );
  // /insights and /products/oak-wardrobes, linked only from config arrays.
  addFile(dir, 'src/app/products/oak-wardrobes/page.tsx', "export default function W(){return <p>Wardrobes</p>}\n");
  addFile(
    dir,
    'src/config/nav.ts',
    "export const nav = [\n  { href: '/insights', label: 'Insights' },\n  { label: 'Wardrobes', path: '/products/oak-wardrobes' },\n];\n"
  );
  const { files } = await collectSiteFiles(dir);
  const r = checkSiteFiles(files, intake);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.summary.pages.includes('/insights/first-note'));
});

test('links from data: real ghost links, dead config links and templates into no route still fail', async () => {
  const dir = copySite();
  addFile(
    dir,
    'src/components/Bad.tsx',
    "export const nav = [{ href: '#', label: 'Soon' }, { href: '/portfolio', label: 'Work' }];\n" +
      'export function Bad({ s }: { s: string }){return <><a href="#">x</a><a href={`/case-studies/${s}`}>y</a></>}\n'
  );
  const { files } = await collectSiteFiles(dir);
  const r = checkSiteFiles(files, intake);
  const has = (s) => assert.ok(r.errors.some((e) => e.includes(s)), `missing error: ${s}\n${r.errors.join('\n')}`);
  has('ghost link href: "#"');
  has('ghost link href="#"');
  has('link to "/portfolio"');
  has('href={`/case-studies/${s}`}');
});

test('orphans: a page listed only in site-routes or naming its own path in metadata is still an orphan', async () => {
  const dir = copySite();
  addFile(
    dir,
    'src/app/services/page.tsx',
    "import { pageMetadata } from '@/lib/seo';\nexport const metadata = pageMetadata({ description: 'Services', path: '/services' });\nexport default function S(){return <p>Services</p>}\n"
  );
  const routesFile = path.join(dir, 'src/lib/site-routes.ts');
  writeFileSync(routesFile, readFileSync(routesFile, 'utf8').replace("{ path: '/terms'", "{ path: '/services', priority: 0.5 },\n    { path: '/terms'"));
  const { files } = await collectSiteFiles(dir);
  const r = checkSiteFiles(files, intake);
  assert.ok(r.errors.some((e) => e.includes('page "/services" has no inbound link')), r.errors.join('\n'));
});

// ── Facts guard false positives (finding 5) ────────────────────────────
test('facts guard in code: statute years and a cookie max-age pass; invented phone and price in copy still fail', async () => {
  const dir = copySite();
  addFile(
    dir,
    'src/app/privacy/page.tsx',
    readFileSync(path.join(dir, 'src/app/privacy/page.tsx'), 'utf8') +
      '\nexport const Law = () => <p>We follow the Information Technology Rules, 2021, the Digital Personal Data Protection Act, 2023 and the IT Act 2000.</p>;\n'
  );
  addFile(
    dir,
    'src/lib/region.ts',
    "export function setRegion(r: string) {\n  document.cookie = `aap_region=${r}; path=/; max-age=31536000; SameSite=Lax`;\n}\n"
  );
  let { files } = await collectSiteFiles(dir);
  let r = checkSiteFiles(files, intake);
  assert.equal(r.ok, true, r.errors.join('\n'));

  addFile(dir, 'src/components/Promo.tsx', 'export const Promo = () => <p>Call 0117 496 9999 today. Wardrobes from £1,450 since 2019.</p>;\n');
  ({ files } = await collectSiteFiles(dir));
  r = checkSiteFiles(files, intake);
  const has = (s) => assert.ok(r.errors.some((e) => e.includes(s)), `missing error: ${s}\n${r.errors.join('\n')}`);
  has('0117 496 9999');
  has('£1,450');
  has('"2019"');
});

// ── Honest message when code uploads are off (finding 2) ───────────────
test('upload: CODE_UPLOADS_DISABLED keeps the folder and does not send the owner to the spec path', async () => {
  const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  const server = createServer({
    env: { TYASHIN_API_URL: 'https://api.test', TYASHIN_TOKEN: 'tya_pat_x', TYASHIN_CONFIG_DIR: os.tmpdir() },
    fetchImpl: async () => json(403, { success: false, error: { code: 'CODE_UPLOADS_DISABLED', message: 'off' } }),
    sleep: async () => {},
    opener: () => false,
  });
  const dir = copySite();
  const res = await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'tyashin_upload_site', arguments: { projectId: 'p1', dir, intake, userApproved: true } },
  });
  assert.equal(res.result.isError, true);
  const payload = JSON.parse(res.result.content[0].text);
  assert.match(payload.error, /not switched on publishing from Claude/);
  assert.match(payload.error, /folder is kept/);
  assert.doesNotMatch(payload.error, /tyashin_publish_site|design-spec|spec path/i);
  assert.equal(payload.dir, dir);
  assert.equal(payload.published, false);
});

test('a 429 from Tyashin comes back as a clear "nothing was published, try again in N minutes"', async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', retryAfter: 190, resetAt: '2026-11-03T04:02:34.000Z' } }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    );
  const server = createServer({
    env: { TYASHIN_API_URL: 'https://api.test', TYASHIN_TOKEN: 'tya_pat_x', TYASHIN_CONFIG_DIR: os.tmpdir() },
    fetchImpl,
    sleep: async () => {},
    opener: () => false,
  });
  const res = await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'tyashin_upload_site', arguments: { projectId: 'p1', dir: copySite(), intake, userApproved: true } },
  });
  const payload = JSON.parse(res.result.content[0].text);
  assert.equal(res.result.isError, true);
  assert.match(payload.error, /Nothing was published.*4 minute/);
  assert.equal(payload.retryAfterSeconds, 190);
});
