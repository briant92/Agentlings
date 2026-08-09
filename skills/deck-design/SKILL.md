---
name: deck-design
description: Build a branded .pptx with pptxgenjs — real palette, varied slide shapes, native charts — and read it back before calling it done
---
# Deck design

A deck is judged by eye, and you cannot see it — so the discipline is a
palette held everywhere, variety a viewer can feel, and a read-back that
proves what you can prove. Output lands at the **sandbox root** (a file in a
subfolder is invisible to review).

1. **Palette first.** One accent (the stated brand colour if given), one
   dark, one light, one neutral — as variables at the top of your script,
   used everywhere, invented nowhere else. pptxgenjs wants hex **without**
   `#` (`0B5FFF`, not `#0B5FFF`) — the classic silent failure.
2. **A master, then slides.** `defineSlideMaster` carries the background,
   the accent and the page number; every slide starts from it. Title-only
   is a layout; so is a full-bleed statement; so is two-column. **No two
   consecutive slides with the same shape**, and never more than five
   bullets — past that it is a document, not a slide.
3. **The ban list.** No decorative stripe under titles, no beige defaults,
   no centred body text, no word-art gradients, no bullet walls. White
   space is a feature.
4. **Numbers are charts.** Use native `addChart` (bar, line, pie, doughnut,
   scatter are supported) with the palette's colours — never a picture of a
   chart, never a table doing a chart's job. `{ margin: 0 }` where text
   must align with a shape edge.
5. **Read it back.** After `writeFile`, reopen the deck (unzip or a fresh
   read) and quote in your result: slide count, total bytes, and the title
   of each slide. What you cannot see, say plainly: layout and colour are
   unverified by eye here — reviewers get text-only slide previews, so name
   the choices you made instead ("accent 0B5FFF on slides 1, 3, 6").
6. **Keep it under review's ceiling.** Embedded images count; a deck past
   ~8 MB loses its preview entirely. Lean images, no video.
