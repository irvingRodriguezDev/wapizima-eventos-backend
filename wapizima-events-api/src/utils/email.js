const { Resend } = require("resend");

// Inicializa Resend con la API Key de las variables de entorno
const resend = new Resend(process.env.RESEND_API_KEY);

exports.enviarBoletosPorCorreo = async (
  buyerEmail,
  buyerName,
  tickets,
  eventName,
) => {
  try {
    // Generamos un bloque de texto o HTML con los folios de los boletos
    const listaTicketsHtml = tickets
      .map(
        (t, index) => `
      <div style="border: 2px dashed #D82E7A; padding: 15px; margin-bottom: 10px; border-radius: 8px;">
        <h3 style="color: #D82E7A; margin: 0;">Boleto #${index + 1}</h3>
        <p style="font-size: 18px; font-weight: bold; margin: 5px 0;">Código: ${t.code}</p>
        <p style="font-size: 12px; color: #666;">Presenta este código digital o impreso el día del evento.</p>
      </div>
    `,
      )
      .join("");

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #E53888;">¡Tus boletos para ${eventName} están listos! 🎉</h2>
        <p>Hola <strong>${buyerName}</strong>, tu pago ha sido verificado con éxito.</p>
        <p>Aquí tienes tus accesos para el evento:</p>
        ${listaTicketsHtml}
        <br />
        <p style="font-size: 12px; color: #999;">Este es un correo automático enviado por la plataforma de boletos de Wapizima.</p>
      </div>
    `;

    await resend.emails.send({
      from: "Wapizima Eventos <boletos@tu-dominio-verificado.com>", // Registra tu dominio en Resend para producción
      to: buyerEmail,
      subject: `Tus boletos para ${eventName} 🎟️`,
      html: htmlContent,
    });

    console.log(`Correo enviado con éxito a ${buyerEmail}`);
  } catch (error) {
    console.error("Error al enviar el correo con Resend:", error);
  }
};
