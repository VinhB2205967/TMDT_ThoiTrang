/**
 * Modern Auth - Advanced Interactions & Animations
 * Premium authentication experience with GSAP & SweetAlert2
 */

(function() {
  'use strict';

  // ========================================
  // Initialize AOS (Animate On Scroll)
  // ========================================
  AOS.init({
    duration: 800,
    easing: 'ease-in-out',
    once: true,
    mirror: false
  });

  // ========================================
  // Form Validation
  // ========================================
  class AuthValidator {
    static rules = {
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Email không hợp lệ'
      },
      password: {
        minLength: 6,
        message: 'Mật khẩu phải có ít nhất 6 ký tự'
      },
      hoten: {
        minLength: 2,
        message: 'Tên phải có ít nhất 2 ký tự'
      }
    };

    static validate(field, value) {
      const rule = this.rules[field];
      if (!rule) return { valid: true };

      if (rule.pattern && !rule.pattern.test(value)) {
        return { valid: false, message: rule.message };
      }

      if (rule.minLength && value.length < rule.minLength) {
        return { valid: false, message: rule.message };
      }

      return { valid: true };
    }
  }

  // ========================================
  // Form Manager
  // ========================================
  class AuthFormManager {
    constructor() {
      this.form = document.querySelector('form');
      this.inputs = this.form?.querySelectorAll('.auth-input') || [];
      this.submitBtn = this.form?.querySelector('.auth-btn-primary');
      this.isSubmitting = false;

      this.init();
    }

    init() {
      if (!this.form) return;

      // Real-time validation
      this.inputs.forEach(input => {
        input.addEventListener('blur', (e) => this.validateInput(e.target));
        input.addEventListener('change', (e) => this.validateInput(e.target));
        
        // Add focus animation
        input.addEventListener('focus', (e) => {
          e.target.closest('.auth-form-group')?.classList.add('focused');
        });
        
        input.addEventListener('blur', (e) => {
          e.target.closest('.auth-form-group')?.classList.remove('focused');
        });
      });

      // Form submission
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    validateInput(input) {
      const { valid, message } = AuthValidator.validate(input.name, input.value);

      if (!valid && input.value) {
        this.setError(input, message);
      } else {
        this.clearError(input);
      }
    }

    setError(input, message) {
      const group = input.closest('.auth-form-group');
      if (!group) return;

      input.classList.add('is-invalid');
      
      let errorMsg = group.querySelector('.error-message');
      if (!errorMsg) {
        errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        group.appendChild(errorMsg);
      }
      
      errorMsg.textContent = message;
      errorMsg.style.display = 'block';
    }

    clearError(input) {
      const group = input.closest('.auth-form-group');
      if (!group) return;

      input.classList.remove('is-invalid');
      
      const errorMsg = group.querySelector('.error-message');
      if (errorMsg) {
        errorMsg.style.display = 'none';
      }
    }

    isFormValid() {
      let valid = true;
      this.inputs.forEach(input => {
        const { valid: isValid } = AuthValidator.validate(input.name, input.value);
        if (!isValid) {
          valid = false;
          this.setError(input, AuthValidator.rules[input.name]?.message || 'Không hợp lệ');
        }
      });
      return valid;
    }

    handleSubmit(e) {
      if (!this.isFormValid()) {
        e.preventDefault();
        this.showValidationError();
      }
    }

    showValidationError() {
      Swal.fire({
        icon: 'warning',
        title: 'Kiểm tra lại thông tin',
        text: 'Vui lòng điền đầy đủ và chính xác các trường bắt buộc',
        confirmButtonText: 'Đã hiểu',
        background: 'rgba(255, 255, 255, 0.95)',
        backdrop: 'rgba(0, 0, 0, 0.2)',
        confirmButtonColor: '#667eea',
        animation: true
      });
    }
  }

  // ========================================
  // Tab Switching
  // ========================================
  class AuthTabManager {
    constructor() {
      this.tabs = document.querySelectorAll('.auth-tab');
      this.init();
    }

    init() {
      this.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => this.handleTabClick(e));
      });
    }

    handleTabClick(e) {
      const href = e.currentTarget.getAttribute('href');
      if (!href) return;

      e.preventDefault();

      // Animate card out
      const card = document.querySelector('.auth-card-modern');
      if (card) {
        gsap.to(card, {
          opacity: 0,
          y: -20,
          duration: 0.3,
          ease: 'power2.inOut',
          onComplete: () => {
            window.location.href = href;
          }
        });
      }
    }
  }

  // ========================================
  // Password Toggle
  // ========================================
  class PasswordToggle {
    constructor() {
      this.toggles = document.querySelectorAll('.auth-password-toggle');
      this.init();
    }

    init() {
      this.toggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => this.handleToggle(e));
      });
    }

    handleToggle(e) {
      const selector = e.currentTarget.getAttribute('data-toggle-password');
      if (!selector) return;

      const input = document.querySelector(selector);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const icon = e.currentTarget.querySelector('i');
      if (icon) {
        gsap.to(icon, {
          rotation: isPassword ? 360 : 0,
          duration: 0.4,
          ease: 'back.out'
        });

        icon.classList.toggle('bi-eye', !isPassword);
        icon.classList.toggle('bi-eye-slash', isPassword);
      }

      e.currentTarget.setAttribute('aria-pressed', String(isPassword));
    }
  }

  // ========================================
  // Toast Notifications
  // ========================================
  class AuthToast {
    static show(message, type = 'success', duration = 5000) {
      const toast = document.createElement('div');
      toast.className = `auth-toast toast-${type}`;
      
      const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
      toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
      `;

      document.body.appendChild(toast);

      gsap.to(toast, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'back.out'
      });

      setTimeout(() => {
        gsap.to(toast, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => toast.remove()
        });
      }, duration);
    }
  }

  // ========================================
  // Input Animations
  // ========================================
  function initInputAnimations() {
    const inputs = document.querySelectorAll('.auth-input');
    
    inputs.forEach(input => {
      // Placeholder animation
      input.addEventListener('focus', function() {
        gsap.to(this, {
          backgroundColor: '#ffffff',
          borderColor: '#667eea',
          duration: 0.2,
          ease: 'power2.out'
        });
      });

      input.addEventListener('blur', function() {
        if (!this.value) {
          gsap.to(this, {
            backgroundColor: '#f8fafc',
            borderColor: '#e2e8f0',
            duration: 0.2,
            ease: 'power2.out'
          });
        }
      });
    });
  }

  // ========================================
  // Button Interactions
  // ========================================
  function initButtonInteractions() {
    const buttons = document.querySelectorAll('.auth-btn');

    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', function() {
        gsap.to(this, {
          y: -3,
          boxShadow: '0 15px 35px rgba(102, 126, 234, 0.45)',
          duration: 0.2
        });
      });

      btn.addEventListener('mouseleave', function() {
        gsap.to(this, {
          y: 0,
          boxShadow: '0 10px 25px rgba(102, 126, 234, 0.35)',
          duration: 0.2
        });
      });

      btn.addEventListener('mousedown', function() {
        gsap.to(this, {
          scale: 0.98,
          duration: 0.1
        });
      });

      btn.addEventListener('mouseup', function() {
        gsap.to(this, {
          scale: 1,
          duration: 0.1
        });
      });
    });
  }

  // ========================================
  // Social Button Animations
  // ========================================
  function initSocialButtons() {
    const socialBtns = document.querySelectorAll('.auth-social-btn');

    socialBtns.forEach(btn => {
      btn.addEventListener('mouseenter', function() {
        const icon = this.querySelector('i');
        if (icon) {
          gsap.to(icon, {
            scale: 1.2,
            rotation: 15,
            duration: 0.3,
            ease: 'back.out'
          });
        }
      });

      btn.addEventListener('mouseleave', function() {
        const icon = this.querySelector('i');
        if (icon) {
          gsap.to(icon, {
            scale: 1,
            rotation: 0,
            duration: 0.3,
            ease: 'back.out'
          });
        }
      });
    });
  }

  // ========================================
  // Page Load Animation
  // ========================================
  function initPageLoadAnimation() {
    const card = document.querySelector('.auth-card-modern');
    const header = document.querySelector('.auth-header');

    if (card) {
      gsap.set(card, { opacity: 0, y: 30 });
      gsap.to(card, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out'
      });
    }

    if (header) {
      const children = header.querySelectorAll('h1, p');
      gsap.to(children, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out'
      });
    }
  }

  // ========================================
  // Remember Email
  // ========================================
  function handleRememberEmail() {
    const rememberCheckbox = document.getElementById('rememberEmail');
    if (!rememberCheckbox) return;

    rememberCheckbox.addEventListener('change', function() {
      const email = document.querySelector('input[name="email"]')?.value;
      if (this.checked && email) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
    });
  }

  // ========================================
  // Keyboard Shortcuts
  // ========================================
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to submit form
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const form = document.querySelector('form');
        form?.requestSubmit();
      }

      // Show password on Shift + P
      if (e.shiftKey && e.key === 'P') {
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        passwordInputs.forEach(input => {
          input.type = input.type === 'password' ? 'text' : 'password';
        });
      }
    });
  }

  // ========================================
  // Initialize Everything on DOM Ready
  // ========================================
  document.addEventListener('DOMContentLoaded', () => {
    initPageLoadAnimation();
    initInputAnimations();
    initButtonInteractions();
    initSocialButtons();
    handleRememberEmail();
    initKeyboardShortcuts();

    new AuthFormManager();
    new AuthTabManager();
    new PasswordToggle();

    // Log initialization
    console.log('✨ Modern Auth System initialized');
  });

  // ========================================
  // Export for external use
  // ========================================
  window.AuthUtils = {
    showToast: (msg, type = 'success') => AuthToast.show(msg, type),
    validateForm: () => new AuthFormManager().isFormValid()
  };

})();
