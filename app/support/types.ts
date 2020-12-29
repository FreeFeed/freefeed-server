export type Branded<T, B extends string> = T & { __brand?: B;};

export type UUID = Branded<string, 'uuid'>;
export type IPAddr = Branded<string, 'IP address'>;

export type Nullable<T> = T | null;
