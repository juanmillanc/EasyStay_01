-- Añadir columnas de calificación a la tabla hoteles
ALTER TABLE hoteles
ADD COLUMN calificacion_promedio DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN total_calificaciones INT DEFAULT 0;

-- Añadir columnas de calificación a la tabla restaurantes
ALTER TABLE restaurantes
ADD COLUMN calificacion_promedio DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN total_calificaciones INT DEFAULT 0; 