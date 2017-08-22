import SocketIO from 'socket.io-client';

const eventTimeout = 2000;
const silenceTimeout = 500;

export default class Session {
  socket = null;
  name = '';

  static create(port, name = '') {
    const options = {
      transports:             ['websocket'],
      'force new connection': true,
    };
    return new Promise((resolve, reject) => {
      const socket = SocketIO.connect(`http://localhost:${port}/`, options);
      socket.on('error', reject);
      socket.on('connect_error', reject);
      socket.on('connect', () => resolve(new Session(socket, name)));
    });
  }

  constructor(socket, name = '') {
    this.socket = socket;
    this.name = name;
  }

  send(event, data) {
    this.socket.emit(event, data);
  }

  disconnect() {
    this.socket.disconnect();
  }

  receive(event) {
    return new Promise((resolve, reject) => {
      const success = (data) => {
        this.socket.off(event, success);
        clearTimeout(timer);
        resolve(data);
      };
      this.socket.on(event, success);
      const timer = setTimeout(() => reject(new Error(`${this.name ? `${this.name}: ` : ''}Expecting '${event}' event, got timeout`)), eventTimeout);
    });
  }

  notReceive(event) {
    return new Promise((resolve, reject) => {
      const fail = () => {
        this.socket.off(event, fail);
        clearTimeout(timer);
        reject(new Error(`${this.name ? `${this.name}: ` : ''}Expecting silence, got '${event}' event`));
      };
      this.socket.on(event, fail);
      const timer = setTimeout(() => resolve(null), silenceTimeout);
    });
  }
}
