import net from 'node:net';
import tls from 'node:tls';

// SMTP is considered configured when the server host and sender address exist.
// SMTP_USER and SMTP_PASS are optional because some mail relays allow
// unauthenticated delivery from trusted hosts.
// Example: SMTP_HOST + SMTP_FROM set => true; SMTP_FROM missing => false.
function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function shouldLogEmail() {
  // Example: EMAIL_DELIVERY_MODE=log (any letter case) => true.
  return String(process.env.EMAIL_DELIVERY_MODE || '').toLowerCase() === 'log';
}

// Read one complete SMTP reply. Replies can arrive in multiple TCP chunks, so
// keep buffering until the last line uses the SMTP "code + space" terminator.
// The caller installs fresh listeners for each SMTP command/reply pair.
// Example reply: "250-mail.example\r\n250 OK\r\n" resolves with code 250.
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

// SMTP commands end in CRLF. Most commands expect 250, while DATA, STARTTLS,
// authentication, and QUIT supply their own accepted reply codes.
// Example: command(socket, 'EHLO app') writes "EHLO app\r\n" and waits for 250.
async function command(socket, value, allowedCodes = [250]) {
  socket.write(`${value}\r\n`);
  return expect(socket, allowedCodes);
}

function connectSocket() {
  // Port 465 uses TLS from the first byte. Port 587 normally starts in plain
  // text and is upgraded with STARTTLS later in sendEmail().
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

// Prevent user-controlled address values from injecting SMTP headers or
// envelope commands. The value is still expected to be a valid email address.
// Example: "a@example.com\r\nBcc: x@example.com" becomes "a@example.comBcc: x@example.com".
function escapeAddress(address) {
  return String(address || '').replace(/[<>\r\n]/g, '').trim();
}

// SMTP DATA treats a line containing only a period as the end of the message.
// Prefix message lines that begin with a period so they are transmitted intact.
// Example: ".first\n.second" becomes "..first\n..second".
function dotStuff(value) {
  return String(value || '').replace(/^\./gm, '..');
}

// Build the plain text RFC-style message body and headers sent after SMTP DATA.
// Example: {to:'a@example.com', subject:'Hi', text:'Hello'} produces From,
// To, Subject, MIME headers, a blank line, then "Hello" joined with CRLF.
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

// The reset screen reads the one-time token from the URL fragment. Fragments
// are not sent to the web server in the HTTP request; the frontend reads it
// and submits the token to POST /api/auth/reset-password.
// Example: token "abc 123" becomes "#reset-password&token=abc%20123".
export function buildPasswordResetUrl(token) {
  const baseUrl = String(process.env.ADMIN_PORTAL_URL || 'https://booking.hairtasticheadspa.ca/spa-admin').replace(/\/+$/, '');
  return `${baseUrl}#reset-password&token=${encodeURIComponent(token)}`;
}

// Deliver a plain text email. In explicit log mode, or when SMTP isn't
// configured, this function prints the message and reports that delivery did
// not happen. Otherwise it conducts the SMTP conversation:
// 1. Connect and greet the mail server.
// 2. Upgrade the connection to TLS unless implicit TLS is already active or
//    STARTTLS has explicitly been disabled.
// 3. Authenticate when both username and password are supplied.
// 4. Specify sender and recipient, transmit DATA, then close with QUIT.
// A successful DATA response is the point at which this reports `sent: true`.
export async function sendEmail({ to, subject, text }) {
  // Test/development fallback: don't attempt a network connection. Printing
  // the complete message makes the reset link available in logs, but `sent`
  // stays false because the recipient did not receive an email.
  if (shouldLogEmail() || !smtpConfigured()) {
    console.warn('[MAIL]', subject, 'to', to, '\n', text);
    return { sent: false, reason: shouldLogEmail() ? 'log_mode' : 'smtp_not_configured' };
  }

  // Open the SMTP connection. This waits for TCP/TLS to connect; the SMTP
  // server's greeting is read and checked in the next step.
  let socket = await connectSocket();

  // SMTP servers greet clients with 220. EHLO identifies this application to
  // the server and requests the server's supported SMTP features.
  await expect(socket, [220]);
  await command(socket, `EHLO ${process.env.SMTP_HELO || 'spa-booking-api'}`, [250]);

  // With regular SMTP (usually port 587), encrypt the existing connection
  // using STARTTLS. With SMTP_SECURE=true (usually port 465), TLS was already
  // established when connectSocket() opened the connection.
  if (process.env.SMTP_SECURE !== 'true' && process.env.SMTP_STARTTLS !== 'false') {
    await command(socket, 'STARTTLS', [220]);
    socket = await upgradeToTls(socket);
    // EHLO must be repeated after TLS because the server may advertise
    // additional features once the connection is encrypted.
    await command(socket, `EHLO ${process.env.SMTP_HELO || 'spa-booking-api'}`, [250]);
  }

  // Authenticate only when both credentials are present. AUTH LOGIN asks for
  // the username and password as Base64-encoded SMTP challenge responses.
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    await command(socket, 'AUTH LOGIN', [334]);
    await command(socket, Buffer.from(process.env.SMTP_USER).toString('base64'), [334]);
    await command(socket, Buffer.from(process.env.SMTP_PASS).toString('base64'), [235]);
  }

  const from = escapeAddress(process.env.SMTP_FROM);
  const safeTo = escapeAddress(to);

  // Start the SMTP envelope: declare the sender and recipient, then ask the
  // server to accept the message content. RCPT TO can return 251 when the
  // server will forward the recipient to another destination.
  await command(socket, `MAIL FROM:<${from}>`, [250]);
  await command(socket, `RCPT TO:<${safeTo}>`, [250, 251]);
  await command(socket, 'DATA', [354]);

  // Send headers and body, followed by SMTP's period-only end marker. The
  // server's 250 reply confirms it accepted the message for delivery; it does
  // not guarantee that the recipient's mailbox ultimately accepts it.
  socket.write(`${dotStuff(buildMessage({ to, subject, text }))}\r\n.\r\n`);
  await expect(socket, [250]);

  // Close the SMTP session cleanly after the server has accepted the email.
  await command(socket, 'QUIT', [221]);
  socket.end();

  return { sent: true };
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  // This same message is used for invitations and password resets: an invited
  // account follows the same flow to set its first password and become active.
  // Example: fullName "Mai" starts the message with "Hi Mai,"; an empty name
  // uses "Hi there," instead.
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
