/**
 * Where the micro:bit views sit, through the workbench's own `vscode.moveViews`,
 * which is what a drag does. Hide undoes a Combine first: with this view hidden
 * and others left in its container, VS Code shows it under the first of them.
 */
import * as vscode from 'vscode';

import { COMBINED_STATE, CONTAINER_ID, PANEL_HIDDEN_STATE, PRODUCT } from '../config';
import { setContext } from '../context';
import { log } from '../log';
import type { MenuGroups } from '../menuGroups';

const container = (id: string) => `workbench.view.extension.${id}`;

const move = (viewIds: readonly string[], destination: string) =>
	vscode.commands.executeCommand('vscode.moveViews', { viewIds, destinationId: container(destination) });

export function createLayoutCommands(context: vscode.ExtensionContext, groups: MenuGroups) {
	// Awaited, so a view gated on the key is back before its container is opened.
	const remember = async (key: string, value: boolean) => {
		await vscode.commands.executeCommand('setContext', key, value);
		await context.globalState.update(key, value).then(undefined, (error: unknown) => log(`Could not store ${key}: ${String(error)}`));
	};
	for (const key of [COMBINED_STATE, PANEL_HIDDEN_STATE]) setContext(key, context.globalState.get<boolean>(key, false));

	// Hidden everywhere while nothing registered a sidebar, but a keybinding still reaches it.
	const nothingToMove = () =>
		void vscode.window.showInformationMessage(`${PRODUCT}: no other micro:bit extension has a sidebar to move.`);

	const panelHidden = () => context.globalState.get<boolean>(PANEL_HIDDEN_STATE, false);
	const combined = () => context.globalState.get<boolean>(COMBINED_STATE, false);

	const sendHome = async () => {
		for (const sidebar of groups.sidebars()) await move(sidebar.views, sidebar.container);
		await remember(COMBINED_STATE, false);
	};

	return {
		combine: async () => {
			const views = groups.sidebars().flatMap((sidebar) => sidebar.views);
			if (views.length === 0) return nothingToMove();
			await remember(PANEL_HIDDEN_STATE, false);
			await move(views, CONTAINER_ID);
			await remember(COMBINED_STATE, true);
		},
		separate: async () => {
			if (groups.sidebars().length === 0) return nothingToMove();
			await sendHome();
			// Each move opens its destination, so end where the user pressed the button.
			if (!panelHidden()) await vscode.commands.executeCommand(container(CONTAINER_ID));
		},
		hidePanel: async () => {
			// Only what Combine moved: a view the user placed themselves stays where they put it.
			if (combined()) await sendHome();
			await remember(PANEL_HIDDEN_STATE, true);
			void vscode.window.showInformationMessage(
				`${PRODUCT}: the panel is hidden. Show it again from the micro:bit menu in the status bar.`
			);
		},
		showPanel: async () => {
			await remember(PANEL_HIDDEN_STATE, false);
			await vscode.commands.executeCommand(container(CONTAINER_ID));
		},
		panelHidden,
	};
}
