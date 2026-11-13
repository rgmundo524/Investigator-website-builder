# One content folder per investigator

The builder is shared. Each investigator's Markdown and photos are kept in a
separate folder or private repository. The standard fill-in pack uses the same
seven pages and blockchain-investigation case structure for everyone.

## Start with the blank pack

```sh
npm run site:init -- ../alex-site-data
```

Or make a ZIP to send to someone:

```sh
npm run site:template -- ../investigator-website-template.zip
```

The recipient unzips the pack, reads `START-HERE.md`, fills in their details, and
returns the folder. They can use an ordinary text editor. The builder reads the
unzipped directory, not a ZIP file.

## Folder contract

| Path | What belongs here |
| --- | --- |
| `site.json` | Website domain and appearance |
| `content/profile/` | Name and headline (portraits and biography belong to Pages) |
| `content/contacts/` | Public contact details and professional links |
| `content/pages/` | Prepared page introductions and record selections |
| Other `content/` collections | Jobs, credentials, cases, expertise, and optional supporting records |
| `assets/` | Publishable photos and badge images |
| `public/` | Files deliberately copied unchanged to the website |
| `record-templates/` | Blank records to copy into the matching `content/` collection |
| `START-HERE.md` | Instructions; not rendered |

Keep record identifiers and prepared page selections consistent. Each additional
record needs a unique `slug`. Most optional sections discover their records as
explained in the pack; others use the page's selected slug list.

Builds remove unreferenced generated raster images from `_astro/` and strip
embedded metadata from published JPEG, PNG and WebP images. Selected image
filenames remain visible in public URLs. Keep `assets/` suitable for publication:
custom code with computed image URLs can require keeping additional files.
Files deliberately placed in `public/` are retained, including unreferenced
images. Keep confidential reports and review notes elsewhere.

## Select the folder

From the builder repository:

```sh
SITE_DATA_DIR=../alex-site-data npm run dev
SITE_DATA_DIR=../alex-site-data npm run check
SITE_DATA_DIR=../alex-site-data npm run build
```

The chosen folder supplies all site content; it is not merged with another
investigator's records. Invalid paths stop the command. With no selection,
preview uses the blank pack in `templates/investigator-site`.

For devenv, save this in the ignored `devenv.local.nix`:

```nix
{
  env.SITE_DATA_DIR = "../alex-site-data";
}
```

Or select it for a session:

```sh
devenv -O env.SITE_DATA_DIR:string ../alex-site-data shell
```

Relative paths resolve from the builder root. Quote paths containing spaces.
Use strings, not Nix path literals, so private content stays outside the Nix
store. The builder uses inherited variables and does not load `.env` files.

Restart development after switching folders or settings. Run builds sequentially
in one checkout: content caches are separated, but generated types and output
folders are shared.

## Copy or package existing work

`npm run content:export -- ../copy-of-data` copies the selected `site.json`,
`content/`, `assets/`, and `public/` to a new external folder. It does not copy
private review notes or delete the original. For a new investigator, use
`site:init` instead; it includes the blank pack's instructions and templates.

`npm run site:package -- ../alex-site-release` builds and copies the **published
website**. Set `SITE_DATA_DIR` explicitly. See [Cloudflare deployment](cloudflare-pages.md).

The data folder may be maintained in a private repository independently of the
builder. MDX is trusted executable build input; ordinary Markdown is sufficient
for filling in this pack. No source reports need to be sent to the web host.
