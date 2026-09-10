import type { SerialFilter, SerialMonitorApi, SerialPortLike } from './types';

export type SerialSessionKey = 'webusb' | 'webserial' | 'simulator';

/**
 * Owns the opaque handles Eclipse returns without reaching into its terminal
 * map. One per key, not one in all: a board and the simulator are open at once,
 * and a single slot would forget the board's terminal and open a third. An open
 * in flight is shared, so two clicks before Eclipse answers still make one terminal.
 */
export class SerialSession {
	private readonly handles = new Map<SerialSessionKey, string>();
	private readonly opening = new Map<SerialSessionKey, Promise<boolean>>();

	public open(
		api: SerialMonitorApi,
		key: SerialSessionKey,
		portOrFilter?: SerialPortLike | SerialFilter,
		options?: SerialOptions,
		name?: string
	): Promise<boolean> {
		const inFlight = this.opening.get(key);
		if (inFlight) return inFlight;

		const opening = this.revealOrOpen(api, key, portOrFilter, options, name).finally(() => this.opening.delete(key));
		this.opening.set(key, opening);
		return opening;
	}

	private async revealOrOpen(
		api: SerialMonitorApi,
		key: SerialSessionKey,
		portOrFilter?: SerialPortLike | SerialFilter,
		options?: SerialOptions,
		name?: string
	): Promise<boolean> {
		const existing = this.handles.get(key);
		if (existing !== undefined && (await api.revealSerial(existing))) return true;

		this.handles.delete(key);
		const handle = await api.openSerial(portOrFilter, options, name);
		if (handle) this.handles.set(key, handle);
		return handle !== undefined;
	}

	/** Whether a terminal is open for this key, which is the only record that one exists. */
	public has(key: SerialSessionKey): boolean {
		return this.handles.has(key);
	}

	/**
	 * Shows the terminal for this key, and answers whether there was one. Nothing
	 * reports a terminal the user closed, so asking to reveal it is the only way to
	 * find out, and a handle that no longer resolves is dropped here.
	 */
	public async reveal(api: SerialMonitorApi, key: SerialSessionKey): Promise<boolean> {
		const handle = this.handles.get(key);
		if (handle === undefined) return false;
		if (await api.revealSerial(handle)) return true;
		this.handles.delete(key);
		return false;
	}

	/**
	 * Drops the handle without closing anything, because nothing here can: the
	 * companion's API opens, reveals, pauses and resumes, and never closes. Used
	 * when the device behind a terminal has gone, so the next open starts a new one
	 * rather than revealing a terminal pointing at nothing.
	 */
	public forget(key: SerialSessionKey): void {
		this.handles.delete(key);
	}

	public dispose(): void {
		this.handles.clear();
	}
}
