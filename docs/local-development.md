# Local development with devenv

`devenv.nix` provides Node 24, npm, Git, and a foreground site process. It also
enables `languages.javascript.npm.install.enable`, which installs Astro and the
other project dependencies during environment activation. Astro is pinned in
`package-lock.json` and installed into this project's `node_modules/` directory.
devenv adds the local executables to the environment's PATH.

For the same editor and managed website preview used on Windows, run:

```sh
devenv shell
npm start
```

Create or open a separate content folder in the builder, then choose
**Preview & release → Start local preview**. The default environment preselects
`templates/investigator-site`; choose **Change folder** to select your separate
content pack. No separate system-wide Node
installation or manual `npm ci` step is required for this route. The first
activation needs network access for uncached dependencies. Use the full source
download/checkout: the Windows app ZIP does not include the Nix/devenv files.
See the [README setup sections](../README.md#linux-install-and-start) for the
NixOS package configuration and the direct Node/npm alternative.

For the standalone website process only, run `npm run dev` inside the shell,
or use `devenv up`. That process does not start the builder editor.

## Reproducibility

Run `devenv shell` and commit the resulting `devenv.lock` after successful
activation. The existing `devenv.yaml` already selects an exact nixpkgs commit.
Update the input deliberately when you want a newer Node/Nix package set; then
regenerate and commit the lockfile. npm's separate lockfile is already included.

On activation, devenv checks the dependency inputs and installs the locked graph
when needed. With `package-lock.json` present, its npm integration uses
`npm clean-install` (equivalent to `npm ci`). This installs the recorded versions;
it does not upgrade dependencies. Re-enter the environment after pulling changes
to the dependency files.

For intentional dependency changes, edit the manifest and use `npm install`
inside the devenv shell to update the lockfile. Commit both files together.
The optional `site-setup` command forces a clean reinstall for troubleshooting.

The example input is documented by [devenv's input guide](https://devenv.sh/inputs/).
See [JavaScript options](https://devenv.sh/languages/javascript/) and
[process management](https://devenv.sh/processes/).

## Local settings

Use `devenv.local.nix` or `devenv.local.yaml` for machine-specific overrides; both
are ignored by Git. The optional `.envrc` enables direnv integration. Export
`TAILSCALE_HOSTNAME` in the shell before starting Astro if using Tailscale Serve.
Astro reads the shell environment rather than loading a copied `.env` file.

## Serving through Tailscale

Astro listens on `127.0.0.1`. Set the exact Tailscale hostname so Astro accepts the
proxy's Host header, then run `tailscale serve 4321` in a separate terminal. Use
the actual port printed by Astro if it differs. Ctrl+C ends the foreground Serve
session. For an existing background Serve configuration, inspect
`tailscale serve status` before changing it.

Tailscale Serve is restricted to the tailnet and provides a tailnet HTTPS name.
It may request enabling tailnet HTTPS on first use. Tailscale is assumed to be
installed and managed on your host OS; it is not installed as a development daemon.

For a permanently running version on your home server, use `npm run build` and
serve the resulting `dist/` through your normal static web server, then point
Tailscale Serve at that server. `astro preview` is a development preview, not a
production server. [Tailscale documentation](https://tailscale.com/docs/features/tailscale-serve)

## Cloudflare Pages later

When ready, create a Pages project with Git integration and authorize access to
this repository. Set Node 24, build command `npm run build`, and output directory
`dist`. Keep `CONTENT_PREVIEW` unset. The same validation runs locally and there.

Git integration can later have automatic builds disabled while still accepting
manual Wrangler deployments. A Direct Upload project cannot later enable Git
integration without creating a new project.

Add the investigator's domain to the Pages project's custom domains at launch. Serving
the apex through Pages requires Cloudflare nameservers; registration can remain
with the existing registrar. No GitHub Actions workflow is needed.

References: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/),
[build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
