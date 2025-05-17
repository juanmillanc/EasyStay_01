/*const mysql = require('mysql2'); // En lugar de require('mysql')

const conexion = mysql.createConnection({
    host: 'localhost',
    database: 'easystay_p',
    user: 'root',
    password: 'root',
    insecureAuth: true
    
});

conexion.connect((error)=> {
    if (error){
        console.error('El error de conexion es: '+error);
        return
    }
    console.log('¡Conectado a la BD mysql!');    
})

module.exports = conexion;*/

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    database: 'easystay_p',
    user: 'root',
    password: 'root',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificación de conexión al iniciar
pool.getConnection()
    .then(connection => {
        console.log('✅ Conectado a la base de datos MySQL');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error al conectar a MySQL:', err);
    });

// Manejo de errores del pool
pool.on('error', (err) => {
    console.error('Error en el pool de conexiones:', err);
});

module.exports = pool;