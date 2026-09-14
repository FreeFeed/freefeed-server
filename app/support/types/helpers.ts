export type Branded<T, B extends string> = T & { __brand?: B };
export type Nullable<T> = T | null;
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;
// Utility type to make TypeScript display a type in a more readable way
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
