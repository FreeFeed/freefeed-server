/**
 * A small debug-log package similar to node's util.debuglog and https://github.com/visionmedia/debug but simpler
 */
import { isatty } from 'tty';
import { format, inspect } from 'util';

const envName = 'DEBUG';
const logFunc = console.log.bind(console);  // eslint-disable-line no-console
const subjColors = ['cyan', 'green', 'yellow', 'blue', 'magenta', 'red'];

const useColors = isatty(parseInt(process.env.DEBUG_FD, 10) || 2);
const patterns = (process.env[envName] || '').split(',');
const funcs = {};
let colorIndex = 0;

/**
 * Create log function for specific subject.
 * @param subject {String}
 * @return {Function}
 */
export function get(subject) {
  if (!funcs[subject]) {
    if (isEnabledFor(subject)) {
      const color = subjColors[(colorIndex++) % subjColors.length];
      funcs[subject] = (...args) => {
        const msg = Reflect.apply(format, null, args);
        logFunc(format('  %s %s', stylize(subject, 'bold', color), msg));
      };
    } else {
      funcs[subject] = () => {};
    }
  }
  return funcs[subject];
}

/**
 * Check if subject is loggable according to DEBUG environment variable.
 * DEBUG is a comma-separated list of subjects wich you want to see. For example
 * `DEBUG foo,bar node script.js` enables only log functions with subjects 'foo' and 'bar'.
 * `isEnabledFor('foo') === true` in this case. You can use 'foo*' in DEBUG to match subjects
 * by prefix 'foo'.
 * @param subject {String}
 * @return {Boolean}
 */
export function isEnabledFor(subject) {
  return patterns.some((p) => {
    // exact match
    if (p === subject) {
      return true;
    }
    // wildcard: 'foo*' matches 'foo' and 'foobar'
    if (p.length > 0 && p[p.length - 1] === '*') {
      return p.substr(0, p.length - 1) === subject.substr(0, p.length - 1);
    }
    return false;
  });
}

/**
 * Stylize message with ASCII-colors or styles (see node's util.inspect.colors):
 * You can use 'white', 'grey', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow' colors
 * and 'bold', 'italic', 'underline', 'inverse' styles.
 * @param msg {String}
 * @param colors {Array.<String>} one or more color/style names
 * @return {String}
 */
export function stylize(msg, ...colors) {
  if (useColors && colors.length > 0) {
    const color = colors.shift();
    return `\u001b[${inspect.colors[color][0]}m${stylize(msg, ...colors)}\u001b[${inspect.colors[color][1]}m`;
  }
  return msg;
}
