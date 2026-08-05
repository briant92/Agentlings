import type { ChannelAsk } from '@agentlings/shared';

/**
 * The ask itself — one component whether it floats over the agentling as a
 * bubble (D-084) or sits under the intake as the fallback card (D-079). The
 * mechanism is identical; only the frame around it differs, which is the
 * whole point: the bubble is presentation, never a second implementation.
 */
export function ChannelAskCard({
  ask,
  picked,
  onPick,
  onUndo,
  onOpenSettings,
}: {
  ask: ChannelAsk;
  /** The alternative the user chose on the fork, when they chose one. */
  picked: string | null;
  onPick: (channel: string) => void;
  onUndo: () => void;
  onOpenSettings: () => void;
}) {
  if (picked) {
    return (
      <p className="work-channel-note">
        Sends via {ask.options.find((o) => o.channel === picked)?.label ?? picked} instead — every
        message waits for your review.{' '}
        <button type="button" className="work-link" onClick={onUndo}>
          undo
        </button>
      </p>
    );
  }
  return (
    <>
      <p className="work-channel-note">{ask.note}</p>
      {ask.options.map((option) => (
        <div key={option.channel} className="work-channel-opt">
          <span className="work-channel-name">{option.label}</span>
          <span className="dim work-channel-detail">{option.detail}</span>
          {option.state === 'ready' && option.channel !== ask.asked && (
            <button type="button" className="work-chip" onClick={() => onPick(option.channel)}>
              use {option.label}
            </button>
          )}
          {option.state === 'connectable' && (
            <button type="button" className="work-chip" onClick={onOpenSettings}>
              connect
            </button>
          )}
        </div>
      ))}
    </>
  );
}
