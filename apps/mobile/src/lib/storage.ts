import 'expo-sqlite/localStorage/install';

/** Persistent key-value storage. Native uses SQLite-backed localStorage. */
export const storage: Storage = globalThis.localStorage;
