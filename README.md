# Blockchain Investigator Website Builder

One shared static website builder, with a separate content folder for each
investigator. Every site uses the same professional structure: Home, Work History,
Casework, Credentials, About, Resources, and Contact. The case fields and charts
are designed for blockchain investigations.

The builder contains no investigator's personal catalog. Your biography, case
summaries, contact details, and photos belong in your own content folder.

## Shared requirements: Windows and Linux

Both systems run the same editor, website preview, and static website builder.
Install the computer-level requirements using the instructions for your operating
system below.

| Requirement | How it is provided |
| --- | --- |
| **Node.js 24.x** | Install Node 24 with npm. The optional Linux devenv shell supplies both for you. Select version 24 explicitly; a newer major version is not supported by this V1 launcher. |
| **npm** | Included with the Windows Node installer and the Nix Node package. It installs the project's application libraries. |
| **A web browser** | Use an existing Edge, Firefox, Chrome, or another modern browser for the editor and preview. |
| **Internet for initial setup** | Needed to download the app and its locked dependencies. |
| **Writable local folders** | Keep the builder, editable investigator content, and generated releases in separate folders. |

The launcher automatically installs the libraries in `package-lock.json`,
including Astro, TypeScript, the charts, search, and image-processing packages.
It uses `npm ci --include=dev`, so editor and build dependencies are installed on
both Windows and Linux. Each computer downloads the packages for its own operating
system; keep its `node_modules/` local to that installation.

**Windows users receive the same application dependencies through npm.** They do
not need to download Astro or TypeScript separately. Nix, devenv, Fish, and direnv
are optional Linux development tools, rather than additional Windows prerequisites.
The supported app workflow does not require Python, Visual Studio build tools,
a global Astro installation, or a Cloudflare command-line tool.

Git is optional on either system: it is useful for source checkouts and updates,
while a downloaded ZIP can be used without Git.

## Shared workflow

After completing the Windows or Linux setup below:

1. Start **Investigator Website Builder** and keep its launcher window open.
2. Create a blank content pack or open an existing folder containing `site.json`
   and `content/`. Keep that folder outside the builder.
3. Under **Profile & pages**, edit the profile, contacts, and pages. Add cases and
   reusable records to their libraries, then select their placement on the pages.
4. Choose **Save working draft → Review changes → Apply as draft**.
5. Under **Preview & release**, choose **Start local preview** and open its link.
   Keep the editor and preview in separate browser tabs. Applied changes appear
   in the preview.
6. When content is approved, apply referenced records as published before their
   pages. Publish the Home page, run **Check content**, then **Build published
   release** into a new folder outside the builder and content folders.
7. Upload that generated website folder to the investigator's existing Cloudflare
   project. Later local edits reach the public website when you build and upload
   a new release.

The editor normally opens at `http://127.0.0.1:4310/` and its managed preview at
`http://127.0.0.1:4323/`. Use the actual links shown by the builder. **Ctrl+C** in
the launcher window stops the editor and its owned preview.

Working drafts and recovery copies stay in the content folder's private
`.website-editor/` directory. Back up the whole content folder, including that
directory and your photos. See the [editor guide](docs/editor.md).

## Windows: install and start

### Install the Windows prerequisites

| Program | Installation |
| --- | --- |
| **Node.js 24 with npm — required** | [Official Node.js download](https://nodejs.org/en/download/). Select **24.x LTS**, **Windows**, and **Windows Installer (.msi)**. |
| **Browser — required** | Use an existing Edge, Firefox, or Chrome. If needed, [install Firefox](https://www.mozilla.org/firefox/new/). |
| **Git — optional for working on the source** | [Git for Windows installer](https://git-scm.com/install/windows). The builder app ZIP works without it. |

For Node, choose **x64** for a typical Intel/AMD computer, or **ARM64** for an ARM
computer. Open the MSI, choose **Next**, accept the license, and keep the default
destination and features, including **npm package manager** and **Add to PATH**.
Leave the optional additional tools for native modules unchecked if offered.
Choose **Install**, approve the Windows installation prompt, and select **Finish**.
Close old command windows so a new launcher can find Node.

To check the installation, open **Command Prompt** from the Start menu:

```text
node --version
npm --version
```

Node should print `v24.` followed by the rest of its version; npm should print its
version. No GitHub login, Nix, WSL, or PowerShell policy change is needed to use the
downloaded app.

### Download and launch

1. Download [the latest Windows builder ZIP](https://github.com/rgmundo524/Investigator-website-builder/releases/latest/download/investigator-website-builder-windows.zip)
   from [GitHub Releases](https://github.com/rgmundo524/Investigator-website-builder/releases/latest).
   Choose `investigator-website-builder-windows.zip` under **Assets**.
2. In File Explorer, right-click the ZIP and choose **Extract All**.
3. Open the extracted `investigator-website-builder` folder and double-click
   **Start Builder.cmd**. The first launch installs the application dependencies
   and opens the editor in your browser.
4. Follow the **Shared workflow** above. Keep the launcher window open while you
   work.

If using a source checkout instead, open PowerShell in its folder and run:

```powershell
npm.cmd start
```

`npm.cmd` uses the npm installed with Node without invoking a PowerShell script.
See the [Windows guide](docs/windows.md) for installer screens, folder selection,
updates, and troubleshooting.

## Linux: install and start

Download **Source code (zip)** or **Source code (tar.gz)** from the
[latest GitHub release](https://github.com/rgmundo524/Investigator-website-builder/releases/latest)
and extract it, or use a source checkout. Open a terminal in that source folder.
The source download includes the Nix/devenv files; the Windows app ZIP omits that
optional development tooling.

### NixOS: install through your configuration

For the direct Node setup, add these entries to the existing
`environment.systemPackages` list in your NixOS configuration, commonly
`/etc/nixos/configuration.nix`:

```nix
environment.systemPackages = with pkgs; [
  nodejs_24  # Node.js 24 and npm
  unzip     # Extract ZIP downloads; unnecessary if using another extractor
  xdg-utils # Optional: lets the launcher open the browser automatically
  # git     # Optional: clone and update source using Git
];
```

Apply the change using your usual NixOS rebuild command:

```sh
sudo nixos-rebuild switch
```

Use your existing flake target if that is how you manage your system. Open a new
terminal and check `node --version` and `npm --version`. See the
[official NixOS configuration guide](https://wiki.nixos.org/wiki/NixOS_system_configuration)
for configuration and rebuild details.

For other Linux distributions, install **Node.js 24 and npm** through your normal
package manager or the [official Node.js installation options](https://nodejs.org/en/download/).
Confirm `node --version` reports `v24.x`. Install your distribution's archive
extractor if needed. `xdg-utils` is optional; you can open the editor's printed URL
manually.

### Start with Node and npm

In the extracted builder/source folder, run:

```sh
npm start
```

The launcher installs the locked project dependencies and opens the editor.
Follow the **Shared workflow** above, including **Start local preview** in the UI.
You can preselect a content folder on either system:

```sh
npm start -- --data-dir "../alex-site-data"
```

Use `npm.cmd` for the same command in Windows PowerShell.

### Optional Linux setup: the project's devenv environment

Use this route when you want Nix to supply the project's Node/npm version and
development tools. A separate system-wide Node installation is unnecessary for
this route. The source includes `devenv.nix`, `devenv.yaml`, and `devenv.lock`.

On NixOS, add `devenv` and `git` to your system package list and rebuild:

```nix
environment.systemPackages = with pkgs; [
  devenv
  git
  # xdg-utils # Optional automatic browser opening
];
```

On another Linux distribution, follow the
[official Nix/devenv installation instructions](https://devenv.sh/getting-started/).
Use devenv **2.1 or later**, as required by `devenv.yaml`. From the source folder:

```sh
devenv shell
npm start
```

The shell supplies Node 24, npm, Git, and Fish, and installs the locked application
packages on activation. The checked-in `devenv.nix` already selects `pkgs.nodejs_24`.
By default it also preselects `templates/investigator-site`. Choose **Change
folder** to open or create your separate content pack, or use the explicit
`npm start -- --data-dir "../alex-site-data"` command above.
Optional direnv integration is available through `.envrc`; it is not needed to run
`devenv shell` manually.

Choose **Start local preview** in the builder to get the same editor-plus-preview
workflow as Windows. `devenv up` starts the standalone website process only.
See [local development](docs/local-development.md) for environment details.

## Shared content and site settings

The editing application, editable content, and generated website are separate:

```text
investigator-website-builder/    # Shared application
  src/                           # Layout, components, charts, styling
  scripts/                       # Editor, validation, and build helpers
  templates/investigator-site/   # Blank content pack
  examples/site-data/            # Fictional examples

alex-site-data/                   # One investigator's editable content
  START-HERE.md                  # Fill-in instructions
  site.json                      # Domain, locale, and appearance
  content/                       # Profile, pages, cases, reusable records
  assets/                        # Photos, logos, and credential images
  public/                        # Files deliberately published unchanged
  .website-editor/               # Private working drafts and recovery copies
  record-templates/              # Copy when adding optional records

alex-site-release/                # Generated published website for Cloudflare
  index.html
```

Only published content, selected image assets, and `public/` feed a production
website. Instructions and record templates are not rendered. Keep original case
reports and private notes outside public content and assets.

The investigator's `site.json` contains:

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

Published sites are indexable by search engines. Local development and draft
review builds use `noindex`; the built-in case search remains available.

## Optional shared command-line workflow

The UI provides content checks, preview, and published packaging on both systems.
For terminal use, run commands from the builder folder and explicitly select the
investigator's data. Relative paths resolve from that folder.

**Linux shell:**

```sh
export SITE_DATA_DIR="../alex-site-data"
npm run check
```

**Windows PowerShell:**

```powershell
$env:SITE_DATA_DIR = "C:\Websites\Alex content"
npm.cmd run check
```

Use `npm.cmd` in place of `npm` for the table below when using PowerShell.
Without a content selection, ordinary preview/check commands use the blank pack;
`site:package` requires an explicit content folder.

| Command | Purpose |
| --- | --- |
| `npm start` | Open the builder; start its managed preview from the UI |
| `npm run dev` | Standalone website preview including drafts, normally port 4321 |
| `npm run check` | Validate selected content and check the site code |
| `npm test` | Run behavioral tests; requires the full source download/checkout |
| `npm run build:drafts` | Build a review copy in `dist-drafts/` |
| `npm run preview:drafts` | Preview that review copy |
| `npm run build` | Build published content in `dist/` |
| `npm run preview` | Preview the last published build |
| `npm run site:package -- ../alex-site-release` | Build the published website into a new upload folder |

Run builds for different investigators sequentially in a checkout because each
published build replaces `dist/`. Keep `CONTENT_PREVIEW` unset for published
packaging. All blank content starts as `publication_status: draft`; publish
approved records and the Home page before packaging.

Use a separate Cloudflare project for each investigator and reuse it for later
deployments. Only upload the generated published release. These commands prepare
local files and do not deploy them. See the [Cloudflare guide](docs/cloudflare-pages.md).

## Share a blank content pack

The builder can **Create blank content pack** on its welcome screen. To create a
ZIP for someone to fill in without running the app, use either operating system:

```sh
npm run site:template -- ../investigator-website-template.zip
```

Or create a blank folder directly:

```sh
npm run site:init -- ../alex-site-data
```

Use `npm.cmd` in Windows PowerShell. Both commands require a new destination and
refuse to overwrite existing work. The [blank pack](templates/investigator-site/START-HERE.md)
contains prepared pages, blank profile/contact forms, standard investigation
categories, and copyable record templates. It contains no real cases or invented
achievements. Node is needed to run the app, not to fill in the Markdown files by
hand. [Fictional examples](examples/site-data/README.md) remain separate references.

## Share and update the builder

To make the Windows distribution from a reviewed source checkout with Node 24:

```sh
npm run builder:package -- ../investigator-website-builder-windows.zip
```

Use `npm.cmd` in Windows PowerShell. The ZIP includes the launcher, shared source,
blank pack, examples, and instructions. It excludes Git history, installed
dependencies, generated websites, private editor history, and personal catalogs.

Publish each updated app as a new [GitHub release](https://github.com/rgmundo524/Investigator-website-builder/releases/latest)
using the same asset filename. The
[latest Windows download link](https://github.com/rgmundo524/Investigator-website-builder/releases/latest/download/investigator-website-builder-windows.zip)
then serves the new version. Follow the [release guide](docs/releases.md).

On either system, save your edits and stop the old builder before updating.
Extract the new app/source into a fresh folder, start it using your platform's
instructions, and open the same existing content folder. Each installation
prepares its own dependencies. Back up the content folder separately. App updates
are manual downloads; an investigator's content changes only need a new website
build and deployment.

## More detail

- [Windows setup](docs/windows.md) and [Linux/devenv setup](docs/local-development.md)
- [Editor, review, and recovery](docs/editor.md)
- [Content folder layout](docs/external-content.md) and [writing records](docs/content-guide.md)
- [Case fields](docs/case-tracker.md), [page structure](docs/page-structure.md), and [photos](docs/portrait-photos.md)
- [Contacts](docs/contacts.md), [credentials](docs/credentials.md), and [About sections](docs/about-content.md)
- [GitHub releases](docs/releases.md) and [Cloudflare deployment](docs/cloudflare-pages.md)

This is the version-one format. This checkout is named
`Investigator-website-builder`; its folder name does not select an investigator's
content. No third-party reuse license has been added. The shared source and each
investigator's private content have separate ownership and publication decisions.
