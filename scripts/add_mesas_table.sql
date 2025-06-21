-- Crear la tabla de mesas, si no existe
CREATE TABLE IF NOT EXISTS mesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    numero_mesa VARCHAR(10) NOT NULL,
    capacidad INT NOT NULL,
    estado ENUM('disponible', 'ocupada', 'reservada', 'mantenimiento') DEFAULT 'disponible',
    
    -- Clave foránea para relacionar con la tabla de restaurantes
    -- Asumiendo que la tabla de restaurantes se llama 'restaurantes'
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,

    -- Asegurar que el número de mesa sea único por restaurante
    UNIQUE KEY (restaurante_id, numero_mesa)
);

-- Índices para mejorar el rendimiento de las búsquedas
CREATE INDEX idx_mesas_restaurante ON mesas(restaurante_id);
CREATE INDEX idx_mesas_estado ON mesas(estado);

-- Si la columna 'estado' no existe, agregarla
ALTER TABLE mesas 
ADD COLUMN IF NOT EXISTS estado ENUM('disponible', 'ocupada', 'reservada', 'mantenimiento') DEFAULT 'disponible';

-- Comentario para el desarrollador:
-- Después de ejecutar este script, no olvides aplicar los cambios en el modelo de datos de la aplicación
-- y crear las rutas del backend para gestionar las mesas desde el panel de administrador. 