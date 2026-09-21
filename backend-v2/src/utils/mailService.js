import net from 'node:net';
import tls from 'node:tls';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function shouldLogEmail() {
  return String(process.env.EMAIL_DELIVERY_MODE || '').toLowerCase() === 'log';
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    function cleanup() {
      socket.off('data', onData);
      socket.off('error', onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (/^\d{3}\s/.test(lastLine)) {
        cleanup();
        resolve({ code: Number(lastLine.slice(0, 3)), text: buffer });
      }
    }

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function expect(socket, allowedCodes) {
  const response = await readResponse(socket);
  if (!allowedCodes.includes(response.code)) {
    throw new Error(`SMTP error ${response.code}: ${response.text}`);
  }
  return response;
}

async function command(socket, value, allowedCodes = [250]) {
  socket.write(`${value}\r\n`);
  return expect(socket, allowedCodes);
}

function connectSocket() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || (process.env.SMTP_SECURE === 'true' ? 465 : 587));

  return new Promise((resolve, reject) => {
    const socket = process.env.SMTP_SECURE === 'true'
      ? tls.connect(port, host, { servername: host }, () => resolve(socket))
      : net.connect(port, host, () => resolve(socket));

    socket.once('error', reject);
  });
}

function upgradeToTls(socket) {
  const host = process.env.SMTP_HOST;

  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host }, () => resolve(secureSocket));
    secureSocket.once('error', reject);
  });
}

function escapeAddress(address) {
  return String(address || '').replace(/[<>\r\n]/g, '').trim();
}

function dotStuff(value) {
  return String(value || '').replace(/^\./gm, '..');
}

function buildMessage({ to, subject, text }) {
  const from = process.env.SMTP_FROM;
  const fromName = process.env.SMTP_FROM_NAME || 'Spa Booking System';
  const safeFrom = escapeAddress(from);
  const safeTo = escapeAddress(to);

  return [
    `From: ${fromName} <${safeFrom}>`,
    `To: <${safeTo}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text
  ].join('\r\n');
}

export function buildPasswordResetUrl(token) {
  const baseUrl = String(process.env.ADMIN_PORTAL_URL || 'https://booking.hairtasticheadspa.ca/spa-admin').replace(/\/+$/, '');
  return `${baseUrl}#reset-password&token=${encodeURIComponent(token)}`;
}

export async function sendEmail({ to, subject, text }) {
  if (shouldLogEmail() || !smtpConfigured()) {
    console.warn('[MAIL]', subject, 'to', to, '\n', text);
    return { sent: false, reason: shouldLogEmail() ? 'log_mode' : 'smtp_not_configured' };
  }

  let socket = await connectSocket();
  await expect(socket, [220]);
  await command(socket, `EHLO ${process.env.SMTP_HELO || 'spa-booking-api'}`, [250]);

  if (process.env.SMTP_SECURE !== 'true' && process.env.SMTP_STARTTLS !== 'false') {
    await command(socket, 'STARTTLS', [220]);
    socket = await upgradeToTls(socket);
    await command(socket, `EHLO ${process.env.SMTP_HELO || 'spa-booking-api'}`, [250]);
  }

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    await command(socket, 'AUTH LOGIN', [334]);
    await command(socket, Buffer.from(process.env.SMTP_USER).toString('base64'), [334]);
    await command(socket, Buffer.from(process.env.SMTP_PASS).toString('base64'), [235]);
  }

  const from = escapeAddress(process.env.SMTP_FROM);
  const safeTo = escapeAddress(to);
  await command(socket, `MAIL FROM:<${from}>`, [250]);
  await command(socket, `RCPT TO:<${safeTo}>`, [250, 251]);
  await command(socket, 'DATA', [354]);
  socket.write(`${dotStuff(buildMessage({ to, subject, text }))}\r\n.\r\n`);
  await expect(socket, [250]);
  await command(socket, 'QUIT', [221]);
  socket.end();

  return { sent: true };
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  return sendEmail({
    to,
    subject: 'Set your Spa Booking password',
    text: [
      `Hi ${fullName || 'there'},`,
      '',
      'An admin created an account for you in the Spa Booking System.',
      'Use this link to set your password and activate your account:',
      '',
      resetUrl,
      '',
      'This link expires in 24 hours.'
    ].join('\n')
  });
}
