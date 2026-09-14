import type { MicrobitManagerApi } from '../api';
import type { BoardAccess } from './activate';

import { saveHex } from './commands/saveHex';
import { API_VERSION, COMMANDS } from './config';

/**
 * `import type` above, so nothing from the types package survives compilation.
 * The board half comes from the host; saving a hex and the command ids are the
 * same on both, so they are built here.
 */
export const createApi = (access: BoardAccess): MicrobitManagerApi => ({
	version: API_VERSION,
	connect: access.connect,
	board: access.board,
	flashHex: access.flashHex,
	saveHex,
	commands: {
		connect: COMMANDS.connect,
		disconnect: COMMANDS.disconnect,
		openTerminal: COMMANDS.openTerminal,
		flashHexFile: COMMANDS.flashHexFile,
	},
});
