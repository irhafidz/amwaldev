import { afterAll, describe, expect, test } from 'bun:test';
import { createMailer } from '../src/lib/email/mailer';
import { renderPasswordResetEmail } from '../src/lib/email/password-reset-template';

/**
 * Talks real SMTP to a throwaway local server, so the transport wiring (host,
 * port, envelope, headers, body) is exercised without any external account.
 */

const CRLF = '\r\n';
const END_OF_DATA = `${CRLF}.${CRLF}`;
const received: string[] = [];

interface SinkState {
  buffer: string;
  inData: boolean;
}

interface SinkSocket {
  end(): void;
  write(text: string): void;
}

function answer(socket: SinkSocket, state: SinkState, line: string): void {
  const command = line.slice(0, 4).toUpperCase();
  if (command === 'DATA') {
    state.inData = true;
    socket.write(`354 go ahead${CRLF}`);
  } else if (command === 'QUIT') {
    socket.write(`221 bye${CRLF}`);
    socket.end();
  } else {
    socket.write(`250 ok${CRLF}`);
  }
}

/** Consumes whatever complete SMTP lines / DATA blocks are in the buffer. */
function drain(socket: SinkSocket, state: SinkState): void {
  const terminator = state.inData ? END_OF_DATA : CRLF;
  const end = state.buffer.indexOf(terminator);
  if (end === -1) {
    return;
  }

  const chunk = state.buffer.slice(0, end);
  state.buffer = state.buffer.slice(end + terminator.length);

  if (state.inData) {
    state.inData = false;
    received.push(chunk);
    socket.write(`250 queued${CRLF}`);
  } else {
    answer(socket, state, chunk);
  }
  drain(socket, state);
}

const sink = Bun.listen<SinkState>({
  hostname: '127.0.0.1',
  port: 0,
  socket: {
    open(socket) {
      socket.data = { buffer: '', inData: false };
      socket.write(`220 sink ESMTP${CRLF}`);
    },
    data(socket, chunk) {
      socket.data.buffer += chunk.toString();
      drain(socket, socket.data);
    },
  },
});

afterAll(() => {
  sink.stop(true);
});

describe('createMailer', () => {
  test('delivers the password reset email over SMTP', async () => {
    const mailer = createMailer({
      from: 'Amwal <no-reply@amwal.test>',
      host: '127.0.0.1',
      password: undefined,
      port: sink.port,
      user: undefined,
    });

    await mailer.send({
      to: 'donatur@example.com',
      ...renderPasswordResetEmail({ name: 'Siti', otp: '048215' }),
    });

    expect(received).toHaveLength(1);
    const raw = received[0] ?? '';
    expect(raw).toContain('To: donatur@example.com');
    expect(raw).toContain('no-reply@amwal.test');
    expect(raw).toContain('multipart/alternative');
    expect(raw).toContain('Subject:');
  });
});
