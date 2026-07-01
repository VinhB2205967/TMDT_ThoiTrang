/**
 * Auto-reply Settings Manager
 * Simple UI component for admin to manage auto-reply settings
 */

class AutoReplyManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.config = null;
    this.stats = null;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.render();
    this.attachEventListeners();
  }

  async loadSettings() {
    try {
      const response = await fetch('/admin/api/chats/auto-reply/settings');
      const result = await response.json();
      
      if (result.success && result.data) {
        this.config = result.data.config;
        this.stats = result.data.stats;
      }
    } catch (error) {
      console.error('Failed to load auto-reply settings:', error);
    }
  }

  render() {
    if (!this.config) {
      this.container.innerHTML = '<p>Không thể tải cài đặt</p>';
      return;
    }

    const html = `
      <div class="auto-reply-settings">
        <h5>Cài đặt Tự trả lời</h5>
        
        <div class="form-group">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="autoReplyEnabled" 
              ${this.config.enabled ? 'checked' : ''}>
            <label class="form-check-label" for="autoReplyEnabled">
              Kích hoạt Tự trả lời
            </label>
          </div>
          <small class="form-text text-muted">
            Hệ thống sẽ tự động gửi câu trả lời khi khách hàng gửi câu hỏi
          </small>
        </div>

        <div class="stats-box mb-3 p-3 bg-light rounded">
          <h6>Thống kê Hôm nay</h6>
          <div class="row">
            <div class="col-md-6">
              <p class="mb-1">
                <strong>Đã gửi:</strong> 
                <span class="badge bg-info">${this.stats.todayCount}</span>
              </p>
            </div>
            <div class="col-md-6">
              <p class="mb-1">
                <strong>Còn lại:</strong> 
                <span class="badge bg-success">${this.stats.remainingToday}</span>
              </p>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="autoReplyProvider">Nhà cung cấp AI</label>
          <select class="form-control" id="autoReplyProvider">
            <option value="gemini" ${this.config.provider === 'gemini' ? 'selected' : ''}>Gemini</option>
            <option value="ollama" ${this.config.provider === 'ollama' ? 'selected' : ''}>Ollama</option>
            <option value="openrouter" ${this.config.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
          </select>
        </div>

        <div class="form-group">
          <label for="autoReplyModel">Model AI</label>
          <input type="text" class="form-control" id="autoReplyModel" 
            value="${this.config.model || ''}"
            placeholder="Ví dụ: gemini-2.5-flash">
          <small class="form-text text-muted">
            Để trống để sử dụng model mặc định
          </small>
        </div>

        <div class="form-group">
          <label for="autoReplyDelay">Độ trễ trước khi trả lời (ms)</label>
          <input type="number" class="form-control" id="autoReplyDelay" 
            value="${this.config.autoResponseDelay || 2000}"
            min="0" max="30000" step="500">
          <small class="form-text text-muted">
            Thời gian chờ trước khi gửi trả lời tự động (0-30000ms)
          </small>
        </div>

        <div class="form-group">
          <label for="minMessageLength">Độ dài tối thiểu tin nhắn</label>
          <input type="number" class="form-control" id="minMessageLength" 
            value="${this.config.minMessageLength || 1}"
            min="1" max="1000">
          <small class="form-text text-muted">
            Chỉ trả lời với tin nhắn có ít nhất số ký tự này
          </small>
        </div>

        <div class="form-group">
          <label for="maxAutoRepliesPerDay">Số trả lời tối đa mỗi ngày</label>
          <input type="number" class="form-control" id="maxAutoRepliesPerDay" 
            value="${this.config.maxAutoRepliesPerDay || 100}"
            min="1" max="1000">
          <small class="form-text text-muted">
            Giới hạn số tin nhắn tự động gửi mỗi ngày
          </small>
        </div>

        <div class="form-group">
          <label for="excludeKeywords">Từ khóa loại trừ (cách nhau bằng dấu phẩy)</label>
          <textarea class="form-control" id="excludeKeywords" rows="3">${(this.config.excludeKeywords || []).join(', ')}</textarea>
          <small class="form-text text-muted">
            Tin nhắn chứa các từ khóa này sẽ không được trả lời tự động
          </small>
        </div>

        <button class="btn btn-primary" id="saveAutoReplySettings">Lưu cài đặt</button>
        <button class="btn btn-secondary ms-2" id="resetAutoReplySettings">Đặt lại</button>
      </div>
    `;

    this.container.innerHTML = html;
  }

  attachEventListeners() {
    document.getElementById('saveAutoReplySettings').addEventListener('click', () => this.save());
    document.getElementById('resetAutoReplySettings').addEventListener('click', () => this.reset());
  }

  async save() {
    const btn = document.getElementById('saveAutoReplySettings');
    btn.disabled = true;

    try {
      const updates = {
        enabled: document.getElementById('autoReplyEnabled').checked,
        provider: document.getElementById('autoReplyProvider').value,
        model: document.getElementById('autoReplyModel').value,
        autoResponseDelay: parseInt(document.getElementById('autoReplyDelay').value, 10),
        minMessageLength: parseInt(document.getElementById('minMessageLength').value, 10),
        maxAutoRepliesPerDay: parseInt(document.getElementById('maxAutoRepliesPerDay').value, 10),
        excludeKeywords: document.getElementById('excludeKeywords').value
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0)
      };

      const response = await fetch('/admin/api/chats/auto-reply/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const result = await response.json();

      if (result.success) {
        this.config = result.data.config;
        this.stats = result.data.stats;
        alert('Cài đặt đã được lưu thành công');
        this.render();
        this.attachEventListeners();
      } else {
        alert('Lỗi: ' + (result.message || 'Không thể lưu cài đặt'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Lỗi khi lưu cài đặt');
    } finally {
      btn.disabled = false;
    }
  }

  reset() {
    if (confirm('Bạn có chắc chắn muốn đặt lại cài đặt về mặc định?')) {
      this.loadSettings().then(() => this.render());
      this.attachEventListeners();
    }
  }
}

// Usage: new AutoReplyManager('autoReplyContainer');
