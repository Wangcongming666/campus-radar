# Third-party notices

The source components in `apps/web/components/ui/` follow and adapt the shadcn/ui
component patterns, composed with Radix UI primitives. The shadcn license is
included beside those components in `SHADCN-LICENSE`.

- shadcn/ui: https://github.com/shadcn-ui/ui
- Radix UI: https://github.com/radix-ui/primitives
- Lucide icons: https://github.com/lucide-icons/lucide
- Space Grotesk: https://github.com/floriankarsten/space-grotesk
- JetBrains Mono: https://github.com/JetBrains/JetBrainsMono

Dependency distributions retain their own license files. Company names and
initial-letter demo marks identify fictional sample records; this project does
not claim endorsement or use third-party recruiting content as real data.

PDF.js (`pdfjs-dist` 6.4.299) is used for local text extraction and Canvas preview.
The matching worker, CMaps, standard fonts and WASM assets are served locally in
`apps/web/public/`. Apache-2.0 license: `apps/web/public/pdfjs-LICENSE` and
`apps/web/public/pdfjs/LICENSE`. Upstream: https://github.com/mozilla/pdf.js .
