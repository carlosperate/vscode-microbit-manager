/**
 * The desktop entry point, and the one the web does not use. There is no WebUSB
 * here and no way to reach one: the workbench command that bridges the device
 * chooser is registered only by the web workbench, so a board is reached through
 * the drive it mounts instead.
 */
import type { MicrobitManagerApi } from '../../api';
import * as vscode from 'vscode';

import { activateHost } from '../activate';
import { pairingIsNotNeeded } from '../commands/board';
import { COMMANDS } from '../config';
import { createIdleStatusBar } from '../ui/statusbar';

export function activate(context: vscode.ExtensionContext): MicrobitManagerApi {
	return activateHost(context, {
		entry: 'node',
		commands: {
			// Hidden from the palette and the menu here, but every contributed command must resolve.
			[COMMANDS.connect]: pairingIsNotNeeded,
			[COMMANDS.disconnect]: pairingIsNotNeeded,
		},
		// No `boardAttached`, so the menu offers neither Connect nor Disconnect.
		start: (context) => context.subscriptions.push(createIdleStatusBar()),
	});
}

export function deactivate(): void {}
