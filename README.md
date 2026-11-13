# Blockchain Investigator Website Builder

One shared static website builder, with a separate content folder for each
investigator. Every site uses the same professional structure: Home, Work History,
Casework, Credentials, About, Resources, and Contact. The case fields and charts
are designed for blockchain investigations.

The builder contains no investigator's personal catalog. Your biography, case
summaries, contact details, and photos belong in your own content folder.

## Start on Windows

Download the [Windows builder ZIP](https://github.com/rgmundo524/Investigator-website-builder/releases/latest/download/investigator-website-builder-windows.zip)
from [GitHub Releases](https://github.com/rgmundo524/Investigator-website-builder/releases/latest),
choose **Extract All**, and double-click
**Start Builder.cmd**. Install [Node.js 24](https://nodejs.org/en/download/) once,
including npm. Select the **24.x** version explicitly; the download page may
default to another release. The launcher prepares dependencies and opens the local editor.
Create or open a separate content folder, then choose **Preview & release →
Start local preview** to keep the editor and website open together. Save,
review, and apply changes to update that preview.

No Git, Nix, WSL, or PowerShell configuration is required. The first start needs
internet access. Keep the launcher window open; **Ctrl+C** stops this builder
and its preview. See the [Windows guide](docs/windows.md) for the complete workflow.

From a source checkout, the same launcher runs with `npm start`.

## Package the builder for colleagues

With Node.js 24 installed, create a fresh distribution outside this repository:

```sh
npm run builder:package -- ../investigator-website-builder-windows.zip
```

The ZIP includes the launcher, builder source, blank content pack, examples, and
instructions. It excludes Git history, installed dependencies, generated sites,
private editor history, reports, and selected personal content. Each Windows
computer installs its own locked dependencies at first launch. Tests and GitHub
workflows remain in the source repository.

Share the GitHub Releases download link above with colleagues. Publish each
updated builder as a new release using the same asset filename; that link then
serves the latest version. Installed copies update when users download and
extract the new app, then open their existing content folder. See the
[release guide](docs/releases.md) for the maintainer steps.

This **builder ZIP** is different from the **blank content ZIP** and the
**published website** described below. Only a generated published website is
uploaded to Cloudflare. Update that investigator's existing Cloudflare project
each time so its public address and domain stay connected.

## Give an investigator a blank pack

Use Node.js 24 and run from this repository:

```sh
npm ci
npm run site:template -- ../investigator-website-template.zip
```

Send that ZIP to the investigator. It contains an `investigator-site/` folder with
`START-HERE.md`, the seven prepared pages, standard investigation categories,
blank profile/contact forms, and copyable record templates. It contains no real
case data, sample careers, or invented achievements.

They unzip it, follow `START-HERE.md`, fill in the Markdown files, add photos, and
return the folder. They do not need the builder or Node to fill in the pack.
Keep filenames and identifiers as provided unless the instructions say otherwise.
Unknown dates and amounts stay `null`; optional lists can stay empty.

To create the same blank folder directly:

```sh
npm run site:init -- ../alex-site-data
```

Both commands require a new destination and refuse to overwrite existing work.
The [blank pack](templates/investigator-site/START-HERE.md) is the recommended
starting point. [Examples](examples/site-data/README.md) are separate references.

## Build their site

Point the builder at the completed, unzipped folder:

```sh
SITE_DATA_DIR=../alex-site-data npm run dev
SITE_DATA_DIR=../alex-site-data npm run check
```

Relative paths resolve from the builder repository. Without `SITE_DATA_DIR`, the
builder previews its blank pack; it never chooses someone's personal content.

```text
investigator-website-builder/    # Shared builder (this repository)
  src/                           # Layout, components, case explorer, styling
  scripts/                       # Validation, template ZIP, static build helpers
  templates/investigator-site/   # Blank handoff pack
  examples/site-data/            # Fictional examples, for reference only

alex-site-data/                   # One investigator's completed pack
  START-HERE.md                  # Fill-in instructions
  site.json                      # Domain and appearance
  content/                       # Biography, pages, jobs, cases, credentials
  assets/                        # Photos and credential images
  public/                        # Files deliberately published as-is
  record-templates/              # Copy these when adding optional records
```

Only `content/`, selected image assets, and `public/` feed the website.
Instructions and record templates are not rendered. Keep source reports and
private review notes outside `assets/` and `public/`.

## Site settings

Edit the investigator's `site.json`:

```json
{
  "version": 1,
  "url": "https://investigator.example",
  "language": "en",
  "locale": "en-US",
  "appearance": { "defaultTheme": "dark", "particles": true }
}
```

Identity and writing live in Markdown. Site settings cover the domain, language,
date/number formatting, and appearance. `SITE_URL` can override the domain for a
particular build. See [configuration](docs/site-configuration.md).

Published sites are indexable by search engines automatically. There is no
indexing switch to fill in. Local development and draft review builds use
`noindex`; this is unrelated to the built-in case search, which remains available.

## Edit with Investigator Website Builder

Investigator Website Builder provides forms for cases, profiles, pages and other records:

```sh
SITE_DATA_DIR=../alex-site-data npm run editor
```

Open the local address printed in the terminal. **Save working draft** keeps
edits separate, **Review changes** shows the differences, and **Apply as draft**
updates local website content for preview. The coordinator can apply reviewed
records as published. Complex optional fields remain in **Additional fields ·
JSON**; unchanged values are preserved.

Working drafts and backups of replaced text stay in the selected folder's
private `.website-editor/` directory. Keep it outside public assets. The editor
and its preview are local only; **Build published release** creates an output
folder and does not deploy it. See the [editor guide](docs/editor.md) for the full
workflow, backup details and limits.

## Review and publish

All blank content starts as `publication_status: draft`. Preview it locally and
mark completed, reviewed entries `published`. Normal builds include published
entries only. An untouched pack produces a “Site in preparation” page.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local preview, including drafts |
| `npm run check` | Validate content and check the site code |
| `npm test` | Run behavioral tests |
| `npm run build:drafts` | Build a review copy in `dist-drafts/` |
| `npm run preview:drafts` | Preview that review copy |
| `npm run build` | Build published content in `dist/` |
| `npm run preview` | Preview the last published build |
| `npm run site:package -- ../alex-site-release` | Build and copy the published website into a new upload folder |

Prefix content-dependent commands with `SITE_DATA_DIR=../alex-site-data`.
Packaging requires that selection explicitly. Run builds for different people
sequentially in one checkout; each build replaces `dist/`.

Use a separate Cloudflare Pages project for each investigator. The
[Cloudflare guide](docs/cloudflare-pages.md) covers uploading the release folder
and building from Git. The blank content ZIP is **not** a deployable website.
Nothing is uploaded by these local commands.

## More detail

- [Content folder layout](docs/external-content.md)
- [Writing records](docs/content-guide.md) and [case fields](docs/case-tracker.md)
- [Page structure](docs/page-structure.md) and [photos](docs/portrait-photos.md)
- [Contact details](docs/contacts.md), [credentials](docs/credentials.md), [About sections](docs/about-content.md)
- [Local development and devenv](docs/local-development.md)

This is the version-one format. There are no old-route redirects or previous
configuration formats to maintain. This checkout is named
`Investigator-website-builder`; the builder's folder name does not select an
investigator's content.

This repository is an internal template. No third-party reuse license has been
added. The shared source and each investigator's private content have separate
ownership and publication decisions.
