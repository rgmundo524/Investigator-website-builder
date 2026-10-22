# About: skills, participation, hobbies, and projects

`content/pages/about.md` controls section order and selects every displayed record.
Use `section_order: [interests, volunteering, organizations, skills, github]`
to reproduce the current layout, or reorder/remove those names. Empty selections
render no section. Hobbies and community participation introduce the person before
the technical skill inventory. The professional biography and expertise remain on Work History.

| Section | Subject files | Page selection | Template |
| --- | --- | --- | --- |
| Skills | `content/skills/` | `skills` | `templates/skills.md` |
| Volunteer work | `content/activities/`, `kind: volunteering` | `volunteering` | `templates/activities.md` |
| Organizations → Professional Organizations | `content/activities/`, `kind: memberships` | `memberships` | `templates/activities.md` |
| Organizations → DAOs | `content/activities/`, `kind: daos` | `daos` | `templates/activities.md` |
| Hobbies | `content/interests/` | `interests` | `templates/interests.md` |
| GitHub projects | `content/repositories/` | `repositories` | `templates/repositories.md` |

Copy the appropriate template, give the file a unique slug, fill in its facts, and
add the slug to the page's matching list. Both Markdown and MDX are supported;
plain Markdown is sufficient for every field and layout shown here.

`blocks.<section>_heading` and `blocks.<section>_intro` on the page customize section
headings and introductions. The internal `interests` section is labelled Hobbies
using `blocks.interests_heading`. DAO participation has moved out of that list
into its own activity file, so it is not repeated among the hobbies.

## Skill ratings

Several related skills share one card. The `group` field on each skill determines
its card; the current groups are Programming, Systems, and Data and analysis.
The grid displays three cards per row on desktop, two on medium screens, and one
on small screens. Each skill stays in its own reusable Markdown file, with its
own symbols and an expandable Details section inside the group card.

Each skill has a title, short description, longer Markdown body, `group`, `icon`,
`display_order`, and `proficiency`. Set the rating from 1 to 5 in half-point steps:

| Value | Displayed level |
| --- | --- |
| `null` | Not yet rated; five outlined symbols, no numeric meter |
| `1` | Foundational |
| `2` | Developing |
| `3` | Proficient |
| `4` | Advanced |
| `5` | Expert |

For example, `proficiency: 3` fills exactly three of the five symbols and shows
`3/5 · Proficient`. These are self-assessments, not third-party credentials.
`proficiency: 2.5` fills two complete symbols and half of the third, and labels
the level as between Developing and Proficient. Both dots and stars preserve the
fraction; the accessible meter announces the same numeric value.
`assessed_on` optionally records a quoted `YYYY-MM-DD` date. Put specific examples
and evidence links in the body and `links` rather than relying on a score alone.

On the page, `skill_symbols: dots` selects red dots; `stars` selects red stars.
`skill_group_order` selects the group order; unlisted groups follow alphabetically.
Within each group, lower `display_order` values appear first, with the page list
breaking ties. Skill entries can be reused on other pages.

The original seven skills remain an unrated starter selection. Set proficiency
from your own self-assessment; leave unknown levels as `null`. The copyable
template's 3/5 rating is illustrative. A resume update date does not necessarily
establish when a skill was assessed, so record `assessed_on` only when known.

## Volunteering, memberships, and DAOs

Organizations is one section with two subgroups: Professional Organizations and
DAOs (Decentralized Autonomous Organization). Its position comes from
`organizations` in `section_order`. The existing `memberships` and `daos` page lists
select records for those subgroups; they are no longer top-level section names.
`organization_group_order: [memberships, daos]` controls the subgroup order.
Both names must appear once; a subgroup with no selected visible records is hidden.
Use `blocks.organizations_heading` / `blocks.organizations_intro` for the section,
and `blocks.memberships_heading` / `blocks.daos_heading` for subgroup labels.

Each activity has a `kind` matching its page selection, plus optional `organization`,
`role`, `participation`, and employment-style `periods` of quoted start/end months.
`end: null` means ongoing; `periods: []` omits unknown dates. Do not infer dates.
Use `participation` to distinguish interest, contributor, member, former member,
or another accurate description. Links can point to an organization, public
membership profile, DAO proposal, or contribution. Order uses `display_order`,
with page selection order breaking ties.

The initial volunteer and membership cards are visibly labelled examples because
no specific affiliations have been confirmed for these sections. They have
`content_kind: example` and cannot be published. Replace the example text with
reviewed facts and change that field to `profile`, or remove its selection.
The existing DAO entry is explicitly an interest, with no named DAO or role claimed.
Certification ownership does not establish membership in the issuing association.

## Visual components

The site reuses [Astro Icon](https://www.astroicon.dev/guides/components/) with
locally bundled Lucide icons for cards and skill symbols. Rated skills expose a
native HTML meter with a descriptive accessible value; the visual dots/stars are
decorative and the score also appears as text. Unrated skills never imply a zero.
See the [W3C meter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/).
No client JavaScript is needed for skill or activity cards. Existing translucent
surfaces use the same theme variables as the rest of the site.

Supported `icon` values are: `code`, `database`, `terminal`, `network`,
`chart-no-axes-combined`, `chart-pie`, `hand-heart`, `users`, `landmark`, `bike`,
`beer`, `box`, `mountain-snow`, `server`, `puzzle`, `shield-check`, and `lightbulb`.
The field is validated to avoid broken icon names.

[Web Awesome Rating](https://webawesome.com/docs/components/rating/) is an
available prebuilt alternative if interactive ratings are needed later. Its
read-only mode also works for portfolio scores, but it would add client components
and styles for a display already supported by installed Astro Icon. GitHub cards
continue to use [GitHub Stats Extended](github-projects.md), and the timeline keeps
amCharts with large accessible plus/minus controls.
