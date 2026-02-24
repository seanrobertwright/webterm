/**
 * Shell-like tokenizer and command registry for tmux-compatible command parsing.
 *
 * Handles single-quoted strings (no escape processing), double-quoted strings
 * (with backslash escapes), backslash escapes outside quotes, and adjacent
 * segment merging.
 */

import type { CommandDef, FlagDef } from '../types/models.ts';

// ============================================================================
// Types
// ============================================================================

export interface ParsedCommand {
  command: string;
  flags: Map<string, boolean | string>;
  positional: string[];
  raw: string;
}

export type ParseResult =
  | { ok: true; value: ParsedCommand }
  | { ok: false; error: string };

export interface CompletionResult {
  suggestions: string[];
  type: 'command' | 'flag' | 'argument';
}

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Tokenize a shell-like input string into an array of tokens.
 *
 * Rules:
 * - Splits on unquoted whitespace (spaces, tabs)
 * - Single-quoted strings preserve literal content (no escape processing)
 * - Double-quoted strings allow backslash escapes: \\, \"
 * - Backslash outside quotes escapes the next character
 * - Adjacent quoted/unquoted segments merge into one token
 * - Empty quoted strings produce an empty-string token
 * - Unmatched quotes throw an Error
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasContent = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === ' ' || ch === '\t') {
      // Unquoted whitespace: emit token if we have accumulated content
      if (hasContent) {
        tokens.push(current);
        current = '';
        hasContent = false;
      }
      i++;
    } else if (ch === "'") {
      // Single-quoted string: no escape processing inside
      hasContent = true;
      i++; // skip opening quote
      while (i < input.length && input[i] !== "'") {
        current += input[i];
        i++;
      }
      if (i >= input.length) {
        throw new Error('Unmatched single quote');
      }
      i++; // skip closing quote
    } else if (ch === '"') {
      // Double-quoted string: process backslash escapes
      hasContent = true;
      i++; // skip opening quote
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1]!;
          if (next === '"' || next === '\\') {
            current += next;
            i += 2;
          } else {
            // Backslash followed by non-special char: keep both
            current += '\\';
            current += next;
            i += 2;
          }
        } else {
          current += input[i];
          i++;
        }
      }
      if (i >= input.length) {
        throw new Error('Unmatched double quote');
      }
      i++; // skip closing quote
    } else if (ch === '\\') {
      // Backslash escape outside quotes
      hasContent = true;
      if (i + 1 < input.length) {
        current += input[i + 1];
        i += 2;
      } else {
        throw new Error('Trailing backslash');
      }
    } else {
      // Regular character
      hasContent = true;
      current += ch;
      i++;
    }
  }

  // Emit final token
  if (hasContent) {
    tokens.push(current);
  }

  return tokens;
}

// ============================================================================
// CommandRegistry
// ============================================================================

export class CommandRegistry {
  private commands = new Map<string, CommandDef>();
  private aliases = new Map<string, string>();

  /**
   * Register a command definition. Stores the command under its canonical name
   * and registers all aliases pointing to it.
   */
  register(def: CommandDef): this {
    this.commands.set(def.name, def);
    for (const alias of def.aliases) {
      this.aliases.set(alias, def.name);
    }
    return this;
  }

  /**
   * Resolve a command name or alias to its definition.
   * Checks aliases first, then canonical names.
   */
  resolve(nameOrAlias: string): CommandDef | null {
    const canonical = this.aliases.get(nameOrAlias);
    if (canonical !== undefined) {
      return this.commands.get(canonical) ?? null;
    }
    return this.commands.get(nameOrAlias) ?? null;
  }

  /**
   * Return a sorted list of all registered canonical command names.
   */
  commandNames(): string[] {
    return [...this.commands.keys()].sort();
  }

  /**
   * Provide tab-completion suggestions for a partial input string.
   *
   * If the input contains no space (user is typing a command name), return
   * matching command names and aliases. If the input contains a space (command
   * already typed), return matching flags for that command.
   */
  complete(partial: string): CompletionResult {
    const trimmed = partial.trimStart();
    const spaceIndex = trimmed.indexOf(' ');

    if (spaceIndex === -1) {
      // Completing a command name
      const allNames = [
        ...this.commands.keys(),
        ...this.aliases.keys(),
      ];
      const suggestions = allNames
        .filter((name) => name.startsWith(trimmed))
        .sort();
      return { suggestions, type: 'command' };
    }

    // Command already typed -- complete flags
    const commandPart = trimmed.slice(0, spaceIndex);
    const afterCommand = trimmed.slice(spaceIndex + 1);
    const def = this.resolve(commandPart);

    if (!def) {
      return { suggestions: [], type: 'flag' };
    }

    // Determine what the user is currently typing (last whitespace-delimited segment)
    const segments = afterCommand.split(/\s+/);
    const lastSegment = segments[segments.length - 1] ?? '';

    const flagNames = def.flags.map((f) => `-${f.short}`);
    const suggestions = flagNames
      .filter((f) => f.startsWith(lastSegment))
      .sort();

    return { suggestions, type: 'flag' };
  }

  /**
   * Parse a full command input string into a structured ParsedCommand.
   *
   * Tokenizes the input, resolves the command, then iterates remaining tokens
   * to extract flags and positional arguments according to the command's
   * flag definitions.
   */
  parse(input: string): ParseResult {
    const raw = input;

    let tokens: string[];
    try {
      tokens = tokenize(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Tokenization error: ${message}` };
    }

    if (tokens.length === 0) {
      return { ok: false, error: 'Empty command' };
    }

    const commandName = tokens[0]!;
    const def = this.resolve(commandName);

    if (!def) {
      return { ok: false, error: `Unknown command: ${commandName}` };
    }

    // Build a lookup from short flag name to its definition
    const flagLookup = new Map<string, FlagDef>();
    for (const flag of def.flags) {
      flagLookup.set(flag.short, flag);
    }

    const flags = new Map<string, boolean | string>();
    const positional: string[] = [];
    let i = 1; // skip command token

    while (i < tokens.length) {
      const token = tokens[i]!;

      if (token.startsWith('-') && token.length > 1) {
        // Could be a flag -- strip the leading dash
        const flagName = token.slice(1);
        const flagDef = flagLookup.get(flagName);

        if (flagDef) {
          if (flagDef.takesValue) {
            // Consume the next token as the value
            if (i + 1 < tokens.length) {
              flags.set(flagName, tokens[i + 1]!);
              i += 2;
            } else {
              return {
                ok: false,
                error: `Flag -${flagName} requires a value`,
              };
            }
          } else {
            flags.set(flagName, true);
            i++;
          }
        } else {
          // Unknown flag -- treat as positional
          positional.push(token);
          i++;
        }
      } else {
        positional.push(token);
        i++;
      }
    }

    return {
      ok: true,
      value: {
        command: def.name,
        flags,
        positional,
        raw,
      },
    };
  }
}
