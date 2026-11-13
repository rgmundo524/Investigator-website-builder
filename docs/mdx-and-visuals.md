# MDX and visual integrations

## Reusable content with MDX

All collections accept `.md` and `.mdx` files with the same frontmatter schema,
reference checks, draft rules, and slug-based URLs. No existing Markdown file
needs converting unless it benefits from components. Duplicate slugs across
formats are rejected. Keep imports below the closing frontmatter separator.

Use `.md` for ordinary jobs, credentials, hobbies, page settings, and prose-only
cases. Use `.mdx` when an article or other entry benefits from components inside
its body. These formats already share one content system, so standardizing the
extension would not simplify the schemas or rendering. If you prefer MDX for a
particular entry, rename it rather than keeping both versions, and retain its
slug. MDX uses JSX syntax: literal braces and angle brackets can need escaping,
and component tags must be correctly closed. Check and build after conversion.

References: [Astro MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/),
[MDX syntax troubleshooting](https://mdxjs.com/docs/troubleshooting-mdx/#problems-writing-mdx).

The unused `templates/investigation-notes.mdx` example demonstrates two components.
It is outside the content collections and does not appear as the investigator's writing:

```mdx
import Callout from '@components/Callout.astro';
import Disclosure from '@components/Disclosure.astro';

<Callout title="Key finding">

Explain the main point with **Markdown** formatting.

</Callout>

<Disclosure title="Method and limitations">

Supporting details can be expanded with a mouse, touch, or keyboard.

</Disclosure>
```

`Callout` accepts `title` and `tone="note"` or `tone="caution"`. `Disclosure`
accepts a required `title` and uses native HTML details, with no JavaScript needed.
Both are reusable in case records and articles. Use `templates/articles.mdx`
for another entry. The `@components/` alias works from content subfolders, including an external
`SITE_DATA_DIR`. Use `@site-assets/` to import that person's images.

MDX compiles as code, so author it as part of the trusted project source. Content
validation parses its syntax without executing it; Astro renders it during the
normal build. Interactive Astro components can bring their own scripts without
requiring a React integration. Case search extracts literal MDX prose and omits
imports, expressions, and component attributes. Keep important searchable facts
in the normal summary and body text, even when a component also displays them.

## Astro Icon

Navigation, actions, dark mode, article callouts, and case source links use Lucide
icons through `astro-icon`. The selected names are listed in `astro.config.mjs`.
The installed `@iconify-json/lucide` package supplies the SVGs locally; there are
no remote icon requests. Add another icon name to the include list before using it.
Navigation mappings are in `src/lib/icons.ts`. Icons supplement visible labels
and are hidden from screen readers when decorative.

## OpenGraph Canvas

`src/pages/open-graph/[...route].ts` generates 1200 × 630 PNG cards for visible
pages, articles, and case categories. For example:

- `/open-graph/home.png`
- `/open-graph/resources.png`
- `/open-graph/investigations/professional-investigations/divorce.png`

Titles and summaries come from the content, with navy/burgundy styling and the
site name. Very long text is shortened only on the card to fit its dimensions.
The shared layout supplies matching absolute Open Graph and X image URLs, title,
description, and canonical metadata. Article pages also include their dates.

The Inter fonts come from the pinned `@fontsource/inter` npm dependency under
its OFL-1.1 license. CanvasKit generates images using WebAssembly. Generation
does not fetch remote fonts, and Cloudflare can serve the generated PNGs as
ordinary static assets. Builds still need the installed npm packages.

Production cards obey the same draft filtering as pages. With the current draft
content, production contains only a “Site in preparation” homepage and card.
Draft cards stay in `dist-drafts/`. Metadata uses the selected `site.json` URL;
social platforms can fetch it once the matching build is publicly hosted. Current
Published pages allow search-engine indexing; local draft reviews carry `noindex`. An anchor link to a case shares its category
page's card because URL fragments are not separate pages.

## tsParticles

Every page contains a decorative network of connected particles, mounted once in
the shared site layout. The canvas covers the full page height and scrolls with
the content, so scrolling reveals another part of the same animated network.
The positioned body sizes the canvas through CSS; tsParticles' built-in resize
observer updates it when content expands or contracts, including case search
results. Short pages still receive a background at least one screen tall.

Pointer movement highlights nearby connections. Scrolling clears the previous
cursor connection until the pointer moves again, so an outdated hover position
does not remain attached to a point farther up the document. The canvas does not
intercept links or text selection. The animation follows light/dark mode, pauses
when the browser loses focus, and runs at a capped 30 frames per second. Small
screens use fewer particles.

The background runs automatically, with no public play or pause control and no
saved visitor pause preference. Use `appearance.particles` in the investigator's
`site.json` to enable or disable it. Users with reduced motion enabled receive
no animation or particle-engine download. The engine loads only when animation
is enabled.

Adjust the animation in `src/config/particles.json`:

| Setting | Default | Effect |
| --- | --- | --- |
| `count.desktop` | `100` | Total nodes across the full page on screens wider than 760px |
| `count.mobile` | `50` | Total nodes across the full page on screens up to 760px wide |
| `size.min` | `3` | Smallest node radius in pixels |
| `size.max` | `6` | Largest node radius in pixels |
| `connectionDistance` | `240` | Maximum distance in pixels for ordinary connecting lines |
| `hoverDistance` | `360` | Maximum cursor-to-node distance in pixels for hover connections |
| `speed` | `0.5` | Relative movement speed |

Each node gets a size in the configured range. Set min and max to the same value
for equal-sized nodes. The current range produces nodes 6–12 pixels across.
For example, min `2` and max `4` makes smaller nodes;
desktop `70` and mobile `30` makes a sparser network. These are examples, not
automatic presets. Counts currently stay fixed for each screen class because
automatic area-based density is disabled. Longer pages spread those nodes over
more space, making the visible network sparser. Scrolling does not spawn more
nodes or restart the animation. More nodes and longer connections increase the
rendering work; keep mobile counts lower. The full-height canvas also uses more
memory on long pages than a viewport-sized canvas; retina scaling remains disabled.

`hoverDistance` controls the cursor's reach independently of connections between
nodes. For example, `500` connects the cursor to nodes farther away, while `80`
requires it to be closer. Hover connections are enabled on devices with hover
support.

Save the settings and reload the page during development. Rebuild to update a
static deployment. Colors, opacity, hover behavior, and the 30fps cap are in
`src/lib/particles.ts` if you want to adjust those too.
The lifecycle and pause control live in `src/components/ParticleBackground.astro`.
For tsParticles 4, particle colors are under `particles.paint.color`; older
`particles.color` examples do not apply. The network is decorative and uses no
real case data. No tracking or external particle service is involved.

References: [Astro MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/),
[Astro Icon](https://www.astroicon.dev/getting-started/),
[OpenGraph Canvas](https://github.com/delucis/astro-og-canvas/tree/latest/packages/astro-og-canvas),
[tsParticles](https://particles.js.org/docs/).
