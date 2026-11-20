import { Router } from 'express';
import {
    getAllMariscos,
    getMariscoById,
    createMarisco,
    updateMarisco,
    deleteMarisco,
    seedMariscos
} from '../controllers/mariscos.controller.js';
import {
    validarBodyNoVacio,
    verificarConexionDB
} from '../middleware/validarDatos.js';

const router = Router();

// Verificar conexión activa a MongoDB en todas las rutas del recurso
router.use(verificarConexionDB);

// Endpoint para recargar datos iniciales representativos de Esmeraldas
router.get('/seed', seedMariscos);
router.post('/seed', seedMariscos);

// CRUD completo de lotes de mariscos (/api/mariscos)
router.get('/', getAllMariscos);
router.get('/:id', getMariscoById);
router.post('/', validarBodyNoVacio, createMarisco);
router.put('/:id', validarBodyNoVacio, updateMarisco);
router.delete('/:id', deleteMarisco);

export default router;
