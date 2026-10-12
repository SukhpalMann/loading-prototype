# How the video was recorded

The 90-second video is a screen recording of the prototype. It was not captured by hand. A script drives the prototype in a headless browser and renders the video one frame at a time, and a second script fits the picture to the narration.

- [`rec.mjs`](rec.mjs) is the recorder and the storyboard.
- [`cues.json`](cues.json) is the narration, line by line, with the caption shown for each line.
- [`fit.py`](fit.py) and [`align_ps.py`](align_ps.py) fit the picture to a voice recording, and [`finish.sh`](finish.sh) runs the whole last step.
- [`serve.mjs`](serve.mjs) serves the production build locally. [`ref.marks.json`](ref.marks.json) and [`expected.json`](expected.json) are the storyboard's nominal timing and a reference reading's line lengths, both used by `fit.py`.

## Why a script

A hand recording has to be redone whenever the prototype changes, and its timing is fixed by how fast the clicks happened. This recording can be made again from any build, and its timing follows the voice.

## How the picture is made

1. The page's JavaScript clock is paused and stepped forward by one frame at a time, so timers fire at the same moments on every run.
2. Every CSS and Web Animations animation is paused and moved to the same virtual time before each frame is captured. The squares that fly into their lanes are real animations from the prototype, sampled at 30 frames a second.
3. Clicks are real mouse events sent to the page. The pointer in the video is drawn over the page and follows them.
4. The camera is a crop. Each frame is captured through the DevTools protocol at the crop's own scale, so zoomed text is rendered at full resolution and not enlarged from a smaller picture.
5. The frames are piped to ffmpeg and encoded as H.264 at 1920 by 1080.

The bar along the bottom, the captions, the spotlight and the end card are drawn by the recorder. Everything else on screen is the prototype.

## How the picture is fitted to the voice

The storyboard has sixteen anchors, one for each line of the narration. An anchor is the moment the picture should have reached when that line begins.

1. `NOREC=1 node video/rec.mjs <url> ref.mp4` walks the storyboard without capturing and writes `ref.marks.json`: when each anchor is reached at the nominal pace, and how much of the time before it can be stretched.
2. `python3 video/fit.py voice.m4a` finds where each line starts and ends in the recording. It does this two ways and compares them: forced alignment of the script's words with PocketSphinx, and a method that uses only pauses and line lengths. It then schedules the lines, tightens pauses if the result would pass 90 seconds, and writes a voice track and `timings.json`.
3. `node video/rec.mjs <url> out.mp4 timings.json` renders the picture again. The holds between two anchors are stretched or squeezed so each anchor lands with its line.
4. ffmpeg joins the picture and the voice.

[`finish.sh`](finish.sh) runs steps 2 to 4 and checks that the result is under 90 seconds.

## Running it

```sh
npm run build
node video/serve.mjs .output 4214 &   # serves the production build
node video/rec.mjs http://127.0.0.1:4214/ out.mp4
DRAFT=1 node video/rec.mjs http://127.0.0.1:4214/ draft.mp4   # a fast pass at low resolution
CAPS=0 node video/rec.mjs http://127.0.0.1:4214/ out.mp4      # without captions
```

The recorder needs Playwright, sharp and ffmpeg. The fitting step needs Python with numpy and pocketsphinx. None of these is in this project's `package.json`, because the app does not use them.
