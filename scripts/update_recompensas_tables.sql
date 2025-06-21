ALTER TABLE recompensas_redimidas ADD COLUMN codigo VARCHAR(50) NOT NULL UNIQUE;
UPDATE recompensas SET estado = 'activa';
ALTER TABLE recompensas MODIFY COLUMN estado VARCHAR(20) NOT NULL;
ALTER TABLE recompensas_redimidas ADD COLUMN fecha_canje TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE recompensas_redimidas ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'valido'; 