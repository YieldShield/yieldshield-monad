"use strict";

// Local compatibility copy of anymatch 3.1.3 (ISC, see LICENSE). The matching
// logic is unchanged; string globs are compiled with minimatch 11 instead of
// picomatch, which has an unpatched ReDoS (GHSA-fc5q-39xc-vjpf), and the
// normalize-path helper is inlined.

Object.defineProperty(exports, "__esModule", { value: true });

const { Minimatch } = require("minimatch");

/**
 * @typedef {(testString: string) => boolean} AnymatchFn
 * @typedef {string|RegExp|AnymatchFn} AnymatchPattern
 * @typedef {AnymatchPattern|AnymatchPattern[]} AnymatchMatcher
 */
const BANG = "!";
const DEFAULT_OPTIONS = { returnIndex: false };
const arrify = (item) => (Array.isArray(item) ? item : [item]);

/**
 * Same behaviour as normalize-path 3.0.0 with stripTrailing === false, the only
 * way anymatch calls it.
 * @param {string} path
 * @returns {string}
 */
const normalizePath = (path) => {
  if (typeof path !== "string") {
    throw new TypeError("expected path to be a string");
  }
  if (path === "\\" || path === "/") return "/";
  if (path.length <= 1) return path;

  let prefix = "";
  if (path.length > 4 && path[3] === "\\") {
    const ch = path[2];
    if ((ch === "?" || ch === ".") && path.slice(0, 2) === "\\\\") {
      path = path.slice(2);
      prefix = "//";
    }
  }
  return prefix + path.split(/[/\\]+/).join("/");
};

/**
 * @param {string} glob
 * @param {object} options
 * @returns {AnymatchFn}
 */
const compileGlob = (glob, options) => {
  const { returnIndex, ...globOptions } = options;
  const matcher = new Minimatch(glob, globOptions);
  // picomatch lets a trailing "/**" also match the directory itself, so
  // "**/node_modules/**" matches "node_modules". Keep that behaviour.
  const parent = glob.length > 3 && glob.endsWith("/**") ? new Minimatch(glob.slice(0, -3), globOptions) : null;
  // picomatch never matches an empty string.
  return (string) => string !== "" && (matcher.match(string) || (parent !== null && parent.match(string)));
};

/**
 * @param {AnymatchPattern} matcher
 * @param {object} options
 * @returns {AnymatchFn}
 */
const createPattern = (matcher, options) => {
  if (typeof matcher === "function") {
    return matcher;
  }
  if (typeof matcher === "string") {
    const glob = compileGlob(matcher, options);
    return (string) => matcher === string || glob(string);
  }
  if (matcher instanceof RegExp) {
    return (string) => matcher.test(string);
  }
  return (string) => false;
};

/**
 * @param {Array<Function>} patterns
 * @param {Array<Function>} negPatterns
 * @param {String|Array} args
 * @param {Boolean} returnIndex
 * @returns {boolean|number}
 */
const matchPatterns = (patterns, negPatterns, args, returnIndex) => {
  const isList = Array.isArray(args);
  const _path = isList ? args[0] : args;
  if (!isList && typeof _path !== "string") {
    throw new TypeError("anymatch: second argument must be a string: got " + Object.prototype.toString.call(_path));
  }
  const path = normalizePath(_path);

  for (let index = 0; index < negPatterns.length; index++) {
    const nglob = negPatterns[index];
    if (nglob(path)) {
      return returnIndex ? -1 : false;
    }
  }

  const applied = isList && [path].concat(args.slice(1));
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (isList ? pattern(...applied) : pattern(path)) {
      return returnIndex ? index : true;
    }
  }

  return returnIndex ? -1 : false;
};

/**
 * @param {AnymatchMatcher} matchers
 * @param {Array|string} testString
 * @param {object} options
 * @returns {boolean|number|Function}
 */
const anymatch = (matchers, testString, options = DEFAULT_OPTIONS) => {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const opts = typeof options === "boolean" ? { returnIndex: options } : options;
  const returnIndex = opts.returnIndex || false;

  // Early cache for matchers.
  const mtchers = arrify(matchers);
  const negatedGlobs = mtchers
    .filter((item) => typeof item === "string" && item.charAt(0) === BANG)
    .map((item) => item.slice(1))
    .map((item) => compileGlob(item, opts));
  const patterns = mtchers
    .filter((item) => typeof item !== "string" || (typeof item === "string" && item.charAt(0) !== BANG))
    .map((matcher) => createPattern(matcher, opts));

  if (testString == null) {
    return (testString, ri = false) => {
      const returnIndex = typeof ri === "boolean" ? ri : false;
      return matchPatterns(patterns, negatedGlobs, testString, returnIndex);
    };
  }

  return matchPatterns(patterns, negatedGlobs, testString, returnIndex);
};

anymatch.default = anymatch;
module.exports = anymatch;
