# Voice fixtures

`jfk-4s.wav` — the first four seconds of John F. Kennedy's 1961 inaugural
address ("And so, my fellow Americans, ask not…"), 16 kHz mono 16-bit PCM,
128 KB. Cut on 2026-08-25 from `jfk.wav` in the transformers.js docs
(https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav),
the same clip whisper.cpp ships as its sample. A speech of a sitting US
president is a US government work and in the public domain.

It exists so `npm run voice:install` can prove the transcriber runs on this
machine against words whose transcript is known — silence is no proof, because
Whisper invents a word in it (D-265). No Telegram voice note is kept here:
those live under the gitignored `.agentlings/voice/`.
