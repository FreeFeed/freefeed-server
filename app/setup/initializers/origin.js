import config from 'config';


export const originMiddleware = async (ctx, next) => {
  ctx.response.set('Access-Control-Allow-Origin', config.origin);
  ctx.response.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  ctx.response.set('Access-Control-Allow-Headers', [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'X-Authentication-Token',
    'Access-Control-Request-Method',
    'Authorization',
  ].join(', '));
  ctx.response.set('Access-Control-Expose-Headers', 'Date, X-Freefeed-Server');

  await next();
};
