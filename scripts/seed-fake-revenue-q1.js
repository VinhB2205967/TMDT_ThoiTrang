require('dotenv').config();
const mongoose = require('mongoose');

const database = require('../config/database');
const Donhang = require('../models/order_model');
const Chitietdonhang = require('../models/order_item_model');
const Thanhtoan = require('../models/pay_model');
const Nguoidung = require('../models/user_model');
const Sanpham = require('../models/product_model');

const SEED_PREFIX = 'SEEDREVQ1';
const MONTHS = [1, 2, 3];
const COMPLETED_STATUS = 'dagiao';
const PAYMENT_METHODS = ['momo', 'cod'];

function parseArg(name, fallback) {
  const matched = process.argv.find((arg) => String(arg || '').startsWith(`${name}=`));
  if (!matched) return fallback;
  const value = Number(String(matched).split('=')[1]);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[randInt(0, arr.length - 1)];
}

function buildSeedOrderCode(year, month, index) {
  return `${SEED_PREFIX}${year}${String(month).padStart(2, '0')}${String(index).padStart(4, '0')}`;
}

function randomDateInMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = randInt(1, lastDay);
  const hour = randInt(8, 21);
  const minute = randInt(0, 59);
  const second = randInt(0, 59);
  return new Date(year, month - 1, day, hour, minute, second);
}

async function ensureSeedUser() {
  const email = 'seed.revenue.q1@example.com';
  let user = await Nguoidung.findOne({ email }).select('_id').lean();
  if (user) return user._id;

  const created = await Nguoidung.create({
    hoten: 'Khach Hang Seed Q1',
    email,
    sodienthoai: '0900000000',
    diachi: 'Ho Chi Minh',
    daxoa: false,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });
  return created._id;
}

async function ensureSeedProducts() {
  let products = await Sanpham.find({ daxoa: { $ne: true } })
    .select('_id tensanpham gia hinhanh loaisanpham')
    .limit(24)
    .lean();

  if (products.length >= 3) return products;

  const fallbackDocs = [];
  for (let i = 1; i <= 6; i += 1) {
    fallbackDocs.push({
      tensanpham: `San pham seed doanh thu ${i}`,
      mota: 'Du lieu seed doanh thu Q1',
      gia: 100000 + i * 50000,
      phantramgiamgia: 0,
      loaisanpham: i % 2 === 0 ? 'ao' : 'quan',
      hinhanh: '/images/no-image.png',
      trangthai: 'active',
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });
  }

  await Sanpham.insertMany(fallbackDocs);

  products = await Sanpham.find({ daxoa: { $ne: true } })
    .select('_id tensanpham gia hinhanh loaisanpham')
    .limit(24)
    .lean();

  return products;
}

async function cleanupOldSeedData(year) {
  const regex = new RegExp(`^${SEED_PREFIX}${year}`);
  const oldOrders = await Donhang.find({ madonhang: regex }).select('_id').lean();
  if (!oldOrders.length) return { orders: 0, items: 0, pays: 0 };

  const orderIds = oldOrders.map((o) => o._id);
  const [itemsRes, paysRes, ordersRes] = await Promise.all([
    Chitietdonhang.deleteMany({ donhang_id: { $in: orderIds } }),
    Thanhtoan.deleteMany({ donhang_id: { $in: orderIds } }),
    Donhang.deleteMany({ _id: { $in: orderIds } })
  ]);

  return {
    orders: Number(ordersRes.deletedCount || 0),
    items: Number(itemsRes.deletedCount || 0),
    pays: Number(paysRes.deletedCount || 0)
  };
}

async function seedRevenueQ1() {
  const now = new Date();
  const year = Math.max(2000, Math.min(now.getFullYear() + 1, parseArg('--year', now.getFullYear())));
  const ordersPerMonth = Math.max(5, Math.min(300, parseArg('--ordersPerMonth', 40)));
  const shouldReset = process.argv.includes('--reset');

  await database.connect();

  try {
    if (shouldReset) {
      const removed = await cleanupOldSeedData(year);
      console.log(`[seed-fake-revenue-q1] removed old seeds -> orders=${removed.orders}, items=${removed.items}, pays=${removed.pays}`);
    }

    const userId = await ensureSeedUser();
    const products = await ensureSeedProducts();
    if (!products.length) {
      throw new Error('Khong tim thay hoac tao duoc san pham de seed order items.');
    }

    let totalOrders = 0;
    let totalItems = 0;
    let totalRevenue = 0;

    for (const month of MONTHS) {
      let monthRevenue = 0;

      for (let i = 1; i <= ordersPerMonth; i += 1) {
        const createdAt = randomDateInMonth(year, month);
        const status = COMPLETED_STATUS;
        const shippingFee = randInt(15000, 40000);
        const itemCount = randInt(1, 4);
        const orderCode = buildSeedOrderCode(year, month, i);

        const order = await Donhang.create({
          madonhang: orderCode,
          nguoidung_id: userId,
          tennguoinhan: 'Khach Hang Seed Q1',
          sodienthoai: '0900000000',
          email: 'seed.revenue.q1@example.com',
          diachigiao: '123 Duong Seed, Quan 1',
          tinh: 'TP Ho Chi Minh',
          quan: 'Quan 1',
          phuong: 'Ben Nghe',
          phuongthucthanhtoan: pick(PAYMENT_METHODS) || 'cod',
          dathanhtoan: true,
          ngaythanhtoan: createdAt,
          phuongthucvanchuyen: 'standard',
          phivanchuyen: shippingFee,
          tamtinh: 0,
          giamgia: 0,
          tongtien: 0,
          trangthai: status,
          daxoa: false,
          ngaytao: createdAt,
          ngaycapnhat: createdAt
        });

        let subtotal = 0;
        const itemDocs = [];

        for (let n = 0; n < itemCount; n += 1) {
          const product = pick(products);
          if (!product) continue;

          const basePrice = Math.max(50000, Number(product.gia || 120000));
          const salePrice = Math.round(basePrice * (0.8 + Math.random() * 0.2));
          const qty = randInt(1, 3);
          const lineTotal = salePrice * qty;
          const costPerUnit = Math.round(basePrice * (0.55 + Math.random() * 0.15));
          subtotal += lineTotal;

          itemDocs.push({
            donhang_id: order._id,
            sanpham_id: product._id,
            bienthe_id: null,
            tensanpham: product.tensanpham || 'San pham',
            hinhanh: product.hinhanh || '/images/no-image.png',
            mausac: pick(['Den', 'Trang', 'Xanh', 'Do']) || 'Den',
            kichco: pick(['S', 'M', 'L', 'XL']) || 'M',
            giagoc: basePrice,
            giaban: salePrice,
            soluong: qty,
            thanhtien: lineTotal,
            fifoAllocations: [
              {
                lotId: null,
                soLuong: qty,
                giaNhap: costPerUnit,
                giaBanDeXuat: salePrice
              }
            ],
            trangthai: 'choxuly',
            danhgia: false,
            ngaytao: createdAt
          });
        }

        if (!itemDocs.length) {
          await Donhang.deleteOne({ _id: order._id });
          continue;
        }

        await Chitietdonhang.insertMany(itemDocs);

        const discount = subtotal >= 300000 ? randInt(5000, 30000) : 0;
        const finalTotal = Math.max(0, subtotal - discount + shippingFee);

        await Donhang.updateOne(
          { _id: order._id },
          {
            $set: {
              tamtinh: subtotal,
              giamgia: discount,
              tongtien: finalTotal,
              ngaycapnhat: createdAt
            }
          }
        );

        await Thanhtoan.create({
          donhang_id: order._id,
          nguoidung_id: userId,
          magiaodich: `PAY-${orderCode}`,
          phuongthuc: order.phuongthucthanhtoan,
          sotien: finalTotal,
          trangthai: 'thanhcong',
          ghichu: `Du lieu seed doanh thu thang ${month}/${year}`,
          ngaytao: createdAt,
          ngaycapnhat: createdAt
        });

        monthRevenue += finalTotal;
        totalRevenue += finalTotal;
        totalOrders += 1;
        totalItems += itemDocs.length;
      }

      console.log(`[seed-fake-revenue-q1] ${year}-${String(month).padStart(2, '0')} -> doanhthu=${monthRevenue.toLocaleString('vi-VN')} VND`);
    }

    console.log(`[seed-fake-revenue-q1] done -> orders=${totalOrders}, items=${totalItems}, revenue=${totalRevenue.toLocaleString('vi-VN')} VND`);
  } finally {
    await mongoose.disconnect();
  }
}

seedRevenueQ1().catch((err) => {
  console.error('[seed-fake-revenue-q1] failed:', err);
  mongoose.disconnect().finally(() => {
    process.exit(1);
  });
});
