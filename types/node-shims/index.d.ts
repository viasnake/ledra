declare module 'node:fs' {
  export const existsSync: (path: string) => boolean;
  export const mkdirSync: (path: string, options: { recursive: true }) => void;
  export const readFileSync: (path: string, encoding: 'utf8') => string;
  export const writeFileSync: (path: string, data: string, encoding: 'utf8') => void;
  export const readdirSync: (
    path: string,
    options: { withFileTypes: true }
  ) => readonly { isDirectory(): boolean; name: string }[];
  export const statSync: (path: string) => { isDirectory(): boolean };
}

declare module 'node:path' {
  export const dirname: (path: string) => string;
  export const extname: (path: string) => string;
  export const join: (...parts: readonly string[]) => string;
  export const relative: (from: string, to: string) => string;
  export const resolve: (...parts: readonly string[]) => string;
}

declare module 'node:child_process' {
  export const execFileSync: (
    file: string,
    args: readonly string[],
    options?: {
      encoding?: 'utf8';
      stdio?: 'pipe' | 'inherit';
    }
  ) => string;
}

declare module 'node:url' {
  export const fileURLToPath: (url: string | URL) => string;
}

declare module 'node:http' {
  export type IncomingMessage = {
    method?: string;
    url?: string;
  };
  export type ServerResponse = {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (value?: string) => void;
  };
  export const createServer: (
    handler: (request: IncomingMessage, response: ServerResponse) => void
  ) => {
    listen: (port: number, host: string, callback: () => void) => void;
  };
}

declare module 'js-yaml' {
  export const load: (value: string) => unknown;
}

declare const process: {
  cwd(): string;
  env?: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
};
