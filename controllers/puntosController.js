const pool = require('../databases/db');

const puntosController = {
    // Obtener puntos del usuario
    getPuntosUsuario: async (usuarioId) => {
        try {
            const [puntos] = await pool.query(
                `SELECT pu.*, nu.nombre as nivel_nombre, nu.multiplicador_puntos, nu.beneficios
                 FROM puntos_usuario pu
                 JOIN niveles_usuario nu ON pu.nivel_id = nu.id
                 WHERE pu.usuario_id = ?`,
                [usuarioId]
            );
            return puntos[0] || null;
        } catch (error) {
            console.error('Error al obtener puntos del usuario:', error);
            throw error;
        }
    },

    // Obtener historial de puntos
    getHistorialPuntos: async (usuarioId) => {
        try {
            const [historial] = await pool.query(
                `SELECT hp.*, 
                        CASE 
                            WHEN hp.reserva_hotel_id IS NOT NULL THEN 'Hotel'
                            WHEN hp.reserva_restaurante_id IS NOT NULL THEN 'Restaurante'
                            WHEN hp.recompensa_redimida_id IS NOT NULL THEN 'Recompensa'
                            ELSE 'Otro'
                        END as origen,
                        h.nombre as nombre_hotel,
                        rest.nombre as nombre_restaurante,
                        r.nombre as nombre_recompensa,
                        r_red.codigo as codigo_recompensa
                 FROM historial_puntos hp
                 LEFT JOIN reservas_hotel rh ON hp.reserva_hotel_id = rh.id
                 LEFT JOIN hoteles h ON rh.hotel_id = h.id
                 LEFT JOIN reservas_restaurante rr ON hp.reserva_restaurante_id = rr.id
                 LEFT JOIN restaurantes rest ON rr.restaurante_id = rest.id
                 LEFT JOIN recompensas_redimidas r_red ON hp.recompensa_redimida_id = r_red.id
                 LEFT JOIN recompensas r ON r_red.recompensa_id = r.id
                 WHERE hp.usuario_id = ? 
                 ORDER BY hp.fecha DESC`,
                [usuarioId]
            );
            return historial;
        } catch (error) {
            console.error('Error al obtener el historial de puntos:', error);
            throw error;
        }
    },

    // Sumar puntos por reserva de hotel
    sumarPuntosReservaHotel: async (usuarioId, reservaHotelId, montoTotal) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [nivel] = await connection.query('SELECT nivel_id FROM puntos_usuario WHERE usuario_id = ?', [usuarioId]);
            const [multiplicador] = await connection.query('SELECT multiplicador_puntos FROM niveles_usuario WHERE id = ?', [nivel[0].nivel_id]);
            const puntosGanados = Math.floor(montoTotal * multiplicador[0].multiplicador_puntos);

            await connection.query(
                'INSERT INTO historial_puntos (usuario_id, tipo_operacion, puntos, descripcion, reserva_hotel_id, fecha) VALUES (?, ?, ?, ?, ?, NOW())',
                [usuarioId, 'ganado', puntosGanados, 'Reserva de hotel', reservaHotelId]
            );

            await connection.query(
                'UPDATE puntos_usuario SET puntos_disponibles = puntos_disponibles + ? WHERE usuario_id = ?',
                [puntosGanados, usuarioId]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            console.error('Error al sumar puntos por reserva de hotel:', error);
            throw error;
        } finally {
            connection.release();
        }
    },
    
    // Sumar puntos por reserva de restaurante
    sumarPuntosReservaRestaurante: async (usuarioId, reservaRestauranteId, montoTotal) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [nivel] = await connection.query('SELECT nivel_id FROM puntos_usuario WHERE usuario_id = ?', [usuarioId]);
            const [multiplicador] = await connection.query('SELECT multiplicador_puntos FROM niveles_usuario WHERE id = ?', [nivel[0].nivel_id]);
            const puntosGanados = Math.floor(montoTotal * multiplicador[0].multiplicador_puntos);

            await connection.query(
                'INSERT INTO historial_puntos (usuario_id, tipo_operacion, puntos, descripcion, reserva_restaurante_id, fecha) VALUES (?, ?, ?, ?, ?, NOW())',
                [usuarioId, 'ganado', puntosGanados, 'Reserva de restaurante', reservaRestauranteId]
            );

            await connection.query(
                'UPDATE puntos_usuario SET puntos_disponibles = puntos_disponibles + ? WHERE usuario_id = ?',
                [puntosGanados, usuarioId]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            console.error('Error al sumar puntos por reserva de restaurante:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Deducir puntos (ej. cancelación)
    deducirPuntosReserva: async (usuarioId, reservaId, tipoReserva) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [historial] = await connection.query(
                `SELECT puntos FROM historial_puntos WHERE usuario_id = ? AND ${tipoReserva === 'hotel' ? 'reserva_hotel_id' : 'reserva_restaurante_id'} = ? AND tipo_operacion = 'ganado'`,
                [usuarioId, reservaId]
            );

            if (historial.length > 0) {
                const puntosADeducir = historial[0].puntos;
                await connection.query(
                    'UPDATE puntos_usuario SET puntos_disponibles = puntos_disponibles - ? WHERE usuario_id = ?',
                    [puntosADeducir, usuarioId]
                );
                await connection.query(
                    'INSERT INTO historial_puntos (usuario_id, tipo_operacion, puntos, descripcion, fecha) VALUES (?, ?, ?, ?, NOW())',
                    [usuarioId, 'deducido', puntosADeducir, `Cancelación de reserva de ${tipoReserva}`]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            console.error('Error al deducir puntos por cancelación:', error);
            throw error;
        } finally {
            connection.release();
        }
    },
    
    // Canjear una recompensa
    canjearRecompensa: async (usuarioId, recompensaId) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [recompensas] = await connection.query('SELECT * FROM recompensas WHERE id = ?', [recompensaId]);
            if (recompensas.length === 0) throw new Error('La recompensa no existe.');
            const recompensa = recompensas[0];

            const [puntosUsuarios] = await connection.query('SELECT * FROM puntos_usuario WHERE usuario_id = ?', [usuarioId]);
            if (puntosUsuarios.length === 0) throw new Error('Usuario sin registro de puntos.');
            const puntosUsuario = puntosUsuarios[0];

            if (puntosUsuario.puntos_disponibles < recompensa.puntos_requeridos) {
                throw new Error('Puntos insuficientes para canjear esta recompensa.');
            }

            const codigo = `EASY-${Date.now().toString().slice(-6)}-${usuarioId}`;

            const [result] = await connection.query(
                'INSERT INTO recompensas_redimidas (usuario_id, recompensa_id, codigo, puntos_usados) VALUES (?, ?, ?, ?)',
                [usuarioId, recompensaId, codigo, recompensa.puntos_requeridos]
            );
            const nuevaRecompensaRedimidaId = result.insertId;

            await connection.query(
                'INSERT INTO historial_puntos (usuario_id, tipo_operacion, puntos, descripcion, recompensa_redimida_id, fecha) VALUES (?, ?, ?, ?, ?, NOW())',
                [usuarioId, 'redimido', recompensa.puntos_requeridos, `Canje de recompensa: ${recompensa.nombre}`, nuevaRecompensaRedimidaId]
            );

            await connection.query(
                'UPDATE puntos_usuario SET puntos_disponibles = puntos_disponibles - ? WHERE usuario_id = ?',
                [recompensa.puntos_requeridos, usuarioId]
            );
            
            await connection.commit();
            return { success: true, codigo: codigo };

        } catch (error) {
            await connection.rollback();
            console.error("Error en la lógica de canje:", error.message);
            throw error; 
        } finally {
            connection.release();
        }
    },
    
    getCuponesUsuario: async (usuarioId) => {
        try {
            const [cupones] = await pool.query(
                `SELECT 
                    rr.codigo, 
                    rr.fecha_canje, 
                    rr.estado, 
                    r.nombre, 
                    r.descripcion,
                    DATE_ADD(rr.fecha_canje, INTERVAL 30 DAY) as fecha_expiracion
                 FROM recompensas_redimidas rr
                 JOIN recompensas r ON rr.recompensa_id = r.id
                 WHERE rr.usuario_id = ?
                 ORDER BY rr.fecha_canje DESC`,
                [usuarioId]
            );
            return cupones;
        } catch (error) {
            console.error('Error al obtener los cupones del usuario:', error);
            throw error;
        }
    },

    // Agregar puntos manualmente por un administrador
    agregarPuntosManualmente: async (usuarioId, puntos, descripcion) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verificar que el usuario exista en la tabla de puntos
            const [puntosUsuarios] = await connection.query('SELECT * FROM puntos_usuario WHERE usuario_id = ?', [usuarioId]);
            if (puntosUsuarios.length === 0) {
                 // Si no existe, lo creamos con nivel inicial 1
                await connection.query('INSERT INTO puntos_usuario (usuario_id, nivel_id, puntos_disponibles, puntos_totales) VALUES (?, 1, 0, 0)', [usuarioId]);
            }

            // Insertar en el historial
            await connection.query(
                'INSERT INTO historial_puntos (usuario_id, tipo_operacion, puntos, descripcion, fecha) VALUES (?, ?, ?, ?, NOW())',
                [usuarioId, 'manual', puntos, descripcion]
            );

            // Actualizar el total de puntos del usuario
            await connection.query(
                'UPDATE puntos_usuario SET puntos_disponibles = puntos_disponibles + ?, puntos_totales = puntos_totales + ? WHERE usuario_id = ?',
                [puntos, puntos, usuarioId]
            );
            
            await connection.commit();
            return { success: true };

        } catch (error) {
            await connection.rollback();
            console.error("Error al agregar puntos manualmente:", error.message);
            throw error; 
        } finally {
            connection.release();
        }
    }
};

module.exports = puntosController;