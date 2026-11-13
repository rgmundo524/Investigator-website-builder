# Publish builder downloads on GitHub

Colleagues download the editing app from [GitHub Releases](https://github.com/rgmundo524/Investigator-website-builder/releases/latest).
Use the asset named `investigator-website-builder-windows.zip`. They can use this
same link for each update:

<https://github.com/rgmundo524/Investigator-website-builder/releases/latest/download/investigator-website-builder-windows.zip>

GitHub's **Code → Download ZIP** contains a source snapshot. The release asset
is the prepared distribution with its launcher, blank pack, and instructions.
The public download does not require colleagues to install Git or sign in to
GitHub. [GitHub documents how the latest-release link follows new releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).

## Prepare a new version

1. Finish and review the shared builder changes. Update `version` in both
   `package.json` and both package version fields in `package-lock.json`
   (the top-level `version` and `packages[""].version`) for the new version,
   for example `1.0.1`. Commit and push the reviewed source.
2. Wait for the Windows and Linux checks to pass for that exact commit. The
   **Builder checks and Windows package** workflow tests the editor, managed
   preview, published website build, shutdown, and native Windows ZIP extraction.
3. In the successful workflow run, download the artifact named
   **investigator-website-builder-windows**. GitHub wraps artifacts in a ZIP;
   extract it once to obtain `investigator-website-builder-windows.zip`.
   Upload that inner app ZIP as the release asset. Workflow artifacts expire
   after 30 days; published release assets are the distribution channel.
4. On the repository's **Releases** page, choose **Draft a new release**. Use a
   new tag matching the version, such as `v1.0.1`, pointing to the commit that
   passed the checks. Give the release a title and a short description of the
   changes. Attach the app ZIP under **Assets** using the exact filename
   `investigator-website-builder-windows.zip`.
5. Publish it as a normal release and set it as the latest release. Open the
   shared download link and confirm it downloads the new app. Keep previous
   releases available so an older version can still be downloaded if needed.

Publishing a release is a deliberate maintainer step. A source push runs checks
and prepares an artifact; it does not automatically publish a release. Keep the
asset filename the same between versions so colleagues' saved link keeps working.
The version inside `DISTRIBUTION.json` identifies each app download.

For a local package instead of the Windows workflow artifact, run this from a
reviewed source checkout with Node.js 24 installed, choosing a new destination
outside the builder:

```sh
npm run builder:package -- ../investigator-website-builder-windows.zip
```

That command refuses to replace an existing ZIP. Test the exact source revision
on Windows before publishing it. The GitHub Actions artifact has already been
packaged and extracted on Windows.

## What colleagues do when an update is available

Save any current edits, then stop the old builder with **Ctrl+C** in
its launcher window. Download the latest app ZIP and extract it into a fresh
folder. Run **Start Builder.cmd** from the new copy and open the same existing
content folder. The new app prepares its own dependencies at first launch.
They keep their content and backups outside the builder folder.

App updates are manual downloads. The app does not update itself, and sharing a
new builder release does not publish changes to anyone's Cloudflare website.
Changes to an investigator's own biography, photos, or case catalog need a new
website build and deployment, rather than a shared builder release.
