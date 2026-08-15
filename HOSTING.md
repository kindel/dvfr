# Mounting dvfr on kindel.com

Written for whoever adds this to the Hugo site. It follows the same shape as biq, which the site
already serves at `/biq/`, so nothing here should be surprising.

## What the site does today for biq

| Where | What |
| --- | --- |
| `/css/biq.css`, `/js/biq.js`, `/data/questions.json` | the repo's files, copied to the site root |
| `/css/biq-kindel.css` | a site-owned layer: `--biq-*` tokens mapped to `--kld-*`, plus site chrome |
| `/biq/`, `/biq/examples/` | Hugo pages holding the app markup and an inline `window.BIQ` config |

dvfr works the same way.

## 1. Copy the assets to the site root

```
css/dvfr.css       ->  /css/dvfr.css
js/dvfr.js         ->  /js/dvfr.js
js/dvfr-guide.js   ->  /js/dvfr-guide.js
data/dvfr.json     ->  /data/dvfr.json
```

No build step, no dependencies, no npm. `data/dvfr.json` is fetched at runtime, so it has to be
served as a real file (it is all the teaching copy; both pages render from it).

## 2. Create two pages

`/dvfr/` — the workbook — and `/dvfr/guide/` — the model explained.

The markup seam is clean: **copy `<div class="dvfr-app">…</div>` and everything inside it** out of
the repo's `index.html` (for the workbook) and `guide.html` (for the guide). That div is the whole
app, including the link between the two pages, so the seam is self-sufficient. Everything outside
it — `.dvfr-lede`, `.dvfr-back`, `.dvfr-repo` — is standalone-page chrome the site should replace
with its own hero, breadcrumb, and repo link, the way `/biq/` does.

Then, on each page, before the script:

```html
<!-- /dvfr/ -->
<link rel="stylesheet" href="/css/dvfr.css">
<link rel="stylesheet" href="/css/dvfr-kindel.css">
<script>
  window.DVFR = {
    content: "/data/dvfr.json",
    guidePage: "/dvfr/guide/",
    workbookPage: "/dvfr/"
  };
</script>
<script src="/js/dvfr.js" defer></script>
```

```html
<!-- /dvfr/guide/ -->
<link rel="stylesheet" href="/css/dvfr.css">
<link rel="stylesheet" href="/css/dvfr-kindel.css">
<script>
  window.DVFR = {
    content: "/data/dvfr.json",
    guidePage: "/dvfr/guide/",
    workbookPage: "/dvfr/"
  };
</script>
<script src="/js/dvfr-guide.js" defer></script>
```

All three URLs are resolved against the current page, so absolute values like these point exactly
where they say. Without the config the scripts look for `data/dvfr.json` next to the page, which is
right for the standalone repo and wrong for the site — so the config is required here.

## 3. Things worth knowing before you paste

- **`dvfr.css` styles `body`** (background, font stack, base color), exactly as `biq.css` does. On a
  Hugo page those rules apply to the whole document. They resolve to the site's own values through
  `--kld-*`, but if you would rather they did not apply, scope or override them in
  `dvfr-kindel.css` rather than editing `dvfr.css`.
- **The score strip is `position: sticky; top: 0`.** If the page has a fixed header, set
  `--dvfr-sticky-top` to its height in `dvfr-kindel.css` and the strip will park below it.
- **Every color is a `--dvfr-*` token that already falls back through `--kld-*`** (ink, paper, line,
  muted, rust, rust-dark, wash, sage). Re-declaring the `--dvfr-*` block in `dvfr-kindel.css` — the
  way `biq-kindel.css` re-declares `--biq-*` — is the intended way to retheme it.
- **The print stylesheet** prints the change plan alone, from whichever tab is open, and hides the
  workbook chrome. It does not know about the site's header and footer; hide those in
  `dvfr-kindel.css` under `@media print` if they show up in the output.
- **Analytics** ride the site's existing `gtag` with no setup, and no-op when it is absent. Events:
  `dvfr_score`, `dvfr_tab`, `dvfr_bucket`, `dvfr_export`.
- **Nothing is uploaded.** The workbook lives in `localStorage` under `dvfr-workbook`, and the open
  tab in `sessionStorage` under `dvfr-tab`. The page says so in a note, because people write candid
  things about named colleagues in it — please keep that note.
- **Tabs are deep-linkable** (`/dvfr/#dvfr-panel-r`) and the open tab is mirrored into the address
  bar. If the site intercepts hash changes for anything, that is the one place to check.

## 4. Check after deploying

1. `/dvfr/` renders four factor tabs plus Coalition and Export, and the score strip shows
   `D 0 x V 0 x F 0 = 0`. If the strip is missing or the tabs are empty, `content` is pointing at
   the wrong place; the page will say so at the top.
2. "Read the model first" goes to `/dvfr/guide/`, and the guide's link goes back to `/dvfr/`.
3. Score something, reload, and confirm the work comes back.
4. Print preview from the D tab: you should get the change plan, not the workbook.
5. At 390px wide, all six tabs are reachable and nothing scrolls sideways.
