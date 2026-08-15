# dvfr

A change-leadership workbook built on `D x V x F > R`: score dissatisfaction, vision, first steps,
and resistance; find out which factor is actually stopping the change; sort stakeholders into the
four buckets; build the coalition; commit to dated first steps; walk out with a one-page plan.

The model comes from
[How to be a Secret Agent (of Change)](https://blog.kindel.com/2021/02/03/how-to-be-a-secret-agent-of-change/).

Intended home: [https://kindel.com/dvfr/](https://kindel.com/dvfr/).

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | The workbook. Seven steps, then the plan. |
| `guide.html` | The model itself, for anyone arriving cold. |

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

The default URLs are root-relative, which assumes the site is served from `/`. A host that mounts
dvfr somewhere else can override them by setting `window.DVFR` in an inline script *before*
`js/dvfr.js` or `js/dvfr-guide.js` loads:

```html
<script>
  window.DVFR = {
    content: "/data/dvfr.json",   // teaching content
    guidePage: "/dvfr/guide/",    // resolved against the current page
    workbookPage: "/dvfr/",       // resolved against the current page
    storageKey: "dvfr-workbook"   // localStorage key for the saved workbook
  };
</script>
```

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
