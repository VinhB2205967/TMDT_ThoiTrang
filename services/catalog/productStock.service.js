const { NO_SIZE_TYPES } = require('../../config/constants');

function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (String(path).startsWith('/public')) return String(path).replace('/public', '');
  return path;
}

function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productdoc) {
  if (!productdoc) return 0;

  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  let tong = 0;

  if (coSize) {
    (productdoc.sizes || []).forEach((s) => {
      tong += s && s.soluong ? Number(s.soluong) : 0;
    });

    (productdoc.bienthe || []).forEach((v) => {
      (v.sizes || []).forEach((s) => {
        tong += s && s.soluong ? Number(s.soluong) : 0;
      });
    });

    return tong;
  }

  tong += Number(productdoc.soluong_chinh || 0);
  (productdoc.bienthe || []).forEach((v) => {
    tong += Number(v.soluong || 0);
  });

  return tong;
}

// Láº¥y thÃ´ng tin biáº¿n thá»ƒ vÃ  tá»“n kho
function layBienTheVaTon(productdoc, bientheId, kichco) {
  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  const laChinh = !bientheId || bientheId === 'main';

  if (laChinh) {
    const mausac = productdoc.mausac_chinh || 'Máº·c Ä‘á»‹nh';
    const hinhanh = normalizeImage(productdoc.hinhanh);
    const gia = productdoc.gia || 0;
    const giamgia = productdoc.phantramgiamgia || 0;
    const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

    if (coSize) {
      const sizes = Array.isArray(productdoc.sizes) ? productdoc.sizes : [];
      const dongsize = sizes.find((s) => s.size === kichco);
      const tonkho = dongsize ? dongsize.soluong || 0 : 0;
      return {
        hasSize: coSize,
        stock: tonkho,
        bienTheObjId: null,
        mausac,
        hinhanh,
        gia,
        giagiam
      };
    }

    const tonkho = productdoc.soluong_chinh || 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: null,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const bienthe = (productdoc.bienthe || []).find((v) => String(v._id) === String(bientheId));
  if (!bienthe) return { error: 'Biáº¿n thá»ƒ khÃ´ng tá»“n táº¡i' };

  const mausac = bienthe.mausac || 'MÃ u';
  const hinhanh = normalizeImage(bienthe.hinhanh) || normalizeImage(productdoc.hinhanh);
  const gia = bienthe.gia || productdoc.gia || 0;
  const giamgia = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : productdoc.phantramgiamgia || 0;
  const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

  if (coSize) {
    const sizes = Array.isArray(bienthe.sizes) ? bienthe.sizes : [];
    const dongsize = sizes.find((s) => s.size === kichco);
    const tonkho = dongsize ? dongsize.soluong || 0 : 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: bienthe._id,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const tonkho = bienthe.soluong || 0;
  return {
    hasSize: coSize,
    stock: tonkho,
    bienTheObjId: bienthe._id,
    mausac,
    hinhanh,
    gia,
    giagiam
  };
}

module.exports = {
  laLoaiKhongSize,
  tinhTongTon,
  layBienTheVaTon
};

