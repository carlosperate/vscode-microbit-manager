import * as vscode from 'vscode';

import { log } from './log';

/** Fire and forget: a same-value set fires no change in the workbench, and a failure is logged, never thrown at the caller. */
export function setContext(key: string, value: unknown): void {
	void vscode.commands
		.executeCommand('setContext', key, value)
		.then(undefined, (error: unknown) => log(`Could not set ${key}: ${String(error)}`));
}
