# Blockchain investigator website: fill-in pack

This is a blank content pack for a blockchain investigator's personal website. It is **not a built website or a deployment ZIP**. The website builder reads an unzipped folder; it never reads this ZIP directly.

Return the completed folder to the sender, or ZIP that folder so the sender can unpack it. Keep the folder structure and the fixed filenames below. There are no sample cases, jobs, credentials or fictional achievements to remove.

## Start here

1. Unzip the pack if necessary. Open the `investigator-site/` folder.
2. Set your website URL in `site.json`. The `https://example.com` value is a placeholder.
3. Fill in `content/profile/investigator.md`: name and headline. Write your biography on the About page.
4. Fill in `content/contacts/investigator.md` using the contact instructions below.
5. Replace the bracketed text and writing prompts in the seven `content/pages/` files.
6. Add your real records using `record-templates/`. Those templates are outside `content/` and do not appear on the site.
7. Add only images and public downloads suitable for publication.
8. Leave every `publication_status` as `draft` and return the completed folder or ZIP to your coordinator for review and publication.

You do not need Node.js, a hosting account or website commands to complete this pack. Open the Markdown files in a text editor, fill in what you know, and return the folder. The coordinator handles previewing and publishing.

## Fixed pages and identity

Keep these names and the `profile: investigator` references. Edit the contents, not the identity:

| File | What to supply |
| --- | --- |
| `content/profile/investigator.md` | Your name and headline |
| `content/contacts/investigator.md` | Your public contact methods |
| `content/pages/home.md` | Short introduction and professional focus |
| `content/pages/work-history.md` | Career introduction and expertise |
| `content/pages/casework.md` | Introduction to your anonymized completed cases |
| `content/pages/credentials.md` | Education and professional development |
| `content/pages/about.md` | Technical introduction, biography, skills, interests, community activity and photos |
| `content/pages/resources.md` | Introduction to the resources you have reviewed |
| `content/pages/contact.md` | Page title and description; write the visible introduction in `content/contacts/investigator.md` |

The two `content/charts/` files define the standard investigation categories. They contain no cases or stored counts. Keep their identifiers so the case template's categories match.

## Add your records

See [Record instructions](record-templates/README.md). Copy only a record you need into its matching `content/` collection, choose a unique lowercase-hyphenated filename and matching `slug`, and replace every writing prompt. Leave unknown optional dates and amounts as `null`.

The credential and education templates have required date placeholders. Fill those fields before moving them into `content/`; do not make up a year or month to satisfy validation. Unused templates stay outside `content/`.

Work-history and credential pages automatically include their published records. For other collections, add the record slug to the matching list on its page. Examples:

```yaml
# content/pages/work-history.md
expertise:
  - your-expertise-slug
projects:
  - your-project-slug
```

```yaml
# content/pages/about.md
skill_groups:
  - name: Investigation
    skills: [your-skill-slug]
interests:
  - your-interest-slug
```

Cases appear through their `chart` and `category` fields. The case page already selects both charts. Keep client names, addresses, wallet addresses and confidential evidence out of public descriptions.

The coordinator can connect the selection lists for you. If you are unsure which list needs an entry, leave a note and return the record. Keep all records as drafts even after completing the text.

## Contact details

The initial contact record has no addresses, services or social links. To show public personal contact details, add a `social` block to its frontmatter:

```yaml
social:
  title: Connect with me
  name: "[Your full name]"
  description: "[How you prefer to be contacted]"
  enabled: true
  email: null
  phone: null
  links: []
```

Replace `email: null` with your real public email if desired. Add links as `- label: ...` and `url: https://...`. Optional phone data uses a readable `label` and an international `number`, for example the format `+<country code><number>`. Remove fields you do not need. For services, use the [service-card example](instructions/contact-service.md) and replace every prompt and URL.

## Photos and files

- Put portraits in `assets/`.
- Put personal photos in `assets/images/personal/`.
- Put public credential badge images in `assets/credentials/`.
- Put deliberately public downloads in `public/`.

Use lowercase hyphenated filenames, such as `portrait-speaking.webp`. In each page file, select that page’s portrait with one list format:

```yaml
portrait:
  enabled: true
  images:
    - image: portrait-speaking.webp
      alt: "[Describe your actual photo]"
  autoplay: true
  interval_ms: 6000
```

Add the actual file before adding the reference. For personal photos, add `personal_photos` entries to the About page, each with `image`, `alt`, and `caption`.

All files in `public/` are public. Keep `assets/` suitable for publication too: image loading can emit assets even when a draft or unused page does not display them. Store private reports and evidence outside this pack.

## Return the completed pack

Return the entire folder, or use your file manager to ZIP it and send that ZIP to the coordinator. Include the photos you selected. Leave unknown details unfilled, and add notes where you need help.

The coordinator unpacks your folder, previews it with the shared builder, reviews the content with you and publishes the ready records. **This fill-in pack ZIP is never the folder to upload to website hosting.**

`site.json` intentionally contains only the website URL, language, locale and appearance settings. You do not need to supply technical hosting settings to fill in this pack.
