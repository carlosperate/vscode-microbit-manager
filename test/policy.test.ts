import { ConnectionStatus } from '@microbit/microbit-connection';
import { describe, expect, it } from 'vitest';

import {
	boardStillMissing,
	disconnectAction,
	isIdle,
	isLive,
	mayJoinAttempt,
	shouldRecover,
} from '../src/usb/policy';

describe('when a lost board is worth chasing', () => {
	/** A reset drops the device and brings it straight back, which is the case worth reconnecting for. */
	it('chases a board that was live and went away', () => {
		expect(shouldRecover(ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.Connected)).toBe(true);
		expect(shouldRecover(ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.Paused)).toBe(true);
	});

	/** Nothing was ever there, so there is nothing to come back and nothing to report. */
	it('leaves a session that never had one alone', () => {
		expect(shouldRecover(ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.NoAuthorizedDevice)).toBe(false);
		expect(shouldRecover(ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.Connecting)).toBe(false);
		expect(shouldRecover(ConnectionStatus.NoAuthorizedDevice, ConnectionStatus.Disconnected)).toBe(false);
	});

	/** Reaching any other status is the connection working, not a board going missing. */
	it('ignores every status that is not a board going missing', () => {
		for (const status of Object.values(ConnectionStatus)) {
			if (status === ConnectionStatus.NoAuthorizedDevice) continue;
			expect(shouldRecover(status, ConnectionStatus.Connected), status).toBe(false);
		}
	});
});

describe('what Disconnect does', () => {
	it('hands the board back when there is one', () => {
		expect(disconnectAction({ heldByTerminal: false, releasing: false, status: ConnectionStatus.Connected, connecting: false })).toBe('release');
	});

	it('says so when there is nothing connected', () => {
		expect(disconnectAction({ heldByTerminal: false, releasing: false, status: ConnectionStatus.NoAuthorizedDevice, connecting: false })).toBe(
			'nothing-connected'
		);
		expect(disconnectAction({ heldByTerminal: false, releasing: false, status: ConnectionStatus.Disconnected, connecting: false })).toBe('nothing-connected');
	});

	/**
	 * The connection goes on reporting `Connected` until a release finishes, so the
	 * status alone would start a second one over the top of the first.
	 */
	it('joins a release already running rather than starting another', () => {
		expect(disconnectAction({ heldByTerminal: false, status: ConnectionStatus.Connected, connecting:false, releasing: true })).toBe(
			'already-releasing'
		);
	});

	/** A connect in flight outranks it: that one cannot be called off at all. */
	it('answers for the connect first when both are in flight', () => {
		expect(disconnectAction({ heldByTerminal: false, status: ConnectionStatus.Connected, connecting:true, releasing: true })).toBe(
			'wait-for-connect'
		);
	});

	/**
	 * The Web Serial route: a terminal has the port and there is no connection of
	 * ours to release. It comes last, because a connection we can actually hand
	 * back outranks a port we never held.
	 */
	it('names the terminal when it is the only thing holding the board', () => {
		expect(
			disconnectAction({
				status: ConnectionStatus.NoAuthorizedDevice,
				connecting: false,
				releasing: false,
				heldByTerminal: true,
			})
		).toBe('held-by-terminal');
	});

	it('releases its own connection rather than pointing at a terminal', () => {
		expect(
			disconnectAction({
				status: ConnectionStatus.Connected,
				connecting: false,
				releasing: false,
				heldByTerminal: true,
			})
		).toBe('release');
	});

	/**
	 * The press that this replaced: a connect in flight reads as idle, because USB
	 * never reports `Connecting`, so a terminal holding the port must not swallow
	 * the promise to hand the board back once the chooser is done with.
	 */
	it('still promises the board back mid-connect while a terminal holds it', () => {
		expect(
			disconnectAction({
				status: ConnectionStatus.NoAuthorizedDevice,
				connecting: true,
				releasing: false,
				heldByTerminal: true,
			})
		).toBe('wait-for-connect');
	});

	/**
	 * The chooser belongs to the host's window and cannot be closed from here, so
	 * a connect in flight is promised back rather than appearing to do nothing.
	 */
	it('promises the board back rather than racing a connect', () => {
		expect(disconnectAction({ heldByTerminal: false, releasing: false, status: ConnectionStatus.NoAuthorizedDevice, connecting: true })).toBe(
			'wait-for-connect'
		);
		expect(disconnectAction({ heldByTerminal: false, releasing: false, status: ConnectionStatus.Connected, connecting: true })).toBe('wait-for-connect');
	});
});

describe('whether a lost board is still worth chasing once the settle has passed', () => {
	it('chases one that is still missing', () => {
		expect(boardStillMissing(ConnectionStatus.NoAuthorizedDevice)).toBe(true);
	});

	/** A reset that came back on its own, and there is nothing left to recover. */
	it('leaves one that answered again alone', () => {
		expect(boardStillMissing(ConnectionStatus.Connected)).toBe(false);
		expect(boardStillMissing(ConnectionStatus.Paused)).toBe(false);
	});

	/**
	 * The user asked for the board back during the settle. Reconnecting then claims
	 * a device nobody asked for, and undoes an explicit Disconnect a second later.
	 */
	it('leaves one the user handed back alone', () => {
		expect(boardStillMissing(ConnectionStatus.Disconnected)).toBe(false);
	});
});

describe('who may join the connect already running', () => {
	/**
	 * The case that matters: a board is unplugged, the silent retry starts, and the
	 * user presses Connect during it. Joining that attempt refuses them for a
	 * reason that was never theirs, and the refusal reads as a host that cannot
	 * pair at all.
	 */
	it('makes somebody who wants a chooser wait for a background attempt', () => {
		expect(mayJoinAttempt(false, true)).toBe(false);
	});

	it('joins an attempt already allowed to open one', () => {
		expect(mayJoinAttempt(true, true)).toBe(true);
	});

	/** A background attempt asks for nothing an existing one cannot already give it. */
	it('lets a background attempt join anything', () => {
		expect(mayJoinAttempt(true, false)).toBe(true);
		expect(mayJoinAttempt(false, false)).toBe(true);
	});
});

describe('the status sets', () => {
	/** Every status is one or the other or in flight; none may be both. */
	it('never call a status both live and idle', () => {
		for (const status of Object.values(ConnectionStatus)) {
			expect(isLive(status) && isIdle(status), status).toBe(false);
		}
	});

	it('leave Connecting outside both, since it is neither yet', () => {
		expect(isLive(ConnectionStatus.Connecting)).toBe(false);
		expect(isIdle(ConnectionStatus.Connecting)).toBe(false);
	});
});
