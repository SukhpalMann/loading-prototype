# How the video was recorded

The 90-second video is a screen recording of the prototype. It was not captured by hand. A script drives the prototype in a headless browser and renders the video one frame at a time.

- [`rec.mjs`](rec.mjs) is the recorder and the storyboard.
- [`cues.json`](cues.json) holds the captions, line by line.
- [`serve.mjs`](serve.mjs) serves the production build locally.

## Why a script

A hand recording has to be redone whenever the prototype changes, and its timing is fixed by how fast the clicks happened. This recording can be made again from any build.

## How the picture is made

1. The page's JavaScript clock is paused and stepped forward by one frame at a time, so timers fire at the same moments on every run.
2. Every CSS and Web Animations animation is paused and moved to the same virtual time before each frame is captured. The squares that fly into their lanes are real animations from the prototype, sampled at 30 frames a second.
3. Clicks are real mouse events sent to the page. The pointer in the video is drawn over the page and follows them.
4. The camera is a crop. Each frame is captured through the DevTools protocol at the crop's own scale, so zoomed text is rendered at full resolution and not enlarged from a smaller picture.
5. The frames are piped to ffmpeg and encoded as H.264 at 1920 by 1080.

The bar along the bottom, the captions, the spotlight and the end card are drawn by the recorder. Everything else on screen is the prototype.

## Running it

```sh
npm run build
node video/serve.mjs .output 4214 &   # serves the production build
node video/rec.mjs http://127.0.0.1:4214/ out.mp4
DRAFT=1 node video/rec.mjs http://127.0.0.1:4214/ draft.mp4   # a fast pass at low resolution
CAPS=0 node video/rec.mjs http://127.0.0.1:4214/ out.mp4      # without captions
```

The recorder needs Playwright, sharp and ffmpeg. None of these is in this project's `package.json`, because the app does not use them.
