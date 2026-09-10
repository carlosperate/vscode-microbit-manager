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

beforeAll(async () => {
	outDir = await mkdtemp(path.join(tmpdir(), 'bbcmicrobit-manager-build-'));
	await build(outDir);
	const read = (name: string) => readFile(path.join(outDir, 'dist', name), 'utf8');
	[browser, node] = await Promise.all([read('browser.js'), read('node.js')]);
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

it.each(BOTH)('%s requires nothing at runtime but vscode', (which) => {
	expect(required(bundleFor(which))).toEqual(['vscode']);
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
 * The shared status mapping needs the library's status enum, which is a runtime
 * value rather than a type. Pinning the size is what catches the day an import
 * drags the transport in behind it.
 */
it('pays only the status enum for sharing the library between hosts', () => {
	expect(node).toContain('NoAuthorizedDevice');
	expect(node.length).toBeLessThan(browser.length / 4);
});

/** Every `require(...)` left in a bundle, which is what the host has to supply. */
function required(bundle: string): string[] {
	const found = [...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1] ?? '');
	return [...new Set(found)].sort();
}
