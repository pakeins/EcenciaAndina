import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import telegramRouter from '../routes/telegram.js';

const app = express();
app.use(express.json());
app.use('/api/telegram', telegramRouter);

describe('Telegram Routes (/api/telegram/broadcast-sessions)', () => {
  let fetchSpy;
  const originalWebhookSecret = process.env.N8N_MENU_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.N8N_MENU_WEBHOOK_SECRET = 'supersecret';
    
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('/rest/v1/telegram_subscriptions')) {
        // Return two mock active subscriptions
        return new Response(
          JSON.stringify([
            { id: 'sub-1', chat_id: '12345', id_cliente: 'cli-1' },
            { id: 'sub-2', chat_id: '67890', id_cliente: 'cli-2' }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.N8N_MENU_WEBHOOK_SECRET = originalWebhookSecret;
  });

  it('debe retornar 503 si N8N_MENU_WEBHOOK_SECRET no esta configurado', async () => {
    delete process.env.N8N_MENU_WEBHOOK_SECRET;
    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .send({});
    
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('falta N8N_MENU_WEBHOOK_SECRET');
  });

  it('debe retornar 401 si no se envia el secreto o es incorrecto', async () => {
    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'wrongsecret')
      .send({});
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Acceso no autorizado');
  });

  it('debe generar sesiones de broadcast exitosamente para suscriptores activos con el secreto correcto', async () => {
    const payload = {
      menu: {
        entradas: ['Ensalada'],
        sopas: ['Sopa de lenteja'],
        segundos: ['Pollo asado'],
        guarniciones: ['Arroz'],
        bebidas: ['Jugo de mora'],
        postres: ['Gelatina']
      },
      photoUrl: 'https://example.com/menu.jpg'
    };

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    
    // Check first session structure
    expect(res.body[0].chatId).toBe('12345');
    expect(res.body[0].photoUrl).toBe('https://example.com/menu.jpg');
    expect(res.body[0].caption).toContain('🥗 <b>Entradas:</b>\n• Ensalada');
    expect(res.body[0].caption).toContain('🍲 <b>Sopas:</b>\n• Sopa de lenteja');
    expect(res.body[0].caption).toContain('¡Que disfrutes tu almuerzo!');
    expect(res.body[0].inlineKeyboard).toBeDefined();
    expect(res.body[0].subscriptionId).toBe('sub-1');
    expect(res.body[0].isCancellation).toBe(false);
  });

  it('debe aceptar el header alternativo X-Eciencia-Webhook-Secret', async () => {
    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Eciencia-Webhook-Secret', 'supersecret')
      .send({});

    expect(res.status).toBe(200);
  });

  it('debe soportar la filtracion por clientIds especificos', async () => {
    // Modify fetch spy to simulate query parameters verification if needed, or simply verify the flow
    const payload = {
      clientIds: ['cli-1']
    };

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send(payload);

    expect(res.status).toBe(200);
    // Verified query is made
    expect(fetchSpy).toHaveBeenCalled();
    const lastFetchUrl = fetchSpy.mock.calls[0][0].toString();
    expect(lastFetchUrl).toContain('telegram_subscriptions');
  });

  it('debe adjuntar notificaciones de cancelacion si se provee cancelledChatIds', async () => {
    const payload = {
      cancelledChatIds: ['12345']
    };

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send(payload);

    expect(res.status).toBe(200);
    // Since '12345' is in cancelledChatIds and matches sub-1, we should have 3 sessions in total (2 normal + 1 cancellation)
    expect(res.body).toHaveLength(3);
    const cancellationSession = res.body.find(s => s.isCancellation === true);
    expect(cancellationSession).toBeDefined();
    expect(cancellationSession.chatId).toBe('12345');
    expect(cancellationSession.caption).toContain('pedido fue cancelado');
  });

  it('debe retornar 500 si la consulta a Supabase retorna un error', async () => {
    // Force Supabase query to fail
    fetchSpy.mockImplementationOnce(async (url) => {
      if (url.toString().includes('/rest/v1/telegram_subscriptions')) {
        return new Response(
          JSON.stringify({ message: 'Supabase select error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  // --- Nuevos tests para 100% coverage ---

  it('debe manejar req.body indefinido o vacío', async () => {
    // Para probar la linea: const { menu = {}, ... } = req.body || {};
    // enviamos algo nulo si express lo permitiera o sin body
    // request(app) manda al menos {} si no ponemos send, pero podemos mandar un string vacio.
    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send(); // Esto genera un req.body vacio {} o nulo dependiendo de express.json()

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Como menu esta vacio, el caption solo deberia tener el titulo y despedida
    expect(res.body[0].caption).toBe('🍽️ <b>Menú del Día</b>\n\n¡Que disfrutes tu almuerzo! 😊');
  });

  it('debe manejar subscriptions nulas de la base de datos', async () => {
    // Forzamos a que supabase responda con null para subscriptions
    fetchSpy.mockImplementationOnce(async (url) => {
      if (url.toString().includes('/rest/v1/telegram_subscriptions')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('debe filtrar valores nulos o indefinidos en cancelledChatIds', async () => {
    const payload = {
      cancelledChatIds: [null, undefined, '12345', '']
    };

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send(payload);

    expect(res.status).toBe(200);
    const cancellations = res.body.filter(s => s.isCancellation);
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0].chatId).toBe('12345');
  });

  it('debe manejar un error de base de datos sin un mensaje especifico', async () => {
    fetchSpy.mockImplementationOnce(async (url) => {
      if (url.toString().includes('/rest/v1/telegram_subscriptions')) {
        // Enviar un error de postgrest crudo que podria no tener "message" parseable 
        // o lanzar una excepcion vacia
        return new Response(JSON.stringify({}), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post('/api/telegram/broadcast-sessions')
      .set('X-Ecencia-Webhook-Secret', 'supersecret')
      .send({});

    expect(res.status).toBe(500);
    // Verificamos el mensaje por defecto cuando error.message es indefinido
    expect(res.body.error).toBe('No se pudieron preparar las sesiones de broadcast.');
  });
});
