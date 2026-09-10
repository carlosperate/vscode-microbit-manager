import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { hasSerialSession } from '../serial/eclipse';
import { connectBoard, disconnectBoard } from '../usb/connection';

/**
 * Pair a micro:bit if none is authorised yet, then connect to it. Every failure
 * has been reported by the time this returns, or was a cancellation that needs
 * no reporting, so a success is the only thing left to say.
 */
export async function connect(): Promise<void> {
	if (await connectBoard()) void vscode.window.showInformationMessage(`${PRODUCT}: the micro:bit is connected.`);
}

/**
 * Hands the board back, so another window or the MICROBIT drive can have it.
 *
 * A Web Serial terminal is the exception: the port belongs to the companion that
 * opened it, whose API can open, reveal, pause and resume a terminal but never
 * close one. Saying nothing is connected there would be untrue in front of a
 * terminal that is plainly talking to a board, so it names what holds it.
 */
export async function disconnect(): Promise<void> {
	await disconnectBoard(hasSerialSession('webserial'));
}

/**
 * The answer on a host with no device chooser to open. Both commands are hidden
 * from the palette there, and every contributed command must still resolve.
 */
export async function pairingIsNotNeeded(): Promise<void> {
	void vscode.window.showInformationMessage(
		`${PRODUCT}: desktop VS Code does not need to connect to a micro:bit first. It reaches the board through the ` +
			'MICROBIT drive it mounts.'
	);
}
