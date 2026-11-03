import 'fake-indexeddb/auto'

// Dexie はブラウザ前提なので、Node では structuredClone が必要
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
}
