/**
 * What `carlosperate.bbcmicrobit-manager` returns from `activate()`, reached
 * through `vscode.extensions.getExtension(...)?.exports`. Types only: a value
 * exported from here would end up in a dependent's bundle, and this package is
 * the contract rather than an implementation of it. `vscode` below is the
 * `@types/vscode` every extension already has.
 */
import type * as vscode from 'vscode';

export type BoardVersion = 'V1' | 'V2';

/** An Intel hex, as the string a mode built or the bytes it read. */
export type HexSource = string | Uint8Array;

export interface BoardInfo {
	readonly version: BoardVersion;
	/** Identifies the physical board, so a long build can tell it was swapped. */
	readonly serialNumber: string | undefined;
}

/**
 * A mode: a segment in the switcher at the top of the `BBC micro:bit` panel,
 * and everything under it. The mode owns its own views, which it contributes
 * to the `bbcmicrobit` container gated on `bbcmicrobit-manager.activeMode == <id>`,
 * and its own buttons: this extension draws nothing below the switcher unless
 * asked with `boardPanel`. `bbcmicrobit-manager.noModes` is the other key a
 * mode may read: true while nothing is registered, for a view worth showing
 * when the mode itself was refused and the panel would otherwise be bare.
 *
 * Register on `onStartupFinished`. A mode that only activated on
 * `workspaceContains:` would never register in a workspace of another kind,
 * and the user could then never switch to it.
 */
export interface Mode {
	/** The lowest manager API this extension works against, as `major.minor.patch`. */
	readonly apiVersion: string;
	/** Stable, lowercase, and this mode's own: a letter, then letters, digits or dashes. */
	readonly id: string;
	/** Its own `publisher.name`, so a refusal can name the extension to update. */
	readonly extensionId: string;
	/** The segment label. A word or two: three segments share a 300px sidebar. */
	readonly label: string;
	/**
	 * True when this workspace looks like this mode's own. Until the user picks a
	 * mode by hand, a lone claimant is the active mode; afterwards a lone claimant
	 * that is not active is offered as a switch. Never derived from the active
	 * editor, which would move the panel under the user.
	 */
	claimsWorkspace?(): Promise<boolean>;
	/** Fired when the answer to `claimsWorkspace` may have changed. */
	readonly onDidChangeWorkspaceClaim?: vscode.Event<void>;
	/** The mode's own commands, offered in the status bar menu while it is active. This extension's are always there. */
	readonly menuCommands?: readonly { readonly command: string; readonly label: string }[];
	/**
	 * True to have this extension show its own board section, Connect, Flash hex
	 * to micro:bit and Open Serial Terminal, under the switcher while this mode is
	 * active. For a mode with no buttons of its own to offer; a mode that draws
	 * its own leaves it unset.
	 */
	readonly boardPanel?: boolean;
}

/**
 * Thrown by `registerMode` when this extension cannot serve the declared
 * `apiVersion`: a different major, or a minor above its own. The message has
 * already been shown, naming the extension to update, so a mode catches it,
 * logs it and carries on with its own views. There is no runtime value to
 * import from here: test `error.name === 'IncompatibleApiError'`.
 */
export declare class IncompatibleApiError extends Error {
	readonly name: 'IncompatibleApiError';
	readonly extensionId: string;
	/** The mode's own label, as it declared it. */
	readonly label: string;
	/** What the mode declared. */
	readonly wanted: string;
	/** What this extension serves. */
	readonly served: string;
	readonly behind: 'manager' | 'mode';
}

export interface MicrobitManagerApi {
	/** Semver. Major for a breaking change, minor for an addition, patch for a fix. */
	readonly version: string;

	/**
	 * Register a mode. Throws `IncompatibleApiError` when the versions do not
	 * meet, a `TypeError` for a malformed mode, and an `Error` for an id already
	 * taken. Dispose to unregister. Read `activeMode()` after registering: the
	 * event covers later changes only.
	 */
	registerMode(mode: Mode): vscode.Disposable;

	/** Which mode is active, or undefined when none is registered. */
	activeMode(): string | undefined;

	/** Fired with the new active mode id, or undefined when the last mode goes. */
	readonly onDidChangeActiveMode: vscode.Event<string | undefined>;

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

	/**
	 * Command ids a mode links to from its own buttons, since welcome content is
	 * markdown and a button there is a link to a command id. `connect` and
	 * `disconnect` are hidden by `bbcmicrobit-manager.canPair` where no device
	 * chooser exists, so a mode gates its own links on the same key.
	 */
	readonly commands: {
		readonly connect: string;
		readonly disconnect: string;
		readonly openTerminal: string;
		readonly flashHexFile: string;
		/**
		 * Makes the mode whose id is passed as the argument the active one, as if
		 * the user had switched. For a mode's own command that needs its view: a
		 * view gated out of the panel cannot be revealed, so run this first.
		 */
		readonly switchMode: string;
	};
}
