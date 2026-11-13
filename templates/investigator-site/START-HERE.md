# Your investigator website

This folder is a fill-in form for your personal website. It contains no sample clients, cases, jobs or qualifications. You can complete it in a text editor; no programming or hosting setup is required.

1. Open `content/profile/investigator.md` and add your name and headline.
2. Open `content/contacts/investigator.md` and add the public contact methods you want to share.
3. Fill in the writing prompts in `content/pages/`, including your biography on About. Pages choose which reusable records appear and their order. The visible Contact introduction is in `content/contacts/investigator.md`; the Contact page file controls its title and description. Keep the seven page filenames and the word `investigator` in profile/contact references.
4. For each real case, job or credential you want included, copy the matching form from `record-templates/` into the matching `content/` folder and complete it. The [README](README.md) explains where each form goes.
5. Add your photos to `assets/` and assign portraits on each page in the builder. Include only images suitable for a public website. Keep confidential reports, evidence and private notes outside this folder.
6. Leave every `publication_status` set to `draft`. Your coordinator will review and publish the finished content.
7. Return this completed folder, or ZIP the whole folder and send it back. Include your photos. Keep unknown optional dates and amounts as `null`, leave optional lists as `[]`, and add notes if you need help.

You may leave optional sections empty. Do not invent dates, counts, recoveries or qualifications to fill a field. If a record needs a required date you do not know, leave its form in `record-templates/` and tell the coordinator.

**This is website content, not a finished website.** The coordinator will unzip it and use the shared builder to preview and publish it. Do not upload this ZIP to website hosting.

## Optional local editor — with the shared builder

If you or your coordinator have the shared builder installed, you can use local
forms instead of editing the Markdown files directly. From the builder folder:

```sh
SITE_DATA_DIR=../investigator-site npm run editor
```

Use the actual path to this unzipped content folder. Open the local address
printed in the terminal. **Save working draft** saves incomplete work separately;
**Review changes** compares it with the website record. **Apply as draft** makes
it visible in the local preview. Leave publication to the coordinator.

In a page editor, **Insert shared value** reuses your profile name, headline or
public contact details in page text. Update the source record once and its
references update in the next preview or build. Personal and organization
contacts are listed separately. Leave the contact card's optional display-name
override blank to use your profile name there too.

Complex optional fields are under **Additional fields · JSON**. You can leave
them unchanged and ask the coordinator for help. Working drafts and backups of
replaced text are stored in the private `.website-editor/` directory in this
folder; include it when returning unfinished editor work. It does not belong in
public assets.

This editor runs on your computer. **Build published release** prepares website
files but does not upload or deploy them. The full workflow is in the shared
builder's [editor guide](../../docs/editor.md); if this pack was sent separately,
ask the coordinator for that guide. You can still complete and return the pack
without installing the builder.

## Preview the completed pack — coordinator

The shared project is called **Blockchain Investigator Site**; its suggested
folder name is `blockchain-investigator-site`. The builder's folder name does
not determine whose website is shown. `SITE_DATA_DIR` selects that person's
content folder. Renaming an existing builder checkout is optional.

For example, keep the builder and the completed pack beside each other:

```text
Projects/
  blockchain-investigator-site/   # Shared website builder
  investigator-site/              # Completed, unzipped content pack
```

Use Node.js 24. Open a terminal in the builder folder and install its dependencies
once:

```sh
cd /path/to/Projects/blockchain-investigator-site
npm ci
```

Check the completed pack, then start its local website:

```sh
env SITE_DATA_DIR="../investigator-site" npm run check:content
env SITE_DATA_DIR="../investigator-site" npm run dev
```

Open the local address printed in the terminal. Press Ctrl+C to stop the preview.
Replace `../investigator-site` with the actual content folder. It must contain
`site.json` and `content/`; do not point it at `content/cases/` or at a ZIP file.
An absolute path also works:

```sh
env SITE_DATA_DIR="/full/path/to/investigator-site" npm run dev
```

Include `SITE_DATA_DIR` on each command. Without a selection, the builder uses
its blank template. These commands do not change the selected person's files or
publish anything. Local preview includes drafts.

To build a local review copy:

```sh
env SITE_DATA_DIR="../investigator-site" npm run build:drafts
npm run preview:drafts
```

After reviewing and marking ready records `published`, create a new static
release folder:

```sh
env SITE_DATA_DIR="../investigator-site" npm run site:package -- ../investigator-site-release
```

This builds the selected content but does not upload it. Upload the release
folder to the intended hosting project, not this editable content pack.
