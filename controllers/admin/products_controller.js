const Product = require('../../models/product_model');
const filterStatusHelper = require('../../helpers/filterStatus');
const searchHelper = require('../../helpers/search');
const paginationHelper = require('../../helpers/pagination');
const productHelper = require('../../helpers/product');
const productService = require('../../services/product.service');

// ===== WHITELIST CHỐNG NoSQL Injection =====
const ALLOWED_STATUS = ['dangban', 'ngungban', 'dahet'];
const ALLOWED_GENDER = ['nam', 'nu', 'unisex'];
const ALLOWED_TYPE = ['ao', 'quan', 'tui', 'phukien'];
const ALLOWED_SORT = ['gia', 'ngaytao', 'tensanpham'];

// [GET] /admin/products
const index = async (req, res) => {
  try {
    // Filter Status (UI)
    const filterStatus = filterStatusHelper(req.query);

    // Search
    const objectSearch = searchHelper(req.query, { keywordKey: 'keyword' });

    // Pagination
    let objectPagination = {
      currentPage: 1,
      limit: 10
    };

    // Build base query
    const find = { daxoa: { $ne: true } };

    // ===== TRẠNG THÁI =====
    if (req.query.trangthai === 'dahet') {
      find.soluongton = { $lte: 0 };
    } else if (ALLOWED_STATUS.includes(req.query.trangthai)) {
      find.trangthai = req.query.trangthai;
    }

    // ===== TÌM KIẾM =====
    if (objectSearch.keyword) {
      find.tensanpham = objectSearch.regex;
    }

    // ===== LỌC GIÁ SAU GIẢM =====
    if (req.query.priceMin || req.query.priceMax) {
      const priceMin = parseInt(req.query.priceMin) || 0;
      const priceMax = parseInt(req.query.priceMax) || Number.MAX_SAFE_INTEGER;

      find.$expr = {
        $and: [
          {
            $gte: [
              {
                $multiply: [
                  '$gia',
                  {
                    $divide: [
                      { $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] },
                      100
                    ]
                  }
                ]
              },
              priceMin
            ]
          },
          {
            $lte: [
              {
                $multiply: [
                  '$gia',
                  {
                    $divide: [
                      { $subtract: [100, { $ifNull: ['$phantramgiamgia', 0] }] },
                      100
                    ]
                  }
                ]
              },
              priceMax
            ]
          }
        ]
      };
    }

    // ===== LOẠI SẢN PHẨM =====
    if (ALLOWED_TYPE.includes(req.query.loaisanpham)) {
      find.loaisanpham = req.query.loaisanpham;
    }

    // ===== GIỚI TÍNH =====
    if (ALLOWED_GENDER.includes(req.query.gioitinh)) {
      find.gioitinh = req.query.gioitinh;
    }

    // ===== NGÀY TẠO =====
    if (req.query.dateFrom || req.query.dateTo) {
      find.ngaytao = {};
      if (req.query.dateFrom) {
        find.ngaytao.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const endDate = new Date(req.query.dateTo);
        endDate.setHours(23, 59, 59, 999);
        find.ngaytao.$lte = endDate;
      }
    }

    // ===== SORT AN TOÀN =====
    let sort = { ngaytao: -1 };
    if (req.query.sort) {
      const [key, value] = req.query.sort.split('-');
      if (ALLOWED_SORT.includes(key)) {
        sort = { [key]: value === 'asc' ? 1 : -1 };
      }
    }

    // ===== COUNT & PAGINATION =====
    const totalProducts = await Product.countDocuments(find);
    objectPagination = paginationHelper(objectPagination, req.query, totalProducts);

    // ===== QUERY DATA =====
    const products = await Product.find(find)
      .sort(sort)
      .skip(objectPagination.skip)
      .limit(objectPagination.limit)
      .lean();

    // ===== GIỮ FILTER TRÊN URL =====
    let filterString = '';
    if (req.query.sort) filterString += `&sort=${req.query.sort}`;
    if (req.query.loaisanpham) filterString += `&loaisanpham=${req.query.loaisanpham}`;
    if (req.query.gioitinh) filterString += `&gioitinh=${req.query.gioitinh}`;
    if (req.query.priceMin) filterString += `&priceMin=${req.query.priceMin}`;
    if (req.query.priceMax) filterString += `&priceMax=${req.query.priceMax}`;
    if (req.query.dateFrom) filterString += `&dateFrom=${req.query.dateFrom}`;
    if (req.query.dateTo) filterString += `&dateTo=${req.query.dateTo}`;

    res.render('admin/pages/products/index.pug', {
      titlePage: 'Danh sách sản phẩm',
      products: products.map(productHelper),
      filterStatus,
      keyword: objectSearch.keyword,
      pagination: objectPagination,

      currentSort: req.query.sort,
      currentLoai: req.query.loaisanpham,
      currentGioiTinh: req.query.gioitinh,
      priceMin: req.query.priceMin,
      priceMax: req.query.priceMax,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      filterString
    });
  } catch (error) {
    console.error('Load products error:', error);
    res.status(500).send('Không tải được danh sách sản phẩm');
  }
};

// ================= CRUD KHÔNG CẦN SỬA =================

const create = async (req, res) => {
  res.render('admin/pages/products/create.pug', { titlePage: 'Thêm sản phẩm mới' });
};

const createPost = async (req, res) => {
  try {
    const productData = productService.prepareProductData(req.body, req.files);
    productData.ngaytao = new Date();
    productData.daxoa = false;

    await new Product(productData).save();
    req.flash('success', 'Thêm sản phẩm thành công!');
    res.redirect(req.app.locals.admin + '/products');
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('back');
  }
};

const edit = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).send('Không tìm thấy sản phẩm');
  res.render('admin/pages/products/edit.pug', {
    titlePage: 'Chỉnh sửa sản phẩm',
    product: productHelper(product)
  });
};

const editPost = async (req, res) => {
  try {
    const productData = productService.prepareProductData(req.body, req.files);
    await Product.findByIdAndUpdate(req.params.id, productData);
    req.flash('success', 'Cập nhật thành công!');
    res.redirect(req.app.locals.admin + '/products');
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('back');
  }
};

const deleteProduct = async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { daxoa: true });
  req.flash('success', 'Xóa sản phẩm thành công!');
  res.redirect(req.app.locals.admin + '/products');
};

const changeStatus = async (req, res) => {
  const status = req.body.status || req.body.trangthai;
  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ success: false });
  }
  await Product.findByIdAndUpdate(req.params.id, { trangthai: status });
  res.json({ success: true });
};

module.exports = {
  index,
  create,
  createPost,
  edit,
  editPost,
  delete: deleteProduct,
  changeStatus
};
