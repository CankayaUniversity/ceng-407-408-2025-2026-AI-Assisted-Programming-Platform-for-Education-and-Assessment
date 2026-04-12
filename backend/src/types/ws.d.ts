/**
 * Minimal type shim for the `ws` package.
 * This file is only needed until `npm install` installs the real `ws` + `@types/ws` packages.
 * Once installed, the real declarations take precedence (skipLibCheck: true in tsconfig).
 */
declare module "ws" {
  import { EventEmitter } from "events";
  import { IncomingMessage } from "http";
  import { Duplex } from "stream";

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN:       1;
    static readonly CLOSING:    2;
    static readonly CLOSED:     3;

    readonly readyState: 0 | 1 | 2 | 3;
    readonly CONNECTING: 0;
    readonly OPEN:       1;
    readonly CLOSING:    2;
    readonly CLOSED:     3;

    constructor(address: string | URL, options?: Record<string, unknown>);

    send(data: string | Buffer | ArrayBuffer, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    on(event: "message", listener: (data: Buffer | string, isBinary: boolean) => void): this;
    on(event: "close",   listener: (code: number, reason: Buffer) => void): this;
    on(event: "error",   listener: (err: Error) => void): this;
    on(event: "open",    listener: () => void): this;
    on(event: string,    listener: (...args: unknown[]) => void): this;
  }

  export interface ServerOptions {
    noServer?: boolean;
    port?:     number;
    host?:     string;
    path?:     string;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: ServerOptions);
    handleUpgrade(
      request: IncomingMessage,
      socket:  Duplex,
      head:    Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void,
    ): void;
    on(event: "connection", listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: string,       listener: (...args: unknown[]) => void): this;
    emit(event: "connection", socket: WebSocket, request: IncomingMessage): boolean;
    emit(event: string, ...args: unknown[]): boolean;
  }
}
