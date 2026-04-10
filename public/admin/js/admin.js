(() => {
  const App = window.App || (window.App = {});

  App.clearAdminPageFlash = function clearAdminPageFlash() {
    document.querySelectorAll('.runtime-admin-flash').forEach((node) => node.remove());
  };

  App.showAdminPageFlash = function showAdminPageFlash(type, message, options = {}) {
    if (!message) return;

    const anchor = options.anchor || document.querySelector(
      '.main .container-fluid, .main .container, .main .page-header-section, .main'
    );
    if (!anchor || !anchor.parentNode) return;

    App.clearAdminPageFlash();

    const wrap = document.createElement('div');
    wrap.className = 'container mt-3 runtime-admin-flash';

    const alertClass = type === 'success'
      ? 'alert-success'
      : (type === 'info' ? 'alert-info' : 'alert-danger');
    const iconClass = type === 'success'
      ? 'bi-check-circle-fill'
      : (type === 'info' ? 'bi-info-circle-fill' : 'bi-exclamation-triangle-fill');

    wrap.innerHTML = `
      <div class="alert ${alertClass} alert-dismissible fade show flash-alert" role="alert" data-auto-dismiss="5000">
        <i class="bi ${iconClass} me-2"></i>${message}
        <button class="btn-close" type="button" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;

    anchor.parentNode.insertBefore(wrap, anchor);

    if (App.autoDismissAlerts) {
      App.autoDismissAlerts('.runtime-admin-flash .flash-alert', 5000);
    }
  };

  // Button Status Filter
  const nutTrangThai = document.querySelectorAll('[button-status]');
  if (nutTrangThai.length > 0) {
    nutTrangThai.forEach((nut) => {
      nut.addEventListener('click', () => {
        const duongDan = new URL(window.location.href);
        const trangThai = nut.getAttribute('button-status');

        duongDan.searchParams.delete('page');

        if (trangThai) {
          duongDan.searchParams.set('trangthai', trangThai);
        } else {
          duongDan.searchParams.delete('trangthai');
        }

        window.location.href = duongDan.href;
      });
    });
  }
  // End Button Status

  // Form Search
  const formTimKiem = document.querySelector('#form-search');
  if (formTimKiem) {
    formTimKiem.addEventListener('submit', (e) => {
      e.preventDefault();
      const duongDan = new URL(window.location.href);
      const tuKhoa = e.target.elements.keyword.value.trim();

      if (tuKhoa) {
        duongDan.searchParams.set('keyword', tuKhoa);
      } else {
        duongDan.searchParams.delete('keyword');
      }

      duongDan.searchParams.delete('page');

      window.location.href = duongDan.href;
    });
  }
  // End Form Search
})();
