# dvfr

A change-leadership workbook built on `D x V x F > R`: score dissatisfaction, vision, first steps,
and resistance; find out which factor is actually stopping the change; sort stakeholders into the
four buckets; build the coalition; commit to dated first steps; walk out with a one-page plan.

The model comes from
[How to be a Secret Agent (of Change)](https://blog.kindel.com/2021/02/03/how-to-be-a-secret-agent-of-change/).

Intended home: [https://kindel.com/kld/apps/dvfr/](https://kindel.com/kld/apps/dvfr/).

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | The workbook. Six tabs under a score that is always on screen. |
| `guide.html` | The model itself, for anyone arriving cold. |

The workbook is tabbed so the score never leaves the screen. The change's name sits above the
tabs, the score strip below it stays pinned while you scroll, and each tab holds the work that
belongs to one term of the formula:

| Tab | What is in it |
| --- | --- |
| D | Dissatisfaction: checks, score, and how to raise it |
| V | Vision: checks, score, how to raise it, and the vision drafting prompts |
| F | First steps: checks, score, how to raise it, the dated first steps, and the early wins |
| R | Resistance: checks, score, how to lower it, and the four stakeholder buckets |
| Coalition | The named leaders, counted against the bar of four |
| Export | The verdict in full, the plan, and copy / download / print / JSON |

Each tab is deep-linkable (`#dvfr-panel-r`), the open tab is kept in the address bar so a reload
returns to it, and the four bars in the score strip double as jump links.

Everything a leader types stays in `localStorage` in their own browser. There is no account, no
backend, and nothing is uploaded. That matters here: people write candid things about named
colleagues. The plan leaves the browser only when they choose to copy it, download it as Markdown
or JSON, or print it.

## Run

Needs a static file server because the content is loaded with `fetch`.

```
python3 -m http.server
```

Open http://127.0.0.1:8000/

## Host configuration

The defaults are relative and resolved against the page, so serving the repo from any path —
`/`, `/kld/apps/dvfr/`, a GitHub Pages project URL - works with no configuration as long as `css/`, `js/`
and `data/` stay next to the HTML.

Override them when the assets do *not* sit beside the page, which is the case on a Hugo site that
copies `css/`, `js/` and `data/` to the site root and renders the workbook markup in a page at
`/kld/apps/dvfr/`. Set `window.DVFR` in an inline script *before* `js/dvfr.js` or `js/dvfr-guide.js` loads:

```html
<script>
  window.DVFR = {
    content: "/data/dvfr.json",   // teaching content; default "data/dvfr.json"
    guidePage: "/kld/apps/dvfr/guide/",    // default "guide.html"
    workbookPage: "/kld/apps/dvfr/",       // default "index.html"
    storageKey: "dvfr-workbook"   // localStorage key for the saved workbook
  };
</script>
```

All three URLs are resolved against the current page, so relative values follow the mount and
absolute ones point wherever you say.

Changing `storageKey` orphans any workbook already saved under the old key, so pick one and leave
it alone.

## Content

All teaching copy lives in `data/dvfr.json` and is rendered by both pages, so the workbook and the
guide cannot drift apart. Edit the JSON, not the JavaScript, to change:

- `factors` — the four definitions, the help text, the 0 / 5 / 10 score anchors, the diagnostic
  checks, and the plays offered when that factor is the weak one.
- `buckets` — the four stakeholder buckets, their definitions, and the `priority` that drives the
  attention order (Non-Supportive, Reluctant, Supporter, Opposed).
- `verdicts` — the copy for each band.
- `coalition` — the `target` number of senior leaders and the commitment states.
- `vision_prompts`, `first_steps`, `bucket_warnings`, `guide` — the rest of the prose.

Adding or removing a factor's `checks` changes what a full checklist suggests as a score, since
the suggestion is just the fraction checked, scaled to 10.

## The scoring

D, V, and F multiply, so any one of them at zero zeroes the whole left side; the workbook treats
that as a hard stop rather than a low number. To compare that product against a single resistance
score, it takes the cube root — the geometric mean — which puts the change force back on the same
0-10 scale as R and preserves the zero property. The raw `D x V x F` product is shown next to it.

| Force minus resistance | Verdict |
| --- | --- |
| any of D, V, F is 0 | Dead stop |
| 0 or less | Stalled |
| up to 2 | Fragile |
| up to 4.5 | Moving |
| more than 4.5 | Unstoppable |

## App card

This repo ships `card.json` and `icon.png` as the listing for any host.

## License

MIT. Copyright (c) 2026 Kindel, LLC. Keep the copyright notice and permission notice in all copies.
