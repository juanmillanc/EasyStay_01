const db = require('../config/database');
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

const hotelController = {
    // Listar todos los hoteles
    index: async (req, res) => {
        try {
            const [hotels] = await db.query(`
                SELECT h.*, 
                       c.* 
                FROM hoteles h 
                LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
                ORDER BY h.fecha_creacion DESC
            `);

            // Agrupar características por hotel
            const hotelsMap = new Map();
            hotels.forEach(row => {
                if (!hotelsMap.has(row.id)) {
                    const hotel = {...row};
                    delete hotel.hotel_id;
                    hotel.caracteristicas = {};
                    hotelsMap.set(row.id, hotel);
                }
                const hotel = hotelsMap.get(row.id);
                if (row.wifi !== null) {
                    hotel.caracteristicas = {
                        wifi: row.wifi,
                        parking: row.parking,
                        piscina: row.piscina,
                        restaurante: row.restaurante,
                        aire_acondicionado: row.aire_acondicionado,
                        gimnasio: row.gimnasio,
                        spa: row.spa,
                        bar: row.bar,
                        mascotas: row.mascotas
                    };
                }
            });

            // Obtener ciudades únicas para el filtro
            const [cities] = await db.query('SELECT DISTINCT ciudad FROM hoteles ORDER BY ciudad');

            res.render('admin/hotels/index', {
                hotels: Array.from(hotelsMap.values()),
                cities: cities.map(row => row.ciudad),
                user: req.user,
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
            user: req.user,
            path: '/admin/hotels/new'
        });
    },

    // Guardar nuevo hotel
    store: async (req, res) => {
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
                req.body.nombre,
                req.body.descripcion,
                req.body.direccion,
                req.body.ciudad,
                req.body.estrellas,
                req.body.precio_base,
                imagePath,
                req.body.coordenadas_lat || null,
                req.body.coordenadas_lng || null,
                req.body.estado,
                req.user.id
            ]);

            // Insertar características
            await connection.query(`
                INSERT INTO caracteristicas_hotel (
                    hotel_id, wifi, parking, piscina, restaurante,
                    aire_acondicionado, gimnasio, spa, bar, mascotas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                result.insertId,
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
                       c.* 
                FROM hoteles h 
                LEFT JOIN caracteristicas_hotel c ON h.id = c.hotel_id
                WHERE h.id = ?
            `, [req.params.id]);

            if (hotels.length === 0) {
                req.flash('error', 'Hotel no encontrado');
                return res.redirect('/admin/hotels');
            }

            const hotel = {...hotels[0]};
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

            res.render('admin/hotels/form', { 
                hotel,
                user: req.user,
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
                req.user.id,
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

            // Eliminar hotel (las características se eliminarán en cascada)
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