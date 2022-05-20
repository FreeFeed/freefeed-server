/**
 * Code pre-processing before transpiling
 */
const { pathToFileURL } = require("url");

module.exports = function (code, filename) {
  // Replace import.meta.url in gifsicle package
  if (/node_modules[/\\]gifsicle[/\\]lib/.test(filename)) {
    return code.replace(
      /\bimport\.meta\.url\b/g,
      JSON.stringify(pathToFileURL(filename))
    );
  }
  return code;
};
