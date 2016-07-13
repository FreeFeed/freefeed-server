export function reportError(res) {
  return (err) => {
    const status = err.status || 422
    const result = {}

    if ('message' in err) {
      result.err = err.message
    }

    res.status(status).jsonp(result)
  }
}

export class BadRequestException {
  constructor(message) {
    this.message = message || 'Bad Request'
    this.status = 400
  }
}

export class ForbiddenException {
  constructor(message) {
    this.message = message || 'Forbidden'
    this.status = 403
  }
}

export class NotFoundException {
  constructor(message) {
    this.message = message || 'Not found'
    this.status = 404
  }
}

export class ValidationException {
  constructor(message) {
    this.message = message || 'Invalid'
    this.status = 422
  }
}
