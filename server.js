const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const port = 3001;
require('dotenv').config();
const admin = require('firebase-admin');
const cors = require('cors');
app.use(cors());
app.use(express.json()); // para parsing application/json
app.use(express.static('public'));
const serviceAccount = require('./formulario-if---ft-firebase-adminsdk-u9bim-fd525dbea7.json');
const { v4: uuidv4 } = require('uuid');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = "mongodb+srv://admin:j4bAB3JN3LBTWJsJ@formulario.ebd59ch.mongodb.net/?retryWrites=true&w=majority&appName=Formulario&tls=true";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
let bd;

client.connect()
  .then(() => {
    console.log("Connected successfully to MongoDB");
    bd = client.db("Formulario"); // Reemplaza "nombreDeTuBaseDeDatos" con el nombre real de tu base de datos
  })
  .catch(err => console.error('Failed to connect to MongoDB', err));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
app.get('/', (req, res) => {
    // Cuando vayan a la ruta raíz, les servirás el archivo HTML.
    res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

app.post('/enviar-formulario', async (req, res) => {
    const { firma, correo, correoAplicant, Mount, applicant, area, productService, quantity, credit, expenseAmount, provider, budgetItem, paymentForm, description, date, folio } = req.body;

    // Crear un documento PDF en memoria
    const doc = new PDFDocument();
    const pdfBuffers = [];
    // Define constants for layout
    const margin = 50;
    const pageWidth = doc.page.width - 2 * margin;
    const lineHeight = 14;
    const imagePath = path.join(__dirname, "public", "img", "LOGO BCL H.png");

    doc.image(imagePath, margin, 40, { width: 150 }); // Ajusta la posición y el tamaño según sea necesario

    // Mover la posición vertical para el título debajo de la imagen del logo
    let yPos = 120; // Esto coloca el título justo debajo de la imagen del logo



    // Title of the form
    doc.fontSize(16)
        .font('Helvetica-Bold')
        .text('Formato de Requisición', margin, yPos - 30, { align: 'center' });

    // Agregar el número de folio y la fecha a la derecha de la cabecera
    doc.fontSize(10)
        .font('Helvetica')
        .text(`# Folio: ${folio}`, pageWidth + margin - 150, yPos - 30, { width: 140, align: 'right' })
        .text(`Fecha: ${date}`, pageWidth + margin - 150, yPos - 15, { width: 140, align: 'right' });

    // Mover la posición vertical para el cuerpo del formulario
    yPos += 50;


    // Función para añadir campos de formulario
    function addFormField(label, value, y, xOffset = 150) {
        const fieldHeight = 15; // Altura del campo de texto
        const fieldPadding = 2; // Espacio adicional para que el texto no toque los bordes del rectángulo
        const valueWidth = pageWidth - (margin + xOffset);

        // Dibujar el rectángulo de fondo para el valor
        doc.rect(margin + xOffset, y + fieldPadding, valueWidth, fieldHeight)
            .fillOpacity(0.5) // Puedes ajustar la opacidad según necesites
            .fillAndStroke('grey', 'grey'); // El relleno y el borde del rectángulo

        // Resetear la opacidad para el texto
        doc.fillOpacity(1);

        // Imprime el título
        doc.font('Helvetica').fontSize(10).fillColor('black');
        doc.text(label, margin, y, { width: 240, align: 'left' });

        // Imprime el valor con un poco de padding dentro del rectángulo
        doc.text(value || '', margin + xOffset + fieldPadding, y + fieldPadding, { width: valueWidth - (2 * fieldPadding), align: 'left' });

        yPos += fieldHeight + (2 * fieldPadding); // Añadir espacio vertical después de cada campo
    }
    // Añadir los campos de formulario
    addFormField('Solicitante (Operador):', applicant, yPos);
    addFormField('Área:', area, yPos);
    addFormField('Producto o Servicio:', productService, yPos);
    addFormField('Cantidad:', quantity.toString(), yPos);
    addFormField('Proveedor:', provider, yPos);
    addFormField('Descripción / Observaciones de Producto o Servicio:', description, yPos, 250);
    addFormField('Monto de Gasto (Pesos / sin iva):', expenseAmount.toString(), yPos, 175);
    addFormField('Monto Total:', Mount.toString(), yPos);
    addFormField('Forma de Pago:', paymentForm, yPos);
    addFormField('Días de crédito:', credit.toString(), yPos);
    addFormField('Rubro Presupuestal:', budgetItem, yPos);

    // Add extra space for the last field before signatures
    yPos += lineHeight * 2;


    // Aquí agregarías el contenido a tu PDF, como se hizo anteriormente
    doc.fontSize(25).text('', 100, 80);

    doc.on('data', chunk => pdfBuffers.push(chunk));
    doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(pdfBuffers);

        try {
            const result = await bd.collection('pdfs').insertOne({
                createdAt: new Date(),
                pdfData: pdfBuffer
            });
            const pdfId = result.insertedId;

            const formData = { ...req.body, pdfId: pdfId.toString() };
            const uniqueToken = uuidv4();

            // Guarda los datos del formulario con el token en Firestore
            await db.collection('solicitudesPendientes').doc(uniqueToken).set(formData);
            let transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT, 10),
                secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });
    

        const authorizationLink = `https://formulariov2.onrender.com/autorizar-formulario/${uniqueToken}`;
        const noAuthorizationLink = `https://formulariov2.onrender.com/no-autorizar-formulario/${uniqueToken}`;
        const htmlEmailContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  color: #333;
                  line-height: 1.6;
              }
              .email-container {
                  max-width: 600px;
                  margin: 20px auto;
                  padding: 20px;
                  border: 1px solid #ddd;
                  border-radius: 5px;
              }
              .header {
                  text-align: left;
                  border-bottom: 2px solid #005687;
                  padding-bottom: 10px;
                  margin-bottom: 20px;
              }
              .email-content {
                  text-align: left;
                  margin-top: 20px;
              }
              .footer {
                  text-align: center;
                  margin-top: 30px;
                  padding-top: 10px;
                  font-size: 0.8em;
                  color: #888;
              }
              .button {
                  padding: 10px 20px;
                  margin: 10px 5px;
                  color: white;
                  border: none;
                  border-radius: 5px;
                  cursor: pointer;
                  text-decoration: none;
              }
              .authorize {
                  background-color: #28a745;
              }
              .decline {
                  background-color: #dc3545;
              }
              .button-container {
                  text-align: center;
              }
          </style>
      </head>
      <body>
          <div class="email-container">
              <div class="header">
                  <img src="cid:logoBCLH" alt="Logo" style="max-width: 150px;">
              </div>
              <div class="email-content">
                  <p>Estimado/a ${formData.correo},</p>
                  <p>Por favor, autorice el gasto de <strong>${formData.productService}</strong>, por un monto de <strong>${formData.expenseAmount}</strong> correspondiente a la partida presupuestal <strong>${formData.budgetItem}</strong>. Encuentra los detalles adjuntos. Gracias.</p>
                  <p>Saludos cordiales,<br>${formData.applicant}</p>
              </div>
              <table width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td>
                  <table cellspacing="0" cellpadding="0" align="left">
                    <tr>
                      <td align="center" width="200" height="40" bgcolor="#28a745" style="border-radius: 5px;">
                        <a href="${authorizationLink}" target="_blank" style="font-size: 16px; font-family: sans-serif; color: #ffffff; text-decoration: none; line-height:40px; display: inline-block;">
                          Autorizar
                        </a>
                      </td>
                    </tr>
                  </table>
            
                  <table cellspacing="0" cellpadding="0" align="right">
                    <tr>
                      <td align="center" width="200" height="40" bgcolor="#dc3545" style="border-radius: 5px;">
                        <a href="${noAuthorizationLink}" target="_blank" style="font-size: 16px; font-family: sans-serif; color: #ffffff; text-decoration: none; line-height:40px; display: inline-block;">
                          No Autorizar
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
              <div class="footer">
                  <p>Este es un mensaje automático, por favor no responder directamente.</p>
              </div>
          </div>
      </body>
      </html>
      `;



        transporter.sendMail({
            from: process.env.EMAIL_FROM, // Agrega tu dirección de correo "From"
            to: formData.correo, // Suponiendo que `correo` es el correo del autorizador
            subject: 'Autorización de Solped Requerida',
            html: htmlEmailContent,
            attachments: [
                {
                    filename: 'Formulario-Autorizado.pdf', // Nombre descriptivo
                    content: pdfBuffer, // Ruta al archivo PDF
                    contentType: 'application/pdf'
                },
                {
                    filename: 'LOGO BCL H.png',
                    path: path.join(__dirname, "public", "img", "LOGO BCL H.png"),
                    cid: 'logoBCLH' // Este CID se usa en el src del img tag en el HTML
                }
            ]
        }).then(info => {
            console.log('Correo enviado:', info.response);
            res.send('Correo de autorización enviado con éxito.');
        }).catch(error => {
            console.error('Error al enviar correo de autorización:', error);
            res.status(500).send('Error al enviar correo de autorización.');
        });

    } catch (error) {
        console.error('Error al guardar el PDF en MongoDB:', error);
        res.status(500).send('Error al guardar el PDF en MongoDB.');
    }
});

// ... Generación del contenido del PDF
// No olvides eliminar cualquier referencia a pdfPath y stream, ya que ya no son necesarios
doc.end();
});
//--------------------------------------------------------------------------------------------------------Auutorizar-------------------------------------------------------------------------------------------
app.get('/autorizar-formulario/:token', async (req, res) => {
    const { token } = req.params;
    const docRef = db.collection('solicitudesPendientes').doc(token);
    const doc = await docRef.get();

    if (!doc.exists) {
        return res.status(404).send('La solicitud no existe o ya fue procesada.');
    }

    const formData = doc.data();

    const pdfId = formData.pdfId;
    const pdfDocument = await bd.collection('pdfs').findOne({ _id: new ObjectId(pdfId) });
    
    if (!pdfDocument) {
        console.error('PDF no encontrado en MongoDB');
        return res.status(404).send('PDF no encontrado.');
    }
    await db.collection('formulariosAutorizados').doc(token).set(formData);
    await docRef.delete();

    let transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT, 10),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
    console.log('Correo destinatario:', formData.correoAplicant);

    transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: `${formData.correoAplicant}, cobranza@biancorelab.com`, // Define el destinatario directamente para pruebas
        subject: 'Tu formulario ha sido autorizado',
        text: 'Nos complace informarte que tu formulario ha sido autorizado.',
        attachments: [
            {
                filename: 'Formulario-Autorizado.pdf', // Nombre descriptivo
                content: pdfDocument.pdfData.buffer, // Ruta al archivo PDF
                contentType: 'application/pdf'
            }
        ]
    }).then(info => {
        console.log('Correo de confirmación enviado: ', info);
        res.send(`
    <html>
        <body>
            <p>La acción ha sido procesada. Esta ventana se cerrará automáticamente.</p>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1500); // Espera 3 segundos antes de intentar cerrar
                };
            </script>
        </body>
    </html>
`);
    }).catch(error => {
        console.error('Error al enviar correo de confirmación:', error);
        res.status(500).send('Error al enviar correo de confirmación.');
    });
});
// --------------------------------------------------------------------------------------------------------No autorizar-------------------------------------------------------------------------------------------
app.get('/no-autorizar-formulario/:token', async (req, res) => {
    const { token } = req.params;
    const docRef = db.collection('solicitudesPendientes').doc(token);
    const doc = await docRef.get();

    if (!doc.exists) {
        return res.status(404).send('La solicitud no existe o ya fue procesada.');
    }

    const formData = doc.data();
    // Opcionalmente, puedes mover el documento a otra colección, por ejemplo, 'formulariosNoAutorizados'
    await db.collection('formulariosNoAutorizados').doc(token).set(formData);
    await docRef.delete();

    // Envía un correo de notificación de no autorización
    let transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT, 10),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: `${formData.correoAplicant}, cobranza@biancorelab.com`,
        subject: 'Formulario No Autorizado',
        text: `El formulario solicitado por ${formData.applicant} ha sido no autorizado.`,
        // Aquí decides si enviar o no el PDF como en el correo de autorización
    }).then(info => {
        console.log('Correo de no autorización enviado:', info);
        res.send(`
        <html>
            <body>
                <p>La acción ha sido procesada. Esta ventana se cerrará automáticamente.</p>
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.close();
                        }, 1500); // Espera 3 segundos antes de intentar cerrar
                    };
                </script>
            </body>
        </html>
    `);
    }).catch(error => {
        console.error('Error al enviar correo de no autorización:', error);
        res.status(500).send('Error al enviar correo de no autorización.');
    });
});


app.listen(port, () => {
    console.log(`Servidor ejecutándose en http://localhost:${port}`);
});
