# Page structure and visual design

The site is organized for attorneys, investigators, and other professional
contacts who need to understand Reymundo's focus and then inspect the relevant
background or work.

| Route | Content selection | Purpose |
| --- | --- | --- |
| `/` | `content/pages/home.md` | Portrait, introduction, three expertise highlights, selected work, contact link |
| `/work-history/` | `content/pages/work-history.md` | Interactive role timeline, employment details, professional biography, then expertise and analytical approach in frosted panels |
| `/about/` | `content/pages/about.md` | Personal introduction, hobbies, and curated public GitHub projects |
| `/expertise/` | Compatibility redirect | Opens the expertise section at `/work-history/#section-expertise` when Work History is visible |
| `/casework/` | `content/pages/casework.md` | Interactive charts, selected projects, and investigation experience |
| `/credentials/` | `content/pages/credentials.md` | Credentials discovered from Markdown, grouped by issuer, followed by education |
| `/contact/` | `content/pages/contact.md` selects `content/contacts/reymundo.md` | Organization enquiry cards and a combined personal/social card |
| `/resources/` | `content/pages/resources.md` | Victim guidance, reporting and support, scam awareness, and reference reports |
| `/articles/` | Compatibility redirect | Opens `/resources/` while no Articles page is configured and Resources is visible |
| `/investigations/<chart>/<category>/` | Matching records in `content/cases/` | Case summaries reached from chart slices or legend links |
| `/404.html` | `src/pages/404.astro` | Shared site layout with a page-not-found message and a return-home link |
| `/sitemap-index.xml` | Official `@astrojs/sitemap` integration | Build-generated sitemap index using the selected data directory's `site.json` URL |

The home page intentionally omits the full CV and chart tables. The underlying
records remain reusable; adding detail to an employment file does not lengthen
the landing page. The home page uses `description_short` and selected named
blocks, while supporting pages use fuller content.

## Missing pages and sitemap

Every build includes a top-level `404.html`, which Cloudflare Pages uses for
unknown URLs. It uses the normal theme, header, footer, and animation, and its
home link works even when all content is still draft. No extra Markdown file is
required in an existing external content directory.

The official `@astrojs/sitemap` integration generates `sitemap-index.xml` and
`sitemap-0.xml` during builds. The shared layout links to the index. The sitemap
uses the `url` from the selected data directory's `site.json`; it does not require
a separately hardcoded domain. Error pages, non-page assets, and the old
Expertise/Articles URLs when they redirect are excluded. If Articles is restored
as a real page, it is included automatically.

Production sitemaps follow the production routes, so unpublished content is not
listed. A draft build's sitemap stays in `dist-drafts/` alongside its draft pages.
Adding a sitemap does not approve content or remove the current `noindex,
nofollow` metadata. Search indexing remains a separate launch setting.

## Shared presentation

- `src/layouts/SiteLayout.astro` owns the header, navigation, footer, title, and
  description. All routes use it. The compact navigation header stays at the top
  while scrolling, with a blurred background. Its measured height reserves room
  for anchor navigation and keyboard focus as links wrap. On short screens the
  header is capped at half the viewport and can scroll internally; print uses
  normal document flow.
- `src/styles/global.css` contains the shared navy, burgundy, white, typography,
  spacing, and responsive layout rules.
- `src/pages/index.astro` renders the curated landing page.
- `src/pages/[page].astro` renders the supporting page selections. A `biography`
  section uses the full body of the selected profile at its configured position.
- `src/components/ContentEntry.astro` presents the detailed content records.

Typography uses locally available serif and system fonts. No hosted font,
charting service or client framework is required. Pagefind supplies the case
search interface and static search index.

## Portrait and contact

The profile Markdown has an optional `portrait` object:

```yaml
portrait:
  image: reymundo-gomez.png
  alt: Reymundo Gómez wearing a dark blazer and white shirt.
  source_url: https://cipherblade.com/expert-witness/crypto-experts/
```

`image` names a local file in `assets/`. The portrait component checks that
the file exists and preserves its dimensions. Replace the file to use a newer
photo, or change the filename and alt text in `content/profile/reymundo.md`.

The initial portrait is the unmodified 294 × 312 PNG linked beside Reymundo's
biography on the official CipherBlade expert page:

- Source page: https://cipherblade.com/expert-witness/crypto-experts/
- Original image: https://cipherblade.com/wp-content/uploads/2024/06/Remundo-Website-Portrait-v1.png
- Local asset: `assets/reymundo-gomez.png`

The source page identifies the subject by name. It carries CipherBlade's
copyright notice and does not specify a separate image reuse license. No AI
portrait, alteration, or generated likeness was used. A higher-resolution
owner-supplied original can replace this asset later.

Professional contact links on the homepage, header, and footer open `/contact/`.
Its introduction, organization cards, contact details, and combined social card
come from `content/contacts/reymundo.md`. Use `services[].display_order` to order
organizations and `enabled: false` to hide a card. Personal email and phone are
optional fields under `social`; links appear in their written order. See
[contact authoring](contacts.md) for fields and examples.

## Draft behavior

`npm run dev` and the draft build show all seven main pages, the ten category pages,
and the draft article.
The former Expertise URL also redirects to the new Work History section in builds
where Work History is visible. The ordinary production build continues to exclude draft content. Navigation
links follow visible page records, and home-page links are omitted when their
destination page is not visible. Category return links lead to Casework when
available and fall back to the home page otherwise.

Automatic Work History selection includes only visible jobs; draft jobs are
omitted from production. Explicit page references still require published
targets. Each page is published through its Markdown `publication_status`.
The existing relationship validator continues to reject published pages that
select draft content. Site metadata remains `noindex` during development.

## Navigation and section order

Every page can set `navigation: { label: Home, order: 10 }` in its frontmatter.
Lower values appear first; omitting navigation hides the menu item. The current
menu order is Home, Work History, Casework, Credentials, About, Resources.
Contact is a separate button immediately to the right of the compact theme toggle.
The `/contact/` page remains available; the button appears only when that page is
visible in the current build. Work History now lives at `/work-history/`, and
`/about/` is the personal page. Homepage job and expertise links use the new route.

Supporting pages set `section_order`, a list of collection names such as
`experience`, `biography`, `charts`, `projects`, `credentials`, `education`, `expertise`,
`interests`, `github`, `skills`, `volunteering`, `organizations`, `resources`, and `callouts`. Listed sections render only when they have content;
unlisted sections are omitted. The Astro templates still define each section's
visual layout and the curated homepage structure.

Work History sets `section_order: [experience, biography, expertise, callouts]`.
Its `expertise` and `callouts` lists select reusable records in the written order.
The expertise and approach cards and homepage Selected Work banner share a
translucent tint with a soft Gaussian backdrop blur in both themes. In
`src/styles/global.css`, `--glass-surface` uses 38% background opacity (62%
transparency), and `--glass-blur` is 5px. Lower the opacity to reveal more of the
particles; increase the blur to soften their outlines. Text remains fully opaque.
The tint stays translucent even if backdrop blur is unavailable. The timeline
keeps its transparent background. The sticky header has a separate, stronger
85% tint so navigation remains legible over scrolling text.

The `biography` section renders the selected profile body; `blocks.bio_heading`
and optional `blocks.bio_eyebrow` control its heading. Other record sections can
use `blocks.<section>_intro`, such as `blocks.expertise_intro`, for an introduction.

## Personal About page

Edit the body of `content/pages/about.md` for the personal introduction. Each
hobby stays in its existing file under `content/interests/`. Add a hobby by
copying `templates/interests.md`, assigning a unique slug, and adding that slug
to the About page's `interests` list. The list also controls display order; remove
a slug to omit it from the page. Longer stories belong in the hobby file body.
The existing selections were moved from Work History without inventing additional
personal history. The professional profile body remains on Work History.
Skills and volunteering have dedicated sections. Organizations groups Professional
Organizations and DAOs within a single section. Related skills share one card,
with three cards per desktop row. See [About authoring](about-content.md) for skill
ratings, activity fields, selection, and order. The `github` section follows the
hobbies and selects per-repository files with `repositories`; `github_groups`
controls personal and organization headings. See [GitHub project cards](github-projects.md).

The timeline's zoom controls use large `+` and `−` symbols with at least 52px
targets. Accessible names and tooltips remain Zoom in and Zoom out. The existing
amCharts zoom actions, pan controls, slider, and Full timeline reset are retained.

## Adding a position

Copy `templates/experience.md` into `content/experience/`. Give it a unique slug,
role, organization, date periods, narrative, and `display_order`. Work History's
`experience_source: all` automatically includes visible job files, including files
in subfolders. No change to its page list is needed. The homepage's small
organization selection is intentionally curated separately.

Lower `display_order` values appear first. Existing positions use 10, 20, 30,
40, 50, and 60; use an intermediate number to insert a role. Explicitly numbered
jobs precede all unnumbered jobs. Among ties or unnumbered jobs, current roles
come first, then the most recent start month, then slug for a stable tie-break.
The linked role list and job details use the same ordering. The chart itself
uses dates for position and duration, independently of `display_order`.

### Serpentine timeline

Work History uses locally bundled **amCharts 5**, loaded only when the timeline
approaches the viewport. Its transparent canvas, plot, and axis labels leave the
site-wide particle animation visible. The chart follows light/dark mode and
respects reduced motion. No hosted chart service, account, or React is needed.

`content/pages/work-history.md` controls the timeline:

```yaml
timeline:
  start: "2016-01"
  scale: 1.2
  levels:
    desktop: 3
    mobile: 5
```

- `start`: first displayed month, or `null` to start in January of the earliest
  recorded role. It must be on or before the earliest role, so no history is
  silently clipped. The configured 2016 start matches the existing timeline.
- `scale`: overall chart height, label size, and endpoint marker scale, between
  0.75 and 1.75. The current 1.2 setting makes it 20% larger. The experience
  section also uses a wider 80rem maximum width.
- `levels.desktop` and `levels.mobile`: straight runs along the winding path,
  between 2 and 8. Three runs means two bends. Mobile layout applies when the
  chart container is 700px wide or narrower. Height adjusts to fit the runs and
  concurrent tracks.
- The endpoint includes the current build month and any scheduled periods.
  Rebuild the site to advance current roles to a new month.

A true UTC date axis preserves elapsed time, so months have their actual calendar
lengths. End months are inclusive: a June end is drawn through July 1. Separate
employment periods remain separate bands. Overlapping periods automatically use
adjacent lanes along the same axis. A future role with no end date has only a
start marker until it begins. Colors identify positions; tooltips include organization, role, dates,
current/past/scheduled status, and the job’s `description_short`. Override that
summary only for the timeline with `blocks.timeline_summary`. Hover tooltips
belong to individual spans and endpoints, independently of the zoom cursor;
their explicit text color follows the popup background in both themes. Current endpoints have larger markers.

Visitors can select bands or role links to open the job details, including with
the keyboard. Links work before JavaScript loads, when charts cannot load, and
in print. Hash navigation and back/forward navigation preserve selection. Zoom
in/out, earlier/later, full-timeline reset, and the range slider navigate the
chart. Desktop pointer users can drag along the line to select a zoom range.
Touch users use the controls and slider; ordinary page scrolling remains free.
The visible range survives theme changes, resizing, and browser back/forward
cache restoration.

For ADC LTD NM, the current role is confirmed, but its start date is not yet
known: `periods: []` and `active_position: true` keep it in the linked undated
list. Once dates are supplied, populate `periods` and remove the explicit flag.

The amCharts logo/backlink is retained under its free-use license. The license
is included at `/vendor/amcharts-LICENSE.txt`; no paid key is configured. The
serpentine chart is marked experimental by its authors. Dependency versions are
pinned, and the HTML role links remain available independently of the chart.

References: [timeline documentation](https://www.amcharts.com/docs/v5/charts/timeline/),
[accessibility](https://www.amcharts.com/docs/v5/concepts/accessibility/),
[licensing](https://www.amcharts.com/download/).

## Credential issuers

The Credentials page uses `credentials_source: all` and discovers every visible
credential Markdown file, including nested folders. Its `issuer_order` list sets
the group order; unlisted issuers follow alphabetically. Each group lists newer
awards first, then credential name.
Course links, verification links, and local badge files are optional fields on
each credential. See [credential authoring](credentials.md).

## Color mode

Dark mode is the default for a new page session and the fallback without JavaScript.
The icon-only toggle saves the choice in this tab's `sessionStorage` as `rg-theme`.
A small head script restores it before the first paint, so page navigation,
reloads, and browser back/forward history keep the same theme. The accessible
pressed state and tooltip stay synchronized with it. Persistent `localStorage`
preferences and the system color scheme are not used for the theme.

The preference lasts for the tab's page session. Normal session closure discards
it; browser tab/session restoration may preserve that session, and a tab opened
from another tab can inherit its initial session storage. See
[sessionStorage semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).
If storage is blocked, the toggle still works on the current page. The single
implementation is `src/scripts/theme-init.js`, inlined by the shared layout.

The toggle retains a 44-pixel touch target. It and the Contact button stay together
on narrow screens, above the wrapping navigation links. Both color modes use the
shared CSS variables, including chart surfaces, tables, notices, and keyboard
focus styles. No external dependency is used for theme state.
