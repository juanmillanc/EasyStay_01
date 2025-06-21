const db = require('../databases/db');
const path = require('path');
const fs = require('fs').promises;

// Configuración para el manejo de imágenes
const uploadDir = path.join(__dirname, '../public/uploads/hotels');

// Asegurar que el directorio de uploads existe
(async () => {
    try {
        await fs.access(uploadDir);
    } catch {
        await fs.mkdir(uploadDir, { recursive: true });
    }
})();

// Función para reconstruir el array de habitaciones desde el body
function parseHabitaciones(body) {
    const habitaciones = [];
    let i = 0;
    while (body[`habitaciones[${i}][tipo]`] !== undefined) {
        habitaciones.push({
            tipo: body[`habitaciones[${i}][tipo]`],
            capacidad: body[`habitaciones[${i}][capacidad]`],
            precio: body[`habitaciones[${i}][precio]`],
            cantidad_disponible: body[`habitaciones[${i}][cantidad_disponible]`],
            descripcion: body[`habitaciones[${i}][descripcion]`]
        });
        i++;
    }
    return habitaciones;
}

const hotelController = {
    // Listar todos los hoteles
    index: async (req, res) => {
        try {
            const [hotels] = await db.query(`
                SELECT h.*, 
                       c.*,
                       GROUP_CONCAT(
                           JSON_OBJECT(
                               'id', hab.id,
                               'tipo', hab.tipo,
                               'descripcion', hab.descripcion,
                               'capacidad', hab.capacidad,
                               'precio', hab.precio,
                               'cantidad_disponible', hab.cantidad_disponible,
                               'estado', hab.estado
                           )
                       ) as habitaciones
                FROM hoteles h 
                LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
                LEFT JOIN habitaciones hab ON h.id = hab.hotel_id
                GROUP BY h.id
                ORDER BY h.fecha_creacion DESC
            `);

            // Procesar los resultados
            const processedHotels = hotels.map(hotel => {
                const processedHotel = {...hotel};
                
                // Procesar características
                if (hotel.wifi !== null) {
                    processedHotel.caracteristicas = {
                        wifi: hotel.wifi,
                        parking: hotel.parking,
                        piscina: hotel.piscina,
                        restaurante: hotel.restaurante,
                        aire_acondicionado: hotel.aire_acondicionado,
                        gimnasio: hotel.gimnasio,
                        spa: hotel.spa,
                        bar: hotel.bar,
                        mascotas: hotel.mascotas
                    };
                }

                // Procesar habitaciones
                if (hotel.habitaciones) {
                    processedHotel.habitaciones = hotel.habitaciones
                        .split(',')
                        .map(hab => JSON.parse(hab));
                } else {
                    processedHotel.habitaciones = [];
                }

                return processedHotel;
            });

            // --- DEBUG LOG ---
            console.log('Hoteles procesados para listado (incluyendo habitaciones):', processedHotels);
            // --- END DEBUG LOG ---

            // Obtener ciudades únicas para el filtro
            const [cities] = await db.query('SELECT DISTINCT ciudad FROM hoteles ORDER BY ciudad');

            res.render('admin/hotels/index', {
                hotels: processedHotels,
                cities: cities.map(row => row.ciudad),
                user: req.session.user,
                path: '/admin/hotels'
            });
        } catch (error) {
            console.error('Error al listar hoteles:', error);
            req.flash('error', 'Error al cargar los hoteles');
            res.redirect('/admin/dashboard');
        }
    },

    // Mostrar formulario de creación
    create: (req, res) => {
        res.render('admin/hotels/form', { 
            hotel: null,
            user: req.session.user,
            path: '/admin/hotels/new'
        });
    },

    // Guardar nuevo hotel
    store: async (req, res) => {
        const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, estado, coordenadas_lat, coordenadas_lng } = req.body;

        // Validaciones de campos obligatorios
        if (!nombre || !descripcion || !direccion || !ciudad || !estrellas || !precio_base || !coordenadas_lat || !coordenadas_lng) {
            req.flash('error', 'Por favor, completa todos los campos obligatorios (*).');
            return res.redirect('/admin/hotels/new');
        }

        // Validar si el nombre del hotel ya existe
        const [existingHotels] = await db.query('SELECT id FROM hoteles WHERE nombre = ?', [nombre]);
        if (existingHotels.length > 0) {
            console.log(`[DEBUG] Intentando crear hotel con nombre duplicado: ${nombre}`);
            req.flash('error', 'Ya existe un hotel con este nombre. Por favor, elige uno diferente.');
            return res.redirect('/admin/hotels/new');
        }

        // Reemplazar coma por punto en coordenadas
        const lat = coordenadas_lat ? coordenadas_lat.replace(',', '.') : null;
        const lng = coordenadas_lng ? coordenadas_lng.replace(',', '.') : null;
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            let imagePath = null;
            if (req.files && req.files.imagen_principal) {
                const file = req.files.imagen_principal;
                const fileName = `${Date.now()}-${file.name}`;
                imagePath = `/uploads/hotels/${fileName}`;
                await file.mv(path.join(uploadDir, fileName));
            }

            // Insertar hotel
            const [result] = await connection.query(`
                INSERT INTO hoteles (
                    nombre, descripcion, direccion, ciudad, estrellas,
                    precio_base, imagen_principal, coordenadas_lat, coordenadas_lng,
                    estado, creado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                nombre,
                descripcion,
                direccion,
                ciudad,
                estrellas,
                precio_base,
                imagePath,
                lat,
                lng,
                estado,
                req.session.user.id
            ]);

            const hotelId = result.insertId;

            // Insertar características
            await connection.query(`
                INSERT INTO caracteristicas_hotel (
                    hotel_id, wifi, parking, piscina, restaurante,
                    aire_acondicionado, gimnasio, spa, bar, mascotas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                hotelId,
                req.body.wifi ? 1 : 0,
                req.body.parking ? 1 : 0,
                req.body.piscina ? 1 : 0,
                req.body.restaurante ? 1 : 0,
                req.body.aire_acondicionado ? 1 : 0,
                req.body.gimnasio ? 1 : 0,
                req.body.spa ? 1 : 0,
                req.body.bar ? 1 : 0,
                req.body.mascotas ? 1 : 0
            ]);

            // Procesar habitaciones correctamente
            const habitaciones = parseHabitaciones(req.body);
            if (habitaciones.length > 0) {
                for (const habitacion of habitaciones) {
                    await connection.query(`
                        INSERT INTO habitaciones (
                            hotel_id, tipo, descripcion, capacidad,
                            precio, cantidad_disponible, estado
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        hotelId,
                        habitacion.tipo,
                        habitacion.descripcion,
                        habitacion.capacidad,
                        habitacion.precio,
                        habitacion.cantidad_disponible,
                        'disponible'
                    ]);
                }
            }

            await connection.commit();
            req.flash('success', 'Hotel creado exitosamente');
            res.redirect('/admin/hotels');
        } catch (error) {
            await connection.rollback();
            console.error('Error al crear hotel:', error);
            req.flash('error', 'Error al crear el hotel');
            res.redirect('/admin/hotels/new');
        } finally {
            connection.release();
        }
    },

    // Mostrar formulario de edición
    edit: async (req, res) => {
        try {
            const [hotels] = await db.query(`
                SELECT h.*, 
                       ANY_VALUE(c.id) as caracteristica_id,
                       ANY_VALUE(c.wifi) as wifi,
                       ANY_VALUE(c.parking) as parking,
                       ANY_VALUE(c.piscina) as piscina,
                       ANY_VALUE(c.restaurante) as restaurante,
                       ANY_VALUE(c.aire_acondicionado) as aire_acondicionado,
                       ANY_VALUE(c.gimnasio) as gimnasio,
                       ANY_VALUE(c.spa) as spa,
                       ANY_VALUE(c.bar) as bar,
                       ANY_VALUE(c.mascotas) as mascotas,
                       GROUP_CONCAT(
                           JSON_OBJECT(
                               'id', hab.id,
                               'tipo', hab.tipo,
                               'descripcion', hab.descripcion,
                               'capacidad', hab.capacidad,
                               'precio', hab.precio,
                               'cantidad_disponible', hab.cantidad_disponible,
                               'estado', hab.estado
                           ) SEPARATOR '###'
                       ) as habitaciones
                FROM hoteles h
                LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
                LEFT JOIN habitaciones hab ON h.id = hab.hotel_id
                WHERE h.id = ?
                GROUP BY h.id
            `, [req.params.id]);

            if (hotels.length === 0) {
                req.flash('error', 'Hotel no encontrado');
                return res.redirect('/admin/hotels');
            }

            const hotel = {...hotels[0]};
            
            // --- DEBUG LOG: Raw habitaciones data from DB ---
            console.log('DEBUG: Raw habitaciones data from DB:', hotel.habitaciones);
            // --- END DEBUG LOG ---

            // Procesar características
            if (hotel.wifi !== null) {
                hotel.caracteristicas = {
                    wifi: hotel.wifi,
                    parking: hotel.parking,
                    piscina: hotel.piscina,
                    restaurante: hotel.restaurante,
                    aire_acondicionado: hotel.aire_acondicionado,
                    gimnasio: hotel.gimnasio,
                    spa: hotel.spa,
                    bar: hotel.bar,
                    mascotas: hotel.mascotas
                };
            }

            // Procesar habitaciones
            if (hotel.habitaciones) {
                try {
                    hotel.habitaciones = hotel.habitaciones
                        .split('###')
                        .map(hab => JSON.parse(hab));
                } catch (e) {
                    console.error('Error al parsear habitaciones en edit:', e);
                    hotel.habitaciones = [];
                }
            } else {
                hotel.habitaciones = [];
            }

            // --- DEBUG LOG: Habitaciones after parsing ---
            console.log('DEBUG: Habitaciones after parsing:', hotel.habitaciones);
            // --- END DEBUG LOG ---

            res.render('admin/hotels/edit', { 
                hotel,
                user: req.session.user,
                path: `/admin/hotels/${req.params.id}/edit`
            });
        } catch (error) {
            console.error('Error al cargar hotel:', error);
            req.flash('error', 'Error al cargar el hotel');
            res.redirect('/admin/hotels');
        }
    },

    // Actualizar hotel
    update: async (req, res) => {
        const { nombre, descripcion, direccion, ciudad, estrellas, precio_base, estado, coordenadas_lat, coordenadas_lng } = req.body;
        const hotelId = req.params.id;

        // Validar si el nombre del hotel ya existe, excluyendo el hotel actual
        try {
            const [existingHotels] = await db.query(
                'SELECT id FROM hoteles WHERE nombre = ? AND id != ?',
                [nombre, hotelId]
            );
            if (existingHotels.length > 0) {
                req.flash('error', 'Ya existe otro hotel con este nombre. Por favor, elige uno diferente.');
                return res.redirect(`/admin/hotels/${hotelId}/edit`);
            }
        } catch (error) {
            console.error('Error al validar nombre de hotel en update:', error);
            req.flash('error', 'Error interno al validar el nombre del hotel.');
            return res.redirect(`/admin/hotels/${hotelId}/edit`);
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            let imagePath = null;
            if (req.files && req.files.imagen_principal) {
                const file = req.files.imagen_principal;
                const fileName = `${Date.now()}-${file.name}`;
                imagePath = `/uploads/hotels/${fileName}`;
                await file.mv(path.join(uploadDir, fileName));

                // Eliminar imagen anterior si existe
                const [oldImage] = await connection.query('SELECT imagen_principal FROM hoteles WHERE id = ?', [req.params.id]);
                if (oldImage[0].imagen_principal) {
                    const oldImagePath = path.join(__dirname, '../public', oldImage[0].imagen_principal);
                    try {
                        await fs.unlink(oldImagePath);
                    } catch (error) {
                        console.error('Error al eliminar imagen anterior:', error);
                    }
                }
            }

            // Actualizar hotel
            await connection.query(`
                UPDATE hoteles SET
                    nombre = ?,
                    descripcion = ?,
                    direccion = ?,
                    ciudad = ?,
                    estrellas = ?,
                    precio_base = ?,
                    ${imagePath ? 'imagen_principal = ?,' : ''}
                    coordenadas_lat = ?,
                    coordenadas_lng = ?,
                    estado = ?,
                    modificado_por = ?
                WHERE id = ?
            `, [
                req.body.nombre,
                req.body.descripcion,
                req.body.direccion,
                req.body.ciudad,
                req.body.estrellas,
                req.body.precio_base,
                ...(imagePath ? [imagePath] : []),
                req.body.coordenadas_lat || null,
                req.body.coordenadas_lng || null,
                req.body.estado,
                req.session.user.id,
                req.params.id
            ]);

            // Actualizar características
            await connection.query(`
                UPDATE caracteristicas_hotel SET
                    wifi = ?,
                    parking = ?,
                    piscina = ?,
                    restaurante = ?,
                    aire_acondicionado = ?,
                    gimnasio = ?,
                    spa = ?,
                    bar = ?,
                    mascotas = ?
                WHERE hotel_id = ?
            `, [
                req.body.wifi ? 1 : 0,
                req.body.parking ? 1 : 0,
                req.body.piscina ? 1 : 0,
                req.body.restaurante ? 1 : 0,
                req.body.aire_acondicionado ? 1 : 0,
                req.body.gimnasio ? 1 : 0,
                req.body.spa ? 1 : 0,
                req.body.bar ? 1 : 0,
                req.body.mascotas ? 1 : 0,
                req.params.id
            ]);

            // Actualizar habitaciones
            // Primero eliminamos las habitaciones existentes
            await connection.query('DELETE FROM habitaciones WHERE hotel_id = ?', [req.params.id]);

            // Luego insertamos las nuevas habitaciones o actualizamos las existentes si tienen ID
            if (req.body.habitaciones && Array.isArray(req.body.habitaciones)) {
                for (const habitacion of req.body.habitaciones) {
                    // Si la habitacion tiene un ID, es una edicion; si no, es nueva
                    if (habitacion.id) {
                        await connection.query(`
                            UPDATE habitaciones SET
                                tipo = ?,
                                descripcion = ?,
                                capacidad = ?,
                                precio = ?,
                                cantidad_disponible = ?,
                                estado = ?
                            WHERE id = ? AND hotel_id = ?
                        `, [
                            habitacion.tipo,
                            habitacion.descripcion,
                            habitacion.capacidad,
                            habitacion.precio,
                            habitacion.cantidad_disponible,
                            habitacion.estado,
                            habitacion.id,
                            req.params.id
                        ]);
                    } else {
                        // Es una habitacion nueva
                        await connection.query(`
                            INSERT INTO habitaciones (
                                hotel_id, tipo, descripcion, capacidad,
                                precio, cantidad_disponible, estado
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, [
                            req.params.id,
                            habitacion.tipo,
                            habitacion.descripcion,
                            habitacion.capacidad,
                            habitacion.precio,
                            habitacion.cantidad_disponible,
                            habitacion.estado // Usar el estado del formulario
                        ]);
                    }
                }
            }

            await connection.commit();
            req.flash('success', 'Hotel actualizado exitosamente');
            res.redirect('/admin/hotels');
        } catch (error) {
            await connection.rollback();
            console.error('Error al actualizar hotel:', error);
            req.flash('error', 'Error al actualizar el hotel');
            res.redirect(`/admin/hotels/${req.params.id}/edit`);
        } finally {
            connection.release();
        }
    },

    // Eliminar hotel
    destroy: async (req, res) => {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Obtener imagen antes de eliminar
            const [hotel] = await connection.query('SELECT imagen_principal FROM hoteles WHERE id = ?', [req.params.id]);

            // Eliminar hotel (las características y habitaciones se eliminarán en cascada)
            await connection.query('DELETE FROM hoteles WHERE id = ?', [req.params.id]);

            // Eliminar imagen si existe
            if (hotel[0].imagen_principal) {
                const imagePath = path.join(__dirname, '../public', hotel[0].imagen_principal);
                try {
                    await fs.unlink(imagePath);
                } catch (error) {
                    console.error('Error al eliminar imagen:', error);
                }
            }

            await connection.commit();
            res.json({ success: true });
        } catch (error) {
            await connection.rollback();
            console.error('Error al eliminar hotel:', error);
            res.status(500).json({ success: false, error: 'Error al eliminar el hotel' });
        } finally {
            connection.release();
        }
    }
};

module.exports = hotelController; 