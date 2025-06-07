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

-- Tabla de niveles de usuario
CREATE TABLE IF NOT EXISTS niveles_usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    puntos_requeridos INT NOT NULL,
    multiplicador_puntos DECIMAL(3,2) DEFAULT 1.00,
    descripcion TEXT,
    beneficios TEXT
);

-- Tabla de puntos de usuario
CREATE TABLE IF NOT EXISTS puntos_usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nivel_id INT NOT NULL,
    puntos_totales INT DEFAULT 0,
    puntos_disponibles INT DEFAULT 0,
    fecha_ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (nivel_id) REFERENCES niveles_usuario(id)
);

-- Tabla de historial de puntos
CREATE TABLE IF NOT EXISTS historial_puntos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    puntos INT NOT NULL,
    tipo ENUM('ganado', 'redimido') NOT NULL,
    descripcion TEXT,
    reserva_id INT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabla de tickets de soporte
CREATE TABLE IF NOT EXISTS tickets_soporte (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL, -- Puede ser nulo si el usuario no estaba autenticado o el fallo es general
    tipo_incidente VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    detalles_error TEXT, -- Para almacenar detalles técnicos del error
    estado ENUM('abierto', 'en_progreso', 'cerrado') DEFAULT 'abierto',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reserva_hotel_id INT NULL,
    reserva_restaurante_id INT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (reserva_hotel_id) REFERENCES reservas_hotel(id) ON DELETE SET NULL,
    FOREIGN KEY (reserva_restaurante_id) REFERENCES reservas_restaurante(id) ON DELETE SET NULL
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_reservas_hotel_usuario ON reservas_hotel(usuario_id);
CREATE INDEX idx_reservas_hotel_estado ON reservas_hotel(estado);
CREATE INDEX idx_reservas_restaurante_usuario ON reservas_restaurante(usuario_id);
CREATE INDEX idx_reservas_restaurante_estado ON reservas_restaurante(estado);
CREATE INDEX idx_puntos_usuario_nivel ON puntos_usuario(nivel_id);
CREATE INDEX idx_historial_puntos_usuario ON historial_puntos(usuario_id);
CREATE INDEX idx_historial_puntos_fecha ON historial_puntos(fecha);

-- Insertar niveles por defecto
INSERT INTO niveles_usuario (nombre, puntos_requeridos, multiplicador_puntos, descripcion, beneficios) VALUES
('Bronce', 0, 1.00, 'Nivel inicial', 'Acceso básico a recompensas'),
('Plata', 1000, 1.25, 'Nivel intermedio', 'Multiplicador de puntos 1.25x'),
('Oro', 5000, 1.50, 'Nivel avanzado', 'Multiplicador de puntos 1.50x'),
('Platino', 10000, 2.00, 'Nivel premium', 'Multiplicador de puntos 2.00x'); 