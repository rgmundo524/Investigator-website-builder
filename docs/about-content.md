# About: expertise, work examples, and personal interests

`content/pages/about.md` controls section order and selects every displayed record.
An About page can introduce how an investigator works, show one public example,
and then add personal interests. Reuse existing expertise and project records
instead of copying a resume or making a second version of their descriptions.
For example, use `section_order: [expertise, projects, organizations, personal_photos, contact_cta]`.
Each section is optional; empty record selections render no section. Detailed work
history and credentials can remain on their own pages.

In the builder, **Page presentation** controls concise expertise and project
previews. **Closing enquiry** chooses an existing organization contact service.
The **Page sections** controls select and order sections and their records.
Save and review page changes before applying them. After updating the builder
code, save any unsaved edits, restart the builder yourself, and refresh its tab
to load the new controls and validation rules.

## Professional introduction and reusable records

The page body is its introduction. Explain the questions you investigate, the
analysis you perform, and how you explain findings. Select a few relevant
`expertise` records and one supported `projects` example. Keep a project's
contribution accurate, and link public work when available. Selecting a record
does not change that record or its presentation on another page.

Use `blocks.expertise_heading` / `blocks.expertise_intro` and
`blocks.projects_heading` / `blocks.projects_intro` for page-specific context.
The optional `compact_sections` setting shows concise previews with longer bodies
under **Read more**, while keeping headings, summaries, and reference links visible:

```yaml
compact_sections: [expertise, projects]
```

Only `expertise` and `projects` are supported. Omit the setting or use `[]` to
retain expanded bodies. These choices affect this page only; they do not hide a
section or change the selected records.

## Closing enquiry

A page can end with a focused invitation to contact one organization. Choose
**Include a closing enquiry section**, a contact record, and an enabled
organization service. The builder reads applied contact records, keeping saved
but unavailable selections visible so they can be corrected or removed. A page
being published requires a published contact record.

```yaml
contact_cta:
  contact: investigator-contact
  service: organization-id
section_order: [expertise, projects, personal_photos, contact_cta]
blocks:
  contact_heading: Have a matter to discuss?
  contact_description: Get in touch to discuss the questions and available records.
  contact_button_label: Discuss an investigation
```

`contact` is the slug of a record in `content/contacts/`; `service` is the ID of
an enabled card in that record's `services` list. The destination reuses the
service's enabled booking link, otherwise its email, otherwise its enquiry link.
Email addresses and destination URLs stay in the contact record. Leave the page's
description or button label blank to use the service's corresponding defaults.
Changing those source details updates every page that uses them after rebuilding.

This is separate from the page's top-level `contact` setting, which displays
contact cards and uses that contact record's body as the introduction. A closing
enquiry does not replace the page introduction. Enabling it appends `contact_cta`
to `section_order`; its position can be changed there. Turning it off removes
both its assignment and that section. Missing records, missing service IDs, and
disabled services must be corrected before applying the page.

## Personal interests and other optional sections

Personal photos work well after the professional material. Use a coherent pair
of real pictures, a short introduction, and factual captions. Each image is
cropped to a 3:2 frame; keep important subjects away from the edges. Generated
placeholders should remain identified until replaced. See [photos and local
images](portrait-photos.md) for upload details.

Skills, volunteering, memberships, hobbies, and GitHub projects can also be
included with their names in `section_order`:

| Section | Subject files | Page selection | Template |
| --- | --- | --- | --- |
| Expertise | `content/expertise/` | `expertise` | `templates/expertise.md` |
| Work examples | `content/projects/` | `projects` | `templates/projects.md` |
| Skills | `content/skills/` | `skill_groups[].skills` | `templates/skills.md` |
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

Several related skills share one card. In **Pages → About → Skills**, groups are
listed in their website order, with their selected skills underneath. Move a
group to change the card order. Move a skill up or down to change its position
within that group. Use the skill’s group selector to move it into another group.
Add a group, edit its name, and choose skills from the reusable library. Removing
a selection keeps the skill record; an empty group is omitted from the website.

Grouping and ordering belong to the page, so the same reusable skill can be
arranged differently on another page. Each skill appears at most once on a page.
The grid displays three cards per desktop row, two on medium screens and one on
small screens. A skill’s title, description, Markdown body, icon and rating remain
in its reusable file. Set `proficiency` from 1 to 5 in half-point steps:

| Value | Website display |
| --- | --- |
| `null` | The skill and details appear without rating symbols or a score |
| `1` | One filled symbol and `1/5` |
| `2` | Two filled symbols and `2/5` |
| `3` | Three filled symbols and `3/5` |
| `4` | Four filled symbols and `4/5` |
| `5` | Five filled symbols and `5/5` |

For example, `proficiency: 3` fills exactly three of the five symbols and shows
`3/5`. These are self-assessments, not third-party credentials. The website omits
qualitative level names and the explanatory scale.
`proficiency: 2.5` fills two complete symbols and half of the third, and shows
`2.5/5`. Both dots and stars preserve the fraction; the accessible meter announces
the same numeric value.
`assessed_on` optionally records a quoted `YYYY-MM-DD` date. Put specific examples
and evidence links in the body and `links` rather than relying on a score alone.

On the page, `skill_symbols: dots` selects red dots; `stars` selects red stars.
The page’s `skill_groups` array defines both levels of order:

```yaml
skill_groups:
  - name: Investigation
    skills: [transaction-analysis, open-source-research]
  - name: Communication
    skills: [report-writing, public-speaking]
```

Groups appear in array order; skills appear in each group’s `skills` order.
There is no separate global skill list or group-order list. Skill records have
no group assignment, and editing page grouping does not rewrite their content.

Leave proficiency as `null` for skills you want to present without a rating,
including published skills. For rated skills, enter your own self-assessment
from 1 to 5 in half-point steps. The copyable template's 3/5 rating is
illustrative. A resume update date does not necessarily establish when a skill
was assessed, so record `assessed_on` only when known.

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
decorative and the score also appears as text. Draft skills without an assessment
show their name and details without a rating display.
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
