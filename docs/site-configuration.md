# Investigator site settings

Each investigator's content folder has one `site.json`:

```json
{
  "version": 1,
  "url": "https://investigator.example",
  "language": "en",
  "locale": "en-US",
  "appearance": {
    "defaultTheme": "dark",
    "particles": true
  }
}
```

| Setting | Purpose |
| --- | --- |
| `version` | `1`, the format used by this builder |
| `url` | The website's HTTP(S) origin, without a path; used for canonical URLs and social images |
| `language` | HTML language tag; defaults to `en` |
| `locale` | Date and number format; defaults to `en-US` for English |
| `appearance.defaultTheme` | `dark` or `light`; defaults to `dark` |
| `appearance.particles` | `true` or `false`; defaults to `true` |

Language and locale do not translate the English interface. Identity, biography,
contact details, jobs, and cases belong in `content/`, not this settings file.
Unknown settings and invalid values stop validation. Restart the local server or
rebuild after changing settings.

There are two environment variables for choosing a deployment:

- `SITE_DATA_DIR`: the completed, unzipped content folder. Relative paths resolve
  from the builder root. If unset, the blank `templates/investigator-site` pack
  is used for preview.
- `SITE_URL`: optional domain override for that build. Normally, use the domain
  already recorded in `site.json`.

Published builds allow search-engine indexing automatically. Local development
and draft review builds use `noindex, nofollow`. There is no indexing setting:
search-engine discovery is expected for these public professional websites.
This has no effect on the website's own case search or its compute requirements.
See [Google's explanation of the robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

A normal build includes only `publication_status: published` entries. A draft
build includes unreviewed content, so keep `dist-drafts/` local. Search metadata
is not access control and does not make a deployed draft private.
