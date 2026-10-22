// Indexing is an explicit publication decision, independent of draft preview.
export function mayIndexSite(enabled: boolean, preview: boolean, hasProfile: boolean, excluded = false): boolean {
  return enabled && !preview && hasProfile && !excluded;
}
