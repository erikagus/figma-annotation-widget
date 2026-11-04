# Figma Annotation Widget

A Figma/FigJam widget for design annotations: categorized notes, a pointer line, status, threaded replies, Markdown formatting, layer links, and copy-to-Markdown export.

## Develop

1. In Figma: Plugins > Development > New widget, copy the generated ID into `manifest.json`.
2. `npm install && npm run build` (or `npm run watch`).
3. Plugins > Development > Import widget from manifest, pick `manifest.json`.

`npm test` runs the unit tests, `npm run typecheck` checks types.
