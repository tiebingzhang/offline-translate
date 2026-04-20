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
  latestBlobName: null,
  latestObjectUrl: null,
  translatedAudioObjectUrl: null,
  translatedAudioElement: null,
  isUploading: false,
  currentRequestId: null,
  lastSeenStage: null,
  selectedDirection: "english_to_wolof",
  activeButton: null,
  developerMode: false,
  audioContextUnlocked: false, // NEW: tracks whether we've played a silent buffer
};

const els = {
  talkButtons: Array.from(document.querySelectorAll("[data-direction]")),
  developerModeToggle: document.querySelector("#developerModeToggle"),
  developerPanels: Array.from(document.querySelectorAll("[data-developer-panel]")),
  statusBadge: document.querySelector("#statusBadge"),
  statusText: document.querySelector("#statusText"),
  permissionValue: document.querySelector("#permissionValue"),
  durationValue: document.querySelector("#durationValue"),
  sampleRateValue: document.querySelector("#sampleRateValue"),
  directionValue: document.querySelector("#directionValue"),
  formatValue: document.querySelector("#formatValue"),
  bytesValue: document.querySelector("#bytesValue"),
  channelsValue: document.querySelector("#channelsValue"),
  readyValue: document.querySelector("#readyValue"),
  translatedAudioHost: document.querySelector("#translatedAudioHost"),
  translatedPlayButton: document.querySelector("#translatedPlayButton"),
  translatedDownloadLink: document.querySelector("#translatedDownloadLink"),
  playbackText: document.querySelector("#playbackText"),
  audioPreview: document.querySelector("#audioPreview"),
  downloadLink: document.querySelector("#downloadLink"),
  serverUrl: document.querySelector("#serverUrl"),
  diskWavInput: document.querySelector("#diskWavInput"),
  pickWavButton: document.querySelector("#pickWavButton"),
  uploadButton: document.querySelector("#uploadButton"),
  serverResponse: document.querySelector("#serverResponse"),
  eventLog: document.querySelector("#eventLog"),
  clearLog: document.querySelector("#clearLog"),
};

function setDeveloperMode(enabled) {
  state.developerMode = enabled;
  els.developerModeToggle.checked = enabled;
  for (const panel of els.developerPanels) {
    panel.hidden = !enabled;
  }
}

function formatDirection(direction) {
  if (direction === "english_to_wolof") {
    return "English -> Wolof";
  }
  if (direction === "wolof_to_english") {
    return "Wolof -> English";
  }
  return titleCase(direction);
}

function setUiState(nextState, detail) {
  state.uiState = nextState;

  const badge = els.statusBadge;
  badge.className = "badge";

  switch (nextState) {
    case "recording":
      badge.classList.add("recording");
      badge.textContent = "Recording";
      break;
    case "ready":
      badge.classList.add("ready");
      badge.textContent = "Ready";
      break;
    case "error":
      badge.classList.add("error");
      badge.textContent = "Error";
      break;
    default:
      badge.textContent = titleCase(nextState);
      break;
  }

  for (const button of els.talkButtons) {
    button.classList.toggle("is-recording", button === state.activeButton && nextState === "recording");
  }

  els.statusText.textContent = detail;
}

function titleCase(value) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function updatePermission(value) {
  state.permission = value;
  els.permissionValue.textContent = value;
}

function setSelectedDirection(direction) {
  state.selectedDirection = direction;
  els.directionValue.textContent = formatDirection(direction);
}

function appendLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.eventLog.prepend(item);
}


function describeMediaError(mediaError) {
  if (!mediaError) {
    return "none";
  }

  const codeNames = {
    1: "MEDIA_ERR_ABORTED",
    2: "MEDIA_ERR_NETWORK",
    3: "MEDIA_ERR_DECODE",
    4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
  };
  return `${codeNames[mediaError.code] || "UNKNOWN"} (${mediaError.code}): ${mediaError.message || "no message"}`;
}

function snapshotAudioState(audio) {
  return {
    currentSrc: audio.currentSrc,
    readyState: audio.readyState,
    networkState: audio.networkState,
    paused: audio.paused,
    ended: audio.ended,
    muted: audio.muted,
    volume: audio.volume,
    currentTime: audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : String(audio.duration),
    error: describeMediaError(audio.error),
  };
}

function attachTranslatedAudioDebugListeners(audio, label) {
  const events = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "canplay",
    "canplaythrough",
    "play",
    "playing",
    "pause",
    "ended",
    "waiting",
    "stalled",
    "suspend",
    "error",
  ];


}

function clearLatestBlob() {
  if (state.latestObjectUrl) {
    URL.revokeObjectURL(state.latestObjectUrl);
  }

  state.latestBlob = null;
  state.latestBlobName = null;
  state.latestObjectUrl = null;
  els.audioPreview.removeAttribute("src");
  els.audioPreview.load();
  els.downloadLink.href = "#";
  els.downloadLink.download = "utterance.wav";
  els.downloadLink.classList.add("disabled");
  els.downloadLink.setAttribute("aria-disabled", "true");
  els.formatValue.textContent = "No WAV loaded yet";
  els.bytesValue.textContent = "0";
  els.channelsValue.textContent = "1";
  els.readyValue.textContent = "No";
  els.serverResponse.textContent = "No upload attempted yet.";
}

function setPlaybackText(text) {
  els.playbackText.textContent = text;
}

function describeTranslatedAudio(job) {
  const isEnglishAudio =
    job?.direction === "wolof_to_english" ||
    job?.result?.output_mode === "english_audio";

  return {
    noun: isEnglishAudio ? "translated English audio" : "translated Wolof audio",
    filename: `${job?.request_id || "translation"}-${isEnglishAudio ? "english" : "wolof"}.m4a`,
  };
}

function clearTranslatedAudio() {
  if (state.translatedAudioElement) {
    state.translatedAudioElement.pause();
    state.translatedAudioElement.removeAttribute("src");
    state.translatedAudioElement.load();
  }

  if (state.translatedAudioObjectUrl) {
    URL.revokeObjectURL(state.translatedAudioObjectUrl);
  }

  state.translatedAudioObjectUrl = null;
  state.translatedAudioElement = null;
  els.translatedAudioHost.replaceChildren();
  els.translatedPlayButton.disabled = true;
  els.translatedDownloadLink.href = "#";
  els.translatedDownloadLink.download = "translation.m4a";
  els.translatedDownloadLink.classList.add("disabled");
  els.translatedDownloadLink.setAttribute("aria-disabled", "true");
  setPlaybackText("No translated audio fetched yet.");
}

function publishWavPreview(blob, metadata, options = {}) {
  clearLatestBlob();
  state.latestBlob = blob;
  state.latestBlobName = options.fileName || "utterance.wav";
  state.latestObjectUrl = URL.createObjectURL(blob);
  els.audioPreview.src = state.latestObjectUrl;
  els.downloadLink.href = state.latestObjectUrl;
  els.downloadLink.download = state.latestBlobName;
  els.downloadLink.classList.remove("disabled");
  els.downloadLink.setAttribute("aria-disabled", "false");
  els.formatValue.textContent = formatWavSummary(metadata);
  els.bytesValue.textContent = String(blob.size);
  els.channelsValue.textContent = String(metadata.channels);
  els.readyValue.textContent = "Yes";
}

function publishTranslatedAudio(blob, options = {}) {
  clearTranslatedAudio();
  state.translatedAudioObjectUrl = URL.createObjectURL(blob);
  const audio = document.createElement("audio");
  audio.src = state.translatedAudioObjectUrl;
  audio.controls = true;
  audio.preload = "none";
  audio.className = "audio-preview";
  attachTranslatedAudioDebugListeners(audio, "embedded");
  els.translatedAudioHost.appendChild(audio);
  state.translatedAudioElement = audio;
  window.__translatedAudioDebug = {
    blobUrl: state.translatedAudioObjectUrl,
    embeddedElement: audio,
    lastBlobType: blob.type,
    lastBlobSize: blob.size,
  };
  els.translatedPlayButton.disabled = false;
  els.translatedDownloadLink.href = state.translatedAudioObjectUrl;
  els.translatedDownloadLink.download = options.fileName || "translation.m4a";
  els.translatedDownloadLink.classList.remove("disabled");
  els.translatedDownloadLink.setAttribute("aria-disabled", "false");
}

async function playTranslatedAudioFromBlobUrl() {
  if (!state.translatedAudioObjectUrl) {
    setPlaybackText("No translated audio is available yet.");
    appendLog("Translated audio play was requested before audio was fetched.");
    return;
  }

  try {
    const audio = new Audio(state.translatedAudioObjectUrl);
    attachTranslatedAudioDebugListeners(audio, "button");
    window.__translatedAudioDebug = {
      ...(window.__translatedAudioDebug || {}),
      blobUrl: state.translatedAudioObjectUrl,
      buttonAudio: audio,
    };
    await audio.play();
    setPlaybackText("Playing translated audio.");
    appendLog("Translated audio playback started from blob URL.");
  } catch (error) {
    setPlaybackText("Translated audio could not be played.");
    appendLog(`Translated audio playback failed: ${error.message}`);
  }
}

async function playTranslatedAudioViaWebAudio() {
  if (!state.translatedAudioObjectUrl) {
    return;
  }

  try {
    const response = await fetch(state.translatedAudioObjectUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    const source = state.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.audioContext.destination);
    source.start(0);
    setPlaybackText("Playing translated audio.");
    appendLog("Translated audio autoplay started via WebAudio.");
  } catch (error) {
    setPlaybackText("Translated audio ready. Press play if autoplay was blocked.");
    appendLog(`Translated audio WebAudio autoplay failed: ${error.message}`);
  }
}


// NEW: plays a silent one-frame buffer through the AudioContext during a real
// user gesture (pointerdown on a talk button). This marks the AudioContext as
// "unlocked" by the browser, so that subsequent programmatic audio.play()
// calls — e.g. autoplay after a translation completes — are allowed.
async function unlockAudioContext() {
  if (state.audioContextUnlocked) {
    return;
  }

  // Create the AudioContext now if it doesn't exist yet so that the unlock
  // gesture and the context creation happen in the same user-gesture callback.
  if (!state.audioContext) {
    state.audioContext = new AudioContext();
    state.sampleRate = state.audioContext.sampleRate;
    els.sampleRateValue.textContent = `${state.sampleRate} Hz`;
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }

  // Play a one-frame silent buffer. This is the gesture that browsers require.
  const buffer = state.audioContext.createBuffer(1, 1, state.audioContext.sampleRate);
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioContext.destination);
  source.start(0);

  state.audioContextUnlocked = true;
  appendLog("AudioContext unlocked via silent buffer.");
}

function resolveStatusUrl(statusUrl) {
  return new URL(statusUrl, window.location.origin).toString();
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function updateUiFromJob(job) {
  if (job.stage && job.stage !== state.lastSeenStage) {
    appendLog(`Request ${job.request_id} entered stage ${job.stage}.`);
    state.lastSeenStage = job.stage;
  }

  switch (job.stage) {
    case "queued":
      setUiState("uploading", job.stage_detail || "Upload accepted.");
      break;
    case "normalizing":
      setUiState("processing", job.stage_detail || "Normalizing audio.");
      break;
    case "transcribing":
      setUiState("transcribing", job.stage_detail || "Calling whisper.cpp.");
      break;
    case "translating":
      setUiState("translating", job.stage_detail || "Translating text.");
      break;
    case "generating_speech":
      setUiState("generating_speech", job.stage_detail || "Generating speech.");
      break;
    case "completed":
      setUiState("ready", job.stage_detail || "Pipeline complete.");
      if (job.timings_ms?.total) {
        appendLog(`Request ${job.request_id} completed in ${job.timings_ms.total} ms.`);
      }
      if (job.result?.translated_text) {
        appendLog(`Translated text: ${job.result.translated_text}`);
      }
      if (job.direction) {
        appendLog(`Completed direction ${formatDirection(job.direction)}.`);
      }
      break;
    case "failed":
      setUiState("error", job.error?.message || job.stage_detail || "Request failed.");
      break;
    default:
      setUiState(job.stage || "processing", job.stage_detail || "Processing request.");
      break;
  }
}

async function fetchTranslatedAudio(job) {
  const translatedAudio = describeTranslatedAudio(job);
  const audioUrl = job.result?.audio_url;
  if (!audioUrl) {
    clearTranslatedAudio();
    setPlaybackText(`This response did not return ${translatedAudio.noun}.`);
    appendLog(`No downloadable ${translatedAudio.noun} was returned for request ${job.request_id}.`);
    return;
  }

  const resolvedAudioUrl = new URL(audioUrl, window.location.origin).toString();
  setUiState("processing", `Fetching ${translatedAudio.noun}.`);
  setPlaybackText(`Fetching ${translatedAudio.noun}.`);
  appendLog(`Fetching ${translatedAudio.noun} from ${resolvedAudioUrl}.`);

  const response = await fetch(resolvedAudioUrl, { method: "GET" });
  if (!response.ok) {
    let message = `Audio fetch failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error?.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies and preserve the default message.
    }
    throw new Error(message);
  }

  const audioBlob = await response.blob();
  publishTranslatedAudio(audioBlob, { fileName: translatedAudio.filename });
  appendLog(`Fetched ${translatedAudio.noun} for request ${job.request_id} (${audioBlob.size} bytes).`);

  setUiState("ready", `${titleCase(translatedAudio.noun)} ready.`);
  await playTranslatedAudioViaWebAudio();

/*
  try {
    els.translatedPlayButton.click();
    setUiState("ready", "Translated audio ready.");
  } catch (error) {
    setPlaybackText("Translated audio ready. Press play if autoplay was blocked.");
    setUiState("ready", "Translated audio ready.");
    appendLog(`Browser playback did not start automatically: ${error.message}`);
  }
  */
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

function formatWavSummary(metadata) {
  return `WAV / ${describeWavEncoding(metadata.audioFormat, metadata.bitsPerSample)} / ${metadata.sampleRate} Hz`;
}

function describeWavEncoding(audioFormat = 1, bitsPerSample = 16) {
  switch (audioFormat) {
    case 1:
      return `PCM${bitsPerSample}`;
    case 3:
      return `Float${bitsPerSample}`;
    case 6:
      return "A-law";
    case 7:
      return "mu-law";
    case 65534:
      return bitsPerSample ? `Extensible ${bitsPerSample}-bit` : "Extensible";
    default:
      return bitsPerSample ? `Format ${audioFormat} / ${bitsPerSample}-bit` : `Format ${audioFormat}`;
  }
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function readAscii(view, offset, length) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += String.fromCharCode(view.getUint8(offset + i));
  }
  return output;
}

async function readWavMetadata(blob) {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);

  if (view.byteLength < 44) {
    throw new Error("Selected file is too small to be a valid WAV file.");
  }

  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Selected file is not a valid RIFF/WAVE file.");
  }

  let fmtChunk = null;
  let dataChunkBytes = 0;
  let offset = 12;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkDataOffset + chunkSize > view.byteLength) {
      break;
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("Selected WAV file has an invalid fmt chunk.");
      }

      fmtChunk = {
        audioFormat: view.getUint16(chunkDataOffset, true),
        channels: view.getUint16(chunkDataOffset + 2, true),
        sampleRate: view.getUint32(chunkDataOffset + 4, true),
        bitsPerSample: view.getUint16(chunkDataOffset + 14, true),
      };
    }

    if (chunkId === "data") {
      dataChunkBytes = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmtChunk) {
    throw new Error("Selected WAV file is missing a fmt chunk.");
  }

  if (dataChunkBytes === 0) {
    throw new Error("Selected WAV file does not contain audio data.");
  }

  return {
    audioFormat: fmtChunk.audioFormat,
    bitsPerSample: fmtChunk.bitsPerSample,
    channels: fmtChunk.channels,
    sampleRate: fmtChunk.sampleRate,
  };
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

async function startRecording(direction, button) {
  if (state.isRecording) {
    return;
  }

  setSelectedDirection(direction);
  state.activeButton = button;
  clearLatestBlob();
  clearTranslatedAudio();
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
  setUiState("recording", `Recording ${formatDirection(direction)}. Release to stop.`);
  appendLog(`Recording started for ${formatDirection(direction)}.`);

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
    state.activeButton = null;
    return;
  }

  setUiState("processing", "Encoding WAV for upload.");
  const mergedSamples = mergeBuffers(state.chunks, totalLength);
  const wavBlob = encodeWavFromFloat32(mergedSamples, state.sampleRate, 1);
  publishWavPreview(
    wavBlob,
    {
      audioFormat: 1,
      bitsPerSample: 16,
      channels: 1,
      sampleRate: state.sampleRate,
    },
    {
      fileName: "utterance.wav",
    },
  );
  setUiState("ready", "Recording complete. Starting upload.");
  appendLog(`Prepared WAV preview for upload (${wavBlob.size} bytes).`);
  appendLog(
    `Recording for ${formatDirection(state.selectedDirection)} stopped after ${durationSeconds.toFixed(2)}s at ${state.sampleRate} Hz.`,
  );
  state.activeButton = null;
  void uploadPreviewWav();
}

async function uploadPreviewWav() {
  if (state.isUploading) {
    return;
  }

  if (!state.latestBlob) {
    setUiState("error", "Record or load a WAV before uploading.");
    appendLog("Upload skipped because no WAV preview is available.");
    return;
  }

  const targetUrl = els.serverUrl.value.trim();
  if (!targetUrl) {
    setUiState("error", "Application server URL is required.");
    return;
  }

  const form = new FormData();
  form.append("file", state.latestBlob, state.latestBlobName || "utterance.wav");
  form.append("direction", state.selectedDirection);

  state.isUploading = true;
  clearTranslatedAudio();
  els.diskWavInput.disabled = true;
  els.pickWavButton.disabled = true;
  els.uploadButton.disabled = true;
  state.currentRequestId = null;
  state.lastSeenStage = null;
  setUiState("uploading", "Uploading WAV to the application server.");
  appendLog(
    `Uploading ${state.latestBlobName || "utterance.wav"} (${state.latestBlob.size} bytes) to ${targetUrl} for ${state.selectedDirection}.`,
  );

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    els.serverResponse.textContent = JSON.stringify(payload, null, 2);

    if (!response.ok) {
      throw new Error(payload.error?.message || payload.error || `Upload failed with status ${response.status}`);
    }

    state.currentRequestId = payload.request_id;
    appendLog(`Server accepted upload request ${payload.request_id}.`);
    await pollRequestStatus(resolveStatusUrl(payload.status_url), payload.poll_after_ms || 500);
  } catch (error) {
    setUiState("error", error.message);
    appendLog(`Upload failed: ${error.message}`);
  } finally {
    state.isUploading = false;
    els.diskWavInput.disabled = false;
    els.pickWavButton.disabled = false;
    els.uploadButton.disabled = false;
  }
}

async function handleDiskWavSelection(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  try {
    const metadata = await readWavMetadata(file);
    publishWavPreview(file, metadata, { fileName: file.name });
    setUiState("ready", `Loaded ${file.name}. Ready to upload.`);
    appendLog(`Loaded WAV from disk: ${file.name} (${file.size} bytes).`);
  } catch (error) {
    setUiState("error", error.message);
    appendLog(`Disk WAV load failed: ${error.message}`);
  } finally {
    els.diskWavInput.value = "";
  }
}

async function pollRequestStatus(statusUrl, pollAfterMs) {
  while (true) {
    await delay(pollAfterMs);
    const response = await fetch(statusUrl, { method: "GET" });
    const payload = await response.json();
    els.serverResponse.textContent = JSON.stringify(payload, null, 2);

    if (!response.ok) {
      throw new Error(payload.error?.message || `Polling failed with status ${response.status}`);
    }

    updateUiFromJob(payload);

    if (payload.status === "completed") {
      if (
        payload.direction === "wolof_to_english" &&
        payload.result?.output_mode === "english_audio" &&
        payload.result?.audio_url
      ) {
        appendLog(`Request ${payload.request_id} returned downloadable translated English audio.`);
      }
      await fetchTranslatedAudio(payload);
      return payload;
    }

    if (payload.status === "failed") {
      throw new Error(payload.error?.message || "Request failed.");
    }
  }
}

function attachPushToTalkHandlers() {
  const start = async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    const direction = button.dataset.direction;
    try {
      // NEW: unlock the AudioContext on the first real user gesture before
      // anything async (like getUserMedia) consumes the gesture token.
      await unlockAudioContext();
      await startRecording(direction, button);
    } catch (error) {
      console.error(error);
    }
  };

  const stop = (event) => {
    event.preventDefault();
    stopRecording();
  };

  for (const button of els.talkButtons) {
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("pointercancel", stop);
  }
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
  els.developerModeToggle.addEventListener("change", (event) => {
    setDeveloperMode(event.target.checked);
  });
  els.pickWavButton.addEventListener("click", () => {
    els.diskWavInput.click();
  });
  els.translatedPlayButton.addEventListener("click", () => {
    void playTranslatedAudioFromBlobUrl();
  });
  els.diskWavInput.addEventListener("change", (event) => {
    void handleDiskWavSelection(event);
  });
  els.uploadButton.addEventListener("click", () => {
    void uploadPreviewWav();
  });
  els.serverUrl.value = getDefaultServerUrl();
}

async function init() {
  setUiState("idle", "Ready to request microphone access.");
  setSelectedDirection(state.selectedDirection);
  setDeveloperMode(false);
  bindUi();
  attachPushToTalkHandlers();
  await hydratePermissions();
  appendLog("Web recorder initialized.");
}

void init();
