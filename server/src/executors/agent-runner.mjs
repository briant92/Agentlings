// Runs one Claude Agent SDK session outside the server process, so the
// SDK's heavy import and the session itself can never wedge the server.
// Plain JS on purpose: spawned with plain `node`, never through tsx.
// Usage: node agent-runner.mjs <config.json>
// Emits JSONL on stdout: {type: 'progress'|'result'|'error', ...}
import { readFileSync } from 'node:fs';

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

  // The 'github' connection is ours too, and builtin for the same reason as
  // 'web': the server owns the call, so it owns how much comes back. The tool
  // shapes arrive as config rather than being written out here, because this
  // file is plain JS spawned with plain node and must not import anything of
  // ours — so it builds the schemas generically from what it was handed.
  if (config.github?.tools?.length) {
    const { z } = await import('zod');
    mcpServers.github = createSdkMcpServer({
      name: 'github',
      version: '1.0.0',
      tools: config.github.tools.map((spec) =>
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
              const res = await fetch(config.github.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ tool: spec.name, args }),
              });
              const reply = await res.json();
              text = reply.error ? `Could not do that: ${reply.error}` : reply.text;
            } catch (err) {
              text = `Could not reach the code host: ${err instanceof Error ? err.message : String(err)}`;
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
      const blocks = message.blocks ?? message.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name) {
          emit({ type: 'progress', name: block.name, input: block.input });
        }
      }
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
        emit({
          type: 'error',
          message:
            typeof message.result === 'string'
              ? message.result
              : `agent session failed (${message.subtype ?? 'error'})`,
          meter,
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
