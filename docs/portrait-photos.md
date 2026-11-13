# Profile and personal photos

Photo filenames belong to each investigator's Markdown. Put images in that
investigator's `assets/` folder, not in the shared builder.

Public portraits, personal photos and raster credential badges use processed image output. The production build also removes embedded EXIF/GPS, XMP, IPTC and text metadata from emitted PNG, JPEG and WebP files, including images copied from `public/`. Original files in your content pack remain unchanged. Pixels, filenames, captions and alternative text are still public; this is not image anonymization. Use animated WebP for animation; animated PNG is rejected to avoid flattening it.

## Page portraits

Each page owns the portrait beside its introduction. Open **Profile & pages → Pages**,
choose Home or another page, and use **Page portrait** to select or upload local
photos. Use **Show a portrait on this page** to include or hide it. Hiding keeps
its selected images and settings; the website reserves no empty portrait column.
There is no shared profile-photo fallback.

In the page file, such as `content/pages/home.md`, use:

```yaml
portrait:
  enabled: true
  images:
    - image: portrait.jpg
      alt: A professional headshot.
  autoplay: false
  interval_ms: 6000
  # caption: A public caption, if wanted.
```

Place the file at `assets/portrait.jpg`. Use lowercase letters, digits and hyphens
in filenames, with `.png`, `.jpg`, `.jpeg` or `.webp` extensions. Alternative text
should describe the actual photo. An omitted portrait is hidden; an enabled
portrait needs at least one photo.

Home and supporting pages each support an ordered list of photos. One photo is
static. With multiple photos, enable automatic rotation to cycle them.
`interval_ms` accepts 2000–60000 milliseconds. Photos change directly without
animated motion; reduced-motion settings do not stop automatic changes.
There are no public buttons, counters, clicking, dragging, or swiping controls.
Without JavaScript, the first photo remains visible. Home uses the larger
portrait layout; supporting pages use a compact layout.

Pages using the same ordered photos continue from the current photo and remaining
rotation delay as visitors navigate within a tab. This also works between the
large Home portrait and compact page portraits. Hover and focus do not affect
the sequence. Hidden tabs pause the countdown and resume with the remaining
delay when visible again.

Different photo lists keep separate sequence timing. A photo shared with the
last page stays selected when available; otherwise the list resumes its own
saved photo or starts with its first photo. State stays within the tab, site,
and profile name, expires after twelve hours, and leaves hidden-portrait pages
unchanged. If tab storage is unavailable, automatic rotation still works.

The optional `caption` belongs to this page and appears only when supplied.
An image's optional `source_url` is a saved provenance reference; the website
uses the local asset. Uploading saves the file immediately; save and review the
page to apply the assignment.

Article detail pages use the portrait settings of their selected article-index
page. Investigation category pages use their parent casework page's settings.
Hiding that parent's portrait also hides it on those detail pages.

## Personal photos

The Home and About pages can show photos of interests or activities. Put them in
`assets/images/personal/`, then add records to the relevant page, such as
`content/pages/home.md` or `content/pages/about.md`:

```yaml
personal_photos:
  - image: weekend-hike.jpg
    alt: Walking along a mountain trail.
    caption: A favorite way to spend the weekend.
```

On Home, assigned photos appear automatically above the contact section, in the
order listed. The portrait beside the homepage introduction is configured
separately under that page’s **Page portrait** controls. On other pages, keep `personal_photos` in that
page's `section_order`. Use the optional blocks
`personal_photos_heading` and `personal_photos_intro` to customize its text.
The builder exposes both fields under **Photos on this page**. Each page keeps
its own heading and subtitle; the default heading is **Photos**, with no subtitle.
Replace generated placeholders with your own images and update their captions.

The listed images must exist or the build will fail with the filename. Keep all
images in `assets/` suitable for publication, including files not currently
selected by a published page. Draft status does not guarantee image secrecy.

## Employment logos

Each employment record can include one optional local organization logo:

```yaml
logo:
  image: organization-logo.png
  alt: Organization name logo
```

Store the image in `assets/organizations/`. The Career editor provides an
**Organization logo** section with local selection, preview, **Upload logo**,
replacement, and removal controls. PNG, JPEG, and WebP are supported. Removing
the assignment keeps the original file.

The logo appears beside the job heading in work-history entries, on a solid
light tile in both themes. It keeps its proportions without cropping. It is
optional; jobs without logos keep the usual text layout. Logos are bundled into
the static website and do not depend on the original organization’s website.

## Education logos

Each education record can include one optional local university or institution
logo, using the same `assets/organizations/` directory as employment logos:

```yaml
logo:
  image: university-logo.png
  alt: University name logo
```

Under **Profile & pages → Education**, the **University logo** section offers
local selection, upload, replacement, and removal. The image appears beside the
education heading on a solid light tile, with its proportions preserved.
Removing an assignment keeps the image file. Save and review the education
record to apply its logo.

## Credential issuing-authority logos

Pages with a certifications and training section have **Issuing authority
logos** in the builder. Choose or upload one logo for each authority. It appears
beside that authority's group heading on a solid light tile. The entire logo is
shown without cropping. A group without an assigned logo keeps its text heading.

These logos share `assets/organizations/` with employment logos. Assignments are
stored once per issuing authority in that page:

```yaml
issuer_logos:
  - issuer: Example Training Authority
    image: example-training-authority.png
    alt: Example Training Authority logo
```

Issuer names match their credential groups regardless of capitalization or
repeated spaces. Save and review the page after changing its logo assignments.
Removing an assignment leaves the uploaded file in place.
