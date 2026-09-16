/**
 * What one `--extensionPath=` value names: an extension folder, or a folder of
 * them, which is what the flag means to the web harness. Both launchers here
 * read it through this, so the same flag means the same thing on both hosts.
 */
import fs from 'node:fs';
import path from 'node:path';

const holdsManifest = (dir) => fs.existsSync(path.join(dir, 'package.json'));

export function extensionsIn(value, root) {
	const dir = path.resolve(root, value);
	if (holdsManifest(dir)) return [dir];
	if (!fs.existsSync(dir)) throw new Error(`no extension at ${dir}: there is nothing there.`);

	const inside = fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && holdsManifest(path.join(dir, entry.name)))
		.map((entry) => path.join(dir, entry.name));
	if (inside.length === 0) throw new Error(`no extension at ${dir}: neither it nor any folder in it holds a package.json.`);
	return inside;
}
