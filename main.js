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
  const isMobile = window.innerWidth < 1024;

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

  // Always use full 1280x720 HD frames for pristine clarity on mobile, tablet & desktop
  const frameDir = './frames-desktop';
  const getFrameUrl = (idx) => `${frameDir}/frame-${String(idx).padStart(3, '0')}.webp`;

  const frameImages = new Array(TOTAL_FRAMES);
  const loadedIndices = new Set();
  let targetProgress = 0;
  let smoothProgress = 0;

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    render(smoothProgress);
  }

  window.addEventListener('resize', resizeCanvas);

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

  // Precise dynamic tracking of Simanto's center of mass across frames
  // Simanto's actual bounds: Frame 1-20 (cx ~0.27), Frame 20-60 (cx ~0.33 -> 0.42), Frame 60-96 (cx ~0.42 -> 0.31)
  function getFrameFocusX(frameIdx) {
    const norm = Math.min(1, Math.max(0, frameIdx / (TOTAL_FRAMES - 1)));
    if (norm <= 0.20) {
      return 0.27 + (norm / 0.20) * 0.05; // 0.27 -> 0.32
    } else if (norm <= 0.55) {
      const t = (norm - 0.20) / (0.55 - 0.20);
      return 0.32 + t * (0.42 - 0.32); // 0.32 -> 0.42 (when cup turns towards center)
    } else if (norm <= 0.75) {
      const t = (norm - 0.55) / (0.75 - 0.55);
      return 0.42 - t * (0.42 - 0.32); // 0.42 -> 0.32
    } else {
      return 0.32;
    }
  }

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

  // Draw frame on canvas with dynamic mobile re-framing
  function render(progress) {
    if (!ctx || !canvas) return;
    const p = Math.min(1, Math.max(0, progress));

    // Extended timeline mapping:
    // Scroll 0% -> 42%: Character turn & cup lift (frames 1 to 65)
    // Scroll 42% -> 100%: Lingering smoke effect (frames 66 to 96)
    let frameProgress;
    if (p <= 0.42) {
      frameProgress = (p / 0.42) * (65 / TOTAL_FRAMES);
    } else {
      frameProgress = (65 / TOTAL_FRAMES) + ((p - 0.42) / 0.58) * (1 - (65 / TOTAL_FRAMES));
    }

    const exactFrame = frameProgress * (TOTAL_FRAMES - 1);
    const img = getBestLoadedImage(exactFrame);

    if (!img || !img.complete || !img.naturalWidth) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Cover scale factor
    const scale = Math.max(cw / iw, ch / ih);
    const nw = Math.ceil(iw * scale);
    const nh = Math.ceil(ih * scale);

    let ox, oy;
    const currentlyMobile = window.innerWidth < 1024;

    if (currentlyMobile) {
      // 1. Mobile & Tablet Re-framing: Keep Simanto fully in frame without cutting off
      const focusX = getFrameFocusX(exactFrame);
      ox = Math.floor((cw / 2) - (nw * focusX));
      // Clamp ox so it covers edge to edge without black gaps
      ox = Math.min(0, Math.max(cw - nw, ox));
      // Position person in the upper/mid portion so text panels sit cleanly below his face
      oy = Math.floor((ch - nh) * 0.14);
      oy = Math.min(0, Math.max(ch - nh, oy));
    } else {
      // Desktop: Keep exactly as original centered design without changing desktop look
      ox = Math.floor((cw - nw) / 2);
      oy = Math.floor((ch - nh) / 2);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, nw, nh);
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
    render(smoothProgress);
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
            { opacity: 0, y: 40, scale: 0.92 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.7,
              stagger: 0.1,
              ease: 'back.out(1.4)',
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

    if (storyLines.length > 0) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top 60%',
        end: 'bottom 40%',
        onUpdate: (self) => {
          const progress = self.progress;
          const activeIndex = Math.min(
            storyLines.length - 1,
            Math.floor(progress * storyLines.length)
          );

          storyLines.forEach((line, index) => {
            if (index === activeIndex) {
              line.classList.add('active');
            } else {
              line.classList.remove('active');
            }
          });

          if (progressIndicator) {
            const travelHeight = 380 - (380 * 0.25);
            progressIndicator.style.transform = `translateY(${progress * travelHeight}px)`;
          }
        }
      });
    }

    // Section 4: Pull Up a Chair Entrance
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
