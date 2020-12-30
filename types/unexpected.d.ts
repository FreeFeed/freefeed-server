declare module 'unexpected' {
  type Expect = (subj: any, assertion: string, ...args: any[]) => Promise<void>;

  const expect: Expect;
  export = expect;
}
