import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Veranstaltungen, Verantwortliche } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [veranstaltungen, setVeranstaltungen] = useState<Veranstaltungen[]>([]);
  const [verantwortliche, setVerantwortliche] = useState<Verantwortliche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [veranstaltungenData, verantwortlicheData] = await Promise.all([
        LivingAppsService.getVeranstaltungen(),
        LivingAppsService.getVerantwortliche(),
      ]);
      setVeranstaltungen(veranstaltungenData);
      setVerantwortliche(verantwortlicheData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [veranstaltungenData, verantwortlicheData] = await Promise.all([
          LivingAppsService.getVeranstaltungen(),
          LivingAppsService.getVerantwortliche(),
        ]);
        setVeranstaltungen(veranstaltungenData);
        setVerantwortliche(verantwortlicheData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const verantwortlicheMap = useMemo(() => {
    const m = new Map<string, Verantwortliche>();
    verantwortliche.forEach(r => m.set(r.record_id, r));
    return m;
  }, [verantwortliche]);

  return { veranstaltungen, setVeranstaltungen, verantwortliche, setVerantwortliche, loading, error, fetchAll, verantwortlicheMap };
}