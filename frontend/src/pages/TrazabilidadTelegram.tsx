import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TelegramTraceList } from '@/components/orders/TelegramTraceList';
import type { TelegramOrderTrace, TraceOutcome } from '@/components/orders/TelegramTraceList';

interface TraceResponse {
  traces: TelegramOrderTrace[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function TrazabilidadTelegram() {
  const [traces, setTraces] = useState<TelegramOrderTrace[]>([]);
  const [outcome, setOutcome] = useState<'all' | TraceOutcome>('all');
  const [chatId, setChatId] = useState('');
  const [appliedChatId, setAppliedChatId] = useState('');
  
  const today = new Date().toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(today);
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(today);
  const [appliedFechaFin, setAppliedFechaFin] = useState(today);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTraces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (outcome !== 'all') params.set('outcome', outcome);
      if (appliedChatId) params.set('chat_id', appliedChatId);
      if (appliedFechaInicio) params.set('fecha_inicio', appliedFechaInicio);
      if (appliedFechaFin) params.set('fecha_fin', appliedFechaFin);

      const response = await apiFetch(`/ordenes/telegram/trazabilidad?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar la trazabilidad.');

      const result = data as TraceResponse;
      setTraces(Array.isArray(result.traces) ? result.traces : []);
      setTotalPages(result.pagination?.totalPages || 1);
      setTotal(result.pagination?.total || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar la trazabilidad.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedChatId, appliedFechaInicio, appliedFechaFin, outcome, page]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  const applySearch = () => {
    setPage(1);
    setAppliedChatId(chatId.trim());
    setAppliedFechaInicio(fechaInicio);
    setAppliedFechaFin(fechaFin);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-4xl font-extrabold tracking-tight text-cafe">
          <Activity className="h-9 w-9 text-terracota" />
          Trazabilidad Telegram
        </h1>
        <p className="mt-1 text-lg text-muted-foreground">
          Audita acciones por botones y resultados sin conservar mensajes libres.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consulta de trazabilidad</CardTitle>
          <CardDescription>{total} registros encontrados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="w-full space-y-1.5 md:max-w-[140px]">
              <Label>Desde</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            
            <div className="w-full space-y-1.5 md:max-w-[140px]">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>

            <div className="w-full space-y-1.5 md:max-w-xs">
              <Label htmlFor="trace-chat">Chat de Telegram</Label>
              <Input
                id="trace-chat"
                placeholder="Ej. 123456789"
                value={chatId}
                onChange={(event) => setChatId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applySearch();
                }}
              />
            </div>

            <div className="w-full space-y-1.5 md:max-w-[220px]">
              <Label>Resultado</Label>
              <Select
                value={outcome}
                onValueChange={(value) => {
                  setPage(1);
                  setOutcome(value as 'all' | TraceOutcome);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="received">Recibidos</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="success">Exitosos</SelectItem>
                  <SelectItem value="failed">Fallidos</SelectItem>
                  <SelectItem value="rejected">Rechazados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={applySearch} className="gap-2">
              <Search className="h-4 w-4" />
              Buscar
            </Button>
            <Button variant="outline" onClick={loadTraces} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <TelegramTraceList traces={traces} isLoading={isLoading} error={error} />

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => value - 1)}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
        <Button variant="outline" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
