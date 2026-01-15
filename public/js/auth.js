(function () {
  const page = document.querySelector('.auth-page');
  const card = document.querySelector('.auth-card');
  if (!page || !card) return;

  const currentMode = page.getAttribute('data-mode') || 'login';

  function goWithAnimation(href, targetMode) {
    if (!href) return;

    const isToRegister = targetMode === 'register';
    const isFromRegister = currentMode === 'register';

    card.classList.remove('auth-leave-left', 'auth-leave-right');

    if (isToRegister && !isFromRegister) {
      card.classList.add('auth-leave-left');
    } else if (!isToRegister && isFromRegister) {
      card.classList.add('auth-leave-right');
    } else {
      card.classList.add('auth-leave-left');
    }

    window.setTimeout(() => {
      window.location.href = href;
    }, 160);
  }

  document.querySelectorAll('.auth-card .nav-link[href]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      const url = new URL(href, window.location.origin);
      const targetMode = url.searchParams.get('mode') || 'login';
      if (targetMode === currentMode) return;
      e.preventDefault();
      goWithAnimation(href, targetMode);
    });
  });
})();
