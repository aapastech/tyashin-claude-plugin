# Design decisions

## Shape: a plugin = skill + local MCP server

- The **skill** (`build-tyashin-website`) carries the method: the intake interview, the rule against inventing facts, the design direction, the approval gate and the free-plan limits. This is what makes the output good and safe.
- The **MCP server** (`mcp/server.mjs`, Node 18+, zero dependencies) carries the actions: sign-in, project, intake, the spec check, publish and status. It runs on the user's computer and calls only the public API with the user's own token.
- **Not a remote MCP server (yet).** A hosted server would also reach claude.ai web users with no local Node, but it needs OAuth 2.1 dynamic client registration on the platform and a deployed service. It's the natural phase 2. The device flow and token model built for this plugin are the same primitives it would use.

## Where the site is built: Website Studio "spec runs", not local Next.js + /adopt

There were two candidates.

| | Local Next.js + `/adopt` | Website Studio spec run (chosen) |
|---|---|---|
| User needs | Node, git, a GitHub account and repo, `npm run build` locally | Nothing beyond the conversation |
| Who can push | `/adopt` wires a repo in the platform's `tyashin-sites` org; a public user cannot push there | The platform pushes, after its own build gate |
| Quality | Depends on an agent hand-writing a whole Next.js app (the platform measured this at $300+ per site in tokens and many failure classes) | Deterministic renderer + starter kit: every route linked, no ghost links, token system never hand-written, preflight + `tsc` + `next build` before anything is published |
| Cost to user | Their own Claude tokens for thousands of lines of code | Their Claude writes ~20–40 KB of JSON; the platform's render is zero-token |
| Cost to platform | Free plan has no build budget concept | No AI credits at all (the spec comes from the user's Claude); only a build container, capped at 10 runs/project/day |

Website Studio normally makes one paid model call to write the spec, and the free plan has 0 AI credits. The platform change in this PR lets the **user's own Claude write the spec**. The platform validates it against the same schema, strips the only model-dependent piece (bespoke `custom` sections), renders it deterministically, and runs the same build gate. Repair passes are disabled because they would call a model, so a spec that doesn't build fails honestly as `SPEC_BUILD_FAILED` and nothing is published.

## Code mode: the owner's Claude writes the whole site

For owners whose own Claude, usually on a paid plan, should write a fully custom site. Tyashin still hosts it on the free plan and spends nothing.

- **Rules only, never the internal prompt.** Anything the user's Claude reads, the user can read. Claude fetches a curated authoring contract (`/api/v1/authoring/contract/:section`): conventions, file layout, SEO and link rules, facts rules, the lead endpoint. The platform's internal generator prompt, kit source, skills and every infrastructure file (deploy workflow, wrangler/open-next config, KV ids, secrets) stay server-side. Fetches are signed in, logged per user and capped per day.
- **Tyashin owns the repository.** `tyashin_upload_site` sends only the site files, which the platform validates against an allowlist with size and type caps and traversal checks. Platform-owned files are dropped and rewritten by the platform. The platform creates the repo and commits; Claude never touches GitHub.
- **Untrusted code never runs next to a platform secret.**
  - The agent runner (which holds model keys) only writes the upload to the repo and runs static checks. It never installs or builds it.
  - Uploaded projects switch to an isolated deploy workflow. Its build job has no secrets and gets the project's own build env through GitHub's per-repository OIDC token.
  - A separate deploy job holds the Cloudflare token. It only downloads the build output and runs a pinned wrangler, never repository code.
  - Existing sites keep their workflow byte for byte.
- **No Tyashin AI spend.** Auto-heal is off for these projects. If the isolated build fails, the live site stays as it was, and the owner's Claude fixes and re-uploads.
- **Platform data.** Publishing from the plugin switches on Tyashin's analytics for the project, and the contact form posts leads to Tyashin's lead endpoint (the owner's dashboard).
- **Off by default.** The platform flag `CODE_UPLOADS_ENABLED` stays off until the isolated workflow has run once for real.

## Auth: device flow → personal access token

The platform previously had only browser sessions (15-minute JWT plus a 7-day refresh token). The PR adds:

- **`POST /auth/cli/device`** and **`POST /auth/cli/token`**, an RFC 8628 device authorization grant. The user approves at `admin.tyashin.com/device` after signing in or signing up, so no password ever passes through Claude.
- **Personal access tokens** (`tya_pat_…`). Only the sha-256 hash is stored. They expire after 90 days, are revocable in Settings → Connected tools, and are capped at 10 live tokens per user.
- **Resolution to the same payload as a login**, so every existing project and team check applies unchanged.
- **A deny-list** keeps billing, AI-credit top-ups, plugin plan and subscription changes, team and user management, domains, key regeneration and minting more tokens browser-only. A leaked token can't buy anything or escalate itself.
- **Exclusions.** SUPER_ADMIN accounts and impersonation sessions can't approve a device, and SUPER_ADMIN tokens never resolve. A platform-wide credential never ends up in a third-party tool.

## Rules carried over from the internal playbooks (and how they're enforced)

| Rule | Enforced by |
|---|---|
| No invented facts | Skill §0 + `tyashin_check_spec` facts guard (phones, emails, URLs, numbers/years/%/money, testimonials must trace to the intake or `confirmedFacts`) + platform overwrites `brand.name` with the intake name |
| Intake interview before design | Skill §2 + references/intake-interview.md |
| Asset debt | `assetDebt` in the spec → `docs/ASSET-DEBT.md` in the site repo; Claude hands it to the owner as a to-do list |
| Luxury / anti-sameness | Skill §3 + references/design-direction.md; the renderer enforces the LCP/CLS/reduced-motion laws |
| Spend gate (no paid images, no stock) | Skill §0; tools have no image or billing actions; tokens refused on billing routes; spec runs hold and charge 0 credits |
| Customer-facing plugins default OFF | Plugin installs nothing; skill only points to the dashboard |
| Approval before publishing | `tyashin_publish_site` requires `userApproved: true` and a clean check; replacing a live site needs `replaceExisting` (the platform returns 409 otherwise) |
