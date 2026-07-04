export type RuntimeConfig = {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseProjectId?: string;
};

const clean = (value: string | null | undefined) => (value || '').trim();

export const getRuntimeConfig = (): RuntimeConfig =>
  typeof globalThis.window === 'undefined' ? {} : globalThis.window.__APP_CONFIG__ || {};

export const getRuntimeConfigValue = (key: keyof RuntimeConfig, fallback = '') =>
  clean(getRuntimeConfig()[key]) || clean(fallback);
