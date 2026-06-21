const nodemailer = require('nodemailer');

// Configure SMTP via env. When unset, email "sends" are logged instead (dev).
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE(true/false), SMTP_FROM
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM } = process.env;

const isConfigured = !!(SMTP_HOST && SMTP_PORT);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — would send to ${to}: "${subject}"`);
    return { delivered: false };
  }
  await transporter.sendMail({ from: SMTP_FROM || SMTP_USER || 'no-reply@vyre.app', to, subject, html, text });
  return { delivered: true };
}

module.exports = { sendMail, isConfigured };
