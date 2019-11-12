/* eslint babel/semi: "error" */
import createDebug from 'debug';
import Raven from 'raven';

import { load as configLoader } from '../../config/config';


const config = configLoader();
const debug = createDebug('freefeed:errors');

const sentryIsEnabled = 'sentryDsn' in config;


export function reportError(ctx) {
  return (err) => {
    const result = {};
    const status = err && err.status ? err.status : 500;

    if (status === 500) {
      if (sentryIsEnabled) {
        Raven.captureException(err, { req: ctx.request });
      }
    }

    if ('internalQuery' in err) {
      // looks like postgres err
      debug(err);
      Reflect.deleteProperty(err, 'message');  // do not expose DB internals
    }

    if (err && 'message' in err && err.message) {
      result.err = err.message;
    } else {
      result.err = 'Internal Server Error';
    }

    ctx.status = status;
    ctx.body = result;
  };
}

export class BadRequestException extends Error {
  constructor(message = 'Bad Request') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 400;
  }
}

export class NotAuthorizedException extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 401;
  }
}

export class ForbiddenException extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 403;
  }
}

export class NotFoundException extends Error {
  constructor(message = 'Not found') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 404;
  }
}

export class ValidationException extends Error {
  constructor(message = 'Invalid') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 422;
  }
}

export class TooManyRequestsException extends Error {
  constructor(message = 'Too Many Requests') {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.status = 429;
  }
}

export class ServerErrorException {
  constructor(message) {
    this.message = message || 'Internal server error';
    this.status = 500;
  }
}
