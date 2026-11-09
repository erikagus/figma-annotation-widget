# Pinnote

A Figma/FigJam widget for design annotations: categorized notes, a pointer line, status, threaded replies, Markdown formatting, layer links, and copy-to-Markdown export.

Website: [pinnote.erikdarmawan.com](https://pinnote.erikdarmawan.com). Built by [Erik Agus Darmawan](https://erikdarmawan.com). Pinnote is an independent project and is not affiliated with Figma.

## Develop

Quick start: run `.setup.ps1` (or `npm run setup`), then import `manifest.json` in Figma.

1. In Figma: Plugins > Development > New widget, copy the generated ID into `manifest.json`.
2. `npm install && npm run build` (or `npm run watch`).
3. Plugins > Development > Import widget from manifest, pick `manifest.json`.

`npm test` runs the unit tests, `npm run typecheck` checks types.
