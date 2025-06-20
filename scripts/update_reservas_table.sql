-- Este script actualiza la tabla de reservas de restaurante para vincularla con la tabla de mesas.
-- Es importante hacer una copia de seguridad de tus datos antes de ejecutarlo.

-- Paso 1: Añadir la columna 'mesa_id' que se vinculará a la tabla 'mesas'
ALTER TABLE `reservas_restaurante`
ADD COLUMN `mesa_id` INT NULL AFTER `restaurante_id`;

-- Paso 2: Añadir una clave foránea para asegurar la integridad de los datos
-- Esto asegura que cada reserva esté asociada a una mesa que realmente existe.
ALTER TABLE `reservas_restaurante`
ADD CONSTRAINT `fk_reserva_mesa`
FOREIGN KEY (`mesa_id`) REFERENCES `mesas`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- Paso 3 (Opcional): Eliminar la columna antigua 'num_mesa' si ya no se necesita.
-- Descomenta la siguiente línea si quieres eliminarla. Se recomienda hacerlo
-- solo si no tienes datos importantes en esa columna que no puedas migrar.
-- ALTER TABLE `reservas_restaurante` DROP COLUMN `num_mesa`;

-- Comentario para el desarrollador:
-- Después de ejecutar este script, las nuevas reservas se guardarán con 'mesa_id'.
-- La lógica para consultar mesas disponibles ahora puede usar esta nueva columna para hacer un JOIN. 