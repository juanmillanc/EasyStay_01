-- Crear tabla de reseñas de restaurante
CREATE TABLE IF NOT EXISTS resenas_restaurante (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    restaurante_id INT NOT NULL,
    reserva_id INT NOT NULL,
    puntuacion INT NOT NULL CHECK (puntuacion >= 1 AND puntuacion <= 5),
    comentario TEXT NOT NULL,
    estado ENUM('activa', 'inactiva') DEFAULT 'activa',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (reserva_id) REFERENCES reservas_restaurante(id) ON DELETE CASCADE
);

-- Crear tabla de reseñas de hotel
CREATE TABLE IF NOT EXISTS resenas_hotel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    hotel_id INT NOT NULL,
    reserva_id INT NOT NULL,
    puntuacion INT NOT NULL CHECK (puntuacion >= 1 AND puntuacion <= 5),
    comentario TEXT NOT NULL,
    estado ENUM('activa', 'inactiva') DEFAULT 'activa',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (reserva_id) REFERENCES reservas_hotel(id) ON DELETE CASCADE
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_resenas_restaurante_usuario ON resenas_restaurante(usuario_id);
CREATE INDEX idx_resenas_restaurante_restaurante ON resenas_restaurante(restaurante_id);
CREATE INDEX idx_resenas_restaurante_reserva ON resenas_restaurante(reserva_id);
CREATE INDEX idx_resenas_restaurante_estado ON resenas_restaurante(estado);

CREATE INDEX idx_resenas_hotel_usuario ON resenas_hotel(usuario_id);
CREATE INDEX idx_resenas_hotel_hotel ON resenas_hotel(hotel_id);
CREATE INDEX idx_resenas_hotel_reserva ON resenas_hotel(reserva_id);
CREATE INDEX idx_resenas_hotel_estado ON resenas_hotel(estado); 