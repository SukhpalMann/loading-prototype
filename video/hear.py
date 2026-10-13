#!/usr/bin/env python3
"""Writes down what is said in a recording, so captions can be checked against the spoken words.

  python3 hear.py <model folder> <audio file> [more audio files]

Claude cannot listen to audio. This is the nearest thing to it: an open speech recogniser
(Whisper, run on this machine by sherpa-onnx) transcribes each file. It was run on the narration
line by line, after fit.py had cut the recording into its sixteen lines, to confirm that no word
was clipped and that every caption follows what was said.

Models are on https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models, for example
sherpa-onnx-whisper-small.en. It needs `pip install sherpa-onnx numpy` and ffmpeg. Whisper reads
at most 30 seconds at a time, so longer audio has to be given in pieces.
"""
import glob
import os
import subprocess
import sys

import numpy as np
import sherpa_onnx


def load(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def recogniser(folder):
    def one(pattern):
        found = sorted(glob.glob(os.path.join(folder, pattern)))
        if not found:
            raise SystemExit(f"no {pattern} in {folder}")
        return found[0]

    return sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=one("*-encoder.int8.onnx"), decoder=one("*-decoder.int8.onnx"), tokens=one("*-tokens.txt"),
        language="en", task="transcribe", num_threads=4,
    )


def hear(rec, samples):
    stream = rec.create_stream()
    stream.accept_waveform(16000, samples)
    rec.decode_stream(stream)
    return stream.result.text.strip()


if __name__ == "__main__":
    rec = recogniser(sys.argv[1])
    for path in sys.argv[2:]:
        samples = load(path)
        if len(samples) > 30 * 16000:
            print(os.path.basename(path), "| longer than 30 seconds: give it in pieces")
            continue
        print(os.path.basename(path), "|", hear(rec, samples))
