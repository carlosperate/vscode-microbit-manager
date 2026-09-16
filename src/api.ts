import type { MicrobitManagerApi } from '../api';
import type { BoardAccess } from './activate';
import type { Modes } from './modes/state';

import { saveHex } from './commands/saveHex';
import { API_VERSION, COMMANDS } from './config';

/**
 * `import type` above, so nothing from the types package survives compilation.
 * The board half comes from the host; the modes, saving a hex and the command
 * ids are the same on both, so they are built here.
 */
export const createApi = (access: BoardAccess, modes: Modes): MicrobitManagerApi => ({
	version: API_VERSION,
	registerMode: modes.registerMode,
	activeMode: modes.activeMode,
	onDidChangeActiveMode: modes.onDidChangeActiveMode,
	connect: access.connect,
	board: access.board,
	flashHex: access.flashHex,
	saveHex,
	commands: {
		connect: COMMANDS.connect,
		disconnect: COMMANDS.disconnect,
		openTerminal: COMMANDS.openTerminal,
		flashHexFile: COMMANDS.flashHexFile,
		switchMode: COMMANDS.switchMode,
	},
});
