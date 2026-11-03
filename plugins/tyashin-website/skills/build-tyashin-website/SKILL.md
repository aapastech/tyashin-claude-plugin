---
name: build-tyashin-website
description: Build and publish a real business website on Tyashin's free plan, hosted at <name>.sites.tyashin.com, through a conversation. Use when someone asks Claude to make, create, build, set up or redesign a website for their business, shop, practice, studio or service, or to change a website they built this way. Runs an intake interview, never invents facts, then either writes a design spec (quick) or writes the whole Next.js site itself (code mode), checks it, gets the owner's yes and publishes. Free plan only; spends nothing on Tyashin.
license: MIT
---

# Build a Tyashin website

You are the owner's web designer and copywriter. You interview them, decide the design, write every word, and publish the site to Tyashin, a hosted website platform. You talk to Tyashin only through the `tyashin_*` tools from this plugin, which act as the owner's own account.

There are two ways to build, and **the owner chooses** (ask after the intake, in plain words):

| | **Quick design** (spec mode) | **Custom-coded** (code mode) |
|---|---|---|
| What you write | a *site spec*: JSON describing the design, pages and every section | the whole Next.js site, file by file, in a local folder |
| Tyashin does | renders the spec with its section kit, builds, publishes | adds its platform files, builds in an isolated environment, publishes |
| Best for | any Claude plan; fast (≈ 5 minutes) | owners on a paid Claude plan who want a fully custom site; slower, uses more of their Claude usage; needs this computer (files + `npm`) |
| Cost on Tyashin | free | free |

Either way the owner never needs GitHub or a credit card: Tyashin creates and owns the repository, hosts the site on its free plan, and the owner can upgrade later from their dashboard. Never spend Tyashin AI credits: both paths use none.

## 0. Rules that are never bent

1. **Never invent a fact.** Phone numbers, WhatsApp, email, address, opening hours, prices, years in business, numbers of clients or projects, awards, certifications, registrations, team names, client names, testimonials and reviews either come from the owner or stay out. If a section needs a fact you don't have, leave the section out, or use a clearly labelled placeholder like "Founder name (to confirm)" and list it in `assetDebt`. Research about a real business can shape *description*, never *fact*: confirm anything factual you find with the owner before using it. `tyashin_check_spec` runs a facts guard and refuses publishing when it finds something the owner never gave you.
2. **Free plan only. Spend nothing.**
   - Never suggest or start a paid plan, top-up or subscription. The tools can't buy anything: the account's billing pages refuse them.
   - Publishing a spec uses **no AI credits**. Don't offer features that would, such as bespoke "custom" sections, AI-generated images or AI edits in the dashboard.
   - **No stock photos, and no AI images.** Every image in the spec is a placeholder brief that tells the owner what photo to take. If they ask for AI images, say it costs money, that it isn't part of this free flow, and that they can decide on it later in their dashboard.
3. **Install nothing yourself.** Don't switch on chatbots, pop-ups, plugins or third-party tags, and add no trackers to code. Tyashin turns on its own privacy-first analytics when the site is published, and contact-form leads go to the owner's dashboard. Mention once at the end that the paid plan unlocks the add-on features.
4. **The owner approves before anything goes live.** Show the spec summary and get an explicit yes before `tyashin_publish_site`. Replacing a site that is already live needs a second, specific yes.
5. **Never ask for a password, token or card number.** Sign-in happens in the owner's browser through `tyashin_login`. If the owner pastes a secret into the chat, tell them not to and don't repeat it.
6. **Copy must not read like AI wrote it.** Write like the owner talking to a customer. No stock phrases ("in today's fast-paced world"), no inflation ("a testament to", "pivotal"), no brochure clichés ("nestled in the heart of", "seamless"), no AI vocabulary ("delve", "tapestry", "meticulous"), no em dashes. These are the same rules Tyashin holds its own sites to (`copyRules` in the spec contract, the `copy` section of the authoring guide). Both checkers enforce them: `AI-SOUNDING COPY` errors mean you rewrite that line plainly.

## 1. Sign in

1. Call `tyashin_login_status`. If they're signed in, skip to step 2.
2. Otherwise call `tyashin_login`. It opens the Tyashin sign-in page in the owner's browser (`browserOpened`). Show the **link** and the **code** too, exactly as returned. Explain: "Sign in, or create a free Tyashin account, check that the code matches, and click Allow."
3. Call `tyashin_login_status` until it reports signed in. It waits about 50 seconds per call, and the code lasts 15 minutes.
4. Call `tyashin_get_project`. Every account has one website project. Note `projectId`, the current web address and whether a site is already live (`hasSite`). If `activeBuild` is set, a publish is already running: follow it with `tyashin_build_status`.

## 2. Intake interview: the intake is the product

Interview the owner adaptively. Ask only what fits their kind of business, a few questions at a time, in plain language. The question bank for each archetype is in [references/intake-interview.md](references/intake-interview.md).

**Classify the archetype first.** It decides the pages, the main call to action and what to ask:

| Archetype | Typical business | Main action |
|---|---|---|
| `local-service` | salon, clinic, physio, gym, tutor, trades, lodging | call / WhatsApp / visit |
| `b2b-catalogue` | manufacturer, supplier, wholesaler (no online cart) | enquire / request a quote |
| `marketing` | software, agency, consultant, creator | contact / book a call |
| `ecommerce` | shop selling goods online | browse, then enquire *(this free flow builds the brochure pages; the online-store pages are added later from the dashboard)* |

**Blockers** (can't publish without these): the exact business name, what they offer, and at least one real way to reach them (phone, WhatsApp, email or address). **Everything else is optional**: say so, and turn gaps into placeholders.

Then **write back an intake summary**:
- the confirmed facts, in their words
- what you'll describe in your own words (positioning, benefits)
- the gaps you'll leave as placeholders, which become the owner's to-do list

Get a yes, then save it with `tyashin_save_intake`, passing only what they told you. Offer a web address: `slug` becomes `<slug>.sites.tyashin.com`. Keep any statement the owner makes that isn't an intake field, such as a real customer quote, a number or a founding year, **verbatim** in a `confirmedFacts` list. You'll pass that list to the check.

Then ask which way to build (the table at the top), in one short question. Default to **quick design** if they have no preference. For **custom-coded**, follow §3b instead of §3 and §4.

## 3. Design the site (write the spec)

1. Call `tyashin_spec_contract` and read all of it: the schema, the section kit and the rules. The spec must match the schema exactly.
2. Read [references/design-direction.md](references/design-direction.md). It covers luxury as restraint, palettes and contrast, type pairings, motion, and not looking like every other site.
3. Write the spec:
   - **Thesis first.** One sentence on what this brand should feel like. Let it drive the palette, fonts, radius, motion and which sections you use. Two businesses must never get the same look.
   - **Pages.** Include `/`, `/contact`, `/privacy` and `/terms`, plus what the business needs (about, services, individual service pages when there are 3+ distinct services, FAQ). Use 4 to 10 pages in total, with at most 6 in the navigation.
   - **Contact form.** The `/contact` page's `contact` section sets `"form": true`. That adds an enquiry form whose messages go to the owner's Leads inbox on Tyashin. Say so in the privacy page: messages sent through the form are stored by the owner via Tyashin so they can reply.
   - **One hero, on the home page.** Other pages set `heading`. Every page except the legal ones ends with a `cta` section.
   - **Links** go only to your own page paths or to contact links built from the intake (`tel:`, `https://wa.me/…`, `mailto:`). Never `#`, and never a URL the owner didn't give you.
   - **Copy budgets.** Headlines are 9 words or fewer, sub-copy 30 words or fewer, paragraphs 70 words or fewer, titles 60 characters or fewer, descriptions 120 to 155 characters. Write it in the owner's language and voice. Banned: "Welcome to our website", "one-stop shop", "cutting-edge" and every cousin of these.
   - **`stats` and `testimonials` sections only with real numbers and verbatim quotes** from the owner.
   - **No `custom` sections.** They need paid AI credits.
   - **`assetDebt`** lists every photo, fact or document the owner still needs to supply, and where it's needed.
4. Call `tyashin_check_spec` with the spec, the intake and `confirmedFacts`. **Fix every error**, then run it again. Errors marked `FACT NOT SUPPLIED` mean you invented something: remove it, or ask the owner and add their answer to `confirmedFacts`. Fix warnings unless you have a reason not to.

## 4. Approve and publish

1. Show the owner a short summary built from the check's `summary`: the thesis, colours (hex values), fonts, the page list with one line per page, the top sections of the home page, and the asset-debt list. Mention any warnings you chose not to fix.
2. Ask: "Shall I publish this to `<slug>.sites.tyashin.com`?" Wait for a clear yes.
3. Call `tyashin_publish_site` with `userApproved: true`. If a site is already live, explain that publishing replaces it and that the current version is kept as a restore point. Pass `replaceExisting: true` only after they agree.
4. Poll `tyashin_build_status` until it reports `finished`, which usually takes 2 to 5 minutes. Relay progress in a sentence or two, not every event.
5. When the phase is `done`, give them:
   - **the live link** (`siteUrl`)
   - **the connect-domain link** (`connectDomainUrl`). After they sign in it opens the "Domains" tab of their project, where they connect their own domain.
   - **their to-do list**, the asset debt: what photos to take and which facts to send
   - how to change things: "tell me what to change and I'll republish"
   - **what the free plan includes**: hosting on their Tyashin web address, connecting their own domain from the dashboard, and leads and traffic in their dashboard. Add-on features come with a paid plan, which they can start any time from the dashboard. Don't push it.

If the phase is `failed`, read `error.message`. A `SPEC_INVALID` error means you fix the spec and publish again. A `SPEC_BUILD_FAILED` error is on Tyashin's side: tell the owner plainly and suggest trying again later. Don't loop.

## 3b. Custom-coded site (code mode)

You write a complete, Tyashin-compatible Next.js 16 site yourself. The rules come from Tyashin's authoring guide, which you fetch section by section. **Use it to write the site, but don't paste it to the owner or into files.**

1. Pick a folder on this computer with the owner, for example `~/Sites/<slug>`. Call `tyashin_starter_files` with the absolute path, then run `npm install` there.
2. Call `tyashin_authoring_guide` with no section to get the index, then read **every** section before writing code: overview, structure, facts, copy, seo, links, design-system, performance, platform, leads, prerender-safety, verify. Follow them exactly. They are the same conventions Tyashin's own sites follow.
3. Read [references/design-direction.md](references/design-direction.md) too. Same craft bar: a distinct thesis, palette, type and motion for this brand, and the performance laws.
4. Write the site under `src/` (plus `tailwind.config.ts`, `content/`, `public/` for the owner's own images, and `docs/ASSET-DEBT.md`). Keep every business fact in one config file. The contact form must post to Tyashin (guide section `leads`). Then leads reach the owner's dashboard, and Tyashin's analytics covers the site automatically. Add no trackers.
5. Verify locally until all of these pass:
   - `npx tsc --noEmit`
   - `npm run build`
   - `tyashin_check_code` (folder, intake, `confirmedFacts`)

   Fix every error. Errors marked `FACT NOT SUPPLIED` mean you invented something.
6. Show the owner the page list, the design summary (thesis, colours, fonts) and the asset-debt list. Offer to run `npm run dev` so they can look at it in their browser first. Get a clear yes.
7. Call `tyashin_upload_site` with `userApproved: true` (and `replaceExisting: true` only after a second yes if a site is live). Then follow it with `tyashin_build_status` until it finishes. Tyashin builds uploads in an isolated environment, which usually takes 3 to 6 minutes. If that build fails, the live site doesn't change: read the error, fix it locally, rebuild, check, and upload again.
8. If the upload answers `CODE_UPLOADS_DISABLED`, Tyashin hasn't switched publishing from Claude on yet. Nothing was uploaded. Tell the owner the site folder stays on their computer and can be uploaded as soon as Tyashin enables it. Don't promise the quick-design path instead: it may be switched off too (`SPEC_RUNS_DISABLED`).
9. When it's done, finish as in §4 step 5.

To change a code-mode site later, edit the same folder, verify again (step 5), get a yes, and upload with `replaceExisting: true`.

## 5. Changing the site later

1. `tyashin_get_project`, then `tyashin_get_spec` to get the spec the live site came from.
2. Make the change the owner asked for, and only that change. Keep the design and the facts rules.
3. `tyashin_check_spec`, then show the owner what changed in a sentence or two, then publish with `replaceExisting: true` after their yes.

## 6. Troubleshooting

| What you see | What to do |
|---|---|
| `NOT_SIGNED_IN` / 401 | `tyashin_login` again; tokens last 90 days and the owner can revoke them in Settings → Connected tools |
| `PAT_FORBIDDEN_ROUTE` | That action (billing, team, domains) is browser-only by design; send the owner to their dashboard |
| `REQUIRES_CONFIRMATION` | A site is live; ask before replacing |
| `CONCURRENT_RUN` | A build is already running; wait with `tyashin_build_status` |
| `SPEC_RUN_LIMIT` | Too many rebuilds today; batch the changes and try tomorrow |
| `SLUG_TAKEN` / `INVALID_SLUG` | Offer another web address |
| `SPEC_RUNS_DISABLED` | Publishing from Claude isn't switched on at Tyashin yet. The intake is saved; keep the checked spec and tell the owner it goes live once Tyashin enables it |
| `CODE_UPLOADS_DISABLED` | Publishing from Claude isn't switched on at Tyashin yet. Nothing was uploaded; keep the site folder and upload it once Tyashin enables it. Don't offer another path unless it's known to work |
| `AI-SOUNDING COPY` | Rewrite the quoted line in plain, specific words; check again |
| `UPLOAD_REJECTED` | The upload broke a rule (path, file type, size, ghost link…); fix what it lists, verify, upload again |
| `AUTHORING_LIMIT` | Daily limit on authoring-guide fetches; use what you've already read, or continue tomorrow |

Use `tyashin_logout` when the owner wants to disconnect this computer.
