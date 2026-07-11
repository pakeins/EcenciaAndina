const { app } = require('@azure/functions');
const { sendMessage } = require('../services/telegramApi');
const { createInvitation, recordConsentEvent, getConsentVersion, privacyText } = require('../services/telegramConsent');

// Authentication middleware check for internal API
const isAuthorized = (request) => {
    const internalSecret = process.env.INTERNAL_API_SECRET || 'dev-internal-secret-123';
    const providedSecret = request.headers.get('x-internal-secret');
    return providedSecret === internalSecret;
};

app.http('internalSendMessage', {
    methods: ['POST'],
    authLevel: 'anonymous', // Authentication handled via custom header
    route: 'internal/sendMessage',
    handler: async (request, context) => {
        if (!isAuthorized(request)) return { status: 401, body: 'Unauthorized' };
        try {
            const { chatId, message, options, parseMode } = await request.json();
            const result = await sendMessage(chatId, message, options, parseMode);
            return { status: 200, jsonBody: { success: true, result } };
        } catch (error) {
            context.error('Error in internalSendMessage:', error);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('internalCreateInvitation', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'internal/createInvitation',
    handler: async (request, context) => {
        if (!isAuthorized(request)) return { status: 401, body: 'Unauthorized' };
        try {
            const { idCliente, adminId } = await request.json();
            const onboarding = await createInvitation(idCliente, adminId);
            return { status: 200, jsonBody: onboarding };
        } catch (error) {
            context.error('Error in internalCreateInvitation:', error);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('internalRecordConsentEvent', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'internal/recordConsentEvent',
    handler: async (request, context) => {
        if (!isAuthorized(request)) return { status: 401, body: 'Unauthorized' };
        try {
            const data = await request.json();
            await recordConsentEvent(data);
            return { status: 200, jsonBody: { success: true } };
        } catch (error) {
            context.error('Error in internalRecordConsentEvent:', error);
            return { status: 500, jsonBody: { error: error.message } };
        }
    }
});

app.http('internalGetConstants', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'internal/constants',
    handler: async (request, context) => {
        if (!isAuthorized(request)) return { status: 401, body: 'Unauthorized' };
        return { 
            status: 200, 
            jsonBody: { 
                consentVersion: getConsentVersion(), 
                privacyText: privacyText() 
            } 
        };
    }
});
