import { format } from 'util';

import createDebug from 'debug';
import config from 'config';
import { Loggly } from 'node-loggly-bulk';

/**
 * Tweak createDebug to send messages to Loggly (https://www.loggly.com/)
 *
 * @returns {void}
 */
export function addLogglyToDebug() {
  const { token, subdomain, tags } = config.loggly;

  if (!token || !subdomain) {
    return;
  }

  const client = new Loggly({ token, subdomain, tags, json: true });
  const _formatArgs = createDebug.formatArgs;
  createDebug.formatArgs = function (args) {
    client.log(
      { message: argsToString.call(this, args), namespace: this.namespace },
      this.namespace.split(':'),
    );
    return _formatArgs.call(this, args);
  };
}

// Taken from the https://github.com/debug-js/debug code
// The 'debug' module uses custom %-codes to format messages, so we need to
// use it's algorithm here.
function argsToString(args) {
  args = [...args];
  args[0] = createDebug.coerce(args[0]);

  if (typeof args[0] !== 'string') {
    // Anything else let's inspect with %O
    args.unshift('%O');
  }

  // Apply any `formatters` transformations
  let index = 0;
  args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, fmt) => {
    // If we encounter an escaped % then don't increase the array index
    if (match === '%%') {
      return '%';
    }

    index++;
    const formatter = this.formatters?.[fmt];

    if (typeof formatter === 'function') {
      const val = args[index];
      match = formatter.call(this, val);

      // Now we need to remove `args[index]` since it's inlined in the `format`
      args.splice(index, 1);
      index--;
    }

    return match;
  });

  return format(...args);
}
