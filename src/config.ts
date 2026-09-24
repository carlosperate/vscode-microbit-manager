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
	combineSidebars: 'bbcmicrobit-manager.combineSidebars',
	separateSidebars: 'bbcmicrobit-manager.separateSidebars',
	hidePanel: 'bbcmicrobit-manager.hidePanel',
	showPanel: 'bbcmicrobit-manager.showPanel',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

/**
 * The API version, which is the version of the types package and not of this
 * extension. A language extension compares it with the one it was built
 * against, so it moves when the contract does and stays put when only the
 * extension ships. Here rather than beside the API object, which reaches `vscode`.
 */
export const API_VERSION = '0.3.1';

/**
 * The user-facing name. The display name, every command category, the output
 * channel and the status bar item all read the same, so a palette entry says
 * which micro:bit extension it belongs to.
 */
export const PRODUCT = 'BBC micro:bit Manager';

/**
 * This extension's activity bar container. No dot in it: the workbench schema
 * for a container id is `/^[a-z0-9_-]+$/i`, and one that does not resolve sends
 * its views to the Explorer with nothing but a log line to say why.
 */
export const CONTAINER_ID = 'bbcmicrobit';

/** The panel: welcome content over a tree that stays empty. */
export const BOARD_VIEW_ID = 'bbcmicrobit-manager.board';

/** True while a registered group has a sidebar this panel can combine. */
export const CAN_COMBINE_CONTEXT = 'bbcmicrobit-manager.canCombine';

/**
 * What Combine and Separate last did, kept per profile as VS Code keeps view
 * locations. No API says where a view is, so a user's own drag is not seen.
 */
export const COMBINED_STATE = 'bbcmicrobit-manager.combined';

/**
 * The user hid the panel; the view's `when` reads it, and an empty container
 * leaves the activity bar. VS Code has no command to hide one container's icon.
 */
export const PANEL_HIDDEN_STATE = 'bbcmicrobit-manager.panelHidden';

/**
 * The language extensions the panel links to, each while it is not installed.
 * The one place this extension names another: VS Code has no context key for
 * "installed", so each gets a key this extension sets.
 */
export const OFFERS = [
	{ extension: 'carlosperate.bbcmicrobit-micropython', context: 'bbcmicrobit-manager.offerMicroPython' },
	{ extension: 'carlosperate.bbcmicrobit-cpp', context: 'bbcmicrobit-manager.offerCpp' },
] as const;

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
