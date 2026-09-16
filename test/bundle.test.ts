/**
 * What ships is the bundles, not the source, so these assertions are made
 * against the built bytes. Types cover only the code we wrote: a dependency, or
 * a `globalThis.process` written to get past the compiler, reaches the host
 * unseen by everything else. An import crossing between the two entry points
 * fails only at runtime and only on the other platform.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs config, no types
import { build } from '../config/esbuild.config.mjs';

// Built here rather than read from dist/, so `npm test` needs no prior build.
let outDir: string;
let browser: string;
let node: string;
let switcher: string;
let switcherStyle: string;

beforeAll(async () => {
	outDir = await mkdtemp(path.join(tmpdir(), 'bbcmicrobit-manager-build-'));
	await build(outDir);
	const read = (name: string) => readFile(path.join(outDir, 'dist', name), 'utf8');
	[browser, node, switcher, switcherStyle] = await Promise.all([
		read('browser.js'),
		read('node.js'),
		read('webview/switcher.js'),
		read('webview/switcher.css'),
	]);
}, 60_000);

afterAll(async () => {
	await rm(outDir, { recursive: true, force: true });
});

/** Read inside a test, never at collection: nothing is built until `beforeAll`. */
const bundleFor = (which: string) => (which === 'browser' ? browser : node);
const BOTH = ['browser', 'node'];

it.each(BOTH)('%s is CJS, which is what an extension host loads', (which) => {
	expect(bundleFor(which)).toContain('module.exports');
	expect(bundleFor(which)).not.toMatch(/^\s*export[\s{]/m);
});

it('leaves vscode external in the browser bundle and pulls in nothing else at runtime', () => {
	expect(required(browser)).toEqual(['vscode']);
});

/**
 * Node builtins are the point of the desktop entry, so what is pinned is which
 * ones. Anything new here is a dependency arriving at the desktop host, and the
 * list is short enough that adding to it should be a decision rather than a diff.
 *
 * `node:child_process` is the one to think twice about: it is here to ask Windows
 * for its volume names, and nothing else may reach for it.
 */
it('pins what the node bundle asks the host for', () => {
	expect(required(node)).toEqual(['node:child_process', 'node:fs/promises', 'node:os', 'node:util', 'vscode']);
});

/**
 * The desktop host has no WebUSB and no bridge to a device chooser, so a path
 * that reads `navigator.usb` there is a `ReferenceError` rather than an absent
 * API. The whole transport lives behind the browser entry point, and only the
 * status enum is shared.
 */
it('keeps WebUSB out of the node bundle', () => {
	expect(node).not.toContain('navigator.usb');
	expect(node).not.toContain('createUSBConnection');
	expect(node).not.toContain('requestUsbDevice');
	expect(browser).toContain('navigator.usb');
});

/**
 * What the desktop bundle takes from the libraries. The transport proper,
 * `usb/transport.js`, `usb/daplink.js`, `usb/device-wrapper.js` and
 * `usb/connection.js`, must never appear: it reads `navigator.usb`. The DAP and
 * partial-flashing files do appear, pulled in by the root-package imports of the
 * status and progress enums, and desktop never runs them; about a fifth of a
 * small bundle, accepted over deep imports into the library's layout. An exact
 * list rather than a size ratio, because shared code lands in both bundles and
 * moves the ratio with every feature; adding to it should be a decision.
 */
it('pins what the node bundle takes from the libraries', () => {
	expect(node).toContain('NoAuthorizedDevice');
	expect(bundled(node)).toEqual([
		'node_modules/@microbit/microbit-connection/build/esm/board-id.js',
		'node_modules/@microbit/microbit-connection/build/esm/device.js',
		'node_modules/@microbit/microbit-connection/build/esm/usb/arm-debug.js',
		'node_modules/@microbit/microbit-connection/build/esm/usb/cmsis-dap.js',
		'node_modules/@microbit/microbit-connection/build/esm/usb/cortex-m.js',
		'node_modules/@microbit/microbit-connection/build/esm/usb/partial-flashing.js',
		'node_modules/nrf-intel-hex/intel-hex.js',
	]);
});

/**
 * The switcher's script runs in a webview document, where there is no `require`
 * and no `vscode`, and reaches the extension through `acquireVsCodeApi` alone.
 * Its stylesheet lands beside it and is the whole of the theming: VS Code's
 * variables are what make the strip follow a theme change without a reload, and
 * the reduced-motion rule is what keeps the slide from a user who asked for none.
 */
it('builds the switcher as a document script with its stylesheet beside it', () => {
	expect(required(switcher)).toEqual([]);
	expect(switcher).toContain('acquireVsCodeApi');
	expect(switcher).not.toContain('module.exports');
	expect(switcherStyle).toContain('--vscode-button-background');
	expect(switcherStyle).toContain('prefers-reduced-motion');
});

/** The distinct first captures of a pattern across a bundle, sorted. */
const found = (bundle: string, pattern: RegExp): string[] =>
	[...new Set([...bundle.matchAll(pattern)].map((match) => match[1] ?? ''))].sort();

/** Every `require(...)` left in a bundle, which is what the host has to supply. */
const required = (bundle: string) => found(bundle, /require\(["']([^"']+)["']\)/g);

/** Every library file folded into a bundle, from the path comments esbuild leaves above each. */
const bundled = (bundle: string) => found(bundle, /^\/\/ (node_modules\/\S+)$/gm);
