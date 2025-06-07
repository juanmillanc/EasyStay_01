const express = require('express');
const router = express.Router();
const pool = require('../databases/db');
const puntosController = require('../controllers/puntosController');
const { isAdmin } = require('../middleware/auth');

// Rutas para gestión de puntos
router.get('/puntos', isAdmin, async (req, res) => {
    try {
        // Obtener estadísticas
        const [totalUsuarios] = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        const [totalPuntos] = await pool.query('SELECT SUM(puntos_totales) as total FROM puntos_usuario');
        const [puntosRedimidos] = await pool.query(
            'SELECT SUM(puntos) as total FROM historial_puntos WHERE tipo = "redimido"'
        );

        // Obtener usuarios con sus puntos
        const [usuarios] = await pool.query(
            `SELECT u.id as usuario_id, u.nombre, pu.*, nu.nombre as nivel_nombre
             FROM usuarios u
             LEFT JOIN puntos_usuario pu ON u.id = pu.usuario_id
             LEFT JOIN niveles_usuario nu ON pu.nivel_id = nu.id
             ORDER BY u.nombre`
        );

        res.render('admin/puntos', {
            user: req.session.user,
            usuarios,
            totalUsuarios: totalUsuarios[0].total,
            totalPuntos: totalPuntos[0].total || 0,
            puntosRedimidos: puntosRedimidos[0].total || 0
        });
    } catch (error) {
        console.error('Error al cargar página de puntos:', error);
        res.status(500).render('error', {
            message: 'Error al cargar la página de puntos',
            user: req.session.user
        });
    }
});

router.post('/puntos/agregar', isAdmin, async (req, res) => {
    try {
        const { usuario_id, puntos, descripcion } = req.body;
        await puntosController.agregarPuntos(usuario_id, parseInt(puntos), descripcion);
        res.redirect('/admin/puntos');
    } catch (error) {
        console.error('Error al agregar puntos:', error);
        res.status(500).render('error', {
            message: 'Error al agregar puntos',
            user: req.session.user
        });
    }
});

router.get('/puntos/historial/:usuarioId', isAdmin, async (req, res) => {
    try {
        const [usuario] = await pool.query(
            'SELECT nombre FROM usuarios WHERE id = ?',
            [req.params.usuarioId]
        );

        if (!usuario[0]) {
            return res.status(404).render('error', {
                message: 'Usuario no encontrado',
                user: req.session.user
            });
        }

        const historial = await puntosController.getHistorialPuntos(req.params.usuarioId);

        res.render('admin/historial-puntos', {
            user: req.session.user,
            usuario: usuario[0],
            historial
        });
    } catch (error) {
        console.error('Error al cargar historial de puntos:', error);
        res.status(500).render('error', {
            message: 'Error al cargar historial de puntos',
            user: req.session.user
        });
    }
});

module.exports = router; 