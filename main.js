/**
 * SIMANTO MITRO — INTERACTIVE ENGINE
 * Canvas scroll film (193 frames: 1920x1080 desktop / 828x1840 portrait mobile, WebP)
 * GSAP + ScrollTrigger + Lenis. Respects prefers-reduced-motion.
 */
document.addEventListener('DOMContentLoaded', () => {
  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = window.innerWidth < 768;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));

  // =========================================================================
  // 1. LENIS SMOOTH SCROLL (skipped for reduced motion)
  // =========================================================================
  let lenis = null;
  if (typeof Lenis !== 'undefined' && hasGSAP && !reduceMotion) {
    lenis = new Lenis({
      duration: isTouch ? 1.0 : 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.15
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // =========================================================================
  // 2. CANVAS SCROLL FILM
  //    The frame set is chosen by viewport SHAPE, not width (Step 1): a
  //    portrait aspect (height > width) uses the dedicated 828x1840 portrait
  //    frames, anything wider uses the 1920x1080 landscape frames. Both sets
  //    are drawn true "cover", edge to edge, on every screen shape.
  //    Desktop: 1920x1080 landscape frames drawn "cover" (unchanged composition)
  //    Mobile:  dedicated 828x1840 portrait frames, pre-cropped around Simanto with the approved
  //             per-phase framing baked in (head clear in hero, mug clear in coffee moment).
  // =========================================================================
  const TOTAL_FRAMES = 193;
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const footerEl = document.getElementById('footer-section');
  const DARK = '#060b18';
  const MOBILE_FRAME_W = 828;

  const isPortraitViewport = () => window.innerHeight > window.innerWidth;
  let frameDir = isPortraitViewport() ? './frames-mobile' : './frames-desktop';
  const getFrameUrl = (n) => `${frameDir}/frame-${String(n).padStart(3, '0')}.webp`;

  let frameImages = new Array(TOTAL_FRAMES);
  let loadedIndices = new Set();
  let loadToken = 0;
  let targetProgress = 0;
  let smoothProgress = 0;
  let smoothY = 0;
  // Rotation swap (Step 1): while the viewport shape disagrees with the
  // active set, the incoming set preloads into this detached state; render()
  // cuts over only when the on-screen frame is decoded there. Null = no swap.
  let pendingSwap = null;
  // Step 2: section 5 assigns this hook; render() calls it with the exact
  // film frame so the story lines advance on the film's own clock (the one
  // master progress), never on a separate ScrollTrigger.
  let storyFrameHook = null;

  // =========================================================================
  // DECODE PIPELINE (audit Fix 1 + 1b): frames are decoded AHEAD of the playhead
  // so a draw never pays the WebP decode cost mid-scroll. Preferred path: decoded
  // ImageBitmaps in a bounded cache around the playhead. Fallback: img.decode()
  // lookahead. Last resort: the plain drawImage path (unchanged behaviour).
  // The film itself (images, mapping, timing) is never touched by this pipeline.
  // =========================================================================
  const DECODE_BEHIND_DESKTOP = 10, DECODE_AHEAD_DESKTOP = 60;
  // Perf pass (Cause 3): the mobile bitmap window shrinks to 4 behind / 8
  // ahead (~79 MB of decoded raster instead of ~152 MB), so browser evictions
  // stop forcing re-decodes at the playhead. Desktop values unchanged.
  const DECODE_BEHIND_MOBILE = 4, DECODE_AHEAD_MOBILE = 8;
  const MAX_DECODE_ACTIVE = 5;
  const bitmaps = new Map();       // idx -> ImageBitmap (playhead window only)
  const imgDecoded = new Set();    // idx whose raster is decoded (bitmap or decode())
  const decodeQueued = new Set();  // idx with a decode job in flight
  let bitmapSupported = typeof window.createImageBitmap === 'function';
  let decodeActiveCount = 0;
  let decodeToken = 0;             // bumped on reset so stale jobs drop their results
  let playheadIdx = 0;
  let frameSetDirty = true;        // a new frame arrived: the settled-skip must not skip
  let loaderNudge = null;          // mobile loader re-pump hook (perf pass): set by startLoading

  // Frame indices of the character crossing. Desktop: frames ~40-135. The mobile film
  // reaches the same story beats at units ~20-85 of 95, i.e. frames ~40-172.
  function crossingRange() {
    return frameDir.indexOf('mobile') !== -1 ? [40, 171] : [39, 134];
  }
  function decodeWindowRange() {
    const mobileFrames = frameDir.indexOf('mobile') !== -1;
    const behind = mobileFrames ? DECODE_BEHIND_MOBILE : DECODE_BEHIND_DESKTOP;
    const ahead = mobileFrames ? DECODE_AHEAD_MOBILE : DECODE_AHEAD_DESKTOP;
    return [
      Math.max(0, playheadIdx - behind),
      Math.min(TOTAL_FRAMES - 1, playheadIdx + ahead)
    ];
  }
  function resetDecodePipeline() {
    decodeToken++;
    bitmaps.forEach((bmp) => { try { bmp.close(); } catch (e) {} });
    bitmaps.clear();
    imgDecoded.clear();
    decodeQueued.clear();
    playheadIdx = 0;
  }
  function startDecodeJob(idx, asBitmap) {
    const img = frameImages[idx];
    if (!img) return;
    decodeQueued.add(idx);
    decodeActiveCount++;
    const tk = decodeToken;
    const done = () => {
      decodeActiveCount--;
      decodeQueued.delete(idx);
      pumpDecodes();
    };
    if (asBitmap && bitmapSupported) {
      // Perf pass (Part 3): on desktop, decode the bitmap ALREADY SCALED to
      // the size drawDesktop will paint (cover-fit of the current canvas),
      // so the per-frame draw is a near 1:1 blit instead of a full 1920x1080
      // high-quality resample on every rAF. The cover geometry is
      // scale-invariant, so drawDesktop's math lands identically. Mobile
      // frames are already near canvas size (and drawMobile needs the true
      // source dims), so mobile keeps the plain bitmap.
      let bmpPromise;
      try {
        if (frameDir.indexOf('mobile') === -1 && canvas && canvas.width && img.naturalWidth) {
          const sc = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
          bmpPromise = createImageBitmap(img, {
            resizeWidth: Math.ceil(img.naturalWidth * sc),
            resizeHeight: Math.ceil(img.naturalHeight * sc),
            resizeQuality: 'high'
          });
        } else {
          bmpPromise = createImageBitmap(img);
        }
      } catch (e) {
        bmpPromise = createImageBitmap(img);
      }
      bmpPromise.then((bmp) => {
        if (tk !== decodeToken) { try { bmp.close(); } catch (e) {} return; }
        bitmaps.set(idx, bmp);
        imgDecoded.add(idx);
        // Step 1: if the held frame just became drawable, wake the rAF loop
        // (its settled-skip would otherwise keep the held frame on screen).
        if (Math.abs(idx - playheadIdx) <= 2) frameSetDirty = true;
      }).catch(() => {
        // Bitmap path failed (e.g. Safari/WebP quirk): fall back to decode() for good.
        if (tk === decodeToken) bitmapSupported = false;
      }).then(done, done);
    } else {
      const p = img.decode ? img.decode() : Promise.resolve();
      p.then(() => {
        if (tk === decodeToken) {
          imgDecoded.add(idx);
          if (Math.abs(idx - playheadIdx) <= 2) frameSetDirty = true;
        }
      }, () => {}).then(done, done);
    }
  }
  function nextDecodeJob() {
    // 1) Playhead window first: bitmaps (or decode() where bitmaps are unsupported),
    //    nearest first with a bias toward frames ahead of the playhead.
    const [lo, hi] = decodeWindowRange();
    let best = -1, bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      if (!loadedIndices.has(i) || decodeQueued.has(i)) continue;
      if (bitmapSupported ? bitmaps.has(i) : imgDecoded.has(i)) continue;
      const d = i < playheadIdx ? (playheadIdx - i) * 1.5 : (i - playheadIdx);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) return { idx: best, bitmap: bitmapSupported };
    // 2) Crossing segment: decode() every frame at full density, ahead of arrival,
    //    until the playhead has passed the end of the crossing. DESKTOP ONLY
    //    (perf pass, Cause 3): on mobile this pass pushed 132 rasters (~800 MB)
    //    the browser cannot hold, so evictions forced re-decodes at the
    //    playhead; mobile now decodes only the live window in step 1.
    const [ca, cb] = crossingRange();
    if (frameDir.indexOf('mobile') === -1 && playheadIdx <= cb) {
      best = -1; bestD = Infinity;
      for (let i = ca; i <= cb; i++) {
        if (!loadedIndices.has(i) || decodeQueued.has(i) || imgDecoded.has(i)) continue;
        const d = Math.abs(i - playheadIdx);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) return { idx: best, bitmap: false };
    }
    // 3) Warm pass (Step 1): decode() — never bitmaps — the loaded frames
    //    further ahead of the bitmap window, nearest first. This is what the
    //    idle-time pump spends its spare slots on, so a fast scroll finds
    //    the road ahead already decoded instead of paying decode at draw.
    const warmAhead = frameDir.indexOf('mobile') !== -1 ? 40 : 80;
    best = -1; bestD = Infinity;
    for (let i = playheadIdx + 1; i <= Math.min(TOTAL_FRAMES - 1, playheadIdx + warmAhead); i++) {
      if (!loadedIndices.has(i) || decodeQueued.has(i) || imgDecoded.has(i)) continue;
      const d = i - playheadIdx;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) return { idx: best, bitmap: false };
    return null;
  }
  function pumpDecodes() {
    while (decodeActiveCount < MAX_DECODE_ACTIVE) {
      const job = nextDecodeJob();
      if (!job) return;
      startDecodeJob(job.idx, job.bitmap);
    }
  }
  function updateDecodeWindow(exactFrame) {
    const prevPlayhead = playheadIdx;
    playheadIdx = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(exactFrame)));
    // Perf pass: the mobile fetch window follows the playhead; when it moves,
    // give the loader a chance to fetch the frames rolling into range.
    if (loaderNudge && playheadIdx !== prevPlayhead) loaderNudge();
    // Evict bitmaps that fell out of the window (with a small hysteresis margin) so
    // decoded memory stays bounded on phones; evicted frames simply re-decode later.
    const [lo, hi] = decodeWindowRange();
    bitmaps.forEach((bmp, idx) => {
      if (idx < lo - 2 || idx > hi + 2) {
        try { bmp.close(); } catch (e) {}
        bitmaps.delete(idx);
      }
    });
    pumpDecodes();
  }

  // Idle-time decoding (Step 1): when the main thread is free, keep the
  // decode pump fed so the warm pass above pre-decodes ahead of the
  // playhead even while the page sits still.
  if ('requestIdleCallback' in window) {
    const idlePump = () => { pumpDecodes(); requestIdleCallback(idlePump, { timeout: 1500 }); };
    requestIdleCallback(idlePump, { timeout: 1500 });
  }

  let lastCanvasW = 0;
  let lastCanvasH = 0;
  let lastBitmapKey = '';
  function resizeCanvas() {
    if (!canvas) return;
    // Step 1: the frame set follows the viewport SHAPE, and a shape change
    // no longer cold-restarts the loader. The incoming set preloads
    // underneath (startPendingSwap) and render() cuts over when ready; the
    // active set keeps drawing in the meantime. Rotating back cancels.
    const portraitNow = isPortraitViewport();
    const wantDir = portraitNow ? './frames-mobile' : './frames-desktop';
    if (wantDir !== frameDir) startPendingSwap(wantDir);
    else pendingSwap = null;
    // Perf pass (Part 3): cap the film canvas at 1.5x device pixels. Above
    // that the extra pixels are not visible at film viewing distance, but
    // every draw pays for them; 1.5 keeps the picture sharp and the scroll
    // smooth on PC (Boss's hang report).
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Portrait viewports: never allocate a canvas bigger than the source frame (sharp + cheaper to fill)
    if (portraitNow) dpr = Math.min(dpr, MOBILE_FRAME_W / window.innerWidth);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    lastCanvasW = window.innerWidth;
    lastCanvasH = window.innerHeight;
    // Pre-scaled bitmaps are sized for one canvas size: if the canvas (or
    // the frame set) changed size, drop the decoded cache so it rebuilds at
    // the new draw size instead of silently resampling every frame.
    const bitmapKey = canvas.width + 'x' + canvas.height + ':' + frameDir;
    if (lastBitmapKey && bitmapKey !== lastBitmapKey) resetDecodePipeline();
    lastBitmapKey = bitmapKey;
    computeMobileKeys();
    render();
  }
  // Resize guard (audit Fix 3): mobile URL bars show/hide DURING scroll and fire resize
  // with the same width and a small height delta. Reallocating the canvas for those is a
  // mid-scroll jank storm, so ignore them; debounce everything else; real changes
  // (rotation, split-screen) alter the width and always pass.
  let resizeTimer = 0;
  function handleResize() {
    if (lastCanvasW
      && window.innerWidth === lastCanvasW
      && Math.abs(window.innerHeight - lastCanvasH) < 120) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  window.addEventListener('load', () => computeMobileKeys());

  // Progressive loading: frame 1 first (instant hero), then everything else
  // starts IMMEDIATELY (Step 1: the old window-load gates are gone, so the
  // playhead can no longer outrun a loader that has not started). Desktop
  // fetches the whole film in a sparse order (every 8th frame, then every
  // 4th, then fill the gaps) at concurrency 8, so the whole journey is
  // coarsely scrubbable early. Mobile (perf pass, Cause 1) loads by
  // DISTANCE TO THE PLAYHEAD instead: a rolling window +80 ahead of the
  // playhead (Step 1, widened from +40), so the first scroll no longer
  // competes with a 4.63 MB download + decode storm.
  // adopt=true is the rotation cut-over: the incoming set's preloaded
  // frames (pendingSwap) are kept and the loader only tops up the rest.
  function startLoading(adopt) {
    const token = ++loadToken;
    if (!adopt) {
      frameImages = new Array(TOTAL_FRAMES);
      loadedIndices = new Set();
      resetDecodePipeline();
    }
    const loadOne = (idx, done) => {
      if (loadedIndices.has(idx)) { done(); return; } // adopted swap frames
      const img = new Image();
      img.decoding = 'async';
      if (idx === 0 && 'fetchPriority' in img) img.fetchPriority = 'high';
      img.onload = () => {
        if (token !== loadToken) return;
        frameImages[idx] = img;
        loadedIndices.add(idx);
        frameSetDirty = true; // a nearer frame may now be drawable: force one render
        pumpDecodes();
        if (idx === 0) resizeCanvas();
        done();
      };
      img.onerror = () => { if (token === loadToken) done(); };
      img.src = getFrameUrl(idx + 1);
    };

    if (frameDir.indexOf('mobile') !== -1) {
      // ---- Mobile distance loader (perf pass, Cause 1) ----
      const FETCH_AHEAD = 80;   // rolling window: frames fetched ahead of the playhead (Step 1: widened from 40)
      const FETCH_BEHIND = 12;  // small look-behind, so a step back is instant
      const inFlight = new Set();
      let activeLoads = 0;
      let userScrolling = false;
      let scrollIdleTimer = 0;
      let pumpsStarted = false;
      const conn = navigator.connection || null;
      // Save-Data / slow links: fewer fetches in flight, a shorter window,
      // and no opportunistic top-up of far frames (see nextIndex).
      const slowLink = () => !!conn && (conn.saveData
        || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g');
      // While the user is actively scrolling, fetching yields some of the
      // network: concurrency drops 6 -> 5 and is restored when the scroll
      // rests. (Step 1: the dip is shallower than the old 6 -> 3, which let
      // the playhead outrun the fetch window mid-scroll.)
      const concurrency = () => (slowLink() ? 2 : (userScrolling ? 5 : 6));
      const nextIndex = () => {
        const ahead = slowLink() ? 16 : FETCH_AHEAD;
        const lo = Math.max(0, playheadIdx - FETCH_BEHIND);
        const hi = Math.min(TOTAL_FRAMES - 1, playheadIdx + ahead);
        let best = -1, bestD = Infinity;
        for (let i = lo; i <= hi; i++) {
          if (loadedIndices.has(i) || inFlight.has(i)) continue;
          const d = i < playheadIdx ? (playheadIdx - i) * 2 : (i - playheadIdx);
          if (d < bestD) { bestD = d; best = i; }
        }
        // Nothing outside the window is fetched at all: far frames load when
        // the playhead nears them (the loader is re-pumped on every playhead
        // move), and the draw path's nearest-frame fallback covers any gap
        // gracefully in the meantime. This is what keeps the download storm
        // out of the first scroll entirely.
        return best;
      };
      const pump = () => {
        if (token !== loadToken || !pumpsStarted) return;
        while (activeLoads < concurrency()) {
          const idx = nextIndex();
          if (idx < 0) return;
          inFlight.add(idx);
          activeLoads++;
          loadOne(idx, () => { activeLoads--; inFlight.delete(idx); pump(); });
        }
      };
      loaderNudge = pump; // updateDecodeWindow re-pumps as the playhead moves
      const onScrollActivity = () => {
        if (token !== loadToken) { window.removeEventListener('scroll', onScrollActivity); return; }
        userScrolling = true;
        clearTimeout(scrollIdleTimer);
        scrollIdleTimer = setTimeout(() => { userScrolling = false; pump(); }, 180);
      };
      window.addEventListener('scroll', onScrollActivity, { passive: true });
      if (conn && conn.addEventListener) conn.addEventListener('change', pump);
      const startPumps = () => { pumpsStarted = true; pump(); };
      // Step 1: pumps start as soon as frame 1 is in (this whole script runs
      // at DOMContentLoaded) — no waiting for window load or first scroll.
      loadOne(0, () => startPumps());
      return;
    }

    // ---- Desktop loader (Step 1): sparse pass, then fill, all immediate ----
    loaderNudge = null;
    const order = [];
    const seen = new Set([0]);
    for (let i = 8; i < TOTAL_FRAMES; i += 8) { order.push(i); seen.add(i); }
    for (let i = 4; i < TOTAL_FRAMES; i += 4) if (!seen.has(i)) { order.push(i); seen.add(i); }
    for (let i = 1; i < TOTAL_FRAMES; i++) if (!seen.has(i)) { order.push(i); seen.add(i); }
    let next = 0;
    const CONCURRENCY = 8;
    const pump = () => {
      if (token !== loadToken || next >= order.length) return;
      loadOne(order[next++], pump);
    };
    const startPumps = () => { for (let c = 0; c < CONCURRENCY; c++) pump(); };
    // Frame 1 first (instant hero); the moment it lands, the fill begins —
    // no window-load gate, no 300 ms wait (Step 1 fetch guarantee).
    loadOne(0, () => startPumps());
  }
  startLoading();

  // =========================================================================
  // ROTATION SWAP (Step 1): when the viewport shape changes, the incoming
  // frame set preloads UNDERNEATH the active one — matching frame first,
  // then outward, then a sparse pass — while the active set keeps drawing.
  // render() performs the cut-over (performSwap) only once the frame on
  // screen is decoded in the incoming set. No loader reset, no blank flash.
  // =========================================================================
  function startPendingSwap(wantDir) {
    if (pendingSwap && pendingSwap.dir === wantDir) return;
    const state = {
      dir: wantDir,
      images: new Array(TOTAL_FRAMES),
      loaded: new Set(),
      decoded: new Set(),
      inFlight: 0
    };
    pendingSwap = state;
    const matchIdx = Math.min(TOTAL_FRAMES - 1, Math.max(0, playheadIdx));
    const order = [];
    const seen = new Set();
    const push = (i) => { if (i >= 0 && i < TOTAL_FRAMES && !seen.has(i)) { seen.add(i); order.push(i); } };
    push(matchIdx);
    for (let d = 1; d <= 80; d++) { push(matchIdx + d); push(matchIdx - d); }
    for (let i = 8; i < TOTAL_FRAMES; i += 8) push(i);
    for (let i = 4; i < TOTAL_FRAMES; i += 4) push(i);
    for (let i = 1; i < TOTAL_FRAMES; i++) push(i);
    let next = 0;
    const CONCURRENCY = 3;
    const pump = () => {
      if (pendingSwap !== state) return; // superseded or rotated back
      while (state.inFlight < CONCURRENCY && next < order.length) {
        const idx = order[next++];
        if (state.loaded.has(idx)) continue;
        state.inFlight++;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          state.inFlight--;
          state.images[idx] = img;
          state.loaded.add(idx);
          const mark = () => { state.decoded.add(idx); if (idx === matchIdx) frameSetDirty = true; };
          if (img.decode) img.decode().then(mark, mark); else mark();
          pump();
        };
        img.onerror = () => { state.inFlight--; pump(); };
        img.src = state.dir + '/frame-' + String(idx + 1).padStart(3, '0') + '.webp';
      }
    };
    pump();
  }
  function performSwap() {
    const incoming = pendingSwap;
    pendingSwap = null;
    frameDir = incoming.dir;
    frameImages = incoming.images;
    loadedIndices = incoming.loaded;
    loadToken++; // the outgoing set's loader closures retire on their token checks
    resetDecodePipeline();
    incoming.decoded.forEach((i) => imgDecoded.add(i)); // pre-decoded frames stay drawable
    lastBitmapKey = canvas.width + 'x' + canvas.height + ':' + frameDir;
    frameSetDirty = true;
    startLoading(true); // adopt the preload; the set's own loader tops up the rest
  }

  // Drawable source for one frame index (Step 1 draw rule): a frame may be
  // painted only once its decode has finished — the cached ImageBitmap, or
  // an <img> whose decode() completed. A loaded-but-undecoded <img> is never
  // drawn mid-scroll; the caller holds the previous frame instead.
  function getDrawable(idx) {
    const bmp = bitmaps.get(idx);
    if (bmp) return bmp;
    if (imgDecoded.has(idx) && loadedIndices.has(idx)) {
      const img = frameImages[idx];
      if (img && img.complete && img.naturalWidth) return img;
    }
    return null;
  }

  // Desktop mapping (unchanged timing): global scroll progress -> frame
  function desktopFrameFromProgress(p) {
    const k = 65 / 96;
    const frac = p <= 0.42 ? (p / 0.42) * k : k + ((p - 0.42) / 0.58) * (1 - k);
    return frac * (TOTAL_FRAMES - 1);
  }

  // Mobile mapping: anchored to section positions (values in "story units" 0..95, scaled to 193 frames)
  let mobileKeys = [[0, 0], [1, 95]];
  function computeMobileKeys() {
    const vh = window.innerHeight;
    const topOf = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };
    const glance = topOf('#glance-section');
    const story = topOf('#story-section');
    const chairEl = document.getElementById('chair-section');
    const chair = topOf('#chair-section');
    const chairScroll = chairEl ? Math.max(1, chairEl.offsetHeight - vh) : vh;
    mobileKeys = [
      [0, 0],
      [glance * 0.35, 6],
      [glance, 34],
      [story, 56],
      [story + (chair - story) * 0.82, 82],
      [chair + chairScroll * 0.30, 88],
      [chair + chairScroll, 95]
    ];
  }
  function mobileFrameFromY(y) {
    const k = mobileKeys;
    let u = k[k.length - 1][1];
    if (y <= k[0][0]) u = k[0][1];
    else {
      for (let i = 1; i < k.length; i++) {
        if (y <= k[i][0]) {
          u = lerp(k[i - 1][1], k[i][1], (y - k[i - 1][0]) / Math.max(1, k[i][0] - k[i - 1][0]));
          break;
        }
      }
    }
    return u * (TOTAL_FRAMES - 1) / 95;
  }

  // Sources may be HTMLImageElement or ImageBitmap; both draw identically.
  const srcW = (s) => s.naturalWidth || s.width;
  const srcH = (s) => s.naturalHeight || s.height;

  function drawDesktop(img, cw, ch) {
    const scale = Math.max(cw / srcW(img), ch / srcH(img));
    const nw = Math.ceil(srcW(img) * scale);
    const nh = Math.ceil(srcH(img) * scale);
    ctx.drawImage(img, Math.floor((cw - nw) / 2), Math.floor((ch - nh) / 2), nw, nh);
  }

  // Portrait draw (Step 1): true cover, exactly like the desktop draw — the
  // frame fills the canvas edge to edge at any phone aspect. The former
  // 0.9x zoom-out with edge-stretch side fills and the flat #060b18 bottom
  // band are gone, so the composition no longer varies by phone shape.
  // (blendLayer is accepted for the caller's signature; cover needs no
  // per-layer difference.)
  function drawMobile(img, cw, ch, blendLayer) {
    const scale = Math.max(cw / srcW(img), ch / srcH(img));
    const nw = Math.ceil(srcW(img) * scale);
    const nh = Math.ceil(srcH(img) * scale);
    ctx.drawImage(img, Math.floor((cw - nw) / 2), Math.floor((ch - nh) / 2), nw, nh);
  }

  // Reduced motion (Part 3 addition): the film does not scrub. Each scene
  // holds one steady poster frame; moving between scenes is a plain fade
  // cut (the new poster fades in over ~260 ms), never a crossfade blend,
  // and there is no parallax to disable because the playhead is quantised.
  // The normal path is untouched for visitors who have not asked for this.
  const POSTER_FRAMES_DESKTOP = [2, 55, 105, 149, 175, 192];
  const POSTER_FRAMES_MOBILE = [2, 45, 95, 130, 168, 192];
  let lastPoster = -1;
  let cutFadeStart = 0;
  function posterize(f, mobileNow) {
    const set = mobileNow ? POSTER_FRAMES_MOBILE : POSTER_FRAMES_DESKTOP;
    let best = set[0], bd = Infinity;
    for (let i = 0; i < set.length; i++) {
      const d = Math.abs(set[i] - f);
      if (d < bd) { bd = d; best = set[i]; }
    }
    return best;
  }

  let lastFade = -1;
  let lastDrawKey = '';
  let lastExactFrame = 0;
  let lastRenderT = 0;
  let velSmooth = 0; // playhead velocity, frames/second (EMA) — gates the crossfade
  let lowVelSince = 0; // timestamp the playhead velocity fell under the rest threshold (H16)
  function render() {
    if (!ctx || !canvas) return;
    // The film's mode follows the ACTIVE frame set, not the live viewport:
    // after a rotation the old set keeps its own mapping and draw until
    // the cut-over below switches sets.
    let filmMobile = frameDir.indexOf('mobile') !== -1;
    let exactFrame = filmMobile
      ? mobileFrameFromY(smoothY)
      : desktopFrameFromProgress(clamp01(smoothProgress));

    // Rotation cut-over (Step 1): switch sets only once the incoming set
    // can show the frame currently on screen; until then this render keeps
    // drawing the outgoing set, so the film never blanks or resets.
    if (pendingSwap && pendingSwap.decoded.has(Math.round(Math.min(TOTAL_FRAMES - 1, Math.max(0, exactFrame))))) {
      performSwap();
      filmMobile = frameDir.indexOf('mobile') !== -1;
      exactFrame = filmMobile
        ? mobileFrameFromY(smoothY)
        : desktopFrameFromProgress(clamp01(smoothProgress));
      lastPoster = -1;
      lastDrawKey = '';
    }

    if (reduceMotion) {
      const pf = posterize(exactFrame, filmMobile);
      if (pf !== lastPoster) { lastPoster = pf; cutFadeStart = performance.now(); }
      exactFrame = pf;
    }

    // Track playhead velocity for the crossfade gate; keep the decoder fed around it.
    const nowT = performance.now();
    if (lastRenderT) {
      const dtS = Math.max(1, nowT - lastRenderT) / 1000;
      const v = Math.abs(exactFrame - lastExactFrame) / dtS;
      velSmooth += (v - velSmooth) * 0.35;
    }
    lastRenderT = nowT;
    lastExactFrame = exactFrame;
    updateDecodeWindow(exactFrame);
    if (storyFrameHook) storyFrameHook(exactFrame, filmMobile);

    // Rest snap (concept H16): once the playhead velocity has stayed under
    // ~2 frames/second for ~100 ms the film is at rest, and only the nearest
    // whole frame may be drawn. The fractional blend below is what paints the
    // translucent second head / fist over a settled page, so at rest it is
    // skipped entirely; while the playhead moves it runs exactly as before.
    if (velSmooth < 2) {
      if (!lowVelSince) lowVelSince = nowT;
    } else {
      lowVelSince = 0;
    }
    const atRest = lowVelSince !== 0 && (nowT - lowVelSince) >= 100;

    // Never show the zoomed video behind the footer. Fade is computed first: when the
    // film is fully faded out there is nothing to draw (audit Fix 7).
    let fade = 1;
    if (filmMobile && footerEl) {
      const ft = footerEl.getBoundingClientRect().top / window.innerHeight;
      fade = clamp01((ft - 0.25) / 0.6);
    } else if (!filmMobile) {
      const p = clamp01(smoothProgress);
      fade = p >= 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.08) : 1;
    }
    if (reduceMotion && cutFadeStart) {
      // Fade cut: the new scene's poster fades in; keep the rAF loop alive
      // until the fade lands even if the scroll has already stopped.
      const cf = clamp01((nowT - cutFadeStart) / 260);
      fade *= cf;
      if (cf < 1) frameSetDirty = true;
    }
    fade = Math.round(fade * 100) / 100;
    if (fade !== lastFade) {
      canvas.style.opacity = String(fade);
      lastFade = fade;
    }
    if (fade <= 0) return;

    const size = canvas.width + 'x' + canvas.height;
    const f = Math.min(TOTAL_FRAMES - 1, Math.max(0, exactFrame));
    const i0 = Math.floor(f);
    const i1 = Math.min(TOTAL_FRAMES - 1, i0 + 1);
    const frac = f - i0;
    // Fractional crossfade (audit Fix 2): blend the two frames around the playhead by
    // the fractional part, so slow scrolls (the crossing) move continuously instead of
    // stepping whole frames. The velocity gate fades the blend out as speed rises, so
    // fast scrolls snap to whole frames and never ghost. Step 1: the gate is
    // relaxed (full blend <= 90 f/s, none >= 180 f/s) and the blend alpha is
    // no longer quantised to 1/64 steps in the draw key.
    const gate = 1 - clamp01((velSmooth - 90) / 90); // full blend <= 90 f/s, none >= 180 f/s
    const blend = !atRest && !reduceMotion && i1 !== i0 ? frac * gate : 0; // at rest: snap, no blend (H16); reduced motion: posters only, never a blend

    ctx.imageSmoothingEnabled = true;
    // Mobile draws are near 1:1 (canvas capped at the 828px source width), so 'high'
    // buys nothing there but selects the most expensive resampling path (audit Fix 4).
    ctx.imageSmoothingQuality = filmMobile ? 'medium' : 'high';
    const drawSrc = (src, alpha, blendLayer) => {
      ctx.globalAlpha = alpha;
      if (filmMobile) drawMobile(src, canvas.width, canvas.height, blendLayer);
      else drawDesktop(src, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    };

    if (blend > 0.02) {
      const s0 = getDrawable(i0);
      const s1 = getDrawable(i1);
      if (s0 && s1) {
        const key = i0 + '+' + i1 + ':' + blend.toFixed(4) + ':' + size;
        if (key !== lastDrawKey) { // skip redundant draws (saves battery / GPU)
          drawSrc(s0, 1, false);
          drawSrc(s1, blend, true);
          lastDrawKey = key;
        }
        return;
      }
    }
    // Single-frame path (Step 1 draw rule): only the frames bracketing the
    // playhead may be drawn, and only once decoded. If none of them is
    // ready, draw nothing — the previous frame stays on the canvas. (The
    // old nearest-loaded-frame fallback is gone: it was the visible
    // hold-then-jump, and it could paint an undecoded <img> mid-scroll.)
    const exactIdx = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(f)));
    const candidates = exactIdx === i0 || exactIdx === i1 ? [exactIdx, i0, i1] : [exactIdx];
    for (let ci = 0; ci < candidates.length; ci++) {
      const src = getDrawable(candidates[ci]);
      if (!src) continue;
      const key = 's' + candidates[ci] + ':' + size;
      if (key !== lastDrawKey) {
        drawSrc(src, 1);
        lastDrawKey = key;
      }
      break;
    }
  }

  function readScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = y / max;
    handleNavMorph(targetProgress);
  }
  if (lenis) lenis.on('scroll', readScroll);
  else window.addEventListener('scroll', readScroll, { passive: true });

  let lastRenderedProgress = -1;
  let lastRenderedY = -1;
  function raf(now) {
    requestAnimationFrame(raf);
    if (document.hidden) return; // hidden tab: no film work (audit Fix 7)
    // One smoothing layer (Step 1): Lenis already animates window.scrollY
    // through every intermediate value, so the playhead reads that animated
    // value directly. The film's former extra progress lerp (audit Fix 6's
    // delta-normalised k) stacked a second easing on top of Lenis — the
    // playhead lagged the scroll and juddered against it. It is gone; the
    // at-rest snap in render() (H16) is untouched.
    const y = window.scrollY || document.documentElement.scrollTop;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = y / max;
    smoothProgress = targetProgress;
    smoothY = y;
    // Pause when nothing can change (audit Fix 7): playhead settled at the values the
    // last render used and no new frame has loaded since. Scrolling, Lenis motion or a
    // fresh frame un-settles instantly, so the film resumes within one tick.
    const settled = !frameSetDirty
      && Math.abs(smoothProgress - lastRenderedProgress) < 1e-7
      && Math.abs(smoothY - lastRenderedY) < 0.01;
    if (settled) return;
    render();
    lastRenderedProgress = smoothProgress;
    lastRenderedY = smoothY;
    frameSetDirty = false;
  }
  requestAnimationFrame(raf);

  // =========================================================================
  // 3. NAVIGATION (desktop pill -> vertical left panel; mobile glass drawer)
  // =========================================================================
  const navWrapper = document.getElementById('nav-wrapper');
  function handleNavMorph(progress) {
    if (navWrapper) navWrapper.classList.toggle('morphed', progress > 0.08);
  }

  const burgerBtn = document.getElementById('mobile-burger');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerIsOpen = () => mobileDrawer && mobileDrawer.classList.contains('open');
  function openDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.add('open');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    burgerBtn.classList.add('is-open');
    burgerBtn.setAttribute('aria-expanded', 'true');
    burgerBtn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
    if (lenis) lenis.stop();
  }
  function closeDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('open');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    burgerBtn.classList.remove('is-open');
    burgerBtn.setAttribute('aria-expanded', 'false');
    burgerBtn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    if (lenis) lenis.start();
  }
  if (burgerBtn && mobileDrawer) {
    burgerBtn.addEventListener('click', () => (drawerIsOpen() ? closeDrawer() : openDrawer()));
    mobileDrawer.addEventListener('click', (e) => { if (e.target === mobileDrawer) closeDrawer(); });
    mobileDrawer.querySelectorAll('a[target="_blank"], a[href^="mailto:"]').forEach((a) => a.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerIsOpen()) closeDrawer(); });
  }

  // In-page anchors (smooth). Card anchors scroll to the At a Glance section and highlight that card.
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      let targetElement = document.querySelector(targetId);
      if (!targetElement) return;
      e.preventDefault();
      if (drawerIsOpen()) closeDrawer();
      let highlight = null;
      if (targetElement.classList.contains('deck-card')) {
        highlight = targetElement;
        targetElement = document.getElementById('glance-section');
      }
      const after = () => {
        if (!highlight) return;
        highlight.classList.remove('is-highlighted');
        void highlight.offsetWidth;
        highlight.classList.add('is-highlighted');
        setTimeout(() => highlight.classList.remove('is-highlighted'), 1800);
      };
      if (lenis) {
        lenis.scrollTo(targetElement, { offset: 0, duration: 1.4, onComplete: after });
      } else {
        targetElement.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        setTimeout(after, reduceMotion ? 0 : 900);
      }
    });
  });

  // =========================================================================
  // 5. GSAP ANIMATIONS
  // =========================================================================
  if (hasGSAP) {
    // =====================================================================
    // STEP 2: ONE MASTER TIMELINE. A single ScrollTrigger (scrub 0.6) over
    // the whole page is the only animation clock left: the film reads the
    // same scroll progress in render(), the story lines are keyed to the
    // film frame via storyFrameHook, and every other scene motion (hero
    // exit, glance bands + rows, chair + coffee) is a tween placed in this
    // timeline at the scroll position where its film beat happens. Beat
    // positions are computed by inverting the film's own mappings, so a
    // tween placed at frame E fires exactly when the film shows frame E,
    // on both platforms (desktop: the two-segment global mapping; mobile:
    // the section-anchored keys). Character beats (0-based exactFrame):
    // left hold 0-37, crossing 38-65, right hold 66-114, return 115-147,
    // left hold + mug 148-192 (mug raise ~175-192).
    // =====================================================================
    const formFields = gsap.utils.toArray('.mug-header, #chair-form .glass-input, #chair-form .btn-reserve');
    const filmMobileAtInit = frameDir.indexOf('mobile') !== -1;

    function progressOfFrame(E, mobile) {
      if (mobile) {
        // Invert mobileFrameFromY over the live section-anchored keys.
        const u = E * 95 / (TOTAL_FRAMES - 1);
        const k = mobileKeys;
        let y = k[k.length - 1][0];
        if (u <= k[0][1]) y = k[0][0];
        else {
          for (let i = 1; i < k.length; i++) {
            if (u <= k[i][1]) {
              y = lerp(k[i - 1][0], k[i][0], (u - k[i - 1][1]) / Math.max(1e-6, k[i][1] - k[i - 1][1]));
              break;
            }
          }
        }
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        return clamp01(y / max);
      }
      // Invert desktopFrameFromProgress.
      const k = 65 / 96;
      const frac = E / (TOTAL_FRAMES - 1);
      return frac <= k ? 0.42 * frac / k : 0.42 + 0.58 * (frac - k) / (1 - k);
    }

    let masterTl = null;
    let masterKey = '';
    function buildMaster() {
      if (reduceMotion) return;
      const mobile = frameDir.indexOf('mobile') !== -1;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const key = (mobile ? 'm' : 'd') + ':' + max + ':' + (mobileKeys[3] ? Math.round(mobileKeys[3][0]) : 0);
      if (masterTl && key === masterKey) return;
      masterKey = key;
      if (masterTl) {
        if (masterTl.scrollTrigger) masterTl.scrollTrigger.kill();
        masterTl.kill();
      }
      document.body.classList.add('sync-on'); // CSS band animations hand over to this timeline
      const P = (E) => progressOfFrame(E, mobile) * 100;
      const seg = (E1, E2) => [P(E1), Math.max(0.4, P(E2) - P(E1))];
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 0.6 }
      });
      masterTl = tl;
      // Step 3: all four build cards share one format and one entrance,
      // a rise + fade placed at the card's film beat.
      const addCard = (sel, E0, E1) => {
        const card = document.querySelector(sel);
        if (!card) return;
        const s = seg(E0, E1);
        tl.fromTo(card, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
      };
      let s;
      if (!mobile) {
        // Hero: the name holds while he stands left, then gives way as he
        // starts to cross (frames 26-40).
        s = seg(26, 40);
        tl.fromTo('.hero-content', { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -46, duration: s[1] }, s[0]);
        // Glance: title, then the four build cards in beat order,
        // arriving across the crossing and the right hold.
        s = seg(36, 48);
        tl.fromTo('.glance-content .eyebrow, .glance-content .scene-title', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        addCard('#card-neuroparsec', 42, 56);
        addCard('#card-ccb', 58, 72);
        addCard('#card-leadership', 74, 86);
        addCard('#card-playground', 84, 96);
        // Story block: materialises as he walks back to his spot, just
        // before the first line (frame 143).
        s = seg(128, 140);
        tl.fromTo('.story-content', { autoAlpha: 0 }, { autoAlpha: 1, duration: s[1] }, s[0]);
        // Chair: the panel arrives as the scene opens (he is back left,
        // mug in hand); the form follows; the word "Coffee." lands with
        // the mug raise itself (frames 176-188).
        s = seg(158, 170);
        tl.fromTo('.chair-content', { autoAlpha: 0, y: 35 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        s = seg(164, 176);
        tl.fromTo('.mug-form-wrapper', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        s = seg(170, 182);
        tl.fromTo(formFields, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: s[1], stagger: 0.9 }, s[0]);
        s = seg(176, 188);
        tl.fromTo('.coffee-beat', { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: s[1] }, s[0]);
      } else {
        // Phone: the glance pieces arrive while he stands on the right;
        // the chair sequence keeps its clean hold (man + mug alone), then
        // title and "Coffee." with the raise, then the booking form.
        s = seg(64, 72);
        tl.fromTo('.glance-content .eyebrow, .glance-content .scene-title', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        addCard('#card-neuroparsec', 74, 88);
        addCard('#card-ccb', 82, 96);
        addCard('#card-leadership', 90, 97);
        addCard('#card-playground', 94, 101);
        s = seg(176, 184);
        tl.fromTo('.chair-title, .chair-desc, .coffee-beat', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        s = seg(182, 189);
        tl.fromTo('.mug-form-wrapper', { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: s[1] }, s[0]);
        s = seg(186, 192);
        tl.fromTo(formFields, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: s[1], stagger: 0.7 }, s[0]);
      }
    }
    buildMaster();

    // ---- Story: one line at a time — masked rise + fade + blur clear; previous line fades out first ----
    const storyLines = document.querySelectorAll('.story-line');
    const storyContainer = document.querySelector('.story-lines-container');
    let currentLine = -2; // -1 is a real state now (no line active yet), so start below it
    // Numbered chapters (Part 3): the nine story lines map onto five scenes.
    const CHAPTER_OF_LINE = [0, 0, 1, 1, 2, 2, 3, 4, 4];
    const CHAPTER_NAMES = ['QUESTION', 'ANSWER', 'NEUROPARSEC', 'PEOPLE', 'CANCER CARE'];
    const chapterItems = document.querySelectorAll('.chapter-strip li');
    const chapterCounter = document.getElementById('chapter-counter');
    const setActiveLine = (activeIndex) => {
      if (activeIndex === currentLine) return;
      currentLine = activeIndex;
      storyLines.forEach((line, index) => {
        line.classList.toggle('active', index === activeIndex);
        line.classList.toggle('is-past', index < activeIndex);
      });
      const ch = CHAPTER_OF_LINE[activeIndex] || 0;
      chapterItems.forEach((li, i) => li.classList.toggle('is-active', i === ch));
      if (chapterCounter) chapterCounter.textContent = '0' + (ch + 1) + ' / 05 · ' + CHAPTER_NAMES[ch];
    };
    setActiveLine(-1);

    // Step 2: the lines are driven by the film frame itself (render()
    // calls this hook), keyed to the character's beats, so text and man
    // can never be on the same side at the same time.
    // Desktop: the text block sits on the RIGHT, so a line may only be
    // fully visible once he is fully back on the LEFT: his body's right
    // edge (canvas px at 1440 wide) clears the block's left edge (705)
    // from frame 144 on. Lines run frames 144-168 (exactFrame 143-167),
    // through the left hold and the mug approach.
    // Phone: the lines live in the free space BELOW the film band, never
    // over him, so they run with the story scene itself: frames 119-157
    // (exactFrame 118-156), from the return crossing into the left hold,
    // and the container fades as the chair scene takes over (150-158).
    storyFrameHook = (E, mobile) => {
      if (!storyLines.length) return;
      if (mobile) {
        const start = 118, end = 156;
        let idx;
        if (E < start) idx = -1;
        else if (E >= end) idx = storyLines.length - 1;
        else idx = Math.floor((E - start) / (end - start) * storyLines.length);
        setActiveLine(idx);
        if (storyContainer) {
          const o = E <= 150 ? 1 : Math.max(0, 1 - (E - 150) / 8);
          storyContainer.style.opacity = o.toFixed(3);
        }
      } else {
        const start = 143, end = 167;
        let idx;
        if (E < start) idx = -1;
        else if (E >= end) idx = storyLines.length - 1;
        else idx = Math.floor((E - start) / (end - start) * storyLines.length);
        setActiveLine(idx);
      }
    };

    // ---- Pull Up a Chair: the heading, the "Coffee." beat and the form
    // are all placed in the master timeline above, keyed to the mug beat.
    // What remains here is UI chrome only: hide the fixed burger while
    // the phone form is on screen. ----
    if (filmMobileAtInit && burgerBtn) {
      ScrollTrigger.create({
        trigger: '#chair-section',
        start: 'top 40%',
        endTrigger: '#footer-section',
        end: 'top 5%',
        toggleClass: { targets: burgerBtn, className: 'is-hidden' }
      });
    }

    // ---- Footer: soft staggered reveal ----
    if (!reduceMotion) {
      const footerTl = gsap.timeline({ scrollTrigger: { trigger: '#footer-section', start: 'top 85%' } });
      footerTl
        .fromTo('.footer-panel', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
        .fromTo('.footer-col', { opacity: 0, y: 18, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.1, ease: 'power3.out', clearProps: 'filter,transform' }, 0.15);
    }

    ScrollTrigger.addEventListener('refresh', () => { computeMobileKeys(); buildMaster(); });
  }

  // Hero intro runs entirely in CSS (starts on first paint, no JS needed). The per-letter spans are
  // kept afterwards: they render identically and re-painting the name would register a late LCP.

  // =========================================================================
  // 6. CALENDLY BOOKING BUTTON
  // =========================================================================
  // No on-site form backend: the visitor gives their name here, then picks a
  // day and time inside Calendly. With a name typed, it is passed along as
  // Calendly prefill; with no name, the button's plain href opens Calendly.
  const calendlyBtn = document.getElementById('calendly-btn');
  const chairNameInput = document.getElementById('chair-name');
  if (calendlyBtn) {
    calendlyBtn.addEventListener('click', function (e) {
      const visitorName = chairNameInput ? chairNameInput.value.trim() : '';
      if (!visitorName) return; // plain href takes over, new tab
      e.preventDefault();
      const calendlyUrl = 'https://calendly.com/connect-simanto/coffee-with-simanto'
        + '?first_name=' + encodeURIComponent(visitorName.split(/\s+/)[0])
        + '&name=' + encodeURIComponent(visitorName);
      window.open(calendlyUrl, '_blank', 'noopener');
    });
  }

  // =========================================================================
  // 7. DESKTOP POINTER EFFECTS: smoky cursor light, 3D card tilt + glare, magnetic CTAs
  // =========================================================================
  if (finePointer && !reduceMotion) {
    // Smoky cursor light: a sharp core + a slower, larger smoke layer, both lerped
    const core = document.getElementById('cursor-glow');
    let smoke = null;
    if (core) {
      smoke = document.createElement('div');
      smoke.id = 'cursor-smoke';
      smoke.setAttribute('aria-hidden', 'true');
      document.body.appendChild(smoke);
      let mx = -1000, my = -1000, cx = -1000, cy = -1000, sx = -1000, sy = -1000;
      let scale = 1, targetScale = 1, hot = 0, targetHot = 0;
      window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
      document.addEventListener('mouseover', (e) => {
        const t = e.target.closest('a, button, .deck-card, .glass-input, .glass-pill');
        targetScale = t ? 1.3 : 1;
        targetHot = t ? 1 : 0;
      });
      const t0 = performance.now();
      let lastCoreStr = '', lastSmokeStr = '', lastHotStr = '';
      const loop = (now) => {
        cx += (mx - cx) * 0.16; cy += (my - cy) * 0.16;
        sx += (mx - sx) * 0.06; sy += (my - sy) * 0.06;
        scale += (targetScale - scale) * 0.12;
        hot += (targetHot - hot) * 0.12;
        const breathe = 1 + Math.sin((now - t0) / 1400) * 0.06;
        // Perf pass (Part 3): only write styles when the rounded value
        // actually changed, so an idle pointer costs no style recalc.
        const coreStr = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        if (coreStr !== lastCoreStr) { core.style.transform = coreStr; lastCoreStr = coreStr; }
        const hotStr = hot.toFixed(3);
        if (hotStr !== lastHotStr) { core.style.setProperty('--hot', hotStr); lastHotStr = hotStr; }
        const smokeStr = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${(breathe * (1 + hot * 0.15)).toFixed(3)})`;
        if (smokeStr !== lastSmokeStr) { smoke.style.transform = smokeStr; lastSmokeStr = smokeStr; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // 3D tilt + glare on cards
    document.querySelectorAll('.deck-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', `${((px - 0.5) * 14).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - py) * 12).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        card.classList.add('is-tilting');
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });

    // Magnetic CTA buttons
    if (hasGSAP) {
      document.querySelectorAll('.nav-cta, .btn-reserve, .footer-chair-btn').forEach((btn) => {
        const strength = btn.classList.contains('btn-reserve') ? 0.18 : 0.35;
        btn.addEventListener('mousemove', (e) => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - (r.left + r.width / 2)) * strength,
            y: (e.clientY - (r.top + r.height / 2)) * strength * 1.2,
            duration: 0.4, ease: 'power3.out'
          });
        });
        btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
      });
    }
  }

  // Mobile tap feedback (enables :active styles on iOS too)
  if (isTouch) {
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.querySelectorAll('.deck-card').forEach((card) => {
      card.addEventListener('touchstart', () => card.classList.add('is-pressed'), { passive: true });
      ['touchend', 'touchcancel'].forEach((ev) => card.addEventListener(ev, () => {
        setTimeout(() => card.classList.remove('is-pressed'), 160);
      }, { passive: true }));
    });
  }
});
