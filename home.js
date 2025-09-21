/*  ===========================
    INTERACTIVE SPLIT LANDING
    - Horizontal pan stops at image edge
    - Emergency overlays + narrative captions
    =========================== */

(function () {
  const panels = Array.from(document.querySelectorAll('.panel'));
  if (!panels.length) return;

  const CAPTIONS = {
    sky: [
      { anchor: 0.22, text: 'Globally, around 650 commercial aircraft retire each year on average over the past decade. Over the last 35 years, more than 16,000 passenger and cargo planes have been officially retired. More than 30% of Europe’s current aircraft fleet is expected to retire in the next decade due to age and usage factors.' },
      { anchor: 0.58, text: 'Aircraft retirement rates are projected to accelerate — at least 11,000 retirements expected globally over the next 10 years. Despite growing demand, delivery delays have slowed fleet renewal; older planes stay in service longer under increased maintenance burdens. Retirements per year vary — 400-900 previously; but with global fleet expansion, surplus capacity is rising.' },
    ],
    city: [
      { anchor: 0.24, text: 'In 2023, ~42.3% of California households were cost burdened — spending at least 30% of income on housing. The median monthly homeowner costs rose to $2,035 in 2024, up from $1,960 in 2023 — pushing many families toward the breaking point. A household earning $50,000 can now afford fewer than 9% of homes listed for sale nationally, down from ~10% a year ago.' },
      { anchor: 0.62, text: 'A household needs ~$232,400/year just to afford CA’s median home payment under current rates. Nearly 80% of extremely low-income renters in CA pay over 50% of income on housing + utilities. California’s housing affordability is near historic lows—median home price & high interest rates exclude most buyers.ter waitlists double as new builds stall out.' },
    ],
  };

  const RIGHT_EDGE_TOLERANCE = 4;
  const NUDGE_MAX = 12;
  const WHEEL_SPEED = 0.35;
  const DAMPING = 0.12;
  const KEYBOARD_STEP = 48;
  const OVERSHOOT = 1.25;

  const state = new Map(); // panel -> {x, targetX, maxX, hovering, pannedOnce, nudgeY, scaledWidth, viewportWidth}
  const captionsByPanel = new Map(); // panel -> { key, root, text, active }
  const imageMetrics = new Map();

  panels.forEach((panel) => {
    const key = panel.classList.contains('panel--city') ? 'city' : 'sky';
    const captionRoot = panel.querySelector('.caption');
    const captionText = captionRoot?.querySelector('.caption__text');
    if (captionRoot && captionText) {
      captionsByPanel.set(panel, { key, root: captionRoot, text: captionText, active: null });
    }

    panel.setAttribute('tabindex', '0');

    state.set(panel, {
      x: 0,
      targetX: 0,
      maxX: 0,
      hovering: false,
      pannedOnce: false,
      nudgeY: 0,
      scaledWidth: 0,
      viewportWidth: 0,
    });

    panel.addEventListener('mouseenter', () => {
      panel.classList.add('hovered');
      const s = state.get(panel);
      if (s) s.hovering = true;
    });

    panel.addEventListener('mouseleave', () => {
      panel.classList.remove('hovered');
      const s = state.get(panel);
      if (!s) return;
      s.hovering = false;
      s.nudgeY = 0;
      panel.style.setProperty('--nudgeY', '0px');
    });

    panel.addEventListener('mousemove', (event) => {
      const rect = panel.getBoundingClientRect();
      const relY = (event.clientY - rect.top) / rect.height;
      const nudge = (relY - 0.5) * 2 * NUDGE_MAX;
      const s = state.get(panel);
      if (!s) return;
      s.nudgeY = nudge;
      panel.style.setProperty('--nudgeY', `${nudge.toFixed(2)}px`);
    });

    panel.addEventListener('wheel', (event) => {
      event.preventDefault();
      const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!dominant) return;

      const s = state.get(panel);
      if (!s) return;

      let next = s.targetX + dominant * WHEEL_SPEED;
      if (next < 0) next = 0;
      if (next > s.maxX) next = s.maxX;

      s.targetX = next;
      s.x = next;

      if (!s.pannedOnce && next > 8) {
        s.pannedOnce = true;
        panel.classList.add('panned');
      }

      updateOverlay(panel);
      updateCaption(panel);
    }, { passive: false });

    updateOverlay(panel);
    updateCaption(panel);
    requestAnimationFrame(() => calculatePanLimit(panel));
  });

  function tick() {
    panels.forEach((panel) => {
      const s = state.get(panel);
      if (!s) return;

      s.x += (s.targetX - s.x) * DAMPING;
      if (s.x < 0) s.x = 0;
      if (s.x > s.maxX) s.x = s.maxX;

      panel.style.backgroundPositionX = `${-s.x}px`;
      updateOverlay(panel, true);
      updateCaption(panel);
    });

    requestAnimationFrame(tick);
  }
  tick();

  function updateOverlay(panel, throttle = false) {
    const s = state.get(panel);
    if (!s) return;

    const overlay = panel.querySelector('.overlay');
    if (!overlay) return;

    const show = s.maxX > 0 && s.targetX >= s.maxX - RIGHT_EDGE_TOLERANCE;

    if (throttle) {
      if (show && !overlay.classList.contains('show')) overlay.classList.add('show');
      else if (!show && overlay.classList.contains('show')) overlay.classList.remove('show');
    } else {
      overlay.classList.toggle('show', show);
    }
  }

  function updateCaption(panel) {
    const refs = captionsByPanel.get(panel);
    if (!refs) return;

    const s = state.get(panel);
    if (!s || s.scaledWidth <= 0 || s.viewportWidth <= 0) {
      setCaptionActive(refs, null, 0);
      return;
    }

    const descriptors = CAPTIONS[refs.key] || [];
    let best = null;
    let bestIntensity = 0;
    let bestCenter = 0;

    descriptors.forEach((descriptor) => {
      const anchorAbs = descriptor.anchor * s.scaledWidth;
      const targetX = clamp(anchorAbs - s.viewportWidth / 2, 0, s.maxX);
      const distance = Math.abs(s.x - targetX);
      const threshold = Math.max(80, s.viewportWidth * 0.16);
      const intensity = clamp(1 - distance / threshold, 0, 1);

      if (intensity > bestIntensity) {
        bestIntensity = intensity;
        best = descriptor;
        bestCenter = anchorAbs - s.x;
      }
    });

    if (!best || bestIntensity < 0.08) {
      setCaptionActive(refs, null, 0);
      return;
    }

    refs.root.style.setProperty('--caption-center', `${bestCenter}px`);
    setCaptionActive(refs, best, bestIntensity);
  }

  function setCaptionActive(refs, descriptor, intensity) {
    if (!refs) return;
    const active = descriptor && intensity > 0.08;

    if (active) {
      if (refs.active !== descriptor) {
        refs.text.textContent = descriptor.text;
        refs.active = descriptor;
      }
      refs.root.classList.add('is-active');
      refs.root.setAttribute('aria-hidden', 'false');
    } else {
      refs.root.classList.remove('is-active');
      refs.root.setAttribute('aria-hidden', 'true');
      refs.text.textContent = '';
      refs.root.style.removeProperty('--caption-center');
      refs.active = null;
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const focusedPanel = document.activeElement.closest?.('.panel');
    if (!focusedPanel) return;

    const s = state.get(focusedPanel);
    if (!s) return;

    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP;
    let next = s.targetX + delta;
    if (next < 0) next = 0;
    if (next > s.maxX) next = s.maxX;

    s.targetX = next;
    s.x = next;

    if (!s.pannedOnce && next > 8) {
      s.pannedOnce = true;
      focusedPanel.classList.add('panned');
    }

    updateOverlay(focusedPanel);
    updateCaption(focusedPanel);
  });

  function calculatePanLimit(panel) {
    const s = state.get(panel);
    if (!s) return;

    const style = getComputedStyle(panel);
    const url = extractImageUrl(style.backgroundImage);

    const applyMax = (metrics) => {
      const { maxX, scaledWidth, viewportWidth } = metrics;
      s.maxX = maxX;
      s.scaledWidth = scaledWidth;
      s.viewportWidth = viewportWidth;

      if (s.targetX > maxX) s.targetX = maxX;
      if (s.x > maxX) s.x = maxX;

      updateOverlay(panel, true);
      updateCaption(panel);
    };

    if (!url) {
      const rect = panel.getBoundingClientRect();
      applyMax({ maxX: 0, scaledWidth: rect.width, viewportWidth: rect.width });
      return;
    }

    const cached = imageMetrics.get(url);
    if (cached) {
      applyMax(computeMetrics(panel, cached));
      return;
    }

    const img = new Image();
    img.onload = () => {
      const metrics = { width: img.naturalWidth, height: img.naturalHeight };
      imageMetrics.set(url, metrics);
      applyMax(computeMetrics(panel, metrics));
    };
    img.onerror = () => {
      const rect = panel.getBoundingClientRect();
      applyMax({ maxX: 0, scaledWidth: rect.width, viewportWidth: rect.width });
    };
    img.src = url;
  }

  function computeMetrics(panel, metrics) {
    const rect = panel.getBoundingClientRect();
    if (!metrics.width || !metrics.height || !rect.width || !rect.height) {
      const safeWidth = rect.width || 0;
      return { maxX: 0, scaledWidth: safeWidth, viewportWidth: safeWidth };
    }

    const scale = rect.height / metrics.height;
    const baseWidth = metrics.width * scale;
    const scaledWidth = Math.max(baseWidth, rect.width * OVERSHOOT);
    const widthPercent = (scaledWidth / rect.width) * 100;

    panel.style.backgroundSize = `${widthPercent}% 100%`;

    const maxX = Math.max(0, scaledWidth - rect.width);
    return { maxX, scaledWidth, viewportWidth: rect.width };
  }

  function extractImageUrl(value) {
    if (!value || value === 'none') return null;
    const match = value.match(/url\((['\"]?)(.*?)\1\)/);
    return match ? match[2] : null;
  }

  window.addEventListener('resize', () => {
    panels.forEach(calculatePanLimit);
  }, { passive: true });

  function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
})();
