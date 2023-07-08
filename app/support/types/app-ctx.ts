import { DefaultContext, type DefaultState, type ParameterizedContext } from 'koa';
import { type Config } from 'config';

import PubsubListener from '../../pubsub-listener';

// Controller context
export type AppContext = { config: Config; port: number; pubsub: PubsubListener };
export type Ctx<State = DefaultState> = ParameterizedContext<State, AppContext> & DefaultContext;
