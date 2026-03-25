from whosper import WhosperTranscriber

# Initialize the transcriber
transcriber = WhosperTranscriber(model_id="CAYTU/whosper-large-v2")

# Transcribe an audio file
result = transcriber.transcribe_audio("/Users/tzhang/Downloads/utterance.wav")
print(result)

