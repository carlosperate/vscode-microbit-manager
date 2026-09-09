/**
 * What `carlosperate.bbcmicrobit-manager` returns from `activate()`, reached
 * through `vscode.extensions.getExtension(...)?.exports`. Types only: a value
 * exported from here would end up in a dependent's bundle, and this package is
 * the contract rather than an implementation of it.
 */
export interface MicrobitManagerApi {
	/** Semver. Major for a breaking change, minor for an addition, patch for a fix. */
	readonly version: string;
}
