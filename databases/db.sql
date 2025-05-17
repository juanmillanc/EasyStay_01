-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rol ENUM('usuario', 'admin', 'superadmin') DEFAULT 'usuario',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_sesion TIMESTAMP NULL,
    estado ENUM('activo', 'inactivo') DEFAULT 'activo'
);

-- Tabla de reservas de hotel
CREATE TABLE IF NOT EXISTS reservas_hotel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    hotel_id INT NOT NULL,
    habitacion_id INT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    num_huespedes INT NOT NULL,
    tipo_habitacion ENUM('individual', 'doble', 'suite') NOT NULL,
    estado ENUM('activa', 'inactiva') DEFAULT 'activa',
    comentarios TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabla de reservas de restaurante
CREATE TABLE IF NOT EXISTS reservas_restaurante (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    restaurante_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    num_personas INT NOT NULL,
    num_mesa VARCHAR(10),
    estado ENUM('activa', 'inactiva') DEFAULT 'activa',
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    monto_abono DECIMAL(10,2) DEFAULT 0,
    estado_pago VARCHAR(20) DEFAULT 'pendiente',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_reservas_hotel_usuario ON reservas_hotel(usuario_id);
CREATE INDEX idx_reservas_hotel_estado ON reservas_hotel(estado);
CREATE INDEX idx_reservas_restaurante_usuario ON reservas_restaurante(usuario_id);
CREATE INDEX idx_reservas_restaurante_estado ON reservas_restaurante(estado); 