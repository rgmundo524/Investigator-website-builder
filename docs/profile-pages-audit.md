# Profile and page fields

This describes the website builder's public output. A content pack is editable source and can contain drafts and notes; it is not a public release. Use **Build published release** to prepare the files for hosting.

| Record | What appears on the website | Editor and privacy behavior |
| --- | --- | --- |
| Profile | Name, headline, initials and footer tagline; biography and portraits belong to Pages | Location is optional and displayed only when **Show location on website** is checked. Existing locations remain hidden. A separate short summary is optional because the website does not display it. |
| Employment | Role, organization, employment months, current status, summary, highlights, narrative and links; selected roles feed the career timeline | **Employment dates** supports separate periods and an explicit current-role choice. Unknown dates are recorded as unknown rather than invented. Location is optional and requires its own display checkbox. |
| Education | Institution, program, recorded study dates, optional university logo, summary, narrative and links | University logos use local uploads. Completion status and degree/attendance labels are not displayed. An absent end date does not by itself claim current attendance. |
| Credentials | Official name, issuer, issue year, supplied expiration date, summary, narrative, verification/training links and badge | Dates and links are public when entered and the record is selected for a published page. No expiration date is inferred; there is no separate type label. |
| Pages | Title, introduction, optional page portrait/slideshow and caption, biography and written sections, selected reusable records, section order, navigation and configured headings | **Search and sharing description** appears in page metadata and social previews even if it is not visible in the page body. A page selecting a contact record uses that record's introduction. |
| Supporting records | Skills, activities, interests, projects, resources and articles appear where a page selects or discovers them | Public content includes summaries, narratives, labels, links and relevant dates. Some structured configuration remains under **Additional fields**. |

## Saved source text

The editor separates recognized website headings from **Saved source text (not displayed)**. Unused profile fields such as directory biographies, unused custom text blocks, and editorial notes are preserved without suggesting they appear on the website. Entering an arbitrary block key does not create a new website section.

`editorial_note` is excluded from public rendering. Source-only summaries, blocks and image-source references are also not rendered automatically. They remain in the editable content pack and any repository containing it. Use a genuinely private location for sensitive evidence or personal records rather than treating an unused field as secure storage.

Specific source-only fields include the profile's `description_short` and `links`, `pages.portrait.images[].source_url`, credential `badge.source_url`, directory biographies, and custom blocks with no matching renderer. Put public contact links in a Contact record. A saved location is also excluded until its display checkbox is enabled.

Relationship fields serve different purposes: page selections determine what appears, while employment/project/expertise relationships also support validation and reuse. A relationship is not necessarily rendered as a public link.

The Home page has a fixed introduction layout. Its experience, expertise and project selections feed that layout; its generic `section_order` does not rearrange the homepage. Other pages use `section_order` to compose their sections. A contact-backed page uses the selected Contact record's body instead of the page's own introduction while that contact is visible.

## Photos, links and identifiers

Alternative text, captions, public links, visible locations, email addresses and phone numbers are part of the published page when configured. Slugs appear in page URLs or section anchors. Image assets may have public filenames. Choose values suitable for publication.

Published portrait photos, personal photos and raster credential badges use processed image output that removes embedded camera metadata. Private source images are preserved. SVG badges are vector source files and should contain only material intended for publication. Arbitrary files placed in `public/` are copied directly and are outside this image-processing path.

Optional GitHub statistics use third-party image URLs when enabled. These cause the visitor's browser to contact that image provider. Disable those statistics if that external request is unwanted.

## Remaining advanced configuration

Page sections, record selections and ordering, biography, written sections, image assignments, and organization contact cards have named controls. Less common settings such as timeline geometry, GitHub group configuration, employment highlights and some record relationships remain under **Additional fields**. These are working configuration, not unused input. Their schema and rendering are documented in the corresponding guides; the builder does not silently publish every stored field.
