# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static GitHub Pages site — no build step, no framework, no package manager. Every page is a plain `.html` file served directly from the repo root. Open any `.html` file in a browser to develop locally.

## Pages

| File | Title |
|------|-------|
| `index.html` | Tom Gates — homepage / link hub |
| `mortgage-calculator.html` | Mortgage Budget Mapper — UK affordability tool |
| `clag.html` | CLAG — Clouds Low Aircraft Grounded |
| `relocation-map.html` | Station Finder — commute/relocation map |
| `house-search.html` | Gates Family House Search (StaticCrypt password-protected) |
| `calendar.html` | Calendar |

## Folder structure

Pages start as single-file HTML (inline CSS + JS). As they grow, CSS and JS are split into a companion folder named after the page:

```
foo.html
foo/
  app.css
  app.js
```

`mortgage-calculator.html` has already been split this way. When splitting a new page, follow the same pattern: create `<page-name>/app.css` and `<page-name>/app.js`, replace the inline `<style>` block with `<link rel="stylesheet" href="<page-name>/app.css">`, and replace the inline `<script>` block with `<script src="<page-name>/app.js"></script>`.

## Common patterns across pages

- **Design tokens via CSS custom properties** — colours, type scale, and spacing live in `:root` at the top of each stylesheet.
- **No external UI frameworks** — all layout and components are hand-rolled CSS.
- **Cloudflare Web Analytics** — most pages include a deferred beacon script at the bottom of `<body>`. Keep it when editing pages that already have it.
- **Google Fonts** (`Plus Jakarta Sans`, `DM Mono`) — used by the mortgage calculator; other pages use system fonts.
- **External data** — `relocation-map.html` reads `relocation-map/stations_with_train_times_arriveby.csv` via PapaParse loaded from unpkg.
- **Data persistence** — prefer browser-native storage APIs (`localStorage`, `sessionStorage`) over any server-side or third-party persistence.
