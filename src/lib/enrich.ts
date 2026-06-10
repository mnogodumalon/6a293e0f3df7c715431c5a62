import type { EnrichedVeranstaltungen } from '@/types/enriched';
import type { Veranstaltungen, Verantwortliche } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface VeranstaltungenMaps {
  verantwortlicheMap: Map<string, Verantwortliche>;
}

export function enrichVeranstaltungen(
  veranstaltungen: Veranstaltungen[],
  maps: VeranstaltungenMaps
): EnrichedVeranstaltungen[] {
  return veranstaltungen.map(r => ({
    ...r,
    verantwortlicheName: resolveDisplay(r.fields.verantwortliche, maps.verantwortlicheMap, 'vorname', 'nachname'),
  }));
}
