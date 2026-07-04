const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: 'ecenciaconvenios@outlook.com',
    pass: 'ecenciaandina123',
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP AUTH FAILED:", error);
  } else {
    console.log("SMTP AUTH SUCCESS!");
  }
});
