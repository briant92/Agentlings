---
name: document-design
description: Produce a formal .docx with the docx library — named styles, heading hierarchy, page furniture — verified by reading it back
---
# Document design

A formal Word file is structure the reader's own tools can use — styles,
not decorated runs. Output lands at the **sandbox root** (a subfolder file
is invisible to review).

1. **Styles, never inline formatting.** Define heading and body styles once
   on the `Document` and reference them; a bolded large run is not a
   heading — it breaks navigation, numbering and the reader's theme.
2. **Hierarchy holds.** Heading 1 → 2 → 3 with no skips; the title is the
   title, not a Heading 1. A document over ~3 pages gets a table of
   contents built from those headings.
3. **Page furniture.** Header with the document's name, footer with the
   page number, real margins. A formal document that starts at the page
   edge reads as a draft.
4. **Tables carry data.** Real column widths (never all-equal by default),
   a header row that repeats, alignment by content — numbers right, words
   left. No tables as layout scaffolding.
5. **Read it back.** After `Packer.toBuffer`, extract with mammoth and
   quote in your result: word count, the heading outline as extracted, and
   bytes. If what mammoth returns disagrees with what you meant to write,
   the file is wrong, not the check.
