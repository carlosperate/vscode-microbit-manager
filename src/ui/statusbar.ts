import * as vscode from 'vscode';

import { COMMANDS, PRODUCT } from '../config';

/**
 * Unconditional, because there is always something behind it: this extension
 * flashes a hex and opens a serial terminal with nothing else installed. It
 * always opens the menu, whatever it currently reads, since a control that runs
 * a different command depending on its own text is one users learn to distrust.
 */
export function createStatusBar(): vscode.StatusBarItem {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	item.name = PRODUCT;
	item.command = COMMANDS.showMenu;
	item.text = '$(circuit-board) micro:bit';
	item.tooltip = `${PRODUCT}: what to do with a micro:bit`;
	item.show();
	return item;
}
