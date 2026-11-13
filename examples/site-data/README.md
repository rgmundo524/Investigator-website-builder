# Example investigator website content

This folder demonstrates all seven website pages and the reusable content
libraries. Its cases, career history, qualifications, activities, and skill
ratings are fictional examples. All records start as drafts. Articles are
inactive in this example.

For a real investigator's website, the [blank pack](../../templates/investigator-site/START-HERE.md)
is the recommended starting point. Use this example to understand the fields,
page selections, and classification hierarchy.

## Open a separate example copy on Windows

1. Extract the Windows builder ZIP with **Extract All**. Install Node.js 24,
   including npm, as described in the [Windows guide](../../docs/windows.md).
2. In File Explorer, copy the whole `examples/site-data` folder to a new location
   outside the builder. Rename the copy, for example to
   `C:\Websites\Example site data`. Keep `site.json`, `content`, and any `assets`
   or `public` folders together. Leave the bundled example unchanged.
3. Double-click **Start Builder.cmd** in the extracted builder folder. Keep its
   window open while you work; the first start downloads dependencies.
4. In the local editor, choose **Open a folder** and select your copied folder.
   Select the folder containing `site.json` and `content`, rather than a ZIP or
   a collection such as `content/cases`.
5. Open **Preview & release**, choose **Start local preview**, and open its ready
   link. Use **Save working draft → Review changes → Apply as draft** to make
   edits appear in the preview. Apply page changes separately from record edits.

Save your work and press **Ctrl+C** in the launcher window to stop the builder
and its managed preview. These editable files and the local preview are not
finished files to upload to Cloudflare.

## What to edit

| Location | Contents |
| --- | --- |
| `site.json` | Website domain, language, number/date format, and appearance |
| `content/profile/your-name.md` | Shared name, headline, initials, and optional public location |
| `content/pages/` | Page introductions and biography, enabled sections, record selections and order, skill groups, and page-specific portraits |
| `content/experience/` | Two example roles with dates for the timeline |
| `content/expertise/` and `content/callouts/` | Expertise descriptions and your approach |
| `content/credentials/` and `content/education/` | Three credentials across two issuers, plus an education example |
| `content/cases/` | Seven fictional completed cases with category paths, dates, and metrics |
| `content/charts/` | Criminal and litigation support category definitions |
| `content/projects/` | Selected-work example |
| `content/skills/` | Six skill descriptions with illustrative ratings |
| `content/activities/` | Volunteer, professional organization, and DAO examples |
| `content/interests/` | Two hobby examples |
| `content/repositories/` | GitHub record, hidden until configured with a real account and enabled |
| `content/contacts/your-name.md` | Contact-page introduction, two organization service cards, and a personal/social card |
| `content/resources/` | Four official resource links, one in each resource category |
| `assets/` | Local portraits; logos in `organizations/`, personal photos in `images/personal/`, and credential badges in `credentials/` |

Start with your profile and site URL, then edit one section at a time. The summary
for a card is `description_short`; the body below the second `---` is the full text.
The `blocks` map contains named text fields used by the relevant page or
component. Your public biography belongs to the About page.

Keep existing `slug` values while editing the first draft. If you rename a slug,
update references in pages and linked records. Each job, credential, skill, hobby,
project, and case has its own file. Pages choose where reusable records appear;
adding a record does not place it on a page automatically. Select it in an
enabled section, or use automatic library selection where offered. About's
`skill_groups` holds the group names, selected skills, and their order; skills
do not have a record-owned `group` field. Issuer order is in
`content/pages/credentials.md`. Assign photos on each page rather than the
shared profile. Slugs may appear in public URLs or anchors.

The About introduction is `.mdx` to demonstrate the existing Callout component.
The individual content records use ordinary `.md`. Both use the same frontmatter
and references. No CMS or additional package is needed for this starter.

## Examples and publishing

All seven cases have `content_kind: example`. The chart/search preview uses their
fictional counts and amounts while actual case totals stay separate. A
`subcategory` list is one path from broad to specific, not several equal tags.
Compare case-001 and case-002, then case-005 and case-006, to see sibling branches.
The casebook is for completed work; there is no active/on-hold case status.
Draft and published describe website publication readiness.

Skills and activities also use `content_kind: example`. Replace the information
before changing them to `profile`. Replace fictional case details before changing
cases to `case_study`. Unknown optional facts can remain `null` or empty; keep
incomplete required information in draft. The example job dates,
credential names, and skill scores are not facts about you.

Contact links use example.com/example.org and need replacing. No real email,
phone, booking link, portrait, certification seal, GitHub account, or affiliation
is implied. After adding a real GitHub owner/repository, update the corresponding
`github_groups` account and enabled flag in `content/pages/about.mdx`.

Use **Check content** while editing. The local preview includes applied drafts.
A published release includes published records only: publish approved selected
records before their pages, including the Home page. Examples cannot be
published as real skills, activities, or cases. Keep original reports, private
notes, wallet secrets, and evidence outside website content and public assets.
Everything in `public/` is copied into the website unchanged; include only files
you intend to make public.

## Optional terminal workflow

With Node.js 24 installed, the same launcher works from a source checkout on
Windows, macOS, or Linux. Run this from the builder folder, using your copied
content folder's path:

```sh
npm start -- --data-dir "../example-site-data"
```

To create a copy with the export command instead of File Explorer, use a new
destination outside the builder. In Windows PowerShell:

```powershell
$env:SITE_DATA_DIR = "examples/site-data"
npm.cmd run content:export -- "../example-site-data"
```

On macOS or Linux:

```sh
SITE_DATA_DIR=examples/site-data npm run content:export -- ../example-site-data
```

The export command validates and copies `site.json`, `content/`, and any
`assets/` or `public/` folders. It refuses to overwrite an existing destination.
It does not copy this README or private editor history. Use the selected copy
with the launcher above; no developer shell is required. See the
[editor guide](../../docs/editor.md) and [content-folder guide](../../docs/external-content.md)
for the remaining controls and publication workflow.
