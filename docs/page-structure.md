# Page structure and visual design

The site is organized for attorneys, investigators, and other professional
contacts who need to understand the investigator's focus and then inspect the relevant
background or work.

| Route | Content selection | Purpose |
| --- | --- | --- |
| `/` | `content/pages/home.md` | Portrait, introduction, three expertise highlights, selected work, contact link |
| `/work-history/` | `content/pages/work-history.md` | Interactive role timeline, employment details, selected expertise and page-owned writing |
| `/about/` | `content/pages/about.md` | Personal introduction, hobbies, and curated public GitHub projects |
| `/casework/` | `content/pages/casework.md` | Interactive charts, selected projects, and investigation experience |
| `/credentials/` | `content/pages/credentials.md` | Credentials discovered from Markdown, grouped by issuer, followed by education |
| `/contact/` | `content/pages/contact.md` selects `content/contacts/investigator.md` | Organization enquiry cards and a combined personal/social card |
| `/resources/` | `content/pages/resources.md` | Victim guidance, reporting and support, scam awareness, and reference reports |
| `/investigations/<chart>/<category>/` | Matching records in `content/cases/` | Case summaries reached from chart slices or legend links |

The home page intentionally omits the full CV and chart tables. The underlying
records remain reusable; adding detail to an employment file does not lengthen
the landing page. The home page uses `description_short` and selected named
blocks, while supporting pages use fuller content.

## Shared presentation

- `src/layouts/SiteLayout.astro` owns the header, navigation, footer, title, and
  description. All routes use it. The compact navigation header stays at the top
  while scrolling, with a blurred background. Its measured height reserves room
  for anchor navigation and keyboard focus. On narrow screens, a hamburger button
  opens the existing navigation, Contact button, and theme toggle in one panel.
  Escape, an outside click, selecting a link, or moving keyboard focus outside
  closes it. The expanded header can scroll within 85% of the viewport. Desktop
  navigation keeps its inline layout. Without JavaScript, links remain visible;
  print uses normal document flow.
- `src/styles/global.css` contains the shared navy, burgundy, white, typography,
  spacing, and responsive layout rules.
- `src/pages/index.astro` renders the curated landing page.
- `src/pages/[page].astro` renders the supporting page selections. A `biography`
  section renders that page’s own `biography` Markdown at its configured position.
- `src/components/ContentEntry.astro` presents the detailed content records.

Typography uses locally available serif and system fonts. No hosted font,
charting service or client framework is required. Pagefind supplies the case
search interface and static search index.

## Portrait and contact

Each page’s Markdown has its own optional `portrait` object. Use the same image-list
format for one photo or several:

```yaml
portrait:
  enabled: true
  images:
    - image: portrait.jpg
      alt: A professional headshot.
  autoplay: false
  interval_ms: 6000
```

Add the image to the selected content folder's `assets/` directory. The filename
and alt text belong in that page’s file under `content/pages/`. Hide it with
`enabled: false` or omit it. See
[photos](portrait-photos.md) for slideshow and personal-photo settings.

Professional contact links on the homepage, header, and footer open `/contact/`.
Its introduction, organization cards, contact details, and combined social card
come from `content/contacts/investigator.md`. Use `services[].display_order` to order
organizations and `enabled: false` to hide a card. Personal email and phone are
optional fields under `social`; links appear in their written order. See
[contact authoring](contacts.md) for fields and examples.

## Draft behavior

`npm run dev` and draft builds include unfinished records for local review.
Normal builds include only published records. Navigation follows visible page
records, and home-page links appear only when their destination page is visible.
Case category pages link back to the page containing the relevant chart.
There are no old-route redirects; each prepared page has one URL.

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
`/about/` is the personal page. Homepage job links and its overall expertise-section link point to Work History. Homepage expertise cards select reusable records, which can also appear on other pages.

Supporting pages set `section_order`, a list of collection names such as
`experience`, `biography`, `charts`, `projects`, `credentials`, `education`, `expertise`,
`interests`, `github`, `skills`, `volunteering`, `organizations`, `resources`, `callouts`, and `page_sections`. Listed sections render only when they have content;
unlisted sections are omitted. An omitted `section_order` defaults to `[]`, so no record sections are included automatically. Selected sections without content remain absent from the website; the editor shows that empty state. The Astro templates still define each section's
visual layout and the curated homepage structure.

Work History can set `section_order: [experience, expertise, callouts, page_sections]`.
Its record lists select reusable entries in the written order. Records have no page
owner; select the same record on multiple pages when useful. Pages → Page sections
provides controls for section visibility/order, record selections, headings and
introductions. A selected job list preserves the selected order; automatic job
lists retain their date/display ordering. Skills use ordered page-owned `skill_groups: [{ name, skills }]` for both group
order and order within a group. Credentials retain page-selected order within
issuer groups and their separate issuer ordering.
The expertise and approach cards and homepage Selected Work banner share a
translucent tint with a soft Gaussian backdrop blur in both themes. In
`src/styles/global.css`, `--glass-surface` uses 38% background opacity (62%
transparency), and `--glass-blur` is 5px. Lower the opacity to reveal more of the
particles; increase the blur to soften their outlines. Text remains fully opaque.
The tint stays translucent even if backdrop blur is unavailable. The timeline
keeps its transparent background. The sticky header has a separate, stronger
85% tint so navigation remains legible over scrolling text.

The `biography` section renders the page’s `biography` Markdown; `blocks.bio_heading`
and optional `blocks.bio_eyebrow` control its heading. Other record sections can
use `blocks.<section>_intro`, such as `blocks.expertise_intro`, for an introduction.

## Personal About page

Edit the body of `content/pages/about.md` for the personal introduction. Each
hobby stays in its existing file under `content/interests/`. Add a hobby by
copying `templates/interests.md`, assigning a unique slug, and adding that slug
to the About page's `interests` list. The list also controls display order; remove
a slug to omit it from the page. Longer stories belong in the hobby file body.
The existing selections were moved from Work History without inventing additional
personal history. Professional biography is page-owned text on About.
Additional writing uses `page_sections: [{ id, title, body }]`, with unique IDs,
plain text headings and Markdown bodies. The `page_sections` slot positions these
ordered passages among the reusable-record sections.
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

The theme in `site.json` is the default for a new page session and without JavaScript.
The icon-only toggle saves the choice in this tab's `sessionStorage` as `personal-site-theme`.
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
inside the expandable navigation panel on narrow screens. Both color modes use the
shared CSS variables, including chart surfaces, tables, notices, and keyboard
focus styles. No external dependency is used for theme state.
