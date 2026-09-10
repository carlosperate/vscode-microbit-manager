/**
 * Every id this extension contributes, in one place. The manifest repeats them
 * because VS Code reads it rather than the code, and the integration tests are
 * what stop the two drifting apart.
 */
export const COMMANDS = {
	connect: 'bbcmicrobit-manager.connect',
	disconnect: 'bbcmicrobit-manager.disconnect',
	flashHexFile: 'bbcmicrobit-manager.flashHexFile',
	openTerminal: 'bbcmicrobit-manager.openTerminal',
	/** The status bar item's action, so it is hidden from the palette and from itself. */
	showMenu: 'bbcmicrobit-manager.showMenu',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

/**
 * The user-facing name. The display name, every command category, the output
 * channel and the status bar item all read the same, so a palette entry says
 * which micro:bit extension it belongs to.
 */
export const PRODUCT = 'BBC micro:bit Manager';

/**
 * The activity bar container every micro:bit extension contributes into. No dot
 * in it: the workbench schema for a container id is `/^[a-z0-9_-]+$/i`, and a
 * container id that does not resolve sends its views to the Explorer with
 * nothing but a log line to say why.
 */
export const CONTAINER_ID = 'bbcmicrobit';

/** The fallback panel: welcome content over a tree that stays empty. */
export const FALLBACK_VIEW_ID = 'bbcmicrobit-manager.fallback';

/**
 * The Open VSX companion that owns every serial terminal, on both hosts. A pack
 * member rather than a dependency, so a user may remove it: `serial/provider.ts`
 * explains its absence instead of VS Code refusing the uninstall.
 */
export const SERIAL_MONITOR_EXTENSION = 'eclipse-cdt.serial-monitor';

/**
 * Set once this host is known to be able to authorise a board, and read by the
 * manifest to keep Connect and Disconnect out of the palette where it cannot.
 * A capability and not a host: a web workbench that stopped bridging the device
 * chooser would hide them too, which is the right answer there as well.
 */
export const CAN_PAIR_CONTEXT = 'bbcmicrobit-manager.canPair';
