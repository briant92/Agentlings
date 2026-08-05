import type { ChannelAsk } from '@agentlings/shared';
import { ChannelLogo } from './ChannelLogo';

/**
 * The ask itself — one component whether it floats over the agentling as a
 * bubble (D-084) or sits under the intake as the fallback card (D-079). One
 * mechanism, two dresses (D-086): the bar keeps the dense text card that
 * belongs beside the input it sits under, and the bubble wears the approved
 * mock's sheet — a title, the typed sentence quoted so the bubble stands
 * alone, logo rows with a connect button each, and the state's note as the
 * foot. Same ask, same handlers; only the frame decides the dress.
 */
export function ChannelAskCard({
  ask,
  picked,
  onPick,
  onUndo,
  onOpenSettings,
  variant = 'bar',
  prompt,
}: {
  ask: ChannelAsk;
  /** The alternative the user chose on the fork, when they chose one. */
  picked: string | null;
  onPick: (channel: string) => void;
  onUndo: () => void;
  onOpenSettings: () => void;
  /** 'bubble' wears the mock's sheet; 'bar' stays the dense desk card. */
  variant?: 'bar' | 'bubble';
  /** The typed sentence, quoted in the bubble only — the bar sits under it. */
  prompt?: string;
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
  if (variant === 'bubble') {
    return (
      <>
        <h3 className="ask-title">This job needs a messaging app</h3>
        {prompt ? <p className="ask-you">&ldquo;{prompt}&rdquo;</p> : null}
        {ask.options.map((option) => (
          <div key={option.channel} className="ask-opt">
            <ChannelLogo channel={option.channel} />
            <div className="ask-opt-txt">
              <div className="ask-opt-nm">{option.label}</div>
              <div className="ask-opt-why">{option.detail}</div>
            </div>
            {option.state === 'ready' && option.channel !== ask.asked && (
              <button type="button" className="ask-cta" onClick={() => onPick(option.channel)}>
                Use {option.label}
              </button>
            )}
            {option.state === 'connectable' && (
              <button
                type="button"
                className={option.channel === 'whatsapp-business' ? 'ask-cta amber' : 'ask-cta'}
                onClick={onOpenSettings}
              >
                {option.channel === 'whatsapp-business' ? 'Set up' : 'Connect'}
              </button>
            )}
          </div>
        ))}
        <p className="ask-foot">{ask.note}</p>
      </>
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
