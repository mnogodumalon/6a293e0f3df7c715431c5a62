import type { Veranstaltungen } from './app';

export type EnrichedVeranstaltungen = Veranstaltungen & {
  verantwortlicheName: string;
};
