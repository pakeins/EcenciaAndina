const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config();
const cors = require('cors');
const { getAdminClient } = require('./src/config/supabase'); // ConfiguraciÃƒÂ³n de Supabase
const authRoutes = require('./src/routes/auth'); // Importamos las nuevas rutas de login
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

const checkDatabaseConnection = async (createClient = getAdminClient) => {
  const { error } = await createClient().from('empleados').select('id').limit(1);
  if (error) throw error;
};

// --- MIDDLEWARES ---
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origen no permitido por CORS'));
    },
  })
);
app.use(express.json({ limit: '15mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
});

const telegramLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.TELEGRAM_WEBHOOK_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
});

// Servir archivos estÃƒÂ¡ticos de convenios
// --- RUTAS ---

// 1. Ruta base de prueba
app.get('/', (req, res) => {
  res.send('Backend funcionando Ã°Å¸Å¡â‚¬ (Migrado a Supabase)');
});

// 2. Ruta para verificar la base de datos (Supabase)
app.get('/api/check-db', async (req, res) => {
  try {
    await checkDatabaseConnection();

    res.json({
      mensaje: 'Backend y Supabase conectados exitosamente',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error conectando a Supabase',
      ...(process.env.NODE_ENV === 'production' ? {} : { detalle: error.message }),
    });
  }
});

// 3. ConexiÃƒÂ³n de las Rutas de la API
// Esto significa que todas las rutas empezarÃƒÂ¡n con /api/...
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/telegram', telegramLimiter, require('./src/routes/telegram'));
app.use('/api/productos', require('./src/routes/productos'));
app.use('/api/clientes', require('./src/routes/clientes'));
app.use('/api/ordenes', require('./src/routes/ordenes'));
app.use('/api/reportes', require('./src/routes/reportes'));
app.use('/api/convenios', require('./src/routes/convenios'));
app.use('/api/empleados', require('./src/routes/empleados'));
app.use('/api/categorias', require('./src/routes/categorias'));
app.use('/api/alimentos', require('./src/routes/alimentos'));
app.use('/api/menu', require('./src/routes/menu'));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error?.message === 'Origen no permitido por CORS') {
    res.status(403).json({ error: 'Origen no permitido por CORS' });
    return;
  }

  const status = Number(error?.status || error?.statusCode || 500);
  if (status >= 500) {
    console.error('Error no controlado:', error);
  }

  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'Error interno del servidor' : error.message,
  });
});

if (require.main === module) {
  // --- INICIO DEL SERVIDOR ---
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Rutas de autenticacion listas en http://localhost:${PORT}/api/auth/login`);
  });

  process.on('SIGINT', () => {
    console.log('\nRecibido SIGINT. Cerrando servidor de forma limpia...');
    server.close(() => {
      console.log('Servidor cerrado correctamente.');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\nRecibido SIGTERM. Cerrando servidor...');
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = app;
module.exports._private = {
  checkDatabaseConnection,
};
