# Cloudflare Pages

Each investigator has a separate content folder, domain, and Cloudflare Pages
project. This Astro site produces static files; the standard build command is
`npm run build` and output folder is `dist`. Use Node.js 24, as recorded in
`.node-version`. See Cloudflare's [build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/)
and [Node version configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

## Build locally, then upload

After reviewing the returned investigator content and marking ready records
`publication_status: published`, run from the builder:

```sh
SITE_DATA_DIR=../alex-site-data npm run site:package -- ../alex-site-release
```

This validates the selected data, makes a fresh published build, and copies only
the generated website into a new release folder. It refuses existing output
folders and draft mode. It does not upload anything.
It also refuses an unpublished Home page, so an empty production site cannot
silently replace the completed draft preview. Publish the reviewed pages and
their referenced records before packaging.

Create a separate Pages project for the investigator and upload that release
folder through Cloudflare's [Direct Upload workflow](https://developers.cloudflare.com/pages/get-started/direct-upload/).
The release root contains `index.html`. With Wrangler, the publication command is:

```sh
npx wrangler pages deploy ../alex-site-release --project-name alex-investigator-site
```

That command publishes the site. Replace the folder and project name for each
investigator. Keep credentials in Wrangler's normal login or CI secrets.

The blank handoff ZIP contains editable source and instructions. It is not the
folder to upload to Cloudflare. Likewise, keep `dist-drafts/` local.

## Build from Git instead

Cloudflare needs both the builder and the chosen data available in its checkout.
A private folder on your computer will not be available automatically. One
possible layout for a per-investigator repository is:

```text
alex-site/
  builder/       # Shared builder source and package-lock.json
  site-data/     # Alex's reviewed content and publishable assets
```

| Setting | Value |
| --- | --- |
| Root directory | `builder` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `.node-version` or `NODE_VERSION=24` |
| `SITE_DATA_DIR` | `../site-data` |

If the builder is at the repository root, leave Root directory empty and adjust
`SITE_DATA_DIR` to the data path in that checkout. `SITE_URL` is available when a
build needs to override the domain in `site.json`.

Use ordinary published builds for hosted deployments. They permit search-engine
indexing by default. Draft builds include unreviewed content and are meant for
local review; there is no index/noindex configuration to manage.

Cloudflare's [Astro guide](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
covers Git setup. Direct Upload and Git integration are different project setup
choices; choose the workflow before creating the Pages project.

Private source storage does not make website output private. `public/` files are
copied unchanged, and `assets/` should contain only publishable images. A content
update needs a new build and deployment; the static site does not read the data
folder at runtime.
