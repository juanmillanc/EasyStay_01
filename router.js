const express = require('express');
const router = express.Router();
const crud = require('./controllers/crud');
const pool = require('./databases/db');

// Middleware para verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Middleware para verificar si el usuario es administrador
const isAdmin = (req, res, next) => {
    console.log('Verificando rol de admin/superadmin...');
    if (!req.session.user) {
        console.log('No hay usuario en sesión');
        return res.redirect('/login');
    }
    console.log('Rol del usuario:', req.session.user.rol);
    if (req.session.user.rol !== 'admin' && req.session.user.rol !== 'superadmin') {
        console.log('Acceso denegado: el usuario no es admin ni superadmin');
        return res.status(403).render('error', {
            message: 'Acceso denegado: Solo administradores pueden acceder a esta página',
            user: req.session.user
        });
    }
    console.log('Acceso concedido: usuario es admin o superadmin');
    next();
};

// Rutas CRUD básicas
router.post('/save', crud.save);
router.post('/update', crud.update);

// Rutas para reservas de hotel
router.get('/hotel/reserva/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [results] = await pool.query(
            'SELECT * FROM reservas_hotel WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.user.id]
        );
        
        if (!results || results.length === 0) {
            req.flash('error', 'Reserva no encontrada');
            return res.redirect('/bookings');
        }
        
        res.render('hotels/edit-hotel', {
            reserva: results[0],
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar la reserva:', error);
        req.flash('error', 'Error al cargar la reserva');
        res.redirect('/bookings');
    }
});

router.post('/hotel/reserva/update/:id', isAuthenticated, async (req, res) => {
    try {
        const { check_in, check_out, num_huespedes, tipo_habitacion, estado, comentarios } = req.body;
        
        await pool.query(
            `UPDATE reservas_hotel 
             SET check_in = ?, check_out = ?, num_huespedes = ?, 
                 tipo_habitacion = ?, estado = ?, comentarios = ?
             WHERE id = ? AND usuario_id = ?`,
            [check_in, check_out, num_huespedes, tipo_habitacion, estado, comentarios, req.params.id, req.session.user.id]
        );
        
        req.flash('success', 'Reserva actualizada exitosamente');
        res.redirect('/bookings');
    } catch (error) {
        console.error('Error al actualizar la reserva:', error);
        req.flash('error', 'Error al actualizar la reserva');
        res.redirect('/bookings');
    }
});

router.post('/hotel/reserva/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM reservas_hotel WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.user.id]
        );
        
        req.flash('success', 'Reserva eliminada exitosamente');
        res.redirect('/bookings');
    } catch (error) {
        console.error('Error al eliminar la reserva:', error);
        req.flash('error', 'Error al eliminar la reserva');
        res.redirect('/bookings');
    }
});

// Ruta para "Mis reservas"
router.get('/bookings', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const [hotelBookings] = await pool.query(
            'SELECT * FROM reservas_hotel WHERE usuario_id = ?',
            [req.session.user.id]
        );
        const [restaurantBookings] = await pool.query(
            `SELECT rr.*, r.nombre as restaurante_nombre, m.numero_mesa 
             FROM reservas_restaurante rr
             JOIN restaurantes r ON rr.restaurante_id = r.id
             JOIN mesas m ON rr.mesa_id = m.id
             WHERE rr.usuario_id = ?`,
            [req.session.user.id]
        );
        res.render('bookings', {
            user: req.session.user,
            hotelBookings,
            restaurantBookings,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener reservas:', error);
        res.render('bookings', {
            user: req.session.user,
            hotelBookings: [],
            restaurantBookings: [],
            error: 'Error al cargar reservas'
        });
    }
});

// Ruta para la página de restaurantes
router.get('/restaurantes', async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes');
        res.render('restaurantes', {
            user: req.session.user,
            restaurants: restaurants,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener restaurantes:', error);
        res.render('restaurantes', {
            user: req.session.user,
            restaurants: [],
            error: 'Error al cargar los restaurantes'
        });
    }
});

// API para buscar hoteles por ciudad
router.get('/api/hotels/search', (req, res) => {
    const { ciudad } = req.query;
    
    if (!ciudad) {
        return res.json({ success: false, message: 'Por favor, ingresa una ciudad' });
    }

    const query = `
        SELECT h.*, c.nombre as ciudad_nombre 
        FROM hoteles h 
        INNER JOIN ciudades c ON h.ciudad_id = c.id 
        WHERE c.nombre LIKE ?
    `;

    pool.query(query, [`%${ciudad}%`], (error, results) => {
        if (error) {
            console.error('Error en la búsqueda:', error);
            return res.json({ success: false, message: 'Error al buscar hoteles' });
        }
        
        res.json({
            success: true,
            hotels: results
        });
    });
});

// API para obtener disponibilidad de mesas
router.get('/api/mesas', async (req, res) => {
    const restauranteId = parseInt(req.query.restaurante_id, 10);
    const fecha = req.query.fecha;
    const hora = req.query.hora;
    const personas = parseInt(req.query.personas, 10);

    if (!restauranteId || !fecha || !hora || !personas) {
        return res.status(400).json({ error: 'Faltan parámetros de consulta.' });
    }

    try {
        const query = `
            SELECT m.*
            FROM mesas m
            WHERE m.restaurante_id = ? 
              AND m.capacidad >= ?
              AND m.id NOT IN (
                  SELECT rr.mesa_id
                  FROM reservas_restaurante rr
                  WHERE rr.restaurante_id = ?
                    AND rr.fecha = ?
                    AND rr.hora = ?
              )
        `;
        
        const [mesasDisponibles] = await pool.query(query, [restauranteId, personas, restauranteId, fecha, hora]);
        res.json(mesasDisponibles);
    } catch (error) {
        console.error('Error al consultar mesas disponibles:', error);
        res.status(500).json({ error: 'Error interno del servidor al consultar la disponibilidad.' });
    }
});

// Ruta para procesar la reserva de un restaurante
router.post('/restaurantes/:id/reservar', isAuthenticated, async (req, res) => {
    try {
        const restauranteId = req.params.id;
        const { fecha, hora, personas, notas, mesa_id } = req.body;
        const usuarioId = req.session.user.id;

        if (!mesa_id) {
            req.flash('error', 'No se seleccionó ninguna mesa.');
            return res.redirect(`/restaurantes/${restauranteId}`);
        }

        const insertQuery = `
            INSERT INTO reservas_restaurante (usuario_id, restaurante_id, mesa_id, fecha, hora, num_personas, notas, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmada')
        `;

        await pool.query(insertQuery, [usuarioId, restauranteId, mesa_id, fecha, hora, personas, notas]);

        req.flash('success', '¡Reserva realizada con éxito!');
        res.redirect('/bookings');
    } catch (error) {
        console.error('Error al crear la reserva de restaurante:', error);
        req.flash('error', 'Hubo un error al procesar tu reserva.');
        res.redirect(`/restaurantes/${req.params.id}`);
    }
});

router.get('/restaurantes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [restaurant] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [id]);

        if (restaurant.length === 0) {
            return res.status(404).send('Restaurante no encontrado');
        }
        
        // Si el usuario no está logueado, lo mandamos a la vista pero sin user
        if (!req.session.user) {
             return res.render('reservar-restaurante', {
                user: null,
                restaurant: restaurant[0],
                error: null,
                success: null
            });
        }
        
        req.session.returnTo = req.originalUrl;

        // Si está logueado, pasamos el user
        res.render('reservar-restaurante', {
            user: req.session.user,
            restaurant: restaurant[0],
            error: req.flash('error'),
            success: req.flash('success')
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error en el servidor');
    }
});

// Rutas genéricas al final
router.get('/:page', (req, res) => {
    const page = req.params.page;
    const allowedPages = ['index', 'search', 'about', 'contact', 'perfil', 'editar-perfil'];
    
    // Evita que /:page maneje /restaurantes
    if (page === 'restaurantes') {
        return res.render('error', {
            message: 'Página no encontrada',
            user: req.session.user
        });
    }

    if (allowedPages.includes(page)) {
        res.render(page, {
            user: req.session.user,
            login: req.session.user ? true : false,
            name: req.session.user ? req.session.user.name : '',
            rol: req.session.user ? req.session.user.rol : ''
        });
    } else {
        res.render('error', {
            message: 'Página no encontrada',
            user: req.session.user
        });
    }
});

module.exports = router;