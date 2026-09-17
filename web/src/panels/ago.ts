/**
 * How long ago, for a panel's status line — coarse on purpose: nobody reads
 * "checked 37 minutes ago" for a library refresh. One function, because
 * `RolesModal` and `KnowledgeModal` each carried the same nine lines (D-288).
 */
export function ago(at?: number): string {
  if (!at) return 'never';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
