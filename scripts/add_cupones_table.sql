CREATE TABLE IF NOT EXISTS cupones_canjeados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    recompensa_id INT NOT NULL,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    fecha_canje TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(50) NOT NULL DEFAULT 'valido',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (recompensa_id) REFERENCES recompensas(id)
); 