// Record only the kinds of off-chain leads examined, never identifying values.
export const OFF_CHAIN_LEAD_TYPES = [
  { id: 'ip-addresses', label: 'IP addresses' },
  { id: 'email-addresses', label: 'Email addresses' },
  { id: 'phone-numbers', label: 'Phone numbers' },
  { id: 'social-media-accounts', label: 'Social media accounts' },
  { id: 'urls', label: 'URLs' },
] as const;

export type OffChainLeadType = typeof OFF_CHAIN_LEAD_TYPES[number]['id'];

export function offChainLeadLabels(leads: readonly OffChainLeadType[]): string[] {
  return leads.map((id) => OFF_CHAIN_LEAD_TYPES.find((lead) => lead.id === id)!.label);
}
