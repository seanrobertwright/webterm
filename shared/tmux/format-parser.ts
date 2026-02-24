/**
 * tmux format string parser
 *
 * Supports:
 * - #{variable_name} — variable substitution
 * - #{?condition,true_value,false_value} — conditional expressions
 * - %H, %M, %S, %Y, %m, %d, %a, %b, %% — strftime-style time formatting
 * - Literal text passthrough
 */

/** Resolves a format variable name to its string value */
export type FormatVariableResolver = (name: string) => string;

const WEEKDAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_ABBRS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Pad a number to two digits with a leading zero if needed.
 */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Apply strftime-style formatting to a Date.
 *
 * Supported specifiers:
 * - %H — hours (00-23)
 * - %M — minutes (00-59)
 * - %S — seconds (00-59)
 * - %Y — 4-digit year
 * - %m — month (01-12)
 * - %d — day of month (01-31)
 * - %a — abbreviated weekday name (Mon, Tue, etc.)
 * - %b — abbreviated month name (Jan, Feb, etc.)
 * - %% — literal %
 */
export function formatTime(format: string, date?: Date): string {
  const d = date ?? new Date();
  let result = '';
  let i = 0;

  while (i < format.length) {
    if (format[i] === '%' && i + 1 < format.length) {
      const spec = format[i + 1];
      switch (spec) {
        case 'H':
          result += pad2(d.getHours());
          break;
        case 'M':
          result += pad2(d.getMinutes());
          break;
        case 'S':
          result += pad2(d.getSeconds());
          break;
        case 'Y':
          result += d.getFullYear().toString();
          break;
        case 'm':
          result += pad2(d.getMonth() + 1);
          break;
        case 'd':
          result += pad2(d.getDate());
          break;
        case 'a':
          result += WEEKDAY_ABBRS[d.getDay()];
          break;
        case 'b':
          result += MONTH_ABBRS[d.getMonth()];
          break;
        case '%':
          result += '%';
          break;
        default:
          // Unknown specifier — pass through as-is
          result += '%' + spec;
          break;
      }
      i += 2;
    } else {
      result += format[i];
      i += 1;
    }
  }

  return result;
}

/**
 * Find the matching closing brace for an opening `{` at position `start`,
 * counting nested braces.
 *
 * @returns Index of the matching `}`, or -1 if not found.
 */
function findMatchingBrace(str: string, start: number): number {
  let depth = 1;
  let i = start + 1;

  while (i < str.length) {
    if (str[i] === '{') {
      depth += 1;
    } else if (str[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    i += 1;
  }

  return -1;
}

/**
 * Split a conditional expression body into its three parts:
 * condition, true_value, false_value.
 *
 * Respects nested `#{}` expressions so commas inside them are not treated
 * as delimiters.
 */
function splitConditional(body: string): [string, string, string] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];

    if (ch === '{') {
      depth += 1;
      current += ch;
    } else if (ch === '}') {
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0 && parts.length < 2) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  parts.push(current);

  // Ensure we always return exactly three parts
  const condition = parts[0] ?? '';
  const trueValue = parts[1] ?? '';
  const falseValue = parts[2] ?? '';

  return [condition, trueValue, falseValue];
}

/**
 * Determine whether a resolved value is "truthy" in tmux terms.
 *
 * A value is falsy if it is empty, "0", or consists only of whitespace.
 */
function isTruthy(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed !== '0';
}

/**
 * Resolve the content inside `#{ ... }` (the part between the braces).
 */
function resolveExpression(
  content: string,
  resolver: FormatVariableResolver,
): string {
  if (content.length === 0) {
    return '';
  }

  // Conditional expression: ?condition,true_value,false_value
  if (content[0] === '?') {
    const body = content.slice(1);
    const [condition, trueValue, falseValue] = splitConditional(body);

    // Resolve the condition variable
    const conditionResult = parseFormatString(condition, resolver);

    if (isTruthy(conditionResult)) {
      return parseFormatString(trueValue, resolver);
    } else {
      return parseFormatString(falseValue, resolver);
    }
  }

  // Plain variable substitution
  return resolver(content);
}

/**
 * Parse a tmux format string, resolving variable references and conditionals.
 *
 * @param format - The format string to parse (e.g., `"#{session_name} - #{window_index}"`)
 * @param resolver - Function that maps variable names to their string values
 * @returns The fully resolved string
 */
export function parseFormatString(
  format: string,
  resolver: FormatVariableResolver,
): string {
  let result = '';
  let i = 0;

  while (i < format.length) {
    // Check for #{...} variable/conditional expression
    if (
      format[i] === '#' &&
      i + 1 < format.length &&
      format[i + 1] === '{'
    ) {
      const braceStart = i + 1;
      const braceEnd = findMatchingBrace(format, braceStart);

      if (braceEnd === -1) {
        // No matching brace — treat as literal text
        result += '#{';
        i += 2;
      } else {
        const content = format.slice(braceStart + 1, braceEnd);
        result += resolveExpression(content, resolver);
        i = braceEnd + 1;
      }
    }
    // Check for strftime-style %X tokens
    else if (format[i] === '%' && i + 1 < format.length) {
      const spec = format[i + 1];
      const timeSpecs = 'HMSYmdab%';

      if (timeSpecs.includes(spec!)) {
        result += formatTime('%' + spec);
        i += 2;
      } else {
        result += format[i];
        i += 1;
      }
    } else {
      result += format[i];
      i += 1;
    }
  }

  return result;
}
