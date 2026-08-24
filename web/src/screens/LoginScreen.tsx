import { useEffect, useRef, useState } from 'react';
import { login } from '../session';

/**
 * The gate, wearing the title screen's signboard.
 *
 * Deliberately plain: no backdrop plate, no marching horde. The art is loaded
 * from `/api/packs` (`loadLooks`), which is behind the very gate this screen
 * exists to pass — so a login screen that tried to look like the title screen
 * would be a login screen with holes in it.
 */
export function LoginScreen({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || password === '') return;
    setBusy(true);
    setError(null);
    login(password)
      .then(onIn)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'That did not work.');
        setPassword('');
        field.current?.focus();
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="login-screen">
      <form className="ts-plaque login-plaque" onSubmit={submit}>
        <div className="ts-logo">
          <div className="ts-name" data-text="AGENTLINGS">
            AGENTLINGS
          </div>
          <div className="ts-sub">THE HORDE IS RESTING</div>
        </div>
        <input
          ref={field}
          className="login-field"
          type="password"
          value={password}
          autoComplete="current-password"
          placeholder="PASSWORD"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="login-go" type="submit" disabled={busy || password === ''}>
          {busy ? 'CHECKING…' : 'ENTER'}
        </button>
        {/* Reserved whether or not there is one, so the plaque does not jump
            under the cursor at the moment a wrong password is answered. */}
        <div className="login-error">{error ?? ' '}</div>
      </form>
    </div>
  );
}
