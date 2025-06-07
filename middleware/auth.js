function isAdmin(req, res, next) {
    if (!req.session.user || (req.session.user.rol !== 'admin' && req.session.user.rol !== 'superadmin')) {
        return res.status(403).send('Acceso denegado: Solo administradores');
    }
    next();
}

module.exports = { isAdmin }; 