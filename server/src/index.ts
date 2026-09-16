/**
 * The production entry, and the one place `boot()` is called (D-288).
 *
 * `app.ts` is the application: importing it builds every route for the
 * install named by `AGENTLINGS_HOME` and writes nothing, listens on nothing
 * and starts no timer. Everything that touches the install, the network or
 * the clock — the secrets file, the listen policy, the migration, the levels,
 * the ledger's interrupted rows, the port, the socket, the four sweeps — is
 * `boot()`'s, in the order it has always happened. The launcher
 * (`server/scripts/dev-logged.mjs`) runs this file exactly as it did before
 * the split; a test imports `app` and never this.
 */
import { boot } from './app';

boot();
