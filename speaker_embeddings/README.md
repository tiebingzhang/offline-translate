Place a local speaker embedding file here for `app.py` to load.

Expected default path:
- `speaker_embeddings/default.npy`

Supported formats:
- `.npy`
- `.pt`

Expected tensor shape:
- `(512,)` or `(1, 512)`

Notes:
- `app.py` reshapes `(512,)` to `(1, 512)` automatically.
- If you use a different filename, update `DEFAULT_SPEAKER_EMBEDDING_PATH` in `app.py`.
- `scripts/download_speaker_embedding.py` can download one embedding from the Hugging Face CMU Arctic xvector archive and save it to the default path.
