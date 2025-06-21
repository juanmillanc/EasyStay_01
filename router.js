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
            `SELECT rr.*, r.nombre as restaurante_nombre, m.numero_mesa,
                (SELECT COUNT(*) FROM resenas_restaurante res WHERE res.reserva_id = rr.id AND res.usuario_id = ?) AS ya_califico
             FROM reservas_restaurante rr
             JOIN restaurantes r ON rr.restaurante_id = r.id
             LEFT JOIN mesas m ON rr.mesa_id = m.id
             WHERE rr.usuario_id = ?`,
            [req.session.user.id, req.session.user.id]
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
        const [restaurants] = await pool.query("SELECT * FROM restaurantes WHERE estado = 'activo'");
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
    const horaPreferida = req.query.hora;
    const personas = parseInt(req.query.num_comensales, 10);
    const reservaId = req.query.reserva_id ? parseInt(req.query.reserva_id, 10) : null;

    if (!restauranteId || !fecha || !horaPreferida || !personas) {
        return res.status(400).json({ error: 'Faltan parámetros de consulta.' });
    }

    const horariosDisponibles = ['12:00:00', '14:00:00', '16:00:00', '18:00:00', '20:00:00', '22:00:00'];

    try {
        const findAvailableTables = async (hora, exactCapacityOnly = false, date) => {
            const searchDate = date || fecha;
            let query = `
                SELECT m.id, m.numero_mesa, m.capacidad
                FROM mesas m
                WHERE m.restaurante_id = ? AND m.capacidad ${exactCapacityOnly ? '=' : '>='} ?
                AND m.id NOT IN (
                    SELECT rr.mesa_id FROM reservas_restaurante rr
                    WHERE rr.restaurante_id = ? AND rr.fecha = ? AND rr.hora = ?
            `;
            const params = [restauranteId, personas, restauranteId, searchDate, hora];

            if (reservaId) {
                query += ` AND rr.id != ?`;
                params.push(reservaId);
            }

            query += `) ORDER BY m.capacidad ASC`;
            
            const [mesas] = await pool.query(query, params);
            return mesas;
        };

        // 1. Buscar mesas con capacidad exacta a la hora preferida.
        let mesas = await findAvailableTables(horaPreferida, true, fecha);
        
        const alternativas = {};
        
        // 2. Si no hay mesas con capacidad exacta, buscar alternativas para esa misma capacidad.
        if (mesas.length === 0) {
            // NOTA: Usar la fecha UTC del servidor puede causar problemas de zona horaria.
            // Se usa para evitar buscar en fechas pasadas.
            const hoy_utc = new Date().toISOString().split('T')[0];

            for (let i = -1; i <= 1; i++) { // Buscar 1 día antes, el día seleccionado y 1 día después.
                const tempDate = new Date(fecha + 'T00:00:00');
                tempDate.setUTCDate(tempDate.getUTCDate() + i);
                const searchDateStr = tempDate.toISOString().split('T')[0];

                // No buscar en fechas pasadas.
                if (searchDateStr < hoy_utc) {
                    continue;
                }

                for (const hora of horariosDisponibles) {
                    // Evitar buscar en la misma fecha y hora que ya falló.
                    if (searchDateStr === fecha && hora === horaPreferida) {
                        continue;
                    }

                    const mesasEnHorario = await findAvailableTables(hora, true, searchDateStr);
                    
                    if (mesasEnHorario.length > 0) {
                        if (!alternativas[searchDateStr]) {
                            alternativas[searchDateStr] = {};
                        }
                        alternativas[searchDateStr][hora] = mesasEnHorario;
                    }
                }
            }
        }
        
        res.json({
            mesas: mesas,
            alternativas: alternativas
        });

    } catch (error) {
        console.error('Error al consultar mesas disponibles:', error);
        res.status(500).json({ error: 'Error interno del servidor al consultar la disponibilidad.' });
    }
});

// Ruta para procesar la reserva de un restaurante
router.post('/restaurantes/:id/reservar', isAuthenticated, async (req, res) => {
    try {
        const restauranteId = req.params.id;
        const { fecha, hora, num_comensales, observaciones, mesa_seleccionada, nombre_reclamo } = req.body;
        const usuarioId = req.session.user.id;

        console.log('--- Nueva Reserva de Restaurante ---');
        console.log('Restaurante ID:', restauranteId);
        console.log('Usuario ID:', usuarioId);
        console.log('Datos del Body:', req.body);
        console.log('------------------------------------');

        if (!mesa_seleccionada) {
            req.flash('error', 'No se seleccionó ninguna mesa.');
            return res.redirect(`/restaurantes/${restauranteId}`);
        }

        const insertQuery = `
            INSERT INTO reservas_restaurante (usuario_id, restaurante_id, mesa_id, fecha, hora, num_personas, numero_personas, nombre_reclamo, notas, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada')
        `;
        
        const queryParams = [usuarioId, restauranteId, mesa_seleccionada, fecha, hora, num_comensales, num_comensales, nombre_reclamo, observaciones];
        console.log('Ejecutando Query:', insertQuery);
        console.log('Con Parámetros:', queryParams);

        await pool.query(insertQuery, queryParams);

        console.log('¡Reserva realizada con éxito!');
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
        console.log('ID del restaurante en la URL:', id);
        const [debugResenas] = await pool.query('SELECT * FROM resenas_restaurante');
        console.log('TODAS LAS RESEÑAS EN BD:', debugResenas);
        const [restaurant] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [id]);

        if (restaurant.length === 0) {
            return res.status(404).send('Restaurante no encontrado');
        }
        // Obtener reseñas del restaurante
        const [reviews] = await pool.query(
            `SELECT rr.puntuacion, rr.comentario, rr.fecha_creacion, u.nombre, rr.estado
             FROM resenas_restaurante rr
             LEFT JOIN usuarios u ON rr.usuario_id = u.id
             WHERE rr.restaurante_id = ?
             ORDER BY rr.fecha_creacion DESC`,
            [id]
        );
        console.log('RESEÑAS ENCONTRADAS:', reviews);
        // Si el usuario no está logueado, lo mandamos a la vista pero sin user
        if (!req.session.user) {
             return res.render('restaurants/detail', {
                user: null,
                restaurant: restaurant[0],
                reviews,
                error: null,
                success: null
            });
        }
        req.session.returnTo = req.originalUrl;
        // Si está logueado, pasamos el user
        res.render('restaurants/detail', {
            user: req.session.user,
            restaurant: restaurant[0],
            reviews,
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