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
                        END as tipo_reserva
                 FROM historial_puntos hp
                 WHERE hp.usuario_id = ? 
                 ORDER BY hp.fecha DESC`,
                [usuarioId]
            );
            return historial;
        } catch (error) {
            console.error('Error al obtener historial de puntos:', error);
            throw error;
        }
    },

    // Agregar puntos al usuario
    agregarPuntos: async (usuarioId, puntos, descripcion, reservaId = null, tipoReserva = 'hotel') => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Obtener puntos actuales del usuario
            const [puntosUsuario] = await connection.query(
                'SELECT * FROM puntos_usuario WHERE usuario_id = ?',
                [usuarioId]
            );

            let puntosObj = puntosUsuario[0];
            if (!puntosObj) {
                // Si no existe, crear registro con nivel Bronce (id=1)
                const [result] = await connection.query(
                    'INSERT INTO puntos_usuario (usuario_id, nivel_id) VALUES (?, 1)',
                    [usuarioId]
                );
                puntosObj = {
                    id: result.insertId,
                    usuario_id: usuarioId,
                    nivel_id: 1,
                    puntos_totales: 0,
                    puntos_disponibles: 0
                };
            }

            // Actualizar puntos
            const nuevosPuntosTotales = puntosObj.puntos_totales + puntos;
            const nuevosPuntosDisponibles = puntosObj.puntos_disponibles + puntos;

            await connection.query(
                `UPDATE puntos_usuario 
                 SET puntos_totales = ?, puntos_disponibles = ?
                 WHERE usuario_id = ?`,
                [nuevosPuntosTotales, nuevosPuntosDisponibles, usuarioId]
            );

            // Registrar en historial
            const historialData = {
                usuario_id: usuarioId,
                tipo_operacion: 'ganado',
                puntos: puntos,
                descripcion: descripcion,
                fecha: new Date()
            };

            // Agregar el ID de reserva según el tipo
            if (tipoReserva === 'hotel') {
                historialData.reserva_hotel_id = reservaId;
            } else if (tipoReserva === 'restaurante') {
                historialData.reserva_restaurante_id = reservaId;
            }

            await connection.query(
                `INSERT INTO historial_puntos 
                 (usuario_id, tipo_operacion, puntos, descripcion, fecha, 
                  reserva_hotel_id, reserva_restaurante_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    historialData.usuario_id,
                    historialData.tipo_operacion,
                    historialData.puntos,
                    historialData.descripcion,
                    historialData.fecha,
                    historialData.reserva_hotel_id || null,
                    historialData.reserva_restaurante_id || null
                ]
            );

            // Verificar y actualizar nivel si es necesario
            const [nivelActual] = await connection.query(
                'SELECT * FROM niveles_usuario WHERE id = ?',
                [puntosObj.nivel_id]
            );

            if (!nivelActual || nivelActual.length === 0) {
                throw new Error('Nivel actual no encontrado');
            }

            const [siguienteNivel] = await connection.query(
                'SELECT * FROM niveles_usuario WHERE puntos_requeridos > ? ORDER BY puntos_requeridos ASC LIMIT 1',
                [nuevosPuntosTotales]
            );

            if (siguienteNivel && siguienteNivel.length > 0 && nuevosPuntosTotales >= siguienteNivel[0].puntos_requeridos) {
                await connection.query(
                    'UPDATE puntos_usuario SET nivel_id = ? WHERE usuario_id = ?',
                    [siguienteNivel[0].id, usuarioId]
                );
            }

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            console.error('Error al agregar puntos:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Redimir puntos
    redimirPuntos: async (usuarioId, puntos, descripcion, recompensaId = null) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Verificar puntos disponibles
            const [puntosUsuario] = await connection.query(
                'SELECT puntos_disponibles FROM puntos_usuario WHERE usuario_id = ?',
                [usuarioId]
            );

            if (!puntosUsuario[0] || puntosUsuario[0].puntos_disponibles < puntos) {
                throw new Error('Puntos insuficientes');
            }

            // Actualizar puntos disponibles
            await connection.query(
                `UPDATE puntos_usuario 
                 SET puntos_disponibles = puntos_disponibles - ?
                 WHERE usuario_id = ?`,
                [puntos, usuarioId]
            );

            // Registrar en historial
            await connection.query(
                `INSERT INTO historial_puntos 
                 (usuario_id, tipo_operacion, puntos, descripcion, recompensa_redimida_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuarioId, 'redimido', puntos, descripcion, recompensaId]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            console.error('Error al redimir puntos:', error);
            throw error;
        } finally {
            connection.release();
        }
    },

    // Deducir puntos al cancelar una reserva
    deducirPuntosReserva: async (usuarioId, reservaId, tipoReserva) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Encontrar el registro de historial_puntos donde se ganaron puntos por esta reserva
            const reservaIdColumn = tipoReserva === 'hotel' ? 'reserva_hotel_id' : 'reserva_restaurante_id';
            const [historial] = await connection.query(
                `SELECT * FROM historial_puntos 
                 WHERE usuario_id = ? AND ${reservaIdColumn} = ? AND tipo_operacion = 'ganado'`,
                [usuarioId, reservaId]
            );

            if (historial.length === 0) {
                console.warn(`No se encontraron puntos ganados para la reserva ${tipoReserva} ${reservaId} del usuario ${usuarioId}. No se deducen puntos.`);
                await connection.rollback(); // Aunque no haya puntos, revertir por si acaso
                return; // No hay puntos que deducir
            }

            const puntosAGanadosOriginalmente = historial[0].puntos;

            // 2. Deducir los puntos del usuario
            const [puntosUsuario] = await connection.query(
                'SELECT puntos_totales, puntos_disponibles FROM puntos_usuario WHERE usuario_id = ?',
                [usuarioId]
            );

            if (puntosUsuario.length > 0) {
                const nuevosPuntosTotales = Math.max(0, puntosUsuario[0].puntos_totales - puntosAGanadosOriginalmente);
                // Deducir de puntos_disponibles, pero no dejarlo negativo por debajo de 0 (aunque puntos_totales si puede ser mayor que disponibles si se redimen)
                const nuevosPuntosDisponibles = Math.max(0, puntosUsuario[0].puntos_disponibles - puntosAGanadosOriginalmente);

                await connection.query(
                    `UPDATE puntos_usuario 
                     SET puntos_totales = ?, puntos_disponibles = ?
                     WHERE usuario_id = ?`,
                    [nuevosPuntosTotales, nuevosPuntosDisponibles, usuarioId]
                );
            }

            // 3. Registrar la deducción en el historial
             await connection.query(
                `INSERT INTO historial_puntos 
                 (usuario_id, tipo_operacion, puntos, descripcion, fecha, 
                  ${reservaIdColumn}) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [usuarioId, 'deducido', -puntosAGanadosOriginalmente, `Puntos deducidos por cancelación de reserva ${tipoReserva} #${reservaId}`, new Date(), reservaId]
            );

            // Nota: La actualización de nivel hacia abajo no se implementa aquí por simplicidad, pero podría ser necesaria.

            await connection.commit();
            console.log(`Puntos deducidos (${puntosAGanadosOriginalmente}) para reserva ${tipoReserva} ${reservaId} del usuario ${usuarioId}.`);

        } catch (error) {
            await connection.rollback();
            console.error(`Error al deducir puntos por cancelación de reserva ${tipoReserva} ${reservaId}:`, error);
            // Propagar el error si es crítico para que la ruta que llamó pueda manejarlo
            throw error; 
        } finally {
            connection.release();
        }
    }
};

module.exports = puntosController; 