import type { AudiencePerson, ChannelAsk, ClarifyQuestion } from '@agentlings/shared';
import { ChannelLogo } from './ChannelLogo';
import { RecipientPicker } from './RecipientPicker';

/** The send facts wear short labels on the card; anything else keeps its ask. */
const FACT_LABELS: Record<string, string> = { 'send-to': 'To', 'send-say': 'Say' };

/**
 * The ask itself — one component whether it floats over the agentling as a
 * bubble (D-084) or sits under the intake as the fallback card (D-079). One
 * mechanism, two dresses (D-086): the bar keeps the dense text card that
 * belongs beside the input it sits under, and the bubble wears the approved
 * mock's sheet — a title, the typed sentence quoted so the bubble stands
 * alone, logo rows with a connect button each, and the state's note as the
 * foot. Same ask, same handlers; only the frame decides the dress.
 *
 * The send facts (D-087) render on whichever dress is up — including after a
 * pick, because a chosen alternative still needs its recipient.
 */
export function ChannelAskCard({
  ask,
  picked,
  onPick,
  onUndo,
  onOpenSettings,
  variant = 'bar',
  prompt,
  questions = [],
  answers = {},
  onAnswer,
  audienceFor = () => [],
  audienceProblemFor = () => undefined,
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
  /** The send facts from the plan (D-087), answered right on the card. */
  questions?: ClarifyQuestion[];
  answers?: Record<string, string>;
  onAnswer?: (id: string, value: string) => void;
  /** That channel's opted-in people, behind its own To field (D-092, D-180). */
  audienceFor?: (channel: string | undefined) => AudiencePerson[];
  /** Why that channel's live audience source refused (D-122). */
  audienceProblemFor?: (channel: string | undefined) => string | undefined;
}) {
  const factInput = (q: ClarifyQuestion, className: string) =>
    q.id.startsWith('send-to') ? (
      <RecipientPicker
        id={`ask-${q.id}`}
        className={className}
        placeholder={q.hint ?? q.ask}
        value={answers[q.id] ?? ''}
        onChange={(value) => onAnswer?.(q.id, value)}
        people={audienceFor(q.channel)}
        problem={audienceProblemFor(q.channel)}
      />
    ) : (
      <input
        id={`ask-${q.id}`}
        className={className}
        placeholder={q.hint ?? q.ask}
        value={answers[q.id] ?? ''}
        onChange={(e) => onAnswer?.(q.id, e.target.value)}
      />
    );
  /**
   * The facts, grouped under the channel they belong to (D-180).
   *
   * A job may send on two, and two bare "To" rows one above the other say
   * nothing about which is which — the group heading, with the channel's own
   * mark, is what makes an address unambiguous before it is typed rather than
   * after it has gone. The shared message keeps no heading, because it belongs
   * to all of them.
   */
  const groups: { channel: string | undefined; questions: ClarifyQuestion[] }[] = [];
  for (const q of questions) {
    const last = groups[groups.length - 1];
    if (last && last.channel === q.channel) last.questions.push(q);
    else groups.push({ channel: q.channel, questions: [q] });
  }
  const named = groups.filter((g) => g.channel).length > 1;
  const label = (q: ClarifyQuestion) => q.label ?? FACT_LABELS[q.id] ?? q.ask;
  const facts =
    questions.length === 0 ? null : variant === 'bubble' ? (
      <>
        {groups.map((group) => (
          <div key={group.channel ?? 'shared'} className={named ? 'ask-fact-group' : undefined}>
            {named && group.channel && (
              <div className="ask-fact-head">
                <ChannelLogo channel={group.channel} />
                <span className="ask-fact-ch">
                  {ask.also?.find((o) => o.channel === group.channel)?.label ??
                    (group.channel === ask.asked ? ask.askedLabel : group.channel)}
                </span>
              </div>
            )}
            {group.questions.map((q) => (
              <div key={q.id} className="ask-fact">
                <label className="ask-fact-label" htmlFor={`ask-${q.id}`}>
                  {label(q)}
                </label>
                {factInput(q, 'ask-fact-input')}
              </div>
            ))}
          </div>
        ))}
      </>
    ) : (
      <>
        {groups.map((group) => (
          <div key={group.channel ?? 'shared'}>
            {named && group.channel && (
              <div className="work-channel-sub">
                {ask.also?.find((o) => o.channel === group.channel)?.label ??
                  (group.channel === ask.asked ? ask.askedLabel : group.channel)}
              </div>
            )}
            {group.questions.map((q) => (
              <div key={q.id} className="work-channel-opt">
                <span className="work-channel-name">{label(q)}</span>
                {factInput(q, 'work-q-text')}
              </div>
            ))}
          </div>
        ))}
      </>
    );

  if (picked) {
    return (
      <>
        <p className="work-channel-note">
          Sends via {ask.options.find((o) => o.channel === picked)?.label ?? picked} instead — every
          message waits for your review.{' '}
          <button type="button" className="work-link" onClick={onUndo}>
            undo
          </button>
        </p>
        {facts}
      </>
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
        {facts}
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
      {facts}
    </>
  );
}
