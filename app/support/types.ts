import { type DefaultState, type ParameterizedContext } from 'koa';
import { type Config } from 'config';

import type PubsubListener from '../pubsub-listener';

export type Branded<T, B extends string> = T & { __brand?: B };

export type UUID = Branded<string, 'uuid'>;
export type IPAddr = Branded<string, 'IP address'>;

export type Nullable<T> = T | null;

// Controller context
export type AppContext = { config: Config; port: number; pubsub: PubsubListener };
export type Ctx = ParameterizedContext<DefaultState, AppContext>;
