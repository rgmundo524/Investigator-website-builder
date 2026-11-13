import type { SiteSettings } from '../../scripts/site-data';

// Resolve filesystem paths once in astro.config, before Astro bundles its
// prerender modules into a different directory. Only public settings are inlined.
declare const __SITE_SETTINGS__: SiteSettings;
export const siteSettings = __SITE_SETTINGS__;
