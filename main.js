/**
 * SIMANTO MITRO — HIGH PERFORMANCE INTERACTIVE ENGINE
 * 60fps Canvas Architecture with 96 Progressive WebP Frames (720px Mobile / 1280px Desktop)
 * Dynamic Mobile Re-framing + GSAP ScrollTrigger + Lenis Momentum Scroll
 */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const isMobile = window.innerWidth < 768;

  // =========================================================================
  // 1. LENIS SMOOTH MOMENTUM SCROLL ENGINE
  // =========================================================================
  let lenis = null;
  if (typeof Lenis !== 'undefined') {
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

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });

    gsap.ticker.lagSmoothing(0);
  }

  // =========================================================================
  // 2. 96 PROGRESSIVE WEBP FRAMES & CANVAS ENGINE (Full HD 1280x720 Retina Clarity)
  // =========================================================================
  const TOTAL_FRAMES = 96;
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;

  // Desktop/tablet (>=768px) use frames-desktop; phones (<768px) use frames-mobile (1280x720 WebP, ~15KB each)
  const frameDir = isMobile ? './frames-mobile' : './frames-desktop';
  const getFrameUrl = (idx) => `${frameDir}/frame-${String(idx).padStart(3, '0')}.webp`;

  const frameImages = new Array(TOTAL_FRAMES);
  const loadedIndices = new Set();
  let targetProgress = 0;
  let smoothProgress = 0;
  let smoothY = 0;
  const footerEl = document.getElementById('footer-section');

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    computeMobileKeys();
    render();
  }

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('load', () => computeMobileKeys());

  // Progressive Preloading Strategy:
  // Step 1: Preload frame 1 immediately for instant first-paint
  const img1 = new Image();
  img1.decoding = 'async';
  img1.src = getFrameUrl(1);
  img1.onload = () => {
    frameImages[0] = img1;
    loadedIndices.add(0);
    resizeCanvas();
    startProgressiveLoading();
  };

  // Step 2: Preload milestone frames every 6th frame first, then fill in all remaining frames
  function startProgressiveLoading() {
    const milestones = [];
    const remaining = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (i % 6 === 0) milestones.push(i);
      else remaining.push(i);
    }

    const loadBatch = (indices, callback) => {
      let pending = indices.length;
      if (pending === 0) {
        if (callback) callback();
        return;
      }
      indices.forEach((idx) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = getFrameUrl(idx + 1);
        img.onload = () => {
          frameImages[idx] = img;
          loadedIndices.add(idx);
          pending--;
          if (pending === 0 && callback) callback();
        };
        img.onerror = () => {
          pending--;
          if (pending === 0 && callback) callback();
        };
      });
    };

    // Load key milestones first, then the rest
    loadBatch(milestones, () => {
      loadBatch(remaining);
    });
  }

  // MOBILE (<768px) FRAMING DATA — measured per frame from the image sequence:
  // FOCUS_X = horizontal centre of Simanto (+ mug), HEAD_Y = top of his head (both as a fraction of the frame)
  const FOCUS_X = [0.237,0.237,0.236,0.234,0.232,0.229,0.226,0.223,0.222,0.221,0.222,0.227,0.233,0.243,0.254,0.268,0.284,0.300,0.317,0.334,0.351,0.365,0.384,0.401,0.423,0.445,0.473,0.496,0.523,0.545,0.568,0.585,0.605,0.621,0.640,0.656,0.675,0.693,0.711,0.725,0.739,0.748,0.754,0.758,0.760,0.762,0.764,0.765,0.766,0.767,0.767,0.767,0.766,0.765,0.762,0.757,0.750,0.740,0.727,0.711,0.694,0.675,0.656,0.636,0.615,0.590,0.562,0.530,0.494,0.459,0.424,0.392,0.364,0.340,0.320,0.303,0.290,0.280,0.273,0.268,0.265,0.263,0.263,0.264,0.264,0.265,0.266,0.267,0.268,0.268,0.269,0.270,0.270,0.270,0.270,0.270];
  const HEAD_Y = [0.300,0.300,0.299,0.298,0.296,0.292,0.289,0.287,0.282,0.278,0.273,0.269,0.264,0.260,0.256,0.251,0.243,0.236,0.229,0.221,0.212,0.207,0.200,0.194,0.189,0.184,0.176,0.167,0.156,0.144,0.132,0.124,0.116,0.107,0.099,0.092,0.086,0.081,0.078,0.076,0.074,0.073,0.072,0.072,0.072,0.073,0.074,0.076,0.077,0.079,0.080,0.081,0.082,0.083,0.083,0.084,0.086,0.086,0.082,0.077,0.068,0.058,0.049,0.043,0.041,0.041,0.042,0.041,0.038,0.033,0.029,0.024,0.022,0.026,0.029,0.032,0.037,0.041,0.042,0.046,0.050,0.053,0.057,0.060,0.061,0.062,0.063,0.064,0.066,0.067,0.067,0.066,0.064,0.064,0.064,0.064];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const sampleTable = (tbl, f) => {
    const i = Math.min(tbl.length - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(tbl.length - 1, i + 1);
    return lerp(tbl[i], tbl[j], clamp01(f - i));
  };

  function getBestLoadedImage(exactIdx) {
    const target = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(exactIdx)));
    if (frameImages[target] && loadedIndices.has(target)) {
      return frameImages[target];
    }
    // Search outwards for nearest loaded frame
    for (let r = 1; r < TOTAL_FRAMES; r++) {
      if (target - r >= 0 && loadedIndices.has(target - r)) return frameImages[target - r];
      if (target + r < TOTAL_FRAMES && loadedIndices.has(target + r)) return frameImages[target + r];
    }
    return frameImages[0] || null;
  }

  // Desktop frame mapping (unchanged): global scroll progress -> frame
  function desktopFrameFromProgress(p) {
    let frameProgress;
    if (p <= 0.42) {
      frameProgress = (p / 0.42) * (65 / TOTAL_FRAMES);
    } else {
      frameProgress = (65 / TOTAL_FRAMES) + ((p - 0.42) / 0.58) * (1 - (65 / TOTAL_FRAMES));
    }
    return frameProgress * (TOTAL_FRAMES - 1);
  }

  // Mobile frame mapping: anchored to section positions so each phase shows the right part of the clip
  //   hero -> frame 0 (standing, arms crossed) | story -> he walks away and comes back
  //   coffee section top -> he is back holding the mug | coffee hold -> steam builds
  let mobileKeys = [[0, 0], [1, TOTAL_FRAMES - 1]];
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
      [chair + chairScroll, TOTAL_FRAMES - 1]
    ];
  }
  function mobileFrameFromY(y) {
    const k = mobileKeys;
    if (y <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (y <= k[i][0]) {
        const t = (y - k[i - 1][0]) / Math.max(1, k[i][0] - k[i - 1][0]);
        return lerp(k[i - 1][1], k[i][1], t);
      }
    }
    return k[k.length - 1][1];
  }

  function drawDesktop(img, cw, ch) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const nw = Math.ceil(iw * scale);
    const nh = Math.ceil(ih * scale);
    const ox = Math.floor((cw - nw) / 2);
    const oy = Math.floor((ch - nh) / 2);
    ctx.drawImage(img, ox, oy, nw, nh);
  }

  // Mobile "portfolio cover" framing: the clip sits in the top of the screen and fades into #060b18,
  // so text lives on a clean dark area in the bottom ~40% and never covers his face.
  function drawMobile(img, cw, ch, f) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    // Image height relative to the screen: 1.0 for hero/glance/story, 0.66 for the coffee moment
    // (so Simanto + mug fit inside the top ~60%).
    const coffee = smooth((f - 56) / (80 - 56));
    // Form phase (last frames): ease him + mug a little higher/smaller so the heading and form never cover the mug
    const formPhase = smooth((f - 88) / 7);
    const s = lerp(lerp(1.0, 0.66, coffee), 0.62, formPhase);
    // Where the top of his head should land on screen
    let headTarget = f <= 12 ? 0.13 : (f <= 40 ? lerp(0.13, 0.10, (f - 12) / 28) : lerp(0.10, 0.085, clamp01((f - 40) / 40)));
    headTarget = lerp(headTarget, 0.05, formPhase);
    const nh = Math.ceil(ch * s);
    const nw = Math.ceil(iw * (nh / ih));
    // In the coffee frames bias slightly right so the mug (right of him) is never clipped
    const focusX = sampleTable(FOCUS_X, f) + 0.014 * smooth((f - 74) / 8);
    let ox = Math.round(cw / 2 - nw * focusX);
    ox = Math.min(0, Math.max(cw - nw, ox));
    let oy = Math.round(headTarget * ch - sampleTable(HEAD_Y, f) * nh);
    oy = Math.min(Math.round(ch * 0.08), oy);

    ctx.fillStyle = '#060b18';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, ox, oy, nw, nh);
    if (oy > 0) {
      // Extend the backdrop above the frame seamlessly (stretch the top rows of the frame)
      const srcX = (-ox) * (iw / nw);
      const srcW = cw * (iw / nw);
      ctx.drawImage(img, srcX, 0, srcW, 3, 0, 0, cw, oy + 1);
    }
    // Soft fade of the frame's bottom edge into the dark text area
    const bottom = oy + nh;
    const fadeH = ch * 0.2;
    const g = ctx.createLinearGradient(0, bottom - fadeH, 0, bottom);
    g.addColorStop(0, 'rgba(6, 11, 24, 0)');
    g.addColorStop(1, 'rgba(6, 11, 24, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, bottom - fadeH, cw, fadeH + 1);
  }

  // Draw the current frame
  let lastFooterFade = -1;
  function render(progressOrY) {
    if (!ctx || !canvas) return;
    const currentlyMobile = window.innerWidth < 768;
    const exactFrame = currentlyMobile
      ? mobileFrameFromY(smoothY)
      : desktopFrameFromProgress(Math.min(1, Math.max(0, smoothProgress)));
    const img = getBestLoadedImage(exactFrame);
    if (!img || !img.complete || !img.naturalWidth) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (currentlyMobile) {
      drawMobile(img, canvas.width, canvas.height, exactFrame);
    } else {
      drawDesktop(img, canvas.width, canvas.height);
    }

    // Never show the zoomed video behind the footer: fade the canvas to the plain dark background
    let fade = 1;
    if (currentlyMobile && footerEl) {
      const ft = footerEl.getBoundingClientRect().top / window.innerHeight;
      fade = clamp01((ft - 0.25) / 0.6);
    } else if (!currentlyMobile) {
      // Desktop: unchanged behaviour (canvas fades out over the last part of the page)
      const p = Math.min(1, Math.max(0, smoothProgress));
      fade = p >= 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.08) : 1;
    }
    if (fade !== lastFooterFade) {
      canvas.style.opacity = fade.toFixed(3);
      lastFooterFade = fade;
    }
  }

  // Scroll Progress Tracking
  if (lenis) {
    lenis.on('scroll', ({ progress }) => {
      targetProgress = progress;
      handleNavMorph(progress);
    });
  } else {
    window.addEventListener('scroll', () => {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetProgress = scrollY / maxScroll;
      handleNavMorph(targetProgress);
    }, { passive: true });
  }

  // 60fps Hardware Render Loop
  function raf() {
    // Soft lerp interpolation
    const lerpSpeed = isTouch ? 0.15 : 0.10;
    smoothProgress += (targetProgress - smoothProgress) * lerpSpeed;
    smoothY += (window.scrollY - smoothY) * lerpSpeed;
    if (Math.abs(window.scrollY - smoothY) < 0.5) smoothY = window.scrollY;
    render();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // =========================================================================
  // 3. NAVIGATION SYSTEM (Top Pill -> Vertical Left Morph)
  // =========================================================================
  const navWrapper = document.getElementById('nav-wrapper');

  function handleNavMorph(progress) {
    if (!navWrapper) return;
    if (progress > 0.08) {
      navWrapper.classList.add('morphed');
    } else {
      navWrapper.classList.remove('morphed');
    }
  }

  // Smooth scroll to sections on nav clicks
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const drawer = document.getElementById('mobile-drawer');
        if (drawer && drawer.classList.contains('open')) {
          drawer.classList.remove('open');
        }

        if (lenis) {
          lenis.scrollTo(targetElement, { offset: 0, duration: 1.4 });
        } else {
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // Mobile Drawer Toggle
  const burgerBtn = document.getElementById('mobile-burger');
  const mobileDrawer = document.getElementById('mobile-drawer');
  if (burgerBtn && mobileDrawer) {
    burgerBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('open');
    });
    mobileDrawer.addEventListener('click', (e) => {
      if (e.target === mobileDrawer) {
        mobileDrawer.classList.remove('open');
      }
    });
  }

  // =========================================================================
  // 4. GSAP SCROLLTRIGGER SECTION ANIMATIONS
  // =========================================================================
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    // Hero Entrance
    gsap.fromTo('.hero-content',
      { opacity: 0, x: 30 },
      { opacity: 1, x: 0, duration: 1.0, ease: 'power3.out', delay: 0.2 }
    );

    // Section 2: Cards Fan-out
    const cards = document.querySelectorAll('.deck-card');
    if (cards.length > 0) {
      ScrollTrigger.create({
        trigger: '#glance-section',
        start: 'top 70%',
        onEnter: () => {
          gsap.fromTo(cards,
            { opacity: 0, y: 30, scale: 0.95 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.6,
              stagger: 0.08,
              ease: 'power2.out',
              onComplete: () => {
                if (!isMobile) {
                  cards.forEach((card) => card.classList.add('floating'));
                }
              }
            }
          );
        }
      });
    }

    // Section 3: Story Progression
    const storyLines = document.querySelectorAll('.story-line');
    const progressIndicator = document.getElementById('story-indicator');
    const setActiveLine = (activeIndex) => {
      storyLines.forEach((line, index) => {
        line.classList.toggle('active', index === activeIndex);
      });
    };

    if (storyLines.length > 0 && isMobile) {
      // Mobile: the story is pinned (CSS sticky) and shows ONE line at a time in the bottom area.
      // Lines advance over the first ~84% of the section, then the whole block fades out completely
      // before the coffee moment starts, so nothing (e.g. 'patients.') lingers over the next phase.
      const storyContainer = document.querySelector('.story-lines-container');
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          const linesP = Math.min(0.999, p / 0.84);
          setActiveLine(Math.floor(linesP * storyLines.length));
          const out = p <= 0.86 ? 1 : Math.max(0, 1 - (p - 0.86) / 0.1);
          storyContainer.style.opacity = out.toFixed(3);
        },
        onLeave: () => { storyContainer.style.opacity = '0'; },
        onLeaveBack: () => { storyContainer.style.opacity = '1'; setActiveLine(0); }
      });
    } else if (storyLines.length > 0) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top 60%',
        end: 'bottom 40%',
        onLeave: () => {
          // Hide all story lines when leaving the story section downwards so nothing bleeds into the next section
          storyLines.forEach((line) => {
            line.classList.remove('active');
            line.style.opacity = '0';
          });
        },
        onEnterBack: () => {
          storyLines.forEach((line) => {
            line.style.opacity = '';
          });
        },
        onLeaveBack: () => {
          storyLines.forEach((line, index) => {
            line.style.opacity = '';
            if (index === 0) line.classList.add('active');
            else line.classList.remove('active');
          });
        },
        onUpdate: (self) => {
          const progress = self.progress;
          const activeIndex = Math.min(
            storyLines.length - 1,
            Math.floor(progress * storyLines.length)
          );
          storyLines.forEach((line) => { line.style.opacity = ''; });
          setActiveLine(activeIndex);

          if (progressIndicator) {
            const travelHeight = 380 - (380 * 0.25);
            progressIndicator.style.transform = `translateY(${progress * travelHeight}px)`;
          }
        }
      });
    }

    // Section 4: Pull Up a Chair Entrance
    if (isMobile) {
      // Mobile Coffee Moment (content is pinned with CSS sticky inside a tall section):
      //  0.00-0.30  clean hold: Simanto + mug fully visible in the top ~60%, no text at all
      //  0.30-0.55  heading + line fade in BELOW the mug
      //  0.55-0.85  mug-shaped glass booking form rises in under them
      gsap.set('.chair-title, .chair-desc', { opacity: 0, y: 18 });
      gsap.set('.mug-form-wrapper', { opacity: 0, y: 40 });

      const chairTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#chair-section',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.4
        }
      });

      chairTl
        .to({}, { duration: 0.30 })
        .to('.chair-title, .chair-desc', { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' })
        .to('.mug-form-wrapper', { opacity: 1, y: 0, duration: 0.30, ease: 'power2.out' })
        .to({}, { duration: 0.15 });

      // Hide the fixed burger while the form is on screen so it never overlaps inputs / Reserve My Seat
      const burger = document.getElementById('mobile-burger');
      if (burger) {
        ScrollTrigger.create({
          trigger: '#chair-section',
          start: 'top 40%',
          endTrigger: '#footer-section',
          end: 'top 5%',
          toggleClass: { targets: burger, className: 'is-hidden' }
        });
      }
    } else {
      gsap.fromTo('.chair-content',
        { opacity: 0, y: 35 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '#chair-section',
            start: 'top 75%'
          }
        }
      );
    }

    ScrollTrigger.addEventListener('refresh', computeMobileKeys);

    // Section 5: Footer Reveal
    gsap.fromTo('.footer-panel',
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '#footer-section',
          start: 'top 85%'
        }
      }
    );
  }

  // =========================================================================
  // 5. NETLIFY FORM INTERACTION
  // =========================================================================
  const bookingForm = document.getElementById('chair-form');
  const successBanner = document.getElementById('form-success');

  if (bookingForm && successBanner) {
    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const submitBtn = bookingForm.querySelector('.btn-reserve');
      submitBtn.innerHTML = `<span>Reserving Seat...</span>`;
      submitBtn.style.opacity = '0.7';
      submitBtn.disabled = true;

      const formData = new FormData(bookingForm);

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString()
      })
      .then(() => {
        bookingForm.style.display = 'none';
        successBanner.style.display = 'block';
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(successBanner, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
        }
      })
      .catch(() => {
        bookingForm.style.display = 'none';
        successBanner.style.display = 'block';
      });
    });
  }

  // =========================================================================
  // 6. SMOKY BLUE CURSOR LIGHT (Desktop Pointer Only)
  // =========================================================================
  const cursorGlow = document.getElementById('cursor-glow');

  if (cursorGlow && !isTouch) {
    let mouseX = -1000;
    let mouseY = -1000;
    let currentX = -1000;
    let currentY = -1000;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function updateCursor() {
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;

      cursorGlow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      requestAnimationFrame(updateCursor);
    }
    requestAnimationFrame(updateCursor);

    const hoverTargets = document.querySelectorAll('.deck-card, .glass-pill, button, a, .glass-input');
    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        cursorGlow.style.width = '600px';
        cursorGlow.style.height = '600px';
        cursorGlow.style.marginTop = '-300px';
        cursorGlow.style.marginLeft = '-300px';
        cursorGlow.style.background = 'radial-gradient(circle, rgba(56, 189, 248, 0.28) 0%, rgba(14, 165, 233, 0.1) 40%, transparent 70%)';
      });
      el.addEventListener('mouseleave', () => {
        cursorGlow.style.width = '480px';
        cursorGlow.style.height = '480px';
        cursorGlow.style.marginTop = '-240px';
        cursorGlow.style.marginLeft = '-240px';
        cursorGlow.style.background = 'radial-gradient(circle, rgba(56, 189, 248, 0.16) 0%, rgba(14, 165, 233, 0.06) 40%, transparent 70%)';
      });
    });
  }
});
