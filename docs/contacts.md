# Contact information and service links

Edit `content/contacts/reymundo.md` to change the contact page introduction,
organization cards, personal contact information, and social accounts. No Astro
or CSS changes are needed to update the displayed information.

`content/pages/contact.md` selects this record with `contact: reymundo` and
continues to control the page title, metadata, and publication status. The
selected contact record's Markdown body supplies the visible introduction.

## Organization cards

Each entry under `services` becomes one card. Copy an entry to add another
organization, then change its `id`, content, and links.

| Field | Purpose |
| --- | --- |
| `id` | Unique, stable identifier; lowercase words separated by hyphens |
| `name` | Organization name |
| `description` | Plain-text explanation of its services and audience |
| `display_order` | Lower numbers appear first; defaults to 100; ties use `id` |
| `enabled` | Set to `false` to hide the card without deleting its configuration |
| `website.label` / `website.url` | Optional website link and its visible text |
| `action.label` / `action.url` | Required button text and direct enquiry/onboarding destination |
| `booking.label` / `booking.url` | Optional Google appointment popup button and full schedule URL |
| `booking.enabled` | Set to `false` to hide booking while keeping the organization card |
| `email` | Optional public organization email; omit or use `null` to hide |
| `phone.label` / `phone.number` | Optional displayed phone number and international dialing number |

For example, a phone may use `label: '903-705-5802'` and
`number: '+19037055802'`. The displayed label can contain spaces and punctuation;
the dialing number must start with `+` and contain only digits after it.

The current cards link to Go-Crypto's Report Fraud page and CipherBlade's
Contact page. These are ordinary external links, opening in the same tab. The
site does not collect enquiries or automatically redirect someone on page load.

## Personal and social card

`social` supplies a single combined card:

- `title`, `name`, and `description` control its visible text.
- `email` and `phone` work like organization contact fields. They are currently
  `null` because no personal email or phone has been selected for this site.
- `links` is a list of `label` / `url` pairs displayed in the written order.
  LinkedIn and GitHub are populated; add other accounts to the same list.
- Set `enabled: false` or remove `social` to hide the entire card. A card without
  any links, email, or phone is also omitted.

Social URLs and service details are not inferred from platform names, jobs, or
the profile. The old profile `public_email` field has been replaced by
`social.email` here. The homepage, header, and footer link to `/contact/` when
that page is visible, so visitors can choose a destination.

## Visibility and validation

The new record remains a draft, like the rest of the supplied content. Local
development and draft builds show it. To publish the contact page, its selected
profile and contact record must also be published; the content checker rejects
missing references and published pages that select draft records.

Use `npm run check:content` after editing. Website and action URLs must use HTTP
or HTTPS. Emails, dialing numbers, unique service IDs, and misspelled fields are
validated. Disabled entries are still validated so they can be enabled later.

Only displayed fields are rendered. `editorial_note` remains an authoring note,
and personal contact information is not added to the case-search index. No
database, form backend, email-delivery service, or new package is needed.

## Scheduling calls with Google Calendar

Google Calendar's native appointment schedules can handle booking without a
custom scheduler, Calendar API integration, or D1 table in this site. On desktop,
choose **Create → Appointment schedule**, set your availability and call duration,
enable calendar availability checks, and select Google Meet if appropriate. Save
the schedule and copy its booking-page link.

Each organization can now have a `booking` object with `label`, `url`, and
`enabled`. The Go-Crypto and CipherBlade schedules supplied by Reymundo are
configured on their respective cards. Go-Crypto comes first through its existing
`display_order: 10`. To offer only Go-Crypto bookings, set the CipherBlade card's
`booking.enabled` to `false`; its ordinary contact information remains visible.

Use the full HTTPS `calendar.google.com/calendar/appointments/schedules/...`
address. Open a `calendar.app.google` short link and copy its final URL, or copy
the URL from Google's website-embed settings. The supplied short links are kept
in the non-rendered editorial note for reference. Validation rejects private
calendar-view URLs and unrelated providers in the booking field.

`BookingButton.astro` loads Google's official booking script and stylesheet once
on the contact page. Google renders the popup, availability, and booking form;
the site does not implement a scheduler or store calendar credentials. Existing
booking links work when JavaScript, Google's script, or its stylesheet cannot
load. After initialization, an "Open booking page" link remains available if
the popup's embedded calendar fails. The site's dark-red theme styles the buttons, and a narrow-screen CSS
override reduces the official popup's side padding on phones. That override
uses Google's current popup/close-button classes; recheck it if the upstream
widget changes. Normal social links can
still include a booking URL when only an external link is wanted.

A personal Google Account supports one booking page. Checking availability
across multiple calendars, extra schedules, and automated reminders require an
eligible paid plan. Booking details and notifications are configured in Google
Calendar; these widgets do not enable the proposed visitor database or direct
message form.

Official guides, checked September 8, 2026:
[create an appointment schedule](https://support.google.com/calendar/answer/10729749?hl=en),
[plan features](https://support.google.com/calendar/answer/16287038?hl=en),
[share or embed a booking page](https://support.google.com/calendar/answer/10733297?hl=en).

## Initial link sources

Checked September 7, 2026:

- [Go-Crypto intake and public email](https://www.go-crypto.org/report-fraud)
- [Go-Crypto website and public phone](https://www.go-crypto.org/)
- [Go-Crypto service descriptions](https://www.go-crypto.org/copy-of-educational-victim-services)
- [CipherBlade enquiry page](https://cipherblade.com/contact/)
- [CipherBlade services](https://cipherblade.com/)

The LinkedIn account comes from the supplied resume. GitHub uses the account
provided for this project. No additional personal accounts or email addresses
were inferred. Start another directory from `templates/contacts.md` if needed.

## Clarifying the destination

Each service can set an optional `audience` sentence and `primary: true` to
highlight the preferred route. At most one enabled service can be primary.
These fields do not change any destination or booking account. When both
organizations are offered, explain which enquiries each is intended to handle.
