# Record templates

These files are writing forms, not site content. Copy a form only when you have a real record to add. The site ignores this directory.

| Form | Copy completed record into | Page selection |
| --- | --- | --- |
| `case.md` | `content/cases/` | Chart and category fields |
| `experience.md` | `content/experience/` | Work history includes all |
| `credential.md` | `content/credentials/` | Credentials includes all |
| `education.md` | `content/education/` | Credentials: `education` list |
| `expertise.md` | `content/expertise/` | Work history: `expertise` list |
| `project.md` | `content/projects/` | Home, work history or casework: `projects` list |
| `skill.md` | `content/skills/` | About: `skills` list |
| `activity.md` | `content/activities/` | About: `volunteering`, `memberships` or `daos` list |
| `interest.md` | `content/interests/` | About: `interests` list |
| `resource.md` | `content/resources/` | Resources includes records by category |
| `article.md` | `content/articles/` | Add `articles` to Resources' `section_order` |
| `repository.md` | `content/repositories/` | About: `repositories` list and matching GitHub group |

Keep YAML frontmatter between the two `---` lines. Quote exact dates, for example `"2025-03-17"`, and month dates, for example `"2025-03"`. The forms contain no factual sample dates or amounts.

The casebook contains completed work only. Case dates `opened_on` (engagement date) and `closed_on` (report issue date) accept exact dates or `null`. Add `case_number` only after verifying it on the report cover; multiple matters may share a report number. `scope_summary` describes the commissioned tracing or analysis, assets or transactions examined, and period covered without client names or wallet addresses. Use one ordered `subcategory` list from broad to specific, or `[]` if none applies. Use only categories defined by the selected chart.

For this historical casebook, `opened_on` is the engagement date and `closed_on` is the report issue date. Describe the theft or incident date/range in the case narrative; it is not the engagement date. Post-report recovery updates are optional and should not be inferred.

Amounts are optional. The schema provides `reported_loss_usd` and `assets_reviewed_usd`; they are distinct measures. USD values use prices at the time of the relevant transactions by default. Use the optional `metrics.amount_note` to explain a different valuation date or basis, source or limitation. Do not use a reported loss as a recovered amount. Do not count repeated transfers as unique assets.

For employment dates, supply real non-overlapping `periods` with month-precision start/end dates. Use `end: null` only for a current role. Remove `active_position` when periods are supplied. If dates are unknown, keep `periods: []` and explicitly set the real current/previous status.

Education requires a real start month. Credentials require a real issue year. Those two forms deliberately leave the required fields unfilled and must be completed before adding to `content/`.

Delete unused optional fields. Keep `publication_status: draft` until the record is ready; no template is published by default.

## Optional GitHub repository cards

For a repository form with `group: personal`, add this group to `content/pages/about.md`, replacing the account and record slug:

```yaml
github_groups:
  - id: personal
    title: Public investigation tools
    account: your-github-account
    enabled: true
repositories:
  - your-repository-record-slug
```

Keep `github` in that page's `section_order`. The repository form's `owner` must match the group's `account`. Leave this section unused if you do not want repository cards.
