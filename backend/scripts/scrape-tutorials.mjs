/**
 * scrape-tutorials.mjs
 *
 * Scrapes every individual C tutorial page from w3schools.com and writes one
 * JSON file per page into backend/src/data/tutorials/c/<tag>.json.
 *
 * Usage:
 *   node backend/scripts/scrape-tutorials.mjs
 *
 * Requirements:
 *   - Node 18+ (built-in fetch)
 *   - cheerio  (npm install cheerio  inside backend/)
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Bootstrap cheerio via CommonJS require so we work with both CJS and ESM
// versions of the package.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

let cheerio;
try {
  cheerio = require('cheerio');
} catch {
  console.error(
    '\n[ERROR] cheerio is not installed.\n' +
    '  Run:  npm install cheerio   (inside the backend/ directory)\n' +
    '  Then re-run this script.\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../src/data/tutorials/c');

// ---------------------------------------------------------------------------
// Page manifest — all pages listed explicitly; no next-link following.
// ---------------------------------------------------------------------------
const CATEGORIES = [
  {
    category: 'C Tutorial',
    categoryOrder: 1,
    pages: [
      { order: 1,  tag: 'introduction',          title: 'C Introduction',            url: '/c/c_intro.php' },
      { order: 2,  tag: 'getting-started',        title: 'C Get Started',             url: '/c/c_getstarted.php' },
      { order: 3,  tag: 'syntax',                 title: 'C Syntax',                  url: '/c/c_syntax.php' },
      { order: 4,  tag: 'statements',             title: 'C Statements',              url: '/c/c_statements.php' },
      { order: 5,  tag: 'output',                 title: 'C Output',                  url: '/c/c_output.php' },
      { order: 6,  tag: 'new-lines',              title: 'C New Lines',               url: '/c/c_newline.php' },
      { order: 7,  tag: 'comments',               title: 'C Comments',                url: '/c/c_comments.php' },
      { order: 8,  tag: 'variables',              title: 'C Variables',               url: '/c/c_variables.php' },
      { order: 9,  tag: 'format-specifiers',      title: 'C Format Specifiers',       url: '/c/c_variables_format.php' },
      { order: 10, tag: 'variables-change',       title: 'C Change Variable Values',  url: '/c/c_variables_change.php' },
      { order: 11, tag: 'multiple-variables',     title: 'C Multiple Variables',      url: '/c/c_variables_multiple.php' },
      { order: 12, tag: 'variable-names',         title: 'C Variable Names',          url: '/c/c_variables_names.php' },
      { order: 13, tag: 'variables-reallife',     title: 'C Variables Real-Life',     url: '/c/c_variables_reallife.php' },
      { order: 14, tag: 'data-types',             title: 'C Data Types',              url: '/c/c_data_types.php' },
      { order: 15, tag: 'data-types-characters',  title: 'C Characters',              url: '/c/c_data_types_characters.php' },
      { order: 16, tag: 'data-types-numbers',     title: 'C Numbers',                 url: '/c/c_data_types_numbers.php' },
      { order: 17, tag: 'data-types-decimal',     title: 'C Decimal Precision',       url: '/c/c_data_types_dec.php' },
      { order: 18, tag: 'data-types-sizeof',      title: 'C Memory Size',             url: '/c/c_data_types_sizeof.php' },
      { order: 19, tag: 'data-types-reallife',    title: 'C Data Types Real-Life',    url: '/c/c_data_types_reallife.php' },
      { order: 20, tag: 'data-types-extended',    title: 'C Extended Types',          url: '/c/c_data_types_extended.php' },
      { order: 21, tag: 'type-conversion',        title: 'C Type Conversion',         url: '/c/c_type_conversion.php' },
      { order: 22, tag: 'constants',              title: 'C Constants',               url: '/c/c_constants.php' },
      { order: 23, tag: 'operators',              title: 'C Operators',               url: '/c/c_operators.php' },
      { order: 24, tag: 'operators-arithmetic',   title: 'C Arithmetic Operators',    url: '/c/c_operators_arithmetic.php' },
      { order: 25, tag: 'operators-assignment',   title: 'C Assignment Operators',    url: '/c/c_operators_assignment.php' },
      { order: 26, tag: 'operators-comparison',   title: 'C Comparison Operators',    url: '/c/c_operators_comparison.php' },
      { order: 27, tag: 'operators-logical',      title: 'C Logical Operators',       url: '/c/c_operators_logical.php' },
      { order: 28, tag: 'operators-precedence',   title: 'C Operator Precedence',     url: '/c/c_operators_precedence.php' },
      { order: 29, tag: 'booleans',               title: 'C Booleans',                url: '/c/c_booleans.php' },
      { order: 30, tag: 'booleans-reallife',      title: 'C Booleans Real-Life',      url: '/c/c_booleans_reallife.php' },
      { order: 31, tag: 'if',                     title: 'C If Statement',            url: '/c/c_conditions.php' },
      { order: 32, tag: 'else',                   title: 'C Else Statement',          url: '/c/c_conditions_else.php' },
      { order: 33, tag: 'else-if',                title: 'C Else If',                 url: '/c/c_conditions_elseif.php' },
      { order: 34, tag: 'shorthand-if',           title: 'C Short Hand If',           url: '/c/c_conditions_short_hand.php' },
      { order: 35, tag: 'nested-if',              title: 'C Nested If',               url: '/c/c_conditions_nested.php' },
      { order: 36, tag: 'conditions-logical',     title: 'C Conditions & Logical',    url: '/c/c_conditions_logical.php' },
      { order: 37, tag: 'conditions-reallife',    title: 'C Conditions Real-Life',    url: '/c/c_conditions_reallife.php' },
      { order: 38, tag: 'switch',                 title: 'C Switch',                  url: '/c/c_switch.php' },
      { order: 39, tag: 'while-loop',             title: 'C While Loop',              url: '/c/c_while_loop.php' },
      { order: 40, tag: 'do-while',               title: 'C Do/While Loop',           url: '/c/c_do_while_loop.php' },
      { order: 41, tag: 'while-reallife',         title: 'C While Loop Real-Life',    url: '/c/c_while_loop_reallife.php' },
      { order: 42, tag: 'for-loop',               title: 'C For Loop',                url: '/c/c_for_loop.php' },
      { order: 43, tag: 'nested-loops',           title: 'C Nested Loops',            url: '/c/c_for_loop_nested.php' },
      { order: 44, tag: 'for-reallife',           title: 'C For Loop Real-Life',      url: '/c/c_for_loop_reallife.php' },
      { order: 45, tag: 'break-continue',         title: 'C Break/Continue',          url: '/c/c_break_continue.php' },
      { order: 46, tag: 'arrays',                 title: 'C Arrays',                  url: '/c/c_arrays.php' },
      { order: 47, tag: 'array-size',             title: 'C Array Size',              url: '/c/c_arrays_size.php' },
      { order: 48, tag: 'array-loops',            title: 'C Array Loops',             url: '/c/c_arrays_loop.php' },
      { order: 49, tag: 'arrays-reallife',        title: 'C Arrays Real-Life',        url: '/c/c_arrays_reallife.php' },
      { order: 50, tag: 'multidimensional',       title: 'C Multidimensional Arrays', url: '/c/c_arrays_multi.php' },
      { order: 51, tag: 'strings',                title: 'C Strings',                 url: '/c/c_strings.php' },
      { order: 52, tag: 'string-special-chars',   title: 'C Special Characters',      url: '/c/c_strings_esc.php' },
      { order: 53, tag: 'string-functions',       title: 'C String Functions',        url: '/c/c_strings_functions.php' },
      { order: 54, tag: 'user-input',             title: 'C User Input',              url: '/c/c_user_input.php' },
      { order: 55, tag: 'memory-address',         title: 'C Memory Address',          url: '/c/c_memory_address.php' },
      { order: 56, tag: 'pointers',               title: 'C Pointers',                url: '/c/c_pointers.php' },
      { order: 57, tag: 'pointers-arrays',        title: 'C Pointers & Arrays',       url: '/c/c_pointers_arrays.php' },
      { order: 58, tag: 'pointer-arithmetic',     title: 'C Pointer Arithmetic',      url: '/c/c_pointers_arithmetic.php' },
      { order: 59, tag: 'pointer-to-pointer',     title: 'C Pointer to Pointer',      url: '/c/c_pointer_to_pointer.php' },
    ],
  },
  {
    category: 'C Functions',
    categoryOrder: 2,
    pages: [
      { order: 1, tag: 'functions',            title: 'C Functions',            url: '/c/c_functions.php' },
      { order: 2, tag: 'function-parameters',  title: 'C Function Parameters',  url: '/c/c_functions_parameters.php' },
      { order: 3, tag: 'scope',                title: 'C Scope',                url: '/c/c_scope.php' },
      { order: 4, tag: 'function-declaration', title: 'C Function Declaration', url: '/c/c_functions_decl.php' },
      { order: 5, tag: 'math-functions',       title: 'C Math Functions',       url: '/c/c_math.php' },
      { order: 6, tag: 'inline-functions',     title: 'C Inline Functions',     url: '/c/c_functions_inline.php' },
      { order: 7, tag: 'recursion',            title: 'C Recursion',            url: '/c/c_functions_recursion.php' },
      { order: 8, tag: 'function-pointers',    title: 'C Function Pointers',    url: '/c/c_functions_pointers.php' },
      { order: 9, tag: 'callback-functions',   title: 'C Callback Functions',   url: '/c/c_functions_callback.php' },
    ],
  },
  {
    category: 'C Files',
    categoryOrder: 3,
    pages: [
      { order: 1, tag: 'files-create', title: 'C Create Files',   url: '/c/c_files.php' },
      { order: 2, tag: 'files-write',  title: 'C Write To Files', url: '/c/c_files_write.php' },
      { order: 3, tag: 'files-read',   title: 'C Read Files',     url: '/c/c_files_read.php' },
    ],
  },
  {
    category: 'C Structures',
    categoryOrder: 4,
    pages: [
      { order: 1, tag: 'structs',          title: 'C Structures',        url: '/c/c_structs.php' },
      { order: 2, tag: 'nested-structs',   title: 'C Nested Structures', url: '/c/c_structs_nested.php' },
      { order: 3, tag: 'structs-pointers', title: 'C Structs & Pointers',url: '/c/c_structs_pointers.php' },
      { order: 4, tag: 'unions',           title: 'C Unions',            url: '/c/c_unions.php' },
      { order: 5, tag: 'typedef',          title: 'C Typedef',           url: '/c/c_typedef.php' },
      { order: 6, tag: 'struct-padding',   title: 'C Struct Padding',    url: '/c/c_structs_padding.php' },
    ],
  },
  {
    category: 'C Enums',
    categoryOrder: 5,
    pages: [
      { order: 1, tag: 'enums', title: 'C Enums', url: '/c/c_enums.php' },
    ],
  },
  {
    category: 'C Memory',
    categoryOrder: 6,
    pages: [
      { order: 1, tag: 'memory-management', title: 'C Memory Management', url: '/c/c_memory_management.php' },
      { order: 2, tag: 'memory-allocate',   title: 'C Allocate Memory',   url: '/c/c_memory_allocate.php' },
      { order: 3, tag: 'memory-access',     title: 'C Access Memory',     url: '/c/c_memory_access.php' },
      { order: 4, tag: 'memory-reallocate', title: 'C Reallocate Memory', url: '/c/c_memory_reallocate.php' },
      { order: 5, tag: 'memory-deallocate', title: 'C Deallocate Memory', url: '/c/c_memory_deallocate.php' },
      { order: 6, tag: 'memory-structs',    title: 'C Structs and Memory', url: '/c/c_memory_struct.php' },
      { order: 7, tag: 'memory-example',    title: 'C Memory Example',    url: '/c/c_memory_reallife.php' },
    ],
  },
  {
    category: 'C Errors',
    categoryOrder: 7,
    pages: [
      { order: 1, tag: 'errors',           title: 'C Errors',           url: '/c/c_errors.php' },
      { order: 2, tag: 'debugging',        title: 'C Debugging',        url: '/c/c_debugging.php' },
      { order: 3, tag: 'null',             title: 'C NULL',             url: '/c/c_null.php' },
      { order: 4, tag: 'error-handling',   title: 'C Error Handling',   url: '/c/c_error_handling.php' },
      { order: 5, tag: 'input-validation', title: 'C Input Validation', url: '/c/c_input_validation.php' },
    ],
  },
  {
    category: 'C More',
    categoryOrder: 8,
    pages: [
      { order: 1, tag: 'date-time',         title: 'C Date and Time',        url: '/c/c_date_time.php' },
      { order: 2, tag: 'random-numbers',    title: 'C Random Numbers',       url: '/c/c_random_numbers.php' },
      { order: 3, tag: 'macros',            title: 'C Macros',               url: '/c/c_macros.php' },
      { order: 4, tag: 'organize-code',     title: 'C Organize Code',        url: '/c/c_organize_code.php' },
      { order: 5, tag: 'storage-classes',   title: 'C Storage Classes',      url: '/c/c_storage_classes.php' },
      { order: 6, tag: 'bitwise-operators', title: 'C Bitwise Operators',    url: '/c/c_bitwise_operators.php' },
      { order: 7, tag: 'fixed-width-ints',  title: 'C Fixed-Width Integers', url: '/c/c_fixed_width_ints.php' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASE_URL = 'https://www.w3schools.com';
const DELAY_MS = 1500;

/** Heading text patterns that indicate an exercise/challenge section to skip. */
const SKIP_HEADING_RE = /code challenge|exercise|test yourself|try it yourself|what.*next/i;

/** Body text snippets that are noise and should be dropped from a paragraph. */
const NOISE_PATTERNS = [
  /try it yourself/i,
  /click on/i,
  /w3schools is optimized/i,
  /w3schools offers/i,
  /get certified/i,
  /tutorials, references,? and examples/i,
  /simplified to improve reading/i,
  /we use cookies/i,
];

// ---------------------------------------------------------------------------
// Text-cleaning helpers
// ---------------------------------------------------------------------------

/**
 * Replaces common HTML entities and Unicode noise characters with clean
 * ASCII/UTF-8 equivalents.
 */
function fixEncoding(text) {
  return text
    // HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Smart quotes
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Dashes
    .replace(/–/g, '-')   // en dash
    .replace(/—/g, '--')  // em dash
    // Zero-width / invisible characters
    .replace(/[​‌‍﻿]/g, '')
    // Box-drawing characters (sometimes appear in W3Schools code blocks)
    .replace(/[─-╿]/g, '-')
    // Collapse multiple spaces (but preserve intentional indentation inside
    // code blocks — this helper is only called on non-code text)
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Returns true if the paragraph text is noise that should be discarded. */
function isNoise(text) {
  if (!text || text.length < 3) return true;
  return NOISE_PATTERNS.some((re) => re.test(text));
}

/**
 * Cleans a code-block string:
 *  - Normalises Windows line endings
 *  - Trims trailing whitespace on every line
 *  - Removes leading/trailing blank lines
 */
function cleanCode(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/**
 * Extracts clean code text from a code-block element.
 *
 * W3Schools uses <br> tags (not actual newlines) as line endings inside
 * .w3-code divs.  A plain $(el).text() call silently drops all <br> tags,
 * turning every code example into one long concatenated string.
 *
 * This helper clones the element, replaces every <br> with a real newline,
 * converts &nbsp; to a regular space, then calls the existing cleanCode()
 * normaliser.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Element} el
 * @returns {string}
 */
function extractCodeText($, el) {
  const clone = $(el).clone();
  clone.find('br').replaceWith('\n');
  const raw = clone.text().replace(/ /g, ' ');
  return cleanCode(raw);
}

// ---------------------------------------------------------------------------
// Cheerio parsing
// ---------------------------------------------------------------------------

/**
 * Converts a <table> element to a plain-text representation using
 * " | " as a column separator and one row per line.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Element} tableEl
 * @returns {string}
 */
function tableToText($, tableEl) {
  const rows = [];
  $(tableEl).find('tr').each((_i, tr) => {
    const cells = [];
    $(tr).find('th, td').each((_j, cell) => {
      cells.push(fixEncoding($(cell).text()));
    });
    if (cells.length > 0) {
      rows.push(cells.join(' | '));
    }
  });
  return rows.join('\n');
}

/**
 * Converts a <ul> or <ol> element to a bullet-point string (one item per
 * line, prefixed with "- ").
 *
 * @param {cheerio.CheerioAPI} $
 * @param {cheerio.Element} listEl
 * @returns {string}
 */
function listToText($, listEl) {
  const items = [];
  $(listEl).find('> li').each((_i, li) => {
    const text = fixEncoding($(li).text());
    if (text) items.push(`- ${text}`);
  });
  return items.join('\n');
}

/**
 * Parses the HTML of a W3Schools C tutorial page and returns an array of
 * content sections.  Each section has:
 *   { heading, body, code }
 * where `heading` is the h2/h3 text, `body` is accumulated paragraph /
 * list / table content, and `code` is the first code block encountered
 * within that section (if any).
 *
 * Sections whose heading matches SKIP_HEADING_RE are omitted entirely.
 *
 * @param {string} html  Raw HTML of the page
 * @returns {Array<{heading: string, body: string, code: string}>}
 */
function parsePage(html) {
  const $ = cheerio.load(html);

  // Remove elements that are never content.
  $(
    'script, style, noscript, nav, footer, header, ' +
    '.w3-btn, .w3-bar, .w3-sidebar, .w3-top, ' +
    '#topnav, #myTopnav, #mysidenav, #googleSearch, ' +
    '.adsbygoogle, [id^="google_ads"], .w3-hide-small, ' +
    'button, iframe'
  ).remove();

  const mainEl = $('#main');
  if (!mainEl.length) {
    // Fallback: use the whole body if #main is absent.
    console.warn('  [warn] #main not found, falling back to body');
  }
  const root = mainEl.length ? mainEl : $('body');

  const sections = [];
  let current = null; // { heading, bodyParts, code }

  /**
   * Finalises the current section and appends it to `sections` if it has
   * meaningful content.
   */
  function flush() {
    if (!current) return;
    const body = current.bodyParts
      .map((p) => fixEncoding(p))
      .filter((p) => !isNoise(p) && p.length > 0)
      .join('\n\n');
    sections.push({
      heading: current.heading,
      body: body || '',
      code: current.code || '',
    });
    current = null;
  }

  /**
   * Ensures there is an active (unnamed) section to accumulate content into
   * before the first heading is encountered.
   */
  function ensureCurrent() {
    if (!current) {
      current = { heading: '', bodyParts: [], code: '' };
    }
  }

  // Walk top-level children (and one level deeper for common wrappers).
  root.children().each((_i, el) => {
    processElement($, el, {
      sections,
      flush,
      ensureCurrent,
      getCurrent: () => current,
      setCurrent: (v) => { current = v; },
    });
  });

  flush(); // flush last open section

  // Remove sections that consist solely of a heading and no body/code.
  return sections.filter((s) => s.heading || s.body || s.code);
}

/**
 * Recursively processes a DOM element, routing it to the appropriate handler
 * based on its tag name.
 */
function processElement($, el, ctx) {
  const { flush, ensureCurrent, getCurrent, setCurrent } = ctx;
  const tag = el.type === 'tag' ? el.tagName.toLowerCase() : null;
  if (!tag) return; // text nodes at top level — ignore

  // --- Headings → start a new section ---
  if (tag === 'h2' || tag === 'h3') {
    flush();
    const headingText = fixEncoding($(el).text());
    if (SKIP_HEADING_RE.test(headingText)) {
      // Signal that this section should be skipped by setting a sentinel.
      setCurrent({ heading: headingText, bodyParts: [], code: '', skip: true });
    } else {
      setCurrent({ heading: headingText, bodyParts: [], code: '', skip: false });
    }
    return;
  }

  const cur = getCurrent();

  // If the current section is marked skip, ignore everything until the
  // next heading triggers a flush.
  if (cur && cur.skip) return;

  // --- Paragraphs ---
  if (tag === 'p') {
    ensureCurrent();
    const text = fixEncoding($(el).text());
    if (!isNoise(text)) {
      getCurrent().bodyParts.push(text);
    }
    return;
  }

  // --- Code blocks ---
  if (
    tag === 'pre' ||
    $(el).hasClass('w3-code') ||
    $(el).hasClass('w3-codeblock')
  ) {
    ensureCurrent();
    const c = getCurrent();
    // Use extractCodeText so that W3Schools <br>-delimited lines are preserved.
    const cleaned = extractCodeText($, el);
    if (cleaned && !c.code) {
      // Store only the first code block per section; additional ones are
      // appended with a blank-line separator.
      c.code = cleaned;
    } else if (cleaned) {
      c.code += '\n\n' + cleaned;
    }
    return;
  }

  // --- Tables ---
  if (tag === 'table') {
    ensureCurrent();
    const tableText = tableToText($, el);
    if (tableText) {
      getCurrent().bodyParts.push(tableText);
    }
    return;
  }

  // --- Lists ---
  if (tag === 'ul' || tag === 'ol') {
    ensureCurrent();
    const listText = listToText($, el);
    if (listText) {
      getCurrent().bodyParts.push(listText);
    }
    return;
  }

  // --- Generic container divs ---
  if (tag === 'div') {
    // ── Inline code block divs (.w3-code / .w3-codeblock) ──────────────────
    if ($(el).hasClass('w3-code') || $(el).hasClass('w3-codeblock')) {
      ensureCurrent();
      const c = getCurrent();
      const cleaned = extractCodeText($, el);
      if (cleaned) {
        c.code = c.code ? c.code + '\n\n' + cleaned : cleaned;
      }
      return;
    }

    // ── W3Schools example blocks (.w3-example) ─────────────────────────────
    // Structure:
    //   <div class="w3-example">
    //     <h3>Example</h3>          ← we intentionally skip this sub-heading
    //     <div class="w3-code">…</div>
    //     <a>Try it Yourself »</a>  ← excluded by not recursing into <a>
    //   </div>
    //
    // Problem with naive recursion: the inner <h3>Example</h3> triggers a
    // flush() → a brand-new section is created mid-topic, the code ends up
    // attached to an orphan "Example" section instead of the surrounding
    // explanatory text.
    //
    // Fix: treat the whole .w3-example div as one atomic unit.  Attach its
    // code directly to the current (or newly-created) section and skip all
    // sub-headings and "Try it Yourself" links.
    if ($(el).hasClass('w3-example')) {
      ensureCurrent();
      const c = getCurrent();

      // Pull any descriptive <p> text that sits inside the example block
      // (some pages add context paragraphs between the heading and the code).
      $(el).find('> p').each((_i, pEl) => {
        const text = fixEncoding($(pEl).text());
        if (!isNoise(text)) {
          c.bodyParts.push(text);
        }
      });

      // Extract every code block inside this example and append to the
      // current section's code field.
      $(el).find('.w3-code, .w3-codeblock, pre').each((_i, codeEl) => {
        const cleaned = extractCodeText($, codeEl);
        if (cleaned) {
          c.code = c.code ? c.code + '\n\n' + cleaned : cleaned;
        }
      });

      return; // do NOT recurse — avoids the orphan-section bug
    }

    // ── All other divs — recurse one level ─────────────────────────────────
    $(el).children().each((_i, child) => {
      processElement($, child, ctx);
    });
  }
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a URL with a descriptive User-Agent so W3Schools does not block us.
 * Throws on non-OK HTTP responses.
 *
 * @param {string} url
 * @returns {Promise<string>} HTML body
 */
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; TutorialScraper/1.0; educational use)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  return res.text();
}

/** Resolves after `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Writes the tutorial JSON file for a single page.
 *
 * @param {object} opts
 */
function writeOutput({ tag, language, title, category, categoryOrder, order, sections }) {
  const payload = { tag, language, title, category, categoryOrder, order, sections };
  const filePath = path.join(OUTPUT_DIR, `${tag}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Ensure the output directory exists.
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Flatten all pages into a single list for progress tracking.
  const allPages = [];
  for (const cat of CATEGORIES) {
    for (const page of cat.pages) {
      allPages.push({ ...page, category: cat.category, categoryOrder: cat.categoryOrder });
    }
  }

  const total = allPages.length;
  console.log(`\nStarting C tutorial scrape — ${total} pages across ${CATEGORIES.length} categories.`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < allPages.length; i++) {
    const { tag, title, url, category, categoryOrder, order } = allPages[i];
    const fullUrl = `${BASE_URL}${url}`;

    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${total}] ${category.padEnd(14)} | ` +
      `${tag.padEnd(30)} — fetching...`
    );

    try {
      const html = await fetchPage(fullUrl);
      const sections = parsePage(html);

      writeOutput({
        tag,
        language: 'c',
        title,
        category,
        categoryOrder,
        order,
        sections,
      });

      process.stdout.write(` OK  (${sections.length} sections)\n`);
      succeeded++;
    } catch (err) {
      process.stdout.write(` FAILED\n`);
      console.error(`  -> ${err.message}`);
      errors.push({ tag, url: fullUrl, error: err.message });
      failed++;
    }

    // Polite delay between requests (skip after the last page).
    if (i < allPages.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Scrape complete.');
  console.log(`  Succeeded : ${succeeded}`);
  console.log(`  Failed    : ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed pages:');
    for (const e of errors) {
      console.log(`  [${e.tag}] ${e.url}`);
      console.log(`    ${e.error}`);
    }
  }
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
