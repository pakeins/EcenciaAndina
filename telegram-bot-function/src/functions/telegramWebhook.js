const { app } = require('@azure/functions');
const telegramRoutes = require('./telegramRoutes'); // Lógica pura del bot

app.http('telegramWebhook', {
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    route: 'telegram/webhook',
    handler: async (request, context) => {
        try {
            // 1. Verificación de Seguridad (Token Secreto de Telegram)
            const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
            const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token') || '';
            
            if (expectedSecret && receivedSecret !== expectedSecret) {
                context.warn('Telegram webhook no autorizado.');
                return { status: 401, body: 'Unauthorized' };
            }

            // 2. Extraer el payload
            const update = await request.json();
            
            // 3. Procesar la actualización con la lógica Pura del Bot (Sin Express)
            // Fire and forget o await según conveniencia. En Telegram se recomienda responder 200 rápido.
            context.log('Procesando Update ID:', update.update_id);
            await telegramRoutes.handleTelegramUpdate(update);
            
            return { status: 200, body: 'OK' };
            
        } catch (error) {
            context.error('Error procesando webhook:', error);
            // Telegram reintentará si devolvemos 500, o podemos devolver 200 si queremos que descarte el update
            return { status: 500, body: error.message || 'Internal Error' };
        }
    }
});
