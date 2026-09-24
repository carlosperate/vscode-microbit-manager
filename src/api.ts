import type { MicrobitManagerApi } from '../api';
import type { BoardAccess } from './activate';
import * as vscode from 'vscode';

import { saveHex } from './commands/saveHex';
import { API_VERSION, CAN_COMBINE_CONTEXT, COMMANDS } from './config';
import { setContext } from './context';
import { log } from './log';
import type { MenuGroups } from './menuGroups';

/**
 * `import type` above, so nothing from the types package survives compilation.
 * The board half comes from the host; the menu groups, saving a hex and the
 * command ids are the same on both, so they are built here.
 */
export const createApi = (access: BoardAccess, groups: MenuGroups): MicrobitManagerApi => ({
	version: API_VERSION,
	registerMenuGroup(group) {
		let unregister: () => void;
		try {
			unregister = groups.register(group);
		} catch (error) {
			log(`A menu group was refused: ${String(error)}`);
			throw error;
		}
		log(`Menu group registered: ${group.label}`);
		const offerCombine = () => setContext(CAN_COMBINE_CONTEXT, groups.sidebars().length > 0);
		offerCombine();
		return new vscode.Disposable(() => {
			unregister();
			offerCombine();
			log(`Menu group unregistered: ${group.label}`);
		});
	},
	connect: access.connect,
	board: access.board,
	flashHex: access.flashHex,
	saveHex,
	commands: {
		connect: COMMANDS.connect,
		disconnect: COMMANDS.disconnect,
		openTerminal: COMMANDS.openTerminal,
		flashHexFile: COMMANDS.flashHexFile,
		showMenu: COMMANDS.showMenu,
	},
});
