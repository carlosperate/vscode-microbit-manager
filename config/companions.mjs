/**
 * Serves VS Code Web with this extension's `extensionPack` companions actually
 * running. `--extensionId` is not enough: the workbench reads the manifest from
 * the marketplace CDN and is then blocked fetching the code, so the companion
 * appears installed and fails to activate. Serving an unpacked VSIX from disk is
 * what works, so each one is fetched from Open VSX once and cached.
 *
 * Whatever arguments this is given are passed through to `vscode-test-web`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cache = path.join(root, '.vscode-test-web', 'companions');

/** The manifest's own list, so there is one list rather than two. */
const { extensionPack = [] } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Open VSX publishes under `namespace/name`, which is the extension id either side of the dot. */
async function ensure(id) {
	const target = path.join(cache, id);
	if (fs.existsSync(path.join(target, 'extension', 'package.json'))) return target;

	const [namespace, name] = id.split('.');
	const meta = await fetch(`https://open-vsx.org/api/${namespace}/${name}/latest`);
	if (!meta.ok) throw new Error(`Could not look up ${id} on Open VSX: ${meta.status} ${meta.statusText}`);
	const { version, files } = await meta.json();

	const vsix = await fetch(files.download);
	if (!vsix.ok) throw new Error(`Could not download ${id} ${version}: ${vsix.status} ${vsix.statusText}`);
	await fsp.mkdir(target, { recursive: true });
	const archive = path.join(target, 'extension.vsix');
	await fsp.writeFile(archive, Buffer.from(await vsix.arrayBuffer()));

	// A VSIX is a zip, and unzip is on every runner this is ever driven from.
	await run('unzip', ['-q', '-o', archive, '-d', target]);
	console.log(`[companions] ${id} ${version} unpacked into ${target}`);
	return target;
}

const run = (command, args) =>
	new Promise((resolve, reject) => {
		spawn(command, args, { stdio: 'inherit' }).on('exit', (status) =>
			status === 0 ? resolve() : reject(new Error(`${command} exited with ${String(status)}`))
		);
	});

const paths = [];
for (const id of extensionPack) paths.push(await ensure(id));

const args = [
	'--quality',
	'stable',
	'--extensionDevelopmentPath=.',
	...paths.map((target) => `--extensionPath=${path.join(target, 'extension')}`),
	...process.argv.slice(2),
	'./test/workspace',
];
spawn(path.join(root, 'node_modules', '.bin', 'vscode-test-web'), args, {
	stdio: 'inherit',
	cwd: root,
}).on('exit', (status, signal) => process.exit(signal ? 1 : (status ?? 0)));
