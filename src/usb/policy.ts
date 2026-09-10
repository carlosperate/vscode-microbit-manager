/**
 * The decisions the connection makes, with no board and no `vscode` behind
 * them. The adapter beside this holds the library's connection and does the
 * talking; what it is allowed to do, and when, is decided here so it can be
 * tested without a device.
 */
import { ConnectionStatus } from '@microbit/microbit-connection';

/** The statuses a board was reachable in, so losing one is worth reacting to. */
export const LIVE: readonly ConnectionStatus[] = [ConnectionStatus.Connected, ConnectionStatus.Paused];

/** The statuses with nothing to disconnect from. */
export const IDLE: readonly ConnectionStatus[] = [ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.Disconnected];

export const isLive = (status: ConnectionStatus): boolean => LIVE.includes(status);
export const isIdle = (status: ConnectionStatus): boolean => IDLE.includes(status);

/**
 * Whether a board that has gone quiet is worth chasing. Only a live board going
 * to `NoAuthorizedDevice` is a board that went away; the same status reached any
 * other way is a session that never had one.
 */
export const shouldRecover = (status: ConnectionStatus, previousStatus: ConnectionStatus): boolean =>
	status === ConnectionStatus.NoAuthorizedDevice && isLive(previousStatus);

/**
 * Whether a caller can take over the connect already running rather than waiting
 * for it. One attempt at a time is what stops two wrappers fighting over one
 * device, but an attempt carries the terms of whoever started it: a background
 * one may not open a chooser, so a user who asked for one and joined it would be
 * refused on terms they never asked for, and told this host cannot pair at all.
 */
export const mayJoinAttempt = (attemptMayPair: boolean, wantsToPair: boolean): boolean =>
	attemptMayPair || !wantsToPair;

/**
 * Whether a board that went quiet is still missing by the time the settle has
 * passed. A connection reports `Connected` again if it came back on its own, and
 * `Disconnected` if the user asked for it back, and neither is worth chasing.
 */
export const boardStillMissing = (status: ConnectionStatus): boolean =>
	status === ConnectionStatus.NoAuthorizedDevice;

/** What Disconnect can do, given what is happening. Each answer is worded by the adapter. */
export type DisconnectAction = 'nothing-connected' | 'wait-for-connect' | 'already-releasing' | 'release';

/**
 * A connect in flight cannot be called off, because the chooser is the host's
 * own window, so the only honest answer is to promise the board back once it
 * finishes rather than to appear to do nothing. A release in flight is the same
 * request already running: the connection goes on reporting `Connected` until it
 * finishes, so the status alone would start a second one.
 */
export function disconnectAction(state: {
	status: ConnectionStatus;
	connecting: boolean;
	releasing: boolean;
}): DisconnectAction {
	if (state.connecting) return 'wait-for-connect';
	if (state.releasing) return 'already-releasing';
	return isIdle(state.status) ? 'nothing-connected' : 'release';
}
