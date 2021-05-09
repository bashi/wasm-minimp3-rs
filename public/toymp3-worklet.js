class Wasm {
  constructor(module, instance) {
    this.module = module;
    this.instance = instance;

    this.mp3DataPtr = 0;
    this.mp3DataSize = 0;

    this.leftChannelPtr = 0;
    this.leftChannel = null;
    this.rightChannelPtr = 0;
    this.rightChannel = null;

    this.decoder = this.instance.exports.create_decoder();
  }

  destroy() {
    this.instance.exports.destroy_decoder(this.decoder);
  }

  setMp3Data(src) {
    if (this.mp3DataSize > 0) {
      this.instance.exports.free(this.mp3DataPtr, this.mp3DataSize);
    }

    const size = src.byteLength;
    const ptr = this.instance.exports.malloc(size);
    const dest = new Uint8Array(this.instance.exports.memory.buffer, ptr, size);
    dest.set(src);
    this.mp3DataPtr = ptr;
    this.mp3DataSize = size;
    this.instance.exports.set_mp3_data(this.decoder, ptr, size);

    // Creating channel buffers here since we unlikely allocate memory after
    // setting MP3 data.
    this.leftChannelPtr = this.instance.exports.left_channel(this.decoder);
    this.leftChannel = new Float32Array(
      this.instance.exports.memory.buffer,
      this.leftChannelPtr,
      128
    );
    this.rightChannelPtr = this.instance.exports.right_channel(this.decoder);
    this.rightChannel = new Float32Array(
      this.instance.exports.memory.buffer,
      this.rightChannelPtr,
      128
    );
  }

  process(left, right) {
    const filled = this.instance.exports.process(this.decoder);
    left.set(this.leftChannel.subarray(0, filled));
    right.set(this.rightChannel.subarray(0, filled));
    return filled;
  }
}

class ToyMp3WorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.consumedAllData = false;
    this.port.onmessage = (e) => this.handleMessage(e);
  }

  // AudioWorkletProcessor method:
  process(inputs, outputs, parameters) {
    if (!this.wasm || !this.wasm.mp3DataSize || this.consumedAllData) {
      return true;
    }

    const left = outputs[0][0];
    const right = outputs[0][1];

    const filled = this.wasm.process(left, right);
    if (filled === 0) {
      this.consumedAllData = true;
      this.sendEvent("consumedAllData");
    }

    return true;
  }

  handleMessage(event) {
    switch (event.data.name) {
      case "loadWasm":
        this.loadWasm(event.data.messageId, event.data.wasmBinary);
        break;
      case "setMp3Data":
        this.setMp3Data(event.data.messageId, event.data.mp3Data);
        break;
      default:
        console.error("Unknown message", event.data);
    }
  }

  sendMessageReply(name, messageId, args) {
    const message = Object.assign({ name, messageId }, args);
    this.port.postMessage(message);
  }

  sendEvent(name, args) {
    const message = Object.assign({ name }, args);
    this.port.postMessage(message);
  }

  async loadWasm(messageId, wasmBinary) {
    const { module, instance } = await WebAssembly.instantiate(wasmBinary);
    this.wasm = new Wasm(module, instance);
    this.sendMessageReply("wasmLoaded", messageId);
  }

  async setMp3Data(messageId, mp3Data) {
    if (!this.wasm) {
      console.error("Wasm not loaded");
      return;
    }
    this.wasm.setMp3Data(mp3Data);
    this.consumedAllData = false;
    this.sendMessageReply("mp3DataSet", messageId);
  }
}

registerProcessor("toymp3-worklet-processor", ToyMp3WorkletProcessor);
