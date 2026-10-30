const DARK_MODE_STORAGE_KEY = 'amwal-dark-mode';

/** Reads the persisted dark-mode preference. Defaults to light when unset or storage is unavailable. */
export function isDarkModeStored(): boolean {
  try {
    return localStorage.getItem(DARK_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Toggles the `.dark` class the design tokens in `globals.css` key off, and persists the choice. */
export function applyDarkMode(enabled: boolean): void {
  document.documentElement.classList.toggle('dark', enabled);
  try {
    localStorage.setItem(DARK_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Private browsing or storage disabled — dark mode still applies for this page load.
  }
}
