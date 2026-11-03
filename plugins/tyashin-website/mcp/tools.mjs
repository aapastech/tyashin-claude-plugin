// The tools Claude uses to build a Tyashin website for the user.
//
// Every call acts as the signed-in user, through the public API, with their
// own personal access token. Nothing here can spend money: the platform
// refuses tokens on billing routes, and a spec publish uses no AI credits.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ApiError } from './api.mjs';
import { checkSiteFiles, collectSiteFiles } from './code-check.mjs';
import { clearToken, loadToken, saveToken } from './credentials.mjs';
import { checkSpec, CONTRACT } from './spec-check.mjs';

const CLIENT_NAME = 'Claude — Tyashin website plugin';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'needs_credits']);

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function fail(message, extra) {
  return { isError: true, ...text(extra ? { error: message, ...extra } : { error: message }) };
}

/** Strip anything the model should never see or repeat. */
function redact(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => (/^(apiKey|token|access_token|accessToken|refreshToken)$/i.test(k) ? undefined : v))
  );
}

const intakeProps = {
  type: 'object',
  description:
    'What the OWNER told you, in their words. Never fill a field yourself. Omit anything they did not give.',
  properties: {
    businessName: { type: 'string', description: 'Exact business name as the owner writes it' },
    tagline: { type: 'string' },
    archetype: { type: 'string', enum: ['local-service', 'b2b-catalogue', 'marketing', 'ecommerce'] },
    industry: { type: 'string' },
    offerings: { type: 'string', description: 'What they sell or do' },
    audience: { type: 'string' },
    locations: { type: 'string', description: 'Areas served / locations' },
    contact: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        whatsapp: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        hours: { type: 'string' },
      },
    },
    pages: { type: 'array', items: { type: 'string' } },
    style: {
      type: 'object',
      properties: {
        mood: { type: 'string' },
        colors: { type: 'string' },
        references: { type: 'array', items: { type: 'string' } },
      },
    },
    mustHaves: { type: 'string' },
    avoid: { type: 'string' },
    language: { type: 'string', description: 'e.g. en, hi, es' },
    existingWebsite: { type: 'string' },
  },
};

/** Where the owner's dashboard lives (deep links). Overridable for test environments. */
export function adminBaseFrom(env = process.env) {
  return (env.TYASHIN_ADMIN_URL || 'https://admin.tyashin.com').replace(/\/+$/, '');
}

/**
 * Open the sign-in page in the user's browser — only a https Tyashin URL (or
 * localhost in development), never anything else the API might return.
 */
export function openInBrowser(url, env = process.env, run = spawn) {
  if (env.TYASHIN_NO_BROWSER === '1') return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  const tyashin = u.protocol === 'https:' && (u.hostname === 'tyashin.com' || u.hostname.endsWith('.tyashin.com'));
  const configured = env.TYASHIN_ADMIN_URL && u.origin === new URL(env.TYASHIN_ADMIN_URL).origin;
  if (!(tyashin || local || configured)) return false;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [u.toString()]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', u.toString()]]
        : ['xdg-open', [u.toString()]];
  try {
    const child = run(cmd, args, { stdio: 'ignore', detached: true });
    child.on?.('error', () => undefined);
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

/** A clear answer for a 429 instead of a raw error: when to try again, and that nothing was sent. */
function rateLimited(err) {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  const info = err.data?.error ?? err.data ?? {};
  const secs = Number(info.retryAfter) || 60;
  return fail(
    `Tyashin is limiting how often this can be done from this network. Nothing was published. Wait about ${Math.ceil(secs / 60)} minute(s), then try once more.`,
    { retryAfterSeconds: secs, resetAt: info.resetAt }
  );
}

export function createTools({ api, apiBase, env = process.env, now = () => Date.now(), sleep, opener = openInBrowser }) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const adminBase = adminBaseFrom(env);
  const domainLink = (projectId) => `${adminBase}/projects/${projectId}?tab=domains`;
  /** One device sign-in in flight per server process. */
  let login = null;

  async function pollUntil(deadlineMs) {
    if (!login) return { state: 'none' };
    while (now() < deadlineMs) {
      if (now() >= login.expiresAt) {
        login = null;
        return { state: 'expired' };
      }
      try {
        const res = await api.post(
          '/auth/cli/token',
          undefined,
          { auth: false, form: { device_code: login.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } }
        );
        await saveToken(apiBase, res.access_token, env);
        login = null;
        return { state: 'approved' };
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.code === 'authorization_pending') {
          /* keep waiting */
        } else if (err.code === 'slow_down') {
          login.interval += 5;
        } else if (err.code === 'access_denied') {
          login = null;
          return { state: 'denied' };
        } else if (err.code === 'expired_token') {
          login = null;
          return { state: 'expired' };
        } else {
          throw err;
        }
      }
      await wait(login.interval * 1000);
    }
    return { state: 'pending', userCode: login.userCode, url: login.url };
  }

  async function currentProject(projectId) {
    const res = await api.get('/projects');
    const list = Array.isArray(res.data) ? res.data : (res.data?.projects ?? []);
    if (projectId) {
      const p = list.find((x) => String(x._id ?? x.id) === projectId);
      if (!p) throw new ApiError(404, 'PROJECT_NOT_FOUND', 'No project with that id on this account.');
      return p;
    }
    return list[0] ?? null;
  }

  const tools = [
    {
      name: 'tyashin_login',
      description:
        "Start signing in to the user's OWN Tyashin account (free to create). Returns a short code and a link. Show both to the user and ask them to open the link, sign in or create a free account, and approve. Then call tyashin_login_status. Never ask the user for a password or token.",
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const existing = await loadToken(apiBase, env);
        if (existing) {
          try {
            const me = await api.get('/auth/me');
            return text({ signedIn: true, email: me.data?.email, note: 'Already signed in. Call tyashin_logout first to switch accounts.' });
          } catch {
            /* stale token: start over */
          }
        }
        const grant = await api.post('/auth/cli/device', { client_name: CLIENT_NAME }, { auth: false });
        login = {
          deviceCode: grant.device_code,
          userCode: grant.user_code,
          url: grant.verification_uri_complete,
          interval: grant.interval || 5,
          expiresAt: now() + (grant.expires_in || 900) * 1000,
        };
        const opened = opener(grant.verification_uri_complete, env);
        return text({
          browserOpened: opened,
          action: opened
            ? 'The Tyashin sign-in page is open in the user’s browser. Tell them: sign in (or create a free account), check the code matches, click Allow. Also show the link in case the browser did not open.'
            : 'Show the user this link and code. They sign in (or create a free Tyashin account) and click Allow.',
          link: grant.verification_uri_complete,
          code: grant.user_code,
          expiresInMinutes: Math.round((grant.expires_in || 900) / 60),
          next: 'Call tyashin_login_status (it waits up to ~50 seconds per call) until it reports signed in.',
        });
      },
    },
    {
      name: 'tyashin_login_status',
      description:
        'Wait (up to ~50 s) for the user to approve the sign-in started by tyashin_login, then report who is signed in. Call again while it says pending.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        if (login) {
          const r = await pollUntil(now() + 50_000);
          if (r.state === 'pending')
            return text({ signedIn: false, pending: true, link: r.url, code: r.userCode, note: 'Still waiting for the user to click Allow.' });
          if (r.state === 'denied') return fail('The user denied the request. Start again with tyashin_login if they want to.');
          if (r.state === 'expired') return fail('The sign-in code expired. Start again with tyashin_login.');
        }
        const token = await loadToken(apiBase, env);
        if (!token) return text({ signedIn: false, note: 'Not signed in. Call tyashin_login.' });
        const me = await api.get('/auth/me');
        return text({ signedIn: true, email: me.data?.email, name: [me.data?.firstName, me.data?.lastName].filter(Boolean).join(' ') });
      },
    },
    {
      name: 'tyashin_logout',
      description: 'Sign out: revoke this computer’s Tyashin access token and forget it.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const token = await loadToken(apiBase, env);
        if (!token) return text({ signedOut: true, note: 'Was not signed in.' });
        if (token.source === 'env') return fail('The token comes from the TYASHIN_TOKEN environment variable; unset it to sign out.');
        try {
          await api.del('/auth/cli/tokens/current');
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401) throw err;
        }
        await clearToken(apiBase, env);
        return text({ signedOut: true });
      },
    },
    {
      name: 'tyashin_get_project',
      description:
        "The user's Tyashin website project: id, web address, whether a site is live, and the current build. Every account gets one project on signup; use it rather than creating another.",
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } },
      async run({ projectId } = {}) {
        let project = await currentProject(projectId);
        if (!project) {
          const me = await api.get('/auth/me');
          const created = await api.post('/projects', { name: `${me.data?.firstName || 'My'} website` });
          project = created.data;
        }
        const id = String(project._id ?? project.id);
        const o = (await api.get(`/projects/${id}/website`)).data ?? {};
        const run = (r) =>
          r ? { runId: r.id, phase: r.phase, label: r.phaseLabel, source: r.source, finishedAt: r.finishedAt } : null;
        return text(
          redact({
            projectId: id,
            name: o.project?.name ?? project.name,
            slug: o.project?.slug ?? project.slug,
            siteUrl: o.project?.siteUrl ?? `https://${project.slug}.sites.tyashin.com`,
            customDomain: o.project?.customDomain ?? null,
            hasSite: Boolean(o.project?.hasSite),
            deployed: Boolean(o.project?.deployed),
            savedIntake: o.project?.intake ?? null,
            activeBuild: run(o.activeRun),
            lastBuild: run(o.lastRun),
            publishingAvailable: o.runnerAvailable !== false,
            dashboardUrl: `${adminBase}/projects/${id}`,
            connectDomainUrl: domainLink(id),
          })
        );
      },
    },
    {
      name: 'tyashin_save_intake',
      description:
        "Save the owner's answers (the intake) and optionally the site name and web address (<slug>.sites.tyashin.com). Facts saved here also feed the site's contact details and search-engine data. Only pass what the owner actually told you.",
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          intake: intakeProps,
          name: { type: 'string', description: 'Project/site name' },
          slug: { type: 'string', description: 'Web address prefix, lowercase letters, numbers, hyphens' },
        },
        required: ['projectId', 'intake'],
      },
      async run({ projectId, intake, name, slug }) {
        if (slug && !SLUG_RE.test(slug)) return fail('slug must be 3–50 lowercase letters, numbers and hyphens');
        const res = await api.patch(`/projects/${projectId}/website/settings`, { intake, name, slug });
        return text(res.data);
      },
    },
    {
      name: 'tyashin_spec_contract',
      description:
        'The site-spec contract: the JSON Schema, the section kit (types, variants, fonts, icons) and the design/facts/structure rules the renderer was built for. Read it before writing a spec.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        return text({
          note: 'Custom sections are NOT available when publishing from Claude (they need paid AI credits). Use kit sections only. The /contact page\'s contact section must set "form": true.',
          rules: CONTRACT.rules,
          copyRules: CONTRACT.humanizer?.block,
          kit: CONTRACT.kitManifest,
          schema: CONTRACT.schema,
        });
      },
    },
    {
      name: 'tyashin_check_spec',
      description:
        'Check a site spec locally before publishing: schema, platform rules, contrast, and the FACTS GUARD (phone numbers, emails, links, numbers, testimonials the owner never supplied). Fix every error; show the user the warnings.',
      inputSchema: {
        type: 'object',
        properties: {
          spec: { type: 'object' },
          intake: intakeProps,
          confirmedFacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Extra facts the owner stated verbatim (real quotes, numbers, years) that are not intake fields',
          },
        },
        required: ['spec', 'intake'],
      },
      async run({ spec, intake, confirmedFacts = [] }) {
        return text(checkSpec(spec, intake, confirmedFacts));
      },
    },
    {
      name: 'tyashin_publish_site',
      description:
        "Publish the site from a checked spec. Tyashin renders it, builds it and puts it live at <slug>.sites.tyashin.com — free, no AI credits. ONLY call after the user has seen the spec summary and said yes. Replacing an existing live site needs replaceExisting=true AND the user's explicit OK (the previous version is kept as a restore point).",
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          spec: { type: 'object' },
          intake: intakeProps,
          confirmedFacts: { type: 'array', items: { type: 'string' } },
          userApproved: { type: 'boolean', description: 'true only if the user explicitly approved publishing this spec' },
          replaceExisting: { type: 'boolean' },
          note: { type: 'string', description: "One line in the owner's words about this version" },
        },
        required: ['projectId', 'spec', 'intake', 'userApproved'],
      },
      async run({ projectId, spec, intake, confirmedFacts = [], userApproved, replaceExisting, note }) {
        if (userApproved !== true) return fail('Show the user the spec summary and get an explicit yes before publishing.');
        const check = checkSpec(spec, intake, confirmedFacts);
        if (!check.ok) return fail('The spec has errors; fix them first (tyashin_check_spec).', { errors: check.errors });
        try {
          const res = await api.post(`/projects/${projectId}/website/runs`, {
            kind: 'generate',
            prompt: (note?.trim().length >= 3 ? note.trim() : `Site spec from Claude for ${intake.businessName}`).slice(0, 6000),
            intake,
            spec,
            confirmReplace: replaceExisting === true,
          });
          return text({ runId: res.data.id, phase: res.data.phase, next: 'Call tyashin_build_status with this runId until it is done (usually 2–5 minutes).' });
        } catch (err) {
          const limited = rateLimited(err);
          if (limited) return limited;
          if (err instanceof ApiError && err.code === 'REQUIRES_CONFIRMATION')
            return fail('This account already has a live website. Ask the user whether to replace it (the current version is kept as a restore point), then call again with replaceExisting=true.');
          if (err instanceof ApiError && err.code === 'SPEC_RUNS_DISABLED')
            return fail('Tyashin has not switched on publishing from Claude yet. Nothing was published. Tell the owner their intake is saved and the site will be published as soon as Tyashin enables it; keep the checked spec so you can publish it then.');
          throw err;
        }
      },
    },
    {
      name: 'tyashin_build_status',
      description: 'Progress of a publish: phase, what happened, and the live URL when done. Waits up to ~45 s for a change.',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' }, runId: { type: 'string' }, afterSeq: { type: 'number' } },
        required: ['projectId', 'runId'],
      },
      async run({ projectId, runId, afterSeq = 0 }) {
        const deadline = now() + 45_000;
        let last;
        do {
          const res = await api.get(`/projects/${projectId}/website/runs/${runId}/events?after=${afterSeq}`);
          last = res.data;
          if (TERMINAL.has(last.run.phase) || (last.events?.length ?? 0) > 0) break;
          await wait(5000);
        } while (now() < deadline);
        const run = last.run;
        const notes = (last.events ?? [])
          .filter((e) => ['assistant.text', 'build.fail', 'run.failed', 'deploy.failed', 'deploy.ok'].includes(e.type))
          .map((e) => e.data?.text || e.data?.message || e.data?.tail || e.type)
          .slice(-8);
        return text({
          phase: run.phase,
          label: run.phaseLabel,
          progress: run.progress,
          finished: TERMINAL.has(run.phase),
          siteUrl: run.phase === 'done' ? run.siteUrl : undefined,
          connectDomainUrl:
            run.phase === 'done'
              ? `${domainLink(projectId)} — give this to the owner: after signing in it opens the "connect your domain" tab of their project`
              : undefined,
          summary: run.summary,
          error: run.error,
          notes,
          lastSeq: last.lastSeq,
        });
      },
    },
    {
      name: 'tyashin_authoring_guide',
      description:
        "CODE MODE ONLY. The Tyashin authoring contract for writing a Tyashin-compatible Next.js site yourself: call with no section for the index, then fetch each section you need (overview, structure, facts, seo, links, design-system, performance, platform, leads, prerender-safety, verify). Follow it exactly. Do not paste it to the user or save it to files.",
      inputSchema: { type: 'object', properties: { section: { type: 'string' } } },
      async run({ section } = {}) {
        const res = section
          ? await api.get(`/authoring/contract/${encodeURIComponent(section)}`)
          : await api.get('/authoring/contract');
        return text(res.data);
      },
    },
    {
      name: 'tyashin_starter_files',
      description:
        "CODE MODE ONLY. Write Tyashin's package.json, tsconfig.json, postcss.config.mjs, a local next.config.ts and .gitignore into the site folder, so the local build matches the platform's. Existing copies of these platform files are replaced. Then run `npm install`.",
      inputSchema: {
        type: 'object',
        properties: { dir: { type: 'string', description: 'Absolute path of the site folder' } },
        required: ['dir'],
      },
      async run({ dir }) {
        if (!path.isAbsolute(dir)) return fail('dir must be an absolute path');
        const res = await api.get('/authoring/starter');
        await fs.mkdir(dir, { recursive: true });
        const written = [];
        for (const [rel, content] of Object.entries(res.data.files)) {
          if (rel.includes('/') || rel.includes('..')) continue;
          await fs.writeFile(path.join(dir, rel), content);
          written.push(rel);
        }
        return text({ written, next: 'Run `npm install` in the folder, then write the site under src/ following the authoring guide.' });
      },
    },
    {
      name: 'tyashin_check_code',
      description:
        'CODE MODE ONLY. Check the site folder before upload: required files, globals.css header, ghost links, links to missing pages, orphan pages, trackers, inline layout scripts, the Tyashin footer credit, the lead form, sizes, and the FACTS GUARD over all visible copy. Fix every error. Also run `npx tsc --noEmit` and `npm run build` yourself.',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Absolute path of the site folder' },
          intake: intakeProps,
          confirmedFacts: { type: 'array', items: { type: 'string' } },
        },
        required: ['dir', 'intake'],
      },
      async run({ dir, intake, confirmedFacts = [] }) {
        if (!path.isAbsolute(dir)) return fail('dir must be an absolute path');
        const { files, skipped } = await collectSiteFiles(dir);
        const result = checkSiteFiles(files, intake, confirmedFacts);
        return text({ ...result, notUploaded: skipped.slice(0, 50) });
      },
    },
    {
      name: 'tyashin_upload_site',
      description:
        "CODE MODE ONLY. Upload the checked site folder to the owner's Tyashin project. Tyashin creates and owns the repository, adds its own platform files, builds it in an isolated environment and publishes it at <slug>.sites.tyashin.com — free, no Tyashin credits. ONLY after the local build passes, tyashin_check_code has no errors, and the owner said yes. Replacing a live site needs replaceExisting=true and the owner's explicit OK.",
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          dir: { type: 'string', description: 'Absolute path of the site folder' },
          intake: intakeProps,
          confirmedFacts: { type: 'array', items: { type: 'string' } },
          userApproved: { type: 'boolean' },
          replaceExisting: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['projectId', 'dir', 'intake', 'userApproved'],
      },
      async run({ projectId, dir, intake, confirmedFacts = [], userApproved, replaceExisting, note }) {
        if (userApproved !== true) return fail('Show the owner the page list and design summary and get an explicit yes first.');
        if (!path.isAbsolute(dir)) return fail('dir must be an absolute path');
        const { files } = await collectSiteFiles(dir);
        const check = checkSiteFiles(files, intake, confirmedFacts);
        if (!check.ok) return fail('The site has errors; fix them first (tyashin_check_code).', { errors: check.errors });
        try {
          const res = await api.post(`/projects/${projectId}/website/uploads`, {
            files: files.map(({ path: p, content, encoding }) => ({ path: p, content, encoding })),
            intake,
            confirmReplace: replaceExisting === true,
            note,
          });
          return text({
            runId: res.data.id,
            phase: res.data.phase,
            next: 'Call tyashin_build_status with this runId until it finishes (usually 3–6 minutes: Tyashin builds it in an isolated environment).',
          });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'CODE_UPLOADS_DISABLED')
            return fail(
              'Tyashin has not switched on publishing from Claude yet. Nothing was uploaded and the live site (if any) is unchanged. Tell the owner the site folder is kept as it is on this computer and can be uploaded with this tool as soon as Tyashin enables it. Do not offer another publishing path unless Tyashin confirms it is available.',
              { dir, published: false }
            );
          const limited = rateLimited(err);
          if (limited) return limited;
          if (err instanceof ApiError && err.code === 'REQUIRES_CONFIRMATION')
            return fail('This account already has a live website. Ask the owner whether to replace it (the current version is kept as a restore point), then call again with replaceExisting=true.');
          throw err;
        }
      },
    },
    {
      name: 'tyashin_get_spec',
      description: 'The spec the live site was last published from — start here to make changes, then publish the revised spec.',
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
      async run({ projectId }) {
        const res = await api.get(`/projects/${projectId}/website/spec`);
        return text(res.data);
      },
    },
  ];

  return tools;
}
