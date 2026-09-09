/**
 * The desktop entry point, and the one the web does not use. There is no WebUSB
 * here and no way to reach one: the workbench command that bridges the device
 * chooser is registered only by the web workbench, so a board is reached through
 * the drive it mounts instead.
 */
import type { MicrobitManagerApi } from '../../api';
import type * as vscode from 'vscode';

import { activateHost } from '../activate';

export function activate(context: vscode.ExtensionContext): MicrobitManagerApi {
	return activateHost(context, { entry: 'node', commands: {} });
}

export function deactivate(): void {}
