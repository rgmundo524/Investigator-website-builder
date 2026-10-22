# Separate site code from personal content

The builder can compile one person's site from a separate directory using
`SITE_DATA_DIR`. That directory can be a local folder or a checkout of a private
Git repository. The builder does not fetch it or require GitHub credentials.

Astro's built-in [glob loader](https://docs.astro.build/en/reference/content-loader-reference/#glob-loader)
reads the selected Markdown and MDX directly. Existing components, schemas,
Pagefind, charts, and draft rules use the same source. No new package is needed.

## Directory contract

| Path inside the selected directory | Purpose |
| --- | --- |
| `site.json` | Required configuration version and canonical site URL |
| `content/` | Required collection folders: `profile/`, `pages/`, `cases/`, etc. |
| `assets/` | Optional portrait images; badges go in `assets/credentials/` |
| `public/` | Optional files deliberately copied verbatim into the website |

For example, `../reymundo-site-data/content/experience/adc.md` is an employment
record. `../reymundo-site-data/assets/portrait.png` is selected by
`portrait.image: portrait.png` in a profile. Existing portrait and badge filenames
remain valid; the builder's previous `src/assets/` directory is now `assets/`.
Images under `assets/` are imported by the existing Astro/Vite image pipeline.
Only `public/` is copied wholesale; do not put unpublished content there.
Treat images in `assets/` as publishable too: the existing image globs can emit
matching portrait/badge files even when a record is draft or unselected. Draft
filtering controls rendered records, not confidentiality of source image files.
Shared application files such as the amCharts license stay with the builder.

Profiles can select a single `portrait.image` or an ordered `portrait.images`
list from that same `assets/` directory. See [profile photos](portrait-photos.md)
for Embla carousel settings and the backward-compatible single-photo format.

`site.json` contains:

```json
{
  "version": 1,
  "url": "https://reymundo-gomez.info"
}
```

Use the origin of the person's own website, without a subpath. Canonical URLs
and social-image links use this value. Names come from the profile selected by
`content/pages/home.md`; other pages can select their profile in frontmatter.
Optional profile `blocks.initials`, `blocks.footer_tagline`, and
`blocks.portrait_caption` customize the monogram, footer, and portrait caption.
Without overrides, these derive from the name and headline. Unpublished profiles
do not supply public branding.

## Export the current site on your computer

From the builder repository, inside `devenv shell`:

```sh
site-export ../reymundo-site-data
```

The destination's parent must already exist. The command validates and copies
`site.json`, `content/`, `assets/`, and `public/` if present, plus a small Git ignore
file. It refuses an existing destination or a destination inside the builder.
It does not delete originals, create a GitHub repository, or change Git history.
If a copy fails partway through, inspect the new folder before retrying with a
new destination. The command exports the currently selected source.

## Select content through devenv

`devenv.nix` declares the default variables:

```nix
env = {
  SITE_DATA_DIR = lib.mkDefault "examples/site-data";
  TAILSCALE_HOSTNAME = lib.mkDefault "";
};
```

The generic starter is the default. Set `.` explicitly to use the retained legacy
personal files, or put your external content path in the already-ignored
`devenv.local.nix`:

```nix
{
  env.SITE_DATA_DIR = "../reymundo-site-data";
}
```

Keep content paths as quoted strings, not Nix path literals. The builder reads
the live content directory; Nix does not need to copy that data into its store.
All relative paths resolve from the builder root. Absolute paths also work.

For a one-time selection, use devenv's existing configuration override flag.
Run this from your ordinary terminal, outside an existing devenv shell:

```sh
devenv -O env.SITE_DATA_DIR:string ../reymundo-site-data shell
```

This opens Fish with that directory selected for the session. There is no manual
`export`, `.env` setup, or custom flag parser. `--option` is the long form of `-O`.
Quote paths with spaces, for example:

```sh
devenv -O env.SITE_DATA_DIR:string "../Reymundo site data" shell
```

Inside that shell, use `site-dev`, `site-check`, `site-build`, or `site-drafts`.
The `site-*` commands run from the builder root, including when invoked from a
subdirectory. Existing npm commands continue to inherit the selected variables.
You can also run a build or the managed development process without opening an
interactive shell:

```sh
devenv -O env.SITE_DATA_DIR:string ../reymundo-site-data shell -- site-build
devenv -O env.SITE_DATA_DIR:string ../reymundo-site-data up
```

The flag overrides the configured default for that invocation. It does not edit
`devenv.nix` or permanently save the selection. To keep a selection across future
sessions, use the Nix setting above. Devenv owns these environment variables;
the builder no longer reads them from `.env`. Without devenv, the existing npm
commands still accept ordinary inherited process environment variables.

A nonempty invalid directory or invalid `site.json` stops the command; it never
silently falls back to bundled personal content. Blank or unset `SITE_DATA_DIR`
selects `examples/site-data` for direct npm usage. Use an absolute path instead
of a literal `~` inside a quoted Nix setting.

Exit and re-enter the shell after changing the selected directory. Restart the
site development process after changing site settings or adding the first record
to a previously empty collection. Existing records continue to use Astro's normal
file watching; case search watches the selected content directory too.

## Fish shell

The project requires devenv 2.1 or newer and sets its native shell option in
`devenv.yaml`:

```yaml
require_version: ">=2.1"
shell: fish
```

`devenv.nix` supplies `pkgs.fish`, Node, npm, and the site commands. Run
`devenv shell` to open Fish. This does not change your system login shell.
Devenv chooses the interactive shell before evaluating the environment, so
`env.SHELL` in Nix is not the setting for this. No `exec fish` activation hook is
needed; devenv's native Fish prompt/reload integration remains in charge.

For an occasional Bash session, use `devenv --shell bash shell`. The optional
existing direnv setup only loads the environment into your current shell; use
`devenv shell` when you want the project to choose Fish.

Official references: [configuration override flags](https://devenv.sh/ad-hoc-developer-environments/),
[interactive shell setting](https://devenv.sh/reference/yaml-options/#shell), and
[devenv 2.1 native shells](https://devenv.sh/blog/2026/05/07/devenv-21-nix-with-zsh-fish-and-nushell-via-libghostty/).

## Start from the complete example dataset

`../reymundo-site-data` is an example destination name, not an automatically created
folder. It should contain `site.json` and `content/`, with optional `assets/` and
`public/`. The Markdown is inside the collection folders; for example:
`../reymundo-site-data/content/experience/example-current-role.md`.

The builder includes a complete generic starter at `examples/site-data`. To copy
it into a new sibling directory, run these from the builder root, outside an
existing devenv shell:

```sh
devenv -O env.SITE_DATA_DIR:string examples/site-data shell -- site-export ../reymundo-site-data
devenv -O env.SITE_DATA_DIR:string ../reymundo-site-data shell
```

Then run `site-dev`. The first command explicitly chooses the included starter as
the source; the second opens Fish with your new copy selected. The destination
must not already exist. If you have already edited that folder, keep those edits
and copy any additional example files selectively after reviewing their slugs and
references.

The starter covers Home, Work History, Casework, Credentials, About, Resources,
and Contact. It includes dated job examples, credentials grouped by issuer,
six skills in three groups, volunteer/organization/DAO records, hobbies, service
and social contact cards, and seven fictional cases that populate both charts
and Pagefind search. Every entry is draft. Case and skill figures are examples,
not claims about your experience. GitHub groups are disabled until real accounts
and projects are configured. No personal photograph or certification badge is
included.

See [the starter editing map](../examples/site-data/README.md) for the individual
files. Begin with `site.json`, `content/profile/your-name.md`, and
`content/contacts/your-name.md`; page layout selections live in `content/pages/`.
Keep existing slugs initially so the references continue to work.

To begin with Reymundo's existing resume-based drafts instead, export the builder's
current content using the same mechanism, with `.` as the source:

```sh
devenv -O env.SITE_DATA_DIR:string . shell -- site-export ../reymundo-site-data
```

Choose one source for a new destination. Exporting never overwrites an existing
folder. No private repository is created automatically; you can version the new
folder separately after copying it.

Use `templates/` for more records. Keep ordinary prose in `.md` and use `.mdx` when
a component helps. The starter's About page demonstrates a shared Callout.
MDX can import components using `@components/Callout.astro` and selected images
using `@site-assets/filename.png`. Relative imports stay relative to the MDX file.
MDX is trusted build input and can execute code; this is a builder for
organization-maintained content, not an untrusted upload service.

A practical repository split is one public builder and one private content repo
per person. Pin a tested builder commit/tag for reproducible builds and update
it when ready. No Git submodule or GitHub Actions subscription is required.

## Build output and migration boundaries

Only one selected directory supplies a build: bundled Markdown and images are
not merged into it. Build caches are separated by the resolved source directory
and preview mode. Empty collections are cleared. Keep builds sequential in a
single checkout: generated types and `dist/` are shared. Use separate builder
checkouts if you need concurrent builds for multiple people.

Published builds still go to `dist/`; draft builds go to `dist-drafts/`. Changing
the content source does not publish drafts. Private source storage also does
not make rendered published pages, search records, or files in `public/` private.
Only upload the intended output directory when hosting later.

The existing personal content is preserved in this repository until its private
replacement is stored and verified. After that migration, it can be removed from
the current builder tree. The generic starter is already the default. Removing
files does not erase earlier public Git commits, clones, or forks; changing public
history is a separate operation. This change does not claim to erase that history.

For Cloudflare later, the build machine needs both the public builder checkout
and the selected private content checkout (or a local build can upload `dist/`).
Selecting a local directory alone does not grant Cloudflare access to a private
repository. The present workflow stays local with devenv.

## Default source and migration

The default is now `examples/site-data`, not the legacy personal files in the builder root.
Always select your personal source explicitly, preferably in `devenv.local.nix`.
Use `SITE_DATA_DIR=.` only when exporting the retained legacy content. It is not the default.
No external content directory is rewritten by a code update. See [publication readiness](site-readiness.md).
