---
name: plan-geometry
description: Geometry from technical drawings — extract the vectors, build the dimensioned model, prove it by closure and residuals, and only then composite or render
---
# Plan geometry

A technical drawing is a set of measured claims. Work from its geometry,
never from its pixels alone — a collage of crops has no coordinate frame to
converge in, and every round of eyeballing it costs a paid run.

1. **Extract, don't squint.** A CAD-plotted PDF often has no text layer:
   pull the vector paths (pdf.js) and rasterise at high zoom only to *read*
   labels and dimension chains off the enlargement. Quote in your result
   what you extracted and how.
2. **Scale is measured, never assumed.** Derive it from the drawing's own
   claims — a stated useful area against the measured quad, a dimension
   chain against its pixels — and cross-check every sheet, quoting the
   spread. A scale that implies 157 m² for a stated 30 m² room is wrong by
   construction, whatever it was derived from.
3. **Model before composite.** Read the dimension chains and prove the
   reading by closure: the parts must sum to the stated overalls, and the
   sums belong in your result. Two chains closing exactly and one to 1 %
   is a model; none checked is a guess.
4. **Rotation comes from the reference.** When units sit along a curve or
   a site map, each gets its own rotation derived from that reference —
   never flat placement, never a shared angle assumed.
5. **Mate shared walls on the wall itself.** Two sheets each draw the same
   physical wall; aligning their *inner faces* builds the wall twice. Give
   each party wall its own frame (origin at the midpoint, t along, u
   across), resample both sheets into it, and superimpose by
   cross-correlation. The offset that lands is typically the wall's own
   thickness.
6. **Residuals, full length, in real units.** For every mated pair report
   max and rms in centimetres over the whole wall, and say where the worst
   row is. When two sheets draw the same wall differently, say so — that
   disagreement is a finding, not slack to hide.
7. **Two judges, both mandatory: the number and the eye.** Re-render the
   model independently and lay it over the source; then look. A fit with a
   beautiful rms whose render shows furniture interpenetrating is wrong —
   the metric matched the wrong feature.
8. **Read the delivered file back — from its own bytes.** Render what you
   are handing over, not the model that produced it. A claimed rebuild
   proves itself: the file's hash changed and you looked at the new
   render. A corrected file with no evidence is indistinguishable from no
   correction.
9. **Declare assumed against measured.** Heights modelled without a
   section, materials read from hatch convention — name them, and name
   the sheet that would retire each assumption.
10. **One question beats four paid rounds.** When the ask names no view,
    style or fidelity, ask once — or state the choice you made at the top
    of your result and offer the alternatives.
