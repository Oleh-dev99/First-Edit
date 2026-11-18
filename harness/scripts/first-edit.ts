#!/usr/bin/env node
/**
 * first-edit: the stress suite on any component (docs/SPEC.md, Command line; D-060).
 *
 *   npm run first-edit -- <Component.tsx> --props <props.json> [--fields <fields.json>]
 *     [--name <name>] [--out <dir>] [--fail-on core|all|none]
 *
 * The component must follow the candidate contract: one .tsx file with a
 * default export, importing react only, styled with Tailwind classes and
 * inline styles. --props holds example props; --fields their fields map,
 * inferred from the props when left out. Results go to --out (default
 * results/cli/<name>/). Exits 0 when the component survived (by --fail-on,
 * default core), 1 when it broke, 2 when the input cannot be used, 3 when
 * the harness failed. Paths are taken from the folder the command was
 * started in.
 */
import { runCli } from '../lib/cli.ts';

process.exitCode = await runCli(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
