declare module 'monitor-dog' {
  export function increment(name: string, amount?: number, tags?: Record<string, string>): void;
}
