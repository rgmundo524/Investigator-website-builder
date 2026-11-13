# Maintaining the completed-case portfolio

The casebook presents completed work suitable for a public website. It is not a live investigation tracker. Do not add active or on-hold matters. There is no case-status field.

Use the [Investigator Website Builder](editor.md) to edit cases, review changes, and preview the website. Markdown files remain the source of truth. Applying a change updates local content; a new release must be built and uploaded to update the public website.

## Case identity

`case_number` is the reference printed on the report cover. Keep it as a quoted string so prefixes and leading zeroes survive. Do not substitute a victim name or infer a number from a folder name. It is optional when the available report does not establish a number.

The number is the visible case heading when supplied. `title` is a brief anonymized description, and `description_short` is the summary. The editor labels them **Public description** and **Summary**. A descriptive heading remains as a fallback until a report number is verified.

`slug` is a separate internal file and link identifier. Keep existing slugs stable. Two distinct matters can share the same report number, so the number is not required to be unique. New records receive a safe file identifier automatically in the editor.

## What the scope describes

`scope_summary` states the commissioned tracing or analysis, the assets or transactions examined, and the period covered. It is a description of the work, not a question. It describes the engagement, rather than all activity by a perpetrator or only the initial stolen balance.

- Criminal investigations: describe the reported event or loss and the funds or question traced.
- Civil, disclosure and due-diligence investigations: describe the holdings, transactions or dispute under review. Assets need not have been stolen.

`networks` and `assets` are optional context about the investigation, including information established during the work. They are not an inventory of a person's wallets. Do not publish client names, addresses or transaction hashes in case metadata or narratives.

## Case fields

| Field | Meaning |
| --- | --- |
| `case_number` | Verified report-cover reference, quoted as text |
| `title`, `description_short` | Anonymized description and summary |
| `scope_summary` | Optional commissioned work, assets or transactions and period in scope; omit when undocumented |
| `chart`, `category` | Investigation group and primary classification |
| `subcategory` | Ordered classification path from broad to specific, or `[]` |
| `opened_on` | Engagement date from the report introduction, quoted YYYY-MM-DD or null |
| `closed_on` | Report issue date from the cover, quoted YYYY-MM-DD or null |
| `role` | Investigator's actual contribution or role |
| `networks`, `assets` | Optional network IDs and asset symbols relevant to the work |
| `off_chain_leads` | Optional confirmed lead types only: IP/email addresses, phone numbers, social media accounts or URLs; never the actual identifiers |
| `jurisdictions` | Optional countries or territories relevant to the work; select multiple using the editor's searchable checkboxes |
| `services` | Existing supported service tags; not a GoCrypto package selection |
| `metrics.reported_loss_usd` | Optional reported loss for a criminal matter |
| `metrics.assets_reviewed_usd` | Optional asset value within a civil review's scope |
| `metrics.amount_note` | Optional source, limitations or different valuation basis/date |
| Markdown body | Evidence, approach, findings, deliverables and limitations |

There are no wallet-count or transaction-count fields. Keep identifying evidence in the private case records. A known zero amount is `0`; an unknown amount is `null`. USD amounts use values at the time of the relevant transactions by default and never imply recovery. A separate valuation date is not collected. Explain a different valuation basis, date, source or limitation in the optional amount note; do not substitute the engagement or report date. Omit figures that are unnecessary for the public summary.

The editor shows loss fields for criminal investigations and asset-review fields for civil investigations. The fixed service checklist is intentionally absent until the GoCrypto marketing material supplies the package names and definitions. Historical service tags are preserved without retroactively claiming a package was purchased.

## Add and review

1. Choose **New case**, or copy `templates/cases.md` into the selected pack's `content/cases/` folder.
2. Supply verified facts and an anonymized narrative. Leave unavailable optional facts blank rather than guessing.
3. Choose **Save working draft**, then **Review changes**. Resolve validation errors before applying.
4. Apply as a website draft and preview. Mark reviewed content published when it is ready for the next static release.

Only published actual case records in published charts contribute to production statistics. Draft publication status is a review decision, not an investigation status. Example content is isolated to the example pack and never contributes to the real portfolio.
