/**
 * Issued web reader – page navigation, fullscreen, progress tracking
 */
(() => {
  const reader = document.querySelector('.reader');
  if (!reader) return;

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const img = $('#reader-image');
  const spinner = $('#reader-spinner');
  const pageNumEl = $('#reader-page-num');
  const progressBar = $('#reader-progress');
  const prevBtn = $('#reader-prev');
  const nextBtn = $('#reader-next');
  const fsBtn = $('#fullscreen-toggle');
  const fsIconEnter = $('#fullscreen-icon-enter');
  const fsIconExit = $('#fullscreen-icon-exit');
  const imageWrap = $('.reader-image-wrap');
  const controlEls = ['.reader-controls', '.reader-navigation', '.reader-hints'].map($);
  const zoomInBtn = $('#zoom-in');
  const zoomOutBtn = $('#zoom-out');
  const zoomLevelEl = $('#zoom-level');

  const comicUuid = reader.dataset.comicUuid;
  const pageCount = parseInt(reader.dataset.pageCount, 10) || 1;
  const initialPage = parseInt(reader.dataset.initialPage, 10) || 1;

  let currentPage = initialPage;
  let loading = false;
  let progressTimer = null;
  let hideTimer = null;
  let lastTouchEnd = 0;

  // --- Zoom ---

  const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  const ZOOM_DEFAULT = 2; // index of 1.0
  let zoomIdx = ZOOM_DEFAULT;

  let zoomBaseW = 0;
  let zoomBaseH = 0;

  const applyZoom = () => {
    const z = ZOOM_LEVELS[zoomIdx];

    if (z === 1) {
      img.style.width = '';
      img.style.height = '';
      img.style.maxWidth = '';
      img.style.maxHeight = '';
      imageWrap.style.overflow = '';
      imageWrap.style.alignItems = '';
      imageWrap.style.justifyContent = '';
      zoomBaseW = 0;
      zoomBaseH = 0;
    } else {
      if (!zoomBaseW) {
        zoomBaseW = img.offsetWidth;
        zoomBaseH = img.offsetHeight;
      }
      img.style.width = `${zoomBaseW * z}px`;
      img.style.height = `${zoomBaseH * z}px`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      if (z > 1) {
        imageWrap.style.overflow = 'auto';
        imageWrap.style.alignItems = 'flex-start';
        imageWrap.style.justifyContent = 'flex-start';
      } else {
        imageWrap.style.overflow = '';
        imageWrap.style.alignItems = '';
        imageWrap.style.justifyContent = '';
      }
    }

    if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(z * 100)}%`;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomIdx === 0;
    if (zoomInBtn) zoomInBtn.disabled = zoomIdx === ZOOM_LEVELS.length - 1;
  };

  const zoomIn = () => { if (zoomIdx < ZOOM_LEVELS.length - 1) { zoomIdx++; applyZoom(); } };
  const zoomOut = () => { if (zoomIdx > 0) { zoomIdx--; applyZoom(); } };
  const resetZoom = () => { zoomIdx = ZOOM_DEFAULT; applyZoom(); };

  zoomInBtn?.addEventListener('click', zoomIn);
  zoomOutBtn?.addEventListener('click', zoomOut);

  // --- Helpers ---

  const pageUrl = (p) =>
    `/reader/api/comic/${encodeURIComponent(comicUuid)}/page/${p}`;

  const setSpinner = (on) => spinner?.classList.toggle('visible', on);

  const setControlsVisible = (visible) => {
    controlEls.forEach(el => el?.classList.toggle('hidden', !visible));
    reader.classList.toggle('cursor-hidden', !visible);
  };

  // --- Page navigation ---

  const updatePage = (page) => {
    if (page < 1 || page > pageCount || loading) return;
    loading = true;
    currentPage = page;

    setSpinner(true);
    img.style.opacity = '0.5';

    const url = pageUrl(page);
    const preload = new Image();

    const done = () => {
      img.style.opacity = '1';
      setSpinner(false);
      loading = false;
    };

    preload.onload = () => { img.src = url; img.alt = `Page ${page}`; zoomBaseW = 0; zoomBaseH = 0; done(); };
    preload.onerror = done;
    preload.src = url;

    // Update UI
    pageNumEl.textContent = page;
    progressBar.style.width = `${(page / pageCount) * 100}%`;
    prevBtn.disabled = page === 1;
    nextBtn.disabled = page === pageCount;

    saveProgress();
  };

  const navigate = (delta) => updatePage(currentPage + delta);

  // --- Progress save (debounced) ---

  const saveProgress = () => {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      fetch(`/reader/api/comic/${encodeURIComponent(comicUuid)}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_page: currentPage, is_completed: currentPage === pageCount }),
      }).catch(() => { });
    }, 500);
  };

  // --- Tap navigation (mobile + desktop) ---

  const handleTap = (clientX) => {
    if (!imageWrap || loading) return;
    const rect = imageWrap.getBoundingClientRect();
    navigate((clientX - rect.left) < rect.width / 2 ? -1 : 1);
  };

  imageWrap?.addEventListener('click', (e) => {
    if (Date.now() - lastTouchEnd < 400) return;
    handleTap(e.clientX);
  });

  imageWrap?.addEventListener('touchend', (e) => {
    if (e.cancelable && e.changedTouches?.length) {
      e.preventDefault();
      lastTouchEnd = Date.now();
      handleTap(e.changedTouches[0].clientX);
    }
  }, { passive: false });

  // --- Fullscreen ---

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      reader.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
    }
  };

  const showControls = () => {
    if (!document.fullscreenElement) return;
    setControlsVisible(true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (document.fullscreenElement) setControlsVisible(false);
    }, 3000);
  };

  fsBtn.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    fsIconEnter.classList.toggle('hidden', !!document.fullscreenElement);
    fsIconExit.classList.toggle('hidden', !document.fullscreenElement);
    if (document.fullscreenElement) {
      showControls();
    } else {
      setControlsVisible(true);
      clearTimeout(hideTimer);
    }
  });

  reader.addEventListener('mousemove', showControls);

  // --- Button events ---

  prevBtn.addEventListener('click', () => { navigate(-1); showControls(); });
  nextBtn.addEventListener('click', () => { navigate(1); showControls(); });

  // --- Keyboard ---

  document.addEventListener('keydown', (e) => {
    const actions = {
      ArrowLeft: () => navigate(-1),
      ArrowRight: () => navigate(1),
      f: toggleFullscreen,
      F: toggleFullscreen,
      '+': zoomIn,
      '=': zoomIn,
      '-': zoomOut,
      '0': resetZoom,
    };
    if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
  });

  // --- Init ---

  if (img && spinner) {
    setSpinner(true);
    img.addEventListener('load', () => setSpinner(false), { once: true });
    setTimeout(() => setSpinner(false), 3000);
  }

  updatePage(initialPage);
})();
