const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

exports.enviarBoletosPorCorreo = async (
  buyerEmail,
  buyerName,
  tickets,
  eventName,
) => {
  try {
    // URL base de tu frontend en React (Cámbiala por tu dominio real de producción o usa una Var de entorno)
    const FRONTEND_URL =
      process.env.FRONTEND_URL || "https://eventos.wapizima.com";

    // --- RENDERIZADO DE TICKETS INDIVIDUALES ---
    const listaTicketsHtml = tickets
      .map(
        (t, index) => `
      <div style="background-color: #FFF0F4; border: 1px solid rgba(238, 111, 151, 0.3); border-radius: 16px; padding: 24px; margin-bottom: 20px; text-align: center; position: relative;">
        <span style="font-size: 11px; font-weight: 800; color: #EE6F97; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 8px;">
          ACCESO INDIVIDUAL · BOLETO #${index + 1}
        </span>
        
        <h2 style="font-size: 28px; font-weight: 900; color: #3D2B2F; margin: 0 0 16px 0; letter-spacing: 1px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          ${t.code}
        </h2>
        
        <table cellspacing="0" cellpadding="0" style="margin: 0 auto; margin-bottom: 8px;">
          <tr>
            <td align="center" style="background-color: #EE6F97; border-radius: 10px;">
              <a href="${FRONTEND_URL}/ticket/${t.code}" target="_blank" style="padding: 12px 28px; display: inline-block; font-family: sans-serif; font-size: 13px; font-weight: 700; color: #FFFFFF; text-decoration: none; letter-spacing: 1px; text-transform: uppercase;">
                Ver Boleto Digital
              </a>
            </td>
          </tr>
        </table>
        
        <p style="font-size: 11px; color: rgba(61, 43, 47, 0.5); margin: 8px 0 0 0; font-weight: 500;">
          Presenta este código digital o bájalo impreso el día del acceso.
        </p>
      </div>
    `,
      )
      .join("");

    // --- CUERPO GENERAL DEL CORREO PREMIUM ---
    const htmlContent = `
      <div style="background-color: #F9F6F7; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 10px 30px rgba(61, 43, 47, 0.04); border: 1px solid rgba(61, 43, 47, 0.05);">
          
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 900; color: #3D2B2F; margin: 0; letter-spacing: -0.5px; line-height: 1.3;">
              ¡TUS ACCESOS ESTÁN <span style="color: #EE6F97;">LISTOS</span>! 🎉
            </h1>
            <p style="font-size: 14px; color: rgba(61, 43, 47, 0.6); margin: 8px 0 0 0; font-weight: 500;">
              ${eventName.toUpperCase()}
            </p>
          </div>

          <div style="font-size: 15px; line-height: 1.6; color: #3D2B2F; margin-bottom: 32px;">
            <p style="margin: 0 0 12px 0;">Hola <strong>${buyerName}</strong>,</p>
            <p style="margin: 0; color: rgba(61, 43, 47, 0.8);">
              Tu pago ha sido procesado de forma segura y exitosa. A continuación, te entregamos tus accesos oficiales para el evento. Puedes dar clic en el botón de cada tarjeta para abrir el pase digital dinámico:
            </p>
          </div>

          ${listaTicketsHtml}

          <div style="background-color: #F9F6F7; border-radius: 12px; padding: 16px; margin-top: 32px; border-left: 3px solid #EE6F97;">
            <p style="font-size: 12px; color: rgba(61, 43, 47, 0.7); margin: 0; line-height: 1.5; font-weight: 500;">
              <strong>Nota de seguridad:</strong> Cada boleto digital contiene un código QR único que será escaneado en la entrada. No compartas este correo ni los códigos con nadie para evitar accesos duplicados.
            </p>
          </div>

          <div style="text-align: center; margin-top: 40px; border-top: 1px solid rgba(61, 43, 47, 0.08); padding-top: 24px;">
            <p style="font-size: 11px; color: rgba(61, 43, 47, 0.4); margin: 0; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">
              Wapizima eventos
            </p>
          </div>

        </div>
      </div>
    `;

    // --- ENVÍO ATÓMICO A TRAVÉS DE RESEND ---
    await resend.emails.send({
      from: "Wapizima Eventos <boletos@eventoswapizima.com>",
      to: buyerEmail,
      subject: `Tus accesos para ${eventName} 🎟️`,
      html: htmlContent,
    });

    console.log(`[Resend] Correo de confirmación enviado a ${buyerEmail}`);
  } catch (error) {
    console.error("❌ Error al enviar el correo con Resend:", error);
  }
};
