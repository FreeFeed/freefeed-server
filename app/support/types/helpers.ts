export type Branded<T, B extends string> = T & { __brand?: B };
export type Nullable<T> = T | null;
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;
