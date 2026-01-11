const Sanpham = require("../../models/product_model");

// [GET] /favorites
module.exports.index = async (req, res) => {
  try {
    // Lấy danh sách ID từ cookie hoặc session (tạm thời dùng cookie)
    let favoriteIds = [];
    if (req.cookies && req.cookies.favorites) {
      try {
        favoriteIds = JSON.parse(req.cookies.favorites);
      } catch (e) {
        favoriteIds = [];
      }
    }

    let products = [];
    if (favoriteIds.length > 0) {
      products = await Sanpham.find({
        _id: { $in: favoriteIds },
        daxoa: { $ne: true },
        trangthai: "dangban"
      }).lean();

      // Xử lý giá hiển thị
      products = products.map(product => {
        let gia = product.gia || 0;
        let giamoi = gia;
        let hinhanh = product.hinhanh || '/images/shopping.png';

        if (product.bienthe && product.bienthe.length > 0) {
          const firstVariant = product.bienthe[0];
          gia = firstVariant.gia || product.gia || 0;
          if (firstVariant.phantramgiamgia) {
            giamoi = gia * (1 - firstVariant.phantramgiamgia / 100);
          } else if (product.phantramgiamgia) {
            giamoi = gia * (1 - product.phantramgiamgia / 100);
          }
          hinhanh = firstVariant.hinhanh || product.hinhanh || '/images/shopping.png';
        } else if (product.phantramgiamgia) {
          giamoi = gia * (1 - product.phantramgiamgia / 100);
        }

        return {
          ...product,
          giaText: gia.toLocaleString('vi-VN') + '₫',
          giamoiText: giamoi < gia ? giamoi.toLocaleString('vi-VN') + '₫' : null,
          displayImage: hinhanh
        };
      });
    }

    res.render("client/pages/favorites/index", {
      pageTitle: "Sản phẩm yêu thích",
      products: products
    });
  } catch (error) {
    console.error("Favorites error:", error);
    res.render("client/pages/favorites/index", {
      pageTitle: "Sản phẩm yêu thích",
      products: []
    });
  }
};

// [POST] /favorites/add/:id
module.exports.add = async (req, res) => {
  try {
    const productId = req.params.id;
    let favoriteIds = [];
    
    if (req.cookies && req.cookies.favorites) {
      try {
        favoriteIds = JSON.parse(req.cookies.favorites);
      } catch (e) {
        favoriteIds = [];
      }
    }

    if (!favoriteIds.includes(productId)) {
      favoriteIds.push(productId);
    }

    res.cookie('favorites', JSON.stringify(favoriteIds), {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
      httpOnly: true
    });

    res.json({ success: true, message: "Đã thêm vào yêu thích" });
  } catch (error) {
    res.json({ success: false, message: "Có lỗi xảy ra" });
  }
};

// [POST] /favorites/remove/:id
module.exports.remove = async (req, res) => {
  try {
    const productId = req.params.id;
    let favoriteIds = [];
    
    if (req.cookies && req.cookies.favorites) {
      try {
        favoriteIds = JSON.parse(req.cookies.favorites);
      } catch (e) {
        favoriteIds = [];
      }
    }

    favoriteIds = favoriteIds.filter(id => id !== productId);

    res.cookie('favorites', JSON.stringify(favoriteIds), {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true
    });

    res.json({ success: true, message: "Đã xóa khỏi yêu thích" });
  } catch (error) {
    res.json({ success: false, message: "Có lỗi xảy ra" });
  }
};
