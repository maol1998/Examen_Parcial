import mongoose from 'mongoose';
import { conectarAMongoDB } from '../db/cnn_mongodb.js';

/**
 * Middleware para verificar que el cuerpo de la petición (req.body) no esté vacío
 * en operaciones POST y PUT. Retorna 400 Bad Request si faltan datos.
 */
export const validarBodyNoVacio = (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
        return res.status(400).json({
            ok: false,
            msg: 'El cuerpo de la petición no puede estar vacío. Debe enviar los datos del lote en formato JSON.'
        });
    }
    next();
};

/**
 * Middleware para verificar que la conexión con MongoDB esté activa
 * antes de procesar consultas a la base de datos.
 */
export const verificarConexionDB = async (req, res, next) => {
    if (mongoose.connection.readyState === 1) {
        return next();
    }

    try {
        await conectarAMongoDB();
        if (mongoose.connection.readyState === 1) {
            return next();
        }
    } catch {
        // Error ya registrado en conectarAMongoDB
    }

    return res.status(503).json({
        ok: false,
        msg: 'Servicio temporalmente no disponible: sin conexión activa a MongoDB.'
    });
};

/**
 * Middleware manejador de errores de sintaxis JSON en el body.
 * Retorna 400 Bad Request en lugar de una traza HTML.
 */
export const manejarErrorJSON = (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            ok: false,
            msg: 'JSON mal formado en el cuerpo de la petición.',
            error: err.message
        });
    }
    next(err);
};
