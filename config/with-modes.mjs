/**
 * Runs this extension with other extensions loaded beside it, so the switcher can
 * be driven with real modes. Which extensions those are is the caller's business:
 * this script knows only that they are extension folders or published ids.
 *
 * `--extensionPath=<path>` names a checkout, or a folder of them, and is built
 * first where it declares a `build` script. `--extensionId=publisher.name`, or
 * `publisher.name@1.2.3`, takes a published one, downloaded once into
 * `.vscode-test/published/` and used from there afterwards. Both repeat, and at
 * least one is required. `--chrome` and `--desktop` pick the launcher,
 * `--no-build` skips the checkout builds, and everything else is passed through.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cachedExtension } from './extension-cache.mjs';
import { extensionsIn } from './extensions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cacheDir = path.join(root, '.vscode-test', 'published');

const PATH_FLAG = '--extensionPath=';
const ID_FLAG = '--extensionId=';
const OWN = ['--desktop', '--chrome', '--no-build'];

const flags = process.argv.slice(2);
const script = flags.includes('--desktop') ? 'desktop' : flags.includes('--chrome') ? 'chrome' : 'serve';
// A bare `--` is npm's, not the launcher's: forwarded, it would turn every flag after it positional.
const passthrough = flags.filter(
	(flag) => flag !== '--' && !OWN.includes(flag) && !flag.startsWith(PATH_FLAG) && !flag.startsWith(ID_FLAG)
);
const valuesOf = (prefix) => flags.filter((flag) => flag.startsWith(prefix)).map((flag) => flag.slice(prefix.length));

/** A usage mistake, which a stack trace only buries. */
function fail(message) {
	console.error(`[modes] ${message}`);
	process.exit(1);
}

/** Skipped where there is nothing to build: a fixture is plain JavaScript with no build step. */
function buildable(dir) {
	const { scripts } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
	if (!scripts?.build) return false;
	if (!fs.existsSync(path.join(dir, 'node_modules'))) fail(`${dir} has no node_modules. Run npm install there first.`);
	return true;
}

const run = (args, cwd) =>
	new Promise((resolve, reject) => {
		spawn('npm', args, { stdio: 'inherit', cwd, shell: process.platform === 'win32' }).on('exit', (status) =>
			status === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} in ${cwd} exited with ${String(status)}`))
		);
	});

const paths = valuesOf(PATH_FLAG);
const ids = valuesOf(ID_FLAG);
if (paths.length === 0 && ids.length === 0) {
	fail(`nothing to load beside this extension. Pass ${PATH_FLAG}<path> for a checkout or ${ID_FLAG}<publisher.name> for a published one.`);
}

// Resolved before anything builds: a wrong path or id would otherwise fail deep inside the launcher.
let checkouts = [];
let published = [];
try {
	checkouts = paths.flatMap((value) => extensionsIn(value, root));
	published = [];
	for (const id of ids) published.push(await cachedExtension(id, cacheDir));
} catch (error) {
	fail(error.message);
}

// Independent builds, so they run together; the script below builds this repository itself.
if (!flags.includes('--no-build')) await Promise.all(checkouts.filter(buildable).map((dir) => run(['run', 'build'], dir)));

// A checkout is loaded from source on either host. A published one is installed into
// the desktop profile, which is how a user has it, and served from its unpacked folder
// on web, where nothing can install.
const extra = [
	...checkouts.map((dir) => `${PATH_FLAG}${dir}`),
	...published.map((extension) =>
		script === 'desktop' ? `--installExtension=${extension.vsix}` : `${PATH_FLAG}${path.join(extension.folder, 'extension')}`
	),
];
await run(['run', script, '--', ...extra, ...passthrough], root);
