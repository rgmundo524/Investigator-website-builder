# Credentials and issuer groups

Each certification, certificate, or training program lives in its own `.md` file
under `content/credentials/`. Subfolders such as `content/credentials/trm-labs/`
are supported. The `slug` remains the stable identity even if the file moves.

The Credentials page sets `credentials_source: all`. Adding a file automatically
adds it to the right issuer group, with no page list or component edits. Drafts
appear during development; only published entries appear in production.
`credentials_source: selected` is still available for a curated page using its
`credentials` list.

## Grouping and ordering

Use a consistent `issuer` name, such as `TRM Labs`, `Chainalysis`, or `ACAMS`.
Capitalization and repeated spaces are ignored when grouping. Set `issuer_order`
once in `content/pages/credentials.md` to control the issuing-authority groups:

```yaml
issuer_order:
  - TRM Labs
  - Chainalysis
  - Blockchain Intelligence Group
  - Input Output Global
  - Alchemy University
  - BerkeleyX
```

This is the initial example order. Rearrange the list when the cards are finalized.
Listed issuers come first; unlisted issuers follow alphabetically. A listed issuer
without visible credentials does not create an empty section. Names match without
regard to capitalization or repeated spaces. Duplicate names and blank entries
fail validation. Omit the field or use `issuer_order: []` for alphabetical order.
The issuer navigation follows the same order, and changing this list preserves
existing group anchors.

Individual credential files keep their existing `issuer` field. Within each group,
credentials still sort by `issued_year` newest first, then by name and slug. A new
issuing authority automatically gets a new group and an issuer-navigation link.

The existing content has 11 credentials across six issuers. There is no ACAMS
entry yet; add one only when there is a credential or training record to describe.

## Authoring

Copy `templates/credentials.md` and set its fields:

| Field | Use |
| --- | --- |
| `name` | Exact name of the credential or training program |
| `issuer` | Issuing authority used for grouping |
| `issued_year` | Recorded award or training year |
| `description_short` | Short summary on the credential card |
| Markdown body | Longer description under “Read more” |
| `course_url` | Official course, curriculum, or program page |
| `verification_url` | Optional public record verifying your individual award |
| `expires_on` | Optional known expiration date in quoted YYYY-MM-DD format |
| `badge` | Optional local badge or seal, as below |
| `links` | Additional named links, such as a historical program announcement |

Use the official program or credential name. No separate certificate,
certification, or training classification is needed or displayed.

A training-program link does not replace personal verification. Existing names
and dates remain based on the resume; current course pages may use newer course
names. The older BerkeleyX and Atala PRISM entries use labeled historical sources
rather than pretending an archived program page is an active enrollment page.

## Badge and seal images

Save the issuer-provided image under `assets/credentials/`, then add:

```yaml
badge:
  image: your-credential-badge.png
  alt: Your credential name badge
  source_url: https://issuer.example/training/course
```

Replace the example filename and URL with the real asset and source. Accepted
extensions are PNG, JPG, JPEG, WebP, and SVG, with lowercase filenames. The image
is bundled locally, sized to fit the card, and loaded lazily. No external image
service or runtime scraping is used. An unknown filename fails the page build
with a clear missing-badge error. Keep the exact badge version aligned with the
credential named in that record.

No badge images have been supplied yet, so current cards display their text and
links without empty image placeholders. Omit `badge` until its file is present.
No personal verification URL is invented from a program's generic badge.

## Validation

Run the normal content check/build after adding files. Invalid URLs, image paths,
missing required fields, duplicate IDs, and missing referenced expertise fail
validation. Production visibility still follows each record's publication status.
