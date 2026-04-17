import { setAudioModeAsync } from 'expo-audio';

export async function configureForRecording(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });
}

export async function configureForPlayback(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
  });
}
