import sinon from 'sinon';
import { JSDOM } from 'jsdom';

/**
 * Initializes JSDOM object, sets up handlers that propagate errors
 * from within the JSDOM context.
 */
export function propagateJsdomErrors(html, { beforeParse } = {}) {
  let error;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    beforeParse(window) {
      window.opener = { postMessage: sinon.stub() };

      if (beforeParse) {
        beforeParse(window);
      }

      window.onerror = (err) => {
        error = err;
      };
    }
  });

  if (error) {
    throw error;
  }

  return dom;
}
