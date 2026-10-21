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
  // Must stay in sync with the compact media query in style.css
  const compactMQ = window.matchMedia('(max-width: 1023.98px), (orientation: portrait) and (max-width: 1179.98px), (max-height: 500px)');
  let isMobile = compactMQ.matches;
  // Every portrait screen (phones + tablets) gets the portrait film, which is composed
  // for a tall crop. Cropping the 16:9 desktop film to portrait zooms ~2.5x into him.
  const usePortraitFrames = () => isMobile && window.innerHeight >= window.innerWidth;
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
  //    Desktop: 1920x1080 landscape frames drawn "cover" (unchanged composition)
  //    Mobile:  dedicated 828x1840 portrait frames, pre-cropped around Simanto with the approved
  //             per-phase framing baked in (head clear in hero, mug clear in coffee moment), so the
  //             phone just draws them full-width — no runtime zoom/follow logic.
  // =========================================================================
  const TOTAL_FRAMES = 193;
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const footerEl = document.getElementById('footer-section');
  const DARK = '#060b18';
  const MOBILE_FRAME_W = 828;

  let frameDir = usePortraitFrames() ? './frames-mobile' : './frames-desktop';
  const getFrameUrl = (n) => `${frameDir}/frame-${String(n).padStart(3, '0')}.webp`;

  let frameImages = new Array(TOTAL_FRAMES);
  let loadedIndices = new Set();
  let loadToken = 0;
  let targetProgress = 0;
  let smoothProgress = 0;
  let smoothY = 0;

  function resizeCanvas() {
    if (!canvas) return;
    isMobile = compactMQ.matches;
    const wantDir = usePortraitFrames() ? './frames-mobile' : './frames-desktop';
    if (wantDir !== frameDir) { frameDir = wantDir; startLoading(); }
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Phones: never allocate a canvas bigger than the source frame (sharp + cheaper to fill).
    // Desktop: the source is 1920x1080, so past ~1.6x we only pay for pixels we cannot see.
    if (frameDir === './frames-mobile') dpr = Math.min(dpr, MOBILE_FRAME_W / window.innerWidth);
    else dpr = Math.min(dpr, 1.6);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
    }
    computeSceneKeys();
    measureHero();
    render();
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));

  // Progressive loading: frame 1 first (instant hero), then strictly in order,
  // so the film is always complete up to where the viewer is (no 4-frame stepping).
  function startLoading() {
    const token = ++loadToken;
    frameImages = new Array(TOTAL_FRAMES);
    loadedIndices = new Set();
    let next = 1;
    const CONCURRENCY = 6;
    const loadOne = (idx, done) => {
      const img = new Image();
      img.decoding = 'async';
      if (idx === 0 && 'fetchPriority' in img) img.fetchPriority = 'high';
      img.onload = () => {
        if (token !== loadToken) return;
        frameImages[idx] = img;
        loadedIndices.add(idx);
        if (idx === 0) resizeCanvas();
        done();
      };
      img.onerror = () => { if (token === loadToken) done(); };
      img.src = getFrameUrl(idx + 1);
    };
    const pump = () => {
      if (token !== loadToken || next >= TOTAL_FRAMES) return;
      loadOne(next++, pump);
    };
    loadOne(0, () => {
      if (document.readyState === 'complete') { for (let c = 0; c < CONCURRENCY; c++) pump(); }
      else window.addEventListener('load', () => { if (token === loadToken) for (let c = 0; c < CONCURRENCY; c++) pump(); }, { once: true });
    });
  }
  startLoading();

  function getBestLoadedImage(exactIdx) {
    const target = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(exactIdx)));
    if (loadedIndices.has(target)) return frameImages[target];
    for (let r = 1; r < TOTAL_FRAMES; r++) {
      if (target - r >= 0 && loadedIndices.has(target - r)) return frameImages[target - r];
      if (target + r < TOTAL_FRAMES && loadedIndices.has(target + r)) return frameImages[target + r];
    }
    return null;
  }

  // Subject centre (x, % of frame width) sampled every 4 frames from the film.
  // Measured from the frames themselves, so text can sit opposite the person.
  const SUBJECT_TRACK = [26.0,26.0,25.7,25.1,24.4,24.4,26.0,29.7,33.1,35.5,39.3,42.6,46.4,50.4,55.1,59.9,63.7,66.5,68.6,70.2,71.9,73.5,74.6,75.0,75.0,74.9,74.8,74.3,73.2,71.3,68.5,65.3,61.4,56.5,50.5,43.6,38.3,35.3,32.5,30.3,29.5,29.5,29.5,29.5,29.6,29.6,29.6,29.6,29.6];
  const TRACK_STEP = 4;

  function subjectAt(frame) {
    const t = Math.max(0, Math.min(SUBJECT_TRACK.length - 1, frame / TRACK_STEP));
    const i = Math.floor(t);
    const a = SUBJECT_TRACK[i];
    const b = SUBJECT_TRACK[Math.min(SUBJECT_TRACK.length - 1, i + 1)];
    return (a + (b - a) * (t - i)) / 100;
  }

  const heroScene = document.getElementById('hero');
  const heroContent = document.querySelector('.hero-content');
  const heroInner = document.querySelector('.hero-scene .scene-inner');
  const scrimRight = document.querySelector('.hero-scrim-right');
  const scrimLeft = document.querySelector('.hero-scrim-left');
  const heroCue = document.querySelector('.hero-cue');
  let heroTravel = 0;
  function measureHero() {
    if (!heroInner || !heroContent) return;
    heroTravel = Math.max(0, heroInner.clientWidth - heroContent.offsetWidth);
  }

  const topOf = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  };

  // One timeline, anchored to real section positions (in frame units, 0..192).
  // Desktop: the whole first sweep (subject left -> right) plays inside the hero.
  // Compact: hero is a short cover; the film follows the page sections.
  let sceneKeys = [[0, 0], [1, 192]];
  let heroTopPx = 0;
  let heroScrollPx = 1;
  function computeSceneKeys() {
    const vh = window.innerHeight;
    const heroEl = document.getElementById('hero');
    const chairEl = document.getElementById('chair-section');
    heroScrollPx = heroEl ? Math.max(1, heroEl.offsetHeight - vh) : 1;
    heroTopPx = heroEl ? heroEl.getBoundingClientRect().top + window.scrollY : 0;
    const chairScroll = chairEl ? Math.max(1, chairEl.offsetHeight - vh) : vh;
    const glance = topOf('#glance-section');
    const story = topOf('#story-section');
    const chair = topOf('#chair-section');
    docMax = Math.max(1, document.documentElement.scrollHeight - vh);

    if (isMobile) {
      sceneKeys = [
        [0, 0],
        [glance * 0.35, 12],
        [glance, 69],
        [story, 113],
        [story + (chair - story) * 0.82, 166],
        [chair + chairScroll * 0.30, 178],
        [chair + chairScroll, 192]
      ];
    } else {      sceneKeys = [
        [0, 0],
        [heroScrollPx * 0.06, 3],
        [heroScrollPx * 0.94, 102],
        [glance, 112],
        [story, 116],
        [chair, 124],
        [chair + chairScroll, 192]
      ];
    }
  }

  function frameFromY(y) {
    const k = sceneKeys;
    let frame = k[k.length - 1][1];
    if (y <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (y <= k[i][0]) {
        // Ease in/out inside every segment, so the film never changes speed with a
        // jolt at a section boundary (this is what makes the scroll feel cut).
        const t = (y - k[i - 1][0]) / Math.max(1, k[i][0] - k[i - 1][0]);
        frame = lerp(k[i - 1][1], k[i][1], t * t * (3 - 2 * t));
        break;
      }
    }
    return frame;
  }

  // Cover-fit, but anchored on the subject instead of the frame centre,
  // so portrait/tablet viewports never crop the face off.
  function drawCoverAnchored(img, cw, ch, sx) {
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = Math.min(0, Math.max(cw - dw, sx * (cw - dw)));
    const dy = Math.min(0, Math.max(ch - dh, (ch - dh) / 2));
    ctx.drawImage(img, Math.floor(dx), Math.floor(dy), Math.ceil(dw), Math.ceil(dh));
  }

  function drawMobile(img, cw, ch) {
    // Portrait frame drawn full width, top aligned; its bottom already fades into #060b18
    const nh = Math.round(img.naturalHeight * (cw / img.naturalWidth));
    if (nh < ch) {
      ctx.fillStyle = DARK;
      ctx.fillRect(0, nh - 1, cw, ch - nh + 1);
    }
    ctx.drawImage(img, 0, 0, cw, nh);
  }

  // Hero composition: the text block travels opposite the subject.
  // Subject left  -> text right; as he crosses the frame the text dissolves,
  // then re-forms on the left as he reaches the right side.
  // Everything is written straight onto the elements (no CSS custom properties):
  // transform/opacity only, so the compositor does the work and the film stays smooth.
  const smoothstep = (t) => t * t * (3 - 2 * t);
  let heroSide = 0;
  let heroFade = 1;
  let heroAway = 0;
  let heroExit = 0;
  let lastHeroKey = '';
  function updateHeroComposition(frame) {
    if (!heroScene || !heroContent || isMobile) return;

    if (reduceMotion) {
      if (lastHeroKey !== 'rest') {
        heroContent.style.transform = 'translate3d(0, 0, 0)';
        heroContent.style.opacity = '1';
        if (scrimRight) scrimRight.style.opacity = '1';
        if (scrimLeft) scrimLeft.style.opacity = '0';
        lastHeroKey = 'rest';
      }
      return;
    }

    const sx = subjectAt(frame);
    // Slide opposite him, eased across his whole walk (no whip, no snap).
    const sideTarget = smoothstep(clamp01((sx - 0.40) / 0.22));
    // Cross-dissolve while he passes the middle: long, eased ramps.
    const outT = smoothstep(clamp01((sx - 0.40) / 0.075));
    const inT = smoothstep(clamp01((sx - 0.545) / 0.075));
    const fadeTarget = 1 - outT * (1 - inT);
    const y = window.scrollY;
    const awayTarget = smoothstep(clamp01(y / (heroScrollPx * 0.18)));
    const exitTarget = smoothstep(clamp01((y - heroScrollPx * 0.86) / (heroScrollPx * 0.14)));

    heroSide += (sideTarget - heroSide) * 0.14;
    heroFade += (fadeTarget - heroFade) * 0.16;
    heroAway += (awayTarget - heroAway) * 0.14;
    heroExit += (exitTarget - heroExit) * 0.14;

    const tx = -heroTravel * heroSide;
    const ty = -heroAway * 34;
    const alpha = heroFade * (1 - heroExit);
    const key = tx.toFixed(0) + '|' + ty.toFixed(0) + '|' + alpha.toFixed(2) + '|' + heroSide.toFixed(2);
    if (key === lastHeroKey) return;
    lastHeroKey = key;

    heroContent.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
    heroContent.style.opacity = alpha.toFixed(3);
    const pool = (0.45 + 0.55 * heroFade) * (1 - heroExit);
    if (scrimRight) scrimRight.style.opacity = (pool * (1 - heroSide)).toFixed(3);
    if (scrimLeft) scrimLeft.style.opacity = (pool * heroSide).toFixed(3);
    if (heroCue) heroCue.style.opacity = ((1 - heroAway) * (1 - heroExit)).toFixed(2);
  }

  let lastCompactKey = '';
  // Compact screens are a single cover screen, so the copy scrolls up over the film.
  // Fade it out as it leaves instead of letting it slide across his face.
  function updateCompactHeroExit() {
    if (!isMobile || !heroContent) return;
    const alpha = reduceMotion ? 1 : 1 - smoothstep(clamp01(window.scrollY / (window.innerHeight * 0.40)));
    const key = alpha.toFixed(2);
    if (key === lastCompactKey) return;
    lastCompactKey = key;
    heroContent.style.opacity = key;
  }

  let lastFade = -1;
  let lastDrawn = null;
  let lastSize = '';
  function render() {
    if (!ctx || !canvas) return;
    const exactFrame = frameFromY(smoothY);
    updateHeroComposition(exactFrame);
    updateCompactHeroExit();
    const img = getBestLoadedImage(exactFrame);
    if (img && img.complete && img.naturalWidth) {
      const size = canvas.width + 'x' + canvas.height;
      if (img !== lastDrawn || size !== lastSize) { // skip redundant draws (saves battery / GPU)
        if (frameDir === './frames-mobile') drawMobile(img, canvas.width, canvas.height);
        else drawCoverAnchored(img, canvas.width, canvas.height, subjectAt(exactFrame));
        lastDrawn = img;
        lastSize = size;
      }
    }
    // Never show the zoomed video behind the footer
    let fade = 1;
    if (footerEl) {
      const ft = footerEl.getBoundingClientRect().top / window.innerHeight;
      fade = clamp01(ft / (isMobile ? 0.6 : 0.55));
    }
    fade = Math.round(fade * 100) / 100;
    if (fade !== lastFade) {
      canvas.style.opacity = String(fade);
      lastFade = fade;
    }
  }

  const progressBar = document.querySelector('.scroll-progress');
  let docMax = 1;
  function readScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    const p = Math.min(1, y / docMax);
    targetProgress = p;
    if (progressBar) progressBar.style.transform = `scaleX(${p.toFixed(4)})`;
    // The rail should only replace the pill once the pinned hero is over.
    const morphAt = (!isMobile && heroScrollPx > 1) ? heroScrollPx * 0.92 : docMax * 0.08;
    handleNavMorph(y > morphAt);
  }
  if (lenis) lenis.on('scroll', readScroll);
  else window.addEventListener('scroll', readScroll, { passive: true });

  function raf() {
    const lerpSpeed = reduceMotion ? 1 : (isTouch ? 0.15 : 0.10);
    smoothProgress += (targetProgress - smoothProgress) * lerpSpeed;
    const y = window.scrollY;
    smoothY += (y - smoothY) * lerpSpeed;
    if (Math.abs(y - smoothY) < 0.5) smoothY = y;
    render();
  requestAnimationFrame(raf);

  // Layout depends on fonts + inner page heights, so re-measure once they settle.
  window.addEventListener('load', () => { computeSceneKeys(); measureHero(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { computeSceneKeys(); measureHero(); });
  }
  }
  requestAnimationFrame(raf);

  // =========================================================================
  // 3. NAVIGATION (desktop pill -> vertical left panel; mobile glass drawer)
  // =========================================================================
  const navWrapper = document.getElementById('nav-wrapper');
  function handleNavMorph(on) {
    if (navWrapper) navWrapper.classList.toggle('morphed', !!on);
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
    // ---- At a Glance: fan out from a stacked deck, then gentle float ----
    const cards = gsap.utils.toArray('.deck-card');
    if (cards.length) {
      const fan = [{ r: -7, y: 10 }, { r: -2.5, y: -6 }, { r: 2.5, y: -6 }, { r: 7, y: 10 }];
      if (reduceMotion) {
        gsap.set(cards, { opacity: 1 });
      } else {
        gsap.set(cards, { opacity: 0 });
        ScrollTrigger.create({
          trigger: '#glance-section',
          start: 'top 70%',
          once: true,
          onEnter: () => {
            if (isMobile) {
              gsap.fromTo(cards, { opacity: 0, y: 26, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' });
            } else {
              const deck = document.querySelector('.cards-deck');
              const deckMid = deck.getBoundingClientRect().left + deck.offsetWidth / 2;
              gsap.fromTo(cards,
                {
                  opacity: 0, y: 70, rotation: 0, scale: 0.9,
                  x: (i, el) => deckMid - (el.getBoundingClientRect().left + el.offsetWidth / 2)
                },
                {
                  opacity: 1, x: 0, scale: 1,
                  y: (i) => fan[i % 4].y, rotation: (i) => fan[i % 4].r,
                  duration: 1.0, stagger: 0.07, ease: 'expo.out',
                  onComplete: () => {
                    gsap.set(cards, { clearProps: 'transform' });
                    cards.forEach((card) => card.classList.add('floating'));
                  }
                });
            }
          }
        });
      }
    }

    // ---- Story: one line at a time — masked rise + fade + blur clear; previous line fades out first ----
    const storyLines = document.querySelectorAll('.story-line');
    const storyContainer = document.querySelector('.story-lines-container');
    const progressIndicator = document.getElementById('story-indicator');
    let currentLine = -1;
    const setActiveLine = (activeIndex) => {
      if (activeIndex === currentLine) return;
      currentLine = activeIndex;
      storyLines.forEach((line, index) => {
        line.classList.toggle('active', index === activeIndex);
        line.classList.toggle('is-past', index < activeIndex);
      });
    };
    setActiveLine(0);

    if (storyLines.length && isMobile) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          setActiveLine(Math.floor(Math.min(0.999, p / 0.84) * storyLines.length));
          const out = p <= 0.86 ? 1 : Math.max(0, 1 - (p - 0.86) / 0.1);
          storyContainer.style.opacity = out.toFixed(3);
        },
        onLeave: () => { storyContainer.style.opacity = '0'; },
        onLeaveBack: () => { storyContainer.style.opacity = '1'; setActiveLine(0); }
      });
    } else if (storyLines.length) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top 60%',
        end: 'bottom 40%',
        onLeave: () => { storyContainer.style.opacity = '0'; },
        onEnterBack: () => { storyContainer.style.opacity = ''; },
        onLeaveBack: () => { storyContainer.style.opacity = ''; setActiveLine(0); },
        onUpdate: (self) => {
          storyContainer.style.opacity = '';
          setActiveLine(Math.min(storyLines.length - 1, Math.floor(self.progress * storyLines.length)));
          if (progressIndicator) {
            progressIndicator.style.transform = `translateY(${self.progress * (380 - 380 * 0.25)}px)`;
          }
        }
      });
    }

    // ---- Pull Up a Chair: heading, then mug form, then fields stagger in ----
    const formFields = gsap.utils.toArray('.mug-header, #chair-form .glass-input, #chair-form .btn-reserve');
    if (isMobile) {
      if (!reduceMotion) {
        gsap.set('.chair-title, .chair-desc', { opacity: 0, y: 18 });
        gsap.set('.mug-form-wrapper', { opacity: 0, y: 40 });
        gsap.set(formFields, { opacity: 0, y: 12 });
      } else {
        gsap.set('.chair-title, .chair-desc', { opacity: 0 });
        gsap.set('.mug-form-wrapper', { opacity: 0 });
      }
      const chairTl = gsap.timeline({
        scrollTrigger: { trigger: '#chair-section', start: 'top top', end: 'bottom bottom', scrub: reduceMotion ? true : 0.4 }
      });
      chairTl
        .to({}, { duration: 0.18 }) // short hold: Simanto + mug, then the copy lands
        .to('.chair-title, .chair-desc', { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' })
        .to('.mug-form-wrapper', { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' })
        .to(formFields, { opacity: 1, y: 0, duration: 0.14, stagger: 0.025, ease: 'power2.out' }, '-=0.08')
        .to({}, { duration: 0.10 });

      if (burgerBtn) {
        ScrollTrigger.create({
          trigger: '#chair-section',
          start: 'top 40%',
          endTrigger: '#footer-section',
          end: 'top 5%',
          toggleClass: { targets: burgerBtn, className: 'is-hidden' }
        });
      }
    } else if (!reduceMotion) {
      gsap.set(formFields, { opacity: 0, y: 14 });
      const deskChair = gsap.timeline({ scrollTrigger: { trigger: '#chair-section', start: 'top 75%' } });
      deskChair
        .fromTo('.chair-content', { opacity: 0, y: 35 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })
        .to(formFields, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', clearProps: 'transform' }, 0.35);
    }

    // ---- Footer: soft staggered reveal ----
    if (!reduceMotion) {
      const footerTl = gsap.timeline({ scrollTrigger: { trigger: '#footer-section', start: 'top 85%' } });
      footerTl
        .fromTo('.footer-panel', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
        .fromTo('.footer-col', { opacity: 0, y: 18, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.1, ease: 'power3.out', clearProps: 'filter,transform' }, 0.15);
    }

    ScrollTrigger.addEventListener('refresh', () => { computeSceneKeys(); measureHero(); });
  }

  // Hero intro runs entirely in CSS (starts on first paint, no JS needed). The per-letter spans are
  // kept afterwards: they render identically and re-painting the name would register a late LCP.

  // =========================================================================
  // 6. NETLIFY FORM
  // =========================================================================
  const bookingForm = document.getElementById('chair-form');
  const successBanner = document.getElementById('form-success');
  if (bookingForm && successBanner) {
    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const submitBtn = bookingForm.querySelector('.btn-reserve');
      submitBtn.innerHTML = '<span>Reserving Seat...</span>';
      submitBtn.style.opacity = '0.7';
      submitBtn.disabled = true;
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(bookingForm)).toString()
      })
        .then((res) => { if (!res.ok) throw new Error(res.status); })
        .then(() => {
          bookingForm.style.display = 'none';
          successBanner.style.display = 'block';
          if (hasGSAP) gsap.fromTo(successBanner, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
        })
        .catch(() => {
          submitBtn.innerHTML = 'Something went wrong. Email connect.simanto@gmail.com';
          submitBtn.style.opacity = '1';
          submitBtn.disabled = false;
        });
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
      const loop = (now) => {
        cx += (mx - cx) * 0.16; cy += (my - cy) * 0.16;
        sx += (mx - sx) * 0.06; sy += (my - sy) * 0.06;
        scale += (targetScale - scale) * 0.12;
        hot += (targetHot - hot) * 0.12;
        const breathe = 1 + Math.sin((now - t0) / 1400) * 0.06;
        core.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${scale.toFixed(3)})`;
        core.style.setProperty('--hot', hot.toFixed(3));
        smoke.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(${(breathe * (1 + hot * 0.15)).toFixed(3)})`;
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
