declare module 'node:fs' {
  export const mkdirSync: (path: string, options: { recursive: true }) => void;
  export const writeFileSync: (path: string, data: string, encoding: 'utf8') => void;
}

declare module 'node:path' {
  export const dirname: (path: string) => string;
}
