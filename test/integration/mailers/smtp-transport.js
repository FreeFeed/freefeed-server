import expect from 'unexpected';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import { SMTPServer } from 'smtp-server';

describe('Nodemailer SMTP transport', () => {
  const messages = [];
  let server;
  let transporter;

  before(async () => {
    server = new SMTPServer({
      authMethods: ['PLAIN', 'LOGIN'],
      onAuth(auth, _session, callback) {
        if (auth.username === 'user' && auth.password === 'pass') {
          callback(null, { user: auth.username });
        } else {
          callback(new Error('Invalid username or password'));
        }
      },
      onData(stream, session, callback) {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          messages.push({ raw: Buffer.concat(chunks), session });
          callback();
        });
      },
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('SMTP server did not bind to a TCP port');
    }

    transporter = createTransport({
      host: '127.0.0.1',
      port: address.port,
      secure: false,
      requireTLS: true,
      // smtp-server falls back to its bundled self-signed certificate
      tls: { rejectUnauthorized: false },
      auth: { user: 'user', pass: 'pass' },
    });
  });

  after(async () => {
    transporter?.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('should send a message through the configured SMTP transport', async () => {
    const result = await transporter.sendMail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'SMTP transport test',
      text: 'Test message',
    });

    expect(result.accepted, 'to equal', ['recipient@example.com']);
    expect(messages, 'to have length', 1);
    expect(messages[0].session, 'to satisfy', { secure: true, user: 'user' });

    const message = await simpleParser(messages[0].raw);
    expect(message, 'to satisfy', {
      from: { value: [{ address: 'sender@example.com' }] },
      subject: 'SMTP transport test',
      text: 'Test message\n',
      to: { value: [{ address: 'recipient@example.com' }] },
    });
  });
});
