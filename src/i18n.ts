import { useSyncExternalStore } from "react";
import en from "./locales/en";
import ru from "./locales/ru";
import uk from "./locales/uk";

export type MessageKey = keyof typeof en;
const catalogs = { en, ru, uk } satisfies Record<string, Record<MessageKey, string>>;

function resolveLanguage(locale?: string): keyof typeof catalogs {
  const language = locale?.trim().toLowerCase().split(/[-_]/)[0];
  if (language === "ru" || language === "russian") return "ru";
  if (language === "uk" || language === "ukrainian") return "uk";
  return "en";
}

let language = resolveLanguage(globalThis.navigator?.language);
const listeners = new Set<() => void>();
const getLanguage = () => language;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}

export async function initializeLanguage() {
  let locale: string | undefined;
  try {
    locale = await window.SteamClient.Settings.GetCurrentLanguage();
  } catch {
    // The browser locale is available when Steam's settings API is unavailable.
  }
  const next = resolveLanguage(locale?.trim() || globalThis.navigator?.language);
  if (language === next) return;
  language = next;
  listeners.forEach(listener => listener());
}

export function t(key: MessageKey, values: Record<string, string | number> = {}) {
  const text = catalogs[language][key];
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function translateError(error: string) {
  if (language === "en") return error;
  // Decky can include the Python exception type in its RPC errors.
  const message = error.replace(/^ValueError:\s*/, "");
  if (Object.prototype.hasOwnProperty.call(en, message)) return t(message as MessageKey);
  const requestFailure = /^Xbox request failed \(([a-z0-9-]+)\)\. Check your Nexus sign-in or refresh before retrying\.$/.exec(message);
  return requestFailure
    ? t("Xbox request failed ({stage}). Check your Nexus sign-in or refresh before retrying.", { stage: requestFailure[1] })
    : error;
}
