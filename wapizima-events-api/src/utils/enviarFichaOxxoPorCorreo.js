const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

async function enviarFichaOxxoPorCorreo(
  email,
  nombre,
  nombreEvento,
  monto,
  urlVoucher,
  referencia,
) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; }
        .card { max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #FFD8E2; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #EE6F97 0%, #D64C77 100%); padding: 30px; text-align: center; color: white; }
        .content { padding: 30px; color: #3D2B2F; }
        .oxxo-box { background: #FFF5F7; border: 2px dashed #EE6F97; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
        .ref-number { font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #3D2B2F; margin: 10px 0; }
        .btn { display: inline-block; background: #EE6F97; color: white !important; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 10px; margin-top: 15px; }
        .footer { font-size: 12px; text-align: center; color: #888; padding: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0;">¡Falta un paso para tu lugar! 🎟️</h2>
        </div>
        <div class="content">
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Has iniciado la reserva de tu entrada para <strong>${nombreEvento}</strong>.</p>
          
          <div class="oxxo-box">
            <p style="margin:0; font-size: 14px; color: #666;">Monto a pagar en efectivo:</p>
            <h1 style="margin: 5px 0; color: #EE6F97;">$${monto} MXN</h1>
            
            ${referencia ? `<p style="margin-top:15px; font-size:12px; color:#888;">Número de Referencia OXXO:</p><div class="ref-number">${referencia}</div>` : ""}

            <a href="${urlVoucher}" target="_blank" class="btn">
              📄 Abrir/Imprimir Ficha Oficial OXXO
            </a>
          </div>

          <p style="font-size: 13px; color: #666;">
            <strong>Instrucciones:</strong><br>
            1. Muestra la ficha o el número de referencia al cajero en cualquier OXXO.<br>
            2. Realiza tu pago en efectivo.<br>
            3. Tan pronto se acredite el pago (aproximadamente en 1 hora), te enviaremos automáticamente tus boletos con código QR.
          </p>
        </div>
        <div class="footer">
          Si tienes alguna duda, responde a este correo o escríbenos a soporte@wapizima.com
        </div>
      </div>
    </body>
    </html>
  `;

  await resend.emails.send({
    from: "Wapizima Eventos <boletos@eventoswapizima.com>",
    to: [email],
    subject: `📄 Ficha de pago OXXO - ${nombreEvento}`,
    html: htmlContent,
  });
}

// 👈 Exportamos de forma compatible con CommonJS / Lambda
module.exports = {
  enviarFichaOxxoPorCorreo,
};
