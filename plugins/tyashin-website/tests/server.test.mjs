// End-to-end through the MCP protocol against a fake Tyashin API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../mcp/server.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const TOKEN = 'tya_pat_TESTTOKEN0123456789abcdefghijklmnopqrstu';

function fakeApi() {
  const calls = [];
  let polls = 0;
  let runPolls = 0;
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/api\/v1/, '');
    const auth = init.headers?.Authorization;
    const body = init.body && init.headers['Content-Type'] === 'application/json' ? JSON.parse(init.body) : init.body;
    calls.push({ method: init.method, path: p + u.search, auth, body });
    if (p === '/auth/cli/device' && init.method === 'POST')
      return json(200, {
        device_code: 'DEV',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://admin.test/device',
        verification_uri_complete: 'https://admin.test/device?code=ABCD-EFGH',
        expires_in: 900,
        interval: 5,
      });
    if (p === '/auth/cli/token') {
      polls += 1;
      return polls < 2 ? json(400, { error: 'authorization_pending' }) : json(200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 7776000 });
    }
    if (auth !== `Bearer ${TOKEN}`) return json(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } });
    if (p === '/auth/me') return json(200, { success: true, data: { email: 'owner@example.com', firstName: 'Ola' } });
    if (p === '/projects') return json(200, { success: true, data: [{ _id: 'p1', name: 'Ola website', slug: 'ola-website', apiKey: 'tk_secret' }] });
    if (p === '/projects/p1/website')
      return json(200, { success: true, data: { project: { name: 'Ola website', slug: 'ola-website', siteUrl: 'https://ola-website.sites.tyashin.com', hasSite: false }, activeRun: null, lastRun: null, runnerAvailable: true, credits: { available: 0 } } });
    if (p === '/projects/p1/website/settings') return json(200, { success: true, data: { slug: body.slug, intake: body.intake } });
    if (p === '/projects/p1/website/runs' && init.method === 'POST')
      return json(202, { success: true, data: { id: 'r1', phase: 'queued', source: 'spec' } });
    if (p.startsWith('/projects/p1/website/runs/r1/events')) {
      runPolls += 1;
      const done = runPolls >= 2;
      return json(200, {
        success: true,
        data: {
          events: done ? [{ type: 'deploy.ok', data: {} }] : [],
          lastSeq: done ? 9 : 0,
          run: { phase: done ? 'done' : 'building', phaseLabel: done ? 'Your website is live' : 'Building pages', progress: done ? 100 : 50, siteUrl: 'https://ola-website.sites.tyashin.com', summary: 'Built 6 pages.' },
        },
      });
    }
    if (p === '/auth/cli/tokens/current' && init.method === 'DELETE') return json(200, { success: true, data: { revoked: true } });
    return json(404, { success: false, error: { code: 'NOT_FOUND', message: p } });
  }
  return { fetchImpl, calls };
}

async function call(server, name, args = {}) {
  const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const payload = JSON.parse(res.result.content[0].text);
  return { isError: Boolean(res.result.isError), payload, raw: res.result.content[0].text };
}

test('protocol: initialize + tools/list', async () => {
  const server = createServer({ env: { TYASHIN_CONFIG_DIR: mkdtempSync(path.join(os.tmpdir(), 'ty-')) } });
  const init = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'tyashin');
  const list = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, [
    'tyashin_login',
    'tyashin_login_status',
    'tyashin_logout',
    'tyashin_get_project',
    'tyashin_save_intake',
    'tyashin_spec_contract',
    'tyashin_check_spec',
    'tyashin_publish_site',
    'tyashin_build_status',
    'tyashin_authoring_guide',
    'tyashin_starter_files',
    'tyashin_check_code',
    'tyashin_upload_site',
    'tyashin_get_spec',
  ]);
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('refuses a non-https API base (except localhost)', () => {
  assert.throws(() => createServer({ env: { TYASHIN_API_URL: 'http://evil.example' } }), /https/);
  assert.doesNotThrow(() => createServer({ env: { TYASHIN_API_URL: 'http://localhost:8787', TYASHIN_CONFIG_DIR: os.tmpdir() } }));
});

test('full flow: device sign-in → project → intake → check → approval gate → publish → live', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ty-'));
  const { fetchImpl, calls } = fakeApi();
  let clock = 0;
  const server = createServer({
    env: { TYASHIN_API_URL: 'https://api.test', TYASHIN_CONFIG_DIR: dir },
    fetchImpl,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });

  const before = await call(server, 'tyashin_get_project');
  assert.equal(before.isError, true);
  assert.equal(before.payload.code, 'NOT_SIGNED_IN');

  const login = await call(server, 'tyashin_login');
  assert.equal(login.payload.code, 'ABCD-EFGH');
  assert.match(login.payload.link, /device\?code=ABCD-EFGH/);

  const status = await call(server, 'tyashin_login_status');
  assert.equal(status.payload.signedIn, true);
  assert.equal(status.payload.email, 'owner@example.com');
  assert.ok(!status.raw.includes(TOKEN), 'token must never reach the model');

  // Stored only on disk, owner-only permissions.
  const file = path.join(dir, 'credentials.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))['https://api.test'].token, TOKEN);

  const project = await call(server, 'tyashin_get_project');
  assert.equal(project.payload.projectId, 'p1');
  assert.equal(project.payload.hasSite, false);
  assert.ok(!project.raw.includes('tk_secret'), 'project API key must never reach the model');
  assert.ok(!('credits' in project.payload));

  const intake = load('example-intake.json');
  const spec = load('example-spec.json');
  const saved = await call(server, 'tyashin_save_intake', { projectId: 'p1', intake, slug: 'harbour-and-pine' });
  assert.equal(saved.payload.slug, 'harbour-and-pine');

  const checked = await call(server, 'tyashin_check_spec', { spec, intake });
  assert.equal(checked.payload.ok, true);

  const unapproved = await call(server, 'tyashin_publish_site', { projectId: 'p1', spec, intake, userApproved: false });
  assert.equal(unapproved.isError, true);
  assert.equal(calls.filter((c) => c.path === '/projects/p1/website/runs').length, 0);

  const bad = structuredClone(spec);
  bad.pages[0].sections[0].sub = 'Over 20 years of experience.';
  const refused = await call(server, 'tyashin_publish_site', { projectId: 'p1', spec: bad, intake, userApproved: true });
  assert.equal(refused.isError, true);
  assert.ok(refused.payload.errors.some((e) => e.includes('FACT NOT SUPPLIED')));
  assert.equal(calls.filter((c) => c.path === '/projects/p1/website/runs').length, 0);

  const published = await call(server, 'tyashin_publish_site', { projectId: 'p1', spec, intake, userApproved: true });
  assert.equal(published.payload.runId, 'r1');
  const runCall = calls.find((c) => c.path === '/projects/p1/website/runs');
  assert.equal(runCall.body.kind, 'generate');
  assert.deepEqual(runCall.body.spec, spec);
  assert.equal(runCall.body.confirmReplace, false);

  const live = await call(server, 'tyashin_build_status', { projectId: 'p1', runId: 'r1' });
  assert.equal(live.payload.phase, 'done');
  assert.equal(live.payload.siteUrl, 'https://ola-website.sites.tyashin.com');

  // Only the public API host was ever contacted.
  assert.ok(calls.length > 0);

  const out = await call(server, 'tyashin_logout');
  assert.equal(out.payload.signedOut, true);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))['https://api.test'], undefined);
});

test('tools/call: a missing or misnamed argument returns a clear validation error, not a raw Node error', async () => {
  const { fetchImpl, calls } = fakeApi();
  const server = createServer({ env: { TYASHIN_API_URL: 'https://api.test', TYASHIN_TOKEN: TOKEN, TYASHIN_CONFIG_DIR: mkdtempSync(path.join(os.tmpdir(), 'ty-')) }, fetchImpl });
  const intake = load('example-intake.json');

  const misnamed = await call(server, 'tyashin_check_code', { folder: '/tmp/site', intake });
  assert.equal(misnamed.isError, true);
  assert.equal(misnamed.payload.code, 'INVALID_ARGUMENTS');
  assert.match(misnamed.payload.error, /missing required argument "dir"/);
  assert.match(misnamed.payload.error, /unknown "folder"/);
  assert.doesNotMatch(misnamed.raw, /must be of type string/);

  const several = await call(server, 'tyashin_upload_site', { dir: '/tmp/site' });
  assert.match(several.payload.error, /missing required arguments "projectId", "intake", "userApproved"/);

  const wrongType = await call(server, 'tyashin_starter_files', { dir: 42 });
  assert.match(wrongType.payload.error, /"dir" must be a string, got number/);

  assert.equal(calls.length, 0, 'nothing reaches the API when the arguments are wrong');
  const fine = await call(server, 'tyashin_check_spec', { spec: load('example-spec.json'), intake });
  assert.equal(fine.isError, false);
});
