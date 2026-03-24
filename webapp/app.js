const state = {
  uiState: "idle",
  permission: "unknown",
  stream: null,
  audioContext: null,
  sourceNode: null,
  processorNode: null,
  chunks: [],
  isRecording: false,
  recordingStartedAt: 0,
  recordingTimerId: null,
  sampleRate: null,
  latestBlob: null,
  latestObjectUrl: null,
  isUploading: false,
};

const els = {
  pushToTalk: document.querySelector("#pushToTalk"),
  statusBadge: document.querySelector("#statusBadge"),
  statusText: document.querySelector("#statusText"),
  permissionValue: document.querySelector("#permissionValue"),
  stateValue: document.querySelector("#stateValue"),
  durationValue: document.querySelector("#durationValue"),
  sampleRateValue: document.querySelector("#sampleRateValue"),
  formatValue: document.querySelector("#formatValue"),
  bytesValue: document.querySelector("#bytesValue"),
  channelsValue: document.querySelector("#channelsValue"),
  readyValue: document.querySelector("#readyValue"),
  audioPreview: document.querySelector("#audioPreview"),
  downloadLink: document.querySelector("#downloadLink"),
  serverUrl: document.querySelector("#serverUrl"),
  uploadButton: document.querySelector("#uploadButton"),
  serverResponse: document.querySelector("#serverResponse"),
  eventLog: document.querySelector("#eventLog"),
  clearLog: document.querySelector("#clearLog"),
};

function setUiState(nextState, detail) {
  state.uiState = nextState;
  els.stateValue.textContent = nextState;

  const badge = els.statusBadge;
  badge.className = "badge";

  switch (nextState) {
    case "recording":
      badge.classList.add("recording");
      badge.textContent = "Recording";
      els.pushToTalk.classList.add("is-recording");
      break;
    case "ready":
      badge.classList.add("ready");
      badge.textContent = "Ready";
      els.pushToTalk.classList.remove("is-recording");
      break;
    case "error":
      badge.classList.add("error");
      badge.textContent = "Error";
      els.pushToTalk.classList.remove("is-recording");
      break;
    default:
      badge.textContent = titleCase(nextState);
      els.pushToTalk.classList.remove("is-recording");
      break;
  }

  els.statusText.textContent = detail;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function updatePermission(value) {
  state.permission = value;
  els.permissionValue.textContent = value;
}

function appendLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.eventLog.prepend(item);
}

function clearLatestBlob() {
  if (state.latestObjectUrl) {
    URL.revokeObjectURL(state.latestObjectUrl);
  }

  state.latestBlob = null;
  state.latestObjectUrl = null;
  els.audioPreview.removeAttribute("src");
  els.audioPreview.load();
  els.downloadLink.href = "#";
  els.downloadLink.classList.add("disabled");
  els.downloadLink.setAttribute("aria-disabled", "true");
  els.formatValue.textContent = "No recording yet";
  els.bytesValue.textContent = "0";
  els.readyValue.textContent = "No";
  els.serverResponse.textContent = "No upload attempted yet.";
}

function publishRecording(blob, metadata) {
  clearLatestBlob();
  state.latestBlob = blob;
  state.latestObjectUrl = URL.createObjectURL(blob);
  els.audioPreview.src = state.latestObjectUrl;
  els.downloadLink.href = state.latestObjectUrl;
  els.downloadLink.classList.remove("disabled");
  els.downloadLink.setAttribute("aria-disabled", "false");
  els.formatValue.textContent = `WAV / PCM16 / ${metadata.sampleRate} Hz`;
  els.bytesValue.textContent = String(blob.size);
  els.channelsValue.textContent = String(metadata.channels);
  els.readyValue.textContent = "Yes";
  appendLog(`Prepared WAV blob for upload (${blob.size} bytes).`);
}

function getDefaultServerUrl() {
  if (window.location.protocol.startsWith("http")) {
    return `${window.location.origin}/api/translate-speak`;
  }

  return "http://127.0.0.1:8090/api/translate-speak";
}

function mergeBuffers(chunks, totalLength) {
  const output = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function encodeWavFromFloat32(samples, sampleRate, channels = 1) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, clampSample(samples[i]) * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function stopDurationTimer() {
  if (state.recordingTimerId) {
    window.clearInterval(state.recordingTimerId);
    state.recordingTimerId = null;
  }
}

function updateDuration() {
  if (!state.isRecording) {
    return;
  }

  const elapsedMs = performance.now() - state.recordingStartedAt;
  els.durationValue.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
}

async function ensureMicrophoneStream() {
  if (state.stream) {
    return state.stream;
  }

  setUiState("requesting", "Requesting microphone access.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    updatePermission("granted");
    appendLog("Microphone permission granted.");
    state.stream = stream;
    return stream;
  } catch (error) {
    updatePermission("denied");
    setUiState("error", "Microphone permission was denied.");
    appendLog(`Microphone request failed: ${error.message}`);
    throw error;
  }
}

async function startRecording() {
  if (state.isRecording) {
    return;
  }

  clearLatestBlob();
  const stream = await ensureMicrophoneStream();

  if (!state.audioContext) {
    state.audioContext = new AudioContext();
    state.sampleRate = state.audioContext.sampleRate;
    els.sampleRateValue.textContent = `${state.sampleRate} Hz`;
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }

  state.chunks = [];
  state.sourceNode = state.audioContext.createMediaStreamSource(stream);
  state.processorNode = state.audioContext.createScriptProcessor(4096, 1, 1);
  state.processorNode.onaudioprocess = (event) => {
    if (!state.isRecording) {
      return;
    }

    const input = event.inputBuffer.getChannelData(0);
    state.chunks.push(new Float32Array(input));
  };

  state.sourceNode.connect(state.processorNode);
  state.processorNode.connect(state.audioContext.destination);
  state.isRecording = true;
  state.recordingStartedAt = performance.now();
  els.durationValue.textContent = "0.0s";
  setUiState("recording", "Recording one utterance. Release to stop.");
  appendLog("Recording started.");

  stopDurationTimer();
  state.recordingTimerId = window.setInterval(updateDuration, 100);
}

function teardownRecorderNodes() {
  if (state.sourceNode) {
    state.sourceNode.disconnect();
    state.sourceNode = null;
  }

  if (state.processorNode) {
    state.processorNode.disconnect();
    state.processorNode.onaudioprocess = null;
    state.processorNode = null;
  }
}

function stopRecording() {
  if (!state.isRecording) {
    return;
  }

  state.isRecording = false;
  stopDurationTimer();
  teardownRecorderNodes();

  const totalLength = state.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const durationSeconds = (performance.now() - state.recordingStartedAt) / 1000;
  els.durationValue.textContent = `${durationSeconds.toFixed(1)}s`;

  if (totalLength === 0 || durationSeconds < 0.15) {
    setUiState("idle", "Recording was too short. Hold to talk again.");
    appendLog("Recording discarded because it was too short.");
    return;
  }

  setUiState("processing", "Encoding WAV for upload.");
  const mergedSamples = mergeBuffers(state.chunks, totalLength);
  const wavBlob = encodeWavFromFloat32(mergedSamples, state.sampleRate, 1);
  publishRecording(wavBlob, {
    channels: 1,
    sampleRate: state.sampleRate,
  });
  setUiState("ready", "Recording complete. Starting upload.");
  appendLog(
    `Recording stopped after ${durationSeconds.toFixed(2)}s at ${state.sampleRate} Hz.`,
  );
  void uploadLatestRecording();
}

async function uploadLatestRecording() {
  if (state.isUploading) {
    return;
  }

  if (!state.latestBlob) {
    setUiState("error", "Record an utterance before uploading.");
    appendLog("Upload skipped because no WAV blob is available.");
    return;
  }

  const targetUrl = els.serverUrl.value.trim();
  if (!targetUrl) {
    setUiState("error", "Application server URL is required.");
    return;
  }

  const form = new FormData();
  form.append("file", state.latestBlob, "utterance.wav");

  state.isUploading = true;
  els.uploadButton.disabled = true;
  setUiState("uploading", "Uploading WAV to the application server.");
  appendLog(`Uploading ${state.latestBlob.size} bytes to ${targetUrl}.`);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    els.serverResponse.textContent = JSON.stringify(payload, null, 2);

    if (!response.ok) {
      throw new Error(payload.error || `Upload failed with status ${response.status}`);
    }

    setUiState("ready", "Upload accepted by the application server.");
    appendLog(`Server accepted upload request ${payload.request_id}.`);
  } catch (error) {
    setUiState("error", error.message);
    appendLog(`Upload failed: ${error.message}`);
  } finally {
    state.isUploading = false;
    els.uploadButton.disabled = false;
  }
}

function attachPushToTalkHandlers() {
  const start = async (event) => {
    event.preventDefault();
    try {
      await startRecording();
    } catch (error) {
      console.error(error);
    }
  };

  const stop = (event) => {
    event.preventDefault();
    stopRecording();
  };

  els.pushToTalk.addEventListener("pointerdown", start);
  els.pushToTalk.addEventListener("pointerup", stop);
  els.pushToTalk.addEventListener("pointerleave", stop);
  els.pushToTalk.addEventListener("pointercancel", stop);

  window.addEventListener("keydown", async (event) => {
    if (event.code !== "Space" || event.repeat) {
      return;
    }

    if (document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) {
      return;
    }

    event.preventDefault();
    try {
      await startRecording();
    } catch (error) {
      console.error(error);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") {
      return;
    }

    event.preventDefault();
    stopRecording();
  });
}

async function hydratePermissions() {
  if (!navigator.permissions?.query) {
    updatePermission("prompt");
    return;
  }

  try {
    const permissionStatus = await navigator.permissions.query({ name: "microphone" });
    updatePermission(permissionStatus.state);
    permissionStatus.onchange = () => {
      updatePermission(permissionStatus.state);
      appendLog(`Microphone permission changed to ${permissionStatus.state}.`);
    };
  } catch (error) {
    updatePermission("prompt");
  }
}

function bindUi() {
  els.clearLog.addEventListener("click", () => {
    els.eventLog.replaceChildren();
    appendLog("Event log cleared.");
  });
  els.uploadButton.addEventListener("click", () => {
    void uploadLatestRecording();
  });
  els.serverUrl.value = getDefaultServerUrl();
}

async function init() {
  setUiState("idle", "Ready to request microphone access.");
  bindUi();
  attachPushToTalkHandlers();
  await hydratePermissions();
  appendLog("Web recorder initialized.");
}

void init();
