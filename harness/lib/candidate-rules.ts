// Contract rules for candidates, found with the oxc parser so that comments,
// strings and JSX text never count. Pure: source text in, reasons out.

import { parseSync } from 'vite';

export interface Reason {
  rule: string;
  message: string;
}

type AstNode = { type?: unknown; [key: string]: unknown };

/** Globals a candidate must not use, by rule. */
const FORBIDDEN_GLOBALS: Record<string, string> = {
  fetch: 'network',
  XMLHttpRequest: 'network',
  WebSocket: 'network',
  EventSource: 'network',
  setTimeout: 'timers',
  setInterval: 'timers',
  setImmediate: 'timers',
  requestAnimationFrame: 'timers',
  requestIdleCallback: 'timers',
  localStorage: 'storage',
  sessionStorage: 'storage',
  indexedDB: 'storage',
};

/** Objects through which a forbidden global can also be reached, e.g. window.fetch. */
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);

/** Member expressions a candidate must not use: object.property -> rule. */
const FORBIDDEN_MEMBERS: Record<string, string> = {
  'Math.random': 'randomness',
  'crypto.getRandomValues': 'randomness',
  'crypto.randomUUID': 'randomness',
  'document.cookie': 'storage',
  'navigator.sendBeacon': 'network',
};

const URL_ATTRIBUTES = new Set(['src', 'href', 'srcSet', 'srcset']);
const ABSOLUTE_URL = /^\s*(?:https?:)?\/\//i;
const CSS_URL = /url\(\s*['"]?\s*(?:https?:)?\/\//i;

const nameOf = (node: unknown): string | null => {
  const value = node as AstNode | null;
  return value?.type === 'Identifier' && typeof value.name === 'string' ? value.name : null;
};

/** Visits every AST node with its parent. */
function walk(node: unknown, visit: (node: AstNode, parent: AstNode | null) => void, parent: AstNode | null = null): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
  } else if (typeof node === 'object' && node !== null) {
    const current = node as AstNode;
    const isNode = typeof current.type === 'string';
    if (isNode) visit(current, parent);
    for (const value of Object.values(current)) walk(value, visit, isNode ? current : parent);
  }
}

/** Is this identifier a reference to a global, rather than a property name or a type? */
function isValueReference(node: AstNode, parent: AstNode | null): boolean {
  if (!parent) return true;
  if (typeof parent.type === 'string' && parent.type.startsWith('TS')) return false;
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return false;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.key === node && !parent.computed) {
    return false;
  }
  return true;
}

/** Strings in a literal or the static parts of a template literal. */
function stringsOf(node: AstNode | null): string[] {
  if (!node) return [];
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node.type === 'TemplateLiteral') {
    return ((node.quasis as AstNode[] | undefined) ?? []).map((quasi) => {
      const value = quasi.value as { cooked?: string; raw?: string } | undefined;
      return value?.cooked ?? value?.raw ?? '';
    });
  }
  return [];
}

function hasDefaultExport(program: AstNode): boolean {
  const body = (program.body as AstNode[] | undefined) ?? [];
  return body.some((statement) => {
    if (statement.type === 'ExportDefaultDeclaration') return true;
    if (statement.type !== 'ExportNamedDeclaration') return false;
    const specifiers = (statement.specifiers as AstNode[] | undefined) ?? [];
    return specifiers.some((specifier) => {
      const exported = specifier.exported as AstNode | undefined;
      return exported?.name === 'default' || exported?.value === 'default';
    });
  });
}

/**
 * Every contract violation in a candidate's source, except the type-level
 * Props check (see candidate-check.ts). A file that does not parse yields
 * only a "parse" reason.
 */
export function contractReasons(source: string): Reason[] {
  const result = parseSync('Component.tsx', source);
  if (result.errors.length > 0) {
    return result.errors.map((error) => ({ rule: 'parse', message: error.message }));
  }
  const program = result.program as unknown as AstNode;
  const reasons: Reason[] = [];
  const add = (rule: string, message: string): void => {
    if (!reasons.some((reason) => reason.rule === rule && reason.message === message)) reasons.push({ rule, message });
  };

  if (!hasDefaultExport(program)) add('default-export', 'the file has no default export');

  walk(program, (node, parent) => {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration': {
        const specifier = stringsOf(node.source as AstNode | null)[0];
        if (specifier !== undefined && specifier !== 'react') {
          add('imports', `imports "${specifier}"; only react is allowed`);
        }
        break;
      }
      case 'ImportExpression':
        add('dynamic-import', 'uses dynamic import()');
        break;
      case 'Identifier': {
        const name = nameOf(node);
        const rule = name !== null ? FORBIDDEN_GLOBALS[name] : undefined;
        if (rule && isValueReference(node, parent)) add(rule, `uses ${name}`);
        break;
      }
      case 'MemberExpression': {
        const object = nameOf(node.object);
        const property = node.computed ? stringsOf(node.property as AstNode)[0] : nameOf(node.property);
        if (object === null || property === null || property === undefined) break;
        const member = `${object}.${property}`;
        const rule = FORBIDDEN_MEMBERS[member] ?? (GLOBAL_OBJECTS.has(object) ? FORBIDDEN_GLOBALS[property] : undefined);
        if (rule) add(rule, `uses ${member}`);
        break;
      }
      case 'CallExpression': {
        if (nameOf(node.callee) === 'require') add('imports', 'uses require()');
        break;
      }
      case 'JSXAttribute': {
        const attribute = (node.name as AstNode | null)?.name;
        if (typeof attribute !== 'string' || !URL_ATTRIBUTES.has(attribute)) break;
        let value = node.value as AstNode | null;
        if (value?.type === 'JSXExpressionContainer') value = value.expression as AstNode | null;
        for (const text of stringsOf(value)) {
          if (ABSOLUTE_URL.test(text)) add('hardcoded-url', `hard-codes a URL in ${attribute}: ${text.trim().slice(0, 80)}`);
        }
        break;
      }
      // Any string containing url(http...) counts as CSS: class names, style
      // objects and variables later passed to style all hold CSS as plain
      // strings. A non-CSS string with that exact text would be a false hit.
      case 'Literal':
      case 'TemplateLiteral': {
        for (const text of stringsOf(node)) {
          if (CSS_URL.test(text)) add('hardcoded-url', `hard-codes a URL in CSS url(): ${text.trim().slice(0, 80)}`);
        }
        break;
      }
    }
  });
  return reasons;
}
