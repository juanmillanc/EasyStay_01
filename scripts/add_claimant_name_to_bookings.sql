-- Añadir la columna nombre_reclamo a la tabla de reservas de restaurante
-- Esto permite registrar quién reclama la reserva si es diferente del usuario que la hizo.

ALTER TABLE `reservas_restaurante`
ADD COLUMN `nombre_reclamo` VARCHAR(255) NULL DEFAULT NULL COMMENT 'Nombre de la persona a cargo de la reserva, si es diferente al titular de la cuenta.' AFTER `notas`; 