const express = require('express');
const router = express.Router();
const pool = require('../databases/db');
const puntosController = require('../controllers/puntosController');
const hotelController = require('../controllers/hotelController');
const { isAdmin, isAuthenticated } = require('../middleware/auth');

// Middleware para este router
router.use(isAuthenticated, isAdmin);

// Rutas para gestión de puntos
router.get('/puntos', async (req, res) => {
    try {
        // Obtener estadísticas
        const [totalUsuarios] = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        const [totalPuntos] = await pool.query('SELECT SUM(puntos_totales) as total FROM puntos_usuario');
        const [puntosRedimidos] = await pool.query(
            'SELECT SUM(puntos) as total FROM historial_puntos WHERE tipo_operacion = "redimido"'
        );

        // Obtener usuarios con sus puntos, excluyendo administradores
        const [usuarios] = await pool.query(
            `SELECT 
                u.id AS usuario_id, 
                u.nombre, 
                u.rol, 
                pu.puntos_totales, 
                pu.puntos_disponibles,
                (SELECT MAX(fecha) FROM historial_puntos WHERE usuario_id = u.id) AS fecha_ultima_actualizacion,
                nu.nombre AS nivel_nombre
             FROM usuarios u
             LEFT JOIN puntos_usuario pu ON u.id = pu.usuario_id
             LEFT JOIN niveles_usuario nu ON pu.nivel_id = nu.id
             WHERE u.rol = 'usuario'
             ORDER BY u.nombre`
        );

        res.render('admin/puntos', {
            user: req.session.user,
            usuarios,
            totalUsuarios: totalUsuarios[0].total,
            totalPuntos: totalPuntos[0].total || 0,
            puntosRedimidos: puntosRedimidos[0].total || 0,
            path: '/admin/puntos'
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
    const { usuario_id, puntos, descripcion } = req.body;
    try {
        await puntosController.agregarPuntosManualmente(usuario_id, puntos, descripcion);
        req.flash('success', 'Puntos agregados correctamente.');
        res.redirect('/admin/puntos');
    } catch (error) {
        console.error('Error al agregar puntos:', error);
        req.flash('error', 'Error al agregar los puntos.');
        res.redirect(req.header('Referer') || '/admin/users');
    }
});

router.get('/puntos/historial/:usuarioId', async (req, res) => {
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
            historial,
            path: '/admin/puntos'
        });
    } catch (error) {
        console.error('Error al cargar historial de puntos:', error);
        res.status(500).render('error', {
            message: 'Error al cargar historial de puntos',
            user: req.session.user
        });
    }
});

// Nueva ruta para ver las reservas de un usuario específico
router.get('/user-bookings/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Obtener nombre del usuario
        const [userResult] = await pool.query(
            'SELECT nombre FROM usuarios WHERE id = ?',
            [userId]
        );

        if (userResult.length === 0) {
            return res.status(404).render('error', {
                message: 'Usuario no encontrado',
                user: req.session.user
            });
        }
        const userName = userResult[0].nombre;

        // Obtener reservas de hotel del usuario
        const [hotelBookings] = await pool.query(
            `SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo
             FROM reservas_hotel r
             JOIN hoteles h ON r.hotel_id = h.id
             JOIN habitaciones hab ON r.habitacion_id = hab.id
             WHERE r.usuario_id = ? AND r.estado IN ('abonada', 'finalizada')`,
            [userId]
        );

        // Obtener reservas de restaurante del usuario
        const [restaurantBookings] = await pool.query(
            'SELECT * FROM reservas_restaurante WHERE usuario_id = ? AND estado = \'activa\'',
            [userId]
        );

        res.render('admin/user-bookings', {
            user: req.session.user,
            userName,
            hotelBookings,
            restaurantBookings,
            error: null
        });

    } catch (error) {
        console.error('Error al obtener reservas del usuario:', error);
        res.status(500).render('error', {
            message: 'Error al cargar las reservas del usuario',
            user: req.session.user
        });
    }
});

// Rutas para la gestión de recompensas
router.get('/recompensas', async (req, res) => {
    try {
        const [recompensas] = await pool.query('SELECT * FROM recompensas');
        res.render('admin/recompensas', {
            user: req.session.user,
            recompensas,
            messages: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error al cargar recompensas:', error);
        res.status(500).render('error', {
            message: 'Error al cargar recompensas',
            user: req.session.user
        });
    }
});

router.post('/recompensas/add', async (req, res) => {
    try {
        const { nombre, descripcion, tipo, puntos_requeridos, valor_descuento, codigo, fecha_inicio, fecha_fin, stock } = req.body;

        // Validar campos requeridos
        if (!nombre || !tipo || !puntos_requeridos) {
            req.flash('error', 'Todos los campos obligatorios deben ser llenados.');
            return res.redirect('/admin/recompensas');
        }

        // Validar puntos_requeridos como número
        const parsedPuntos = parseInt(puntos_requeridos);
        if (isNaN(parsedPuntos) || parsedPuntos <= 0) {
            req.flash('error', 'Puntos requeridos debe ser un número positivo.');
            return res.redirect('/admin/recompensas');
        }

        // Validar valor_descuento si el tipo es de descuento
        let parsedValorDescuento = null;
        if (tipo.includes('descuento')) {
            parsedValorDescuento = parseFloat(valor_descuento);
            if (isNaN(parsedValorDescuento) || parsedValorDescuento <= 0) {
                req.flash('error', 'Valor de descuento debe ser un número positivo.');
                return res.redirect('/admin/recompensas');
            }
        }

        // Validar stock si es un número
        const parsedStock = stock ? parseInt(stock) : null;
        if (stock && (isNaN(parsedStock) || parsedStock < 0)) {
            req.flash('error', 'Stock debe ser un número válido.');
            return res.redirect('/admin/recompensas');
        }

        // Convertir fechas a formato SQL si existen
        const sqlFechaInicio = fecha_inicio || null;
        const sqlFechaFin = fecha_fin || null;

        const query = `
            INSERT INTO recompensas (
                nombre, descripcion, tipo, puntos_requeridos, valor_descuento,
                codigo, fecha_inicio, fecha_fin, estado, stock, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            nombre, descripcion || null, tipo, parsedPuntos, parsedValorDescuento,
            codigo || null, sqlFechaInicio, sqlFechaFin, 'activo', parsedStock,
            req.session.user.id
        ];

        await pool.query(query, values);
        req.flash('success', 'Recompensa agregada exitosamente!');
        res.redirect('/admin/recompensas');
    } catch (error) {
        console.error('Error al agregar recompensa:', error);
        req.flash('error', `Error al agregar recompensa: ${error.message}`);
        res.redirect('/admin/recompensas');
    }
});

router.post('/recompensas/toggle/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [recompensa] = await pool.query('SELECT estado FROM recompensas WHERE id = ?', [id]);

        if (recompensa.length > 0) {
            const nuevoEstado = recompensa[0].estado === 'activa' ? 'inactiva' : 'activa';
            await pool.query('UPDATE recompensas SET estado = ? WHERE id = ?', [nuevoEstado, id]);
            req.flash('success_msg', 'Estado de la recompensa actualizado correctamente.');
        } else {
            req.flash('error_msg', 'No se encontró la recompensa.');
        }
    } catch (error) {
        console.error("Error al cambiar estado de la recompensa:", error);
        req.flash('error_msg', 'Error al actualizar el estado.');
    }
    res.redirect('/admin/recompensas');
});

// Ruta para mostrar el formulario de edición de recompensa
router.get('/recompensas/edit/:id', async (req, res) => {
    try {
        const recompensaId = req.params.id;
        const [recompensa] = await pool.query('SELECT * FROM recompensas WHERE id = ?', [recompensaId]);

        if (recompensa.length === 0) {
            req.flash('error', 'Recompensa no encontrada.');
            return res.redirect('/admin/recompensas');
        }

        res.render('admin/edit-recompensa', {
            user: req.session.user,
            recompensa: recompensa[0],
            messages: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error al cargar la recompensa para edición:', error);
        req.flash('error', `Error al cargar la recompensa: ${error.message}`);
        res.redirect('/admin/recompensas');
    }
});

// Ruta para manejar la actualización de la recompensa
router.post('/recompensas/edit/:id', async (req, res) => {
    const recompensaId = req.params.id; // Asegurarse de que esté definida
    try {
        const { nombre, descripcion, tipo, puntos_requeridos, valor_descuento, codigo, fecha_inicio, fecha_fin, stock, estado } = req.body;

        // Validaciones (similar a la adición)
        if (!nombre || !tipo || !puntos_requeridos || !estado) {
            req.flash('error', 'Todos los campos obligatorios deben ser llenados.');
            return res.redirect(`/admin/recompensas/edit/${recompensaId}`);
        }

        const parsedPuntos = parseInt(puntos_requeridos);
        if (isNaN(parsedPuntos) || parsedPuntos <= 0) {
            req.flash('error', 'Puntos requeridos debe ser un número positivo.');
            return res.redirect(`/admin/recompensas/edit/${recompensaId}`);
        }

        let parsedValorDescuento = null;
        if (tipo.includes('descuento')) {
            parsedValorDescuento = parseFloat(valor_descuento);
            if (isNaN(parsedValorDescuento) || parsedValorDescuento <= 0) {
                req.flash('error', 'Valor de descuento debe ser un número positivo.');
                return res.redirect(`/admin/recompensas/edit/${recompensaId}`);
            }
        }

        const parsedStock = stock ? parseInt(stock) : null;
        if (stock && (isNaN(parsedStock) || parsedStock < 0)) {
            req.flash('error', 'Stock debe ser un número válido.');
            return res.redirect(`/admin/recompensas/edit/${recompensaId}`);
        }

        const sqlFechaInicio = fecha_inicio || null;
        const sqlFechaFin = fecha_fin || null;

        const query = `
            UPDATE recompensas SET
            nombre = ?, descripcion = ?, tipo = ?, puntos_requeridos = ?, valor_descuento = ?,
            codigo = ?, fecha_inicio = ?, fecha_fin = ?, estado = ?, stock = ?
            WHERE id = ?
        `;
        const values = [
            nombre, descripcion || null, tipo, parsedPuntos, parsedValorDescuento,
            codigo || null, sqlFechaInicio, sqlFechaFin, estado, parsedStock,
            recompensaId
        ];

        await pool.query(query, values);
        req.flash('success', 'Recompensa actualizada exitosamente!');
        res.redirect('/admin/recompensas');
    } catch (error) {
        console.error('Error al actualizar recompensa:', error);
        req.flash('error', `Error al actualizar recompensa: ${error.message}`);
        res.redirect(`/admin/recompensas/edit/${recompensaId}`);
    }
});

// GET para mostrar la lista de restaurantes en el admin
router.get('/restaurants', async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes ORDER BY created_at DESC');
        res.render('admin/restaurants', {
            user: req.session.user,
            restaurants,
            error: null,
            success: req.flash('success')
        });
    } catch (error) {
        console.error("Error al cargar restaurantes en admin:", error);
        res.render('admin/restaurants', {
            user: req.session.user,
            restaurants: [],
            error: 'Error al cargar los restaurantes.',
            success: null
        });
    }
});

// GET para mostrar el formulario de edición de un restaurante
router.get('/restaurants/edit/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [restaurantResult] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [id]);

        if (restaurantResult.length === 0) {
            req.flash('error', 'Restaurante no encontrado.');
            return res.redirect('/admin/restaurants');
        }

        const [mesasResult] = await pool.query('SELECT * FROM mesas WHERE restaurante_id = ? ORDER BY numero_mesa ASC', [id]);

        res.render('admin/restaurants/edit', {
            restaurant: restaurantResult[0],
            mesas: mesasResult,
            user: req.session.user,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error("Error al cargar la página de edición del restaurante:", error);
        req.flash('error', 'Error al cargar la página de edición.');
        res.redirect('/admin/restaurants');
    }
});

// POST para actualizar un restaurante
router.post('/restaurants/edit/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, direccion, ciudad } = req.body;
        await pool.query(
            'UPDATE restaurantes SET nombre = ?, descripcion = ?, direccion = ?, ciudad = ? WHERE id = ?',
            [nombre, descripcion, direccion, ciudad, id]
        );
        req.flash('success', 'Restaurante actualizado con éxito.');
        res.redirect(`/admin/restaurants/edit/${id}`);
    } catch (error) {
        console.error("Error al actualizar el restaurante:", error);
        req.flash('error', 'Error al actualizar el restaurante.');
        res.redirect(`/admin/restaurants/edit/${id}`);
    }
});

// POST para añadir una nueva mesa a un restaurante
router.post('/restaurants/:id/mesas', async (req, res) => {
    const restaurantId = req.params.id;
    try {
        const { numero_mesa, capacidad } = req.body;

        await pool.query(
            'INSERT INTO mesas (restaurante_id, numero_mesa, capacidad) VALUES (?, ?, ?)',
            [restaurantId, numero_mesa, capacidad]
        );
        req.flash('success', 'Mesa agregada con éxito.');
    } catch (error) {
        console.error("Error al añadir mesa:", error);
        req.flash('error', 'Error al añadir la mesa. El número de mesa puede que ya exista.');
    }
    res.redirect(`/admin/restaurants/edit/${restaurantId}`);
});

// POST para eliminar una mesa (usando POST para simplicidad con forms)
router.post('/mesas/delete/:id', async (req, res) => {
    let restaurantId;
    try {
        const { id } = req.params;
        const [mesaResult] = await pool.query('SELECT restaurante_id FROM mesas WHERE id = ?', [id]);
        
        if (mesaResult.length > 0) {
            restaurantId = mesaResult[0].restaurante_id;
            await pool.query('DELETE FROM mesas WHERE id = ?', [id]);
            req.flash('success', 'Mesa eliminada con éxito.');
            res.redirect(`/admin/restaurants/edit/${restaurantId}`);
        } else {
            req.flash('error', 'No se encontró la mesa a eliminar.');
            res.redirect('/admin/restaurants');
        }
    } catch (error) {
        console.error("Error al eliminar la mesa:", error);
        req.flash('error', 'Error al eliminar la mesa.');
        if (restaurantId) {
            res.redirect(`/admin/restaurants/edit/${restaurantId}`);
        } else {
            res.redirect('/admin/restaurants');
        }
    }
});

// POST para activar/inactivar un restaurante
router.post('/restaurants/toggle/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Obtener el estado actual
        const [result] = await pool.query('SELECT estado FROM restaurantes WHERE id = ?', [id]);
        if (result.length === 0) {
            req.flash('error', 'Restaurante no encontrado.');
            return res.redirect('/admin/restaurants');
        }
        const estadoActual = result[0].estado;
        const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
        await pool.query('UPDATE restaurantes SET estado = ? WHERE id = ?', [nuevoEstado, id]);
        req.flash('success', `Restaurante ${nuevoEstado === 'activo' ? 'activado' : 'inactivado'} correctamente.`);
    } catch (error) {
        console.error('Error al cambiar el estado del restaurante:', error);
        req.flash('error', 'Error al cambiar el estado del restaurante.');
    }
    res.redirect('/admin/restaurants');
});

// Ruta para la gestión de hoteles
router.get('/hotels', async (req, res) => {
    try {
        const [hotels] = await pool.query(
            'SELECT id, nombre, ciudad, estado, imagen_principal, categoria_id FROM hoteles'
        );
        console.log('Hoteles recuperados:', hotels);
        res.render('admin/hotels', { 
            user: req.session.user,
            hotels,
            path: '/admin/hotels'
        });
    } catch (error) {
        console.error('Error fetching hotels for admin:', error);
        res.status(500).render('error', { 
            message: 'Error al cargar los hoteles.',
            user: req.session.user 
        });
    }
});

// POST para activar/inactivar un hotel
router.post('/hotels/toggle-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('SELECT estado FROM hoteles WHERE id = ?', [id]);
        
        if (result.length === 0) {
            req.flash('error', 'Hotel no encontrado.');
            return res.redirect('/admin/hotels');
        }

        const estadoActual = result[0].estado;
        const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
        
        await pool.query('UPDATE hoteles SET estado = ? WHERE id = ?', [nuevoEstado, id]);
        
        req.flash('success', `El estado del hotel ha sido cambiado a ${nuevoEstado}.`);
    } catch (error) {
        console.error('Error al cambiar el estado del hotel:', error);
        req.flash('error', 'Error al cambiar el estado del hotel.');
    }
    res.redirect('/admin/hotels');
});

// Ruta para mostrar el formulario de edición de un hotel
router.get('/hotels/:id/edit', hotelController.edit);

module.exports = router; 