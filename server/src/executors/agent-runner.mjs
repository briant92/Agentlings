// Runs one Claude Agent SDK session outside the server process, so the
// SDK's heavy import and the session itself can never wedge the server.
// Plain JS on purpose: spawned with plain `node`, never through tsx.
// Usage: node agent-runner.mjs <config.json>
// Emits JSONL on stdout: {type: 'progress'|'observation'|'said'|'compact'|'result'|'error', ...}
import { readFileSync, writeFileSync } from 'node:fs';

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

try {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { query, createSdkMcpServer, tool } = await import('@anthropic-ai/claude-agent-sdk');

  const mcpServers = { ...(config.mcpServers ?? {}) };
  const allowedTools = [...(config.allowedTools ?? [])];

  // The 'web' connection is ours and runs in-process: it returns readable
  // text trimmed to a budget, never a whole page. Lever 5 — a tool that
  // hands back a raw dump is a tool the model pays to wade through.
  if (config.web) {
    const { z } = await import('zod');
    mcpServers.web = createSdkMcpServer({
      name: 'web',
      version: '1.0.0',
      tools: [
        tool(
          'fetch_page',
          'Fetch a web page and return its readable text, trimmed. No JavaScript or sign-ins.',
          { url: z.string().describe('Full http(s) address to read') },
          async ({ url }) => {
            // The server owns the extraction, the trimming and the allowlist;
            // this asks it rather than keeping a second copy of that logic.
            let text;
            try {
              const res = await fetch(config.web.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url }),
              });
              const page = await res.json();
              text = page.error ? `Could not read ${url}: ${page.error}` : page.text;
            } catch (err) {
              text = `Could not read ${url}: ${err instanceof Error ? err.message : String(err)}`;
            }
            return { content: [{ type: 'text', text }] };
          },
        ),
      ],
    });
  }

  // The 'render' connection is web-shaped rather than a loop entry below: its
  // reply is bytes to write, not text to read, so the handler lands the PDF at
  // the sandbox root itself and hands the model the receipt — base64 never
  // rides a prompt.
  if (config.render) {
    const { z } = await import('zod');
    mcpServers.render = createSdkMcpServer({
      name: 'render',
      version: '1.0.0',
      tools: [
        tool(
          'render_pdf',
          'Render a complete, self-contained HTML document (inline CSS, data: images, @page rules for size and margins) to a styled PDF at the sandbox root. External URLs are blocked during the render.',
          {
            html: z.string().describe('the whole HTML document'),
            file: z.string().optional().describe('output filename (default report.pdf)'),
          },
          async ({ html, file }) => {
            let text;
            try {
              const res = await fetch(config.render.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ tool: 'render_pdf', args: { html } }),
              });
              const reply = await res.json();
              if (reply.error) {
                text = `Could not render: ${reply.error}`;
              } else {
                let name =
                  typeof file === 'string' && file.trim()
                    ? file.trim().replace(/^.*[\\/]/, '')
                    : 'report.pdf';
                if (!/\.pdf$/i.test(name)) name += '.pdf';
                writeFileSync(`${config.cwd}/${name}`, Buffer.from(reply.pdf, 'base64'));
                text = `Wrote ${name} — ${reply.pages ?? '?'} page(s), ${reply.bytes} bytes. Read it back with pdf-parse before calling it done.`;
              }
            } catch (err) {
              text = `Could not render: ${err instanceof Error ? err.message : String(err)}`;
            }
            return { content: [{ type: 'text', text }] };
          },
        ),
        tool(
          'render_plate',
          'Render a complete, self-contained HTML page into a level-backdrop raster (PNG at the sandbox root). Modes: plate 2000×900 opaque (the default), plate-overscan 2120×900 (the app drifts it), cutout / cutout-overscan (keep the page transparency; alpha snapped hard unless finish is smooth), tile (tileWidth×tileHeight, for plateloop). finish: quantized cuts to the 128-colour budget (default); smooth keeps colours and soft alpha exactly as rendered — for smooth-finish packs and depth maps. Import three.js from http://three.local/three.module.js — the only URL that resolves during the render; everything else is blocked. Set document.title = "ready" once your scene has drawn.',
          {
            html: z.string().describe('the whole HTML page'),
            file: z.string().optional().describe('output filename (default plate.png)'),
            mode: z
              .enum(['plate', 'plate-overscan', 'cutout', 'cutout-overscan', 'tile'])
              .optional()
              .describe('what kind of raster this is (default plate)'),
            finish: z
              .enum(['quantized', 'smooth'])
              .optional()
              .describe('quantized (default) or smooth: keep as rendered'),
            tileWidth: z.number().int().optional().describe('tile mode only: 8–512'),
            tileHeight: z.number().int().optional().describe('tile mode only: 8–512'),
          },
          async ({ html, file, mode, finish, tileWidth, tileHeight }) => {
            let text;
            try {
              const res = await fetch(config.render.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                // Undefined fields drop out of the JSON; the door's own
                // refuse-by-name validation stays the authority (D-147).
                body: JSON.stringify({
                  tool: 'render_plate',
                  args: { html, mode, finish, tileWidth, tileHeight },
                }),
              });
              const reply = await res.json();
              if (reply.error) {
                text = `Could not render: ${reply.error}`;
              } else {
                let name =
                  typeof file === 'string' && file.trim()
                    ? file.trim().replace(/^.*[\\/]/, '')
                    : 'plate.png';
                if (!/\.png$/i.test(name)) name += '.png';
                writeFileSync(`${config.cwd}/${name}`, Buffer.from(reply.png, 'base64'));
                // Cut-out and tile replies carry coverage, not separation —
                // what a cut-out does to legibility belongs to the composite.
                const measure =
                  reply.opaquePct !== undefined
                    ? `${reply.opaquePct}% of the frame opaque` +
                      (reply.partialSnapped ? `, ${reply.partialSnapped} soft px snapped` : '')
                    : `worst crew separation ${reply.worstSeparation} at x ${reply.worstAt} ` +
                      `(assuming groundY 388 of viewH 450)`;
                text =
                  `Wrote ${name} — ${reply.width}×${reply.height}, ${reply.colours} colours, ` +
                  `${measure}. Read the PNG to look at it before calling it done.`;
              }
            } catch (err) {
              text = `Could not render: ${err instanceof Error ? err.message : String(err)}`;
            }
            return { content: [{ type: 'text', text }] };
          },
        ),
      ],
    });
  }

  // The 'github' connection is ours too, and builtin for the same reason as
  // 'web': the server owns the call, so it owns how much comes back. The tool
  // shapes arrive as config rather than being written out here, because this
  // file is plain JS spawned with plain node and must not import anything of
  // ours — so it builds the schemas generically from what it was handed.
  //
  // One loop rather than a block each: 'search' arrived as a third of these and
  // a third copy of the same twenty lines is how two of them quietly stop
  // agreeing about error handling.
  for (const [name, subject] of [
    ['github', 'the code host'],
    ['search', 'the search service'],
    ['bls', 'the statistics service'],
    ['calendar', 'the calendar'],
    ['mail', 'the mailbox'],
  ]) {
    const builtin = config[name];
    if (!builtin?.tools?.length) continue;
    const { z } = await import('zod');
    mcpServers[name] = createSdkMcpServer({
      name,
      version: '1.0.0',
      tools: builtin.tools.map((spec) =>
        tool(
          spec.name,
          spec.description,
          Object.fromEntries(
            spec.params.map((p) => {
              const base = p.type === 'number' ? z.number() : z.string();
              const described = base.describe(p.describe);
              return [p.name, p.required ? described : described.optional()];
            }),
          ),
          async (args) => {
            let text;
            try {
              const res = await fetch(builtin.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ tool: spec.name, args }),
              });
              const reply = await res.json();
              text = reply.error ? `Could not do that: ${reply.error}` : reply.text;
            } catch (err) {
              text = `Could not reach ${subject}: ${err instanceof Error ? err.message : String(err)}`;
            }
            return { content: [{ type: 'text', text }] };
          },
        ),
      ),
    });
  }

  // Every granted connection's tools, named by the catalog. Was a single
  // hardcoded 'mcp__web__fetch_page', which meant an stdio connection could be
  // configured and then have all of its tools refused by the allowlist.
  for (const name of config.mcpTools ?? []) {
    if (!allowedTools.includes(name)) allowedTools.push(name);
  }

  let summary = '';
  let meter;
  // One per assistant message, so the trail can say which turn a call was
  // made on — the SDK's own count arrives only on the result message (D-211).
  let turn = 0;

  for await (const message of query({
    prompt: config.prompt,
    options: {
      cwd: config.cwd,
      permissionMode: 'dontAsk',
      allowedTools,
      maxTurns: config.maxTurns,
      settingSources: [],
      ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
      ...(config.skills?.length ? { skills: config.skills } : {}),
      ...(config.model ? { model: config.model } : {}),
      systemPrompt: { type: 'preset', preset: 'claude_code', append: config.append },
    },
  })) {
    if (message.type === 'assistant') {
      turn++;
      const blocks = message.blocks ?? message.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name) {
          emit({ type: 'progress', name: block.name, input: block.input, id: block.id, turn });
        } else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          // What it said between calls — the plan in flight, for the trail.
          emit({ type: 'said', turn, head: block.text.trim().slice(0, 200) });
        }
      }
    } else if (message.type === 'user') {
      // Tool results come back as user messages. A clipped head of each goes
      // to the trail, and nothing in here may throw: a diagnostic that can
      // fail the job it describes is worse than none (D-211).
      try {
        const content = message.message?.content;
        for (const block of Array.isArray(content) ? content : []) {
          if (block?.type !== 'tool_result') continue;
          const inner = block.content;
          const text =
            typeof inner === 'string'
              ? inner
              : Array.isArray(inner)
                ? inner.map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ')
                : '';
          emit({
            type: 'observation',
            id: block.tool_use_id,
            turn,
            ok: block.is_error !== true,
            head: text.slice(0, 200),
          });
        }
      } catch {
        // The trail is diagnostics only.
      }
    } else if (message.type === 'system' && message.subtype === 'compact_boundary') {
      // D-212's instrument: the SDK compacted the context mid-run. Say so
      // with the turn it fell on and what the SDK reports about it, so the
      // trail can show whether the turn cap's own counter moved with it —
      // the one candidate mechanism for a leash that does not bind. Read
      // defensively: a diagnostic must never fail the job it describes.
      const meta = message.compact_metadata ?? {};
      emit({
        type: 'compact',
        turn,
        trigger: typeof meta.trigger === 'string' ? meta.trigger : undefined,
        preTokens: typeof meta.pre_tokens === 'number' ? meta.pre_tokens : undefined,
        postTokens: typeof meta.post_tokens === 'number' ? meta.post_tokens : undefined,
      });
    } else if (message.type === 'result') {
      // The SDK hands back what the session cost. Read defensively — this is
      // metering, and a shape change must never fail a job that succeeded.
      meter = {
        costUsd: typeof message.total_cost_usd === 'number' ? message.total_cost_usd : undefined,
        turns: typeof message.num_turns === 'number' ? message.num_turns : undefined,
        durationMs: typeof message.duration_ms === 'number' ? message.duration_ms : undefined,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        cacheReadTokens: message.usage?.cache_read_input_tokens,
      };
      if (message.is_error) {
        // A session that ran out of turns still spent money and may still have
        // done the work. Send the meter with the error so neither is lost.
        //
        // And say *why* it stopped as a field rather than only inside a
        // sentence. Reading it back out of the message would be one side
        // saying one word and the other watching for another — the check that
        // silently never fires, which is why CANCELLED is a shared constant.
        // The obvious alternative, `turns > turnsAllowed`, is not a cut-off
        // marker: it fires on 43 of 88 paid runs and seven of those finished
        // (D-022, D-052).
        emit({
          type: 'error',
          message:
            typeof message.result === 'string'
              ? message.result
              : `agent session failed (${message.subtype ?? 'error'})`,
          meter:
            message.subtype === 'error_max_turns' ? { ...meter, outOfTurns: true } : meter,
        });
        process.exit(1);
      }
      summary = String(message.result ?? '');
    }
  }
  emit({ type: 'result', summary, meter });
  process.exit(0);
} catch (err) {
  emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
