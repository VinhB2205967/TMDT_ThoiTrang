(() => {
  const section = document.querySelector('[data-flash-end]');
  if (!section) return;

  const endRaw = section.getAttribute('data-flash-end');
  const endAt = endRaw ? new Date(endRaw).getTime() : 0;
  if (!endAt) return;

  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  function pad(num) {
    return String(num).padStart(2, '0');
  }

  function tick() {
    const now = Date.now();
    const diff = endAt - now;
    if (diff <= 0) {
      section.style.display = 'none';
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minutesEl) minutesEl.textContent = pad(minutes);
    if (secondsEl) secondsEl.textContent = pad(seconds);

    requestAnimationFrame(() => {
      setTimeout(tick, 1000);
    });
  }

  tick();
})();
