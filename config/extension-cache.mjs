/**
 * Published extensions, fetched once and kept.
 *
 * The web harness's own `--extensionId` is resolved by the workbench from the
 * marketplace on every page load, so a run is a version lookup and a full
 * download each time, which rate limits under any repeated use and refuses a
 * pinned version. A VSIX from Open VSX, cached by exact version, is the same
 * extension with none of that.
 *
 * `publisher.name` takes the latest version, `publisher.name@1.2.3` that one.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ID = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)(?:@(\d+\.\d+\.\d+))?$/i;
const REGISTRY = 'https://open-vsx.org/api';

/** `undefined` rather than a throw, so a caller can tell a path from an id. */
export function parseId(value) {
	const match = ID.exec(value);
	return match ? { publisher: match[1], name: match[2], version: match[3] } : undefined;
}

/**
 * The VSIX and its unpacked folder for one id, downloaded if this exact version
 * is not already here. An unpinned id costs one small lookup; a pinned one, once
 * cached, needs no network at all.
 */
export async function cachedExtension(value, cacheDir) {
	const wanted = parseId(value);
	if (!wanted) throw new Error(`not an extension id: ${value}. The format is publisher.name or publisher.name@1.2.3.`);

	const { publisher, name } = wanted;
	const version = wanted.version ?? (await latestVersion(publisher, name));
	const id = `${publisher}.${name}-${version}`;
	const vsix = path.join(cacheDir, `${id}.vsix`);
	const unpacked = path.join(cacheDir, id);
	// The manifest is what makes it usable, so its absence means a half-unpacked folder.
	if (fs.existsSync(path.join(unpacked, 'extension', 'package.json'))) return { id, version, vsix, folder: unpacked };

	fs.mkdirSync(cacheDir, { recursive: true });
	if (!fs.existsSync(vsix)) {
		console.log(`[extensions] downloading ${publisher}.${name} ${version} from Open VSX`);
		await download(`${REGISTRY}/${publisher}/${name}/${version}/file/${publisher}.${name}-${version}.vsix`, vsix);
	}
	fs.rmSync(unpacked, { recursive: true, force: true });
	unzip(vsix, unpacked);
	if (!fs.existsSync(path.join(unpacked, 'extension', 'package.json'))) {
		throw new Error(`${vsix} unpacked without an extension/package.json in it`);
	}
	return { id, version, vsix, folder: unpacked };
}

async function latestVersion(publisher, name) {
	const response = await fetch(`${REGISTRY}/${publisher}/${name}/latest`);
	if (!response.ok) throw new Error(`Open VSX has no ${publisher}.${name} (HTTP ${response.status})`);
	const { version } = await response.json();
	if (!version) throw new Error(`Open VSX gave no version for ${publisher}.${name}`);
	return version;
}

/** Written under a temporary name, so an interrupted download is never taken for a cached one. */
async function download(url, target) {
	const response = await fetch(url, { redirect: 'follow' });
	if (!response.ok) throw new Error(`could not download ${url} (HTTP ${response.status})`);
	const partial = `${target}.partial`;
	fs.writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
	fs.renameSync(partial, target);
}

/** A VSIX is a zip, and neither Node nor this repository has an unzipper. */
function unzip(vsix, into) {
	const run =
		process.platform === 'win32'
			? spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${vsix}' -DestinationPath '${into}' -Force`])
			: spawnSync('unzip', ['-q', '-o', vsix, '-d', into]);
	if (run.status !== 0) throw new Error(`could not unpack ${vsix}: ${run.stderr?.toString().trim() || `exit ${String(run.status)}`}`);
}
