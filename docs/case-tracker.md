# Adding and maintaining case records

This is a Markdown-backed running record of casework. Editing files updates the
local development site; the static public site updates when you rebuild and
upload it. There is no separate database, browser editing form, or scheduled job.

## Add a case

1. Copy `templates/cases.md` to `content/cases/case_001.md` (or another filename).
2. Set a unique `slug`, such as `case-001`. Keep that identity stable.
3. Choose an existing chart and one primary category from `content/charts/`.
   Set `subcategory` to a lowercase hyphenated ID, such as `bridge-exploit`,
   an ordered list of IDs for deeper levels, or `null`. Each list is a single
   parent-to-child path. Subcategories are discovered directly from case files.
4. Enter the facts you have and write the narrative sections. Leave unknown dates
   and numbers as `null`; an empty list means no details have been entered.
5. Use `content_kind: case_study` for actual work or `example` for invented data.
6. Run `npm run check` and view Casework with `npm run dev`.

No page list or counter needs updating when you add a case. In production, only
published case records in published charts count. Publishing a record requires
publishing its referenced chart. A private repository does not make a published
website private; case Markdown should contain the version you intend the site
to display. Keep confidential evidence and administrative records separately.

## Facts to gather from historical cases

| Field | Meaning |
| --- | --- |
| `title`, `description_short` | Public-facing title and short scope summary |
| `chart`, `category` | One investigation group and one primary classification |
| `subcategory` | A classification ID or ordered list from broad to specific; null/omitted becomes Unspecified |
| `case_status` | `active`, `completed`, `on_hold`, or `unspecified` |
| `opened_on`, `closed_on` | Quoted `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, or null; closing is for completed cases |
| `role` | Your actual contribution or position in the engagement |
| `experience` | Optional slug of the related employment record in `content/experience/` |
| `networks` | Unique lowercase IDs such as `bitcoin`, `ethereum`, `tron`, `arbitrum` |
| `assets` | Asset symbols or names such as BTC, ETH, USDT |
| `jurisdictions` | Jurisdictions relevant to the matter, when appropriate to include |
| `services` | `tracing`, `osint`, `forensic-report`, `expert-report`, `deposition`, `testimony` |
| `metrics.addresses_reviewed` | Count of distinct on-chain addresses reviewed; identify addresses by network |
| `metrics.wallets_reviewed` | Count of distinct wallets identified and reviewed; do not treat each address as a wallet |
| `metrics.transactions_reviewed` | Distinct transactions reviewed within the recorded scope; identify transactions by network and transaction ID |
| `metrics.reported_loss_usd` | Reported loss for this matter in USD; not an independently proved loss or a recovery |
| `metrics.assets_reviewed_usd` | USD asset value within the review scope, excluding repeated transfer turnover |
| `metrics.reported_loss_valuation_date`, `metrics.reported_loss_note` | Exact valuation date and source/basis for the reported loss |
| `metrics.assets_reviewed_valuation_date`, `metrics.assets_reviewed_note` | Exact valuation date and source/basis for assets reviewed |
| `metrics.valuation_date`, `metrics.amount_note` | Optional shared fallback for both figures; existing files continue to work |
| `links` | Appropriate public supporting sources, each with a label and URL |
| `blocks.investigative_question` | Optional short question reused as a callout |
| Markdown body | Evidence, approach, findings, deliverables, limitations, and follow-up |

Each USD amount requires both a valuation date and an amount note. Use the
figure-specific fields when reported losses and reviewed assets use different
dates or sources. Otherwise the shared `valuation_date` and `amount_note` apply
to both figures. Financial valuation dates still require a full `YYYY-MM-DD` date;
partial dates apply only to case opening and completion dates. A known zero is
`0`; an unknown amount is `null`. Do not count the same loss in several records
or turn repeated movements of the same funds into additional assets reviewed.
If one engagement has several phases, update its record rather than counting
those phases as new cases. Files may live in subfolders; discovery is recursive.

### Historical dates without invented precision

If only the year is known, use `opened_on: "2021"`. If the month is known, use
`opened_on: "2021-07"`. Use `"2021-07-14"` only when that date is documented.
The site displays these as 2021, Jul 2021, and Jul 14, 2021. All three contribute
to the 2021 opening-year statistics. Leave a wholly unknown date as `null`.

Validation compares date ranges. A case opened in `"2021-07"` cannot close in
`"2021-06"`, but a case with only `"2021"` as its opening year may close in
`"2021-06"` because the exact opening month is unknown. Impossible calendar dates
such as `"2021-02-29"` are rejected.

### Consistent classification paths

Primary category IDs are defined by the chart. A chart may also define an optional
`subcategory_paths` vocabulary. Each path includes the primary category followed
by its increasingly specific subcategories:

```yaml
subcategory_paths:
  - [pig-butchering, investment-platform, fake-exchange, withdrawal-fee]
  - [pig-butchering, investment-platform, fake-exchange, account-freeze]
  - [hacks, bridge-exploit]
```

For the first path, a case uses `category: pig-butchering` and
`subcategory: [investment-platform, fake-exchange, withdrawal-fee]`. A shorter
prefix such as `[investment-platform]` remains valid when that is all the
classification supported by the evidence. Omit `subcategory_paths` or leave it
empty to preserve the original behavior of discovering subcategories from cases.

Use `case_networks` in the selected content directory's `site.json` to optionally
restrict network IDs. For example, `"case_networks": ["bitcoin", "ethereum", "tron"]`
rejects misspelled or alternate IDs. Without that setting, existing free-form
network IDs continue to work. Choose `ethereum` instead of mixing it with `eth`.
Do not change an existing case slug when correcting its classification.

### A small first batch

Start with five varied cases before importing the full history: an active matter,
a completed matter, a multi-network trace, a report or testimony engagement, and
a historical matter with incomplete dates or no publishable financial amount.
Check that each is counted once, uses the intended categories, and distinguishes
addresses, wallets, reported losses, and reviewed assets. Keep each record in
draft until its public wording and supporting links have been reviewed.

## Derived statistics

- Total records, active cases, completed cases, and distinct networks.
- Separate criminal/litigation-support chart totals, with category and subcategory counts.
- Case counts by opening year, including an Undated bucket, and by status.
- Counts by network and service. A case can appear in several of these groups,
  so these counts are not parts of one exclusive total.
- Reported losses and assets reviewed, kept as separate USD totals. Each shows
  coverage, such as 4 of 10 cases with an amount recorded. These use historical
  valuations, are not current market values, and do not imply a recovery rate.

Actual and illustrative records never contribute to the same statistics.
Statistics describe the records entered so far, not an inferred lifetime total.

## Examples

The ten original illustrative records now include structured facts. Three new
copyable examples give unequal chart proportions and demonstrate missing data:

- `content/cases/case_011.md`: active cross-network scam review.
- `content/cases/case_012.md`: completed bridge exploit analysis.
- `content/cases/case_013.md`: historical holdings review with unknown dates and
  financial values.

All 13 examples remain drafts. Their dates, values, and engagement details are
fictional and can be replaced or removed as real records are entered. To reuse
an example for an actual case, replace its claims and metadata, change its slug,
and set `content_kind: case_study`.

The examples include `hacks → bridge-exploit / protocol-exploit` and
`divorce → asset-disclosure / historical-holdings`. Some subcategories remain
null to demonstrate how unclassified records stay in the totals. Primary
categories remain centrally defined; adding a subcategory needs only the case file.

Both sunbursts filter one shared Pagefind result list at every level. See the
[chart guide](case-charts.md#markdown-classification-paths) for a copyable nested
path. `case_011.md` and `example-investment-scam-tracing.md` share Investment
Platform → Fake Exchange, then split into Withdrawal Fee and Account Freeze.
`case_013.md` shows Historical Holdings → Wallet Ownership → Self Custody under
Divorce. These classifications are illustrative, like the rest of the examples.
