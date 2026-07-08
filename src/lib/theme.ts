import { LEGACY_THEME_KEY, type ThemeMode } from "./types";

export function getSystemTheme(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function getInitialTheme(storage: Storage | null = typeof window !== "undefined" ? window.localStorage : null) {
  const saved = storage?.getItem(LEGACY_THEME_KEY);
  return saved === "dark" || saved === "light" ? saved : getSystemTheme();
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}
