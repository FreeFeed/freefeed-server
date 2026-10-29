import expect from 'unexpected';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import smtpTransport from 'nodemailer-smtp-transport';
import { SMTPServer } from 'smtp-server';

describe('Nodemailer SMTP transport', () => {
  const messages = [];
  let server;
  let transporter;

  before(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, callback) {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          messages.push(Buffer.concat(chunks));
          callback();
        });
      },
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('SMTP server did not bind to a TCP port');
    }

    transporter = createTransport(
      smtpTransport({
        host: '127.0.0.1',
        port: address.port,
        secure: false,
        ignoreTLS: true,
      }),
    );
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

    const message = await simpleParser(messages[0]);
    expect(message, 'to satisfy', {
      from: { value: [{ address: 'sender@example.com' }] },
      subject: 'SMTP transport test',
      text: 'Test message\n',
      to: { value: [{ address: 'recipient@example.com' }] },
    });
  });
});
