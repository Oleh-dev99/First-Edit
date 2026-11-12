// Pure rules for the brief format and for reference candidates. No file
// system access; lib/brief-check.ts reads the files and applies these.

import { parseSync } from 'vite';
import { forEachValue, isPlainObject, type FieldsMap } from '../src/mutations/fields.ts';

export const CATEGORIES = [
  'card', 'list', 'table', 'form', 'navigation', 'dashboard', 'page-section', 'messaging', 'board',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface BriefMeta {
  id: string;
  title: string;
  category: Category;
  /** true for the hello-card sample, false for corpus briefs. */
  sample: boolean;
}

/** Every brief contains exactly these files. */
export const BRIEF_FILES = ['meta.json', 'brief.md', 'props.ts', 'fixture.baseline.json', 'fields.json'];

/** Sample briefs may also carry extra fixtures for the harness tests. */
const EXTRA_FIXTURE = /^fixture\.[\w-]+\.json$/;

export const BRIEF_WORDS = { min: 80, max: 150 };
export const LIST_ITEMS = { min: 3, max: 8 };
export const MIN_APPLICABLE = 8;

export function fileProblems(files: string[], sample: boolean): string[] {
  const problems = BRIEF_FILES.filter((file) => !files.includes(file)).map((file) => `missing ${file}`);
  for (const file of files) {
    if (BRIEF_FILES.includes(file)) continue;
    if (sample && EXTRA_FIXTURE.test(file)) continue;
    problems.push(`unexpected file ${file}`);
  }
  return problems;
}

export function metaProblems(meta: unknown, directory: string): string[] {
  if (!isPlainObject(meta)) return ['meta.json must be a JSON object'];
  const problems: string[] = [];
  for (const key of Object.keys(meta)) {
    if (!['id', 'title', 'category', 'sample'].includes(key)) problems.push(`meta.json: unknown property "${key}"`);
  }
  if (meta.id !== directory) problems.push(`meta.json: id must be "${directory}"`);
  if (typeof meta.title !== 'string' || meta.title.trim() === '') problems.push('meta.json: title must be a non-empty string');
  if (typeof meta.category !== 'string' || !(CATEGORIES as readonly string[]).includes(meta.category)) {
    problems.push(`meta.json: category must be one of ${CATEGORIES.join(', ')}`);
  }
  if (typeof meta.sample !== 'boolean') problems.push('meta.json: sample must be true or false');
  return problems;
}

/** Words in a Markdown text: tokens with at least one letter or digit. */
export function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const HINTS: { pattern: RegExp; kind: string }[] = [
  {
    pattern: /\b(css|tailwind|flexbox|flex|grid|px|rem|pixels?|breakpoints?|media quer(?:y|ies)|viewport)\b/gi,
    kind: 'implementation hint',
  },
  {
    pattern: /\b(wrap(?:s|ped|ping)?|truncat\w*|ellipsis|overflow\w*|clip(?:s|ped|ping)?|scroll\w*)\b/gi,
    kind: 'robustness hint',
  },
  {
    pattern: /\b(responsive|mobile|narrow|many (?:items|rows|links|entries)|empty|missing)\b/gi,
    kind: 'robustness hint',
  },
  // Rule 9: size words about content are hints in the wrong direction.
  {
    pattern: /\b(one-line|short(?:er|est)?|long(?:er|est)?|brief(?:ly)?|small(?:er|est)?|few(?:er|est)?)\b/gi,
    kind: 'size word',
  },
  // Rule 8: no file names and no mention of imports.
  { pattern: /\b[\w-]+\.(?:tsx?|jsx?|json|md|css|html?)\b/gi, kind: 'file name' },
  { pattern: /\bimport(?:s|ed|ing)?\b/gi, kind: 'mention of imports' },
];

/**
 * Words in text sent to models (brief.md, and props.ts with its comments)
 * that hint at implementation or robustness, size words, file names and
 * mentions of imports.
 */
export function hintProblems(text: string, file = 'brief.md'): string[] {
  return HINTS.flatMap(({ pattern, kind }) =>
    [...text.matchAll(pattern)].map((match) => `${file}: ${kind} "${match[0]}"`),
  );
}

/** props.ts must export `interface Props` and describe plain data only. */
export function propsProblems(source: string): string[] {
  const problems: string[] = [];
  if (!/^export interface Props\b/m.test(source)) problems.push('props.ts must export `interface Props`');
  for (const [pattern, what] of [
    [/=>/, 'a function type'],
    [/\bFunction\b/, 'a function type'],
    [/\bReact(?:Node|Element)\b|\bJSX\b|\bReact\./, 'a React type'],
  ] as const) {
    if (pattern.test(source)) problems.push(`props.ts must describe plain data, but contains ${what}`);
  }
  return problems;
}

/** Corpus fixtures hold 3 to 8 items per list. */
export function listSizeProblems(fixture: unknown, fields: FieldsMap): string[] {
  const problems = new Set<string>();
  forEachValue(fixture, (path, value) => {
    if (!Array.isArray(value) || fields[path]?.kind !== 'list') return;
    if (value.length < LIST_ITEMS.min || value.length > LIST_ITEMS.max) {
      problems.add(`fixture: ${path} has ${value.length} items; corpus lists hold ${LIST_ITEMS.min} to ${LIST_ITEMS.max}`);
    }
  });
  return [...problems];
}

type AstNode = { type?: unknown; [key: string]: unknown };

/** The value of a string literal node, or a placeholder for a computed specifier. */
function specifier(node: unknown): string {
  const literal = node as AstNode | null;
  return literal?.type === 'Literal' && typeof literal.value === 'string' ? literal.value : '<computed>';
}

/** Calls `visit` for every AST node below `node`. */
function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
  } else if (typeof node === 'object' && node !== null) {
    if (typeof (node as AstNode).type === 'string') visit(node as AstNode);
    for (const value of Object.values(node)) walk(value, visit);
  }
}

/**
 * Module specifiers a TSX source file imports (including type-only),
 * re-exports, import()s or require()s, found with a real parser so that
 * comments and strings never count.
 */
export function importedModules(source: string): { modules: string[]; errors: string[] } {
  const result = parseSync('Component.tsx', source);
  const modules: string[] = [];
  walk(result.program, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') {
      modules.push(specifier(node.source));
    } else if (node.type === 'ExportNamedDeclaration' && node.source) {
      modules.push(specifier(node.source));
    } else if (node.type === 'ImportExpression') {
      modules.push(specifier(node.source));
    } else if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode | null;
      const args = node.arguments as unknown[] | undefined;
      if (callee?.type === 'Identifier' && callee.name === 'require') modules.push(specifier(args?.[0]));
    }
  });
  return { modules: [...new Set(modules)], errors: result.errors.map((error) => error.message) };
}

/** The candidate contract allows imports from react only. */
export function importProblems(source: string): string[] {
  const { modules, errors } = importedModules(source);
  return [
    ...errors.map((error) => `cannot be parsed: ${error}`),
    ...modules.filter((module) => module !== 'react').map((module) => `imports "${module}"; only react is allowed`),
  ];
}
