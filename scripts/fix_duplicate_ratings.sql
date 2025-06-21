-- Script para limpiar calificaciones duplicadas y agregar restricciones únicas

-- 1. Eliminar calificaciones duplicadas de restaurante, manteniendo solo la más reciente
DELETE r1 FROM resenas_restaurante r1
INNER JOIN resenas_restaurante r2 
WHERE r1.id < r2.id 
AND r1.reserva_id = r2.reserva_id 
AND r1.usuario_id = r2.usuario_id;

-- 2. Eliminar calificaciones duplicadas de hotel, manteniendo solo la más reciente
DELETE r1 FROM resenas_hotel r1
INNER JOIN resenas_hotel r2 
WHERE r1.id < r2.id 
AND r1.reserva_id = r2.reserva_id 
AND r1.usuario_id = r2.usuario_id;

-- 3. Agregar restricción única para evitar futuras duplicaciones en resenas_restaurante
-- Primero verificar si la restricción ya existe
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = DATABASE() 
    AND table_name = 'resenas_restaurante' 
    AND constraint_name = 'unique_usuario_reserva_restaurante'
);

SET @sql = IF(@constraint_exists = 0,
    'ALTER TABLE resenas_restaurante ADD CONSTRAINT unique_usuario_reserva_restaurante UNIQUE (usuario_id, reserva_id)',
    'SELECT "Restricción única ya existe en resenas_restaurante" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Agregar restricción única para evitar futuras duplicaciones en resenas_hotel
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = DATABASE() 
    AND table_name = 'resenas_hotel' 
    AND constraint_name = 'unique_usuario_reserva_hotel'
);

SET @sql = IF(@constraint_exists = 0,
    'ALTER TABLE resenas_hotel ADD CONSTRAINT unique_usuario_reserva_hotel UNIQUE (usuario_id, reserva_id)',
    'SELECT "Restricción única ya existe en resenas_hotel" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Verificar que las restricciones se aplicaron correctamente
SELECT 
    'resenas_restaurante' as tabla,
    COUNT(*) as total_resenas,
    COUNT(DISTINCT CONCAT(usuario_id, '-', reserva_id)) as reservas_unicas
FROM resenas_restaurante
UNION ALL
SELECT 
    'resenas_hotel' as tabla,
    COUNT(*) as total_resenas,
    COUNT(DISTINCT CONCAT(usuario_id, '-', reserva_id)) as reservas_unicas
FROM resenas_hotel; 