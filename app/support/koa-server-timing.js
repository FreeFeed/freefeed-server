/**
 * Based on https://github.com/tinovyatkin/koa-server-timing
 * created by Konstantin Vyatkin and Charles Vazac
 */
import assert from 'assert';


/**
 * Converts tuple of [seconds, nanoseconds] to floating
 * point number of milliseconds with 2 fractional digits
 *
 * @returns {number}
 */
function hrTimeToMs(hrtime) {
  const [sec, nanosec] = hrtime;

  const secAsMs = sec * 1000;
  const nsAsMs = parseFloat((nanosec / 1000000).toFixed(2));

  return secAsMs + nsAsMs;
}

class ServerTimings {
  #started;
  #stopped;

  constructor() {
    this.#started = new Map();
    this.#stopped = [];
  }

  start(spanName, spanDesc = null) {
    assert.ok(!this.#started.has(spanName), 'This span is running already, name must be unique!');
    assert.ok(spanName.length, 'Either slug or description must be non-empty');

    this.#started.set(spanName, { start: process.hrtime(), desc: spanDesc || '' });
  }

  stop(spanName) {
    assert.ok(this.#started.has(spanName), `Span to stop (${spanName}) is not found!`);
    assert.ok('start' in this.#started.get(spanName), 'Span to stop were never started!');

    const span = this.#started.get(spanName);

    const stop = process.hrtime(span.start);
    const duration = `;dur=${hrTimeToMs(stop)}`;

    const { desc } = span;
    const description = desc.length && spanName !== desc ? `;desc="${desc}"` : '';

    this.#started.delete(spanName);
    this.#stopped.push(`${spanName}${duration}${description}`);
  }

  addTimelessMetric(spanName, desc = null) {
    const description = desc && desc.length && spanName !== desc ? `;desc="${desc}"` : '';
    this.#stopped.push(`${spanName}${description}`);
  }

  stopAll() {
    this.#started.forEach((span, spanName) => {
      this.stop(spanName);
    });
  }

  get metrics() {
    return this.#stopped;
  }
}

const koaServerTiming = () => async (ctx, next) => {
  // attaching timings object to state
  ctx.serverTiming = new ServerTimings();
  ctx.serverTiming.start('total', 'Total execution time');

  // letting other things pass now
  await next();

  // Terminate all spans that wasn't explicitely terminated
  ctx.serverTiming.stopAll();

  // constructing headers array
  const { metrics } = ctx.serverTiming;

  // Adding our headers now
  if (metrics.length) {
    ctx.append('Server-Timing', metrics.join(', '));
  }
};

export { koaServerTiming };
