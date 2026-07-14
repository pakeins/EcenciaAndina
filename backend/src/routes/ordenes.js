const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ordenesController = require('../controllers/ordenesController');
const ordenesService = require('../services/ordenesService');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));

router.post('/', ordenesController.crearOrden);
router.get('/telegram/trazabilidad', ordenesController.getTelegramTrazabilidad);
router.get('/', ordenesController.getOrdenes);
router.put('/:id', ordenesController.actualizarOrdenCompleta);
router.put('/:id/estado', ordenesController.actualizarEstadoOrden);

module.exports = router;
module.exports._private = { ...ordenesService };
