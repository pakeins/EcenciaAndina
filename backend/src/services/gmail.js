const nodemailer = require('nodemailer');

// Configuracion del transportador SMTP de Gmail
const createTransporter = () => {
  if (!process.env.GMAIL_APP_PASSWORD || !process.env.GMAIL_USER) {
    console.error('Falta GMAIL_APP_PASSWORD o GMAIL_USER en .env');
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || '',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
  });
};

const sendTelegramInviteEmail = async (emailTo, nombre, inviteLink) => {
  if (!emailTo) throw new Error('El correo del destinatario es obligatorio.');
  
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #BF5D30; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">¡Bienvenido a Ecencia Andina, ${nombre}!</h2>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9;">
        <p style="font-size: 16px; color: #333;">Estamos emocionados de tenerte con nosotros. Tu cuenta ha sido creada exitosamente en nuestro sistema.</p>
        <p style="font-size: 16px; color: #333;">Desde ahora podrás pedir tus almuerzos, ver el menú diario y gestionar tus reservas directamente desde tu celular.</p>
        <p style="font-size: 16px; color: #333; font-weight: bold;">Da clic en el siguiente botón para empezar:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #0088cc; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            Iniciar registro en Telegram
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; margin-top: 30px;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p style="font-size: 14px; color: #0088cc; word-break: break-all;">${inviteLink}</p>
      </div>
      <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
        <p style="margin: 0;">Ecencia Andina &copy; ${new Date().getFullYear()}</p>
        <p style="margin: 5px 0 0 0;">Este es un mensaje automático, por favor no respondas a este correo.</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"Ecencia Andina" <${process.env.GMAIL_USER}>`,
    to: emailTo,
    subject: '¡Activa tu cuenta de Ecencia en Telegram!',
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de invitacin enviado: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error enviando el correo de invitacin:', error);
    throw error;
  }
};

module.exports = {
  sendTelegramInviteEmail,
};
