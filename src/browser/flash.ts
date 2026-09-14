/**
 * The board half of the API on the web, where a hex goes over WebUSB to a board
 * that has been authorised through the chooser.
 */
import type { BoardInfo, HexSource } from '../../api';
import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { imageFor } from '../hex/universal';
import { createProgress } from '../ui/progress';
import {
	boardSerialNumber,
	boardVersion,
	connectBoard,
	flashBoard,
	type ExpectedBoard,
} from '../usb/connection';

export function board(): BoardInfo | undefined {
	const version = boardVersion();
	return version ? { version, serialNumber: boardSerialNumber() } : undefined;
}

export async function connect(): Promise<BoardInfo | undefined> {
	if (!(await connectBoard())) return undefined;

	const attached = board();
	// The version is what a hex is chosen with, so a board that answers without one
	// cannot be flashed, and silence here is a button that appears to do nothing.
	if (!attached) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: connected to a micro:bit but not which model it is. Unplug it, plug it back in, and connect again.`
		);
	}
	return attached;
}

/**
 * Connects first where nothing is, so a mode that already knows its board can
 * pass it as `expect` and have it re-checked against what actually answers.
 */
export async function flashHex(hex: HexSource, options?: { expect?: BoardInfo }): Promise<boolean> {
	const attached = board() ?? (await connect());
	if (!attached) return false;

	const expected: ExpectedBoard = options?.expect ?? attached;
	const text = typeof hex === 'string' ? hex : new TextDecoder().decode(hex);

	// Chosen here, never inside the data callback: the library asks for data only
	// once the target is halted, and a hex with nothing for this board leaves it there.
	const image = imageFor(text, expected.version);
	if (!image) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: that hex file has no program for a micro:bit ${expected.version}.`
		);
		return false;
	}

	// No title: VS Code joins one to every message with `: `, and each step is
	// already a whole sentence that names the product.
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, cancellable: false },
		(progress) => {
			const step = createProgress(expected.version);
			return flashBoard(
				expected,
				() => Promise.resolve(image),
				(stage, percentage) => progress.report(step(stage, percentage))
			);
		}
	);
}
