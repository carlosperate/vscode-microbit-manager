import * as vscode from 'vscode';

/** Opens an extension's own page, which is where a user updates or installs it. One command for every "Show Extension" button here. */
export const openExtensionPage = (id: string): Thenable<unknown> => vscode.commands.executeCommand('extension.open', id);
