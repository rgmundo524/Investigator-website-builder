# Case charts and the case tracker

Every count comes from `content/cases/*.md`. Chart Markdown defines primary
category IDs, labels, and explanatory copy. Case Markdown supplies each case’s
classification path. No stored counts or percentages are needed.

## Two sunbursts, one Pagefind search

Criminal investigations and Litigation Support Investigations each have an
amCharts 5 [drill-down sunburst](https://www.amcharts.com/demos/drill-down-sunburst-chart/).
Both charts control the **same Pagefind search and result list**. There are no
per-chart result lists. The investigation file keeps its existing
`professional-investigations` slug so case references and URLs remain stable;
its displayed name is Litigation Support Investigations.

Casework is ordered as follows:

1. Summary statistics and the expandable detailed statistics.
2. The two sunburst charts.
3. Shared search and filters; results appear only after a query or filter is applied.
4. The force-directed case explorer.

- The inner ring shows primary categories, such as Pig butchering or Divorce.
- Subcategories are children of that category. Each further level is nested
  under the previous one and adds another ring, never an equal sibling.
- Selecting a branch zooms into it and filters Pagefind to all its descendants.
- Selecting a terminal slice filters to that exact classification; its parent
  remains in view because there are no deeper layers to reveal.
- A compact path above each chart reads **All / investigation / category /
  subcategory**. Each segment selects that level without separate navigation
  boxes. Below each chart, only
  **All category counts and shares** remains; the extra subcategory button rows
  and instructions are removed. Its expandable table includes the complete
  classification hierarchy and chart notes.
- The investigation name in the path selects the full investigation. Switching
  investigations through a chart or dropdown clears the old category path,
  and network filters. The new chart selection becomes active; the
  previous chart returns to its overview.
- Refining within one investigation preserves the typed query and other filters.
  Switching investigations also preserves the typed query.
- **All** in the path clears the query and every filter, returns both
  charts to their initial views, and hides the result list again.
- Native Investigation and Category dropdowns update chart selection as well.
  Single selection prevents combining incompatible classification branches.
- Theme changes preserve shared filter state. Reduced motion disables chart
  transitions. Filters clicked before Pagefind loads are queued and applied.

The search opens directly with its input and filter tools, without a visible
heading or introductory instructions. Results, counts, and the active-selection
controls remain hidden until a nonblank search term or a filter is applied.
Clearing the last active criterion collapses that area again. Pagefind still
preloads in the background to prepare the filter options.

All results have their existing case-detail links. Examples retain their explicit
labels and dataset filter. Charts and statistical totals always describe their
whole investigation dataset; the Pagefind result count reflects additional text,
network, and status filtering.

## Markdown classification paths

Existing single-level entries still work:

```yaml
chart: criminal-investigations
category: hacks
subcategory: bridge-exploit
```

For deeper classifications, use an ordered list under the same field:

```yaml
chart: criminal-investigations
category: pig-butchering
subcategory:
  - investment-platform
  - fake-exchange
  - withdrawal-fee
```

This means **Pig butchering → Investment Platform → Fake Exchange → Withdrawal
Fee**. A list is one parent-to-child path, not several unrelated tags. Add more
items for more levels. Use lowercase words separated by hyphens; display labels
are generated automatically. No central subcategory registry needs updating.
The same ID under different parents or investigation types stays separate.

`subcategory: null` or an omitted field becomes **Unspecified**. Empty lists,
blank items, nested lists, and invalid slugs fail validation.

Cases can stop at different depths. If some end at Investment Platform while
others go deeper, a **No further classification** bucket holds those shorter
paths. This prevents them from disappearing or being counted again. Selecting
Investment Platform still shows both the shorter and deeper cases.

Category pages group cases by the first subcategory and display the complete
classification path in each case’s facts. Existing category and case anchors
remain stable. Pagefind indexes every ancestor prefix of the complete path under the internal
`CasePath` filter. For example, Fake Exchange is indexed beneath Investment
Platform and Pig butchering, not as an unrelated tag. The same label under a
different parent cannot match that path. An exact terminal token distinguishes
shorter paths from their deeper descendants.

## Counting and publication rules

- One case contributes one count to one investigation and one classification
  path. Slugs remain unique even if files are renamed or copied.
- Parent counts equal the sum of their children. Only terminal buckets supply
  numeric values to amCharts, preventing parent/child double counting.
- Each investigation has its own denominator. Tooltips explicitly show shares
  of the entire investigation and the parent group. Zoom changes the visible
  branch, while Pagefind reports the matching result count. The count tables
  always describe the entire investigation.
- Zero cases means zero slices. Empty primary categories remain in the count
  tables, with links to their category pages.
- Real case studies and illustrative examples stay in separate datasets.
  Examples remain drafts and cannot be published as actual work.
- Production includes only published real cases in published charts. Draft
  preview includes the illustrative records. Chart JSON contains only explicitly
  selected display fields, never editorial notes or unused content blocks.

The fictional examples include two paths below Pig butchering and a deep
litigation support path below Divorce. They demonstrate navigation, not real findings.

## Appearance and fallback

The sunbursts remain transparent so the particle background shows through.
The force-directed explorer retains a solid theme-matched background for wheel,
pinch, and drag interaction. amCharts attribution remains visible.

Charts load near the viewport. Expandable count tables, the nested hierarchy,
and the explorer’s text case list are server-rendered and remain available
without JavaScript or when chart/search loading fails. Small slices retain
tooltips and keyboard focus on the chart itself.

Edit `src/config/case-visuals.json`:

| Setting | Meaning | Default |
| --- | --- | --- |
| `sunburst.radius` | Percentage of available chart radius | 96 |
| `sunburst.innerRadius` | Center hole as a percentage of radius | 12 |
| `sunburst.visibleLevels` | Visible descendant depth; null shows all available layers | null |
| `sunburst.transitionDuration` | Drill transition milliseconds, zero with reduced motion | 350 |
| `tree.minRadius` / `tree.maxRadius` | Force-tree node radius range in pixels | 26 / 62 |
| `tree.bulletDuration` | Milliseconds per traveling dot | 3500 |
| `tree.initialDepth` | Initially visible levels below the tree root | 2 |

## Force-directed case explorer

The view fits the visible nodes and their labels inside the available canvas,
including after expanding a branch or resizing an automatically fitted view.
**Fit view** restores that framing without collapsing the open branches.
Manual zooming or dragging keeps the chosen view until Fit view or another
branch expansion is used. **Collapse cases** also refits the remaining nodes.

The explorer still follows **Casework → Investigation → Primary category → Case**.
Parents expand and collapse; individual cases open their details. Node size uses
case counts. Only case leaves have a numeric value of 1. Its text list remains
available alongside the canvas.

Zoom, fit, collapse, and pause controls remain available. Animated dots show
navigation relationships, not transactions or money movement. Pause stops both
the dots and simulation. Reduced motion produces a settled layout; offscreen
explorers and background tabs pause automatically.

`blocks.chart_label` optionally provides a short case-node label. Tooltips retain
full titles, summaries, status, classification, dates, and networks. This explorer
adapts the [Force-Directed Tree with Animated Bullets](https://www.amcharts.com/demos/force-directed-tree-with-animated-bullets/).

Read [the case record guide](case-tracker.md) for field definitions and publishing
rules. All visualizations use the existing amCharts dependency without a new
client framework, database, or remote chart service.

The Pagefind bridge uses its [documented component instance API](https://pagefind.app/docs/custom-components/).
`src/lib/case-search-filters.ts` owns shared selection and filter normalization;
`src/scripts/case-search.ts` connects it to the existing Pagefind instance.
Dropdown corrections are deferred until after Pagefind’s originating event so
an older request cannot supersede a newer selection.
