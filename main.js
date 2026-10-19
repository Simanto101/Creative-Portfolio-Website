/**
 * SIMANTO MITRO — HOMEPAGE INTERACTIVE ENGINE
 * Plain JS + GSAP ScrollTrigger + Lenis Smooth Momentum
 */

document.addEventListener('DOMContentLoaded', () => {
  // Register GSAP plugins
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;

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
  // 2. VIDEO TIMELINE & MOVEMENT SYNCHRONIZATION
  // =========================================================================
  const video = document.getElementById('hero-video');
  let videoDuration = 7.5;
  let isSeeking = false;
  let pendingTime = null;

  if (video) {
    video.addEventListener('loadedmetadata', () => {
      videoDuration = video.duration || 7.5;
      video.currentTime = 0.001;
    });

    // Touch / Autoplay policy unlock
    const unlockMedia = () => {
      video.play().then(() => {
        video.pause();
      }).catch(() => {});
      window.removeEventListener('touchstart', unlockMedia);
      window.removeEventListener('wheel', unlockMedia);
    };
    window.addEventListener('touchstart', unlockMedia, { passive: true, once: true });
    window.addEventListener('wheel', unlockMedia, { passive: true, once: true });

    // Non-blocking seek listener to prevent stuttering
    video.addEventListener('seeked', () => {
      isSeeking = false;
      if (pendingTime !== null) {
        const next = pendingTime;
        pendingTime = null;
        applyVideoTime(next);
      }
    });
  }

  function applyVideoTime(t) {
    if (!video || !videoDuration || video.readyState < 2) return;
    if (isSeeking) {
      pendingTime = t;
      return;
    }
    if (Math.abs(video.currentTime - t) > 0.012) {
      isSeeking = true;
      video.currentTime = t;
    }
  }

  // Map scroll progress across the page to match Simanto's movement in the video:
  // 0% -> 25% (Hero): Simanto on left, standing tall
  // 25% -> 50% (At a Glance): Simanto shifts right, cards fan out on left
  // 50% -> 72% (Story): Simanto center/left, story text on right
  // 72% -> 100% (Pull Up a Chair & Footer): Simanto offers coffee cup with rising steam
  function syncVideoWithScroll(progress) {
    if (!video || !videoDuration) return;
    const p = Math.min(1, Math.max(0, progress));
    const smokeStartTime = 5.0; // Where cup is raised & steam billows
    const smokeRatio = smokeStartTime / videoDuration; // ~0.667

    let targetRatio;
    if (p <= 0.65) {
      targetRatio = (p / 0.65) * smokeRatio;
    } else {
      // Extended screen time for the rising steam
      targetRatio = smokeRatio + ((p - 0.65) / 0.35) * (1 - smokeRatio);
    }

    const targetTime = Math.min(videoDuration - 0.04, Math.max(0.001, targetRatio * videoDuration));
    applyVideoTime(targetTime);
  }

  // Bind video sync to scroll
  if (lenis) {
    lenis.on('scroll', ({ progress }) => {
      syncVideoWithScroll(progress);
      handleNavMorph(progress);
    });
  } else {
    window.addEventListener('scroll', () => {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = scrollY / maxScroll;
      syncVideoWithScroll(progress);
      handleNavMorph(progress);
    }, { passive: true });
  }

  // =========================================================================
  // 3. NAVIGATION SYSTEM (Top Pill -> Vertical Left Morph)
  // =========================================================================
  const navWrapper = document.getElementById('nav-wrapper');
  const navLinks = document.querySelectorAll('.nav-link');

  function handleNavMorph(progress) {
    if (!navWrapper) return;
    // Morph to vertical left panel after scrolling past initial hero view
    if (progress > 0.08) {
      navWrapper.classList.add('morphed');
    } else {
      navWrapper.classList.remove('morphed');
    }
  }

  // Smooth scroll to sections on nav clicks
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        // Close mobile drawer if open
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
    // Close on click outside
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
    // Hero Entrance and Exit
    gsap.fromTo('.hero-content',
      { opacity: 0, x: 40 },
      {
        opacity: 1,
        x: 0,
        duration: 1.2,
        ease: 'power3.out',
        delay: 0.2
      }
    );

    // Section 2: At a Glance (Cards Fan-out)
    const cards = document.querySelectorAll('.deck-card');
    if (cards.length > 0) {
      ScrollTrigger.create({
        trigger: '#glance-section',
        start: 'top 70%',
        onEnter: () => {
          gsap.fromTo(cards,
            { opacity: 0, y: 50, scale: 0.9 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.8,
              stagger: 0.12,
              ease: 'back.out(1.4)',
              onComplete: () => {
                // Enable gentle floating sine wave physics
                cards.forEach(card => card.classList.add('floating'));
              }
            }
          );
        }
      });
    }

    // Section 3: Story Sequential Progression
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

          // Update active line state
          storyLines.forEach((line, index) => {
            if (index === activeIndex) {
              line.classList.add('active');
            } else {
              line.classList.remove('active');
            }
          });

          // Move the sleek vertical progress rail indicator
          if (progressIndicator) {
            const travelHeight = 380 - (380 * 0.25);
            progressIndicator.style.transform = `translateY(${progress * travelHeight}px)`;
          }
        }
      });
    }

    // Section 4: Pull Up a Chair Entrance
    gsap.fromTo('.chair-content',
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 1.0,
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
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '#footer-section',
          start: 'top 85%'
        }
      }
    );
  }

  // =========================================================================
  // 5. PULL UP A CHAIR — NETLIFY FORM WITH SUCCESS ANIMATION
  // =========================================================================
  const bookingForm = document.getElementById('chair-form');
  const successBanner = document.getElementById('form-success');

  if (bookingForm && successBanner) {
    bookingForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const submitBtn = bookingForm.querySelector('.btn-reserve');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = `<span>Reserving Seat...</span>`;
      submitBtn.style.opacity = '0.7';
      submitBtn.disabled = true;

      // Prepare form data for Netlify
      const formData = new FormData(bookingForm);

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString()
      })
      .then(() => {
        // Successful submission animation
        bookingForm.style.display = 'none';
        successBanner.style.display = 'block';
        gsap.fromTo(successBanner, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
      })
      .catch((error) => {
        // Fallback smooth display even if offline/local preview
        bookingForm.style.display = 'none';
        successBanner.style.display = 'block';
        gsap.fromTo(successBanner, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
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
      // Smooth trailing physics
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;

      cursorGlow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      requestAnimationFrame(updateCursor);
    }

    requestAnimationFrame(updateCursor);

    // Expand & intensify on hover over glass cards and buttons
    const hoverTargets = document.querySelectorAll('.deck-card, .glass-pill, button, a, .glass-input');
    hoverTargets.forEach(el => {
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
