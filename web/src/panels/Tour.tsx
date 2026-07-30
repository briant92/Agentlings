import { useEffect, useLayoutEffect, useState } from 'react';

const KEY = 'agentlings:tour';

export function tourSeen(): boolean {
  return localStorage.getItem(KEY) === 'done';
}

export function markTourSeen(): void {
  localStorage.setItem(KEY, 'done');
}

export function resetTour(): void {
  localStorage.removeItem(KEY);
}

interface Step {
  /** The real control this step is about; skipped if it isn't on screen. */
  anchor: string;
  title: string;
  body: string;
}

/**
 * Three things a first-time user needs: how to get someone, how to ask for
 * work, and where the results wait. Everything else is discoverable.
 */
const STEPS: Step[] = [
  {
    anchor: '[data-tour="hire"]',
    title: 'Hire who you need',
    body: 'Say what their job is in plain words. The right job and abilities get picked for you — and if nobody can do it, you get shown who can.',
  },
  {
    anchor: '[data-tour="work"]',
    title: 'Ask for what you need',
    body: 'Describe it the way you would to a person. Someone here picks it up. You are asked for your project folder once, then never again.',
  },
  {
    anchor: '[data-tour="terminal"]',
    title: 'Nothing happens without you',
    body: 'Work shows up here as it goes. Finished work waits for your approval — your project is never touched until you say so.',
  },
];

const CARD_WIDTH = 300;
const GAP = 12;

/** Coach marks over the real controls, so the tour teaches where things are. */
export function Tour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = () => {
    markTourSeen();
    onDone();
  };

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(STEPS[step].anchor);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (step === STEPS.length - 1) finish();
        else setStep((s) => s + 1);
      } else if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const last = step === STEPS.length - 1;
  const { title, body } = STEPS[step];

  // Below the highlight when there is room, above it when there isn't.
  const below = !rect || rect.bottom + 190 < window.innerHeight;
  const card: React.CSSProperties = rect
    ? {
        left: Math.min(Math.max(GAP, rect.left), window.innerWidth - CARD_WIDTH - GAP),
        ...(below
          ? { top: rect.bottom + GAP }
          : { top: rect.top - GAP, transform: 'translateY(-100%)' }),
      }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tour">
      {rect ? (
        <div
          className="tour-spot"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={card}>
        <p className="tour-title">{title}</p>
        <p className="tour-body">{body}</p>
        <div className="tour-foot">
          <span className="tour-dots">
            {STEPS.map((s, i) => (
              <span key={s.anchor} className={`tour-dot${i === step ? ' on' : ''}`} />
            ))}
          </span>
          {!last && (
            <button className="ghost" onClick={finish}>
              Skip
            </button>
          )}
          <button onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
