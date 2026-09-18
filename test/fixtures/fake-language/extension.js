/**
 * A stand-in language extension: it registers one menu group and nothing else,
 * so the status bar menu has a second group with no real one installed. Plain
 * CommonJS with no build step, loaded by both hosts from this folder.
 */
const vscode = require('vscode');

const MANAGER = 'carlosperate.bbcmicrobit-manager';

function activate(context) {
	const api = vscode.extensions.getExtension(MANAGER)?.exports;
	// Reported through the exports, which is how the integration tests read it.
	const status = { registered: false, error: undefined };

	try {
		context.subscriptions.push(
			api.registerMenuGroup({ label: 'Fake', commands: [{ command: 'fake-language.flash', label: 'Flash (fake)' }] })
		);
		status.registered = true;
	} catch (error) {
		status.error = String(error);
	}

	context.subscriptions.push(
		// What a real Flash does: ask which board, build for it, hand the bytes over.
		vscode.commands.registerCommand('fake-language.flash', async () => {
			const board = await api?.connect();
			if (board) await api.flashHex(':00000001FF\n', { expect: board });
		})
	);

	return status;
}

module.exports = { activate, deactivate() {} };
