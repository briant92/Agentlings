import { useEffect, useState } from 'react';
import type { DeliveryFile, FilePreview } from '@agentlings/shared';
import { api, lvl } from '../api';
import { fidelity, fileUrl, glyph, orderFiles, PAPERWORK, size } from './files';

/**
 * A job's files, one rail and one pane.
 *
 * The panel used to print whatever survived being read as UTF-8 and offer
 * everything else as a download link — so a spreadsheet the crew wrote was a
 * name and a size, and the only way to see whether it was the right
 * spreadsheet was to save it and open Excel. The conversions happen on the
 * server, where the document libraries already live; this renders what comes
 * back and says which kind of thing it is looking at.
 *
 * What it must never do is let a conversion read as the file. `exact` and
 * `converted` are on screen for every preview, because the log records a
 * banked sentence standing in for a PDF that was never written (D-030).
 */

function Grid({ preview }: { preview: Extract<FilePreview, { kind: 'grid' }> }) {
  const [sheet, setSheet] = useState(0);
  const shown = preview.sheets[Math.min(sheet, preview.sheets.length - 1)];
  if (!shown) return <p className="dim">The spreadsheet has no sheets in it.</p>;
  const cut = shown.totalRows - shown.rows.length;
  const hiddenCols = shown.totalCols - (shown.rows[0]?.length ?? 0);
  return (
    <>
      {preview.sheets.length > 1 && (
        <div className="fv-tabs">
          {preview.sheets.map((s, i) => (
            <button key={s.name} className={i === sheet ? 'on' : ''} onClick={() => setSheet(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="fv-scroll">
        <table className="fv-grid">
          <tbody>
            {shown.rows.map((row, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(cut > 0 || hiddenCols > 0) && (
        <p className="dim fv-note">
          {cut > 0 && `${shown.rows.length} of ${shown.totalRows} rows`}
          {cut > 0 && hiddenCols > 0 && ' · '}
          {hiddenCols > 0 && `${hiddenCols} more columns`} — save the file for the rest
        </p>
      )}
    </>
  );
}

function Pane({ preview, name }: { preview: FilePreview; name: string }) {
  switch (preview.kind) {
    case 'native':
      // The browser draws these better than any description of them, and the
      // bytes route already serves them inline.
      return preview.contentType === 'application/pdf' ? (
        <iframe className="fv-pdf" src={name} title={name} />
      ) : (
        <img className="fv-img" src={name} alt={name} />
      );
    case 'html':
      // Server-sanitised to a fixed tag list with no attributes but a web
      // link; the document's own words are escaped by the converter.
      return (
        <>
          <div className="fv-doc" dangerouslySetInnerHTML={{ __html: preview.html }} />
          {preview.truncated && <p className="dim fv-note">Cut short — save the file for all of it.</p>}
        </>
      );
    case 'grid':
      return <Grid preview={preview} />;
    case 'slides':
      return (
        <>
          <div className="fv-slides">
            {preview.slides.map((slide) => (
              <div key={slide.n} className="fv-slide">
                <span className="dim">{slide.n}</span>
                {slide.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ))}
          </div>
          {preview.slides.length < preview.total && (
            <p className="dim fv-note">
              {preview.slides.length} of {preview.total} slides
            </p>
          )}
        </>
      );
    case 'text':
      return (
        <>
          <pre className="fv-text">{preview.content}</pre>
          {preview.truncated && <p className="dim fv-note">Cut short — save the file for all of it.</p>}
        </>
      );
    case 'none':
      return <p className="dim fv-none">No preview: {preview.reason}.</p>;
  }
}

export function FileViewer({
  levelId,
  jobId,
  files,
  /** Which file to open on, when something already knows — an inbox chip. */
  initial,
}: {
  levelId: string;
  jobId: string;
  files: DeliveryFile[];
  initial?: string;
}) {
  const ordered = orderFiles(files);
  const [chosen, setChosen] = useState(
    () => ordered.find((f) => f.name === initial)?.name ?? ordered[0]?.name ?? null,
  );
  const [preview, setPreview] = useState<FilePreview | null>(null);

  useEffect(() => {
    if (chosen === null) return;
    let alive = true;
    setPreview(null);
    void api<FilePreview>(lvl(levelId, `/jobs/${jobId}/output/${encodeURIComponent(chosen)}/preview`))
      .then((data) => alive && setPreview(data))
      .catch(
        (err: unknown) =>
          alive &&
          setPreview({ kind: 'none', reason: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      alive = false;
    };
  }, [levelId, jobId, chosen]);

  if (ordered.length === 0) return <p className="dim">Nothing was left in the sandbox.</p>;

  const mark = preview && fidelity(preview);
  return (
    <div className="fv">
      <div className="fv-rail">
        {ordered.map((file) => (
          <button
            key={file.name}
            className={`fv-row${file.name === chosen ? ' on' : ''}${
              PAPERWORK.has(file.name) ? ' paper' : ''
            }`}
            onClick={() => setChosen(file.name)}
          >
            <span className="fv-glyph">{glyph(file.name)}</span>
            <span className="fv-meta">
              {file.name}
              <i>{size(file.bytes)}</i>
            </span>
          </button>
        ))}
      </div>
      <div className="fv-pane">
        <div className="fv-bar">
          <span className="fv-open">{chosen}</span>
          {mark && <span className={`fv-fid${mark.exact ? ' exact' : ''}`}>{mark.label}</span>}
          {chosen !== null && (
            <a className="fv-save" href={fileUrl(levelId, jobId, chosen)} download={chosen}>
              save
            </a>
          )}
        </div>
        <div className="fv-body">
          {preview === null && <p className="dim">Reading…</p>}
          {preview && chosen !== null && (
            <Pane
              preview={preview}
              name={preview.kind === 'native' ? fileUrl(levelId, jobId, chosen) : chosen}
            />
          )}
        </div>
      </div>
    </div>
  );
}
