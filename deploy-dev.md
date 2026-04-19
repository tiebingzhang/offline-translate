# Development Environment Deployment Plan

Goal: deploy all five services to a remote server with a public domain so an
iPhone app can call the existing `POST /api/translate-speak` and
`GET /api/requests/{request_id}` endpoints over HTTPS.

---

## 1. Architecture

```
iPhone App
    │  HTTPS
    ▼
Cloudflare Edge  (free TLS termination, DNS, DDoS protection)
    │  Cloudflare Tunnel (encrypted, outbound-only)
    ▼
┌─────────────── Single VPS ───────────────────────────┐
│  cloudflared  ──▶  nginx (:443 proxy_pass :8090)     │
│                                                       │
│  ┌─── docker compose ──────────────────────────────┐ │
│  │                                                  │ │
│  │  web-server    (:8090)  ◄── orchestrator         │ │
│  │      │                                           │ │
│  │      ├──▶ whisper-en-wo  (:8080)  ASR+translate  │ │
│  │      ├──▶ whisper-wo     (:8081)  Wolof ASR      │ │
│  │      ├──▶ wolof-tts      (:8001)  Wolof speech   │ │
│  │      └──▶ wolof-en-translate (:8002)  WO→EN      │ │
│  │                                                  │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

All five services run on one machine.  Inter-service calls stay on
`localhost`.  Only port 8090 is exposed via the Cloudflare Tunnel — nothing
else is reachable from the internet.

---

## 2. Cloud Provider Selection

### Recommended: Hetzner Cloud (EU datacenter)

| Spec               | Value                          |
|--------------------|---------------------------------|
| Plan               | CPX41                           |
| CPU                | 8 shared vCPU (AMD EPYC)       |
| RAM                | 16 GB                           |
| Disk               | 240 GB NVMe SSD                 |
| Location           | Falkenstein or Helsinki (EU)    |
| Cost               | ~€30/month (~$33)               |

Why Hetzner:
- 3–4x cheaper than AWS/DigitalOcean for equivalent specs.
- 16 GB RAM is sufficient: whisper.cpp medium ~2 GB + small ~1 GB +
  PyTorch+NLLB ~2 GB + PyTorch+SpeechT5 ~1.5 GB + OS ~2 GB ≈ 9 GB, leaving
  headroom.
- 8 vCPU handles bursty CPU inference (no GPU needed at this volume).
- NVMe is fast enough for model loading.

### Budget Alternative: Oracle Cloud Free Tier

| Spec               | Value                          |
|--------------------|---------------------------------|
| Plan               | VM.Standard.A1.Flex             |
| CPU                | 4 OCPU (ARM Ampere A1)         |
| RAM                | 24 GB                           |
| Disk               | 200 GB block storage            |
| Cost               | **$0/month** (Always Free)      |

Caveats:
- ARM architecture — whisper.cpp and PyTorch support ARM Linux, but test
  thoroughly.
- "Out of Host Capacity" errors are common; provisioning may require retries
  or an auto-retry script.
- Oracle may reclaim idle free-tier instances (rare but documented).
- Fewer CPU cores (4 vs 8) means slower inference.

### Why NOT AWS / DigitalOcean / Vultr

| Provider       | 16 GB plan cost | Why skip                        |
|----------------|----------------|---------------------------------|
| AWS Lightsail  | ~$84/month     | 2.5x Hetzner price              |
| AWS EC2 t3a    | ~$110/month    | Burstable CPU, bad for inference |
| DigitalOcean   | ~$96/month     | 3x Hetzner price                |
| Vultr          | ~$112/month    | 3.5x Hetzner price              |

---

## 3. Domain & HTTPS

| Component         | Provider              | Cost          |
|-------------------|-----------------------|---------------|
| Domain            | Cloudflare Registrar  | ~$10/year     |
| DNS               | Cloudflare            | Free          |
| TLS (HTTPS)       | Cloudflare Edge       | Free          |
| Tunnel            | Cloudflare Tunnel     | Free          |

Register a domain (e.g. `wolof-translate.dev` or a `.xyz` for ~$2/year
first year) through Cloudflare Registrar.  Cloudflare Tunnel creates an
outbound-only encrypted connection from the VPS to Cloudflare's edge — no
need to open firewall ports, manage TLS certificates, or assign a static IP.

Setup steps:

```bash
# On the VPS
curl -fsSL https://pkg.cloudflare.com/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate (one-time, opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create wolof-dev

# Configure  (~/.cloudflared/config.yml)
cat > ~/.cloudflared/config.yml <<EOF
tunnel: wolof-dev
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: api.wolof-translate.dev
    service: http://localhost:8090
  - service: http_status:404
EOF

# Add DNS record (automatic)
cloudflared tunnel route dns wolof-dev api.wolof-translate.dev

# Run as systemd service
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

iPhone app base URL: `https://api.wolof-translate.dev`

---

## 4. Server Setup

### 4a. Base OS

```bash
# Hetzner: Ubuntu 24.04 LTS
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install cloudflared (see Section 3)
```

### 4b. Directory Structure

```
/opt/wolof-translate/
├── docker-compose.yml
├── Dockerfile.python          # Shared base for Python services
├── Dockerfile.whisper         # whisper.cpp build
├── models/                    # GGUF models (persistent volume)
│   ├── whisper-medium-english-2-wolof.gguf
│   └── whisper-small-wolof.gguf
├── hf-cache/                  # HuggingFace model cache (persistent volume)
├── generated-audio/           # TTS output (shared volume)
└── src/                       # Clone of this repo
```

### 4c. Docker Compose

```yaml
# docker-compose.yml
services:

  whisper-en-wo:
    build:
      context: ./src
      dockerfile: ../Dockerfile.whisper
    command: >
      whisper-server --port 8080 --host 0.0.0.0
      -m /models/whisper-medium-english-2-wolof.gguf
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./models:/models:ro
    deploy:
      resources:
        limits:
          memory: 3G

  whisper-wo:
    build:
      context: ./src
      dockerfile: ../Dockerfile.whisper
    command: >
      whisper-server --port 8081 --host 0.0.0.0
      -m /models/whisper-small-wolof.gguf
    ports:
      - "127.0.0.1:8081:8081"
    volumes:
      - ./models:/models:ro
    deploy:
      resources:
        limits:
          memory: 2G

  wolof-tts:
    build:
      context: ./src
      dockerfile: ../Dockerfile.python
    command: python wolof_speech_server.py --host 0.0.0.0 --port 8001
    ports:
      - "127.0.0.1:8001:8001"
    volumes:
      - ./hf-cache:/root/.cache/huggingface
      - ./generated-audio:/app/generated_audio
    deploy:
      resources:
        limits:
          memory: 4G

  wolof-en-translate:
    build:
      context: ./src
      dockerfile: ../Dockerfile.python
    command: python wolof_to_english_translate_server.py --host 0.0.0.0 --port 8002
    ports:
      - "127.0.0.1:8002:8002"
    volumes:
      - ./hf-cache:/root/.cache/huggingface
    deploy:
      resources:
        limits:
          memory: 4G

  web-server:
    build:
      context: ./src
      dockerfile: ../Dockerfile.python
    command: >
      python web_server.py --port 8090 --host 0.0.0.0
      --whisper-en-wo-url http://whisper-en-wo:8080/inference
      --whisper-wo-url http://whisper-wo:8081/inference
      --speech-url http://wolof-tts:8001/speak
      --translation-url http://wolof-en-translate:8002/translate
      --say-play false
    ports:
      - "127.0.0.1:8090:8090"
    volumes:
      - ./generated-audio:/app/generated_audio
    depends_on:
      - whisper-en-wo
      - whisper-wo
      - wolof-tts
      - wolof-en-translate
    deploy:
      resources:
        limits:
          memory: 1G
```

### 4d. Dockerfiles

```dockerfile
# Dockerfile.whisper
FROM ubuntu:24.04 AS builder
RUN apt-get update && apt-get install -y cmake g++ git
COPY . /build
WORKDIR /build/whisper.cpp
RUN cmake -B build && cmake --build build --config Release -j$(nproc)

FROM ubuntu:24.04
COPY --from=builder /build/whisper.cpp/build/bin/whisper-server /usr/local/bin/
ENTRYPOINT ["whisper-server"]
```

```dockerfile
# Dockerfile.python
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir numpy soxr torch transformers sentencepiece
COPY . /app/
```

### 4e. Download Models (one-time)

```bash
cd /opt/wolof-translate

# GGUF models
pip install huggingface-hub
hf download Tiebing/whisper-medium-english-2-wolof \
  whisper-medium-english-2-wolof.gguf --local-dir ./models/
hf download Tiebing/whisper-small-wolof \
  whisper-small-wolof.gguf --local-dir ./models/

# HuggingFace models will auto-download on first container start
# into ./hf-cache/ volume
```

### 4f. Start Everything

```bash
cd /opt/wolof-translate
docker compose up -d

# Verify
docker compose ps
curl http://localhost:8090/api/health
```

---

## 5. Code Changes Required

The current server is designed for local use (browser and server on the same
machine).  Two changes are needed for remote iPhone access:

### 5a. Serve generated audio over HTTP

The TTS pipeline saves WAV files to `generated_audio/` on disk and plays
them locally.  The iPhone app needs to download the audio.  Add an endpoint:

```
GET /api/requests/{request_id}/audio → 200 audio/wav
```

This serves the generated WAV file back to the client.  The web server
already knows the `output_path` from the speech result — it just needs a
route to serve it.

### 5b. Disable macOS `say` for Wolof→English

The Wolof→English pipeline uses macOS `say` to speak English aloud on the
server.  On a Linux server this will fail.  Options:

1. **Return text only** — the iPhone app can use `AVSpeechSynthesizer` to
   speak English on-device (free, zero latency).  This is the simplest path.
2. **Add a server-side English TTS** — use `espeak-ng` in the Docker container
   or an external API.  Unnecessary complexity for dev.

Recommendation: option 1.  Pass `--say-play false` to `web_server.py`
(already supported via CLI flag) and let the iPhone handle English speech.

### 5c. CORS headers (if needed)

If testing from a web browser on a different origin, add CORS headers.
Not needed for native iPhone app (`URLSession` doesn't enforce CORS).

---

## 6. Latency Expectations (CPU Inference)

All inference runs on CPU.  Expected per-request latency for a ~5 second
audio clip:

| Stage                | Estimated Time |
|----------------------|----------------|
| Audio upload (LTE)   | 0.5–1 s        |
| Normalization        | < 0.1 s        |
| Whisper ASR (medium) | 5–15 s         |
| Whisper ASR (small)  | 2–8 s          |
| NLLB translation     | 1–3 s          |
| SpeechT5 TTS         | 3–10 s         |
| Audio download       | 0.2–0.5 s      |
| **Total (EN→WO)**    | **~10–25 s**   |
| **Total (WO→EN)**    | **~5–15 s**    |

This is acceptable for dev testing.  The iPhone app's polling UI
(`GET /api/requests/{id}` every 500ms) will show stage progress to the user
while waiting.

---

## 7. Cost Summary

### Monthly Recurring

| Item               | Provider              | Cost/month  |
|--------------------|-----------------------|-------------|
| VPS (CPX41)        | Hetzner               | ~$33        |
| Tunnel             | Cloudflare            | $0          |
| DNS                | Cloudflare            | $0          |
| TLS                | Cloudflare            | $0          |
| **Total**          |                       | **~$33**    |

### One-time

| Item               | Provider              | Cost        |
|--------------------|-----------------------|-------------|
| Domain registration| Cloudflare Registrar  | ~$10/year   |

### Budget Alternative (Oracle Free Tier)

| Item               | Cost/month            |
|--------------------|-----------------------|
| VPS (A1.Flex ARM)  | $0                    |
| Domain             | ~$0.83 ($10/year)     |
| **Total**          | **~$1/month**         |

---

## 8. Deployment Checklist

```
[ ] 1. Create Hetzner account, provision CPX41 (Ubuntu 24.04)
[ ] 2. SSH in, install Docker + cloudflared
[ ] 3. Register domain on Cloudflare Registrar
[ ] 4. Create Cloudflare Tunnel, configure DNS
[ ] 5. Clone repo to /opt/wolof-translate/src/
[ ] 6. Download GGUF models to /opt/wolof-translate/models/
[ ] 7. Create Dockerfiles and docker-compose.yml
[ ] 8. Implement GET /api/requests/{id}/audio endpoint
[ ] 9. docker compose up -d
[ ] 10. Verify: curl https://api.<domain>/api/health
[ ] 11. Test from iPhone: POST audio, poll status, download result
```

---

## 8b. BFF dependency bootstrap (FR-038, 2026-04-17)

Restarting the BFF after pulling `001-wolof-translate-mobile` now requires
`pip install -e .` from the repo root to pick up the new `av` (PyAV)
dependency introduced by FR-038 (AAC/m4a upload transcoding). PyAV ships
pre-built wheels that bundle FFmpeg — no system `ffmpeg-dev` package is
required on the VPS.

Installed wheel baseline (macOS arm64 host; Linux x86_64 baseline TBD under
T138b):

| Package | Version | Filename | SHA-256 |
|---|---|---|---|
| `av` | 13.1.0 | `av-13.1.0-cp310-cp310-macosx_11_0_arm64.whl` | `0fea71fe06fd0dfe90a089200eb6468034797f860a321fa2d62e07d619c74749` |

If `pip install -e .` fails on the Linux target because a PyAV wheel is not
available for that CPython minor version / architecture combination, the
contingency is a multi-stage Docker build that installs `ffmpeg-dev` and
lets PyAV compile against it (see `mobile_app_implementation_plan.md` R-9).

## 9. Future Considerations (Not Needed Now)

- **Authentication**: Add API key header check when moving beyond dev.
- **Rate limiting**: nginx `limit_req` module if abuse becomes a concern.
- **GPU upgrade**: If latency is unacceptable, switch to a Hetzner GPU
  server (GEX44, ~€180/month) or add an AWS g4dn spot instance.
- **Auto-scaling**: Not needed at this volume.  One machine handles <15
  req/sec with queuing.
- **Monitoring**: `docker compose logs -f` is sufficient for dev.
  Add Prometheus/Grafana if this becomes a staging environment.
