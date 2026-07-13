const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const clientesController = require('../controllers/clientesController');
const clientesService = require('../services/clientesService');

router.use(authMiddleware);
router.use(roleMiddleware(['administrador', 'caja']));
const adminOnly = roleMiddleware(['administrador']);

router.get('/', clientesController.getAll);
router.get('/tipos', clientesController.getTipos);
router.get('/telegram/privacidad-solicitudes', adminOnly, clientesController.getPrivacyRequests);
router.patch('/telegram/privacidad-solicitudes/:requestId', adminOnly, clientesController.resolvePrivacyRequest);
router.delete('/:id/convenio', adminOnly, clientesController.removeConvenio);
router.post('/', clientesController.create);
router.post('/:id/telegram/invitacion', adminOnly, clientesController.reinviteTelegram);
router.post('/:id/telegram/revocar', adminOnly, clientesController.revokeTelegram);
router.put('/:id', clientesController.update);
router.get('/:id/saldo', clientesController.getSaldo);
router.post('/:id/recargar', clientesController.recargar);
router.get('/:id/historial', clientesController.getHistorial);
router.delete('/:id', clientesController.remove);
router.delete('/:id/hard-delete', adminOnly, clientesController.hardDelete);

module.exports = router;
module.exports._private = { ...clientesService };
