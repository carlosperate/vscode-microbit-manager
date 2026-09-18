/**
 * What `carlosperate.bbcmicrobit-manager` returns from `activate()`, reached
 * through `vscode.extensions.getExtension(...)?.exports`. Types only: a value
 * exported from here would end up in a dependent's bundle, and this package is
 * the contract rather than an implementation of it. `vscode` below is the
 * `@types/vscode` every extension already has.
 */
import type * as vscode from 'vscode';

export type BoardVersion = 'V1' | 'V2';

/** An Intel hex, as the string a language extension built or the bytes it read. */
export type HexSource = string | Uint8Array;

export interface BoardInfo {
	readonly version: BoardVersion;
	/** Identifies the physical board, so a long build can tell it was swapped. */
	readonly serialNumber: string | undefined;
}

/** One entry of the status bar menu, in the registering extension's own words. */
export interface MenuCommand {
	readonly command: string;
	readonly label: string;
}

/** An extension's share of the status bar menu, listed under `label`. */
export interface MenuGroup {
	readonly label: string;
	readonly commands: readonly MenuCommand[];
}

export interface MicrobitManagerApi {
	/**
	 * Semver, read as npm's caret: below 1.0.0 a minor is a breaking change. This
	 * extension refuses nobody: compare it with the version you were built
	 * against, and explain a mismatch yourself.
	 */
	readonly version: string;

	/**
	 * Lists the group's commands in the status bar menu until disposed. Throws a
	 * `TypeError` for a malformed group. Register at startup, so the commands are
	 * in the menu before the user opens it.
	 */
	registerMenuGroup(group: MenuGroup): vscode.Disposable;

	/**
	 * Connect if not already connected, and say what answered. Undefined means the
	 * user cancelled or no board could be reached, and it has already been
	 * explained. Call this when you must know V1 from V2 before you build.
	 *
	 * It means two different things and a caller must never care which: on web it
	 * authorises a board through the device chooser and asks what it is, and on
	 * desktop it finds the mounted volume and reads the version out of DETAILS.TXT.
	 */
	connect(): Promise<BoardInfo | undefined>;

	/** What is connected now, without connecting. Undefined when nothing is. */
	board(): BoardInfo | undefined;

	/**
	 * Connect if needed, then write. False when the user cancelled or it was
	 * refused, in which case they have already been told why.
	 *
	 * Pass the `BoardInfo` the hex was built for as `expect`, and a board swapped
	 * during a slow build is caught rather than flashed with the wrong image.
	 */
	flashHex(hex: HexSource, options?: { expect?: BoardInfo }): Promise<boolean>;

	/** The FAT16-safe save dialog, so there is one implementation of the naming rules. */
	saveHex(hex: HexSource, baseName: string): Promise<boolean>;

	/**
	 * Command ids to link to from your own buttons, since welcome content is
	 * markdown and a button there is a link to a command id. `connect` and
	 * `disconnect` are hidden by `bbcmicrobit-manager.canPair` where no device
	 * chooser exists, so gate your own links on the same key.
	 */
	readonly commands: {
		readonly connect: string;
		readonly disconnect: string;
		readonly openTerminal: string;
		readonly flashHexFile: string;
	};
}
