# Finishing the site and adding historical cases

The builder defaults to the fictional `examples/site-data` dataset. Select your
own source explicitly in `devenv.local.nix`:

```nix
{ ... }: { env.SITE_DATA_DIR = "../reymundo-personal-data"; }
```

The original personal starter remains in the builder root for migration. It is
not the default. Export it with `devenv -O env.SITE_DATA_DIR:string . shell --
site-export ../new-personal-data` only if you still need that copy. Confirm your
external copy before removing these legacy files from the current Git tree.

## Publication and indexing are separate

An entry appears in production only when `publication_status: published`. A
published page cannot reference drafts. Example cases remain drafts. Dev and
draft builds always exclude search-engine indexing.

Your selected `site.json` can now contain:

```json
{
  "version": 1,
  "url": "https://reymundo-gomez.info",
  "indexing": false,
  "case_networks": ["bitcoin", "ethereum", "tron", "solana", "liquid"]
}
```

Leave `indexing` false while reviewing. Set it true only for the approved public
build. This enables indexing of visible pages and the sitemap reference in
`robots.txt`; it does not publish draft records. Missing-page responses remain
`noindex`. Neither drafts nor noindex are authentication: deploy only material
you intend to make available. Files under `public/` are copied directly, and
image imports may emit unselected assets. Keep working evidence elsewhere.

## Before entering cases

- Keep each case's slug stable. Its permanent link is `/cases/{slug}/` even when
  its category changes. Category pages contain short summaries and links.
- Count one engagement once. Update its record when another phase completes.
- Record dates at the precision known: `"2023"`, `"2023-08"`, or `"2023-08-19"`.
- Use `addresses_reviewed` for distinct network/address identifiers and
  `wallets_reviewed` only for wallet entities you can actually distinguish.
  Existing `wallets_reviewed` values are never automatically reinterpreted.
- Use canonical network IDs from `case_networks`, if configured. Add a new ID
  there before using it; do not create aliases such as `eth` and `ethereum`.
- Optionally define full category/subcategory paths in each chart's
  `subcategory_paths`. A partially classified record can use a prefix of a
  configured path. Empty/omitted configuration retains legacy free discovery.
- Optionally link a case to a job using `experience: job-slug`. The referenced
  job must be published before publishing the case.
- Each financial figure needs its own valuation basis. Separate per-figure
  dates/notes override the older shared `valuation_date` and `amount_note`.
- Keep editorial comments out of the public narrative. Search excludes comments
  and hidden HTML, but public source files are not private storage.

Start with five varied cases: an active matter, a completed matter, one with
partial dates, one involving several networks, and one involving expert work.
Include a case with no publishable amount. Check classification, case links,
search, and statistical totals before entering the rest.

## Professional presentation

`/cv/` reuses visible profile and professional-page selections. Use its native
Print / save as PDF action, or configure an optional prepared PDF in the profile.
See [CV configuration](cv.md). Draft warnings remain on printed draft CVs.

Work History includes section shortcuts and the profile's `professional_focus`
block. About starter content opens with hobbies/community before technical
skills. Existing customized external Markdown keeps its own ordering.

For an external copy with the original About section order, run `site-upgrade`
to preview the change, then `site-upgrade --write` to apply it. Only that exact
original order changes. A backup is saved under `migration-backups/` in the
selected data directory; custom ordering and publication status are preserved.

Contact cards support `audience` and `primary`. Use an audience description to
explain which organization handles a request; select at most one enabled primary
card. Both routes remain available unless you disable one. No organization is
automatically chosen as your business's primary route.

## Final checks

Run `site-check`, `npm test`, and `site-drafts`. Inspect desktop/mobile navigation,
keyboard use, charts, CV printing, and real images. Then approve content, build
with `site-build`, inspect `dist/`, and upload that directory to Cloudflare Pages.
Rebuild when updating cases or credentials; date-derived expiry labels update at
build time. No GitHub Actions or database is required.
