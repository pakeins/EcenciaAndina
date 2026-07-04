# Plan de Accion: Telegram Bot con Consentimiento y Envio Productivo

## Diagnostico verificado

- Las pruebas locales del backend y frontend pasaron antes de este cambio.
- Backend local `3002`, n8n local `7000` y Docker no estaban activos durante la ultima verificacion.
- El cliente `+593 99 831 3804` existe y esta activo en Supabase.
- No existe vinculo `phone:593998313804 -> chatId` en `telegram_bot_state`, por eso el menu no puede llegarle.
- El workflow actual de n8n solo envia menu a clientes activos que ya tengan `chatId`.
- Telegram no permite que un bot escriba primero a un usuario que nunca inicio conversacion con el bot.
- El workflow actual no tiene logica de consentimiento, aceptacion o rechazo.

## Cambios a implementar

- Crear tabla `telegram_subscriptions` para el vinculo permanente entre cliente, telefono, chat de Telegram y consentimiento.
- Mantener `telegram_bot_state` solo para sesiones temporales de n8n.
- Al iniciar `/start`, el bot debe mostrar aviso de privacidad.
- Si el cliente acepta, debe pedir compartir telefono, validar contra `clientes` y guardar la suscripcion como `accepted`.
- Si el cliente rechaza, debe guardar `rejected` y no enviar menu.
- Si el estado esta `rejected`, no se vuelve a insistir hasta que un administrador lo cambie en base de datos a `pending`.
- El envio diario o manual de menu solo debe incluir clientes activos, suscripcion aceptada, suscripcion activa y `chat_id` presente.
- El onboarding se hara con link o QR del bot para que el cliente inicie `/start`.

## Ajustes en n8n

- Actualizar `Procesar eleccion y reservar` para manejar `/start`, `consent:accept`, `consent:reject`, contacto/telefono y estados rechazados.
- Actualizar `Preparar foto y sesiones` para leer `telegram_subscriptions` en vez de `telegram_bot_state phone:*`.
- Mantener `Telegram - enviar foto menu` y `Telegram - responder`, agregando soporte para teclado de compartir contacto.

## Pruebas de aceptacion

- Cliente nuevo sin `chatId`: no recibe menu automatico; al entrar por link/QR y enviar `/start`, recibe consentimiento.
- Cliente que acepta: comparte telefono, queda vinculado y recibe menu en el siguiente envio manual o diario.
- Cliente que rechaza: queda en `rejected`, no recibe menu ni recordatorios, y `/start` no insiste hasta reset administrativo.
- Cliente activo con consentimiento aceptado: recibe menu, puede reservar con botones y se crea orden Telegram en Supabase.
- Cliente inactivo: no recibe menu aunque tenga consentimiento aceptado.
- Cliente `+593 99 831 3804`: debe vincularse primero por link/QR; despues de aceptar debe aparecer en `telegram_subscriptions` con `accepted` y `chat_id`.

## Supuestos

- Se usa tabla separada para consentimiento.
- El rechazo solo se revierte por admin o base de datos.
- El onboarding sera por link o QR del bot.
- No se enviaran mensajes reales de prueba a clientes sin autorizacion explicita.
