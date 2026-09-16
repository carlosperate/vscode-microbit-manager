/**
 * The compatibility rule between the API this extension serves and the one a
 * mode was built against. About fifteen lines, which is why it is not a
 * dependency.
 */
export interface Semver {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

/** Strict `major.minor.patch`, no prerelease tags: the API has never needed one and a mode should not declare one. */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemver(text: unknown): Semver | undefined {
	if (typeof text !== 'string') return undefined;
	const match = SEMVER.exec(text);
	if (!match) return undefined;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Negative when `a` is older, zero when equal, positive when newer. */
export function compareSemver(a: Semver, b: Semver): number {
	return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Whether an API at `served` can serve a mode that needs `wanted`: the same
 * major, and at or above it. Additions raise the minor, so an old mode against a
 * new manager, which is the pairing every user has, passes.
 */
export function serves(served: Semver, wanted: Semver): boolean {
	return served.major === wanted.major && compareSemver(served, wanted) >= 0;
}

/** Which extension a refused pairing wants updated: the one that is behind. */
export type Behind = 'manager' | 'mode';

export const whoIsBehind = (served: Semver, wanted: Semver): Behind =>
	compareSemver(served, wanted) < 0 ? 'manager' : 'mode';
