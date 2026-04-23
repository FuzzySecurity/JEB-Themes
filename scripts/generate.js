#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'theme-templates');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const COMBINED_FILE = path.join(DIST_DIR, 'all-themes.theme');

const STRUCTURAL_KEYS = {
  FOREGROUND: 'foreground',
  BACKGROUND: 'background',
  LINE: 'current_line',
  DEBUGLINE: 'debug_line',
  ACTIVE: 'selection',
};

/**
 * @typedef {Object} ThemeStyle
 * @property {string=} fg
 * @property {string=} bg
 * @property {boolean=} bold
 * @property {boolean=} italic
 * @property {string=} active
 */

/**
 * @typedef {Object} Theme
 * @property {string} name
 * @property {boolean} dark
 * @property {string=} parent
 * @property {Record<string, string>} structural
 * @property {Record<string, ThemeStyle>} styles
 */

/**
 * Encode a string the way JEB expects in `.ui.ColorSchemes`.
 * @param {string} value
 * @returns {string}
 */
function encodeForJeb(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Convert `#RRGGBB` into `RRGGBB`.
 * @param {string|undefined} color
 * @returns {string}
 */
function toJebColor(color) {
  return color ? color.slice(1).toUpperCase() : '';
}

/**
 * Turn a style object into JEB's `fg,bg,bold,italic,active` format.
 * @param {ThemeStyle} style
 * @returns {string}
 */
function formatStyle(style) {
  const bold = Object.hasOwn(style, 'bold') ? String(style.bold) : '';
  const italic = Object.hasOwn(style, 'italic') ? String(style.italic) : '';

  return [
    toJebColor(style.fg),
    toJebColor(style.bg),
    bold,
    italic,
    toJebColor(style.active),
  ].join(',');
}

/**
 * Build the raw, non-URL-encoded JEB theme body.
 * @param {Theme} theme
 * @returns {string}
 */
function buildThemeBody(theme) {
  const parts = [
    `NAME=${theme.name}`,
    `DARK=${theme.dark}`,
  ];

  if (theme.parent) {
    parts.push(`PARENT=${theme.parent}`);
  }

  for (const [key, field] of Object.entries(STRUCTURAL_KEYS)) {
    parts.push(`${key}=${toJebColor(theme.structural[field])}`);
  }

  for (const [styleName, style] of Object.entries(theme.styles)) {
    parts.push(`${styleName}=${formatStyle(style)}`);
  }

  return parts.join('|');
}

/**
 * Turn a theme into a full `<name>=<url-encoded-body>` segment.
 * @param {Theme} theme
 * @returns {string}
 */
function buildThemeSegment(theme) {
  return `${theme.name}=${encodeForJeb(buildThemeBody(theme))}`;
}

/**
 * Read and minimally validate a theme JSON file.
 * @param {string} filePath
 * @returns {Theme}
 */
function readTheme(filePath) {
  /** @type {Theme} */
  const theme = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const expectedName = path.basename(filePath, '.json');

  if (!theme || typeof theme !== 'object') {
    throw new Error(`${filePath}: theme must be a JSON object`);
  }
  if (theme.name !== expectedName) {
    throw new Error(`${filePath}: expected theme.name to be "${expectedName}"`);
  }
  if (typeof theme.dark !== 'boolean') {
    throw new Error(`${filePath}: theme.dark must be a boolean`);
  }
  if (!theme.structural || typeof theme.structural !== 'object') {
    throw new Error(`${filePath}: missing structural block`);
  }
  if (!theme.styles || typeof theme.styles !== 'object') {
    throw new Error(`${filePath}: missing styles block`);
  }

  return theme;
}

/**
 * List source theme JSON files in build order.
 * @returns {string[]}
 */
function listThemeFiles() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source directory not found: ${SOURCE_DIR}`);
  }

  return fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(SOURCE_DIR, name));
}

/**
 * Recreate `dist/` and write one `.theme` file per source theme plus a combined file.
 */
function main() {
  const files = listThemeFiles();

  if (files.length === 0) {
    throw new Error(`No theme JSON files found in ${SOURCE_DIR}`);
  }

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const segments = files.map((filePath) => {
    const theme = readTheme(filePath);
    const segment = buildThemeSegment(theme);
    const outputPath = path.join(DIST_DIR, `${theme.name}.theme`);

    fs.writeFileSync(outputPath, `${segment}\n`);
    console.log(`[write] ${path.basename(outputPath)}`);

    return segment;
  });

  fs.writeFileSync(COMBINED_FILE, `${segments.join('&')}\n`);
  console.log(`[write] ${path.basename(COMBINED_FILE)} (${segments.length} themes)`);
}

main();
