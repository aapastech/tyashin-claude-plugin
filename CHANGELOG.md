# Changelog

## 0.2.0 — 2026-11-03
- Verified live on Tyashin production with a customer test account: device sign-in, quick-design publish and custom-coded upload (isolated build) both went live; billing/team/admin routes refuse the token.
- A 429 from Tyashin now reads "nothing was published, try again in N minutes".
- **Code mode**: the owner's own Claude writes the full Next.js site from Tyashin's rules-only authoring guide, checks it locally (`tyashin_check_code`, same facts guard), and uploads it (`tyashin_upload_site`). Tyashin builds it in an isolated environment and hosts it for free.
- The sign-in page opens in the browser automatically (`TYASHIN_NO_BROWSER=1` to opt out).
- Finished builds return a `connectDomainUrl` that opens the project's Domains tab after login.
- **Quick-design sites capture leads**: the `/contact` page's contact section sets `"form": true` (the check enforces it), so enquiries reach the owner's Leads inbox. Requires the platform release whose kit has the opt-in `form` field (re-exported contract).
- **Humanizer**: both checkers lint all visible copy with Tyashin's own anti-AI-slop rule table (exported in the spec contract), and the authoring guide has a `copy` section.
- Contact pages carry the kit's enquiry form (`"form": true`) so leads reach the owner's dashboard.
- Handles `SPEC_RUNS_DISABLED` (publishing not enabled yet) without losing the checked spec.
- Requires Tyashin platform: PR #9 (merged), #11 (kit lead form) and the humanizer contract PR, plus `SPEC_RUNS_ENABLED` / `CODE_UPLOADS_ENABLED` switched on.

## 0.1.0 — superseded by 0.2.0
- First version: device sign-in, intake, site-spec check with facts guard, free publish via Website Studio spec runs, build status, revise-and-republish.
- Requires the Tyashin platform release that adds `/auth/cli/*` and spec runs.
