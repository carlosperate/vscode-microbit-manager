/**
 * A mode with no board buttons at all, standing in for an editor-configuration
 * mode. It proves the manager draws nothing into a mode's panel that the mode
 * did not put there.
 */
const vscode = require('vscode');

const MANAGER = 'carlosperate.bbcmicrobit-manager';

async function activate(context) {
	const manager = vscode.extensions.getExtension(MANAGER);
	const api = manager && (manager.isActive ? manager.exports : await manager.activate());
	const status = { registered: false, error: undefined };

	if (!api) {
		status.error = `${MANAGER} is not installed`;
	} else {
		try {
			context.subscriptions.push(
				api.registerMode({
					apiVersion: '0.1.0',
					id: 'plain',
					extensionId: 'bbcmicrobit-test.fake-mode-plain',
					label: 'Plain',
				})
			);
			status.registered = true;
		} catch (error) {
			status.error = String(error);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('fake-mode-plain.hello', () =>
			vscode.window.showInformationMessage('Plain Mode: hello from a mode that never touches a board.')
		),
		vscode.window.registerTreeDataProvider('fake-mode-plain.panel', {
			getChildren: () => [],
			getTreeItem: (item) => item,
		})
	);

	return status;
}

module.exports = { activate, deactivate() {} };
