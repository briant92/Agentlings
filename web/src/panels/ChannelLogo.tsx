/**
 * A channel's mark for the ask-bubble's option rows, drawn inline exactly as
 * the approved mock drew it — approximated shapes, not brand assets, so
 * nothing is fetched and no vendor file lands in the bundle. A channel
 * without a drawing gets its initial on a tile, which is the mock's own
 * treatment for the planned tier.
 */

const TILE: Record<string, { letter: string; fill: string }> = {
  sms: { letter: 'S', fill: '#c8102e' },
  discord: { letter: 'D', fill: '#5865f2' },
  github: { letter: 'GH', fill: '#24292f' },
};

/** Plain names for the channels a job can carry, for client-side copy. */
export const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  gmail: 'Gmail',
  'whatsapp-business': 'WhatsApp Business',
};

export function ChannelLogo({ channel }: { channel: string }) {
  if (channel === 'google') {
    return (
      <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="#fff" />
        <text x="17" y="23" textAnchor="middle" fontSize="17" fontWeight="700" fill="#4285f4">
          G
        </text>
      </svg>
    );
  }
  if (channel === 'telegram') {
    return (
      <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="16" fill="#2aabee" />
        <path
          d="M7.5 16.6l17.2-6.4c.8-.3 1.5.2 1.2 1.4l-2.9 13.2c-.2.9-.8 1.1-1.6.7l-4.5-3.2-2.2 2.1c-.2.2-.4.4-.8.4l.3-4.4 8.2-7.2c.4-.3-.1-.5-.6-.2l-10.1 6.2-4.4-1.3c-.9-.3-.9-.9.2-1.3z"
          fill="#fff"
        />
      </svg>
    );
  }
  if (channel === 'whatsapp' || channel === 'whatsapp-business') {
    return (
      <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="16" fill="#25d366" />
        <path
          d="M17 8.5c-4.7 0-8.5 3.6-8.5 8.1 0 1.6.5 3 1.3 4.3L8.5 25l4.3-1.2c1.2.7 2.7 1 4.2 1 4.7 0 8.5-3.6 8.5-8.1S21.7 8.5 17 8.5z"
          fill="#fff"
        />
        <path
          d="M14 13.2c.7-.2 1 .1 1.3.8l.5 1.2c.1.4 0 .7-.3 1l-.5.5c.6 1.1 1.5 2 2.7 2.6l.6-.6c.3-.3.6-.4 1-.2l1.2.5c.7.3.9.7.6 1.4-.4 1-1.7 1.4-2.7 1.1-2.4-.6-4.5-2.6-5.2-5-.3-1 .1-2.1 .8-3.3z"
          fill="#25d366"
        />
      </svg>
    );
  }
  if (channel === 'gmail') {
    return (
      <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
        <rect x="3" y="7" width="28" height="20" rx="3" fill="#fff" stroke="#dadce0" />
        <path d="M5 10l12 9L29 10" fill="none" stroke="#ea4335" strokeWidth="3" strokeLinecap="round" />
        <rect x="3" y="8" width="3" height="18" fill="#4285f4" />
        <rect x="28" y="8" width="3" height="18" fill="#34a853" />
      </svg>
    );
  }
  if (channel === 'slack') {
    return (
      <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
        <rect x="15" y="5" width="5" height="11" rx="2.5" fill="#36c5f0" />
        <rect x="15" y="18" width="5" height="11" rx="2.5" fill="#2eb67d" />
        <rect x="5" y="15" width="11" height="5" rx="2.5" fill="#e01e5a" />
        <rect x="18" y="15" width="11" height="5" rx="2.5" fill="#ecb22e" />
      </svg>
    );
  }
  const tile = TILE[channel] ?? { letter: (channel[0] ?? '?').toUpperCase(), fill: '#30346d' };
  return (
    <svg className="ask-logo" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="4" y="4" width="26" height="26" rx="6" fill={tile.fill} />
      <text
        x="17"
        y="22"
        textAnchor="middle"
        fontSize={tile.letter.length > 1 ? 11 : 14}
        fontWeight="700"
        fill="#fff"
      >
        {tile.letter}
      </text>
    </svg>
  );
}
