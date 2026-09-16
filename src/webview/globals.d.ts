/** The one thing a webview document gets from its host, over the message channel. */
declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

/** A stylesheet import is for esbuild, which writes the file beside the script; TypeScript only has to allow it. */
declare module '*.css';
