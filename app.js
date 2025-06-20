const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const fileUpload = require('express-fileupload');
const pool = require('./databases/db'); // Importa el pool configurado

const app = express();

// Configuración de sesión
app.use(session({
    secret: 'tu_secreto_aqui',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Configuración de flash messages
app.use(flash());

// Middleware para pasar variables a vistas
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Configuración del motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de express-fileupload
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // límite de 50MB
    createParentPath: true
}));

// Configuración de rutas
app.use('/', require('./router/auth')); // Rutas de autenticación y de usuario
app.use('/admin', require('./router/admin')); // Rutas de admin
app.use('/', require('./router')); // Rutas generales (debe ir al final)

// Rutas de hoteles (ejemplo)
app.get('/hotels/marina-resort', (req, res) => {
    res.render('hotels/marina-resort');
});

app.get('/hotels/city-lights', (req, res) => {
    res.render('hotels/city-lights');
});

app.get('/hotels/mountain-view', (req, res) => {
    res.render('hotels/mountain-view');
});

// Middleware para logging
app.use((req, res, next) => {
    console.log('Petición:', req.method, req.url);
    next();
});

// Manejador de errores 404
app.use((req, res, next) => {
    res.status(404).render('error', {
        message: 'Página no encontrada',
        user: req.session.user
    });
});

// Manejador de errores general
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Error interno del servidor',
        user: req.session.user
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('\n=== SERVIDOR INICIADO ===');
    console.log(`http://localhost:${PORT}`);
    console.log('========================\n');
});