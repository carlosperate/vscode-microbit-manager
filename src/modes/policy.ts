/**
 * Which mode is active, and whether to say the workspace looks like another
 * one. Pure, and the whole of the reasoning: `state.ts` only supplies the facts.
 */

/** How many modes are registered decides what the panel is. */
export type Shape = 'none' | 'one' | 'many';

export const shapeOf = (registered: number): Shape => (registered === 0 ? 'none' : registered === 1 ? 'one' : 'many');

export interface Situation {
	/** Every registered mode id, in any order. */
	readonly registered: readonly string[];
	/** What the user picked in this workspace, if they ever did. */
	readonly chosen: string | undefined;
	/** The modes whose `claimsWorkspace` answered true. */
	readonly claimants: readonly string[];
	/** The mode that was active most recently, in any window. */
	readonly lastUsed: string | undefined;
}

/** Why a mode is the active one, which decides whether it is worth coming back to. */
export type Because = 'chosen' | 'claim' | 'last-used' | 'lowest-id';

export interface Pick {
	readonly id: string;
	readonly because: Because;
}

/**
 * The user's pick wins for as long as it is registered. Until they pick, exactly
 * one claimant is the mode; none or several falls back to the last used, then to
 * the lowest id. Never registration order: that is activation order, which the
 * workbench does not promise and which differs between a cold start and a
 * reload, so two users with the same extensions would land in different modes.
 */
export function pickMode({ registered, chosen, claimants, lastUsed }: Situation): Pick | undefined {
	if (registered.length === 0) return undefined;
	if (chosen !== undefined && registered.includes(chosen)) return { id: chosen, because: 'chosen' };

	const [claiming, ...others] = claimants.filter((id) => registered.includes(id));
	if (claiming !== undefined && others.length === 0) return { id: claiming, because: 'claim' };

	if (lastUsed !== undefined && registered.includes(lastUsed)) return { id: lastUsed, because: 'last-used' };
	const fallback = lowest(registered);
	return fallback === undefined ? undefined : { id: fallback, because: 'lowest-id' };
}

/**
 * Whether a pick becomes the last used. Only a mode active for a reason of its
 * own: the lowest id is nobody's choice, and remembering it would make a cold
 * start depend on which mode registered first. A claim counts only once every
 * claim has answered: while one is pending, the lone claimant may be lone only
 * because the other has not answered yet, and remembering it would make the
 * fallback depend on which promise settled first.
 */
export const worthRemembering = ({ because }: Pick, claimsPending = false): boolean =>
	because === 'chosen' || (because === 'claim' && !claimsPending);

/**
 * The mode to offer a switch to: the one claimant, when it is not the active one.
 * Nothing with fewer than two registered, since there is nothing to switch to,
 * and nothing with several claimants, since none of them is the answer.
 */
export function nudgeFor(
	registered: readonly string[],
	active: string | undefined,
	claimants: readonly string[]
): string | undefined {
	if (registered.length < 2) return undefined;
	const claiming = claimants.filter((id) => registered.includes(id));
	if (claiming.length !== 1) return undefined;
	return claiming[0] === active ? undefined : claiming[0];
}

/** Code unit order, which is arbitrary and identical everywhere. */
const lowest = (ids: readonly string[]): string | undefined => [...ids].sort()[0];
