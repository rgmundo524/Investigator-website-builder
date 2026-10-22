# Professional CV

`/cv/` is a print-friendly view of the site's existing Markdown. Its **Print /
save as PDF** button opens the browser's print dialog; select **Save as PDF** to
download a copy. It does not require a PDF service, separate database, or another
copy of your employment history.

The route exists only when Home and its profile are visible. A draft build can
preview it; a normal production build cannot expose a draft profile through the
CV route. The same publication rules apply to all included entries.

## Content sources

- Name, headline, location, and summary come from Home's selected profile.
- The optional `blocks.cv_summary` replaces the profile's short description in
  this view only.
- Experience follows the visible Work History page's `experience_source` and
  `experience` selection, and appears only if that page enables its experience
  section.
- Expertise follows Work History's enabled expertise section, with Home's
  selection used when that section is unavailable.
- Education and credentials follow the visible Credentials page's sections and
  selections. Credential issuer ordering is retained, and supplied expiry dates
  are printed.
- Selected work follows Home's `projects` selection.
- Only supporting pages for the same profile are used. A second profile's
  qualifications cannot accidentally become part of this CV.

## Optional prepared PDF

If you prefer a separately formatted PDF, place the approved file under your
selected content directory's `public/` folder and add a root-relative URL to the
profile Markdown:

```yaml
cv:
  url: /documents/professional-cv.pdf
  label: Download CV (PDF)
```

For this example, the file belongs at
`public/documents/professional-cv.pdf`. The prepared download appears alongside
the print action. Updating that PDF remains a separate task; the generated HTML
CV always follows the Markdown used by the website.

Review the print preview before sharing, particularly page breaks and link
appearance. Draft previews are marked above the document and should not be used
as an approved professional CV.
