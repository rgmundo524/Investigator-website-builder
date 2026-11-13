import countries from '../config/jurisdictions.json';

// Country and territory names from the installed iso-codes 4.20.1 package's
// share/iso-codes/json/iso_3166-1.json, using its
// common_name when supplied. Czech Republic and British Virgin Islands retain
// the established catalog labels. Vendored data keeps the editor independent
// of network access and the host's installed locale packages.
export type JurisdictionOption = { value: string; label: string };

const compareLabels = (left: JurisdictionOption, right: JurisdictionOption) =>
  left.label.localeCompare(right.label, 'en');

export const JURISDICTION_OPTIONS: readonly JurisdictionOption[] = countries
  .map(({ label }) => ({ value: label, label }))
  .sort(compareLabels);

/** Keep custom source and working-draft values available until explicitly changed. */
export function jurisdictionOptions(existingValues: readonly unknown[] = []): JurisdictionOption[] {
  const options = new Map(JURISDICTION_OPTIONS.map((option) => [option.value, option]));
  for (const value of existingValues) {
    if (typeof value !== 'string' || !value.trim() || options.has(value)) continue;
    options.set(value, { value, label: value });
  }
  return [...options.values()].sort(compareLabels);
}
