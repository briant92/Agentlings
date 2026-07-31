/**
 * The master palette now lives in the shared package — it is a product
 * decision rather than a rendering one, and the server draws crew tints from
 * the same ramp. Re-exported here so the world code reads naturally.
 */
export { css, DB, nearestDb, snapToPalette, type DbColor } from '@agentlings/shared';
