# Tyashin for Claude

Ask Claude to build your business website, and it will. Claude interviews you about your business, designs the site, writes every page and publishes it on [Tyashin](https://tyashin.com)'s **free plan**, live at `your-name.sites.tyashin.com`. You don't need code, GitHub or a credit card.

> "Build a website for my physiotherapy practice in Leeds."

## What you get

- A real, fast website (Next.js, served from Cloudflare's network) with pages for your services, about, contact, privacy and terms.
- A design made for your business: its own colours, fonts and voice, not a template.
- Search-ready pages: titles, descriptions, sitemap, structured data and `llms.txt`.
- A to-do list of the photos and details you still need to send. Claude never makes up facts about your business.
- Changes any time: "change the opening hours" or "add an FAQ page", and Claude republishes.

## Install

### Claude Code

```bash
claude plugin marketplace add aapastech/tyashin-claude-plugin
```

```bash
claude plugin install tyashin-website@tyashin
```

Or inside a session: `/plugin marketplace add aapastech/tyashin-claude-plugin`, then `/plugin install tyashin-website@tyashin`.

Requires Node.js 18 or newer. The plugin's server has no dependencies to install.

### Then just ask

> "Make me a website for my bakery."

Claude opens the Tyashin sign-in page in your browser and shows a short code. Sign in or create a free Tyashin account, check the code and click **Allow**. You never give Claude a password.

## Two ways to build

- **Quick design.** Claude writes a precise design spec, and Tyashin renders it with its section kit. It's fast and works on any Claude plan.
- **Custom-coded.** Claude writes the whole Next.js site on your computer, following Tyashin's authoring rules, checks it, and uploads it. This gives you a fully custom site, and it's best on a paid Claude plan. Tyashin builds it in an isolated environment and hosts it.

Both are free on Tyashin and use none of Tyashin's AI credits. Tyashin creates and owns the site's repository, so you never touch GitHub. When the site is live, you get its address and a link straight to **connect your own domain** in your Tyashin dashboard.

## How it works

```
You ⇄ Claude ── tyashin_* tools (runs on your computer) ── Tyashin public API (your account)
                                                                   │
                                     renders your site spec → builds → publishes
```

1. **Interview.** Claude asks about your business: what you do, who for, how customers reach you, and the look you want.
2. **Spec.** Claude writes a *site spec*, a precise description of the design and every page. A local check refuses anything you didn't tell it, such as a phone number, a price, a "500+ clients" claim or a testimonial.
3. **Your yes.** Claude shows you the design summary and page list. Nothing is published until you approve.
4. **Publish.** Tyashin turns the spec into a website, checks that it builds and puts it live, usually in 2 to 5 minutes. This uses no AI credits and costs nothing.

## What it will never do

- **Spend money.** No paid plans, top-ups, subscriptions or AI-image generation. The access token it gets is refused by Tyashin's billing, team and domain routes.
- **Invent facts** about your business.
- **Install extras on your site** (chatbot, pop-ups, third-party trackers). Tyashin's own privacy-first analytics is switched on when the site is published, and contact-form leads go to your dashboard.
- **Use stock photos.** Image slots are briefs for your own photos.

## Your account and your data

- Sign-in uses the OAuth device flow. Claude receives a personal access token for **your** account only. It expires after 90 days, and you can revoke it any time in the Tyashin dashboard under **Settings → Connected tools**.
- The token is stored on your computer at `~/.config/tyashin/credentials.json` (readable only by you) and is never shown to the model.
- The plugin talks only to `https://website-api.tyashin.com`.

## Configuration

| Variable | Purpose |
|---|---|
| `TYASHIN_API_URL` | API base (default `https://website-api.tyashin.com`; must be https, except localhost) |
| `TYASHIN_TOKEN` | Use this access token instead of signing in |
| `TYASHIN_CONFIG_DIR` | Where credentials are stored (default `~/.config/tyashin`) |
| `TYASHIN_ADMIN_URL` | Dashboard base for links (default `https://admin.tyashin.com`) |
| `TYASHIN_NO_BROWSER` | `1` = don't open the sign-in page automatically; just show the link |

## Develop

```bash
cd plugins/tyashin-website && node --test tests/*.test.mjs
```

```bash
claude plugin validate . && claude plugin validate ./plugins/tyashin-website --strict
```

`spec/site-spec.contract.json` is generated from the Tyashin renderer, so a spec written here obeys exactly the rules the renderer was built for. See [docs/DESIGN.md](docs/DESIGN.md) for why the plugin works this way.

## License

MIT. See [LICENSE](LICENSE).
