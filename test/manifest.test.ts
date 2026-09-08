/**
 * The manifest and the build agree on which bundle each host loads. VS Code
 * reads `main` and `browser` and esbuild writes `outfile`, in two files nothing
 * links together, so a rename there is an extension that activates to nothing
 * and a swap is the node bundle loaded in a Web Worker.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs config, no types
import { getBuildOptions } from '../config/esbuild.config.mjs';
import manifest from '../package.json';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Keyed by the platform each was built for, spelled as the manifest does: repo-root-relative, leading `./`. */
const written = new Map<string, string>(
	getBuildOptions().map((options: { platform: string; outfile: string }) => [
		options.platform,
		`./${path.relative(root, options.outfile).split(path.sep).join('/')}`,
	])
);

describe('manifest entry points', () => {
	it('sends each host to the bundle built for it', () => {
		expect(manifest.browser).toBe(written.get('browser'));
		expect(manifest.main).toBe(written.get('node'));
	});

	// Not covered by the above: a build writing one outfile for both platforms
	// would satisfy it with `main` and `browser` equal.
	it('gives the two hosts different bundles', () => {
		expect(manifest.main).not.toBe(manifest.browser);
	});
});

// Deliberately not asserted: that the build writes *only* these two. A webview
// runs its own script, built here and loaded by the webview rather than by the
// host, so it is an outfile no manifest entry point names and such a check would
// fail the day one is added, for a reason that is not a fault.
