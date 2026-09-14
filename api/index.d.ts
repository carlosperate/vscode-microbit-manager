/**
 * What `carlosperate.bbcmicrobit-manager` returns from `activate()`, reached
 * through `vscode.extensions.getExtension(...)?.exports`. Types only: a value
 * exported from here would end up in a dependent's bundle, and this package is
 * the contract rather than an implementation of it.
 */

export type BoardVersion = 'V1' | 'V2';

/** An Intel hex, as the string a mode built or the bytes it read. */
export type HexSource = string | Uint8Array;

export interface BoardInfo {
	readonly version: BoardVersion;
	/** Identifies the physical board, so a long build can tell it was swapped. */
	readonly serialNumber: string | undefined;
}

export interface MicrobitManagerApi {
	/** Semver. Major for a breaking change, minor for an addition, patch for a fix. */
	readonly version: string;

	/**
	 * Connect if not already connected, and say what answered. Undefined means the
	 * user cancelled or no board could be reached, and it has already been
	 * explained. A mode calls this when it must know V1 from V2 before it builds.
	 *
	 * It means two different things and a mode must never care which: on web it
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

	/** Command ids a mode links to from its own buttons. */
	readonly commands: {
		readonly connect: string;
		readonly disconnect: string;
		readonly openTerminal: string;
		readonly flashHexFile: string;
	};
}
