const mongoose = require("mongoose");

function taoSlug(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = new mongoose.Schema({
  name: { type: String, trim: true, alias: 'ten' },
  tendanhmuc: { type: String, trim: true },
  slug: { type: String, trim: true, alias: 'duongdan' },
  mota: { type: String, trim: true },
  hinhanh: { type: String, trim: true },

  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    alias: 'danhmuccha_id',
    ref: "Danhmuc",
    default: null
  },
  danhmuccha: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Danhmuc",
    default: null
  },

  level: { type: Number, default: 1, min: 1, alias: 'capdo' },
  ancestors: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Danhmuc" }],
    alias: 'to_tien'
  },
  path: { type: String, trim: true, default: "", alias: 'duongdan_daydu' },
  order: { type: Number, default: 0, alias: 'thutu_hienthi' },
  thutu: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true, alias: 'kichhoat' },
  trangthai: { type: String, default: "active" },
  type: {
    type: String,
    alias: 'loai',
    enum: ["gender", "category", "brand", "occasion", "age_group"],
    default: "category"
  },

  daxoa: {
    type: Boolean,
    default: false
  },
  ngaytao: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

categorySchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      slug: { $exists: true, $type: "string", $nin: [""] },
      daxoa: { $ne: true }
    }
  }
);
categorySchema.index({ parent_id: 1, order: 1 });
categorySchema.index({ danhmuccha: 1, thutu: 1 });
categorySchema.index({ ancestors: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ type: 1, isActive: 1 });

categorySchema.pre("validate", async function syncCategoryFields() {
  if (!this.name && this.tendanhmuc) this.name = this.tendanhmuc;
  if (!this.tendanhmuc && this.name) this.tendanhmuc = this.name;

  if ((!this.slug || !String(this.slug).trim()) && (this.name || this.tendanhmuc)) {
    this.slug = taoSlug(this.name || this.tendanhmuc);
  } else if (this.slug) {
    this.slug = taoSlug(this.slug);
  }

  if (!this.parent_id && this.danhmuccha) this.parent_id = this.danhmuccha;
  if (!this.danhmuccha && this.parent_id) this.danhmuccha = this.parent_id;

  if (this.order == null) this.order = Number(this.thutu || 0);
  if (this.thutu == null) this.thutu = Number(this.order || 0);

  if (this.isActive == null) this.isActive = String(this.trangthai || "active") === "active";
  if (!this.trangthai) this.trangthai = this.isActive ? "active" : "inactive";
  this.trangthai = this.isActive ? "active" : "inactive";

  if (!this.parent_id) {
    this.level = 1;
    this.ancestors = [];
    this.path = this.slug ? `/${this.slug}` : "";
    return;
  }

  if (this._id && String(this.parent_id) === String(this._id)) {
    throw new Error("Danh mục cha không hợp lệ");
  }

  const ParentModel = this.constructor;
  const parent = await ParentModel.findById(this.parent_id).select("level path ancestors").lean();
  if (!parent) throw new Error("Danh mục cha không tồn tại");

  const parentAncestors = Array.isArray(parent.ancestors) ? parent.ancestors.map((id) => String(id)) : [];
  if (this._id && parentAncestors.includes(String(this._id))) {
    throw new Error("Không thể chọn danh mục con làm danh mục cha");
  }

  this.level = Number(parent.level || 1) + 1;
  this.ancestors = [...(parent.ancestors || []), parent._id];
  const parentPath = String(parent.path || "").trim();
  this.path = `${parentPath || ""}/${this.slug}`.replace(/\/+/g, "/");
});

const Danhmuc = mongoose.model("Danhmuc", categorySchema, "categories");
module.exports = Danhmuc;
