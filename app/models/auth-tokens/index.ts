import createDebug from 'debug';

export { AuthToken } from './AuthToken';
export { AppTokenV1 } from './AppTokenV1';
export { SessionTokenV1 } from './SessionTokenV1';
export { SessionTokenV1Store } from './SessionTokenV1Store';

export const authDebug = createDebug('freefeed:authentication');
export const authDebugError = createDebug('freefeed:authentication:error');
