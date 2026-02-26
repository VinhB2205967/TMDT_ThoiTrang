require('dotenv').config();
const mongoose = require('mongoose');
const database = require('../config/database');
const Banner = require('../models/banner_model');
const HomeSection = require('../models/home_section_model');
const Setting = require('../models/setting_model');
const FlashSale = require('../models/flash_sale_model');
const Lookbook = require('../models/lookbook_model');
const Brand = require('../models/brand_model');
const BlogPost = require('../models/blog_model');
const Sanpham = require('../models/product_model');

async function seedSections() {
  const defaults = [
    { key: 'banner_slider', tieuDe: 'Banner Slider', hienthi: true, thuTu: 1, config: {} },
    { key: 'new_products', tieuDe: 'San pham moi', hienthi: true, thuTu: 2, config: { limit: 8 } },
    { key: 'best_sellers', tieuDe: 'Ban chay nhat', hienthi: true, thuTu: 3, config: { limit: 8 } },
    { key: 'flash_sale', tieuDe: 'Flash Sale', hienthi: true, thuTu: 4, config: {} },
    { key: 'lookbook', tieuDe: 'Lookbook', hienthi: true, thuTu: 5, config: {} },
    { key: 'brands', tieuDe: 'Thuong hieu noi bat', hienthi: true, thuTu: 6, config: {} },
    { key: 'blog', tieuDe: 'Blog thoi trang', hienthi: true, thuTu: 7, config: { limit: 6 } }
  ];

  for (const item of defaults) {
    await HomeSection.updateOne({ key: item.key }, { $setOnInsert: item }, { upsert: true });
  }
}

async function seedSettings() {
  const items = [
    { key: 'home_new_limit', value: 8 },
    { key: 'home_best_limit', value: 8 },
    { key: 'home_blog_limit', value: 6 }
  ];
  for (const item of items) {
    await Setting.updateOne({ key: item.key }, { $setOnInsert: item }, { upsert: true });
  }
}

async function seedBanners() {
  const count = await Banner.countDocuments();
  if (count) return;

  await Banner.insertMany([
    {
      tieude: 'BST Xuan 2026',
      mota: 'Phong cach tre trung, nang dong',
      hinhanh: '/images/banner1.jpg',
      nut_text: 'Kham pha',
      nut_link: '/products',
      loai: 'collection',
      hienthi: true,
      thuTu: 1
    },
    {
      tieude: 'Sale dau mua',
      mota: 'Giam den 50% cac san pham hot',
      hinhanh: '/images/banner2.jpg',
      nut_text: 'Mua ngay',
      nut_link: '/products',
      loai: 'sale',
      hienthi: true,
      thuTu: 2
    }
  ]);
}

async function seedBrands() {
  const count = await Brand.countDocuments();
  if (count) return;
  await Brand.insertMany([
    { ten: 'UrbanEdge', logo: '/images/logo/brand-1.png', noiBat: true, thuTu: 1 },
    { ten: 'NovaWear', logo: '/images/logo/brand-2.png', noiBat: true, thuTu: 2 },
    { ten: 'Bloom', logo: '/images/logo/brand-3.png', noiBat: true, thuTu: 3 }
  ]);
}

async function seedBlog() {
  const count = await BlogPost.countDocuments();
  if (count) return;
  await BlogPost.insertMany([
    {
      tieude: 'Mix do cong so toi gian',
      slug: 'mix-do-cong-so-toi-gian',
      tomtat: 'Goi y phoi do thanh lich cho tuan moi.',
      noidung: '<p>Noi dung mau.</p>',
      hinhanh: '/images/blog-1.jpg',
      xuatban: true,
      ngayxuatban: new Date()
    },
    {
      tieude: 'Lookbook mua he 2026',
      slug: 'lookbook-mua-he-2026',
      tomtat: 'Chat lieu nhe, mau sac noi bat.',
      noidung: '<p>Noi dung mau.</p>',
      hinhanh: '/images/blog-2.jpg',
      xuatban: true,
      ngayxuatban: new Date()
    }
  ]);
}

async function seedLookbook() {
  const count = await Lookbook.countDocuments();
  if (count) return;

  const products = await Sanpham.find({ daxoa: false }).limit(6).lean();
  const ids = products.map((p) => p._id);

  await Lookbook.create({
    tenmua: 'Summer 2026',
    hinhanh: '/images/lookbook-1.jpg',
    mota: 'Nhanh, nhe, nang dong',
    hienthi: true,
    thuTu: 1,
    sanpham_ids: ids
  });
}

async function seedFlashSale() {
  const count = await FlashSale.countDocuments();
  if (count) return;

  const products = await Sanpham.find({ daxoa: false }).limit(4).lean();
  if (!products.length) return;

  const now = new Date();
  const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  await FlashSale.create({
    ten: 'Flash Sale 4h',
    batdau: now,
    ketthuc: end,
    hienthi: true,
    phantramgiamgia: 30,
    sanpham: products.map((p) => ({ sanpham_id: p._id }))
  });
}

async function run() {
  await database.connect();
  await seedSections();
  await seedSettings();
  await seedBanners();
  await seedBrands();
  await seedBlog();
  await seedLookbook();
  await seedFlashSale();
  await mongoose.connection.close();
  console.log('Seed home data done.');
}

run().catch((err) => {
  console.error(err);
  mongoose.connection.close();
});
