/**
 * Optional CRT filter — scanlines plus a soft vignette over the whole app.
 * Kept as a class on <html> so the effect is pure CSS and costs nothing when
 * it is off; the choice sticks per browser.
 */
const KEY = 'agentlings:crt';

export function crtEnabled(): boolean {
  return localStorage.getItem(KEY) === 'on';
}

export function setCrt(on: boolean): void {
  localStorage.setItem(KEY, on ? 'on' : 'off');
  document.documentElement.classList.toggle('crt', on);
}

export function initCrt(): void {
  document.documentElement.classList.toggle('crt', crtEnabled());
}
