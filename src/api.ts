import type { MicrobitManagerApi } from '../api';

/**
 * The API version, which is the version of the types package and not of this
 * extension. A mode declares the lowest one it works against, so this number
 * moves when the contract does and stays put when only the extension ships.
 */
export const API_VERSION = '0.1.0';

/** `import type` above, so nothing from the types package survives compilation. */
export const createApi = (): MicrobitManagerApi => ({ version: API_VERSION });
