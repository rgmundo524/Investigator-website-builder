# Reymundo Gómez: personal site foundation

Astro, reusable Markdown, and a local devenv environment for
`https://reymundo-gomez.info`.

This version has a focused professional landing page, a profile portrait, and
supporting Work History, Casework, Credentials, About, Resources, and Contact pages. Reusable Markdown
supplies the content across all routes. Content entries remain drafts for local
development; an ordinary production build excludes them.

## Use a separate content directory

The same builder can render another person's site without copying their content
into this repository. Keep the Markdown, images, and `site.json` in a separate
local folder or private repository:

```sh
devenv shell -- site-export ../reymundo-site-data
devenv -O env.SITE_DATA_DIR:string ../reymundo-site-data shell -- site-dev
```

See [external content and migration](docs/external-content.md) for devenv settings,
private repository separation, and the generic `examples/site-data` starter.
The existing bundled content remains the default during migration.
For a complete generic dataset covering every current page, see the
[starter editing map](examples/site-data/README.md). It includes seven fictional
cases for the interactive charts and search.
Profile filenames and optional photo carousels are also controlled by Markdown;
see [profile photos](docs/portrait-photos.md).

## Start locally

Install Nix and [devenv 2.1 or newer](https://devenv.sh/getting-started/) on your computer, then
run these commands from this repository:

```sh
devenv shell
site-dev
```

Open the localhost URL printed by Astro, normally `http://127.0.0.1:4321`.
The shell opens in Fish using `shell: fish` in `devenv.yaml`. The Fish package,
Node, npm, and default `SITE_DATA_DIR`/`TAILSCALE_HOSTNAME` values are declared in
`devenv.nix`. Devenv installs Astro and the other project dependencies
from `package-lock.json`, and exposes the local commands inside the environment.
The first activation needs network access to download any uncached dependencies.
Subsequent activations reuse the installation while the dependency inputs match.

After `git pull`, you can keep using the same devenv shell. `npm run dev` now
checks the dependency fingerprint before starting Astro and runs `npm ci` when
the lockfile, declared dependencies, or Node runtime has changed. The checker
uses only Node built-ins, so it also works when a newly added package is missing.
The same check runs before content checks, tests, and previews. If installation
fails, startup stops with the installation error; `npm ci` is the manual repair.

You can also run `devenv up` to initialize the environment and start the configured
site process in one command.

Node 24 is selected in `devenv.nix`. The npm dependency versions are pinned in
`package-lock.json`, and `devenv.yaml` pins the nixpkgs input to an exact revision.
The first `devenv shell` creates `devenv.lock`; commit that generated lockfile.
Nix, devenv, and Fish are unavailable in this development workspace, so shell
activation has not been executed here. Configuration follows the official devenv
2.1+ options; Astro checks and builds are verified separately.

The included `.envrc` is optional. If you use direnv, review it and run
`direnv allow`. Otherwise, continue using `devenv shell`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Live local preview, including drafts |
| `npm run check:content` | Check Markdown fields, dates, IDs, and references |
| `npm run check` | Content checks and Astro/TypeScript diagnostics |
| `npm run build` | Check and compile published content into `dist/` |
| `npm run preview` | Inspect the published-content build locally |
| `npm run build:drafts` | Check and compile all content into `dist-drafts/` |
| `npm run preview:drafts` | Inspect the separate draft build locally |
| `npm run content:export -- ../my-site-data` | Copy the selected content and assets to a new separate directory |
| `npm test` | Check important invalid-content cases |

The devenv shell provides `site-dev`, `site-check`, `site-build`, `site-drafts`,
and `site-export` as commands that always run from the builder root.
`site-setup` remains available to force a clean dependency reinstall
when troubleshooting; it is not required for normal startup.

All initial entries are drafts, so the ordinary build intentionally shows only
“Site in preparation.” Use `npm run dev` to see the populated content preview.
Draft builds are stored separately to keep them out of a future `dist/` upload.
Keep `CONTENT_PREVIEW` unset during normal builds. Both preview modes currently
include `noindex` metadata; public launch will include a deliberate metadata pass.

## Edit content

Start with [the content guide](docs/content-guide.md). Copy an appropriate file
from `templates/` into the matching collection under `content/`.

| Directory | Contents |
| --- | --- |
| `content/profile/` | Identity, portrait, and biography variants |
| `content/contacts/` | Service enquiry cards, personal contact details, and social links |
| `content/experience/` | Employment roles, date ranges, and achievement bullets |
| `content/education/` | Degrees and attendance records |
| `content/credentials/` | Certifications, certificates, and training |
| `content/expertise/` | Areas of expertise |
| `content/projects/` | Selected work and public project references |
| `content/repositories/` | Curated GitHub project descriptions and widget inputs |
| `content/skills/` | Individual skills, self-assessments, and supporting examples |
| `content/activities/` | Volunteer roles, organization memberships, and DAO participation |
| `content/interests/` | Personal interests |
| `content/callouts/` | Independently reusable passages |
| `content/charts/` | Category definitions for case-filtering sunburst charts |
| `content/cases/` | One structured record per case, driving charts and statistics |
| `content/resources/` | Official victim guidance, reporting and support links, and reference reports |
| `content/articles/` | Reserved for future original writing; currently empty and inactive |
| `content/pages/` | Page introductions and selected content IDs |
| `templates/` | Copyable examples; never loaded into the site |
| `src/content/schemas.ts` | Shared authoring rules |
| `src/components/` | Reusable rendering components |
| `src/pages/` | Website routes |

Each file in `content/pages/` controls navigation, section order, and selections.
Work History automatically discovers job files and uses their `display_order`.
Its expertise and approach sections follow the professional biography in frosted
panels. Edit `content/pages/work-history.md` for that selection and order, and
`content/pages/about.md` for the personal introduction, hobby selection, and
curated GitHub repository cards. See [GitHub projects](docs/github-projects.md)
for the card integration and Go-Crypto organization setup.
See [About content](docs/about-content.md) for the new sections, skill rating
symbols, ordering, and copyable templates.
The home page presents a small selection; the supporting pages provide the full
background and details. Other content files supply the writing. See
[the page structure guide](docs/page-structure.md) for the route map and portrait.
Edit `content/contacts/reymundo.md` for the Contact page's organization cards and
combined personal/social card. See [the contact guide](docs/contacts.md) for
ordering, optional contact fields, and adding more services or social accounts.

## Access through Tailscale

Keep Astro bound to localhost. If using Tailscale Serve, set your exact hostname
in `devenv.local.nix` or select it using devenv's native flag:

```sh
devenv -O env.TAILSCALE_HOSTNAME:string your-device.your-tailnet.ts.net shell -- site-dev
```

In a second terminal:

```sh
tailscale serve 4321
```

Use the HTTPS URL returned by Tailscale. Check Astro's printed port if 4321 is
already occupied. This project does not start or configure Tailscale automatically.
See [local development](docs/local-development.md) for persistent server notes.

## Public hosting later

Builds include a styled `404.html` for missing pages and an automatically generated
`sitemap-index.xml` from the official `@astrojs/sitemap` integration. Sitemap URLs
use the selected content directory's `site.json`, and the shared page layout links
to the sitemap. See [missing pages and sitemap](docs/page-structure.md#missing-pages-and-sitemap).
The current draft visibility and `noindex, nofollow` settings are unchanged.

The intended host is Cloudflare Pages. Compile locally with the selected
`SITE_DATA_DIR`, then upload `dist/` using Pages Direct Upload. The build needs
Node 24 and access to both the builder and content directories; Cloudflare only
needs the compiled output. GitHub Actions is not required. No Cloudflare project,
DNS records, GitHub Actions workflows, or public site are created by this scaffold.

## Resume content

The content inventory remains in draft while its wording and source claims are
reviewed. It includes professional history, credentials, selected work, interests,
case examples, victim resources, contact details, and page selections. The About
additions include seven unrated skills in three group cards, a curated repository,
and clearly labelled volunteer and membership examples. Organizations contains
Professional Organizations and DAOs. Run `npm run check:content` for the current count.

Casework is a Markdown-backed tracker. Add a record under `content/cases/` and
its chart count, category share, and statistics update from that record. Real
cases and examples use separate datasets. Charts store no manual counts.

Pagefind adds case search with per-case filters and direct links into summaries.
Search refreshes from Markdown in local development and is generated with static
builds. Content collections accept both `.md` and `.mdx`. Resources discovers
individual files from `content/resources/`, groups them by category, and links
directly to the original provider. See [resource authoring](docs/resources.md).
The starter article is now a template, not displayed writing. The BDO publication
remains in Selected Work. The article infrastructure can be enabled when there
is original writing to feature; see [future articles and case search](docs/articles-and-search.md).

Astro Icon supplies locally bundled Lucide icons. OpenGraph Canvas generates
social sharing images from visible page, article, and case category content, using
locally installed Inter fonts. Every page has an optional tsParticles network
background with a remembered pause control and support for reduced motion.
Node count, size, connection distance, and speed are set in `src/config/particles.json`.
See [MDX and visual integrations](docs/mdx-and-visuals.md) for editing examples and settings.

Start with [the case record guide](docs/case-tracker.md) and `templates/cases.md`.
See [page structure](docs/page-structure.md) for job ordering, timeline behavior,
navigation, the Contact page, portrait replacement, and dark mode.

See [the resume review notes](docs/resume-content-review.md) for source ambiguities
and details that still need confirmation. The supplied PDF, personal contact
details, and professional references are not included. Draft status controls the
website build; the Markdown and editorial notes remain visible in GitHub while
the repository is public.

This repository is not licensed for third-party reuse.
