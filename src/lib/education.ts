import { formatMonth } from './dates';

type EducationDetails = {
  start: string;
  end: string | null;
};

export function educationDetails(data: EducationDetails, locale = 'en-US'): string {
  return `${formatMonth(data.start, locale)}${data.end ? ` to ${formatMonth(data.end, locale)}` : ''}`;
}
