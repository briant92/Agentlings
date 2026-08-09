import { useEffect, useId, useState } from 'react';

/**
 * One ```mermaid fence, drawn.
 *
 * The library is imported on first use only — it is heavy, and most files
 * carry no diagram — and the fence's own source stays one click away below
 * the drawing, because a rendering must never replace the bytes it was drawn
 * from (D-030's rule, applied to diagrams). A fence that does not parse falls
 * back to its source with the reason, never to a blank pane.
 */
let lib: Promise<typeof import('mermaid')> | null = null;
function mermaid() {
  // securityLevel 'strict' is mermaid's own sanitiser: labels render as text,
  // so a fence in a crew-written file cannot script the review panel.
  lib ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
    return m;
  });
  return lib;
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(null);
    void mermaid()
      .then((m) => m.default.render(`mm${id}`, code))
      .then((r) => alive && setSvg(r.svg))
      .catch(
        (err: unknown) => alive && setFailed(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      alive = false;
    };
  }, [id, code]);

  if (failed !== null)
    return (
      <div className="fv-mm">
        <pre className="fv-text">{code}</pre>
        <p className="dim fv-note">The diagram did not parse — showing its source.</p>
      </div>
    );
  if (svg === null) return <p className="dim">Drawing…</p>;
  return (
    <div className="fv-mm">
      <div className="fv-mm-draw" dangerouslySetInnerHTML={{ __html: svg }} />
      <details className="fv-mm-src">
        <summary>source</summary>
        <pre className="fv-text">{code}</pre>
      </details>
    </div>
  );
}
