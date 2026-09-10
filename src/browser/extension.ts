/**
 * The web entry point, and the one desktop does not use. A board is reached over
 * WebUSB here, which needs the workbench to bridge a device chooser that only
 * the web workbench registers.
 */
import type { MicrobitManagerApi } from '../../api';
import type * as vscode from 'vscode';

import { activateHost } from '../activate';
import { connect, disconnect } from '../commands/board';
import { openTerminal } from '../commands/openTerminal';
import { COMMANDS } from '../config';
import { hasSerialSession } from '../serial/eclipse';
import { boardAttached, createBoard, shutdownBoard } from '../usb/connection';

export function activate(context: vscode.ExtensionContext): MicrobitManagerApi {
	return activateHost(context, {
		entry: 'browser',
		commands: {
			[COMMANDS.connect]: connect,
			[COMMANDS.disconnect]: disconnect,
			[COMMANDS.openTerminal]: openTerminal,
		},
		start: createBoard,
		// A Web Serial terminal holds the board without this extension being connected
		// to it, and the menu has to offer a Disconnect that can say so.
		boardState: () =>
			boardAttached() ? 'connected' : hasSerialSession('webserial') ? 'held-by-terminal' : 'disconnected',
	});
}

/**
 * Awaited by VS Code, which is why the board is handed back here rather than
 * from a subscription: `dispose()` is synchronous and cannot see an asynchronous
 * disconnect through before the worker goes away.
 */
export function deactivate(): Promise<void> {
	return shutdownBoard();
}
