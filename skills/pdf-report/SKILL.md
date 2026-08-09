---
name: pdf-report
description: Author a styled report as one self-contained HTML file and print it to PDF with the render_pdf tool, verified by pdf-parse read-back
---
# PDF report

A styled PDF is printed, not drawn: you author HTML+CSS and the `render_pdf`
tool prints it through a real browser engine. The render is **offline** —
every external URL is blocked — so the document carries everything it needs.
Both files land at the **sandbox root**.

1. **One self-contained file.** All CSS in a `<style>` block; every image a
   `data:` URI; system font stacks (Segoe UI, Georgia, Consolas — never a
   webfont URL). If it needs the network, it will render broken.
2. **`@page` owns the paper.** Size and margins live in CSS —
   `@page { size: A4; margin: 18mm }` (or `A4 landscape`, `Letter`). Use
   `break-inside: avoid` on blocks that must not split, and print-safe
   colours (`printBackground` is on, but ink-heavy full bleeds read badly).
3. **Design like a report, not a webpage.** A restrained palette from the
   stated brand colour, a real title block, section headings that carry
   weight, tables with rules where rows are read across, figures captioned.
   No centred body text, no decoration that says nothing.
4. **Render, then read it back.** Call `render_pdf` with the whole html; it
   writes the PDF beside your `.html` and answers with pages and bytes.
   Then open the PDF with pdf-parse and quote in your result: the page
   count, and one line of its own extracted text. A PDF you never read back
   is not delivered.
5. **Keep the .html.** It is the PDF's source and stays beside it, so the
   reviewer can see both what printed and what it printed from.
6. **If the renderer is unavailable** (the tool answers with an error),
   deliver the `.html` alone and say exactly that in your result — an
   honest missing renderer beats a hand-assembled fake PDF.
