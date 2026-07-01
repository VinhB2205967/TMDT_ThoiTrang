# 🌙 Admin Dark Mode v2 - Hướng dẫn Sử dụng

Dự án đã được nâng cấp với giao diện Dark Mode hiện đại, đẹp mắt với các hiệu ứng màu sắc gradient, glassmorphism, và card-based layout.

## 📋 Tổng Quan Thay Đổi

### ✨ CSS Files Mới Tạo

1. **`/admin/css/admin-dark-mode.css`** (v20260615-1)
   - Tệp CSS chính cho dark mode
   - Định nghĩa các biến CSS toàn cục (--dark-bg-primary, --dark-text-primary, etc.)
   - Kiểu dáng cho buttons, forms, tables, badges, alerts
   - Hiệu ứng hover, animations, transitions
   - Scrollbar styling

2. **`/admin/css/admin-list-layouts.css`** (v20260615-1)
   - Các layout component tái sử dụng:
     - `.admin-gallery-container` - Grid gallery cho images
     - `.admin-list-container` - Card-based list layout
     - `.admin-detailed-item` - Detailed item card
     - `.admin-tree-container` - Hierarchy/tree layout
     - `.admin-filter-bar` - Filter/search bar
     - `.admin-empty-state` - Empty state display

3. **`/admin/css/chat-admin-dark.css`** (v20260615-1)
   - Styling dành riêng cho chat admin
   - Sidebar với danh sách hội thoại
   - Message panel với glassmorphism effect
   - AI suggestion panel

### 🎨 Cập Nhật Pages

#### Chat Admin (`/admin/chat`)
- **Trước**: Simple layout với table
- **Sau**: Modern panel layout với sidebar, chat messages, AI suggestions
- **CSS**: `admin-dark-mode.css` + `chat-admin-dark.css`

#### Vouchers (`/admin/vouchers`)
- **Trước**: Table-based layout
- **Sau**: Card-grid layout với stats, progress bar, status badges
- **Features**: 
  - Beautiful card design
  - Voucher stats display (đã dùng/tổng)
  - Color-coded status badges
  - Responsive grid layout

#### Blog (`/admin/blog`)
- **Trước**: Table with thumbnails
- **Sau**: Card list layout với featured images
- **Features**:
  - Full-width card display
  - Image preview
  - Status badges (Nháp/Xuất bản)

#### Lookbooks (`/admin/lookbooks`)
- **Trước**: Table layout
- **Sau**: Beautiful gallery grid
- **Features**:
  - Image gallery with hover effect
  - Stats display (sản phẩm, thứ tự)
  - Status indicators

#### Brands (`/admin/home/brands`)
- **Trước**: Card + table combination
- **Sau**: Pure gallery grid
- **Features**:
  - Logo gallery
  - Featured status
  - Quick actions

#### Size Guides (`/admin/size-guides`)
- **Trước**: Table layout
- **Sau**: Card list with detailed info
- **Features**:
  - Size info display
  - Column/row counts
  - Type information

#### Reviews (`/admin/reviews`)
- **Trước**: Detailed table
- **Sau**: Card list with content preview
- **Features**:
  - Star rating display
  - Image count
  - Expandable content
  - Product stats

## 🎯 Color Palette

### Primary Colors
```css
--accent-primary: #6366f1;      /* Indigo */
--accent-secondary: #8b5cf6;    /* Violet */
--accent-tertiary: #d946ef;     /* Magenta */
--accent-cool: #06b6d4;         /* Cyan */
--accent-warm: #f59e0b;         /* Amber */
```

### Gradients
```css
--gradient-primary: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
--gradient-cool: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
--gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
--gradient-danger: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
```

### Dark Mode Backgrounds
```css
--dark-bg-primary: #0f1419;     /* Main background */
--dark-bg-secondary: #1a1f2e;   /* Secondary bg */
--dark-card: rgba(42, 50, 68, 0.6);  /* Card background */
--dark-surface: rgba(26, 31, 46, 0.7);  /* Surface */
```

## 🚀 Cách Sử Dụng CSS Classes

### 1. Page Header
```html
.admin-page-header
  h3 Title
  p.text-muted Subtitle
  a.btn.btn-admin-accent Action
```

### 2. List Container (Card Layout)
```html
.admin-list-container
  .admin-list-item (repeating)
    .admin-list-item-header
      .admin-list-item-title
      .admin-list-item-subtitle
    .admin-list-item-content
      .admin-list-item-field
        .admin-list-item-label
        .admin-list-item-value
    .admin-list-item-actions
      button.btn
```

### 3. Gallery Grid
```html
.admin-gallery-container
  .admin-gallery-card (repeating)
    .admin-gallery-card-image
    .admin-gallery-card-content
      .admin-gallery-card-title
      .admin-gallery-card-meta
        .admin-gallery-card-stat
      .admin-gallery-card-status
      .admin-gallery-card-actions
```

### 4. Filter/Search Bar
```html
.admin-filter-bar
  input.form-control
  select.form-select
  button.btn.btn-outline-primary
```

### 5. Empty State
```html
.admin-empty-state
  .admin-empty-state-icon 📦
  .admin-empty-state-title Title
  .admin-empty-state-description Description
  a.btn.btn-admin-accent Action
```

## 🎨 Status Badges

### Color Variants
```html
<!-- Active/Success -->
.status-badge.status-active ✓ Đang hoạt động

<!-- Paused/Secondary -->
.status-badge.status-paused ⏸️ Tạm khóa

<!-- Expired/Danger -->
.status-badge.status-expired ⏰ Hết hạn

<!-- Sold Out/Warning -->
.status-badge.status-soldout ⚡ Hết lượt
```

## 📱 Responsive Design

### Breakpoints
- **1200px+**: Full desktop layout
- **768px - 1200px**: Tablet layout (adjusted grid)
- **Below 768px**: Mobile layout (single column)

### Gallery Responsive
```
1200px+:  repeat(auto-fill, minmax(280px, 1fr))
1024px:   repeat(auto-fill, minmax(240px, 1fr))
768px:    repeat(auto-fill, minmax(200px, 1fr))
```

## 🎬 Animations & Effects

### Hover Effects
- Card elevation: `translateY(-2px)`
- Glow effect: `box-shadow: var(--dark-shadow-glow)`
- Border highlight: `border-color: rgba(99, 102, 241, 0.4)`
- Image zoom: `scale(1.05)` or `scale(1.08)`

### Transitions
- Fast: `0.15s cubic-bezier(0.22, 1, 0.36, 1)`
- Base: `0.3s cubic-bezier(0.22, 1, 0.36, 1)`
- Slow: `0.5s cubic-bezier(0.22, 1, 0.36, 1)`

## 📐 Spacing & Sizing

### Radius
```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
```

### Standard Padding
- Container: `p-3` (16px)
- Card: `16px`
- Field: `12px`

## 🔧 Integration Checklist

- [x] Load `admin-dark-mode.css` in layout
- [x] Load `admin-list-layouts.css` in layout
- [x] Load `chat-admin-dark.css` for chat page
- [x] Update chat page with new structure
- [x] Update vouchers page with card layout
- [x] Update blog page with card layout
- [x] Update lookbooks page with gallery
- [x] Update brands page with gallery
- [x] Update size-guides page with card layout
- [x] Update reviews page with card layout

## 📊 Component Examples

### Voucher Card
```html
.admin-list-item
  .admin-list-item-header
    .admin-list-item-title Code
    .admin-list-item-subtitle Name
    img(src="banner")
  
  .voucher-stats
    .stat-item
      .stat-value 50
      .stat-label Đã dùng
    .stat-item
      .stat-value 100
      .stat-label Tổng
  
  .progress
  
  .status-badge.status-active ✓ Đang hoạt động
  
  .admin-list-item-actions
    a.btn Sửa
    form
      button Tạm khóa
```

### Blog Card
```html
.admin-list-item
  .admin-list-item-header
    .admin-list-item-title Title
    .admin-list-item-subtitle Summary
    img(src="thumbnail")
  
  img.full-width(src="featured-image")
  
  .admin-list-item-content
    .admin-list-item-field
      .admin-list-item-label 📅 Cập nhật
      .admin-list-item-value Date
    .admin-list-item-field
      .admin-list-item-label 📤 Trạng thái
      .admin-list-item-value
        span.badge Status
```

## 🐛 Known Issues & Solutions

### Issue: Dark mode text not visible
**Solution**: Ensure `admin-dark-mode.css` is loaded after Bootstrap CSS

### Issue: Cards not showing gradient borders
**Solution**: Check that `.admin-list-item::before` pseudo-element CSS is not overridden

### Issue: Hover effects not smooth
**Solution**: Verify transitions are defined: `transition: all var(--transition-base)`

## 📚 Resources

- Bootstrap 5.x
- Bootstrap Icons (bi-*)
- CSS Custom Properties (CSS Variables)
- CSS Grid & Flexbox
- CSS Animations & Transitions

## 🎯 Future Improvements

- [ ] Add theme toggle (light/dark mode switch)
- [ ] Add RTL support for Arabic/Vietnamese
- [ ] Implement advanced filtering with chips
- [ ] Add bulk actions toolbar
- [ ] Implement inline editing for cards
- [ ] Add drag-and-drop reordering
- [ ] Create component library documentation

---

**Version**: 2.0 (2026-06-15)
**Last Updated**: 2026-06-15
