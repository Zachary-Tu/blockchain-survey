/* global Stockfish */
/* Fairy-Stockfish browser host. Upstream source: https://github.com/fairy-stockfish/fairy-stockfish.wasm */
const ENGINE_BASE = "/tim-classroom/xiangqi/engine/";
let engine = null;
let failed = null;
const queued = [];

function send(command) {
  if (engine) engine.postMessage(command);
  else queued.push(command);
}

try {
  importScripts(`${ENGINE_BASE}stockfish.js`);
  Stockfish({
    locateFile: (file) => `${ENGINE_BASE}${file}`,
    mainScriptUrlOrBlob: `${ENGINE_BASE}stockfish.js`,
  }).then((instance) => {
    engine = instance;
    engine.addMessageListener((line) => self.postMessage({ type: "line", line }));
    self.postMessage({ type: "host-ready" });
    while (queued.length) engine.postMessage(queued.shift());
  }).catch((error) => {
    failed = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "host-error", error: failed });
  });
} catch (error) {
  failed = error instanceof Error ? error.message : String(error);
  self.postMessage({ type: "host-error", error: failed });
}

self.onmessage = (event) => {
  if (failed) {
    self.postMessage({ type: "host-error", error: failed });
    return;
  }
  if (typeof event.data?.command === "string") send(event.data.command);
};
