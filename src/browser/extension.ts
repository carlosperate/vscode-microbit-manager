/**
 * The web entry point, and the one desktop does not use. A board is reached over
 * WebUSB here, which needs the workbench to bridge a device chooser that only
 * the web workbench registers.
 */
import type { MicrobitManagerApi } from '../../api';
import type * as vscode from 'vscode';

import { activateHost } from '../activate';

export function activate(context: vscode.ExtensionContext): MicrobitManagerApi {
	return activateHost(context, { entry: 'browser', commands: {} });
}

export function deactivate(): void {}
