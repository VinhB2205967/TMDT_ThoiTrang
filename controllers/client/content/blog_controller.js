const BlogPost = require('../../../models/blog_model');

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports.danhSach = async (req, res) => {
  const posts = await BlogPost.find({ xuatban: true }).sort({ ngayxuatban: -1, ngaytao: -1 }).lean();
  res.render('client/pages/blog/index.pug', {
    titlePage: 'Blog thoi trang',
    posts
  });
};

module.exports.chiTiet = async (req, res) => {
  const slug = req.params.slug;
  const post = await BlogPost.findOne({ slug, xuatban: true }).lean();
  if (!post) {
    return res.status(404).render('client/pages/errors/404.pug', {
      titlePage: '404 - Khong tim thay'
    });
  }

  res.render('client/pages/blog/detail.pug', {
    titlePage: post.tieude,
    post
  });
};

module.exports.taoSlug = slugify;
