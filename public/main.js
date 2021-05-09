const MESSAGE_TIMEOUT_MS = 5000;

class ToyMp3WorkletNode extends AudioWorkletNode {
  constructor(audioCtx) {
    const options = {
      outputChannelCount: [2],
    };
    super(audioCtx, "toymp3-worklet-processor", options);
    this.port.onmessage = (e) => this.handleMessage(e);

    this.nextMessageId = 1;
    this.inflightMessages = new Map();
  }

  handleMessage(event) {
    const data = event.data;

    if (data.messageId) {
      this.handleReply(data);
    } else {
      this.handleEvent(data);
    }
  }

  handleReply(data) {
    const { resolve, timeout } = this.inflightMessages.get(data.messageId);
    this.inflightMessages.delete(data.messageId);
    clearTimeout(timeout);
    switch (data.name) {
      case "wasmLoaded":
      case "mp3DataSet":
        resolve();
        break;
      default:
        console.error("Unknown message", data);
    }
  }

  handleEvent(data) {
    console.log("Received event from audio worklet", data);
  }

  async sendMessageToWorklet(name, args) {
    return new Promise((resolve, reject) => {
      const messageId = this.nextMessageId++;
      const message = Object.assign({ name, messageId }, args);
      this.port.postMessage(message);
      const timeout = setTimeout((_) => {
        this.inflightMessages.delete(messageId);
        reject(`${name} (mesageId=${messageId}) timed out`);
      }, MESSAGE_TIMEOUT_MS);
      this.inflightMessages.set(messageId, {
        resolve: resolve,
        timeout: timeout,
      });
    });
  }

  async loadWasm(wasmBinary) {
    return this.sendMessageToWorklet("loadWasm", { wasmBinary });
  }

  async setMp3Data(mp3Data) {
    return this.sendMessageToWorklet("setMp3Data", { mp3Data });
  }
}

class App {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.workletNode = null;

    this.toggleButtonEl = document.getElementById("toggle-play-button");
    this.toggleButtonEl.addEventListener("click", (_) => this.toggle());

    audioCtx.onstatechange = (_) => this.handleAudioStateChange();
  }

  async init() {
    this.wasmBinary = await fetch("decoder.wasm").then((res) =>
      res.arrayBuffer()
    );

    await this.audioCtx.audioWorklet.addModule("toymp3-worklet.js");

    this.workletNode = new ToyMp3WorkletNode(this.audioCtx);
    this.gainNode = new GainNode(this.audioCtx, { gain: 0.4 });
    this.workletNode.connect(this.gainNode).connect(this.audioCtx.destination);

    await this.workletNode.loadWasm(this.wasmBinary);
  }

  async playUrl(url) {
    const mp3Data = await fetch(url)
      .then((res) => res.arrayBuffer())
      .then((arr) => new Uint8Array(arr));
    this.play(mp3Data);
  }

  async play(mp3Data) {
    this.workletNode.setMp3Data(mp3Data);
    this.toggleButtonEl.disabled = false;
    this.audioCtx.resume();
  }

  toggle() {
    if (this.audioCtx.state === "running") {
      this.audioCtx.suspend();
    } else {
      this.audioCtx.resume();
    }
  }

  handleAudioStateChange() {
    if (this.audioCtx.state === "running") {
      this.toggleButtonEl.innerHTML = "pause_circle_outline";
    } else {
      this.toggleButtonEl.innerHTML = "play_circle_outline";
    }
  }
}

async function fileToUint8Array(file) {
  const reader = new FileReader();
  const promise = new Promise((resolve, reject) => {
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
  });
  reader.readAsArrayBuffer(file);
  const buf = await promise;
  return new Uint8Array(buf);
}

function setupDragAndDrop(el) {
  const prevent = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  el.addEventListener("dragenter", prevent);
  el.addEventListener("dragover", prevent);
  el.addEventListener("dragleave", prevent);
  el.addEventListener("drop", async (e) => {
    prevent(e);
    if (e.dataTransfer.files.length === 1) {
      const file = e.dataTransfer.files[0];
      await ensureApp();
      const mp3Data = await fileToUint8Array(file);
      await app.play(mp3Data);
    }
  });
}

let app = null;
async function ensureApp() {
  if (app) return;
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  // Explicitly resume() since Safari requires it.
  audioCtx.resume();
  app = new App(audioCtx);
  await app.init();

  // For debugging.
  window.app = app;
}

function start() {
  const appEl = document.getElementById("app");
  setupDragAndDrop(appEl);

  const playUrlButton = document.getElementById("play-url-button");
  playUrlButton.addEventListener("click", async (_) => {
    await ensureApp();
    const url = document.getElementById("mp3-url").value;
    await app.playUrl(url);
  });
}

document.addEventListener("DOMContentLoaded", (_) => start());
