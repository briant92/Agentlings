---
name: data-analysis
description: Compute over a .csv or .xlsx in a script the sandbox keeps, cite every figure to its cell, and draw the result as a plain SVG chart
---
# Data analysis

An analysis is a set of numbers someone will act on, so every one carries its
basis and none is done in your head. Output lands at the **sandbox root** (a
file in a subfolder is invisible to review).

1. **Compute in a script, not in your head.** Read the data with the
   installed libraries (`exceljs` for .xlsx, plain parsing for .csv), do the
   arithmetic in a Node script, and **keep the script** beside the result —
   `analysis.mjs`. A number you can re-run is a number the reader can check;
   a number you reasoned to is one they cannot.
2. **Cite every figure to where it came from.** Each total names the column,
   the row range and the file it summed. State the size of what you read and
   what you excluded — blank rows, duplicates, a header counted or not.
3. **Never estimate what you can count**, and never present a guess without
   saying it is one. If the data cannot answer the question, say that plainly
   rather than filling the gap.
4. **Draw the result as a plain SVG.** There is no chart library, and that is
   fine: write the chart as hand-authored SVG — `<rect>` bars, `<line>` axes,
   `<text>` labels — sized to a sensible viewBox, at the sandbox root as a
   `.svg`. **No `<script>`, no external URLs, no fonts to fetch:** the review
   panel shows it as an image, which strips those anyway, so anything the
   chart needs must be drawn into it. A bar chart of the totals, or a line of
   a trend, beats a paragraph describing them.
5. **Read the numbers back.** After the script runs, quote its key outputs in
   RESULT.md and confirm the parts add to the total. If the chart and the
   table disagree, the file is wrong, not the check.
