declare module 'unexpected' {
  interface Expect {
    (subj: any, assertion: string, ...args: any[]): Promise<void>;
    it(assertion: string, ...args: any[]): Promise<void>;
  }

  const expect: Expect;
  export = expect;
}
