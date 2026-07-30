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
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  let summary = '';
  let meter;
  for await (const message of query({
    prompt: config.prompt,
    options: {
      cwd: config.cwd,
      permissionMode: 'dontAsk',
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
      settingSources: [],
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
      if (message.is_error) {
        emit({
          type: 'error',
          message:
            typeof message.result === 'string'
              ? message.result
              : `agent session failed (${message.subtype ?? 'error'})`,
        });
        process.exit(1);
      }
      summary = String(message.result ?? '');
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
    }
  }
  emit({ type: 'result', summary, meter });
  process.exit(0);
} catch (err) {
  emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
