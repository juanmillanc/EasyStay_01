const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../databases/db');
const path = require('path');
const fs = require('fs').promises;
const hotelController = require('../controllers/hotelController');
const transporter = require('../mailer');
const puntosController = require('../controllers/puntosController');
const { stringify } = require('csv-stringify');


// Middleware para verificar si el usuario es administrador
const isAdmin = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'admin' && req.session.user.rol !== 'superadmin')) {
        return res.status(403).send('Acceso denegado: Solo administradores');
    }
    next();
};

// Middleware para verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl; // Guarda la URL a la que el usuario intentaba acceder
        return res.redirect('/login');
    }
    next();
};

// Ruta de login (GET)
router.get('/login', (req, res) => {
    if (req.query.returnTo) {
        req.session.returnTo = req.query.returnTo;
    }
    res.render('index', { loginForm: true });
});


// Ruta principal muestra hoteles y restaurantes
router.get('/', async (req, res) => {
    try {
        const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE estado = "activo"');
        const [restaurantes] = await pool.query('SELECT * FROM restaurantes');
        res.render('search', {
            hoteles,
            restaurantes,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar hoteles y restaurantes:', error);
        res.render('search', {
            hoteles: [],
            restaurantes: [],
            user: req.session.user,
            error: 'Error al cargar hoteles y restaurantes'
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

// Ruta para el registro
router.post('/register', async (req, res) => {
    try {
        console.log('\n=== NUEVO INTENTO DE REGISTRO ===');
        console.log('Datos recibidos del formulario:', {
            nombre: req.body.nombre || 'no proporcionado',
            email: req.body.email || 'no proporcionado',
            telefono: req.body.telefono || 'no proporcionado',
            password: req.body.password ? '********' : 'no proporcionado'
        });

        // Validar que todos los campos requeridos estén presentes
        if (!req.body.nombre || !req.body.email || !req.body.password) {
            console.log('❌ Error: Faltan campos requeridos');
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son obligatorios'
            });
        }

        const { nombre, email, password, telefono } = req.body;

        // Verificar si el email ya existe
        console.log('\nVerificando si el email ya existe...');
        const [existingUser] = await pool.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );

        if (existingUser.length > 0) {
            console.log('❌ Email ya registrado:', email);
            return res.status(400).json({ 
                success: false, 
                message: 'El email ya está registrado' 
            });
        }
        console.log('✅ Email disponible');

        // Encriptar la contraseña
        console.log('\nEncriptando contraseña...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('✅ Contraseña encriptada correctamente');

        // Insertar el nuevo usuario
        console.log('\nInsertando nuevo usuario en la base de datos...');
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre, email, password, telefono, rol) VALUES (?, ?, ?, ?, ?)',
            [nombre, email, hashedPassword, telefono, 'usuario']
        );

        console.log('✅ Usuario registrado exitosamente');
        console.log('ID del nuevo usuario:', result.insertId);
        console.log('=== REGISTRO COMPLETADO ===\n');

        // Enviar correo de activación/bienvenida
        try {
            await transporter.sendMail({
                from: process.env.MAIL_USER || 'easystay.sp@gmail.com',
                to: email,
                subject: '¡Bienvenido a EasyStay! Confirma tu registro',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #ff8c00; padding: 20px; text-align: center;">
                            <h1 style="color: white; margin: 0;">¡Bienvenido a EasyStay!</h1>
                        </div>
                        <div style="padding: 20px;">
                            <p>Hola ${nombre},</p>
                            <p>Gracias por registrarte en EasyStay. Tu cuenta ha sido creada exitosamente.</p>
                            <p>¡Esperamos verte pronto en nuestros hoteles y restaurantes!</p>
                            <p>Saludos cordiales,<br>El equipo de EasyStay</p>
                        </div>
                        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                            <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                            <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                        </div>
                    </div>
                `,
            });
            console.log('✅ Correo de bienvenida enviado a:', email);
        } catch (mailError) {
            console.error('❌ Error al enviar correo de bienvenida:', mailError);
        }

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            userId: result.insertId
        });

    } catch (error) {
        console.error('\n❌ ERROR EN EL REGISTRO:');
        console.error('Mensaje de error:', error.message);
        console.error('Stack trace:', error.stack);
        console.error('=== ERROR DETALLADO ===\n');
        
        res.status(500).json({
            success: false,
            message: 'Error al registrar el usuario',
            error: error.message
        });
    }
});


// Ruta para el inicio de sesión (POST /login)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip_address = req.ip || 'desconocida';
        console.log('Intentando login con email:', email);

        // 1. Buscar usuario usando pool
        const [users] = await pool.query(
            'SELECT * FROM usuarios WHERE LOWER(email) = LOWER(?)', 
            [email]
        );
        console.log('Resultado de búsqueda de usuario:', users);

        if (users.length === 0) {
            console.log('Usuario no encontrado');
            return res.render('index', { 
                error: 'Credenciales incorrectas',
                loginForm: true
            });
        }

        const user = users[0];
        // Validar si el usuario está inactivo
        if (user.estado && user.estado === 'inactivo') {
            console.log('Usuario inactivo, enviando error a la vista');
            return res.render('index', {
                error: 'Tu cuenta está inactiva. Por favor, comunícate con el administrador.',
                loginForm: true
            });
        }
        console.log('Usuario encontrado:', user);

        // 2. Comparar contraseñas
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('¿Contraseña válida?', validPassword);
        
        if (!validPassword) {
            console.log('Contraseña incorrecta para usuario:', user.email);
            return res.render('index', { 
                error: 'Credenciales incorrectas',
                loginForm: true
            });
        }

        // 3. Llamar al procedimiento autenticar_usuario
        try {
            const [authResult] = await pool.query(
                'CALL autenticar_usuario(?, ?, ?)',
                [email, validPassword, ip_address]
            );

            // Configurar la sesión del usuario
            req.session.user = {
                id: user.id,
                email: user.email,
                nombre: user.nombre,
                rol: user.rol
            };

            console.log('Usuario autenticado:', req.session.user); // Para debugging

            // Redirigir según el rol
            const redirectTo = req.session.returnTo || (user.rol === 'admin' || user.rol === 'superadmin' ? '/admin/dashboard' : '/');
            if (req.session.returnTo) {
                console.log(`Redirigiendo a la URL guardada: ${redirectTo}`);
                delete req.session.returnTo; // Limpiar la URL guardada
            } else if (user.rol === 'admin' || user.rol === 'superadmin') {
                console.log('Redirección exitosa: usuario con rol', user.rol, 'redirigido a /admin/dashboard');
            } else {
                console.log('Redirección estándar: usuario con rol', user.rol, 'redirigido a /');
            }
            return res.redirect(redirectTo);
            
        } catch (authError) {
            console.error('Error en autenticación:', authError);
            return res.render('index', {
                error: 'Error al iniciar sesión',
                loginForm: true
            });
        }
    } catch (error) {
        console.error('Error general en login:', error);
        return res.render('index', {
            error: 'Error al iniciar sesión',
            loginForm: true
        });
    }
});

// Ruta para cerrar sesión (GET /logout)
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


// Otras rutas que ya tengas...
router.get('/', (req, res) => { /* ... */ });
router.get('/login', (req, res) => { /* ... */ });

// Ruta para mostrar todos los restaurantes
router.get('/restaurantes', async (req, res) => {
    try {
        const [restaurantes] = await pool.query('SELECT * FROM restaurantes');
        res.render('restaurantes', {
            restaurantes,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar restaurantes:', error);
        res.render('restaurantes', {
            restaurantes: [],
            user: req.session.user,
            error: 'Error al cargar restaurantes'
        });
    }
});

// Ruta para mostrar los detalles de un restaurante específico
router.get('/restaurants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).render('error', { message: 'Página no encontrada', error: { status: 404, stack: 'Restaurante no encontrado' } });
        }
        
        res.render('restaurants/detail', { 
            restaurant: rows[0],
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar detalle del restaurante:', error);
        res.status(500).render('error', { message: 'Error en el servidor', error });
    }
});


router.get('/mi-perfil', isAuthenticated, async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirige si no está autenticado
    }

    try {
        // Consulta a la base de datos para obtener todos los datos del usuario usando await
        const [results] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );

        if (results.length === 0) {
            return res.render('perfil', { error: 'Usuario no encontrado', user: req.session.user });
        }
        const userData = results[0]; // Datos completos del usuario

        // Obtener los puntos del usuario usando await
        let puntosUsuario = null;
        try {
            puntosUsuario = await puntosController.getPuntosUsuario(req.session.user.id);
        } catch (puntosError) {
            console.error('Error al obtener puntos del usuario:', puntosError);
            // Continuamos aunque no podamos obtener los puntos para no bloquear la vista del perfil
        }

        console.log('Renderizando perfil con:', userData, 'Puntos:', puntosUsuario);
        res.render('perfil', { 
            user: userData, 
            error: null, 
            puntos: puntosUsuario // Pasar los puntos a la vista
        });

    } catch (error) {
        console.error('Error general al cargar el perfil:', error);
        res.render('perfil', { error: 'Error al cargar el perfil', user: req.session.user });
    }
});
// Ruta para "Mis reservas"
router.get('/bookings', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const [hotelBookings] = await pool.query(
            `SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo
             FROM reservas_hotel r
             JOIN hoteles h ON r.hotel_id = h.id
             JOIN habitaciones hab ON r.habitacion_id = hab.id
             WHERE r.usuario_id = ? AND r.estado != 'cancelada'`,
            [req.session.user.id]
        );

        const [restaurantBookings] = await pool.query(
            `SELECT rr.*, r.nombre as restaurante_nombre, m.numero_mesa, m.capacidad as mesa_capacidad
             FROM reservas_restaurante rr
             JOIN restaurantes r ON rr.restaurante_id = r.id
             LEFT JOIN mesas m ON rr.mesa_id = m.id
             WHERE rr.usuario_id = ?`,
            [req.session.user.id]
        );
        res.render('bookings', {
            user: req.session.user,
            hotelBookings,
            restaurantBookings,
            error: null,
            messages: req.flash() // Aseguramos que los mensajes flash sean pasados a la vista
        });
    } catch (error) {
        console.error('Error al obtener reservas:', error);
        res.render('bookings', {
            user: req.session.user,
            hotelBookings: [],
            restaurantBookings: [],
            error: 'Error al cargar reservas',
            messages: req.flash() // También pasamos mensajes en caso de error
        });
    }
});

// Ruta para mostrar el formulario de calificación
router.get('/calificar-experiencia/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo } = req.query;

        // Obtener información de la reserva según el tipo
        let reserva;
        if (tipo === 'hotel') {
            const [reservas] = await pool.query(`
                SELECT rh.*, h.nombre as hotel_nombre 
                FROM reservas_hotel rh
                JOIN hoteles h ON rh.hotel_id = h.id
                WHERE rh.id = ? AND rh.usuario_id = ?
            `, [id, req.session.user.id]);

            if (reservas.length === 0) {
                return res.redirect('/bookings');
            }
            reserva = reservas[0];
        } else if (tipo === 'restaurante') {
            const [reservas] = await pool.query(`
                SELECT rr.*, r.nombre as restaurante_nombre 
                FROM reservas_restaurante rr
                JOIN restaurantes r ON rr.restaurante_id = r.id
                WHERE rr.id = ? AND rr.usuario_id = ?
            `, [id, req.session.user.id]);

            if (reservas.length === 0) {
                return res.redirect('/bookings');
            }
            reserva = reservas[0];
        } else {
            return res.redirect('/bookings');
        }

        res.render('calificar-experiencia', {
            reserva,
            tipo,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar formulario de calificación:', error);
        res.redirect('/bookings');
    }
});

// Ruta para procesar la calificación
router.post('/calificar-experiencia', isAuthenticated, async (req, res) => {
    try {
        const { reserva_id, tipo, puntuacion, comentario } = req.body;

        // Validar que la puntuación esté entre 1 y 5
        if (!puntuacion || puntuacion < 1 || puntuacion > 5) {
            return res.render('calificar-experiencia', {
                reserva: { id: reserva_id },
                tipo,
                error: 'La puntuación debe estar entre 1 y 5 estrellas'
            });
        }

        // Validar que el comentario no esté vacío
        if (!comentario || comentario.trim().length === 0) {
            return res.render('calificar-experiencia', {
                reserva: { id: reserva_id },
                tipo,
                error: 'El comentario es obligatorio'
            });
        }

        // Insertar la calificación según el tipo
        if (tipo === 'hotel') {
            await pool.query(`
                INSERT INTO resenas_hotel (usuario_id, hotel_id, reserva_id, puntuacion, comentario, estado)
                SELECT rh.usuario_id, rh.hotel_id, rh.id, ?, ?, 'activa'
                FROM reservas_hotel rh
                WHERE rh.id = ? AND rh.usuario_id = ?
            `, [puntuacion, comentario, reserva_id, req.session.user.id]);

            // Actualizar el promedio de calificación del hotel
            await pool.query(`
                UPDATE hoteles h
                SET calificacion_promedio = (
                    SELECT AVG(puntuacion)
                    FROM resenas_hotel
                    WHERE hotel_id = h.id AND estado = 'activa'
                )
                WHERE h.id = (
                    SELECT hotel_id
                    FROM reservas_hotel
                    WHERE id = ?
                )
            `, [reserva_id]);
        } else if (tipo === 'restaurante') {
            await pool.query(`
                INSERT INTO resenas_restaurante (usuario_id, restaurante_id, reserva_id, puntuacion, comentario, estado)
                SELECT rr.usuario_id, rr.restaurante_id, rr.id, ?, ?, 'activa'
                FROM reservas_restaurante rr
                WHERE rr.id = ? AND rr.usuario_id = ?
            `, [puntuacion, comentario, reserva_id, req.session.user.id]);

            // Actualizar el promedio de calificación del restaurante
            await pool.query(`
                UPDATE restaurantes r
                SET calificacion_promedio = (
                    SELECT AVG(puntuacion)
                    FROM resenas_restaurante
                    WHERE restaurante_id = r.id AND estado = 'activa'
                )
                WHERE r.id = (
                    SELECT restaurante_id
                    FROM reservas_restaurante
                    WHERE id = ?
                )
            `, [reserva_id]);
        }

        res.redirect('/bookings');
    } catch (error) {
        console.error('Error al procesar calificación:', error);
        res.render('calificar-experiencia', {
            reserva: { id: req.body.reserva_id },
            tipo: req.body.tipo,
            error: 'Error al procesar la calificación'
        });
    }
});

// Ruta para el dashboard de administrador
router.get('/admin/dashboard', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/dashboard', {
        user: req.session.user,
        path: '/admin/dashboard'
    });
});

// Ruta para gestionar usuarios (solo admin)
router.get('/admin/users', isAdmin, async (req, res) => {
    const query = 'SELECT * FROM usuarios';
    try {
        const [results] = await pool.query(query);
        res.render('admin/users', { users: results, error: null });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.render('admin/users', { users: [], error: 'Error al cargar usuarios' });
    }
});

// Ruta para mostrar el formulario de edición de usuario
router.get('/admin/users/edit/:id', isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).render('error', { message: 'Usuario no encontrado', user: req.session.user });
        }
        res.render('admin/edit-user', { user: req.session.user, userDetails: users[0], error: null, success: null });
    } catch (error) {
        console.error('Error al cargar formulario de edición de usuario:', error);
        res.status(500).render('error', { message: 'Error al cargar datos del usuario', user: req.session.user });
    }
});

// Ruta para procesar la edición de usuario (cambio de rol)
router.post('/admin/users/edit/:id', isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { nombre, email, rol, confirmacion, justificacion } = req.body;

    try {
        // Obtener datos actuales del usuario
        const [currentUsers] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (currentUsers.length === 0) {
            return res.status(404).render('error', { message: 'Usuario no encontrado', user: req.session.user });
        }
        const currentUser = currentUsers[0];

        // Validar que un superadmin no pueda cambiar su propio rol o el de otro superadmin
        if (currentUser.rol === 'superadmin' && rol !== 'superadmin') {
            return res.status(403).render('admin/edit-user', { 
                user: req.session.user, 
                userDetails: currentUser, 
                error: 'No puedes cambiar el rol de un superadministrador.', 
                success: null 
            });
        }
        if (req.session.user.id == userId && currentUser.rol === 'superadmin' && rol !== 'superadmin') {
             return res.status(403).render('admin/edit-user', { 
                 user: req.session.user, 
                 userDetails: currentUser, 
                 error: 'No puedes cambiar tu propio rol de superadministrador.', 
                 success: null 
             });
         }

        // Validar confirmación
        if (confirmacion !== 'CONFIRMAR') {
            return res.render('admin/edit-user', {
                user: req.session.user,
                userDetails: currentUser,
                error: 'Debes escribir "CONFIRMAR" para guardar los cambios.',
                success: null
            });
        }

        let rolCambiado = false;
        if (currentUser.rol !== rol) {
            rolCambiado = true;
            // Validar justificación si el rol ha cambiado
            if (!justificacion || justificacion.trim() === '') {
                return res.render('admin/edit-user', {
                    user: req.session.user,
                    userDetails: currentUser,
                    error: 'La justificación es obligatoria para cambiar el rol.',
                    success: null
                });
            }
        }

        // Actualizar usuario en la base de datos
        await pool.query(
            'UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?',
            [nombre, rol, userId]
        );

        // Si el rol cambió, registrar en log y notificar
        if (rolCambiado) {
            // Aquí podrías insertar en una tabla de log de auditoría si existiera
            console.log(`[AUDITORÍA] Usuario ${req.session.user.email} (${req.session.user.id}) cambió el rol de ${currentUser.email} (${userId}) de ${currentUser.rol} a ${rol}. Justificación: ${justificacion}`);

            // Enviar notificación por correo electrónico al usuario cuyo rol fue cambiado
            try {
                await transporter.sendMail({
                    from: process.env.MAIL_USER || 'easystay.sp@gmail.com',
                    to: currentUser.email,
                    subject: 'Notificación Importante: Tu Rol en EasyStay ha Cambiado',
                    html: `
                        <h1>Estimado(a) ${currentUser.nombre},</h1>
                        <p>Le informamos que su rol en la plataforma EasyStay ha sido modificado.</p>
                        <p>Su nuevo rol es: <b>${rol.toUpperCase()}</b></p>
                        ${justificacion ? `<p>Motivo del cambio: ${justificacion}</p>` : ''}
                        <p>Si tiene alguna pregunta o considera que esto es un error, por favor, póngase en contacto con el administrador del sistema.</p>
                        <p>Saludos cordiales,<br>El equipo de EasyStay</p>
                    `,
                });
                console.log(`✅ Correo de notificación de cambio de rol enviado a: ${currentUser.email}`);
            } catch (mailError) {
                console.error('❌ Error al enviar correo de notificación de cambio de rol:', mailError);
            }
        }

        // Si el usuario actual edita su propio rol, actualizar la sesión para que vea los cambios
        if (req.session.user.id == userId) {
            req.session.user.rol = rol;
        }
        
        res.render('admin/edit-user', {
            user: req.session.user,
            userDetails: { ...currentUser, nombre, rol }, // Actualizar userDetails con los nuevos datos
            error: null,
            success: 'Usuario actualizado exitosamente!'
        });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        // Si hay un error, recargar la página con los datos actuales y el mensaje de error
        const [currentUsers] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        res.status(500).render('admin/edit-user', { 
            user: req.session.user, 
            userDetails: currentUsers[0], 
            error: `Error al actualizar el usuario: ${error.message}`, 
            success: null 
        });
    }
});

// Ruta para exportar usuarios a CSV
router.get('/admin/users/export-csv', isAdmin, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, nombre, email, rol, estado, fecha_registro, telefono FROM usuarios');
        
        const columns = [
            { key: 'id', header: 'ID' },
            { key: 'nombre', header: 'Nombre' },
            { key: 'email', header: 'Email' },
            { key: 'rol', header: 'Rol' },
            { key: 'estado', header: 'Estado' },
            { key: 'fecha_registro', header: 'Fecha de Registro' },
            { key: 'telefono', header: 'Teléfono' }
        ];

        stringify(users, { header: true, columns: columns }, (err, output) => {
            if (err) {
                console.error('Error al generar CSV:', err);
                return res.status(500).send('Error al generar el reporte CSV');
            }
            res.header('Content-Type', 'text/csv;charset=utf-8');
            res.attachment('usuarios.csv');
            res.send('\uFEFF' + output);
        });

    } catch (error) {
        console.error('Error al obtener usuarios para CSV:', error);
        res.status(500).send('Error al obtener datos de usuarios para el reporte');
    }
});

// Inactivar usuario (no eliminar)
router.post('/admin/users/delete/:id', isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        // No permitir inactivar superadmin
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).render('error', { message: 'Usuario no encontrado', user: req.session.user });
        }
        if (users[0].rol === 'superadmin') {
            return res.status(403).render('error', { message: 'No puedes inactivar un superadmin', user: req.session.user });
        }
        await pool.query('UPDATE usuarios SET estado = ? WHERE id = ?', ['inactivo', userId]);

        // Enviar notificación al usuario por correo electrónico
        try {
            await transporter.sendMail({
                from: process.env.MAIL_USER || 'easystay.sp@gmail.com',
                to: users[0].email,
                subject: 'Notificación Importante: Acceso a EasyStay Suspendido',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #e74c3c; padding: 20px; text-align: center;">
                            <h1 style="color: white; margin: 0;">Acceso a EasyStay Suspendido</h1>
                        </div>
                        <div style="padding: 20px;">
                            <p>Estimado(a) ${users[0].nombre},</p>
                            <p>Le informamos que su cuenta en EasyStay ha sido suspendida temporalmente debido a actividad inusual o sospechosa.</p>
                            <p>Si cree que esto es un error, por favor, póngase en contacto con el soporte técnico de EasyStay para resolver esta situación.</p>
                            <p>Agradecemos su comprensión.</p>
                            <p>Saludos cordiales,<br>El equipo de EasyStay</p>
                        </div>
                        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                            <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                            <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                        </div>
                    </div>
                `,
            });
            console.log(`✅ Correo de notificación de suspensión enviado a: ${users[0].email}`);
        } catch (mailError) {
            console.error('❌ Error al enviar correo de notificación de suspensión:', mailError);
        }

        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error al inactivar usuario:', error);
        res.status(500).render('error', { message: 'Error al inactivar usuario', user: req.session.user });
    }
});

// Activar usuario (no superadmin)
router.post('/admin/users/activate/:id', isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        // No permitir activar superadmin
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).render('error', { message: 'Usuario no encontrado', user: req.session.user });
        }
        if (users[0].rol === 'superadmin') {
            return res.status(403).render('error', { message: 'No puedes activar un superadmin', user: req.session.user });
        }
        await pool.query('UPDATE usuarios SET estado = ? WHERE id = ?', ['activo', userId]);
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error al activar usuario:', error);
        res.status(500).render('error', { message: 'Error al activar usuario', user: req.session.user });
    }
});

// Ruta para gestionar hoteles (solo admin)
router.get('/admin/hotels', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [hotels] = await pool.query('SELECT * FROM hoteles ORDER BY nombre ASC');
        res.render('admin/hotels', {
            hotels,
            user: req.session.user,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener hoteles:', error);
        res.render('admin/hotels', {
            hotels: [],
            user: req.session.user,
            error: 'Error al cargar los hoteles'
        });
    }
});


// Ruta para mostrar el formulario de edición de perfil
router.get('/editar-perfil', isAuthenticated, async (req, res) => {
    try {
        const [userDetails] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.session.user.id]);
        
        if (userDetails.length === 0) {
            req.flash('error', 'No se pudo encontrar tu perfil.');
            return res.redirect('/perfil');
        }

        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: userDetails[0],
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (error) {
        console.error('Error al cargar la página para editar perfil:', error);
        req.flash('error', 'Error al cargar la página de edición.');
        res.redirect('/perfil');
    }
});

// Ruta para actualizar los datos del perfil
router.post('/editar-perfil', isAuthenticated, async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { nombre, telefono } = req.body;

    try {
        await pool.query(
            'UPDATE usuarios SET nombre = ?, telefono = ? WHERE id = ?',
            [nombre, telefono, req.session.user.id]
        );

        // Actualizar datos en la sesión
        req.session.user.nombre = nombre;
        
        // Redirigir al perfil con un mensaje de éxito
        req.flash('success', '¡Perfil actualizado con éxito!');
        return res.redirect('/perfil');
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        // Obtener los datos actualizados del usuario para renderizar
        const [results] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );
        
        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: results[0],
            error: 'Error al actualizar el perfil',
            passwordError: null,      // Mantener consistencia
            passwordSuccess: null   // Mantener consistencia
        });
    }
});

// Ruta para cambiar contraseña
router.post('/cambiar-contrasena', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        // 1. Obtener datos del usuario primero
        const [userDetails] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );

        // 2. Verificar contraseña actual
        const validPassword = await bcrypt.compare(currentPassword, userDetails[0].password);
        if (!validPassword) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'La contraseña actual es incorrecta',
                passwordSuccess: null,
                error: null
            });
        }

        // 3. Validar que las nuevas coincidan
        if (newPassword !== confirmPassword) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'Las nuevas contraseñas no coinciden',
                passwordSuccess: null,
                error: null
            });
        }

        // 4. Validar complejidad de la contraseña
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.render('editar-perfil', {
                user: req.session.user,
                userDetails: userDetails[0],
                success: null,
                passwordError: 'La contraseña debe contener al menos: 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial',
                passwordSuccess: null,
                error: null
            });
        }

        // 5. Actualizar contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        await pool.query(
            'UPDATE usuarios SET password = ? WHERE id = ?',
            [hashedPassword, req.session.user.id]
        );

        // Obtener datos actualizados
        const [updatedUser] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );

        // Redirigir de vuelta con un mensaje de éxito
        req.flash('success', '¡Contraseña cambiada con éxito!');
        return res.redirect('/perfil');
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        const [userDetails] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [req.session.user.id]
        );
        
        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: userDetails[0],
            success: null,
            passwordError: 'Error al cambiar la contraseña',
            passwordSuccess: null,
            error: null
        });
    }
});

// Ruta para ver detalles de un hotel
router.get('/hotel/:id', async (req, res) => {
    try {
        const hotelId = req.params.id;
        // Traer hotel, características y habitaciones
        const [hoteles] = await pool.query(`
            SELECT h.*, c.wifi, c.parking, c.piscina, c.restaurante, c.aire_acondicionado, c.gimnasio, c.spa, c.bar, c.mascotas
            FROM hoteles h
            LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
            WHERE h.id = ?
        `, [hotelId]);
        const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotelId]);
        if (hoteles.length === 0) {
            return res.status(404).render('error', { message: 'Hotel no encontrado', user: req.session.user });
        }
        console.log('Habitaciones recuperadas:', habitaciones); // <--- Aquí se muestra el log
        res.render('hotel-detalle', {
            hotel: hoteles[0],
            habitaciones,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar detalles del hotel:', error);
        res.status(500).render('error', { message: 'Error al cargar el hotel', user: req.session.user });
    }
});


// ========== RUTAS DE ADMINISTRACIÓN UNIFICADAS ==========

// Formulario para nuevo hotel
router.get('/admin/hotels/new', isAuthenticated, isAdmin, (req, res) => {
    const error = req.flash('error');
    const success = req.flash('success');
    console.log('[DEBUG GET /admin/hotels/new] Error flash message:', error);
    console.log('[DEBUG GET /admin/hotels/new] Success flash message:', success);
    res.render('admin/hotels/form', { hotel: null, error: error.length ? error : null, success: success.length ? success : null, user: req.session.user });
});

// Guardar nuevo hotel usando el controlador correcto
router.post('/admin/hotels', isAuthenticated, isAdmin, hotelController.store);

// Mostrar formulario de edición de hotel
router.get('/admin/hotels/:id/edit', isAdmin, hotelController.edit);

// Guardar edición de hotel
router.post('/admin/hotels/:id/edit', isAdmin, hotelController.update);

// Cambiar estado de hotel (activo/inactivo)
router.post('/admin/hotels/:id/toggle-status', isAdmin, async (req, res) => {
    try {
        const [hoteles] = await pool.query('SELECT estado FROM hoteles WHERE id = ?', [req.params.id]);
        if (hoteles.length === 0) {
            return res.status(404).json({ error: 'Hotel no encontrado' });
        }
        const nuevoEstado = hoteles[0].estado === 'activo' ? 'inactivo' : 'activo';
        await pool.query('UPDATE hoteles SET estado = ? WHERE id = ?', [nuevoEstado, req.params.id]);
        res.json({ success: true, estado: nuevoEstado });
    } catch (error) {
        console.error('Error al cambiar estado del hotel:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ========== RUTAS DE RESTAURANTES ==========

// Mostrar listado de restaurantes
router.get('/admin/restaurants', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [restaurants] = await pool.query('SELECT * FROM restaurantes ORDER BY nombre ASC');
        res.render('admin/restaurants', {
            restaurants,
            user: req.session.user,
            error: null
        });
    } catch (error) {
        console.error('Error al obtener restaurantes:', error);
        res.render('admin/restaurants', {
            restaurants: [],
            user: req.session.user,
            error: 'Error al cargar los restaurantes'
        });
    }
});

// Mostrar formulario para nuevo restaurante
router.get('/admin/restaurants/new', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/restaurants/form', { error: null, user: req.session.user });
});

// Guardar nuevo restaurante
router.post('/admin/restaurants', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, estado, coordenadas_lat, coordenadas_lng } = req.body;
        let imagen_principal = null;
        // Si implementas subida de imágenes, aquí deberías guardar el archivo y asignar la ruta a imagen_principal
        // Por ahora, lo dejamos como null o puedes poner una imagen por defecto
        const creado_por = req.session.user.id;
        const query = `INSERT INTO restaurantes (nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await pool.query(query, [nombre, descripcion, direccion, ciudad, tipo_cocina, precio_promedio, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por]);
        res.redirect('/admin/restaurants');
    } catch (error) {
        console.error('Error al guardar restaurante:', error);
        res.render('admin/restaurants/form', { error: 'Error al guardar el restaurante', user: req.session.user });
    }
});

// Ruta para procesar la reserva de hotel
router.post('/reservar-hotel', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        // Recibir datos de tarjeta
        const { hotel_id, habitacion_id, fecha_entrada, fecha_salida, num_personas: num_personas_raw, numero_tarjeta, expiracion_tarjeta, cvv_tarjeta } = req.body;
        const usuario_id = req.session.user.id;

        console.log('DEBUG: Recibiendo datos para reserva de hotel:');
        console.log('  hotel_id:', hotel_id);
        console.log('  habitacion_id:', habitacion_id);
        console.log('  fecha_entrada:', fecha_entrada);
        console.log('  fecha_salida:', fecha_salida);
        console.log('  num_personas_raw:', num_personas_raw);

        // Obtener la capacidad de la habitación primero para determinar el número de personas si el campo viene deshabilitado
        const [habitacionCapData] = await pool.query('SELECT capacidad, estado FROM habitaciones WHERE id = ?', [habitacion_id]);
        if (habitacionCapData.length === 0) {
            // Esto no debería pasar si habitacion_id es válido, pero es una buena práctica manejarlo
            const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotel_id]);
            const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotel_id]);
            return res.render('reservar-hotel', {
                hotel: hoteles[0],
                habitaciones,
                error: 'Habitación no encontrada o inválida.',
                habitacionSeleccionada: habitacion_id,
                fechaEntradaParam: fecha_entrada,
                fechaSalidaParam: fecha_salida,
                numPersonasParam: num_personas_raw
            });
        }

        const capacidadRealHabitacion = habitacionCapData[0].capacidad;
        // Si num_personas no se recibió (campo deshabilitado) y la capacidad es 1, asumimos 1 persona.
        // De lo contrario, usamos el valor enviado o 1 si es inválido.
        const num_personas = (num_personas_raw === undefined && capacidadRealHabitacion === 1) ? 1 : (parseInt(num_personas_raw) || 1);

        const numeroTarjetaLimpio = numero_tarjeta ? numero_tarjeta.replace(/\s/g, '') : '';

        console.log('DEBUG VALIDACIÓN TARJETA:');
        console.log('  numero_tarjeta (original): ', numero_tarjeta);
        console.log('  numeroTarjetaLimpio: ', numeroTarjetaLimpio);
        console.log('  expiracion_tarjeta: ', expiracion_tarjeta);
        console.log('  cvv_tarjeta: ', cvv_tarjeta);
        console.log('  num_personas (procesado): ', num_personas);
        console.log('  capacidadRealHabitacion: ', capacidadRealHabitacion);

        // Simulación de validación de tarjeta
        if (!numeroTarjetaLimpio || !expiracion_tarjeta || !cvv_tarjeta || !/^\d{13,19}$/.test(numeroTarjetaLimpio) || !/^\d{3,4}$/.test(cvv_tarjeta)) {
            // Datos incompletos o formato incorrecto
            // Obtener datos del hotel y habitaciones para recargar la vista
            const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotel_id]);
            const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotel_id]);
            return res.render('reservar-hotel', {
                hotel: hoteles[0],
                habitaciones,
                error: 'Datos de tarjeta inválidos o incompletos. Intenta de nuevo.',
                habitacionSeleccionada: habitacion_id,
                fechaEntradaParam: fecha_entrada,
                fechaSalidaParam: fecha_salida,
                numPersonasParam: num_personas
            });
        }

        if (numeroTarjetaLimpio.endsWith('0')) {
            // Tarjeta inválida simulada
            // Debemos recargar la vista con los datos y un mensaje de error
            // Obtener datos del hotel y habitaciones para recargar la vista
            const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotel_id]);
            const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotel_id]);
            return res.render('reservar-hotel', {
                hotel: hoteles[0],
                habitaciones,
                error: 'La tarjeta es inválida. Por favor, ingresa otra tarjeta.',
                habitacionSeleccionada: habitacion_id,
                fechaEntradaParam: fecha_entrada,
                fechaSalidaParam: fecha_salida,
                numPersonasParam: num_personas
            });
        }

        // Validar capacidad de la habitación (ahora con num_personas ya procesado)
        if (num_personas > capacidadRealHabitacion) {
             // Obtener datos del hotel y habitaciones para recargar la vista
             const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotel_id]);
             const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotel_id]);
             return res.render('reservar-hotel', {
                 hotel: hoteles[0],
                 habitaciones,
                 error: 'La cantidad de personas excede la capacidad permitida para la habitación seleccionada.',
                 habitacionSeleccionada: habitacion_id,
                 fechaEntradaParam: fecha_entrada,
                 fechaSalidaParam: fecha_salida,
                 numPersonasParam: num_personas
             });
         }

        await connection.beginTransaction();

        // Verificar disponibilidad (después de la validación de capacidad y tarjeta)
        const [habitacion] = await connection.query(
            'SELECT * FROM habitaciones WHERE id = ? AND hotel_id = ? AND estado = \'disponible\'',
            [habitacion_id, hotel_id]
        );

        console.log('DEBUG: Resultado de la consulta de disponibilidad de habitación:', habitacion);

        if (!habitacion[0]) {
            // Buscar habitaciones alternativas disponibles para las mismas fechas
            const [alternativas] = await connection.query(
                'SELECT * FROM habitaciones WHERE hotel_id = ? AND estado = \'disponible\' AND id != ?',
                [hotel_id, habitacion_id]
            );
            let fechasAlternativas = [];
            if (alternativas.length === 0) {
                // Si no hay habitaciones alternativas, sugerir fechas próximas para la misma habitación
                const fechaEntradaNueva = new Date(fecha_entrada);
                fechaEntradaNueva.setDate(fechaEntradaNueva.getDate() + 1);
                const fechaSalidaNueva = new Date(fecha_salida);
                fechaSalidaNueva.setDate(fechaSalidaNueva.getDate() + 1);
                fechasAlternativas.push({
                    fecha_entrada: fechaEntradaNueva.toISOString().split('T')[0],
                    fecha_salida: fechaSalidaNueva.toISOString().split('T')[0]
                });
            }
            // Obtener datos del hotel y habitaciones para recargar la vista con sugerencias
            const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotel_id]);
            const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotel_id]); // Cargar también habitaciones aquí
            return res.render('reservar-hotel', {
                hotel: hoteles[0],
                habitaciones, // Pasar habitaciones aquí también
                error: 'La habitación seleccionada no está disponible. Por favor, elige una alternativa o prueba con otras fechas.',
                alternativas,
                fechasAlternativas,
                habitacionSeleccionada: habitacion_id,
                fechaEntradaParam: fecha_entrada,
                fechaSalidaParam: fecha_salida,
                numPersonasParam: num_personas
            });
        }

        // Si todo es válido y la habitación está disponible, continuar con la reserva...

        // Obtener el precio de la habitación
        const [habitacionPrecio] = await connection.query(
            'SELECT precio FROM habitaciones WHERE id = ?',
            [habitacion_id]
        );

        // Calcular el precio total
        const fechaEntrada = new Date(fecha_entrada);
        const fechaSalida = new Date(fecha_salida);
        const diasEstadia = Math.ceil((fechaSalida - fechaEntrada) / (1000 * 60 * 60 * 24));
        const precioTotal = habitacionPrecio[0].precio * diasEstadia;

        // Crear la reserva
        const [result] = await connection.query(
            `INSERT INTO reservas_hotel 
             (usuario_id, hotel_id, habitacion_id, fecha_entrada, fecha_salida, 
              numero_huespedes, precio_total, estado) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [usuario_id, hotel_id, habitacion_id, fecha_entrada, fecha_salida, num_personas, precioTotal, 'confirmada']
        );
        
        // Actualizar disponibilidad de la habitación
        await connection.query(
            'UPDATE habitaciones SET estado = \'no_disponible\' WHERE id = ?',
            [habitacion_id]
        );
        
        // Commit de la transacción principal de reserva
        await connection.commit();
        connection.release(); // Liberar la conexión principal

        // Enviar correo de confirmación (puede usar una nueva conexión si es necesario, o pool directo)
        // Para obtener datos del hotel y habitación para el correo, usamos pool directamente
        const [hotel] = await pool.query('SELECT nombre FROM hoteles WHERE id = ?', [hotel_id]);
        const [habitacionInfo] = await pool.query(
            'SELECT tipo FROM habitaciones WHERE id = ?',
            [habitacion_id]
        );
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.session.user.email,
            subject: 'Confirmación de Reserva - EasyStay',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #ff8c00; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">¡Reserva Confirmada!</h1>
                    </div>
                    <div style="padding: 20px;">
                        <p>Hola ${req.session.user.nombre},</p>
                        <p>Tu reserva en EasyStay ha sido confirmada con éxito. Aquí tienes los detalles:</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <h3 style="margin-top: 0; color: #ff8c00;">Detalles de la Reserva</h3>
                            <p><strong>Hotel:</strong> ${hotel[0].nombre}</p>
                            <p><strong>Tipo de Habitación:</strong> ${habitacionInfo[0].tipo}</p>
                            <p><strong>Fecha de Entrada:</strong> ${new Date(fecha_entrada).toLocaleDateString('es-ES')}</p>
                            <p><strong>Fecha de Salida:</strong> ${new Date(fecha_salida).toLocaleDateString('es-ES')}</p>
                            <p><strong>Número de Huéspedes:</strong> ${num_personas}</p>
                            <p><strong>Total Pagado:</strong> $${precioTotal.toFixed(2)}</p>
                            <p><strong>Puntos a Ganar:</strong> ${Math.floor(precioTotal * 0.05)} (se otorgarán al completar la estadía)</p>
                        </div>
                        
                        <p>Si necesitas modificar o cancelar tu reserva, por favor contacta con nuestro equipo de soporte.</p>
                        
                        <div style="text-align: center; margin-top: 20px;">
                            <a href="${process.env.SITE_URL || 'https://easystay.com'}" 
                               style="background-color: #ff8c00; color: white; padding: 10px 20px; 
                                      text-decoration: none; border-radius: 5px; display: inline-block;">
                                Visitar EasyStay
                            </a>
                        </div>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                        <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                        <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                    </div>
                </div>
            `
        };
        
        try {
            await transporter.sendMail(mailOptions);
            req.flash('success', 'Su reserva ha sido exitosamente. Se ha enviado un correo de confirmación.'); // Mensaje si el correo se envía
             res.redirect('/'); 

        } catch (correoError) {
            console.error('Error al enviar correo de confirmación:', correoError);
            // Si falla el correo, mostrar comprobante en pantalla
            res.render('comprobante-reserva', {
                reserva: {
                    hotel: hotel[0].nombre,
                    habitacion: habitacionInfo[0].tipo,
                    fecha_entrada,
                    fecha_salida,
                    num_personas,
                    precio_total: precioTotal,
                    puntosGanados: Math.floor(precioTotal * 0.05)
                },
                user: req.session.user,
                advertencia: 'No se pudo enviar el correo de confirmación. Aquí tienes tu comprobante.'
            });
        }
        
    } catch (error) {
        // Este catch es para errores durante la reserva, antes del commit principal
        await connection.rollback();
        connection.release(); // Liberar la conexión en caso de error
        console.error('Error crítico al procesar la reserva (antes del commit):', error);
        res.redirect('/perfil?error=reserva'); // Redirigir a perfil con error
    }
});

// Ruta para procesar la reserva de restaurante
router.post('/reservar-restaurante', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { restaurante_id, fecha, hora, num_personas, precio_total } = req.body;
        const usuario_id = req.session.user.id;

        // Verificar disponibilidad
        const [mesas] = await connection.query(
            'SELECT * FROM mesas WHERE restaurante_id = ? AND disponible = 1 LIMIT 1',
            [restaurante_id]
        );

        if (!mesas[0]) {
            throw new Error('No hay mesas disponibles');
        }

        // Crear la reserva
        const [result] = await connection.query(
            `INSERT INTO reservas_restaurante 
             (usuario_id, restaurante_id, mesa_id, fecha, hora, 
              num_personas, precio_total, estado_pago, estado_reserva) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', 'confirmada')`,
            [usuario_id, restaurante_id, mesas[0].id, fecha, hora, num_personas, precio_total]
        );

        // Actualizar disponibilidad de la mesa
        await connection.query(
            'UPDATE mesas SET disponible = 0 WHERE id = ?',
            [mesas[0].id]
        );

        // Calcular y agregar puntos (5% del total)
        const puntosGanados = Math.floor(precio_total * 0.05);
        await puntosController.agregarPuntos(
            usuario_id,
            puntosGanados,
            `Puntos por reserva de restaurante #${result.insertId}`,
            result.insertId,
            'restaurante'
        );

        // Enviar correo de confirmación
        const [restaurante] = await connection.query(
            'SELECT nombre FROM restaurantes WHERE id = ?',
            [restaurante_id]
        );

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.session.user.email,
            subject: 'Confirmación de Reserva - EasyStay',
            html: `
                <h1>¡Reserva Confirmada!</h1>
                <p>Hola ${req.session.user.nombre},</p>
                <p>Tu reserva ha sido confirmada:</p>
                <ul>
                    <li>Restaurante: ${restaurante[0].nombre}</li>
                    <li>Fecha: ${fecha}</li>
                    <li>Hora: ${hora}</li>
                    <li>Personas: ${num_personas}</li>
                    <li>Total: $${precio_total}</li>
                    <li>Puntos ganados: ${puntosGanados}</li>
                </ul>
                <p>¡Gracias por elegir EasyStay!</p>
            `
        };

        await transporter.sendMail(mailOptions);

        await connection.commit();
        res.redirect('/mi-perfil?reserva=success');
    } catch (error) {
        await connection.rollback();
        console.error('Error al procesar la reserva:', error);
        res.redirect('/perfil?error=reserva');
    } finally {
        connection.release();
    }
});

// Mostrar formulario para editar reserva de hotel
router.get('/hotel/reserva/edit/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const [reservas] = await pool.query(`
        SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo
        FROM reservas_hotel r
        JOIN hoteles h ON r.hotel_id = h.id
        JOIN habitaciones hab ON r.habitacion_id = hab.id
        WHERE r.id = ?
    `, [reservaId]);
    if (reservas.length === 0) {
        return res.status(404).render('error', { message: 'Reserva no encontrada', user: req.session.user });
    }
    // Traer habitaciones disponibles para ese hotel
    const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservas[0].hotel_id]);
    res.render('editar-reserva-hotel', { reserva: reservas[0], habitaciones, user: req.session.user });
});

// Guardar cambios de edición de reserva de hotel
router.post('/hotel/reserva/edit/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const { fecha_entrada, fecha_salida, num_personas, habitacion_id, numero_tarjeta, expiracion_tarjeta, cvv_tarjeta, pagar_diferencia } = req.body;

    // 1. Obtener la reserva original
    const [reservas] = await pool.query('SELECT * FROM reservas_hotel WHERE id = ?', [reservaId]);
    if (reservas.length === 0) {
        return res.status(404).render('error', { message: 'Reserva no encontrada', user: req.session.user });
    }
    const reservaOriginal = reservas[0];

    // 2. Verificar plazo (4 días antes del check-in)
    const hoy = new Date();
    const nuevaFechaEntrada = new Date(fecha_entrada);
    const diffTime = nuevaFechaEntrada.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 4) {
        return res.render('editar-reserva-hotel', {
            reserva: { ...reservaOriginal, ...req.body },
            habitaciones: await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservaOriginal.hotel_id]).then(r => r[0]),
            user: req.session.user,
            error: 'No puedes modificar la reserva con menos de 4 días de antelación. Cancela y realiza una nueva reserva.'
        });
    }

    // 3. Calcular nuevo precio y abono
    const [habitacion] = await pool.query('SELECT * FROM habitaciones WHERE id = ?', [habitacion_id]);
    if (!habitacion[0]) {
        return res.render('editar-reserva-hotel', {
            reserva: { ...reservaOriginal, ...req.body },
            habitaciones: await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservaOriginal.hotel_id]).then(r => r[0]),
            user: req.session.user,
            error: 'Habitación no encontrada.'
        });
    }
    const precioPorNoche = habitacion[0].precio;
    const fechaIn = new Date(fecha_entrada);
    const fechaOut = new Date(fecha_salida);
    const noches = Math.ceil((fechaOut - fechaIn) / (1000 * 60 * 60 * 24));
    const nuevoPrecioTotal = precioPorNoche * noches;
    const nuevoAbono = nuevoPrecioTotal / 2;

    // 4. Lógica según estado de la reserva
    if (reservaOriginal.estado === 'abonada') {
        const abonoPagado = reservaOriginal.precio_total / 2;
        if (nuevoAbono > abonoPagado && !pagar_diferencia) {
            // Debe abonar la diferencia
            const diferencia = nuevoAbono - abonoPagado;
            return res.render('editar-reserva-hotel', {
                reserva: { ...reservaOriginal, ...req.body },
                habitaciones: await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservaOriginal.hotel_id]).then(r => r[0]),
                user: req.session.user,
                diferencia,
                nuevoPrecioTotal,
                nuevoAbono,
                abonoPagado,
                datosNuevos: { fecha_entrada, fecha_salida, num_personas, habitacion_id }
            });
        }
        if (nuevoAbono > abonoPagado && pagar_diferencia) {
            // Validar pago simulado
            if (!numero_tarjeta || !expiracion_tarjeta || !cvv_tarjeta || !/^\d{13,19}$/.test(numero_tarjeta.replace(/\s/g, '')) || !/^\d{3,4}$/.test(cvv_tarjeta)) {
                return res.render('editar-reserva-hotel', {
                    reserva: { ...reservaOriginal, ...req.body },
                    habitaciones: await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservaOriginal.hotel_id]).then(r => r[0]),
                    user: req.session.user,
                    diferencia: nuevoAbono - abonoPagado,
                    nuevoPrecioTotal,
                    nuevoAbono,
                    abonoPagado,
                    error: 'Datos de tarjeta inválidos o incompletos.',
                    datosNuevos: { fecha_entrada, fecha_salida, num_personas, habitacion_id }
                });
            }
            if (numero_tarjeta.replace(/\s/g, '').endsWith('0')) {
                return res.render('editar-reserva-hotel', {
                    reserva: { ...reservaOriginal, ...req.body },
                    habitaciones: await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [reservaOriginal.hotel_id]).then(r => r[0]),
                    user: req.session.user,
                    diferencia: nuevoAbono - abonoPagado,
                    nuevoPrecioTotal,
                    nuevoAbono,
                    abonoPagado,
                    error: 'La tarjeta es inválida. Por favor, ingresa otra tarjeta.',
                    datosNuevos: { fecha_entrada, fecha_salida, num_personas, habitacion_id }
                });
            }
            // Aquí podrías guardar el pago simulado en la base de datos si lo deseas
        }
        // Si el nuevo abono es menor o igual, permite el cambio y muestra mensaje (no hay devolución automática)
    }

    // 5. Actualizar la reserva con los nuevos datos y precio total
    await pool.query(
        'UPDATE reservas_hotel SET fecha_entrada=?, fecha_salida=?, numero_huespedes=?, habitacion_id=?, precio_total=? WHERE id=?',
        [fecha_entrada, fecha_salida, num_personas, habitacion_id, nuevoPrecioTotal, reservaId]
    );
    return res.redirect('/bookings');
});

// Mostrar formulario para hacer abono de una reserva de hotel
router.get('/hotel/reserva/abonar/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const [reservas] = await pool.query(`
        SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo
        FROM reservas_hotel r
        JOIN hoteles h ON r.hotel_id = h.id
        JOIN habitaciones hab ON r.habitacion_id = hab.id
        WHERE r.id = ?
    `, [reservaId]);
    if (reservas.length === 0) {
        return res.status(404).render('error', { message: 'Reserva no encontrada', user: req.session.user });
    }
    const reserva = reservas[0];
    // Asegurarse de que precio_total sea un número antes de pasarlo a la vista
    reserva.precio_total = parseFloat(reserva.precio_total);
    if (isNaN(reserva.precio_total)) {
         console.error(`Advertencia: precio_total inválido para la reserva ${reservaId} en vista de abono:`, reservas[0].precio_total);
         reserva.precio_total = 0; // Establecer a 0 si es inválido para evitar errores en la vista
    }

    res.render('abonar-reserva-hotel', { reserva: reserva, user: req.session.user });
});

// Procesar abono de reserva de hotel
router.post('/hotel/reserva/abonar/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    // Obtener datos de la reserva y usuario
    const [reservas] = await pool.query(`
        SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo, u.email, u.nombre AS usuario_nombre
        FROM reservas_hotel r
        JOIN hoteles h ON r.hotel_id = h.id
        JOIN habitaciones hab ON r.habitacion_id = hab.id
        JOIN usuarios u ON r.usuario_id = u.id
        WHERE r.id = ?
    `, [reservaId]);
    if (reservas.length === 0) {
        return res.status(404).render('error', { message: 'Reserva no encontrada', user: req.session.user });
    }
    const reserva = reservas[0];

    // Asegurarse de que precio_total sea un número
    const precioTotalReserva = parseFloat(reserva.precio_total);
    if (isNaN(precioTotalReserva)) {
        console.error(`Error: precio_total inválido para la reserva ${reservaId} en ruta de abono:`, reserva.precio_total);
         // Considerar cómo manejar este caso si es crítico
         return res.redirect('/bookings?error=Error interno al procesar el precio para abono');
    }

    // Calcular abono (50% del precio total)
    const abonoCalculado = parseFloat((precioTotalReserva / 2).toFixed(2));

    // Actualizar estado a 'abonada'
    await pool.query('UPDATE reservas_hotel SET estado = ? WHERE id = ?', ['abonada', reservaId]);

    // Enviar correo de confirmación de abono
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: reserva.email,
        subject: 'Abono realizado con éxito en tu reserva de hotel',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #ff8c00; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">¡Abono realizado con éxito!</h1>
                </div>
                <div style="padding: 20px;">
                    <p>Hola ${reserva.usuario_nombre},</p>
                    <p>Tu abono para la reserva en <b>${reserva.hotel_nombre}</b> ha sido registrado.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <h3 style="margin-top: 0; color: #ff8c00;">Detalles de la reserva</h3>
                        <p><strong>Hotel:</strong> ${reserva.hotel_nombre}</p>
                        <p><strong>Tipo de Habitación:</strong> ${reserva.habitacion_tipo}</p>
                        <p><strong>Fecha de Entrada:</strong> ${new Date(reserva.fecha_entrada).toLocaleDateString('es-ES')}</p>
                        <p><strong>Fecha de Salida:</strong> ${new Date(reserva.fecha_salida).toLocaleDateString('es-ES')}</p>
                        <p><strong>Número de Huéspedes:</strong> ${reserva.numero_huespedes}</p>
                        <p><strong>Precio Total Original:</strong> $${precioTotalReserva.toFixed(2)}</p>
                        <p><strong>Monto Abonado:</strong> $${abonoCalculado.toFixed(2)}</p>
                    </div>

                    <div style="background-color: #fff8e1; border-left: 4px solid #ffb300; padding: 15px; border-radius: 0 5px 5px 0; margin: 15px 0;">
                        <h3 style="margin-top: 0; color: #ff8c00;">Confirmación de Abono</h3>
                        <p>El abono de $${abonoCalculado.toFixed(2)} ha sido procesado correctamente.</p>
                    </div>
                    
                    <p>¡Gracias por confiar en <b>EasyStay</b>!<br>Te esperamos para que disfrutes tu estadía.</p>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                    <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                    <p>
                        <a href="https://easystay.com" style="color: #ff8c00; text-decoration: none;">Visite nuestro sitio</a> | 
                        <a href="https://easystay.com/privacidad" style="color: #ff8c00; text-decoration: none;">Política de privacidad</a>
                    </p>
                    <p><small>Este es un mensaje automático, por favor no responda directamente.</small></p>
                </div>
            </div>
        `
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error enviando correo de abono:', error);
        } else {
            console.log('Correo de abono enviado:', info.response);
        }
    });
    res.redirect('/bookings');
});

// Ruta para cancelar reserva de hotel
router.post('/hotel/reserva/cancelar/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Obtener datos de la reserva y del usuario
        const [reservas] = await connection.query(
            `SELECT r.*, hab.tipo AS habitacion_tipo, h.nombre AS hotel_nombre, u.email, u.nombre AS usuario_nombre
             FROM reservas_hotel r
             JOIN habitaciones hab ON r.habitacion_id = hab.id
             JOIN hoteles h ON r.hotel_id = h.id
             JOIN usuarios u ON r.usuario_id = u.id
             WHERE r.id = ? AND r.usuario_id = ?`,
            [reservaId, req.session.user.id]
        );

        if (reservas.length === 0) {
            await connection.rollback();
            return res.status(404).render('error', { message: 'Reserva no encontrada o no te pertenece', user: req.session.user });
        }

        const reserva = reservas[0];

        // Asegurarse de que precio_total sea un número
        const precioTotalReserva = parseFloat(reserva.precio_total);
        if (isNaN(precioTotalReserva)) {
            console.error(`Error: precio_total inválido para la reserva ${reservaId}:`, reserva.precio_total);
            await connection.rollback();
            return res.redirect('/bookings?error=Error interno al procesar el precio de la reserva');
        }

        // 2. Verificar si la reserva ya está cancelada o finalizada
        if (reserva.estado === 'cancelada' || reserva.estado === 'finalizada') {
             await connection.rollback();
             return res.redirect('/bookings?error=Reserva ya cancelada o finalizada');
        }

        // 3. Calcular penalización y reembolso
        const fechaEntrada = new Date(reserva.fecha_entrada);
        const hoy = new Date();
        const diffTime = fechaEntrada.getTime() - hoy.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Días restantes hasta la entrada

        let penalizacion = 0;
        let montoReembolso = 0;
        let mensajePenalizacion = '';

        const abonoRealizado = reserva.estado === 'abonada';
        // Usar el precioTotalReserva parseado para los cálculos
        const montoAbono = abonoRealizado ? parseFloat((precioTotalReserva / 2).toFixed(2)) : 0;

        if (diffDays < 7) { // Penalización si cancela con menos de 7 días de antelación
            penalizacion = parseFloat((precioTotalReserva * 0.20).toFixed(2)); // 20% de penalización
            mensajePenalizacion = `Se aplica una penalización del 20% ($${penalizacion}).`;
        } else {
            // No hay penalización si cancela con suficiente antelación
            mensajePenalizacion = 'No se aplica penalización por cancelar con suficiente antelación.';
        }

        if (abonoRealizado) {
             // Si hubo abono, el reembolso es el 60% del abono, restando la penalización
             const reembolsoBruto = montoAbono * 0.60;
             montoReembolso = parseFloat((reembolsoBruto - penalizacion).toFixed(2));

             // Asegurarse de que el reembolso no sea negativo
             if (montoReembolso < 0) montoReembolso = 0;

             mensajePenalizacion += ` Del abono de $${montoAbono}, se reembolsará el 60% ($${(montoAbono * 0.60).toFixed(2)}), resultando en un reembolso total de $${montoReembolso} tras aplicar la penalización.`;
        } else {
            // Si no hubo abono, el reembolso es 0 (no hay nada que reembolsar)
            montoReembolso = 0;
            if (penalizacion > 0) {
                 mensajePenalizacion += ` No se realizó abono, por lo que no hay reembolso, pero se aplica una penalización de $${penalizacion}.`;
            } else {
                 mensajePenalizacion = 'No se realizó abono y no hay penalización por cancelación.';
            }
        }

        // 4. Actualizar estado de la reserva a 'cancelada'
        await connection.query(
            'UPDATE reservas_hotel SET estado = ? WHERE id = ?',
            ['cancelada', reservaId]
        );

        // 5. Actualizar disponibilidad de la habitación a 'disponible'
         await connection.query(
             'UPDATE habitaciones SET estado = \'disponible\' WHERE id = ?',
             [reserva.habitacion_id]
         );

        // 6. Deducir puntos ganados por esta reserva
        try {
            await puntosController.deducirPuntosReserva(req.session.user.id, reservaId, 'hotel');
        } catch (puntosError) {
            console.error('Advertencia: Error al deducir puntos tras la cancelación:', puntosError);
            // No detenemos el proceso de cancelación principal por un error en la deducción de puntos
        }

        // 7. Enviar correo de confirmación de cancelación
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: reserva.email,
            subject: 'Confirmación de Cancelación - Reserva EasyStay',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #ff8c00; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Cancelación de Reserva</h1>
                    </div>
                    <div style="padding: 20px;">
                        <p>Hola ${reserva.usuario_nombre},</p>
                        <p>Tu reserva de hotel ha sido cancelada correctamente. Aquí tienes los detalles:</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <h3 style="margin-top: 0; color: #ff8c00;">Detalles de la Reserva Cancelada</h3>
                            <p><strong>Hotel:</strong> ${reserva.hotel_nombre}</p>
                            <p><strong>Tipo de Habitación:</strong> ${reserva.habitacion_tipo}</p>
                            <p><strong>Fecha de Entrada Original:</strong> ${new Date(reserva.fecha_entrada).toLocaleDateString('es-ES')}</p>
                            <p><strong>Fecha de Salida Original:</strong> ${new Date(reserva.fecha_salida).toLocaleDateString('es-ES')}</p>
                            <p><strong>Número de Huéspedes:</strong> ${reserva.numero_huespedes}</p>
                             <p><strong>Precio Total Original:</strong> $${precioTotalReserva.toFixed(2)}</p>
                            ${abonoRealizado ? `<p><strong>Monto Abonado:</strong> $${montoAbono.toFixed(2)}</p>` : ''}
                        </div>

                         <div style="background-color: #fff8e1; border-left: 4px solid #ffb300; padding: 15px; border-radius: 0 5px 5px 0; margin: 15px 0;">
                            <h3 style="margin-top: 0; color: #ff8c00;">Detalles de Cancelación y Reembolso</h3>
                            <p>${mensajePenalizacion}</p>
                             ${montoReembolso > 0 ? `<p>El monto de $${montoReembolso.toFixed(2)} se te reembolsará en tu cuenta bancaria asociada a tu método de pago original en un plazo aproximado de 8 días hábiles.</p>` : ''}
                             ${montoReembolso <= 0 && abonoRealizado ? `<p>Debido a la penalización, el monto a reembolsar es de $${montoReembolso.toFixed(2)}.</p>` : ''}
                         </div>
                        
                        <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
                        
                        <div style="text-align: center; margin-top: 20px;">
                            <a href="${process.env.SITE_URL || 'https://easystay.com'}/bookings" 
                               style="background-color: #ff8c00; color: white; padding: 10px 20px; 
                                      text-decoration: none; border-radius: 5px; display: inline-block;">
                                Ver Mis Reservas
                            </a>
                        </div>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                        <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                        <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        await connection.commit();
        res.redirect('/bookings?success=Reserva cancelada correctamente');

    } catch (error) {
        await connection.rollback();
        console.error('Error al cancelar reserva:', error);

        // --- Generar ticket de soporte --- 
        try {
            const usuarioId = req.session.user ? req.session.user.id : null; // Obtener ID de usuario si está autenticado
            const tipoIncidente = 'Fallo en cancelación de reserva de hotel';
            const descripcion = `Error al intentar cancelar la reserva de hotel #${reservaId} para el usuario ${usuarioId}.`;
            const detallesError = error.message + (error.stack ? '\n' + error.stack : '');

            await pool.query(
                `INSERT INTO tickets_soporte 
                 (usuario_id, tipo_incidente, descripcion, detalles_error, reserva_hotel_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuarioId, tipoIncidente, descripcion, detallesError, reservaId]
            );
            console.log(`[Soporte] Ticket #${reservaId} generado por fallo en cancelación.`);
        } catch (ticketError) {
            console.error('Error al generar ticket de soporte:', ticketError);
            // Si falla la generación del ticket, solo loggeamos el error y continuamos
        }
        // --- Fin Generación de ticket de soporte ---

        res.redirect('/bookings?error=Error al cancelar la reserva. Se ha notificado a soporte.');
    } finally {
        connection.release();
    }
});

// Mostrar formulario de reserva de hotel
router.get('/hotel/reservar/:id', isAuthenticated, async (req, res) => {
    const hotelId = req.params.id;
    const habitacionSeleccionada = req.query.habitacion || null;
    try {
        const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotelId]);
        const [habitaciones] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotelId]);
        if (hoteles.length === 0) {
            return res.status(404).render('error', { message: 'Hotel no encontrado', user: req.session.user });
        }
        res.render('reservar-hotel', {
            hotel: hoteles[0],
            habitaciones,
            habitacionSeleccionada
        });
    } catch (error) {
        console.error('Error al cargar formulario de reserva:', error);
        res.status(500).render('error', { message: 'Error al cargar el formulario de reserva', user: req.session.user });
    }
});

// Mostrar formulario para informar usuario
router.get('/admin/informar', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query('SELECT id, nombre, email FROM usuarios WHERE estado = "activo"');
        console.log(usuarios);
        res.render('admin/informar', { usuarios, user: req.session.user });
    } catch (error) {
        console.error('Error al obtener usuarios para informar:', error);
        res.render('admin/informar', { usuarios: [], user: req.session.user, error: 'Error al cargar usuarios' });
    }
});

// Procesar el envío de notificación
router.post('/admin/informar', isAuthenticated, isAdmin, async (req, res) => {
    const { email, asunto, motivo, mensaje, tipo_notificacion } = req.body;
    
    try {
        // Obtener datos del usuario
        const [usuariosDB] = await pool.query('SELECT nombre FROM usuarios WHERE email = ?', [email]);
        const nombreUsuario = usuariosDB.length > 0 ? usuariosDB[0].nombre : 'Estimado/a';
        
        // Plantilla HTML mejorada
        const htmlMensaje = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${asunto} - EasyStay</title>
            <style>
                body {
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    background-color: #f7f7f7;
                    margin: 0;
                    padding: 0;
                    color: #333;
                    line-height: 1.6;
                }
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                }
                .email-header {
                    background: linear-gradient(135deg, #ff8c00, #ff6b00);
                    padding: 30px 20px;
                    text-align: center;
                    color: white;
                }
                .email-logo {
                    width: 80px;
                    height: auto;
                    margin-bottom: 15px;
                }
                .email-title {
                    font-size: 24px;
                    margin: 0;
                    font-weight: 700;
                }
                .email-body {
                    padding: 30px;
                }
                .saludo {
                    font-size: 18px;
                    margin-bottom: 20px;
                }
                .mensaje-content {
                    font-size: 16px;
                    color: #444;
                    line-height: 1.7;
                }
                .motivo-box {
                    background-color: #fff8f0;
                    border-left: 4px solid #ff8c00;
                    padding: 16px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                .motivo-title {
                    font-weight: 600;
                    color: #ff6b00;
                    margin-bottom: 8px;
                }
                .footer {
                    text-align: center;
                    padding: 20px;
                    background-color: #f5f5f5;
                    color: #777;
                    font-size: 14px;
                }
                .contacto {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(to right, #ff8c00, #ff6b00);
                    color: white !important;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="/6.png" alt="" class="email-logo">
                    <h1 class="email-title">EasyStay</h1>
                </div>
                
                <div class="email-body">
                    <p class="saludo">${nombreUsuario},</p>
                    
                    <div class="mensaje-content">
                        ${mensaje.replace(/\n/g, '<br>')}
                    </div>
                    
                    ${motivo ? `
                    <div class="motivo-box">
                        <div class="motivo-title">Detalles de la cancelación:</div>
                        ${motivo.replace(/\n/g, '<br>')}
                    </div>
                    ` : ''}
                    
                    <div class="contacto">
                        <p>Para cualquier aclaración, puede contactarnos:</p>
                        <a href="mailto:soporte@easystay.com" class="btn">Contactar Soporte</a>
                        <p>Teléfono: +34 123 456 789<br>
                        Horario: L-V de 9:00 a 18:00</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                    <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        // Versión de texto plano para clientes de email que no soportan HTML
        const textMensaje = `
        EasyStay - ${asunto}
        =============================
        
        ${nombreUsuario},
        
        ${mensaje}
        
        ${motivo ? `
        Detalles de la cancelación:
        --------------------------
        ${motivo}
        ` : ''}
        
        Para cualquier aclaración, puede contactarnos:
        - Email: soporte@easystay.com
        - Teléfono: +34 123 456 789
        - Horario: L-V de 9:00 a 18:00
        
        © ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.
        `;

        // Configurar y enviar el correo
        await transporter.sendMail({
            from: '"EasyStay" <easystay.sp@gmail.com>',
            to: email,
            subject: asunto,
            text: textMensaje,
            html: htmlMensaje,
            headers: {
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'high'
            }
        });

        // AQUÍ VIENE LA CORRECCIÓN:
        const [usuarios] = await pool.query('SELECT id, nombre, email FROM usuarios WHERE estado = "activo"');
        res.render('admin/informar', { 
            usuarios,
            user: req.session.user, 
            success: 'Notificación enviada exitosamente al usuario' 
        });
        
    } catch (error) {
        console.error('Error al enviar correo:', error);
        const [usuarios] = await pool.query('SELECT id, nombre, email FROM usuarios WHERE estado = "activo"');
        res.render('admin/informar', { 
            usuarios,
            user: req.session.user, 
            error: 'Error al enviar la notificación. Por favor intente nuevamente.' 
        });
    }
});

// Ruta para confirmar estadía y otorgar puntos
router.post('/hotel/reserva/confirmar-estadia/:id', isAuthenticated, async (req, res) => {
    const reservaId = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verificar que la reserva existe y pertenece al usuario
        const [reservas] = await connection.query(
            `SELECT r.*, h.nombre AS hotel_nombre, hab.tipo AS habitacion_tipo
             FROM reservas_hotel r
             JOIN hoteles h ON r.hotel_id = h.id
             JOIN habitaciones hab ON r.habitacion_id = hab.id
             WHERE r.id = ? AND r.usuario_id = ? AND r.estado = 'abonada'`,
            [reservaId, req.session.user.id]
        );

        if (reservas.length === 0) {
            await connection.rollback();
            return res.status(404).render('error', { 
                message: 'Reserva no encontrada, no te pertenece o no está abonada', 
                user: req.session.user 
            });
        }

        const reserva = reservas[0];

        // 2. Verificar que la fecha de salida ya pasó
        const fechaSalida = new Date(reserva.fecha_salida);
        const hoy = new Date();
        if (fechaSalida > hoy) {
            await connection.rollback();
            return res.redirect('/bookings?error=No puedes confirmar la estadía antes de la fecha de salida');
        }

        // 3. Calcular puntos (5% del total)
        const puntosAGanar = Math.floor(parseFloat(reserva.precio_total) * 0.05);

        // 4. Otorgar puntos
        try {
            await puntosController.agregarPuntos(
                req.session.user.id,
                puntosAGanar,
                `Puntos por completar estadía en ${reserva.hotel_nombre} - Habitación ${reserva.habitacion_tipo}`,
                reservaId,
                'hotel'
            );
        } catch (puntosError) {
            console.error('Error al otorgar puntos:', puntosError);
            await connection.rollback();
            return res.redirect('/bookings?error=Error al otorgar puntos');
        }

        // 5. Actualizar estado de la reserva a 'finalizada'
        await connection.query(
            'UPDATE reservas_hotel SET estado = ? WHERE id = ?',
            ['finalizada', reservaId]
        );

        // 6. Enviar correo de confirmación
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.session.user.email,
            subject: '¡Estadía Completada! - EasyStay',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #ff8c00; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">¡Estadía Completada!</h1>
                    </div>
                    <div style="padding: 20px;">
                        <p>Hola ${req.session.user.nombre},</p>
                        <p>¡Gracias por completar tu estadía con nosotros! Aquí tienes los detalles de los puntos ganados:</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <h3 style="margin-top: 0; color: #ff8c00;">Detalles de la Estadía</h3>
                            <p><strong>Hotel:</strong> ${reserva.hotel_nombre}</p>
                            <p><strong>Tipo de Habitación:</strong> ${reserva.habitacion_tipo}</p>
                            <p><strong>Fecha de Entrada:</strong> ${new Date(reserva.fecha_entrada).toLocaleDateString('es-ES')}</p>
                            <p><strong>Fecha de Salida:</strong> ${new Date(reserva.fecha_salida).toLocaleDateString('es-ES')}</p>
                            <p><strong>Puntos Ganados:</strong> ${puntosAGanar}</p>
                        </div>
                        
                        <p>¡Esperamos verte pronto en tu próxima estadía!</p>
                        
                        <div style="text-align: center; margin-top: 20px;">
                            <a href="${process.env.SITE_URL || 'https://easystay.com'}" 
                               style="background-color: #ff8c00; color: white; padding: 10px 20px; 
                                      text-decoration: none; border-radius: 5px; display: inline-block;">
                                Visitar EasyStay
                            </a>
                        </div>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                        <p>© ${new Date().getFullYear()} EasyStay. Todos los derechos reservados.</p>
                        <p>Este es un mensaje automático, por favor no respondas directamente.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        await connection.commit();
        res.redirect('/bookings?success=Estadía confirmada y puntos otorgados correctamente');

    } catch (error) {
        await connection.rollback();
        console.error('Error al confirmar estadía:', error);
        res.redirect('/bookings?error=Error al confirmar la estadía');
    } finally {
        connection.release();
    }
});

// Función para normalizar fechas a 'YYYY-MM-DD'
function toDateInputValue(date) {
    if (!date) return '';
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
}

// API para obtener mesas disponibles
router.get('/api/mesas', async (req, res) => {
    try {
        const { restaurante_id, fecha, hora, num_comensales } = req.query;

        if (!restaurante_id || !fecha || !hora || !num_comensales) {
            return res.json({ success: false, message: 'Faltan parámetros requeridos.' });
        }

        // Mesas que están reservadas en esa fecha y hora
        const [reservas] = await pool.query(
            `SELECT mesa_id FROM reservas_restaurante WHERE restaurante_id = ? AND fecha = ? AND hora = ? AND estado = 'activa'`,
            [restaurante_id, fecha, hora]
        );
        const mesasReservadasIds = reservas.map(r => r.mesa_id);

        // Buscar todas las mesas del restaurante con capacidad suficiente que NO estén reservadas
        let query = 'SELECT * FROM mesas WHERE restaurante_id = ? AND capacidad >= ?';
        const queryParams = [restaurante_id, num_comensales];

        if (mesasReservadasIds.length > 0) {
            query += ' AND id NOT IN (?)';
            queryParams.push(mesasReservadasIds);
        }

        const [mesasDisponibles] = await pool.query(query, queryParams);
        
        res.json({ success: true, mesas: mesasDisponibles });

    } catch (error) {
        console.error("Error en /api/mesas:", error);
        res.status(500).json({ success: false, message: 'Error al obtener las mesas.' });
    }
});

// API para crear una reserva de mesa
router.post('/api/reservar-mesa', isAuthenticated, async (req, res) => {
    try {
        const { restaurante_id, mesa_id, fecha, hora, num_comensales, observaciones } = req.body;
        const usuario_id = req.session.user.id;

        // Aquí iría la lógica de validación (ej: que la mesa no esté ya reservada)
        
        const codigo_reserva = `RES-${Date.now()}`;

        const [result] = await pool.query(
            `INSERT INTO reservas_restaurante 
            (usuario_id, restaurante_id, mesa_id, fecha, hora, num_personas, notas, codigo_reserva, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa')`,
            [usuario_id, restaurante_id, mesa_id, fecha, hora, num_comensales, observaciones, codigo_reserva]
        );

        res.json({ success: true, message: '¡Reserva realizada con éxito!', codigo: codigo_reserva, reservaId: result.insertId });

    } catch (error) {
        console.error("Error en /api/reservar-mesa:", error);
        res.status(500).json({ success: false, message: 'No se pudo completar la reserva.' });
    }
});

// GET para mostrar el formulario de edición de una reserva de restaurante
router.get('/restaurante/reserva/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const [reservaResult] = await pool.query(
            `SELECT rr.*, r.nombre as nombre_restaurante
             FROM reservas_restaurante rr 
             JOIN restaurantes r ON rr.restaurante_id = r.id 
             WHERE rr.id = ? AND rr.usuario_id = ?`,
            [id, req.session.user.id]
        );

        if (reservaResult.length === 0) {
            req.flash('error', 'Reserva no encontrada o no tienes permiso para editarla.');
            return res.redirect('/bookings');
        }

        const reserva = reservaResult[0];
        const now = new Date();
        
        // Corrección: Asegurarse de que `reserva.fecha` es un objeto Date
        const reservaDate = new Date(reserva.fecha);
        const reservaDateTime = new Date(reservaDate.toISOString().split('T')[0] + 'T' + reserva.hora);
        
        const isPastReservation = reservaDateTime < now;

        const hoursDifference = (reservaDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const isModificationRestrictedFields = hoursDifference < 12 && !isPastReservation;
        
        res.render('bookings/edit_restaurant_booking', {
            reserva: reserva,
            isPastReservation: isPastReservation,
            isModificationRestrictedFields: isModificationRestrictedFields,
            error: req.flash('error')[0],
            success: req.flash('success')[0],
            user: req.session.user
        });
    } catch (error) {
        console.error("Error al cargar la página de edición de reserva:", error);
        req.flash('error', 'Hubo un error al cargar la página de edición.');
        res.redirect('/bookings');
    }
});

// POST para actualizar una reserva de restaurante
router.post('/restaurante/reserva/:id/edit', isAuthenticated, async (req, res) => {
    const { id } = req.params; // Mover la declaración de 'id' aquí
    try {
        const { fecha, hora, num_comensales, mesa_seleccionada, nombre_reclamo, observaciones } = req.body;
        const usuarioId = req.session.user.id;

        const [reservaOriginalResult] = await pool.query('SELECT * FROM reservas_restaurante WHERE id = ?', [id]);
        if(reservaOriginalResult.length === 0) {
            req.flash('error', 'No se encontró la reserva original.');
            return res.redirect('/bookings');
        }
        const reservaOriginal = reservaOriginalResult[0];
        // Corrección: Asegurarse de que `reservaOriginal.fecha` es un objeto Date
        const reservaDate = new Date(reservaOriginal.fecha);
        const reservaDateTime = new Date(reservaDate.toISOString().split('T')[0] + 'T' + reservaOriginal.hora);
        const hoursDifference = (reservaDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);

        if (hoursDifference < 12 && reservaDateTime > new Date()) {
            req.flash('error', 'No puedes modificar la reserva porque está dentro del plazo restringido de 12 horas.');
            return res.redirect(`/restaurante/reserva/${id}/edit`);
        }

        await pool.query(
            `UPDATE reservas_restaurante SET fecha = ?, hora = ?, num_personas = ?, mesa_id = ?, nombre_reclamo = ?, notas = ? WHERE id = ? AND usuario_id = ?`,
            [fecha, hora, num_comensales, mesa_seleccionada, nombre_reclamo, observaciones, id, usuarioId]
        );

        req.flash('success', 'Reserva actualizada con éxito');
        res.redirect('/bookings');
    } catch (error) {
        console.error("Error al actualizar la reserva:", error);
        req.flash('error', 'Error al actualizar la reserva.');
        res.redirect(`/restaurante/reserva/${id}/edit`);
    }
});

// POST para eliminar una reserva de restaurante
router.post('/restaurante/reserva/delete/:id', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const usuarioId = req.session.user.id;

        await connection.beginTransaction();

        // 1. Obtener la reserva para verificar propiedad y obtener mesa_id
        const [reservas] = await connection.query(
            'SELECT * FROM reservas_restaurante WHERE id = ? AND usuario_id = ?',
            [id, usuarioId]
        );

        if (reservas.length === 0) {
            await connection.rollback();
            req.flash('error', 'Reserva no encontrada o no tienes permiso para eliminarla.');
            return res.redirect('/bookings');
        }

        const reserva = reservas[0];
        const mesaId = reserva.mesa_id;

        // 2. Eliminar la reserva
        await connection.query(
            'DELETE FROM reservas_restaurante WHERE id = ?', [id]
        );

        // 3. Poner la mesa como disponible nuevamente (si tenía una mesa asignada)
        if (mesaId) {
            await connection.query(
                "UPDATE mesas SET estado = 'disponible' WHERE id = ?", [mesaId]
            );
        }

        await connection.commit();
        req.flash('success', 'La reserva ha sido eliminada permanentemente.');
        res.redirect('/bookings');

    } catch (error) {
        await connection.rollback();
        console.error("Error al eliminar la reserva de restaurante:", error);
        req.flash('error', 'Hubo un error al eliminar la reserva.');
        res.redirect('/bookings');
    } finally {
        if (connection) connection.release();
    }
});

// POST para cancelar una reserva de restaurante
router.post('/restaurante/reserva/cancel/:id', isAuthenticated, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const usuarioId = req.session.user.id;

        await connection.beginTransaction();

        // 1. Obtener la reserva para verificar propiedad y obtener mesa_id
        const [reservas] = await connection.query(
            'SELECT * FROM reservas_restaurante WHERE id = ? AND usuario_id = ?',
            [id, usuarioId]
        );

        if (reservas.length === 0) {
            await connection.rollback();
            req.flash('error', 'Reserva no encontrada o no tienes permiso para cancelarla.');
            return res.redirect('/bookings');
        }

        const reserva = reservas[0];
        const mesaId = reserva.mesa_id;

        // 2. Actualizar el estado de la reserva a 'cancelada'
        await connection.query(
            "UPDATE reservas_restaurante SET estado = 'cancelada' WHERE id = ?", [id]
        );

        // 3. Poner la mesa como disponible nuevamente (si tenía una mesa asignada)
        if (mesaId) {
            await connection.query(
                "UPDATE mesas SET estado = 'disponible' WHERE id = ?", [mesaId]
            );
        }

        await connection.commit();
        req.flash('success', 'La reserva ha sido cancelada correctamente.');
        res.redirect('/bookings');

    } catch (error) {
        await connection.rollback();
        console.error("Error al cancelar la reserva de restaurante:", error);
        req.flash('error', 'Hubo un error al cancelar la reserva.');
        res.redirect('/bookings');
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para ver el detalle de un hotel
router.get('/hotel-detalle/:id', async (req, res) => {
    try {
        const hotelId = req.params.id;

        // Obtener detalles del hotel
        const [hotelResult] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotelId]);
        if (hotelResult.length === 0) {
            return res.status(404).render('error', { message: 'Hotel no encontrado', user: req.session.user });
        }
        const hotel = hotelResult[0];

        // Obtener habitaciones del hotel
        const [habitacionesResult] = await pool.query('SELECT * FROM habitaciones WHERE hotel_id = ?', [hotelId]);
        
        // Obtener imágenes del hotel
        const [imagenesResult] = await pool.query('SELECT * FROM imagenes_hotel WHERE hotel_id = ?', [hotelId]);

        res.render('hotel-detalle', {
            hotel,
            habitaciones: habitacionesResult,
            imagenes: imagenesResult,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error al cargar detalle del hotel:', error);
        res.status(500).render('error', { message: 'Error al cargar la página del hotel', user: req.session.user });
    }
});

// Ruta para ver el perfil de usuario
router.get('/perfil', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Obtener la información del usuario desde la base de datos para asegurar que esté actualizada
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            req.flash('error', 'Usuario no encontrado.');
            return res.redirect('/login');
        }

        const user = users[0];
        
        // Obtener información de puntos del usuario
        const puntos = await puntosController.getPuntosUsuario(userId);

        // Renderizar la vista del perfil con los datos
        res.render('perfil', {
            user: user,
            puntos: puntos,
            error: req.flash('error'),
            success: req.flash('success')
        });

    } catch (error) {
        console.error('Error al cargar el perfil:', error);
        res.status(500).render('error', { 
            message: 'Error al cargar su perfil.',
            user: req.session.user 
        });
    }
});

module.exports = router; 