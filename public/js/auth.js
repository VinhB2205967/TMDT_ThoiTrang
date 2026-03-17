(function () {
  const trang = document.querySelector('.auth-page');
  const the = document.querySelector('.auth-card');
  if (!trang || !the) return;

  const cheDoHienTai = trang.getAttribute('data-mode') || 'login';

  function diChuyenKemHieuUng(href, cheDoDich) {
    if (!href) return;

    const denDangKy = cheDoDich === 'register';
    const tuDangKy = cheDoHienTai === 'register';

    the.classList.remove('auth-leave-left', 'auth-leave-right');

    if (denDangKy && !tuDangKy) {
      the.classList.add('auth-leave-left');
    } else if (!denDangKy && tuDangKy) {
      the.classList.add('auth-leave-right');
    } else {
      the.classList.add('auth-leave-left');
    }

    window.setTimeout(() => {
      window.location.href = href;
    }, 160);
  }

  document.querySelectorAll('.auth-card .nav-link[href]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      const duongDan = new URL(href, window.location.origin);
      const cheDoDich = duongDan.searchParams.get('mode') || 'login';
      if (cheDoDich === cheDoHienTai) return;
      e.preventDefault();
      diChuyenKemHieuUng(href, cheDoDich);
    });
  });

  document.querySelectorAll('.auth-password-toggle').forEach((nut) => {
    nut.addEventListener('click', () => {
      const boChon = nut.getAttribute('data-toggle-password');
      if (!boChon) return;
      const oMatKhau = document.querySelector(boChon);
      if (!oMatKhau) return;

      const dangAn = oMatKhau.type === 'password';
      oMatKhau.type = dangAn ? 'text' : 'password';

      const icon = nut.querySelector('i');
      if (icon) {
        icon.classList.toggle('bi-eye', !dangAn);
        icon.classList.toggle('bi-eye-slash', dangAn);
      }

      const nhan = dangAn ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
      nut.setAttribute('aria-label', nhan);
      nut.setAttribute('title', nhan);
      nut.setAttribute('aria-pressed', String(dangAn));
    });
  });
})();
