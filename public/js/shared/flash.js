(() => {
  if (!window.App || !window.App.autoDismissAlerts) return;
  document.addEventListener('DOMContentLoaded', () => {
    window.App.autoDismissAlerts('.flash-alert', 5000);
  });
})();
