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

// Rutas para reservas de restaurante
router.get('/restaurante/reserva/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [results] = await pool.query(
            'SELECT * FROM reservas_restaurante WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.user.id]
        );
        
        if (!results || results.length === 0) {
            req.flash('error', 'Reserva no encontrada');
            return res.redirect('/bookings');
        }
        
        res.render('restaurantes/edit-reserva', {
            reserva: results[0],
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar la reserva:', error);
        req.flash('error', 'Error al cargar la reserva');
        res.redirect('/bookings');
    }
});

router.post('/restaurante/reserva/update/:id', isAuthenticated, async (req, res) => {
    try {
        const { fecha, hora, num_personas, num_mesa, estado, notas } = req.body;
        
        await pool.query(
            `UPDATE reservas_restaurante 
             SET fecha = ?, hora = ?, num_personas = ?, 
                 num_mesa = ?, estado = ?, notas = ?
             WHERE id = ? AND usuario_id = ?`,
            [fecha, hora, num_personas, num_mesa, estado, notas, req.params.id, req.session.user.id]
        );
        
        req.flash('success', 'Reserva actualizada exitosamente');
        res.redirect('/bookings');
    } catch (error) {
        console.error('Error al actualizar la reserva:', error);
        req.flash('error', 'Error al actualizar la reserva');
        res.redirect('/bookings');
    }
});

router.post('/restaurante/reserva/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM reservas_restaurante WHERE id = ? AND usuario_id = ?',
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
            'SELECT * FROM reservas_restaurante WHERE usuario_id = ?',
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

module.exports = router;