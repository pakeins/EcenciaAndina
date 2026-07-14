import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const mockTelegramMicroservice = vi.hoisted(() => ({
  getConsentVersion: vi.fn(() => 'v1.0'),
  privacyText: vi.fn(() => 'Privacy policy text'),
  createInvitation: vi.fn(async (idCliente, empleadoId) => ({
    status: 'sent',
    onboarding_url: 'http://onboarding-url',
    expires_at: '2026-07-20T00:00:00Z',
    invitationId: 999
  })),
  recordConsentEvent: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => ({ message_id: 12345 }))
}));

const mockOutlookMail = vi.hoisted(() => ({
  sendOutlookMail: vi.fn(async () => ({ status: 'delivered', messageId: 'msg-id' })),
  buildInvitationEmail: vi.fn(() => ({ subject: 'Invite', text: 'Text', html: 'Html' }))
}));

const telegramMicroservice = require('../services/telegramMicroservice.js');
const outlookMail = require('../services/outlookMail.js');

vi.spyOn(telegramMicroservice, 'createInvitation').mockImplementation(mockTelegramMicroservice.createInvitation);
vi.spyOn(telegramMicroservice, 'recordConsentEvent').mockImplementation(mockTelegramMicroservice.recordConsentEvent);
vi.spyOn(telegramMicroservice, 'sendMessage').mockImplementation(mockTelegramMicroservice.sendMessage);
vi.spyOn(telegramMicroservice, 'getConsentVersion').mockImplementation(mockTelegramMicroservice.getConsentVersion);
vi.spyOn(telegramMicroservice, 'privacyText').mockImplementation(mockTelegramMicroservice.privacyText);

vi.spyOn(outlookMail, 'sendOutlookMail').mockImplementation(mockOutlookMail.sendOutlookMail);
vi.spyOn(outlookMail, 'buildInvitationEmail').mockImplementation(mockOutlookMail.buildInvitationEmail);

const clientesService = require('../services/clientesService.js');

describe('clientesService', () => {
  let mockAdminClient;

  beforeEach(() => {
    vi.clearAllMocks();
    const chainable = {};
    chainable.from = vi.fn(() => chainable);
    chainable.select = vi.fn(() => chainable);
    chainable.eq = vi.fn(() => chainable);
    chainable.neq = vi.fn(() => chainable);
    chainable.order = vi.fn(() => chainable);
    chainable.insert = vi.fn(() => chainable);
    chainable.update = vi.fn(() => chainable);
    chainable.delete = vi.fn(() => chainable);
    chainable.in = vi.fn(() => chainable);
    chainable.limit = vi.fn(() => chainable);
    chainable.ilike = vi.fn(() => chainable);
    chainable.upsert = vi.fn(() => chainable);
    chainable.single = vi.fn();
    chainable.maybeSingle = vi.fn();
    chainable.then = vi.fn();
    
    // Default database return behavior
    chainable.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    chainable.single.mockResolvedValue({ data: null, error: null });
    chainable.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockAdminClient = chainable;
  });

  describe('Utility functions', () => {
    it('sendTelegramInvitationEmail handles success', async () => {
      const client = { nombre: 'Juan', correo: 'juan@test.com' };
      const onboarding = { onboarding_url: 'http://link' };
      const res = await clientesService.sendTelegramInvitationEmail({ client, onboarding });
      expect(res.status).toBe('delivered');
    });

    it('sendTelegramInvitationEmail handles error', async () => {
      mockOutlookMail.sendOutlookMail.mockRejectedValueOnce(new Error('SMTP Error'));
      const client = { nombre: 'Juan', correo: 'juan@test.com' };
      const onboarding = { onboarding_url: 'http://link' };
      const res = await clientesService.sendTelegramInvitationEmail({ client, onboarding });
      expect(res.status).toBe('failed');
      expect(res.error).toBe('SMTP Error');
    });

    it('sendTelegramReactivationEmail handles success', async () => {
      const client = { nombre: 'Juan', correo: 'juan@test.com' };
      const res = await clientesService.sendTelegramReactivationEmail({ client });
      expect(res.status).toBe('delivered');
    });

    it('sendTelegramReactivationEmail handles error', async () => {
      mockOutlookMail.sendOutlookMail.mockRejectedValueOnce(new Error('SMTP Error'));
      const client = { nombre: 'Juan', correo: 'juan@test.com' };
      const res = await clientesService.sendTelegramReactivationEmail({ client });
      expect(res.status).toBe('failed');
    });

    it('getRelationFirst works correctly', () => {
      expect(clientesService.getRelationFirst([1, 2])).toBe(1);
      expect(clientesService.getRelationFirst(5)).toBe(5);
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

    it('setConsentState upserts successfully', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null }));
      await expect(clientesService.setConsentState(mockAdminClient, 123, { status: 'accepted' })).resolves.not.toThrow();
    });

    it('setConsentState throws on error', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: new Error('DB Error') }));
      await expect(clientesService.setConsentState(mockAdminClient, 123, { status: 'accepted' })).rejects.toThrow('DB Error');
    });

    it('directConsentKeyboard returns buttons', () => {
      const kb = clientesService.directConsentKeyboard();
      expect(kb.inline_keyboard.length).toBe(2);
    });

    it('publicOnboarding formats invitation', () => {
      const onb = { status: 'pending', onboarding_url: 'url', expires_at: 'expiry', email_delivery: 'yes' };
      const formatted = clientesService.publicOnboarding(onb);
      expect(formatted.status).toBe('pending');
      expect(formatted.email_delivery).toBe('yes');
    });
  });

  describe('validateConvenioLink', () => {
    it('throws if convenio not found', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // convenio
        .mockResolvedValueOnce({ data: null, error: null }); // link
      await expect(clientesService.validateConvenioLink(mockAdminClient, 1)).rejects.toThrow('Convenio no encontrado.');
    });

    it('throws if convenio is inactive or expired', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: false }, error: null }) // convenio
        .mockResolvedValueOnce({ data: null, error: null }); // link
      await expect(clientesService.validateConvenioLink(mockAdminClient, 1)).rejects.toThrow('No se puede vincular un cliente a un convenio inactivo o vencido.');
    });

    it('throws if capacity reached', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: true, cupo_maximo: 5, clientes_convenios: [{ count: 5 }] }, error: null }) // convenio
        .mockResolvedValueOnce({ data: null, error: null }); // link
      await expect(clientesService.validateConvenioLink(mockAdminClient, 1)).rejects.toThrow('El convenio alcanzo su cupo maximo de 5 colaboradores.');
    });

    it('allows linking if is same link even if capacity reached', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: true, cupo_maximo: 5, clientes_convenios: [{ count: 5 }] }, error: null }) // convenio
        .mockResolvedValueOnce({ data: { id_convenio: 1 }, error: null }); // link
      const res = await clientesService.validateConvenioLink(mockAdminClient, 1, 10);
      expect(res.isSameLink).toBe(true);
    });
  });

  describe('Database Fetch Operations', () => {
    it('getAllClientes returns mapped clients', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ data: [{ id_cliente: 1, clientes_convenios: [], tipos_cliente: null }], error: null }));
      const res = await clientesService.getAllClientes(mockAdminClient);
      expect(res.length).toBe(1);
      expect(res[0].id).toBe(1);
    });

    it('getAllClientes throws on db error', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ data: null, error: new Error('Query error') }));
      await expect(clientesService.getAllClientes(mockAdminClient)).rejects.toThrow('Query error');
    });

    it('getTiposCliente returns list', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ data: [{ id: 1, nombre_tipo: 'Direct' }], error: null }));
      const res = await clientesService.getTiposCliente(mockAdminClient);
      expect(res.length).toBe(1);
    });

    it('getPrivacyRequests returns requests list', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ data: [{ id: 1 }], error: null }));
      const res = await clientesService.getPrivacyRequests(mockAdminClient);
      expect(res.length).toBe(1);
    });
  });

  describe('resolvePrivacyRequest', () => {
    it('throws if request not found', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(clientesService.resolvePrivacyRequest(mockAdminClient, 1, { status: 'resolved' }, { id: 10 }))
        .rejects.toThrow('Solicitud de privacidad no encontrada.');
    });

    it('resolves request and updates subscription to rejected', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { id: 1, subscription_id: 5, status: 'resolved' }, error: null }) // update request
        .mockResolvedValueOnce({ data: { chat_id: 123 }, error: null }); // update subscription
      
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // update sub execution
      
      const res = await clientesService.resolvePrivacyRequest(mockAdminClient, 1, { status: 'resolved', resolution_notes: 'Motivo' }, { id: 10 });
      expect(res.status).toBe('resolved');
    });

    it('rejects request and notifies user via telegram', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { id: 1, subscription_id: 5, status: 'rejected' }, error: null }) // update request
        .mockResolvedValueOnce({ data: { chat_id: 123 }, error: null }); // update subscription
      
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // update sub execution
      
      const res = await clientesService.resolvePrivacyRequest(mockAdminClient, 1, { status: 'rejected', resolution_notes: 'Motivo' }, { id: 10 });
      expect(res.status).toBe('rejected');
    });
  });

  describe('removeClienteFromConvenio', () => {
    it('removes successfully', async () => {
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ error: null })) // delete CC
        .mockImplementationOnce((resolve) => resolve({ error: null })); // update cliente

      const res = await clientesService.removeClienteFromConvenio(mockAdminClient, 1, { id: 10 });
      expect(res.mensaje).toBe('Vínculo con convenio eliminado');
    });
  });

  describe('createCliente', () => {
    it('throws error if agreement and user is not admin', async () => {
      await expect(clientesService.createCliente(mockAdminClient, { id_tipo_cliente: 1 }, { rol: 'empleado' }))
        .rejects.toThrow('Solo un administrador puede vincular clientes a convenios.');
    });

    it('throws error if agreement but no convenio selected', async () => {
      await expect(clientesService.createCliente(mockAdminClient, { id_tipo_cliente: 1 }, { rol: 'administrador' }))
        .rejects.toThrow('Debe seleccionar un convenio para este tipo de cliente.');
    });

    it('throws error if direct but convenio selected', async () => {
      await expect(clientesService.createCliente(mockAdminClient, { id_tipo_cliente: 2, id_convenio: 5 }, { rol: 'administrador' }))
        .rejects.toThrow('Un cliente frecuente no puede tener convenio.');
    });

    it('creates client successfully', async () => {
      // convenio validation passes
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { esta_activo: true, cupo_maximo: 10, clientes_convenios: [{ count: 0 }] }, error: null });
      // phone check & email check (both return empty)
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })) // phone
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })); // email
      // insert client returns created client ID
      mockAdminClient.single
        .mockResolvedValueOnce({ data: { id_cliente: 10 }, error: null }) // insert client
        .mockResolvedValueOnce({ data: { id_cliente: 10, clientes_convenios: [], tipos_cliente: null }, error: null }); // final select

      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ error: null })); // insert convenio

      const res = await clientesService.createCliente(mockAdminClient, {
        cedula: '1234',
        nombre: 'Juan',
        apellido: 'Perez',
        correo: 'juan@perez.com',
        telefono: '0999',
        id_tipo_cliente: 1,
        id_convenio: 5
      }, { id: 1, rol: 'administrador' });

      expect(res.id).toBe(10);
    });

    it('throws if phone is duplicate', async () => {
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ data: [{ id_cliente: 2 }], error: null })) // phone
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })); // email

      await expect(clientesService.createCliente(mockAdminClient, {
        cedula: '1234',
        nombre: 'Juan',
        apellido: 'Perez',
        correo: 'juan@perez.com',
        telefono: '0999',
        id_tipo_cliente: 2
      }, { id: 1, rol: 'administrador' })).rejects.toThrow('Este telefono ya pertenece a un cliente activo.');
    });

    it('throws if email is duplicate', async () => {
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })) // phone
        .mockImplementationOnce((resolve) => resolve({ data: [{ id_cliente: 2 }], error: null })); // email

      await expect(clientesService.createCliente(mockAdminClient, {
        cedula: '1234',
        nombre: 'Juan',
        apellido: 'Perez',
        correo: 'juan@perez.com',
        telefono: '0999',
        id_tipo_cliente: 2
      }, { id: 1, rol: 'administrador' })).rejects.toThrow('Este correo ya pertenece a otro cliente.');
    });
  });

  describe('reinviteClienteTelegram', () => {
    it('throws if client not found', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // subscription
      await expect(clientesService.reinviteClienteTelegram(mockAdminClient, 1, { id: 10 }))
        .rejects.toThrow('Cliente no encontrado.');
    });

    it('throws if client is inactive', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: false }, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // subscription
      await expect(clientesService.reinviteClienteTelegram(mockAdminClient, 1, { id: 10 }))
        .rejects.toThrow('El cliente debe estar activo para reinvitarlo.');
    });

    it('reinvites with direct message if chat exists', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: true, id_cliente: 1, correo: 'c@c.com' }, error: null }) // client
        .mockResolvedValueOnce({ data: { id: 5, chat_id: 123 }, error: null }); // subscription
      
      mockAdminClient.single.mockResolvedValueOnce({ data: { id: 5, chat_id: 123 }, error: null }); // update sub
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // record event

      const res = await clientesService.reinviteClienteTelegram(mockAdminClient, 1, { id: 10 });
      expect(res.telegram_onboarding.status).toBe('sent');
    });

    it('creates link invitation if chat does not exist', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { esta_activo: true, id_cliente: 1, correo: 'c@c.com' }, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // subscription
      
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // record event

      const res = await clientesService.reinviteClienteTelegram(mockAdminClient, 1, { id: 10 });
      expect(res.telegram_onboarding.status).toBe('sent');
    });
  });

  describe('revokeTelegram', () => {
    it('throws if subscription does not exist', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(clientesService.revokeTelegram(mockAdminClient, 1))
        .rejects.toThrow('No existe una suscripcion para este cliente.');
    });

    it('throws if subscription already revoked', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { consent_status: 'revoked' }, error: null });
      await expect(clientesService.revokeTelegram(mockAdminClient, 1))
        .rejects.toThrow('La suscripcion ya se encuentra revocada.');
    });

    it('revokes subscription successfully', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { id: 5, chat_id: 123, consent_status: 'accepted' }, error: null });
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ error: null })) // update
        .mockImplementationOnce((resolve) => resolve({ error: null })); // event

      const res = await clientesService.revokeTelegram(mockAdminClient, 1);
      expect(res.success).toBe(true);
    });
  });

  describe('updateCliente', () => {
    it('throws if client not found', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // link
      await expect(clientesService.updateCliente(mockAdminClient, 1, {}, { id: 10 }))
        .rejects.toThrow('Cliente no encontrado');
    });

    it('throws if non-admin tries to change type or agreement', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { id_tipo_cliente: 1, esta_activo: true }, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // link
      await expect(clientesService.updateCliente(mockAdminClient, 1, { id_tipo_cliente: 2 }, { id: 10, rol: 'empleado' }))
        .rejects.toThrow('Solo un administrador puede cambiar el tipo o convenio del cliente.');
    });

    it('updates successfully', async () => {
      mockAdminClient.maybeSingle
        .mockResolvedValueOnce({ data: { id_tipo_cliente: 2, esta_activo: true, telefono: '123', correo: 'c@c.com' }, error: null }) // client
        .mockResolvedValueOnce({ data: null, error: null }); // link
      
      mockAdminClient.then
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })) // phone check
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null })) // email check
        .mockImplementationOnce((resolve) => resolve({ error: null })); // unlink if any

      mockAdminClient.single
        .mockResolvedValueOnce({ data: { id_cliente: 1, id_tipo_cliente: 2 }, error: null }) // update
        .mockResolvedValueOnce({ data: { id_cliente: 1, clientes_convenios: [], tipos_cliente: null }, error: null }); // final select

      const res = await clientesService.updateCliente(mockAdminClient, 1, { nombre: 'New Name', id_tipo_cliente: 2 }, { id: 10, rol: 'administrador' });
      expect(res.id).toBe(1);
    });
  });

  describe('Saldos and Recargas', () => {
    it('getClienteSaldo returns data', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ data: [{ id_cliente: 1 }], error: null }));
      const res = await clientesService.getClienteSaldo(mockAdminClient, 1);
      expect(res.length).toBe(1);
    });

    it('recargarSaldo handles new product recharge', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // insert recarga
      mockAdminClient.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // single check empty
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // insert saldo

      const res = await clientesService.recargarSaldo(mockAdminClient, 1, { id_producto: 5, cantidad_comprada: 10 }, { id: 10 });
      expect(res.mensaje).toBe('Recarga registrada exitosamente y saldo actualizado');
    });

    it('recargarSaldo updates existing product recharge', async () => {
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // insert recarga
      mockAdminClient.single
        .mockResolvedValueOnce({ data: { cantidad_disponible: 5 }, error: null }); // single check exists
      mockAdminClient.then.mockImplementationOnce((resolve) => resolve({ error: null })); // update saldo

      const res = await clientesService.recargarSaldo(mockAdminClient, 1, { id_producto: 5, cantidad_comprada: 10 }, { id: 10 });
      expect(res.mensaje).toBe('Recarga registrada exitosamente y saldo actualizado');
    });
  });

  describe('getHistorialCliente', () => {
    it('getHistorialCliente handles no recargas or ordenes', async () => {
      mockAdminClient.then
        .mockImplementationOnce((res) => res({ data: [], error: null })) // recargas
        .mockImplementationOnce((res) => res({ data: [], error: null })) // ordenes
        .mockImplementationOnce((res) => res({ data: [] })); // empleados

      const historial = await clientesService.getHistorialCliente(mockAdminClient, 1);
      expect(historial).toEqual([]);
    });

    it('getHistorialCliente processes history lists', async () => {
      mockAdminClient.then
        .mockImplementationOnce((res) => res({ data: [{ id_recarga: 1, created_at: '2026-07-10T00:00:00Z', productos: { nombre_producto: 'P1' } }], error: null })) // recargas
        .mockImplementationOnce((res) => res({ data: [{ id_orden: 2, created_at: '2026-07-11T00:00:00Z', consumed_at: '2026-07-11T01:00:00Z', detalle_orden: [{ cantidad: 2, precio_aplicado: 3.5, productos: { nombre_producto: 'P2' } }] }], error: null })) // ordenes
        .mockImplementationOnce((res) => res({ data: [{ id: 10, nombre: 'Emp', apellido: 'Last' }] })); // empleados

      const historial = await clientesService.getHistorialCliente(mockAdminClient, 1);
      expect(historial.length).toBe(2);
      expect(historial[0].tipo).toBe('consumo');
      expect(historial[1].tipo).toBe('recarga');
    });
  });

  describe('deleteCliente', () => {
    it('deleteCliente handles successful deletion and notifies via telegram if sub exists', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: { chat_id: 123 }, error: null });
      mockAdminClient.then.mockImplementationOnce((res) => res({ error: null }));

      const res = await clientesService.deleteCliente(mockAdminClient, 1);
      expect(res.success).toBe(true);
    });

    it('deleteCliente throws conflict error on code 23503', async () => {
      mockAdminClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const error = new Error('Constraint violation');
      error.code = '23503';
      mockAdminClient.then.mockImplementationOnce((res) => res({ error }));

      await expect(clientesService.deleteCliente(mockAdminClient, 1))
        .rejects.toThrow('No se puede eliminar el cliente porque tiene órdenes, recargas o registros asociados.');
    });
  });

  describe('hardDeleteCliente', () => {
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
  });
});
