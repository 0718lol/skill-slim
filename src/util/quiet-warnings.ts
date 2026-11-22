/**
 * node:sqlite prints an ExperimentalWarning on first import, which lands in
 * every CLI run and looks like an error. Imported first by the CLI so the
 * filter is installed before any module pulls node:sqlite in; every other
 * warning still prints as usual.
 */
const defaultListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && /SQLite/i.test(warning.message)) return;
  for (const listener of defaultListeners) listener(warning);
});

export {};
