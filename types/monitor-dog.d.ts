declare module 'monitor-dog' {
  export interface Timer {
    start(): void;
    stop(): void;
  }

  export function increment(name: string, amount?: number, tags?: Record<string, string>): void;
  export function timer(name: string, start?: boolean, tags?: Record<string, string>): Timer;
}
