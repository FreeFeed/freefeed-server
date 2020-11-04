export type Branded<T, B extends string> = T & { __brand?: B;};

export type UUID = Branded<string, 'uuid'>;

