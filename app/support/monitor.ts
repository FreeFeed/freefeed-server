import config from 'config';
import createDebug from 'debug';
import { StatsD } from 'hot-shots';

const debug = createDebug('freefeed:monitor');

type Tags = Record<string, string>;

export type Timer = {
  start(): void;
  stop(): void;
};

const { host, port } = config.datadog;

const client =
  host && port
    ? new StatsD({
        host,
        port,
        prefix: config.monitorPrefix,
        errorHandler: (err) => debug('StatsD error', err),
      })
    : null;

function increment(name: string, value = 1, tags?: Tags) {
  client?.increment(name, value, undefined, tags);
}

function decrement(name: string, value = 1, tags?: Tags) {
  client?.decrement(name, value, undefined, tags);
}

/**
 * Reports the time between start() and stop() in milliseconds to the `name`
 * histogram.
 */
function timer(name: string, start = true, tags?: Tags): Timer {
  let startedAt: number | null = null;
  const t = {
    start() {
      startedAt ??= Date.now();
    },
    stop() {
      if (startedAt !== null) {
        client?.histogram(name, Date.now() - startedAt, undefined, tags);
      }
    },
  };

  if (start) {
    t.start();
  }

  return t;
}

export default { increment, decrement, timer };
