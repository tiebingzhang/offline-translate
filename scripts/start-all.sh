cd ~/code/whisper.cpp && ./whisper-server --port 8080 -m models/whisper-medium-english-2-wolof.gguf
python3 wolof_speech_server.py --port 8001

cd ~/code/whisper.cpp && ./whisper-server --port 8081 -m models/whisper-small-wolof.gguf
python3 wolof_to_english_translate_server.py --port 8002
python3 web_server.py
