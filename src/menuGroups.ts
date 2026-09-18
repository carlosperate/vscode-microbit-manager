/**
 * The menu groups other extensions register for the status bar menu. Pure.
 * Checked rather than trusted: a group comes from another extension, and a bad
 * shape would otherwise throw later inside this one, blamed on it.
 */
import type { MenuGroup, Sidebar } from '../api';

export function describeInvalid(candidate: unknown): string | undefined {
	if (typeof candidate !== 'object' || candidate === null) return `a menu group must be an object, not ${typeof candidate}`;
	const { label, commands, sidebar } = candidate as Record<string, unknown>;
	if (!filled(label)) return '`label` must be a non-empty string';
	if (!Array.isArray(commands) || !commands.every(isCommand)) {
		return '`commands` must be a list of { command, label }, both non-empty strings';
	}
	if (sidebar !== undefined && !isSidebar(sidebar)) {
		return '`sidebar` must be { container, views }: a container id of letters, digits, `-` and `_`, and at least one view id';
	}
	return undefined;
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

// A blank label is a row that looks dead, and a blank command is one that is.
const isCommand = (entry: unknown): boolean =>
	typeof entry === 'object' &&
	entry !== null &&
	filled((entry as { command?: unknown }).command) &&
	filled((entry as { label?: unknown }).label);

// The workbench's own schema for a container id; any other id moves nothing, in silence.
const CONTAINER_PATTERN = /^[a-z0-9_-]+$/i;

const isSidebar = (value: unknown): boolean => {
	if (typeof value !== 'object' || value === null) return false;
	const { container, views } = value as Record<string, unknown>;
	return (
		typeof container === 'string' &&
		CONTAINER_PATTERN.test(container) &&
		Array.isArray(views) &&
		views.length > 0 &&
		views.every(filled)
	);
};

export class MenuGroups {
	private readonly groups = new Set<MenuGroup>();

	register(candidate: unknown): () => void {
		const wrong = describeInvalid(candidate);
		if (wrong) throw new TypeError(`registerMenuGroup: ${wrong}`);
		// A copy, so the caller changing its object later cannot break the menu.
		const { label, commands, sidebar } = candidate as MenuGroup;
		const group: MenuGroup = {
			label,
			commands: commands.map(({ command, label }) => ({ command, label })),
			...(sidebar && { sidebar: { container: sidebar.container, views: [...sidebar.views] } }),
		};
		this.groups.add(group);
		return () => this.groups.delete(group);
	}

	/** By label in code unit order, so the menu is the same whatever order the extensions activated in. */
	list(): MenuGroup[] {
		return [...this.groups].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
	}

	sidebars(): Sidebar[] {
		return this.list().flatMap((group) => (group.sidebar ? [group.sidebar] : []));
	}
}
