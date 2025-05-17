const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../databases/db');
const path = require('path');
const fs = require('fs').promises;


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
        return res.redirect('/login');
    }
    next();
};

// Ruta de login (GET)
router.get('/login', (req, res) => {
    res.render('index', { loginForm: true });
});


// Ruta principal muestra hoteles y restaurantes
router.get('/', async (req, res) => {
    try {
        const [hoteles] = await pool.query('SELECT * FROM hoteles');
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
        console.log('Contraseña recibida (raw):', password);
        console.log('Longitud de la contraseña:', password.length);
        console.log('Hash en base de datos:', user.password);
        console.log('Longitud del hash:', user.password.length);
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
            if (user.rol === 'admin' || user.rol === 'superadmin') {
                console.log('Redirección exitosa: usuario con rol', user.rol, 'redirigido a /admin/dashboard');
                return res.redirect('/admin/dashboard');
            } else {
                console.log('Redirección estándar: usuario con rol', user.rol, 'redirigido a /');
                return res.redirect('/');
            }
            
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


router.get('/mi-perfil', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirige si no está autenticado
    }
    // Consulta a la base de datos para obtener todos los datos del usuario
    const query = 'SELECT * FROM usuarios WHERE id = ?';
    pool.query(query, [req.session.user.id], (error, results) => {
        if (error) {
            console.error('Error al obtener datos del usuario:', error);
            return res.render('perfil', { error: 'Error al cargar el perfil' });
        }
        if (results.length === 0) {
            return res.render('perfil', { error: 'Usuario no encontrado' });
        }
        const userData = results[0]; // Datos completos del usuario
        console.log('Renderizando perfil con:', userData);
        res.render('perfil', { user: userData, error: null }); // Siempre pasa error, incluso si es null
    });
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


// Ruta para mostrar el formulario de editar perfil
router.get('/editar-perfil', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    pool.query(
        'SELECT * FROM usuarios WHERE id = ?', 
        [req.session.user.id],
        (error, results) => {
            if (error) throw error;
            
            res.render('editar-perfil', {
                user: req.session.user,
                userDetails: results[0],
                success: req.query.success,
                passwordError: null,      // Añade esto
                passwordSuccess: null,   // Añade esto
                error: null              // Para consistencia con la ruta POST
            });
        }
    );
});


// Ruta para procesar la edición del perfil
router.post('/editar-perfil', async (req, res) => {
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
        
        res.redirect('/editar-perfil?success=Perfil actualizado correctamente');
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

        res.render('editar-perfil', {
            user: req.session.user,
            userDetails: updatedUser[0],
            success: 'Contraseña cambiada correctamente',
            passwordError: null,
            passwordSuccess: 'Contraseña cambiada correctamente',
            error: null
        });
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

// ========== RUTAS DE ADMINISTRACIÓN UNIFICADAS ==========

// Formulario para nuevo hotel
router.get('/admin/hotels/new', isAuthenticated, isAdmin, (req, res) => {
    res.render('admin/hotels/form', { hotel: null, error: null, user: req.session.user });
});

// Guardar nuevo hotel
router.post('/admin/hotels', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, estado, coordenadas_lat, coordenadas_lng } = req.body;
        let imagen_principal = null;

        // Procesar la imagen si se subió una
        if (req.files && req.files.imagen_principal) {
            const file = req.files.imagen_principal;
            // Reemplazar espacios por guiones bajos en el nombre del archivo
            const safeFileName = file.name.replace(/\s+/g, '_');
            const fileName = `${Date.now()}-${safeFileName}`;
            const uploadPath = path.join(__dirname, '../public/uploads/hotels', fileName);
            
            // Asegurarse de que el directorio existe
            await fs.mkdir(path.join(__dirname, '../public/uploads/hotels'), { recursive: true });
            
            // Mover el archivo
            await file.mv(uploadPath);
            imagen_principal = `/uploads/hotels/${fileName}`;
        }

        const creado_por = req.session.user.id;
        const query = `INSERT INTO hoteles (nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal, coordenadas_lat, coordenadas_lng, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        // Validar que los campos requeridos no sean nulos
        if (!nombre || !direccion || !ciudad || !estrellas || !precio_base) {
            throw new Error('Todos los campos marcados con * son obligatorios');
        }

        await pool.query(query, [
            nombre,
            descripcion || '',
            direccion,
            ciudad,
            estrellas,
            precio_base,
            imagen_principal,
            coordenadas_lat || null,
            coordenadas_lng || null,
            estado || 'activo',
            creado_por
        ]);

        req.flash('success', 'Hotel creado exitosamente');
        res.redirect('/admin/hotels');
    } catch (error) {
        console.error('Error al guardar hotel:', error);
        req.flash('error', error.message || 'Error al guardar el hotel');
        res.render('admin/hotels/form', { 
            hotel: null, 
            error: error.message || 'Error al guardar el hotel', 
            user: req.session.user 
        });
    }
});

// Mostrar formulario de edición de hotel
router.get('/admin/hotels/:id/edit', isAdmin, async (req, res) => {
    try {
        const [hotels] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [req.params.id]);
        if (hotels.length === 0) return res.redirect('/admin/hotels');
        res.render('admin/hotels/edit', { hotel: hotels[0] });
    } catch (error) {
        console.error('Error al obtener hotel:', error);
        res.redirect('/admin/hotels');
    }
});

// Guardar edición de hotel
router.post('/admin/hotels/:id/edit', isAdmin, async (req, res) => {
    const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal } = req.body;
    try {
        await pool.query(
            'UPDATE hoteles SET nombre=?, descripcion=?, direccion=?, ciudad=?, estrellas=?, precio_base=?, imagen_principal=?, modificado_por=? WHERE id=?',
            [nombre, descripcion, direccion, ciudad, estrellas, precio_base, imagen_principal, req.session.user.id, req.params.id]
        );
        res.redirect('/admin/hotels');
    } catch (error) {
        console.error('Error al editar hotel:', error);
        res.redirect('/admin/hotels');
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

// Formulario de reserva de hotel (requiere sesión)
router.get('/hotel/reservar/:id', isAuthenticated, async (req, res) => {
    const hotelId = req.params.id;
    const [hoteles] = await pool.query('SELECT * FROM hoteles WHERE id = ?', [hotelId]);
    if (hoteles.length === 0) {
        return res.status(404).render('error', { message: 'Hotel no encontrado', user: req.session.user });
    }
    res.render('reservar-hotel', { hotel: hoteles[0], user: req.session.user });
});
// Guardar reserva de hotel (requiere sesión)
router.post('/hotel/reservar/:id', isAuthenticated, async (req, res) => {
    const hotelId = req.params.id;
    const { fecha_entrada, fecha_salida, num_personas } = req.body;
    try {
        await pool.query(
            'INSERT INTO reservas_hotel (usuario_id, hotel_id, check_in, check_out, num_huespedes, comentarios, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.user.id, hotelId, fecha_entrada, fecha_salida, num_personas, '', 'activa']
        );
        res.redirect('/?reserva=ok');
    } catch (error) {
        console.error('Error al guardar reserva de hotel:', error);
        res.render('error', { message: 'Error al guardar la reserva', user: req.session.user });
    }
});
// Formulario de reserva de restaurante (requiere sesión)
router.get('/restaurante/reservar/:id', isAuthenticated, async (req, res) => {
    const restauranteId = req.params.id;
    const [restaurantes] = await pool.query('SELECT * FROM restaurantes WHERE id = ?', [restauranteId]);
    if (restaurantes.length === 0) {
        return res.status(404).render('error', { message: 'Restaurante no encontrado', user: req.session.user });
    }
    res.render('reservar-restaurante', { restaurante: restaurantes[0], user: req.session.user });
});
// Guardar reserva de restaurante (requiere sesión)
router.get('/restaurante/pago-exitoso', isAuthenticated, async (req, res) => {
    const reserva = req.session.reservaRestaurante;
    if (!reserva) {
        return res.render('error', { message: 'No hay datos de reserva en sesión', user: req.session.user });
    }

    try {
        await pool.query(
            `INSERT INTO reservas_restaurante 
            (usuario_id, restaurante_id, fecha, hora, numero_personas, notas, monto_abono, estado, estado_pago) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session.user.id,
                reserva.restaurante_id,
                reserva.fecha,
                reserva.hora,
                reserva.numero_personas,
                reserva.notas || '',
                reserva.monto_abono,
                'pendiente',
                'pagado'
            ]
        );
        // Limpia la sesión
        req.session.reservaRestaurante = null;
        res.render('exito', { mensaje: '¡Reserva realizada y abono pagado con éxito!', user: req.session.user });
    } catch (error) {
        console.error('Error al guardar reserva después del pago:', error);
        res.render('error', { message: 'Error al guardar la reserva', user: req.session.user });
    }
});

//FALLO DE PAGO
router.get('/restaurante/pago-fallido', isAuthenticated, (req, res) => {
    res.render('error', { message: 'El pago no se completó. Intenta de nuevo.', user: req.session.user });
});


//PASARELA DE PAGO
const mercadopago = require('../mercadopago'); // Asegúrate de importar el archivo de config

router.post('/restaurante/abonar', isAuthenticated, async (req, res) => {
    const { restaurante_id, fecha, hora, numero_personas, notas, monto_abono } = req.body;

    // Guarda temporalmente los datos en la sesión para usarlos después del pago
    req.session.reservaRestaurante = { restaurante_id, fecha, hora, numero_personas, notas, monto_abono };

    const preference = {
        items: [
            {
                title: "Abono reserva restaurante",
                unit_price: parseFloat(monto_abono),
                quantity: 1,
            }
        ],
        back_urls: {
            success: "http://localhost:3000/restaurante/pago-exitoso",
            failure: "http://localhost:3000/restaurante/pago-fallido",
        },
        auto_return: "approved",
    };

    try {
        const response = await mercadopago.preferences.create(preference);
        res.redirect(response.body.init_point);
    } catch (error) {
        console.error('Error creando preferencia de pago:', error);
        res.render('error', { message: 'Error al iniciar el pago', user: req.session.user });
    }
});

module.exports = router; 