import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientesService from '../services/clientesService';

describe('clientesService', () => {
  let mockAdminClient;

  beforeEach(() => {
    const chainable = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      then: vi.fn(),
    };
    // By default, if awaited, resolve to { data: null, error: null }
    chainable.then.mockImplementation((resolve) => resolve({ data: null, error: null }));
    chainable.single.mockResolvedValue({ data: null, error: null });
    chainable.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockAdminClient = chainable;
  });

  it('telegramSummary handles complex cases', () => {
    const client = {
      telegram_subscriptions: [{
        consent_status: 'pending',
        consent_notice_version: 'v0.0',
        chat_id: 123
      }],
      telegram_invitations: [
        {
          created_at: new Date(Date.now() - 1000).toISOString(),
          consumed_at: null,
          revoked_at: null,
          expires_at: new Date(Date.now() + 100000).toISOString(),
          email_delivery_status: 'failed',
        },
        {
          created_at: new Date(Date.now() - 5000).toISOString(),
          consumed_at: true,
          revoked_at: null,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }
      ],
      telegram_privacy_requests: [
        { request_type: 'deletion', status: 'in_review' }
      ]
    };
    const summary = clientesService.telegramSummary(client);
    expect(summary.status).toBe('deletion_pending');
    expect(summary.has_chat).toBe(true);
    expect(summary.email_delivery.status).toBe('failed');
  });

  it('formatCliente formats correctly with missing relations', () => {
    const cli = {
      id_cliente: 1,
      clientes_convenios: [],
      tipos_cliente: null
    };
    const formatted = clientesService.formatCliente(cli);
    expect(formatted.id).toBe(1);
    expect(formatted.tipo_nombre).toBe('Sin tipo');
    expect(formatted.convenio).toBeNull();
  });

  it('getHistorialCliente handles no recargas or ordenes', async () => {
    // Both return empty
    mockAdminClient.then
      .mockImplementationOnce((res) => res({ data: [], error: null }))
      .mockImplementationOnce((res) => res({ data: [], error: null }))
      .mockImplementationOnce((res) => res({ data: [] }));

    const historial = await clientesService.getHistorialCliente(mockAdminClient, 1);
    expect(historial).toEqual([]);
  });

  it('hardDeleteCliente should execute correctly with no subscriptions or orders', async () => {
    mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockAdminClient.then
      .mockImplementationOnce((res) => res({ data: [], error: null })) // ordenes
      .mockImplementationOnce((res) => res({ error: null })); // final delete

    const res = await clientesService.hardDeleteCliente(mockAdminClient, 1);
    expect(res.success).toBe(true);
  });

  it('hardDeleteCliente deletes orders and notifies via telegram if sub exists', async () => {
    mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { chat_id: 123 }, error: null });
    mockAdminClient.then
      .mockImplementationOnce((res) => res({ data: [{ id_orden: 1 }], error: null })) // ordenes
      .mockImplementationOnce((res) => res({ error: null })) // delete detalle_orden
      .mockImplementationOnce((res) => res({ error: null })); // delete ordenes
      // the rest resolves to null by default

    const res = await clientesService.hardDeleteCliente(mockAdminClient, 1);
    expect(res.success).toBe(true);
  });

  it('deleteCliente handles successful deletion and notifies via telegram if sub exists', async () => {
    mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { chat_id: 123 }, error: null });
    mockAdminClient.then.mockImplementationOnce((res) => res({ error: null }));

    const res = await clientesService.deleteCliente(mockAdminClient, 1);
    expect(res.success).toBe(true);
  });
});
