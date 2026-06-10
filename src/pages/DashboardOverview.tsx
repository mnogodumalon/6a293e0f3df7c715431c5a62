import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichVeranstaltungen } from '@/lib/enrich';
import type { EnrichedVeranstaltungen } from '@/types/enriched';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconPlus, IconCalendar, IconMapPin, IconUsers, IconFlag, IconChevronRight } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { VeranstaltungenDialog } from '@/components/dialogs/VeranstaltungenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { CalendarWidget } from '@/components/widgets/CalendarWidget';
import type { CalendarEvent } from '@/components/widgets/CalendarWidget';
import { RecordOverlay, RecordHeader, RecordSection, RecordField, RecordAttachments } from '@/components/widgets/RecordView';
import { de } from 'date-fns/locale';
import { parseISO, isAfter, isBefore, startOfYear, endOfYear, getMonth } from 'date-fns';

const APPGROUP_ID = '6a293e0f3df7c715431c5a62';
const REPAIR_ENDPOINT = '/claude/build/repair';

const TYP_TONES: Record<string, 'primary' | 'success' | 'warning' | 'destructive' | 'default'> = {
  messe: 'primary',
  event: 'success',
  feier: 'warning',
};

const STATUS_COLORS: Record<string, string> = {
  geplant: 'bg-blue-100 text-blue-700 border-blue-200',
  bestaetigt: 'bg-green-100 text-green-700 border-green-200',
  abgesagt: 'bg-red-100 text-red-700 border-red-200',
};

const PRIO_COLORS: Record<string, string> = {
  hoch: 'bg-red-50 text-red-600 border-red-200',
  mittel: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  niedrig: 'bg-gray-50 text-gray-500 border-gray-200',
};

export default function DashboardOverview() {
  const {
    veranstaltungen, verantwortliche,
    verantwortlicheMap,
    loading, error, fetchAll,
  } = useDashboardData();

  // ALL hooks BEFORE early returns
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedVeranstaltungen | null>(null);
  const [overlayRecord, setOverlayRecord] = useState<EnrichedVeranstaltungen | null>(null);
  const [activeTypFilter, setActiveTypFilter] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number>(new Date().getFullYear());

  const enrichedVeranstaltungen = useMemo(
    () => enrichVeranstaltungen(veranstaltungen, { verantwortlicheMap }),
    [veranstaltungen, verantwortlicheMap]
  );

  // Filter by year and optionally by type
  const filtered = useMemo(() => {
    const yearStart = startOfYear(new Date(activeYear, 0, 1));
    const yearEnd = endOfYear(new Date(activeYear, 0, 1));
    return enrichedVeranstaltungen.filter(v => {
      const dateStr = v.fields.startdatum;
      if (!dateStr) return false;
      const d = parseISO(dateStr);
      if (isBefore(d, yearStart) || isAfter(d, yearEnd)) return false;
      if (activeTypFilter && lookupKey(v.fields.typ) !== activeTypFilter) return false;
      return true;
    });
  }, [enrichedVeranstaltungen, activeYear, activeTypFilter]);

  const calendarEvents: CalendarEvent[] = useMemo(() =>
    filtered.map(v => ({
      id: `v:${v.record_id}`,
      start: v.fields.startdatum ?? '',
      end: v.fields.enddatum ?? undefined,
      title: v.fields.titel ?? '(ohne Titel)',
      subtitle: v.fields.stadt ?? undefined,
      tone: TYP_TONES[lookupKey(v.fields.typ) ?? ''] ?? 'default',
    })),
    [filtered]
  );

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    const upcoming = enrichedVeranstaltungen.filter(v => {
      const d = v.fields.startdatum ? parseISO(v.fields.startdatum) : null;
      return d && isAfter(d, today);
    });
    const byCounts: Record<string, number> = { messe: 0, event: 0, feier: 0 };
    enrichedVeranstaltungen.forEach(v => {
      const key = lookupKey(v.fields.typ);
      if (key && key in byCounts) byCounts[key]++;
    });
    const nextEvent = upcoming.sort((a, b) => {
      const da = a.fields.startdatum ?? '';
      const db = b.fields.startdatum ?? '';
      return da.localeCompare(db);
    })[0] ?? null;
    return { total: enrichedVeranstaltungen.length, upcoming: upcoming.length, byCounts, nextEvent };
  }, [enrichedVeranstaltungen]);

  // Upcoming list (next 5 events in selected year)
  const upcomingList = useMemo(() => {
    const today = new Date();
    return filtered
      .filter(v => v.fields.startdatum && isAfter(parseISO(v.fields.startdatum), today))
      .sort((a, b) => (a.fields.startdatum ?? '').localeCompare(b.fields.startdatum ?? ''))
      .slice(0, 6);
  }, [filtered]);

  // Month distribution for the selected year
  const monthDist = useMemo(() => {
    const counts = Array(12).fill(0);
    filtered.forEach(v => {
      if (v.fields.startdatum) {
        const m = getMonth(parseISO(v.fields.startdatum));
        counts[m]++;
      }
    });
    return counts;
  }, [filtered]);

  const maxMonthCount = useMemo(() => Math.max(...monthDist, 1), [monthDist]);

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    const id = ev.id.replace('v:', '');
    const found = enrichedVeranstaltungen.find(v => v.record_id === id);
    if (found) setOverlayRecord(found);
  }, [enrichedVeranstaltungen]);

  const handleEmptyClick = useCallback((_date: Date) => {
    setEditRecord(null);
    setDialogOpen(true);
  }, []);

  const handleRangeCreate = useCallback((_start: Date, _end: Date) => {
    setEditRecord(null);
    setDialogOpen(true);
  }, []);

  const handleEventDrop = useCallback(async (eventId: string, newStart: string, newEnd?: string) => {
    const id = eventId.replace('v:', '');
    await LivingAppsService.updateVeranstaltungenEntry(id, {
      startdatum: newStart,
      ...(newEnd ? { enddatum: newEnd } : {}),
    });
    fetchAll();
  }, [fetchAll]);

  const handleEventResize = useCallback(async (eventId: string, newStart: string, newEnd: string) => {
    const id = eventId.replace('v:', '');
    await LivingAppsService.updateVeranstaltungenEntry(id, {
      startdatum: newStart,
      enddatum: newEnd,
    });
    fetchAll();
  }, [fetchAll]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const curYear = new Date().getFullYear();
    years.add(curYear - 1);
    years.add(curYear);
    years.add(curYear + 1);
    enrichedVeranstaltungen.forEach(v => {
      if (v.fields.startdatum) years.add(parseISO(v.fields.startdatum).getFullYear());
    });
    return Array.from(years).sort();
  }, [enrichedVeranstaltungen]);

  const MONATSNAMEN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jahresübersicht</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Messen, Events und Feiern im Überblick</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setActiveYear(y)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  activeYear === y
                    ? 'bg-white shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => { setEditRecord(null); setDialogOpen(true); }}
            className="shrink-0"
          >
            <IconPlus size={16} className="mr-1.5 shrink-0" />
            Neue Veranstaltung
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Gesamt"
          value={String(filtered.length)}
          description={`Veranstaltungen ${activeYear}`}
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Messen"
          value={String(filtered.filter(v => lookupKey(v.fields.typ) === 'messe').length)}
          description="Messeveranstaltungen"
          icon={<IconFlag size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Events"
          value={String(filtered.filter(v => lookupKey(v.fields.typ) === 'event').length)}
          description="Eventveranstaltungen"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Feiern"
          value={String(filtered.filter(v => lookupKey(v.fields.typ) === 'feier').length)}
          description="Feierveranstaltungen"
          icon={<IconMapPin size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Month distribution bar */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Verteilung nach Monat</h2>
          <div className="flex items-center gap-2">
            {/* Type filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTypFilter(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  activeTypFilter === null
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Alle
              </button>
              {LOOKUP_OPTIONS.veranstaltungen.typ.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setActiveTypFilter(activeTypFilter === opt.key ? null : opt.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    activeTypFilter === opt.key
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-16">
          {monthDist.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex items-end justify-center" style={{ height: '44px' }}>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    count === 0
                      ? 'bg-secondary'
                      : activeTypFilter === 'messe'
                      ? 'bg-primary/70'
                      : activeTypFilter === 'event'
                      ? 'bg-green-500/70'
                      : activeTypFilter === 'feier'
                      ? 'bg-yellow-500/70'
                      : 'bg-primary/60'
                  }`}
                  style={{ height: count === 0 ? '4px' : `${Math.max(8, (count / maxMonthCount) * 44)}px` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {MONATSNAMEN[i]}
              </span>
              {count > 0 && (
                <span className="text-[10px] font-semibold text-foreground">{count}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border">
          <CalendarWidget
            events={calendarEvents}
            defaultView="year"
            defaultDate={new Date(activeYear, 0, 1)}
            locale={de}
            views={['year', 'month', 'week', 'agenda']}
            weekStartsOn={1}
            heatmap={false}
            onEventClick={handleEventClick}
            onEmptyClick={handleEmptyClick}
            onRangeCreate={handleRangeCreate}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
          />
        </div>

        {/* Sidebar: upcoming + next event */}
        <div className="flex flex-col gap-4">
          {/* Next event highlight */}
          {stats.nextEvent && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Nächste Veranstaltung</p>
              <h3 className="font-semibold text-foreground text-base truncate">{stats.nextEvent.fields.titel ?? '—'}</h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                <IconCalendar size={14} className="shrink-0" />
                <span className="truncate">{formatDate(stats.nextEvent.fields.startdatum)}</span>
              </div>
              {stats.nextEvent.fields.stadt && (
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                  <IconMapPin size={14} className="shrink-0" />
                  <span className="truncate">{stats.nextEvent.fields.stadt}</span>
                </div>
              )}
              {stats.nextEvent.fields.typ && (
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[lookupKey(stats.nextEvent.fields.status) ?? ''] ?? 'bg-secondary text-secondary-foreground border-border'}`}>
                    {stats.nextEvent.fields.status?.label ?? 'Kein Status'}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  setEditRecord(stats.nextEvent);
                  setDialogOpen(true);
                }}
              >
                Bearbeiten
              </Button>
            </div>
          )}

          {/* Upcoming list */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Bevorstehend</h2>
              <span className="text-xs text-muted-foreground">{upcomingList.length} Events</span>
            </div>
            {upcomingList.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Keine bevorstehenden Veranstaltungen
              </div>
            ) : (
              <div className="divide-y divide-border">
                {upcomingList.map(v => {
                  const typKey = lookupKey(v.fields.typ);
                  const statusKey = lookupKey(v.fields.status);
                  return (
                    <button
                      key={v.record_id}
                      className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3 min-w-0"
                      onClick={() => setOverlayRecord(v)}
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          typKey === 'messe' ? 'bg-primary' :
                          typKey === 'event' ? 'bg-green-500' :
                          typKey === 'feier' ? 'bg-yellow-500' :
                          'bg-muted-foreground'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{v.fields.titel ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(v.fields.startdatum)}
                          {v.fields.stadt ? ` · ${v.fields.stadt}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {statusKey && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[statusKey] ?? 'bg-secondary text-foreground border-border'}`}>
                            {v.fields.status?.label}
                          </span>
                        )}
                        <IconChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* All events in year grouped by month */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Alle {activeYear}</h2>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Keine Veranstaltungen gefunden
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {filtered
                  .sort((a, b) => (a.fields.startdatum ?? '').localeCompare(b.fields.startdatum ?? ''))
                  .map(v => {
                    const typKey = lookupKey(v.fields.typ);
                    const prioKey = lookupKey(v.fields.prioritaet);
                    return (
                      <button
                        key={v.record_id}
                        className="w-full text-left px-4 py-2.5 hover:bg-accent/40 transition-colors flex items-center gap-2 min-w-0"
                        onClick={() => setOverlayRecord(v)}
                      >
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          typKey === 'messe' ? 'bg-primary/10 text-primary' :
                          typKey === 'event' ? 'bg-green-100 text-green-700' :
                          typKey === 'feier' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-secondary text-secondary-foreground'
                        }`}>
                          {v.fields.typ?.label ?? '?'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{v.fields.titel ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(v.fields.startdatum)}</p>
                        </div>
                        {prioKey === 'hoch' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIO_COLORS.hoch}`}>Hoch</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <VeranstaltungenDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={async (fields) => {
          if (editRecord) {
            await LivingAppsService.updateVeranstaltungenEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createVeranstaltungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRecord?.fields}
        recordId={editRecord?.record_id}
        verantwortlicheList={verantwortliche}
        enablePhotoScan={AI_PHOTO_SCAN['Veranstaltungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Veranstaltungen']}
      />

      {overlayRecord && (
        <RecordOverlay
          open={!!overlayRecord}
          onClose={() => setOverlayRecord(null)}
          onEdit={() => {
            setEditRecord(overlayRecord);
            setOverlayRecord(null);
            setDialogOpen(true);
          }}
        >
          <RecordHeader
            title={overlayRecord.fields.titel ?? '—'}
            subtitle={overlayRecord.fields.typ?.label}
            badges={
              <div className="flex flex-wrap gap-2">
                {overlayRecord.fields.status && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[lookupKey(overlayRecord.fields.status) ?? ''] ?? 'bg-secondary text-foreground border-border'}`}>
                    {overlayRecord.fields.status.label}
                  </span>
                )}
                {overlayRecord.fields.prioritaet && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${PRIO_COLORS[lookupKey(overlayRecord.fields.prioritaet) ?? ''] ?? 'bg-secondary text-foreground border-border'}`}>
                    {overlayRecord.fields.prioritaet.label}
                  </span>
                )}
              </div>
            }
          />
          <RecordSection title="Zeitraum" cols={2}>
            <RecordField label="Start" value={formatDateTime(overlayRecord.fields.startdatum)} />
            <RecordField label="Ende" value={formatDateTime(overlayRecord.fields.enddatum)} />
          </RecordSection>
          <RecordSection title="Ort">
            <RecordField
              label="Adresse"
              value={[overlayRecord.fields.strasse, overlayRecord.fields.hausnummer, overlayRecord.fields.plz, overlayRecord.fields.stadt].filter(Boolean).join(' ') || undefined}
            />
          </RecordSection>
          {(overlayRecord.verantwortlicheName || overlayRecord.fields.beschreibung || overlayRecord.fields.notizen) && (
            <RecordSection title="Details">
              {overlayRecord.verantwortlicheName && (
                <RecordField label="Verantwortliche" value={overlayRecord.verantwortlicheName} />
              )}
              {overlayRecord.fields.beschreibung && (
                <RecordField label="Beschreibung" value={overlayRecord.fields.beschreibung} format="longtext" />
              )}
              {overlayRecord.fields.notizen && (
                <RecordField label="Notizen" value={overlayRecord.fields.notizen} format="longtext" />
              )}
            </RecordSection>
          )}
          <RecordAttachments appId="6a293dfdc6afb340fd657d90" recordId={overlayRecord.record_id} />
        </RecordOverlay>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-96 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
