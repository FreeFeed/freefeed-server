/* eslint babel/semi: "error" */
import { isatty } from 'tty';
import { inspect } from 'util';

const useColors = isatty(parseInt(process.env.DEBUG_FD, 10) || 2);

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
    return `\u001b[${inspect.colors[color][0]}m${stylize(msg, ...colors)}\u001b[${
      inspect.colors[color][1]
    }m`;
  }

  return msg;
}
