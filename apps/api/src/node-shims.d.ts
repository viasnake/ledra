declare module 'node:http' {
  export type IncomingMessage = {
    method?: string;
    url?: string;
  };

  export type ServerResponse = {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  };

  export type Server = {
    listen(port: number, host: string, callback?: () => void): void;
  };

  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void
  ): Server;
}

declare module 'node:fs/promises' {
  export type Dirent = {
    name: string;
    isFile(): boolean;
  };

  export function readdir(path: string, options: { withFileTypes: true }): Promise<readonly Dirent[]>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}

declare module 'node:path' {
  export function extname(path: string): string;
  export function join(...paths: readonly string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: readonly string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exitCode?: number;
};
