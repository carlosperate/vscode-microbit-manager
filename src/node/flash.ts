/**
 * The board half of the API on the desktop, where there is no chooser and no
 * WebUSB: a board is the drive it mounts, and DAPLink programs the target from
 * whatever hex is copied onto it.
 */
import type { BoardInfo, HexSource } from '../../api';
import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { boardAt, findBoards, matches, type Board } from '../drive/volume';
import { log } from '../log';
import { createDriveIo, machine } from './io';

const driveIo = createDriveIo(log);

/**
 * The same IO without the commentary. macOS refuses the drive for a moment while
 * DAPLink remounts it, so polling logs a handful of permission errors that are
 * the wait working rather than anything going wrong, and they read as a failure
 * beside a flash that succeeded.
 */
const quietIo = createDriveIo(() => undefined);

/** DAPLink consumes whatever hex is copied and reboots, so the name is transient. */
const TARGET = 'microbit.hex';

/** Written by DAPLink onto the rebuilt drive when it would not program the hex. */
const FAIL = 'FAIL.TXT';

/** What `connect()` last found, which is all `board()` has to answer with. */
let attached: Board | undefined;

/**
 * The mount point stands in for a serial number here: it is the only thing that
 * tells two boards apart on this host, and it is what `expect` is checked
 * against. A `DETAILS.TXT` naming a board id we do not know has no version, and
 * saying `V2` there would have a caller build the wrong image, so it says nothing.
 */
export function board(): BoardInfo | undefined {
	return attached?.version ? { version: attached.version, serialNumber: attached.path } : undefined;
}

const NO_BOARD = `${PRODUCT}: no micro:bit found. Plug one in and give it a moment to be ready.`;

/**
 * A volume search and a read of `DETAILS.TXT`, which is what connecting means
 * here. Every empty answer is explained first, a dismissed pick aside: the
 * caller trusts this, and says nothing of its own.
 */
export async function connect(): Promise<BoardInfo | undefined> {
	const found = await search();
	if (found.length === 0) {
		void vscode.window.showWarningMessage(NO_BOARD);
		return undefined;
	}

	const picked = await choose(found);
	// A hex already built goes onto this board fine, so it is a board with
	// something missing rather than a failure to reach one.
	if (picked && !picked.version) {
		void vscode.window.showWarningMessage(
			`${PRODUCT}: found a micro:bit at ${picked.path}, but not whether it is a V1 or a V2. ` +
				'Flashing a hex file still works.'
		);
	}
	return board();
}

/**
 * Copying bytes needs no version, so this works against a board whose version
 * could not be read, which `connect()` cannot answer for.
 */
export async function flashHex(hex: HexSource, options?: { expect?: BoardInfo }): Promise<boolean> {
	// Found again every flash, never remembered: a mount point outlives the board
	// that made it, so the next board plugged in inherits the name.
	const expect = options?.expect;
	const found = expect?.serialNumber ? await only(expect.serialNumber) : await search();
	const target = expect ? found.find((board) => matches(board, expect)) : await choose(found);

	if (!target) {
		if (expect) {
			void vscode.window.showWarningMessage(
				`${PRODUCT}: the micro:bit this was built for is not there any more, so nothing was sent.`
			);
		} else if (found.length === 0) {
			void vscode.window.showWarningMessage(NO_BOARD);
		}
		// Otherwise boards were found and the pick was dismissed, which needs no reply.
		return false;
	}
	attached = target;

	// The progress covers the wait as well as the write: the board takes the hex
	// off the drive afterwards, and that is half a minute with nothing on screen.
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `${PRODUCT}: flashing the micro:bit` },
		() => send(hex, target.path)
	);
}

async function send(hex: HexSource, path: string): Promise<boolean> {
	const file = vscode.Uri.joinPath(vscode.Uri.file(path), TARGET);
	try {
		await vscode.workspace.fs.writeFile(file, typeof hex === 'string' ? new TextEncoder().encode(hex) : hex);
	} catch (error) {
		log(`Could not write ${file.fsPath}: ${String(error)}`);
		void vscode.window.showErrorMessage(`${PRODUCT}: ${await explainFailedWrite(error, path)}`);
		return false;
	}

	log(`Wrote ${file.fsPath}`);

	// The write only reached a filesystem. DAPLink reads the file afterwards and
	// says what it made of it in FAIL.TXT, which is the only account of a board
	// that took nothing: without this, a text file renamed `.hex` is reported as
	// flashed.
	const refusal = await refused(path);
	if (refusal) {
		log(`The micro:bit did not take it: ${refusal}`);
		void vscode.window.showErrorMessage(`${PRODUCT}: ${refusal}`);
		return false;
	}
	return true;
}

/**
 * Why the board has no new program, or nothing when it took one.
 *
 * The hex is the signal: DAPLink consumes it and rebuilds the drive, so only
 * once it has gone is the drive an account of this copy. Read before then and it
 * describes the last one, which is how a flash that worked is reported failed.
 */
async function refused(path: string): Promise<string | undefined> {
	const rebuilt = await consumed(path);
	// Still sitting there, or a drive that never came back: either way nothing says
	// the program was written, so nothing here may say it was.
	if (!rebuilt) {
		return 'the micro:bit has not taken that file. Check the board, and flash again if your program is not on it.';
	}

	// Listed, not read: the drive is often unreadable for a moment after the
	// rebuild, and a failed read must not pass for a board that was happy.
	if (!rebuilt.includes(FAIL)) return undefined;
	const text = await failText(path);
	// `error:` is the line worth repeating; the rest is DAPLink's own taxonomy.
	const reason = text ? (/^error:\s*(.+)$/im.exec(text)?.[1]?.trim() ?? text.trim()) : undefined;
	return `the micro:bit did not accept that file.${reason ? ` ${reason}` : ''}`;
}

/**
 * The rebuilt drive, once DAPLink has taken the hex off it, or nothing if that
 * never happens. Listed rather than read: a read cannot tell a file that has
 * gone from a drive that is mid-remount, and both happen here. Thirty seconds,
 * which is longer than a board takes to swallow a megabyte.
 */
async function consumed(path: string): Promise<string[] | undefined> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		await pause(500);
		const names = await quietIo.list(path).catch(() => undefined);
		if (names && !names.includes(TARGET)) return names;
	}
	return undefined;
}

const failText = (path: string): Promise<string | undefined> =>
	driveIo.read(`${path}/${FAIL}`).catch(() => undefined);

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Two boards on a machine is a classroom, not an edge case, and the choice is
 * asked every time: flashing each of them in turn is the reason there are two.
 */
async function choose(found: readonly Board[]): Promise<Board | undefined> {
	attached = found.length <= 1 ? found[0] : await pick(found);
	return attached;
}

/**
 * The one mount point a board already named, rather than a search: on Windows a
 * search is a PowerShell query, and this runs on the way into every flash.
 */
async function only(path: string): Promise<Board[]> {
	const found = await boardAt(driveIo, machine(), path).catch(() => undefined);
	return found ? [found] : [];
}

async function search(): Promise<Board[]> {
	try {
		const boards = await findBoards(driveIo, machine());
		log(`Found ${boards.length} micro:bit drive(s)${boards.length ? `: ${describe(boards)}` : ''}`);
		return boards;
	} catch (error) {
		log(`Could not look for a micro:bit drive: ${String(error)}`);
		return [];
	}
}

/**
 * A drive with no room says so plainly, because it is the one failure here with
 * an obvious cause and an obvious fix. Everything else is told apart by whether
 * the board is still there.
 */
async function explainFailedWrite(error: unknown, path: string): Promise<string> {
	if (/ENOSPC|no space left/i.test(String(error))) {
		return 'there is no room left on the micro:bit. Unplug it, plug it back in to clear the drive, and flash again.';
	}
	return explainFailedFlash(path);
}

/**
 * A board that took the whole program reboots itself, which can land before the
 * write is flushed, so a failure with the board already gone may have worked.
 */
async function explainFailedFlash(path: string): Promise<string> {
	// This board's own path, never a fresh search, which on Windows would wait out the whole query again.
	const still = await boardAt(driveIo, machine(), path)
		.then((found) => found !== undefined)
		.catch(() => true);

	return still
		? 'the micro:bit could not be flashed, and it is still connected. See the output for why.'
		: 'the micro:bit disconnected while it was being flashed. If it restarted it may have your program: ' +
				'check the board, and flash again if it did not.';
}

const describe = (boards: readonly Board[]) =>
	boards.map((entry) => `${entry.path} (${entry.version ?? 'unknown version'})`).join(', ');

/** The one place the mount point earns its space: it tells two boards apart. */
async function pick(boards: readonly Board[]): Promise<Board | undefined> {
	const picked = await vscode.window.showQuickPick(
		boards.map((entry) => ({
			label: entry.version ? `micro:bit ${entry.version}` : 'micro:bit',
			description: entry.path,
			board: entry,
		})),
		{ title: PRODUCT, placeHolder: 'Which micro:bit do you want to flash?' }
	);
	return picked?.board;
}
