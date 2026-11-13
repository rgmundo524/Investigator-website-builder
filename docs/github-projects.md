# Optional GitHub projects

The About page can display curated public repositories. This is optional; the
blank investigator pack starts without a connected account or selected project.
There is no automatic account discovery, private-repository access, or background
sync.

1. Copy `record-templates/repository.md` into `content/repositories/`.
2. Fill in the owner, repository name, contribution, and description.
3. On `content/pages/about.md`, configure a matching `github_groups` entry and
   add the record's slug to `repositories`.
4. Keep `github` in `section_order` where the section should appear.

For example:

```yaml
github_groups:
  - id: personal
    title: Public investigation tools
    account: your-account
    enabled: true
repositories:
  - your-tool
```

The repository record's `group` must match `personal`, and its `owner` must match
the group's account. Validation catches missing records, duplicate repositories,
and owner/group mismatches. `blocks.github_heading` and `blocks.github_intro`
control the section's heading and introduction.

Cards use locally written descriptions and links derived from `owner` and
`repository`. An external GitHub statistics image is optional; use
`show_stats: false` to display only the local text and repository link. If the
image service is unavailable, the ordinary link and description remain usable.
Changing a repository's visibility does not automatically change your content.

Use `enabled: false` to hide a group while retaining its configuration. Remove a
repository from the selected list when it should no longer be presented. Review
all published project descriptions as claims about the investigator's own work.
