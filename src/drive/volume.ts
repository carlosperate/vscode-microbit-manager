/**
 * Finding the drive a micro:bit mounts, the only way to program one where no USB
 * device can be authorised. Nothing on a drive is opened before its name has
 * matched: walking the drive letters instead contacts every mapped network drive
 * and waits out each dead one.
 */
import type { BoardVersion } from '@microbit/microbit-connection';
import { boardVersion } from './details';

/** Injected so the search runs off a real machine. */
export interface DriveIo {
	list(path: string): Promise<string[]>;
	read(path: string): Promise<string>;
	/** Asked only on Windows, where a path carries no volume name. */
	removableVolumes(): Promise<Volume[]>;
}

export interface Volume {
	name: string;
	/** A drive letter and its colon on Windows. */
	path: string;
}

export interface Machine {
	platform: string;
	/** Part of the mount path on Linux. Empty if unknown. */
	user: string;
}

export interface Board {
	path: string;
	/** Unknown builds a hex for every board rather than guessing. */
	version: BoardVersion | undefined;
}

/** Every DAPLink build for a micro:bit writes one, so its absence is not a board. */
const DETAILS = 'DETAILS.TXT';

/** DAPLink names the volume after the board, and every system numbers a second one. */
const VOLUME_NAME = /^MICROBIT[ _-]?\d*$/i;

/**
 * Rejects only where a platform will not say what is mounted; nothing mounted is
 * an empty list.
 */
export async function findBoards(io: DriveIo, machine: Machine): Promise<Board[]> {
	const paths = await candidates(io, machine);
	const found = await Promise.all(paths.map((path) => identify(io, path, machine.platform)));
	return found.filter((board): board is Board => board !== undefined);
}

/** One known mount point, for asking whether a board that was there still is. */
export const boardAt = (io: DriveIo, machine: Machine, path: string): Promise<Board | undefined> =>
	identify(io, path, machine.platform);

/**
 * Whether a drive is the board a hex was built for. The mount point is the only
 * thing that tells two boards apart here, and a version that could not be read
 * confirms nothing rather than contradicting, so it is never the thing that
 * refuses a flash.
 */
export const matches = (board: Board, expect: { version: BoardVersion; serialNumber: string | undefined }): boolean =>
	(expect.serialNumber === undefined || expect.serialNumber === board.path) &&
	(board.version === undefined || board.version === expect.version);

async function candidates(io: DriveIo, { platform, user }: Machine): Promise<string[]> {
	// Not caught: a refusal to say what is mounted is not the same as no board.
	if (platform === 'win32') {
		const volumes = await io.removableVolumes();
		return volumes.filter((volume) => VOLUME_NAME.test(volume.name)).map((volume) => volume.path);
	}

	const paths: string[] = [];
	for (const parent of mountParents(platform, user)) {
		// Most machines have only one of these.
		const names = await io.list(parent).catch(() => []);
		for (const name of names) if (VOLUME_NAME.test(name)) paths.push(`${parent}/${name}`);
	}
	return paths;
}

const mountParents = (platform: string, user: string): string[] =>
	platform === 'darwin'
		? ['/Volumes']
		: [...(user ? [`/media/${user}`, `/run/media/${user}`] : []), '/media', '/mnt'];

/**
 * The name matched, so what is left is which board, and whether it is one at
 * all. One file answers both: a volume called MICROBIT with no `DETAILS.TXT` is
 * something else wearing the name, and a version it does not recognise is a
 * board it can still copy a hex to.
 */
async function identify(io: DriveIo, path: string, platform: string): Promise<Board | undefined> {
	const details = await io.read(join(platform, path, DETAILS)).catch(() => undefined);
	return details === undefined ? undefined : { path, version: boardVersion(details) };
}

const join = (platform: string, dir: string, name: string) => `${dir}${platform === 'win32' ? '\\' : '/'}${name}`;
