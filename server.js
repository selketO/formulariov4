const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const nodemailer = require('nodemailer');
const app = express();
const port = 3000;
const cors = require('cors');
const { authenticate, getArgs } = require('./jwtConsole'); // Ajusta las rutas según tu estructura de archivos
const { sendEnvelope } =  require('../formulario/lib/eSignature/examples/signingViaEmail');
const jwtModule = require('./jwtConfig');
console.log(jwtModule);
app.use(cors());
app.use(express.json()); // para parsing application/json


app.post('/enviar-formulario', async (req, res) => {
    const { firma, correo, applicant, area, productService, quantity, credit, expenseAmount, provider, budgetItem, paymentForm, description, date, folio } = req.body;

    // Crear un documento PDF
    const doc = new PDFDocument();
    const pdfPath = `firma-${Date.now()}.pdf`;
    const stream = fs.createWriteStream(pdfPath);

    // Define constants for layout
    const margin = 50;
    const pageWidth = doc.page.width - 2 * margin;
    const lineHeight = 14;

    // Title of the form
    doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Formato de Requisición', margin, 50, { align: 'center' });

    // Horizontal line after the title
    doc.moveTo(margin, 70)
        .lineTo(pageWidth + margin, 70)
        .stroke();

    // Reset font size for the rest of the document
    doc.fontSize(10)
        .font('Helvetica');

    // Helper function to add form fields with equal spacing
    function addFormField(label, value, x, y, labelWidth, valueWidth) {
        doc.text(label, x, y)
            .text(value || '', x + labelWidth, y, { width: valueWidth, align: 'left' });
    }

    // Vertical position tracker
    let yPos = 80;

    // Set label and value widths
    const labelWidth = 100;
    const valueWidth = 200;

    // Form fields
    addFormField('Solicitante (Operador):', applicant, margin, yPos, labelWidth, valueWidth);
    addFormField('Fecha:', date, margin + labelWidth + valueWidth, yPos, labelWidth, valueWidth);

    yPos += 1.5 * lineHeight;

    addFormField('Área:', area, margin, yPos, labelWidth, valueWidth);
    addFormField('# Folio:', folio, margin + labelWidth + valueWidth, yPos, labelWidth, valueWidth);

    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Prodcto o servicio:', productService, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Cantidad:', quantity, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Proveedor:', provider, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Descripción / Observaciones de Producto o Servicio:', description, margin, yPos, labelWidth + valueWidth, pageWidth - (labelWidth + valueWidth));
    yPos += 2 * lineHeight;
    // Continue adding form fields using the addFormField function...
    addFormField('Monto de gastos (pesos):', expenseAmount, margin, yPos, labelWidth + valueWidth, pageWidth - (labelWidth + valueWidth));
    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Dias de credito::', credit, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;

    addFormField('Forma de pago:', paymentForm, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;

    // Continue adding form fields using the addFormField function...
    addFormField('Rubro Presupuestal:', budgetItem, margin, yPos, labelWidth, valueWidth);
    yPos += 1.5 * lineHeight;


    // Add extra space for the last field before signatures
    yPos += lineHeight * 2;

    // Signature of the Applicant
    const signatureWidth = 180;
    const signatureHeight = 30; // Set the signature height
    const spaceAboveSignatureLine = 5; // Set space above the signature line
    doc.moveTo(margin, yPos)
        .lineTo(margin + signatureWidth, yPos)
        .stroke()
        .text('Firma de Solicitante', margin, yPos + 2, { width: signatureWidth, align: 'center' });

    // Calculate the position to place the signature so it's above the line
    const signatureYPosition = yPos - signatureHeight - spaceAboveSignatureLine;
    // Signature of the Authorizer, aligned to the right
    const authorizerSignatureX = pageWidth + margin - signatureWidth;
    doc.moveTo(authorizerSignatureX, yPos)
        .lineTo(pageWidth + margin, yPos)
        .stroke()
        .text('Firma de Autorización', authorizerSignatureX, yPos + 2, { width: signatureWidth, align: 'center' });

    // Name and Title for Finance Authorization, centered below signatures
    yPos += lineHeight * 2; // Move down for finance authorization
    const financeSignatureX = margin + (pageWidth / 2 - signatureWidth / 2);
    doc.moveTo(financeSignatureX, yPos)
        .lineTo(financeSignatureX + signatureWidth, yPos)
        .stroke()
        .text('Christian Loera', financeSignatureX, yPos - lineHeight, { width: signatureWidth, align: 'center' })
        .text('Autorización de Finanzas', financeSignatureX, yPos + 2, { width: signatureWidth, align: 'center' });

    // Place the applicant's signature image if provided
    if (firma) {
        doc.image(Buffer.from(firma.split(',')[1], 'base64'), margin, signatureYPosition, { width: signatureWidth, height: signatureHeight });
    }
    doc.pipe(stream);
    // Aquí agregarías el contenido a tu PDF, como se hizo anteriormente
    doc.fontSize(25).text('', 100, 80);
    doc.end();

   // Esperar a que el PDF se haya generado completamente
   stream.on('finish', async () => {
    // Asegúrate de que el archivo ha sido completamente escrito en el sistema de archivos
    stream.close(async () => {
        // Leer el archivo PDF generado y convertirlo a base64
        fs.readFile(pdfPath, async (err, data) => {
            if (err) {
                console.error('Error al leer el archivo PDF:', err);
                return res.status(500).send('Error al procesar el archivo PDF para enviar a DocuSign.');
            }

            const documentBase64 = data.toString('base64');

            try {
                const accountInfo = await authenticate();
                // Prepara los argumentos para enviar a DocuSign, incluyendo el documento en base64
                const args = {
                    accountId: accountInfo.apiAccountId,
                    accessToken: accountInfo.accessToken,
                    basePath: accountInfo.basePath,
                    documentBase64, // PDF en base64
                    signerEmail: correo, // Correo del firmante
                    signerName: "Nombre del Firmante", // Nombre del firmante
                    ccEmail: "email@example.com", // Correo CC (opcional)
                    ccName: "Nombre CC", // Nombre CC (opcional)
                };

                const result = await sendEnvelope(args);
                console.log(`Sobre enviado a DocuSign. EnvelopeId: ${result.envelopeId}`);

                // Configuración del transporte de correo electrónico para notificar al remitente/firmante
                let transporter = nodemailer.createTransport({
                    host: "smtp.office365.com",
                    port: 587,
                    secure: false,
                    auth: {
                        user: 'tuCorreo@example.com',
                        pass: 'tuContraseña',
                    },
                    tls: {
                        rejectUnauthorized: false,
                    },
                });

                // Envío del correo electrónico con el PDF adjunto
                transporter.sendMail({
                    from: '"Formulario con Firma" <tuCorreo@example.com>',
                    to: correo, // Correo del receptor
                    subject: 'Documento listo para firma',
                    text: 'Por favor, revisa y firma el documento adjunto.',
                    attachments: [{
                        filename: 'Documento.pdf',
                        path: pdfPath,
                        contentType: 'application/pdf'
                    }]
                }).then(info => {
                    console.log(`Correo de notificación enviado: ${info.messageId}`);
                    res.send('Formulario enviado y notificación por correo electrónico realizada.');
                }).catch(error => {
                    console.error('Error al enviar correo de notificación:', error);
                    res.status(500).send('Error al enviar correo de notificación.');
                });

                // Opcional: Eliminar el archivo PDF después del envío
                fs.unlinkSync(pdfPath);

            } catch (error) {
                console.error('Error al enviar documento a DocuSign:', error);
                res.status(500).send('Error al enviar documento a DocuSign.');
            }
        });
    });
});

});

app.listen(port, () => {
    console.log(`Servidor ejecutándose en http://localhost:${port}`);
});
