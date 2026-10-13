// Records the Second Attempt prototype as a silent video, frame by frame.
//
// Nothing here runs in real time. The page's JavaScript clock is paused and stepped by one
// frame at a time, every CSS and Web Animations animation is paused and seeked to the same
// virtual time, and each frame is captured through the DevTools protocol at the camera's crop.
// So the result is the same on every run, and its timing can be changed.
//
//   node rec.mjs <base url> <out.mp4> [timings.json]
//   DRAFT=1 for a fast low-resolution pass.
//
// Without a timings file the storyboard plays at its nominal pace and writes <out>.marks.json,
// which records when each anchor was reached. A timings file gives each anchor a target time.
// The waits between two anchors are then stretched or squeezed so the picture reaches the next
// anchor on time.
//
// It is not part of the app. It needs Playwright, sharp and ffmpeg, which are not in this
// project's package.json.

import { chromium } from "playwright";
import sharp from "sharp";
import { spawn } from "node:child_process";
import fs from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:4210/";
const OUT = process.argv[3] || "second-attempt-silent.mp4";
const TIMINGS = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], "utf8")) : {};
const DRAFT = !!process.env.DRAFT;
const FPS = DRAFT ? 10 : 30;
const VW = 1280;
const VH = 720;
const OW = DRAFT ? 960 : 1920;
const OH = DRAFT ? 540 : 1080;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null; // record only these scenes
const CAPTURE = !process.env.NOREC; // NOREC=1 walks the storyboard without capturing, to time it
// Captions, line by line. CAPS=0 leaves them out.
const CUES =
  process.env.CAPS === "0"
    ? []
    : JSON.parse(fs.readFileSync(new URL("./cues.json", import.meta.url), "utf8"));
const CAPTIONS = CUES.map((c, i) => ({
  text: c.caption ?? c.say,
  from: TIMINGS.lines?.[i] ?? c.from,
  to: (TIMINGS.line_ends?.[i] ?? c.to) + 0.3,
}));
CAPTIONS.forEach((c, i) => {
  const next = CAPTIONS[i + 1];
  if (next) c.to = Math.min(c.to, next.from - 0.1);
});

// ---------- browser ----------
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1.5,
});
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror " + e.message));
const T0 = new Date("2026-10-12T09:00:00+05:30");
await page.clock.install({ time: T0 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// Let the opening sort play out, then go back to the one-link view. Recording starts from there.
await page.clock.pauseAt(new Date(T0.getTime() + 6000));
await page.waitForTimeout(1700);
const cdp = await ctx.newCDPSession(page);

// ---------- in-page runtime ----------
await page.evaluate(() => {
  const root = document.createElement("div");
  root.id = "__rec";
  root.innerHTML = `
    <style>
      #__rec { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: "Mukta", "Anek Latin", system-ui, sans-serif; }
      #__rec .hl { position: fixed; left: 0; top: 0; border-radius: 14px; box-shadow: 0 0 0 4000px rgba(8, 15, 28, 0.56); opacity: 0; }
      #__rec .bar { position: fixed; left: 0; top: 0; width: 1280px; height: 30px; transform-origin: 0 0; opacity: 0; white-space: nowrap;
        background: #0a1322; border-top: 1px solid rgba(255, 255, 255, 0.16); display: flex; align-items: center; justify-content: space-between; padding: 0 20px 1px; font-size: 13px; color: #7f90a8; }
      #__rec .bar .chs { display: flex; align-items: center; gap: 20px; }
      #__rec .bar .ch { display: flex; align-items: center; gap: 7px; font-weight: 500; }
      #__rec .bar .ch b { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: #22324a; color: #9fb0c6; font-family: "Anek Latin", sans-serif; font-weight: 700; font-size: 11.5px; }
      #__rec .bar .ch.on { color: #fff; font-weight: 600; }
      #__rec .bar .ch.on b { background: #fff; color: #0a1322; }
      #__rec .bar .wm { color: #8fa0b8; }
      #__rec .cap { position: fixed; left: 0; top: 0; z-index: 2; box-sizing: content-box; transform-origin: 0 0; opacity: 0; max-width: 1010px; text-align: center; text-wrap: balance;
        background: rgba(8, 15, 28, 0.92); color: #fff; font-size: 23px; line-height: 1.3; font-weight: 600; padding: 7px 20px 10px; border-radius: 11px; box-shadow: 0 8px 24px rgba(8, 15, 28, 0.3); }
      #__rec .ring { position: fixed; left: 0; top: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 999px; border: 2.5px solid rgba(79, 125, 249, 0.95); background: rgba(79, 125, 249, 0.2); opacity: 0; }
      #__rec .cur { position: fixed; left: 0; top: 0; z-index: 3; width: 24px; height: 24px; transform-origin: 3px 2px; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35)); }
      #__rec .end { position: fixed; inset: 0; z-index: 1; background: #0f1b2d; color: #fff; display: grid; place-items: center; text-align: center; opacity: 0; }
      #__rec .end .dots { display: inline-flex; gap: 7px; margin-right: 16px; vertical-align: 6px; }
      #__rec .end .dots i { width: 22px; height: 22px; border-radius: 5px; display: block; }
      #__rec .end h1 { font-family: "Anek Latin", sans-serif; font-stretch: 84%; font-weight: 700; font-size: 76px; line-height: 1; margin: 0; letter-spacing: -0.01em; }
      #__rec .end .tag { font-family: "Anek Latin", sans-serif; font-stretch: 92%; font-weight: 500; font-size: 27px; color: #e7edf5; margin-top: 16px; }
      #__rec .end .url { font-size: 24px; font-weight: 600; margin-top: 44px; }
      #__rec .end .who { font-size: 18px; color: #a7b6cb; margin-top: 8px; }
      #__rec .end .fine { font-size: 15px; color: #7f8fa6; margin-top: 46px; }
    </style>
    <div class="hl"></div>
    <div class="bar"><div class="chs"></div><div class="wm">Concept prototype. Synthetic data, simulated outcomes.</div></div>
    <div class="cap"></div>
    <div class="ring"></div>
    <svg class="cur" viewBox="0 0 24 24"><path d="M4 2 L4 19.5 L8.6 15.4 L11.7 22 L14.6 20.7 L11.6 14.3 L17.8 14.3 Z" fill="#0b1220" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
    <div class="end"><div>
      <h1><span class="dots"><i style="background:#0ea5a0"></i><i style="background:#c97f0a"></i><i style="background:#4f7df9"></i><i style="background:#d6336c"></i></span>Second Attempt</h1>
      <div class="tag">A failed payment does not always call for a payment link.</div>
      <div class="url">second-attempt-recovery.lovable.app</div>
      <div class="who">Sukhpal Singh Mann &nbsp;·&nbsp; Razorpay x ISB AI PM Build Challenge, Track 2</div>
      <div class="fine">Concept prototype. All data is synthetic. Not a Razorpay product.</div>
    </div></div>`;
  document.documentElement.appendChild(root);
  const q = (s) => root.querySelector(s);
  const born = new WeakMap();
  const tick = () =>
    new Promise((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = () => r();
      c.port2.postMessage(0);
    });
  window.__recFrame = async (s) => {
    await tick();
    await tick();
    if (Math.abs(window.scrollY - s.scrollY) > 0.01) window.scrollTo(0, s.scrollY);
    if (s.inner) {
      const el = document.querySelector(s.inner.sel);
      if (el) el.scrollTop = s.inner.y;
    }
    for (const a of document.getAnimations()) {
      let b = born.get(a);
      if (b === undefined) {
        b = s.vt;
        born.set(a, b);
        try {
          a.pause();
        } catch {}
      }
      const t = s.vt - b;
      const end = a.effect?.getComputedTiming?.().endTime ?? Infinity;
      try {
        if (Number.isFinite(end) && t >= end) a.finish();
        else a.currentTime = t;
      } catch {}
    }
    const z = s.clip.z;
    const bar = q(".bar");
    if (bar.dataset.key !== s.bar.key) {
      bar.dataset.key = s.bar.key;
      bar.firstElementChild.innerHTML = s.bar.chapters
        .map((c, i) => `<span class="ch${i === s.bar.on ? " on" : ""}"><b>${i + 1}</b>${c}</span>`)
        .join("");
    }
    bar.style.opacity = String(s.bar.o);
    bar.style.transform = `translate(${s.clip.x}px, ${s.clip.y + (720 - 30) / z}px) scale(${1 / z})`;
    const cap = q(".cap");
    if (cap.dataset.t !== s.cap.text) {
      // Size the box to the widest line, so it hugs text that wraps onto two balanced lines.
      cap.dataset.t = s.cap.text;
      cap.style.transform = "none";
      cap.style.width = "";
      cap.textContent = s.cap.text;
      if (s.cap.text) {
        const range = document.createRange();
        range.selectNodeContents(cap);
        let widest = 0;
        for (const r of range.getClientRects()) widest = Math.max(widest, r.width);
        cap.style.width = Math.ceil(widest) + 2 + "px";
      }
    }
    cap.style.opacity = String(s.cap.o);
    if (s.cap.o > 0) {
      const cw = cap.offsetWidth;
      const ch = cap.offsetHeight;
      cap.style.transform = `translate(${s.clip.x + (640 - cw / 2) / z}px, ${s.clip.y + (720 - 30 - 16 - ch) / z}px) scale(${1 / z})`;
    }
    const hl = q(".hl");
    hl.style.opacity = String(s.hl.o);
    hl.style.transform = `translate(${s.hl.x}px, ${s.hl.y}px)`;
    hl.style.width = s.hl.w + "px";
    hl.style.height = s.hl.h + "px";
    const ring = q(".ring");
    ring.style.opacity = String(s.ring.o);
    ring.style.transform = `translate(${s.ring.x}px, ${s.ring.y}px) scale(${s.ring.s})`;
    const cur = q(".cur");
    cur.style.opacity = String(s.cur.o);
    cur.style.transform = `translate(${s.cur.x - 3}px, ${s.cur.y - 2}px) scale(${s.cur.press ? 0.86 : 1})`;
    q(".end").style.opacity = String(s.end);
    return document.getAnimations().length;
  };
});

// ---------- engine ----------
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
let frameIdx = 0;
let T = 0; // seconds of video rendered so far
const cam = { cx: VW / 2, cy: VH / 2, z: 1 };
const cur = { x: 700, y: 520, o: 1, press: 0 };
const scr = { y: 0 };
let inner = null; // { sel, y } for a scrollable box inside the page
const CHAPTERS = [
  "The problem",
  "The idea",
  "The merchant decides",
  "A week, live",
  "What it achieved",
  "How it learns",
];
const bar = { o: 0, on: 0 };
const hl = { x: 0, y: 0, w: 0, h: 0, o: 0, docY: null };
const end = { o: 0 };
let ring = null; // { x, y, t0 }
const tweens = new Set();
const marks = [];
let recording = true;

function tween(obj, to, dur, fn = ease) {
  for (const t of tweens) if (t.obj === obj) for (const k of Object.keys(to)) delete t.to[k];
  const from = {};
  for (const k of Object.keys(to)) from[k] = obj[k];
  tweens.add({ obj, from, to: { ...to }, t0: T, dur: Math.max(dur, 1e-6), fn });
}
function stepTweens() {
  for (const t of tweens) {
    const p = Math.min(1, (T - t.t0) / t.dur);
    for (const k of Object.keys(t.to)) t.obj[k] = t.from[k] + (t.to[k] - t.from[k]) * t.fn(p);
    if (p >= 1) tweens.delete(t);
  }
}
function clipOf() {
  const w = VW / cam.z;
  const h = VH / cam.z;
  const x = Math.min(Math.max(cam.cx - w / 2, 0), VW - w);
  const y = Math.min(Math.max(cam.cy - h / 2, 0), VH - h);
  return { x, y, w, h, z: cam.z };
}

let ff = null;
let ffDone = null;
function startEncoder() {
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${OW}x${OH}`,
    "-r",
    String(FPS),
    "-i",
    "-",
    "-vf",
    "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    DRAFT ? "veryfast" : "slow",
    "-crf",
    DRAFT ? "24" : "16",
    "-refs",
    "4",
    "-level",
    "4.1",
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-movflags",
    "+faststart",
    "-r",
    String(FPS),
    OUT,
  ];
  ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  ffDone = new Promise((res, rej) =>
    ff.on("close", (code) => (code === 0 ? res() : rej(new Error("ffmpeg exit " + code)))),
  );
}
if (CAPTURE) startEncoder();

let lastMouse = { x: -1, y: -1 };
async function frame() {
  const next = frameIdx + 1;
  const dt = Math.round((next * 1000) / FPS) - Math.round((frameIdx * 1000) / FPS);
  T = next / FPS;
  stepTweens();
  if (Math.abs(cur.x - lastMouse.x) > 0.3 || Math.abs(cur.y - lastMouse.y) > 0.3) {
    await page.mouse.move(cur.x, cur.y);
    lastMouse = { x: cur.x, y: cur.y };
  }
  await page.clock.runFor(dt);
  const clip = clipOf();
  let r = { x: 0, y: 0, s: 0.3, o: 0 };
  if (ring) {
    const p = (T - ring.t0) / 0.5;
    if (p >= 1) ring = null;
    else r = { x: ring.x, y: ring.y, s: 0.35 + 0.95 * easeOut(p), o: 1 - p * p };
  }
  const hlNow = { ...hl, y: hl.docY === null ? hl.y : hl.docY - scr.y };
  let capNow = { text: "", o: 0 };
  for (const c of CAPTIONS) {
    if (T >= c.from - 0.05 && T < c.to) {
      const fade = 0.14;
      capNow = {
        text: c.text,
        o: Math.max(0, Math.min(1, (T - (c.from - 0.05)) / fade, (c.to - T) / fade)),
      };
      break;
    }
  }
  await page.evaluate((s) => window.__recFrame(s), {
    vt: Math.round((next * 1000) / FPS),
    scrollY: scr.y,
    inner,
    clip,
    bar: { o: bar.o, on: bar.on, chapters: CHAPTERS, key: String(bar.on) },
    cap: capNow,
    hl: hlNow,
    ring: r,
    cur,
    end: end.o,
  });
  frameIdx = next;
  if (!recording || !CAPTURE) return;
  const scale = (OW / VW) * clip.z;
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    optimizeForSpeed: true,
    captureBeyondViewport: false,
    clip: { x: clip.x, y: clip.y + scr.y, width: clip.w, height: clip.h, scale },
  });
  const raw = await sharp(Buffer.from(data, "base64"))
    .removeAlpha()
    .resize(OW, OH, { fit: "fill" })
    .raw()
    .toBuffer();
  if (!ff.stdin.write(raw)) await new Promise((res) => ff.stdin.once("drain", res));
}
// Time spent since the last anchor: `fixed` cannot be stretched (pointer travel, clicks, camera
// moves), `scaled` can (holds).
let accFixed = 0;
let accScaled = 0;
const waitRaw = async (sec) => {
  const n = Math.max(0, Math.round(sec * FPS));
  for (let i = 0; i < n; i++) await frame();
  return n / FPS;
};
const wait = async (sec) => {
  accFixed += await waitRaw(sec);
};

// ---------- helpers for the storyboard ----------
const rect = async (sel, opts = {}) => {
  const r = await page.evaluate(
    ({ sel, text, nth }) => {
      let els = [...document.querySelectorAll(sel)];
      if (text) els = els.filter((e) => e.textContent.replace(/\s+/g, " ").trim().includes(text));
      const el = els[nth ?? 0];
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    },
    { sel, ...opts },
  );
  if (!r) throw new Error(`not found: ${sel} ${JSON.stringify(opts)}`);
  return r;
};
const exists = (sel, opts = {}) =>
  page.evaluate(
    ({ sel, text }) => {
      let els = [...document.querySelectorAll(sel)];
      if (text) els = els.filter((e) => e.textContent.replace(/\s+/g, " ").trim().includes(text));
      return els.length > 0;
    },
    { sel, ...opts },
  );
const textOf = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);
const union = (...rs) => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
};
// Camera onto a rectangle given in viewport coordinates.
function camTo(r, { pad = 24, maxZ = 2, dur = 0.9, z } = {}) {
  const zz = z ?? Math.min(maxZ, VW / (r.w + 2 * pad), VH / (r.h + 2 * pad));
  tween(cam, { cx: r.x + r.w / 2, cy: r.y + r.h / 2, z: Math.max(1, zz) }, dur);
}
const camFull = (dur = 0.9) => tween(cam, { cx: VW / 2, cy: VH / 2, z: 1 }, dur);
const scrollTo = (y, dur = 0.9) => tween(scr, { y: Math.max(0, y) }, dur);
// Scroll so the rectangle's top lands at `top` in the viewport. By default this waits for the
// scroll and returns where the element then is. With hold: false it returns at once with the
// predicted place, so a camera move can run alongside the scroll.
async function bring(sel, opts = {}, { top = 90, dur = 0.9, hold = true } = {}) {
  const r = await rect(sel, opts);
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const target = Math.min(Math.max(0, scr.y + r.y - top), maxScroll);
  const dy = target - scr.y;
  scrollTo(target, dur);
  if (!hold) return { ...r, y: r.y - dy };
  await wait(dur);
  return await rect(sel, opts);
}
const stopScroll = () => {
  for (const t of tweens) if (t.obj === scr) tweens.delete(t);
  scr.y = 0;
};
async function moveTo(r, { dur = 0.7, fx = 0.5, fy = 0.5 } = {}) {
  tween(cur, { x: r.x + r.w * fx, y: r.y + r.h * fy }, dur);
  await wait(dur);
}
async function click() {
  await page.mouse.move(cur.x, cur.y);
  lastMouse = { x: cur.x, y: cur.y };
  ring = { x: cur.x, y: cur.y, t0: T };
  cur.press = 1;
  await page.mouse.down();
  await page.mouse.up();
  await wait(0.1);
  cur.press = 0;
}
async function clickOn(sel, opts = {}, mv = {}) {
  await moveTo(await rect(sel, opts), mv);
  await wait(0.12);
  await click();
}
function spotlight(r, { dur = 0.4, pad = 8 } = {}) {
  hl.x = r.x - pad;
  hl.docY = r.y - pad + scr.y;
  hl.w = r.w + 2 * pad;
  hl.h = r.h + 2 * pad;
  tween(hl, { o: 1 }, dur);
}
const spotOff = (dur = 0.35) => tween(hl, { o: 0 }, dur);
function chapter(n) {
  bar.on = n - 1;
  bar.o = 1;
}
// A hard cut: the camera snaps to the whole page, as it would between two shots.
function cut() {
  for (const t of tweens) if (t.obj === cam || t.obj === hl) tweens.delete(t);
  cam.cx = VW / 2;
  cam.cy = VH / 2;
  cam.z = 1;
  hl.o = 0;
}
// Click something without showing the pointer travel there. Used with a cut.
async function press(sel, opts = {}) {
  const r = await rect(sel, opts);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  lastMouse = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// ---------- scenes, anchors and pace ----------
const NOMINAL = { problem: 15.6, idea: 15.0, plan: 9.5, live: 22.9, results: 15.9, close: 8.0 };
const REF = TIMINGS.ref ?? null; // anchors of the nominal run: [{ name, at, fixed, scaled }], and the tail
const TARGET = TIMINGS.anchors ?? null; // anchor name -> the time it should be reached
let k = 1; // how much the holds are stretched in the current stretch of the storyboard
const w = async (sec) => {
  accScaled += sec;
  await waitRaw(sec * k);
};
async function anchor(name) {
  if (TARGET && TARGET[name] !== undefined) {
    const target = TARGET[name];
    if (T < target - 0.5 / FPS) await waitRaw(target - T);
    else if (T > target + 0.12) console.log(`  late at ${name} by ${(T - target).toFixed(2)}s`);
  }
  if (recording)
    marks.push({
      anchor: name,
      at: +T.toFixed(3),
      fixed: +accFixed.toFixed(3),
      scaled: +accScaled.toFixed(3),
    });
  accFixed = 0;
  accScaled = 0;
  k = 1;
  if (TARGET && REF) {
    const i = REF.anchors.findIndex((x) => x.name === name);
    const next = REF.anchors[i + 1] ?? null;
    const nextTarget = next ? TARGET[next.name] : TIMINGS.end;
    const seg = next ?? REF.tail;
    if (nextTarget !== undefined && seg && seg.scaled > 0) {
      k = Math.min(6, Math.max(0.12, (nextTarget - T - seg.fixed) / seg.scaled));
    }
  }
}
async function scene(name, fn) {
  if (ONLY && !ONLY.includes(name)) {
    recording = false;
    k = 0.05; // rush through skipped scenes so the page still reaches the right state
  } else {
    recording = true;
  }
  await anchor(name);
  const t0 = T;
  if (recording) marks.push({ scene: name, at: +T.toFixed(2) });
  await fn();
  if (recording) {
    if (!TARGET) {
      const left = NOMINAL[name] - (T - t0);
      if (left > 0.02) await w(left);
      if (left < -0.05)
        console.log(`  ${name} runs ${(-left).toFixed(2)}s over its nominal length`);
    }
    console.log(`${name}: ${(T - t0).toFixed(2)}s`);
  }
}
const cue = (label) => recording && marks.push({ cue: label, at: +T.toFixed(2) });

// Reset to the one-link view before the first frame.
{
  const b = await rect(".sa-seg--yard button", { text: "One link for all" });
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.waitForTimeout(1700);
  recording = false;
  await wait(0.2);
  recording = true;
  frameIdx = 0;
  T = 0;
  tweens.clear();
}

// 1. The problem: one link for all, and the 30 it misdirects.
await scene("problem", async () => {
  chapter(1);
  scr.y = 0;
  cur.x = 1010;
  cur.y = 300;
  // A slow push in on the headline, so the first seconds are not a still.
  tween(cam, { cx: 610, cy: 340, z: 1.06 }, 3.0 * k, (p) => p);
  await w(3.0);
  await anchor("p_slab");
  cue("the same link for everyone");
  const slab = await bring(".sa-slab", {}, { top: 84, dur: 1.2, hold: false });
  camTo({ x: slab.x, y: slab.y - 8, w: slab.w, h: slab.h + 8 }, { pad: 26, maxZ: 1.2, dur: 1.5 });
  await wait(1.5);
  const say = await rect(".sa-slab__big");
  await moveTo({ x: say.x - 34, y: say.y + 30, w: 10, h: 10 }, { dur: 0.9 });
  await w(3.0);
  await anchor("p_tokens");
  cue("thirty are wrong");
  const tokens = await rect(".sa-slab__tokens");
  const sub = await rect(".sa-slab__sub");
  camTo(union(tokens, sub), { pad: 44, maxZ: 1.45, dur: 1.3 });
  await moveTo(await rect(".sa-token--wrong", { nth: 12 }), { dur: 1.2 });
  await w(2.2);
  await moveTo({ x: sub.x - 16, y: sub.y + 8, w: 10, h: 10 }, { dur: 1.0 });
  await w(2.4);
});

// 2. The idea: read the record behind one failure, then sort all of them by cause.
await scene("idea", async () => {
  chapter(2);
  // One of the red squares: a payment that failed while its bank was down.
  await clickOn(
    '.sa-slab__tokens button[aria-label$="Wait, then retry"]',
    { nth: 1 },
    { dur: 0.8 },
  );
  cue("the record behind one failure: error code, downtime feed, what happened next");
  await w(0.3);
  const dr = await rect(".sa-drawer");
  const zd = 1.72;
  tween(cam, { cx: VW - VW / zd / 2, cy: VH / zd / 2, z: zd }, 0.8);
  const why = await rect(".sa-drawer .sa-why");
  await moveTo({ x: why.x - 6, y: why.y + 22, w: 10, h: 10 }, { dur: 0.8 });
  await w(1.8);
  const rows = await rect(".sa-drawer .sa-kv");
  inner = { sel: ".sa-drawer", y: 0 };
  tween(inner, { y: 70 }, 1.0);
  tween(cam, { cy: VH - VH / zd / 2 - 30 / zd }, 1.0);
  await moveTo({ x: rows.x - 6, y: 520, w: 10, h: 10 }, { dur: 1.0 });
  await w(1.8);
  // Close it, then sort.
  camFull(0.7);
  await moveTo({ x: dr.x - 220, y: 300, w: 10, h: 10 }, { dur: 0.5 });
  await click();
  inner = null;
  await w(0.25);
  await anchor("i_sort");
  await clickOn(".sa-seg--yard button", { text: "Second Attempt: four lanes" }, { dur: 0.7 });
  cue("then it sorts: the squares fly into lanes");
  await w(1.5);
  const lanes = await rect(".sa-lanes");
  const z = 1.5;
  tween(cam, { cx: VW / z / 2, cy: lanes.y + lanes.h / 2 - 4, z }, 0.9);
  await moveTo({ x: 170, y: lanes.y + 46, w: 10, h: 10 }, { dur: 0.9 });
  await w(0.5);
  cue("retry now, wait for the bank, do not ask again, another way to pay");
  tween(cam, { cx: VW - VW / z / 2 }, 3.3 * k);
  tween(cur, { x: 1040 }, 3.3 * k);
  await w(3.6);
});

// 3. The plan: every rule and message, the merchant's limits, one approval, one stop button.
await scene("plan", async () => {
  chapter(3);
  // Cut to the plan.
  await page.evaluate(() => window.scrollTo(0, 0));
  await press(".sa-step", { nth: 1 });
  stopScroll();
  cut();
  cur.x = 760;
  cur.y = 250;
  cue("every rule and message");
  await wait(0.5);
  const rule = await rect(".sa-rule.lane--retry_now");
  const lang = await rect(".sa-plan__bar");
  camTo(union(lang, rule), { pad: 16, maxZ: 1.5, dur: 0.8 });
  await clickOn(".sa-plan__lang button", { text: "Hinglish" }, { dur: 0.8 });
  await w(1.0);
  cue("a holdout and a discount cap");
  const guard = await rect(".sa-guard");
  camTo({ x: guard.x, y: guard.y - 6, w: guard.w, h: 410 }, { pad: 18, maxZ: 1.6, dur: 0.8 });
  await moveTo(await rect("#sa-holdout"), { dur: 0.8, fx: 0.34 });
  await w(0.6);
  await moveTo(await rect("#sa-cap"), { dur: 0.5, fx: 0.94 });
  await w(0.4);
  cue("approves once");
  const approve = await bring(
    ".sa-guard .sa-btn",
    { text: "Approve and start" },
    { top: 400, dur: 0.8, hold: false },
  );
  camTo({ x: guard.x, y: approve.y - 250, w: guard.w, h: 410 }, { pad: 18, maxZ: 1.6, dur: 0.8 });
  await moveTo(approve, { dur: 0.8 });
  await click();
  await w(0.6);
  await anchor("pl_stop");
  await clickOn(".sa-guard .sa-btn", { text: "Watch the week" }, { dur: 0.45 });
  stopScroll();
  cut();
  cue("one button stops everything");
  await page.evaluate(() => window.scrollTo(0, 0));
  scr.y = (await rect(".sa-console")).y - 30;
  await wait(0.35);
  const con = await rect(".sa-console");
  camTo({ x: con.x + con.w - 620, y: con.y - 14, w: 620, h: 349 }, { z: 1.45, dur: 0.7 });
  await moveTo(await rect(".sa-btn--stop"), { dur: 0.8 });
  await w(1.1);
});

// 4. The live week: a reply switches the link off, the reply test, and a bank downtime.
await scene("live", async () => {
  chapter(4);
  camFull(0.6);
  await clickOn(".sa-livebar .sa-btn", { text: "Play the week" }, { dur: 0.7 });
  cue("the week plays");
  // Hold time once the customer's reply has been handled.
  for (let i = 0; i < 12 * FPS; i++) {
    await frame();
    accFixed += 1 / FPS;
    if (await exists(".sa-ev", { text: "Link switched off" })) break;
  }
  await click();
  cue("she replies that the money was cut");
  const side = ".sa-live > div:last-child > .sa-side:last-child";
  const card = await bring(side, {}, { top: 46, dur: 0.9, hold: false });
  const zt = 1.6;
  tween(cam, { cx: VW - VW / zt / 2, cy: card.y + 268, z: zt }, 0.9);
  await wait(0.9);
  spotlight(await rect(side), { dur: 0.4, pad: 6 });
  const reply = await rect(".sa-bubble--in");
  await moveTo({ x: reply.x - 26, y: reply.y + 18, w: 10, h: 10 }, { dur: 0.7 });
  await w(1.1);
  tween(cam, { cy: cam.cy + 150 }, 0.9);
  await w(1.3);
  await anchor("l_feed");
  cue("the link is switched off");
  spotOff(0.3);
  const ev = await rect(".sa-ev", { nth: 0 });
  tween(cam, { cx: VW / zt / 2 + 14, cy: ev.y + 96, z: zt }, 0.8);
  await moveTo({ x: ev.x + 22, y: ev.y + ev.h / 2 + 2, w: 10, h: 10 }, { dur: 0.8 });
  await w(0.9);
  // The reply test, opened from the note under the thread.
  const link = await bring(".sa-live .sa-linkbtn", {}, { top: 470, dur: 0.8, hold: false });
  tween(cam, { cx: VW - VW / zt / 2, cy: 400, z: zt }, 0.8);
  await moveTo({ x: link.x + 90, y: link.y + link.h / 2, w: 10, h: 10 }, { dur: 0.8 });
  await click();
  cut();
  cue("the reply test opens");
  await w(0.3);
  inner = { sel: ".sa-modal__box", y: 0 };
  const box = await rect(".sa-modal__box");
  const scores = await rect(".sa-rt__scores");
  const zm = VW / (box.w + 8);
  tween(cam, { cx: VW / 2, cy: box.y + VH / zm / 2 - 4, z: zm }, 0.8);
  await moveTo({ x: scores.x + 190, y: scores.y + 52, w: 10, h: 10 }, { dur: 0.8 });
  await w(1.5);
  await moveTo({ x: scores.x + scores.w / 2 + 200, y: scores.y + 52, w: 10, h: 10 }, { dur: 0.6 });
  await w(0.9);
  await anchor("l_rows");
  cue("five of fifteen missed, the model none");
  const table = await rect(".sa-rt__table");
  tween(inner, { y: table.y - box.y - 92 }, 0.9);
  tween(cam, { cy: box.y + box.h - VH / zm / 2 + 4 }, 0.9);
  await moveTo({ x: box.x + box.w - 250, y: 330, w: 10, h: 10 }, { dur: 0.9 });
  await w(1.5);
  tween(inner, { y: table.y - box.y - 92 + 190 }, 2.2 * k);
  await w(2.4);
  // Close it and jump to the bank downtime.
  await anchor("l_down");
  camFull(0.5);
  await moveTo({ x: 80, y: 372, w: 10, h: 10 }, { dur: 0.5 });
  await click();
  inner = null;
  cue("messages wait while a bank is down");
  const con = await bring(".sa-console", {}, { top: 24, dur: 0.6 });
  await clickOn(".sa-moment--down", {}, { dur: 0.5 });
  await w(0.15);
  const tally = await rect(".sa-tally");
  camTo(union(con, tally), { pad: 10, maxZ: 1.12, dur: 0.6 });
  spotlight(await rect(".sa-tally > div", { nth: 2 }), { dur: 0.35 });
  await w(1.9);
  spotOff(0.3);
});

// 5. Results: read once against a holdout, then against one link.
await scene("results", async () => {
  chapter(5);
  // Cut to the results after the week has ended.
  await press(".sa-livebar .sa-btn", { text: "Skip to Sunday night" });
  await page.evaluate(
    () =>
      new Promise((r) => {
        const c = new MessageChannel();
        c.port1.onmessage = () => r();
        c.port2.postMessage(0);
      }),
  );
  await press(".sa-livebar .sa-btn", { text: "See what it achieved" });
  stopScroll();
  cut();
  cur.x = 520;
  cur.y = 120;
  await wait(0.9);
  await clickOn(".sa-res__bar .sa-seg button", { text: "12 weeks" }, { dur: 0.6 });
  cue("read once, against a holdout");
  await w(0.3);
  const h1 = await rect(".sa-h1");
  const zr = 1.9;
  const leftX = 16 + VW / zr / 2;
  tween(cam, { cx: leftX, cy: h1.y + 120, z: zr }, 0.9);
  await moveTo({ x: h1.x + 6, y: h1.y + 118, w: 10, h: 10 }, { dur: 0.9 });
  await w(1.7);
  await anchor("r_verdict");
  cue("about 1.2 lakh against no message");
  await bring(".sa-verdict", {}, { top: 330, dur: 1.0, hold: false });
  tween(cam, { cy: 300 }, 1.0);
  await wait(1.0);
  const verdict = await rect(".sa-verdict");
  await moveTo({ x: verdict.x + 30, y: verdict.y + verdict.h - 14, w: 10, h: 10 }, { dur: 0.7 });
  await w(2.0);
  await anchor("r_card");
  cue("against one link: 14,633 more, and 82 down to 13");
  const sel = ".sa-res > div:last-child .sa-card";
  const card = await bring(sel, { nth: 0 }, { top: 70, dur: 0.9, hold: false });
  camTo({ x: card.x, y: card.y, w: card.w, h: 330 }, { pad: 12, maxZ: 1.75, dur: 0.9 });
  await wait(0.9);
  spotlight(await rect(sel, { nth: 0 }), { dur: 0.35, pad: 4 });
  const row1 = await rect(`${sel} .sa-table tbody tr`, { nth: 0 });
  const row2 = await rect(`${sel} .sa-table tbody tr`, { nth: 1 });
  await moveTo({ x: row2.x + row2.w * 0.55, y: row2.y + row2.h / 2, w: 10, h: 10 }, { dur: 0.7 });
  await w(1.5);
  await moveTo({ x: row1.x + row1.w - 12, y: row1.y + row1.h / 2, w: 10, h: 10 }, { dur: 0.6 });
  await w(0.7);
  await moveTo({ x: row2.x + row2.w - 12, y: row2.y + row2.h / 2, w: 10, h: 10 }, { dur: 0.5 });
  await w(1.6);
  spotOff(0.3);
});

// 6. Close: how it learns, then the end card.
await scene("close", async () => {
  chapter(6);
  const learn = await bring(".sa-learn", {}, { top: 150, dur: 0.9, hold: false });
  const zl = 1.5;
  tween(cam, { cx: VW - VW / zl / 2, cy: learn.y + 150, z: zl }, 0.9);
  await moveTo({ x: learn.x - 12, y: learn.y + 14, w: 10, h: 10 }, { dur: 0.9 });
  await w(2.5);
  await anchor("c_end");
  cue("end card");
  tween(end, { o: 1 }, 0.6);
  tween(bar, { o: 0 }, 0.3);
  tween(cur, { o: 0 }, 0.3);
  camFull(0.6);
  await w(4.0);
});

if (TARGET && TIMINGS.end !== undefined && T < TIMINGS.end - 0.5 / FPS)
  await waitRaw(TIMINGS.end - T);
const tail = { fixed: +accFixed.toFixed(3), scaled: +accScaled.toFixed(3) };
if (CAPTURE) {
  ff.stdin.end();
  await ffDone;
}
const total = +(frameIdx / FPS).toFixed(2);
fs.writeFileSync(
  OUT.replace(/\.mp4$/, ".marks.json"),
  JSON.stringify(
    {
      fps: FPS,
      total,
      anchors: marks
        .filter((m) => m.anchor)
        .map((m) => ({ name: m.anchor, at: m.at, fixed: m.fixed, scaled: m.scaled })),
      tail,
      marks,
    },
    null,
    1,
  ),
);
console.log("total seconds:", total, "frames:", frameIdx);
console.log("page errors:", errors.length, errors.slice(0, 5));
await browser.close();
