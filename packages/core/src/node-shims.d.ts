declare module 'node:fs' {
  export const existsSync: (...args: any[]) => any;
  export const readdirSync: (...args: any[]) => any;
  export const readFileSync: (...args: any[]) => any;
}

declare module 'node:path' {
  export const dirname: (...args: any[]) => any;
  export const extname: (...args: any[]) => any;
  export const join: (...args: any[]) => any;
  export const relative: (...args: any[]) => any;
  export const resolve: (...args: any[]) => any;
}
