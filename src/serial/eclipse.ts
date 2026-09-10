import * as vscode from 'vscode';

import { SERIAL_MONITOR_EXTENSION } from '../config';
import { loadSerialMonitor, SerialMonitorError } from './provider';
import { SerialSession, type SerialSessionKey } from './session';
import type { SerialFilter, SerialMonitorApi, SerialPortLike } from './types';

export { SerialMonitorError } from './provider';

const OPEN_SERIAL_COMMAND = 'serial-monitor.openSerial';

const session = new SerialSession();

export function createSerialMonitor(context: vscode.ExtensionContext): void {
	context.subscriptions.push({
		dispose: () => session.dispose(),
	});
}

/** Whether a terminal of this kind is open, which is the only record that one is. */
export const hasSerialSession = (key: SerialSessionKey): boolean => session.has(key);

/** Drops the handle for a terminal whose device has gone. Nothing here can close one. */
export const forgetSerialSession = (key: SerialSessionKey): void => session.forget(key);

/**
 * Shows the terminal holding a port and answers whether there was one to show.
 * A companion that has gone means its terminals have too, so a failure to reach
 * it is an answer rather than something to report.
 */
export async function revealSerialSession(key: SerialSessionKey): Promise<boolean> {
	try {
		return await session.reveal(await serialMonitorApi(), key);
	} catch {
		session.forget(key);
		return false;
	}
}

export async function openEclipseSerial(
	key: SerialSessionKey,
	portOrFilter?: SerialPortLike | SerialFilter,
	options?: SerialOptions,
	name?: string
): Promise<boolean> {
	return session.open(await serialMonitorApi(), key, portOrFilter, options, name);
}

export async function openNativeSerial(commands: readonly string[]): Promise<boolean> {
	if (!commands.includes(OPEN_SERIAL_COMMAND)) {
		throw new SerialMonitorError('Install or enable the Eclipse Serial Monitor extension.');
	}

	return (await vscode.commands.executeCommand<string | undefined>(OPEN_SERIAL_COMMAND)) !== undefined;
}

async function serialMonitorApi(): Promise<SerialMonitorApi> {
	const extension = vscode.extensions.getExtension(SERIAL_MONITOR_EXTENSION);
	return loadSerialMonitor(
		extension
			? {
					version: String(extension.packageJSON?.version ?? ''),
					activate: () => extension.activate(),
				}
			: undefined
	);
}
