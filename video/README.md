# How the video was recorded

The 90-second video is a screen recording of the prototype. It was not captured by hand. A script drives the prototype in a headless browser and renders the video one frame at a time.

- [`rec.mjs`](rec.mjs) is the recorder and the storyboard.
- [`cues.json`](cues.json) is the narration, line by line, with the time each line is spoken.

## Why a script

A hand recording has to be redone whenever the prototype changes, and its timing is fixed by how fast the clicks happened. This recording can be made again from any build, and each scene's length is a parameter.

## How it works

1. The page's JavaScript clock is paused and stepped forward by one frame at a time, so timers fire at the same moments on every run.
2. Every CSS and Web Animations animation is paused and moved to the same virtual time before each frame is captured. The squares that fly into their lanes are real animations from the prototype, sampled at 30 frames a second.
3. Clicks are real mouse events sent to the page. The pointer in the video is drawn over the page and follows them.
4. The camera is a crop. Each frame is captured through the DevTools protocol at the crop's own scale, so zoomed text is rendered at full resolution and not enlarged from a smaller picture.
5. The frames are piped to ffmpeg and encoded as H.264 at 1920 by 1080.

The bar along the bottom of the video and the end card are drawn by the recorder. Everything else on screen is the prototype.

## Running it

```sh
npm run build                      # then serve the production build on a local port
node video/rec.mjs http://127.0.0.1:4212/ out.mp4
DRAFT=1 node video/rec.mjs http://127.0.0.1:4212/ draft.mp4   # a fast pass at low resolution
```

It needs Playwright, sharp and ffmpeg. They are not in this project's `package.json`, because the app does not use them.
