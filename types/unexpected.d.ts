declare module 'unexpected' {
  interface Expect {
    (subj: any, assertion: string, ...args: any[]): Promise<void>;
    it(assertion: string, ...args: any[]): Promise<void>;
    clone(): Expect;
    use(x: any): void;
  }

  const expect: Expect;
  export = expect;
}

declare module 'unexpected-date' {}
