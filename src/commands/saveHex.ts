/**
 * A hex on disk, which is the whole product wherever a board cannot be reached:
 * Firefox, Safari, and any machine whose drive search found nothing. One
 * implementation of the FAT16 naming rules, on the side that writes files.
 */
import type { HexSource } from '../../api';
import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { hexFilename } from '../filename';
import { log } from '../log';

/**
 * `showSaveDialog` is the one mechanism on every host: a native panel on the
 * desktop, and VS Code's own quick-pick dialog in a browser, which writes
 * through `workspace.fs` to a workspace backed entirely by virtual providers.
 */
export async function saveHex(hex: HexSource, baseName: string): Promise<boolean> {
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
	const suggestion = hexFilename(baseName);
	const target = await vscode.window.showSaveDialog({
		defaultUri: folder ? vscode.Uri.joinPath(folder, suggestion) : undefined,
		saveLabel: 'Save Hex',
		filters: { 'micro:bit hex': ['hex'] },
	});

	// Silent to the user, logged so it can be told from a save that broke.
	if (!target) {
		log('The save was dismissed, and nothing was written');
		return false;
	}

	// A path where there is one, and the whole URI where the scheme is the clue.
	const where = target.scheme === 'file' ? target.fsPath : target.toString();
	try {
		await vscode.workspace.fs.writeFile(target, typeof hex === 'string' ? new TextEncoder().encode(hex) : hex);
	} catch (error) {
		// A `FileSystemError` repeats its name and path, burying the readable part.
		log(`Could not write ${target.toString()}: ${String(error)}`);
		void vscode.window.showErrorMessage(`${PRODUCT}: the hex could not be written to ${where}. Try somewhere else.`);
		return false;
	}

	log(`Saved to ${where}`);
	void vscode.window.showInformationMessage(`${PRODUCT}: saved the hex to ${where}. ${nextStep(target)}`);
	return true;
}

/**
 * A browser workspace is virtual, so the file just written is somewhere the
 * operating system cannot see and cannot copy to a board. VS Code's own Explorer
 * download is what gets it out, and saying so is the difference between a file a
 * learner can use and one they can only look at.
 */
const nextStep = (uri: vscode.Uri) =>
	uri.scheme === 'file'
		? 'Drag it onto the MICROBIT drive to run it on the board.'
		: 'Right-click it in the Explorer to download it, then drag it onto the MICROBIT drive.';
