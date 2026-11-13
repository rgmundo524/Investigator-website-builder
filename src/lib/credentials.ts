type Credential = { id: string; data: { issuer: string; name: string; issued_year: number } };

export const credentialIssuerKey = (issuer: string) => issuer.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

export function groupCredentials<T extends Credential>(entries: T[], issuerOrder: string[] = [], preserveEntryOrder = false) {
  const priority = new Map(issuerOrder.map((issuer, index) => [credentialIssuerKey(issuer), index]));
  const groups = new Map<string, { issuer: string; entries: T[] }>();
  for (const entry of entries) {
    const issuer = entry.data.issuer.trim().replace(/\s+/g, ' ');
    const key = credentialIssuerKey(issuer);
    const group = groups.get(key) ?? { issuer, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.issuer.localeCompare(b.issuer, 'en'))
    .map((group, index) => ({ ...group,
      id: `credential-issuer-${group.issuer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'}-${index + 1}`,
      entries: preserveEntryOrder ? [...group.entries] : [...group.entries].sort((a, b) => b.data.issued_year - a.data.issued_year
        || a.data.name.localeCompare(b.data.name, 'en') || a.id.localeCompare(b.id)),
    }))
    // Assign existing anchors before applying display order, so rearranging the
    // Markdown list does not change the links for these issuer groups.
    .sort((a, b) => (priority.get(credentialIssuerKey(a.issuer)) ?? issuerOrder.length)
      - (priority.get(credentialIssuerKey(b.issuer)) ?? issuerOrder.length)
      || a.issuer.localeCompare(b.issuer, 'en'));
}
