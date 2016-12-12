import { load as configLoader } from '../config';


const config = configLoader();

export const originMiddleware = async (ctx, next) => {
  ctx.response.set('Access-Control-Allow-Origin', config.origin);
  ctx.response.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  ctx.response.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Authentication-Token, Access-Control-Request-Method');

  await next();
};
