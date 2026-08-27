import { defineRailway, github, project, service, volume } from 'railway/iac';

/**
 * The template a person deploys to get an install of their own (#24).
 *
 * Committed here rather than described in a dashboard, because a template
 * that lives only in Railway's UI is a template nobody can read, diff or
 * prove. `railway config plan` says what it would change; `railway config
 * apply` does it. It replaces `railway.json`, which Railway deprecated and
 * which new services cannot opt into — and which could not have expressed
 * either of the two things below that matter most: the volume and the
 * password.
 *
 * The whole product is one service. There is no database and no cache: an
 * install keeps its ledger, its levels and its jobs as files under its data
 * directory, and that is the only state there is. Which is why the volume
 * carries the entire trust story — lose it and the operator's keys, ledger
 * and schedules go with it.
 */
export default defineRailway(() => {
  /**
   * The operator's half (D-270), and nothing else.
   *
   * The mount path is `AGENTLINGS_HOME`'s value, so the secrets file lands at
   * `/data/.env` and the data directory at `/data/.agentlings` — which is what
   * makes a key pasted into Settings on Monday still work after Railway
   * rebuilds the container on Tuesday. The product half — the code, the
   * roles, the skills, the built bundle — is *not* here on purpose: a volume
   * holding the bundle would pin the install to whichever one landed on it
   * first, forever.
   */
  const data = volume('agentlings-data', { sizeMB: 5_000 });

  const agentlings = service('agentlings', {
    source: github('briant92/Agentlings'),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    volumeMounts: { '/data': data },
    env: {
      /**
       * The one variable a person deploying must fill in, and the reason this
       * install may listen on a public interface at all (D-271). Sealed
       * because it is a credential: Railway will not show it again after it
       * is set, and nothing here should be able to read it back.
       */
      AGENTLINGS_PASSWORD: {
        description:
          'The password for your install. Anyone with this and the URL is you, ' +
          'so make it long. Without it the server refuses to start rather than ' +
          'put an ungated horde on a public address.',
        isOptional: false,
        isSealed: true,
      },
      // Where the operator's half lives — the same path the volume mounts at.
      // The Dockerfile sets this too; naming it here is what tells Railway the
      // mount and the store are the same directory.
      AGENTLINGS_HOME: { value: '/data' },
      // A public address is exactly what a person deployed this to get, and
      // it is safe only because of the password above.
      AGENTLINGS_BIND: { value: '0.0.0.0' },
      // Every other key — the model, Telegram, Google, Buk — is entered
      // inside the app, where it explains itself and lands in the secrets
      // file on the volume. Nothing else belongs in this list.
    },
    // Served in front of the gate (D-272), so a healthy install is one that
    // can draw its own sign-in screen. Generous, because the first boot of a
    // fresh install writes its data directory before it answers.
    healthcheck: '/',
    healthcheckTimeout: 300,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
  });

  return project('agentlings', { resources: [agentlings, data] });
});
