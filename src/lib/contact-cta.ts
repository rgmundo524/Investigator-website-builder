import type { ContentData } from '../content/schemas';

type ContactService = ContentData<'contacts'>['services'][number];

/** Reuse a service's current booking/contact details instead of copying them into pages. */
export function contactCtaDestination(service: ContactService): { url: string; label: string; kind: 'booking' | 'email' | 'action' } | undefined {
  if (!service.enabled) return undefined;
  if (service.booking?.enabled) return { url: service.booking.url, label: service.booking.label, kind: 'booking' };
  if (service.email) return { url: `mailto:${service.email}`, label: `Email ${service.name}`, kind: 'email' };
  return { ...service.action, kind: 'action' };
}
