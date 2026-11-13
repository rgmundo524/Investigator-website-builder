# Writing and reusing content

Paths under `content/` and `assets/` refer to the selected `SITE_DATA_DIR`,
or to the blank investigator pack when unset. See [external content](external-content.md).

## One file per subject

Keep each job, credential, project, or interest in its own Markdown file. A job
with multiple employment periods can remain one file. If the title or role changes
substantially, create a new experience entry rather than rewriting its history.

Each file has YAML frontmatter between `---` lines, followed by the long narrative.
The filename is for your convenience; `slug` is the stable identifier used by
references. Renaming a file without changing its slug preserves those references.

## Common fields

| Field | Meaning |
| --- | --- |
| `slug` | Unique within its collection; lowercase words separated by hyphens |
| `publication_status` | `draft` or `published`; omitted values default to draft |
| `description_short` | Compact public description; optional and source-only for the profile record |
| `blocks` | Named plain-text passages; only keys supported by a renderer appear on the website |
| `links` | Optional list of `label` and HTTP(S) `url` pairs |
| `editorial_note` | Optional source/review note; current components never render it |
| Markdown body | Required full narrative, with Markdown formatting |

The body serves as the long description. Do not copy it into another
`description_long` field. Additional separately reusable text can go under `blocks`,
but arbitrary block keys do not create website sections. Supported frontmatter descriptions, blocks, and highlight text are rendered as plain text;
Markdown formatting belongs in the body or in a standalone callout entry.

Example:

```yaml
description_short: >-
  A brief description for cards and lists.
blocks:
  litigation_relevance: >-
    A passage that explains this role's relevance to litigation work.
```

Indent every continuation line under `>-`. Quote dates such as `"2026-01"`.
Unknown fields and duplicate YAML keys fail validation, which catches errors such
as `Description_Short` instead of `description_short`.

## Experience and dates

Use `periods` containing `start` and `end`, both at month precision. `end: null`
means the role remains open. Closed periods must not overlap; at most one final
period can be open. For now, two periods within one entry may not share a month,
because month-only data cannot distinguish their exact transition dates.

`activePosition()` computes whether a known period includes the current month.
Use `active_position` only with `periods: []` when dates are unknown, when only the current status is known. Explicit date ranges remain the canonical data when available.
“Present” is derived from an open end date; rebuild when you update employment.

The editor provides **Employment dates** controls for these periods, including
separate stints at one organization and an explicit **Dates are not documented**
option. Profile and employment locations stay hidden unless `show_location: true`
is deliberately selected. See [profile and page field use](profile-pages-audit.md).

`highlights` is a list of `{ id, text }` items. Stable IDs let future CV and
directory exports select individual achievements without duplicating their text.

## Relationships and page selection

References are slugs, not paths. For example:

```yaml
expertise:
  - example-expertise
projects:
  - example-project
```

The checker resolves these IDs against the target collections and rejects missing
or duplicated references. A published entry may not reference a draft entry.
Reciprocal project/experience references are allowed; the checker does not
recursively render relationships or require duplicate backlinks.

The full relationship check runs when Astro starts and whenever you run the check
or build commands. During live editing, field schemas are rechecked automatically,
but run `npm run check` after changing relationships. Missing page selections also
raise an error in the preview instead of disappearing silently.

Each record under `content/pages/` selects entries, navigation, and section order.
The home page remains a curated introduction. Work History uses
`experience_source: all`, automatically discovering visible job records and
ordering them by their `display_order` field. Credentials uses
`credentials_source: all` to discover and group credential files by issuer.
Other collections retain explicit page selections. Page records get their own route; individual jobs and
credentials appear within the selected page.
See [the page structure guide](page-structure.md).

`content/pages/work-history.md` selects the professional sections and their order,
including expertise at the end. `content/pages/about.md` owns the personal
introduction and ordered hobby selection from `content/interests/`. Each hobby's
short description and longer body remain in its own reusable file. Pages choose which
records appear and their order; the same library record can be selected on multiple
pages. A page's optional `biography` field stores its own Markdown, shown by the
`biography` section. The profile body is saved source text, not public biography.
Use `page_sections: [{ id, title, body }]` for additional page-owned writing and
include `page_sections` in `section_order` where those passages should appear.

About also selects individual skill, activity, and repository records. See
[About authoring](about-content.md) for the 1–5 self-assessment scale, volunteer
work, memberships, DAO participation, icons, and card ordering. See
[GitHub projects](github-projects.md) for the repository-file workflow.

The Contact page selects one contact directory using `contact: investigator`.
`content/contacts/investigator.md` holds organization cards, personal details, social
links, and the displayed introduction. See [contact authoring](contacts.md).

Resources automatically discovers `content/resources/` files and groups them using
their `category`. Each card uses `display_order` within its group; the page's
`resource_group_order` controls group order. See [resource authoring](resources.md).

## Reuse from Astro components

```astro
---
import { getEntry, render } from 'astro:content';
const job = await getEntry('experience', 'example-role');
if (!job) throw new Error('Missing experience/example-role');
const { Content } = await render(job);
---
<p>{job.data.description_short}</p>
<p>{job.data.blocks.litigation_relevance}</p>
<Content />
```

Apply the shared `isVisible()` / `selected()` helpers before rendering content on
public routes. Do not send an entire collection or frontmatter object to the
browser. Components should select the fields they display. `editorial_note` is
not rendered, but it remains part of the Git source.

Body headings provide document structure; they are not separately addressable
content fields. If independent richly formatted sections become necessary, use
separate callout files first, or add one shared Markdown section parser later.

## Credentials and education

Credentials distinguish `certification`, `certificate`, and `training`. Use the
year reported by the source without inventing a month or an expiration. A missing
`expires_on` means unspecified, not verified perpetual validity.

Use `course_url` for program information and `verification_url` for an individual
award record. Optional `badge` fields reference a local seal image and its source.
See [credential authoring](credentials.md) for fields, grouping, links, and images.

Education entries display the institution, program, recorded study dates, and
description without a completion-status label. Use the program and description
to describe the study. The type of study and any existing completion metadata
remain in the local record; neither adds a public status label.

## Case charts

Each chart file defines category IDs, labels, and explanatory copy. Each case file
records one case assigned to one chart and primary category. Counts, totals, and
percentages are calculated from those records, with real and example datasets
kept separate. See [case chart authoring](case-charts.md) and
[the case record guide](case-tracker.md) for fields and the historical-case workflow.

## Publishing

1. Review the wording and any source claims.
2. Change intended entries and their required references to `published`.
3. Publish each page entry when its selected content is ready.
4. Run `npm run build` and inspect it with `npm run preview`.

Keep drafts, templates, source PDFs, and administrative records outside `public/`.
Astro copies everything in `public/` to the output regardless of content status.
Never upload `dist-drafts/` to the future public host. Repository access controls
and website publication are separate settings.
