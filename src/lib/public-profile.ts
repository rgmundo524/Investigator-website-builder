type LocationSettings = { location?: string; show_location?: boolean };

// Saved locations stay private unless their display is explicitly enabled.
export function publicLocation(data: LocationSettings): string | undefined {
  return data.show_location === true ? data.location?.trim() || undefined : undefined;
}
