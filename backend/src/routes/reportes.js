const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const reportesController = require('../controllers/reportesController');
const reportesService = require('../services/reportesService');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

router.get('/dashboard', reportesController.getDashboard);
router.get('/telegram-kpis', reportesController.getTelegramKpis);

const validateDates = (req, res, next) => {
  const { fecha_inicio, fecha_fin } = req.query;
  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias.' });
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fecha_inicio) || !dateRegex.test(fecha_fin)) {
    return res.status(400).json({ error: 'El formato de las fechas debe ser YYYY-MM-DD.' });
  }
  if (new Date(fecha_fin) < new Date(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
  }
  next();
};

router.use(validateDates);

router.get('/ventas', reportesController.getVentas);
router.get('/estados', reportesController.getEstados);
router.get('/productos', reportesController.getProductos);
router.get('/clientes', reportesController.getClientes);

module.exports = router;
module.exports._private = { ...reportesService };
