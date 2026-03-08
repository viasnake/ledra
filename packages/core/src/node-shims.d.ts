declare module 'node:fs' {
  export type Dirent = {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  };

  export const readdirSync: (path: string, options: { withFileTypes: true }) => readonly Dirent[];
  export const readFileSync: (path: string, encoding: 'utf8') => string;
}

declare module 'node:path' {
  export const extname: (path: string) => string;
  export const join: (...paths: readonly string[]) => string;
  export const relative: (from: string, to: string) => string;
}
