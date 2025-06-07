const nodemailer = require('nodemailer');

// Configuración general, puedes cambiar los datos según tu proveedor
const transporter = nodemailer.createTransport({
    service: process.env.MAIL_SERVICE || 'gmail', // 'gmail', 'hotmail', 'outlook', etc.
    auth: {
        user: process.env.MAIL_USER || 'easystay.sp@gmail.com',
        pass: process.env.MAIL_PASS || 'vwrc vysu lijz bhsa'
    }
});

module.exports = transporter;
