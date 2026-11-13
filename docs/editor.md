# Investigator Website Builder

From the builder checkout, start the editor with the unzipped content folder selected:

```sh
SITE_DATA_DIR=../alex-site-data npm run editor
```

Use Node.js 24 and run `npm ci` once if dependencies are not installed. An absolute `SITE_DATA_DIR` also works. To choose a folder in the editor instead, run `npm run editor` without a selection. Open the local address printed by the command, normally `http://127.0.0.1:4310/`.

Select the unzipped investigator content folder containing `site.json`, `content/`, and the photos you want to use. **Change folder** switches investigators; the previous site's local preview stops. Investigator Website Builder works with local files and does not upload the folder or deploy a website. Keep the editor and its draft preview on your computer rather than exposing them through a public tunnel or hosting service.

## Save, review and apply

Under **Cases**, the same nested pie charts used on the website filter the case
list by investigation group, category, or subcategory. Click a slice to drill
down or select a level in the **All / investigation / category / subcategory**
path to move back up. **All** and **Clear category filter** clear the selection.
Search narrows the selected category further. **View matching cases** jumps to
the list, where selecting a case opens its editor. The charts include saved
working drafts and refresh after a save; unsaved form changes are kept when you
change a filter. **Cases outside these charts** provides access to records with
missing or unrecognized classifications. Each chart also has a keyboard-friendly
category list under **Browse categories and subcategories**.

1. Open a record under **Cases** or **Profile & pages**, or choose **New case** or **New record**. Edit the labeled fields and the narrative. Unknown optional dates and amounts can remain empty.
2. Choose **Save working draft**. This saves your incomplete work separately; it does not replace the website record and does not yet change the preview.
3. Open **Review changes** to compare the saved draft with the current record. Resolve the listed validation problems before applying it.
4. Choose **Apply as draft** to update the local website record while leaving it unpublished. It can now appear in the local draft preview.
5. After the coordinator reviews the finished content, **Apply as published** makes it eligible for the next production build. This still does not change a live website. The casebook contains completed work only and has no lifecycle status selection. Site settings use **Apply settings** instead.

The review action buttons stay at the top of the review pane, above the changes,
and remain visible while scrolling through a long review.

**Discard draft** removes the working draft and keeps the existing website record. If someone changes the same source file outside the editor, reload it before continuing; the editor rejects applying an outdated draft over the changed file. It also rejects stale saves, applications and discards when another editor tab has changed the working draft; reopen the record and review the latest version.

Cases use the report-cover **Case number** as their visible identifier. **Public description** explains the work anonymously. **Scope of work** describes the commissioned work, assets or transfers examined, and relevant period, with contextual prompts for criminal and civil matters. Work commissioned is optional: leave it blank when an older report does not document it. A blank field does not block saving or publication and is omitted from the public case page. An investigative question is not automatically copied into this field. Wallet and transaction counts are not collected for the public portfolio. The fixed services checklist is absent pending the GoCrypto package definitions.

Reported amounts are treated as transaction-time values by default. There is no separate valuation-date field. Use **Amount source & limitations (optional)** for an alternative valuation date or basis, an estimate, or any source limitation. The editor does not calculate exchange rates or revalue entered amounts.

**Jurisdictions** in **Scope of work** provides searchable checkboxes for countries and territories. Select as many as apply; searching does not clear selections. The standard choices keep names consistent, and any existing custom values remain selectable so editing a case does not lose them. This field describes geographic jurisdictions, not specific law enforcement agencies.

## Profile & pages

The list is grouped into **Profile & contact**, **Pages**, **Career** (jobs only), **Education**, **Credentials** (certifications, certificates, and training), **Expertise**, **Skills**, **Projects**, **Interests & community**, **Resources & writing**, **Settings**, and any remaining supporting content under **Other**. Expertise contains area-of-expertise cards; Skills contains the individual entries used within skill-group cards. Pages are separate from the reusable entries shown inside them. Each group has its own search and remembers the selected record while you work.

Career, Education, Credentials, Expertise, Skills, and Projects are reusable libraries. Edit each record's content there once. The same record can appear on several pages; changing it updates all of those uses at the next preview or build. Editing a record does not change page placement.

Skills, interests, and community activities have a **Heading icon** selector with a preview. Choose **Choose icon visually** to browse or search the full installed Lucide collection. Results are paged so the picker stays responsive; only the icons used by a page appear in its generated HTML. Skills also have a **Skill assessment** section with a linked number field and slider for ratings from 1 to 5 in half steps, plus an optional assessment date. The level description updates as you adjust either control. A blank number displays the skill without a score, including after publication, and disables the slider until you enter a valid rating. Choose **Dots** or **Stars** inside a page’s Skills section. Group membership and ordering remain on the page.

Community activities have fields for activity type, organization, role, participation details, and participation dates. Changing the activity type does not move existing page selections. Projects have a **Your contribution** field. Public records also have **Reference links** with label and URL inputs and controls to add, remove, and reorder them. These form fields use the same save, review, and apply process as the rest of the builder; JSON is retained for the remaining advanced settings.

Selected page records have an **Edit record** shortcut, including skills inside their groups and the shared profile and contact sources. With unsaved page changes, the button becomes **Save draft & edit record**: it saves a working draft before opening the library record. If saving fails, the page stays open with its edits intact. Returning to **Pages** restores the saved page draft. This shortcut never applies changes to website content.

Open **Pages** to choose a page's sections, select records by name, and arrange sections and selected records with the order controls. Section headings and introductions belong to the page. Pages have no automatically enabled sections. A checked box includes a section in the page layout; an empty section has no website content to render. The status beneath the section header explains empty selections and distinguishes applied records available in the local preview from published records. Unapplied working drafts do not count as website content. Choose automatic discovery for jobs or credentials when you want future visible records included automatically; select individual records for a curated list. Automatic job lists use the job dates/display order; credentials retain their issuer groups. Skills use one nested group editor: arrange groups, select skills inside each group, reorder within a group, or move a skill to another group. Group membership is page-specific; descriptions and ratings remain reusable. Home has a fixed introduction layout with supported selection slots rather than the supporting pages' full section ordering.

The **Biography** section stores its Markdown on the page, normally About. **Written sections** adds page-only headings and Markdown passages, such as an explanation below Work History or Casework. Put the Written sections slot after the relevant record section, then arrange its passages. Reusable cards remain in their libraries; page-specific writing stays with its page.

Save and review the library record and the page separately. Apply changes only affects the file shown in that review, with revision checks and a recovery copy. A published page requires published selected records.

Every page, including Home, has a **Page portrait** section near its content basics. Choose or upload photos, arrange them, set an optional caption and control automatic rotation. **Show a portrait on this page** hides the portrait without losing its assignments. One photo is static; several photos cycle automatically when enabled, without public buttons or input controls. Pages with the same ordered photos preserve the current photo and remaining rotation delay during navigation. Each page owns its selection independently; the Profile record supplies identity details, not a shared image. An omitted or hidden portrait reserves no empty column. Article and investigation-category headers use their parent page's settings.

Page records also have **Photos on this page** for a separate gallery of personal photos. Credentials have **Credential badge**. Image controls show the preview, local filename, alternative text, and captions where supported. Removing an assignment leaves the file in place. The original source URL is a saved reference; the website loads the local image.

Under **Photos on this page**, **Photo section heading** and **Photo section subtitle (optional)** control that page's photo section. Home and About each keep their own text. An empty heading displays **Photos**; an empty subtitle displays no subtitle.

Employment records under **Career** have an optional **Organization logo** section. Use **Choose logo** for an existing file or **Upload logo** to add one to `assets/organizations/`. Logos appear beside job headings on an opaque light tile in both themes, without cropping. Save and review the assignment like any other record change; removing it leaves the image file in place.

Pages with a certifications and training section have **Issuing authority logos**.
Choose or upload an image for each issuer group, then save and review the page.
Each logo appears once beside its issuer heading; the individual credential
badges remain separate. The Credentials page in the blank pack places education
before certifications and training.

On a page other than Home, **Include the Personal photos section on this page** adds or removes that section from its composition. On Home, assigned page photos appear above the contact invitation, while **Page portrait** controls the photos beside the introduction. Save and review image assignments like other record edits. Uploading copies a new image into the content folder immediately and never overwrites an existing file.

Page editors include **Insert shared value**. Choose a value and the field where it belongs, then insert it at the cursor. Profile name, headline, visible location, and public personal or organization contact details are available. The field stores a reference rather than a copy; changing and applying the source value updates its uses on the next preview or static build. **Reload shared values** refreshes the displayed source values. Organization contacts remain separate from personal contacts. Hidden or disabled details are not offered.

Shared values work in page titles, search/sharing descriptions, short passages, page-owned biography and written sections, and Markdown (`.md`) body text. In an MDX page, they are available for the metadata and short passages, not the body. Use them as text rather than within code or link destinations. A missing, hidden, or disabled source produces a content-check error naming the reference; it is not silently published as a blank. The page’s selected profile supplies profile values. Contact values explicitly identify their source contact record and, for organizations, their service card. Existing text stays unchanged until you replace it with a shared value.

The personal contact card’s **Display name override** is optional. Leave it blank to reuse the selected profile name; enter a value only when the card should use a different name.

On **Pages → Contact**, the **Contact cards** section selects the shared contact record and provides **Edit record**. That opens the same record available under **Profile & contact**. Its **Organization contact cards** section has a visibility checkbox for each organization, editable enquiry descriptions, email, phone, website, enquiry button, optional booking settings, and controls to add, remove, or reorder cards. These settings apply to every page using that contact record. Save and review the contact record to apply the changes; editing the page alone does not alter the cards.

The **Personal contact card** has its own visibility checkbox, heading, display-name override, public email, and introduction. Existing phone numbers and social links are preserved when you edit the other fields.

Fields include an **On the website**, **Controls**, or **Not displayed** note explaining their effect before you edit. The notes distinguish visible content from settings and source-only text, including homepage exceptions and location visibility. Inside **Additional fields** or **Page composition**, expand **What these fields affect** for a guide to the JSON fields currently present. The guide updates as valid JSON is edited; an unfamiliar field is explicitly marked as lacking a display mapping. These notes do not change your content or publish anything.

The editor explains where each record's main fields appear. On pages, **Search and sharing description** is public metadata used by search engines and social previews even when it is not visible in the page body. The biography is edited on its page; the profile body remains saved source text and is not displayed. When a page selects a contact record, that record supplies its introduction.

Profile and employment records have **Show location on website**, unchecked by default. Existing location text stays hidden until you choose to show it. Use a city, region or broad work location rather than a private address. A visible profile location appears on the home page; a visible employment location appears with the job.

**Employment dates** contains one or more start/end month periods. Add another period when you returned to the same organization after a gap. Check **Current role** only for an ongoing period. If the dates are unknown, use **Dates are not documented** and record whether the role is current; the builder does not invent dates.

Education shows the institution, program, recorded study dates, and description. Its optional **University logo** section supports local images, uploads, replacement, and removal; the logo appears beside the education heading. It has no completion-status control or public completion label. Existing completion metadata is preserved locally. The type of study is local record metadata and does not add a public label. Credential records use the official name, issuer, issue year, and description, with optional expiration, training links, and verification links. There is no separate credential-type control or public label; existing type values are preserved locally.

Recognized website headings are separate from **Saved source text (not displayed)**. Existing unused summaries and custom blocks are preserved there without presenting them as required website content. **Private working note** is omitted from the website but remains in the source folder and content exports. Page selections and ordering have named controls. Less common settings remain under **Additional fields**.

See [the field-use and privacy review](profile-pages-audit.md) for the complete mapping and remaining advanced configuration.

## Off-chain leads

Both investigation groups include optional **Off-chain leads** checkboxes for IP addresses, email addresses, phone numbers, social media accounts and URLs. Check only types confirmed in the investigation. These are public summary labels; no actual addresses, account names, numbers or URLs are entered here. Leaving all unchecked omits the public leads row and does not assert that no such leads existed.

**CipherBait — not implemented** is visible but disabled and unchecked. It cannot be recorded as a used lead type. Existing case records are not automatically assigned any lead types.

## Source reports and case filenames

Each existing case has a **Source report · local only** section above its fields. **Open source report (PDF)** opens the linked report in a new browser tab so you can check it alongside the editor. Other report formats are identified separately and may download instead. If no source report is available, the section says so. The report link is for local review; neither the link nor the report is added to the public website or its release package. Keep the report in its original private location.

**Case filename** controls the Markdown filename separately from **Case number**. For a new case, entering a case number suggests a filename such as `10-557.md`; you can edit it before saving. Use lowercase letters, numbers and hyphens, with an optional `.md` extension. Existing filenames can be changed with **Rename file**. Apply or discard any saved working draft first, and resolve unsaved content changes before renaming. A rename keeps the case's content, internal identity, website links and report association. The builder rejects a filename already in use.

The common fields, page sections, record selections, and image assignments have labeled controls. Less common optional settings remain under **Additional fields · JSON**. Leave them unchanged if you do not need them, or ask the coordinator to help. The editor preserves values you have not changed; it does not provide a specialized form for every structured field.

Image uploads copy a new PNG, JPEG or WebP file into the selected content folder immediately. Saving and applying the record controls the image reference separately. Use only images suitable for publication; files in `assets/` or `public/` are not a place for private evidence.

## Remove or restore a case

Open the case and choose **Remove case**, then confirm the case shown. Apply or discard any working draft first. Removal takes the case out of the local catalog, case counts, and future website builds. Its source report stays in its original location. A live website changes only after you build and deploy another release.

The editor keeps a recoverable copy in the selected content folder's private `.website-editor/removed-cases/` directory. Choose **Removed cases** above the case list and **Restore case** to bring a record back. Restoration preserves its filename, content and publication setting; it will not overwrite another case or a working draft. Keep this directory with your local backups.

If an article links to the case, remove that link and apply the article change before removing the case. The editor also checks saved article drafts so removal cannot leave a broken reference waiting to be applied.

## Categories

Open **Categories** to manage the primary categories for each investigation group. Change the public category names, add categories, and move them up or down to set their order. Each row shows how many existing cases use it. Move those cases to another category before removing a category in use.

Category changes follow the same **Save working draft → Review changes → Apply** workflow. Applied categories become available in the case editor's **Primary category** list and the website derives its counts from case records. Saving a working draft alone does not change the case dropdown or the website.

An existing category keeps its internal identifier when you rename its public label, preserving case references. New categories receive an identifier from their name; it can be edited before applying. Deeper classifications remain in each case's **Classification path** field.

## Local drafts and backups

The selected folder's private `.website-editor/` directory holds working drafts and backups. Before replacing an existing record or `site.json`, the editor saves its previous text under `.website-editor/backups/`. New records do not have a previous version to back up. These are local recovery files, not a backup of every image or the entire folder.

Keep `.website-editor/` private and outside `public/`. The website builder does not read it as content, and the release package copies generated website files rather than this directory. If you return a folder containing unfinished working drafts to the coordinator, include this directory so that work can be resumed; omit it only after confirming that its drafts and history are no longer needed.

## Preview, check and package

- Under **Preview & release**, **Start local preview** starts the selected site's draft preview. It includes records applied as drafts, but not unapplied working drafts. The preview listens only at `127.0.0.1`, normally on port 4323.
- **Check content** validates the selected content and shows any field or reference errors. Fix these before creating a production package.
- **Build published release** builds the published content into a new output folder. Choose an unused folder outside the builder and content directories. Existing folders are never overwritten. Working drafts and records still marked `draft` are excluded. The resulting website files can be reviewed and uploaded separately.

A preview is marked ready only after its server starts listening. If its port is occupied, the preview fails with an error; it does not take over another server or silently move to a different port.

Only one editor job runs at a time. Starting a check or package stops the preview first. Selecting another content folder also stops the previous preview. While a check or package is running, wait for it to finish before switching folders or starting another job.

The job panel retains recent results and a bounded amount of output. A failed job does not change a draft into published content. Creating a package does not upload it. Stop the editor server with Ctrl+C when finished; it stops the processes it started, including its preview. Closing only the browser tab does not stop the server.

## For maintainers

`EditorJobs` in `scripts/editor-jobs.ts` owns the check, preview and package child processes. It exposes `start`, `snapshot`, `stopPreview`, `dispose`, and the `isBusy` getter. Call `dispose()` during server shutdown, and block folder switching while `isBusy` is true. Snapshots contain the active job, the active preview when present, and up to twelve recent results. Each job includes status, timestamps, capped logs, and a ready preview URL when available.

The preview child uses the installed Astro [programmatic development API](https://docs.astro.build/en/reference/programmatic-reference/) with an explicit loopback address and strict port. This API is experimental and should be rechecked when upgrading the pinned Astro version. The child prints its readiness marker only after Astro confirms the listening address. The manager invokes Node scripts with argument arrays and terminates only its owned process group; it never sends a stop command to an unrelated Astro server.
