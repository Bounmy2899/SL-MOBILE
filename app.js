// =========================================================================
// ໂພນມະນີ — app.js (ເວີຊັນ Supabase)
// -------------------------------------------------------------------------
// ໄຟລ໌ນີ້ຄືສະໝອງຂອງເວັບ. ມັນຖືກແບ່ງເປັນ 5 ສ່ວນ:
//   1) ຕັ້ງຄ່າ Supabase (client / auth / realtime)
//   2) "ແຄສທ້ອງຖິ່ນ" (data) — ສຳເນົາຂໍ້ມູນຫຼ້າສຸດຈາກຖານຂໍ້ມູນ ເພື່ອໃຫ້ໂຄ້ດ
//      ສ່ວນສະແດງຜົນ (render*) ຂຽນງ່າຍຄືເກົ່າ
//   3) Helper functions ນ້ອຍໆ (money, escapeHtml, ...)
//   4) ຟັງຊັນສະແດງຜົນ (render...) — ແປງ data ເປັນ HTML
//   5) ຟັງຊັນຂຽນຂໍ້ມູນ (add/update/delete) — ຄຸຍກັບ Supabase (database + storage + auth)
//   6) ການຜູກ Event (ปุ่ม, ฟอร์ม) ຢູ່ລຸ່ມສຸດ
// =========================================================================

// ---------- 1) Supabase setup ----------
// ໃຊ້ supabase-js ຈາກໄຟລ໌ supabase-js.js ໃນໂຟນເດີນີ້ (ບໍ່ຕ້ອງໂຫລດຈາກອິນເຕີເນັດ)
import { supabaseUrl, supabaseAnonKey } from "./supabase-config.js";

const { createClient } = window.supabase;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

let managerUser = null;      // ຜູ້ໃຊ້ທີ່ login ຢູ່ (null = ບໍ່ໄດ້ login)
let authReadyOnce = false;   // ໃຊ້ຄັ້ງດຽວຕອນເປີດເວັບ ເພື່ອເປີດໜ້າຜູ້ຈັດການອັດຕະໂນມັດຖ້າ login ຄ້າງໄວ້

// ---------- 2) Local cache (ອັບເດດອັດຕະໂນມັດໂດຍ realtime subscriptions ຂ້າງລຸ່ມ) ----------
const defaultProfile = { shopName: "ໂພນມະນີ", tagline: "ອາໄຫຼ່ & ເຄສໂທລະສັບ", ownerName: "", phone: "", logo: "" };
const defaultPayment = { accountName: "", accountNumber: "", qrImage: "" };
let couriers = [];      // ລາຍຊື່ບໍລິສັດຂົນສົ່ງ ທີ່ຜູ້ຈັດການຕັ້ງໄວ້
let colorOptions = [];  // ຊຸດສີຂອງຮ້ານ [{name, hex}]
// ສູດຄິດລາຄາຂອງຮ້ານ — ຕັ້ງເທື່ອດຽວ ໃຊ້ທຸກເທື່ອທີ່ເພີ່ມສິນຄ້າ
const defaultPriceRule = { yuanRate: 0, shipCost: 0, profitMode: "percent", profitValue: 20 };
let priceRule = { ...defaultPriceRule };
let pickedColors = new Set();   // ສີທີ່ເລືອກໄວ້ໃນຟອມສິນຄ້າ (ກໍລະນີຮູບດຽວ)

let data = {
  profile: { ...defaultProfile },
  payment: { ...defaultPayment },
  categories: [],
  products: [],
  orders: [],
  expenses: [],
  ledger: [],      // ສະໝຸດບັນຊີເງິນ
  assets: [],      // ຊັບສິນຄົງທີ່
  employees: [],   // ພະນັກງານ
  debts: []        // ໜີ້ສິນ
};

let cart = readJson("phonemani-cart", []);
let navPath = [];   // ເສັ້ນທາງໝວດທີ່ກຳລັງເບິ່ງ (ເລິກເທົ່າໃດກໍໄດ້)
let navLeaf = null; // ລຸ້ນ (ໃບສຸດທ້າຍ) ທີ່ເລືອກກັ່ນຕອງຢູ່
let activeOrderFilter = "all";
let restockFilter = "all";
let manageCategoryFilter = "all";
let editingProductId = null;
let selectedModels = new Set();   // ລຸ້ນທີ່ຕິກໄວ້ໃນຟອມສິນຄ້າ
let previewUrls = [];        // ຮູບຕົວຢ່າງໃນຟອມສິນຄ້າ (ຕ້ອງ revoke ຄືນ)
let firstLoadDone = false;   // ຍັງບໍ່ທັນໄດ້ຂໍ້ມູນຈາກຖານຂໍ້ມູນເທື່ອ

// ---------- 3) Helpers ----------
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const money = (value) => `${Number(value || 0).toLocaleString("en-US")} ₭`;
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveCart() { localStorage.setItem("phonemani-cart", JSON.stringify(cart)); }
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const placeholder = '<div class="placeholder-art" aria-hidden="true"></div>';
const imageMarkup = (product, className = "") => {
  const first = (Array.isArray(product?.images) && product.images.filter(Boolean)[0]) || product?.image;
  return first ? `<img class="${className}" src="${escapeHtml(first)}" alt="${escapeHtml(product.name)}" loading="lazy">` : placeholder;
};
const catById = (id) => data.categories.find(category => String(category.id) === String(id));
const categoryName = (id) => catById(id)?.name || "ບໍ່ມີໝວດ";
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), "lo");

// --- ຮຽງຊື່ລຸ້ນແບບ "ຄົນອ່ານ" (natural sort) ---------------------------------
// ຕັດຊື່ອອກເປັນທ່ອນ: ຕົວອັກສອນ ກັບ ຕົວເລກ ແລ້ວທຽບເທື່ອລະທ່ອນ
//   ຕົວອັກສອນທຽບແບບ ກ→ຮ / a→z   ·   ຕົວເລກທຽບຄ່າຈິງ (7 ມາກ່ອນ 15)
// ຜົນ: Vivo X100 · X200 · X300 ຢູ່ນຳກັນ ສ່ວນ Vivo A200 ແຍກໄປອີກກຸ່ມ
//      iPhone 7 · 8 · 11 · 15 ຮຽງຕາມເລກ ບໍ່ແມ່ນ 11 · 15 · 7
const natTokens = (name) => String(name || "")
  .toLowerCase().replace(/\s+/g, " ").trim()
  .split(/(\d+)/).filter(t => t !== "")
  .map(t => /^\d+$/.test(t) ? Number(t) : t);

function naturalCompare(a, b) {
  const ta = natTokens(a), tb = natTokens(b);
  const n = Math.min(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i], y = tb[i];
    if (typeof x === "number" && typeof y === "number") { if (x !== y) return x - y; continue; }
    if (typeof x === "number") return -1;          // ເລກມາກ່ອນຕົວອັກສອນ ໃນຕຳແໜ່ງດຽວກັນ
    if (typeof y === "number") return 1;
    if (x !== y) return x.localeCompare(y, "lo");
  }
  return ta.length - tb.length;                    // ຊື່ສັ້ນກວ່າມາກ່ອນ (S24 ກ່ອນ S24 Ultra)
}
const byModelName = (a, b) => naturalCompare(a?.name, b?.name);
// ລູກໂດຍກົງຂອງໝວດໜຶ່ງ (parentId = null ຄືໝວດໃຫຍ່)
// ດັດຊະນີໝວດ — ສ້າງເທື່ອດຽວຕໍ່ການໂຫລດ ແທນການກັ່ນຕອງ+ຮຽງ 486 ແຖວທຸກຄັ້ງ
let childIndex = null, directCount = null;
function buildCategoryIndex() {
  childIndex = new Map();
  for (const c of data.categories) {
    if (!c || c.id == null) continue;
    const key = c.parentId == null ? "root" : String(c.parentId);
    if (!childIndex.has(key)) childIndex.set(key, []);
    childIndex.get(key).push(c);
  }
  // ກຸ່ມທີ່ເປັນ "ລຸ້ນ" (ມີຕົວເລກຢູ່ໃນຊື່ ເຊັ່ນ X100 · iPhone 15) = ຮຽງອັດຕະໂນມັດແບບຄົນອ່ານ
  // ກຸ່ມທີ່ເປັນ "ໝວດ/ຍີ່ຫໍ້/ຊີຣີ້" (ບໍ່ມີຕົວເລກ ເຊັ່ນ iPhone · Android · Samsung)
  //   = ຮັກສາລຳດັບທີ່ຮ້ານຕັ້ງໄວ້ເອງ ບໍ່ໃຫ້ສະຫຼັບໄປມາ
  for (const [key, arr] of childIndex) {
    const looksLikeModels = key !== "root" && arr.some(c => /\d/.test(String(c?.name || "")));
    arr.sort(looksLikeModels ? byModelName : bySort);
  }
  directCount = new Map();
  for (const pr of data.products) {
    const key = String(pr.categoryId);
    directCount.set(key, (directCount.get(key) || 0) + 1);
  }
}
function invalidateCategoryIndex() { childIndex = null; directCount = null; }
function childrenOf(parentId) {
  if (!childIndex) buildCategoryIndex();
  return childIndex.get(parentId == null ? "root" : String(parentId)) || [];
}
// ໄອດີຂອງໝວດນີ້ ແລະ ລູກຫຼານທັງໝົດ (ໃຊ້ກັ່ນຕອງສິນຄ້າ)
function descendantIds(id) {
  if (id == null) return [];
  const seen = new Set([String(id)]);                        // ກັນວົນຊ້ຳບໍ່ຮູ້ຈົບ
  const walk = (pid) => childrenOf(pid).forEach(c => {
    const key = String(c.id);
    if (seen.has(key)) return;
    seen.add(key); walk(c.id);
  });
  walk(id);
  return [...seen];
}
// ເສັ້ນທາງຈາກໝວດໃຫຍ່ລົງມາ
function categoryPath(id) {
  const path = []; const seen = new Set(); let node = catById(id);
  while (node && !seen.has(String(node.id))) {               // ກັນວົນຊ້ຳບໍ່ຮູ້ຈົບ
    seen.add(String(node.id)); path.unshift(node);
    node = node.parentId == null ? null : catById(node.parentId);
  }
  return path;
}
// ນັບສິນຄ້າໃນໝວດ (ລວມລູກຫຼານ)
// ສິນຄ້າຢູ່ໃນຂອບເຂດໝວດນີ້ບໍ່ — ນັບທັງໝວດຫຼັກ ແລະ ລຸ້ນທີ່ຕິກໄວ້
function productInScope(product, idSet) {
  if (idSet.has(String(product.categoryId))) return true;
  return productModelIds(product).some(id => idSet.has(id));
}
function productCountIn(id) {
  if (id == null) return 0;
  const ids = new Set(descendantIds(id));
  return data.products.filter(pr => productInScope(pr, ids)).length;
}
// ຮູບຂອງສິນຄ້າ (ຮອງຮັບທັງແບບເກົ່າ image ແລະ ແບບໃໝ່ images[])
function productImages(product) {
  const list = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
  if (list.length) return list;
  return product?.image ? [product.image] : [];
}
// ລຸ້ນທັງໝົດທີ່ມີໃນຮ້ານ (ໝວດຊັ້ນ 3) — ໃຊ້ໃນລາຍການຕິກ ແລະ ການວາງຈາກ Excel
function allModelCategories() {
  const out = [];
  childrenOf(null).forEach(l1 => childrenOf(l1.id).forEach(l2 =>
    childrenOf(l2.id).forEach(l3 => out.push({ ...l3, l1: l1.name, l2: l2.name, icon: l1.icon }))));
  return out;
}
function productModelIds(product) {
  return Array.isArray(product?.models) ? product.models.map(String).filter(Boolean) : [];
}
function productModelNames(product) {
  return productModelIds(product).map(id => catById(id)?.name).filter(Boolean).sort(naturalCompare);
}
// ຈັບຄູ່ຊື່ລຸ້ນແບບຢືດຢຸ່ນ (ບໍ່ສົນຕົວພິມ ຫຼື ຊ່ອງວ່າງ)
const normModel = (t) => String(t || "").toLowerCase().replace(/[\s._\-()]/g, "");

function productImageColors(product) {
  const list = Array.isArray(product?.imageColors) ? product.imageColors : [];
  return productImages(product).map((_, i) => list[i] || "");
}
function productColors(product) {
  return Array.isArray(product?.colors) ? product.colors.filter(Boolean) : [];
}
const isOnDemand = (product) => product.saleMode === "onDemand";
function isManager() { return !!managerUser; }
// ປ້າຍເລກແດງ: ເຫັນສະເພາະຕອນມີຄ່າຫຼາຍກວ່າ 0
function setBadge(selector, count) {
  const el = $(selector); if (!el) return;
  el.textContent = count;
  el.classList.toggle("on", Number(count) > 0);
}
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add("hidden"), 2800); }
function dateLabel(value) { return new Date(value).toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" }); }
function orderTotal(order) { return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0); }

// ອັບໂຫລດຮູບໜຶ່ງໃບຂຶ້ນ Supabase Storage (bucket ຊື່ "images"), ໄດ້ຄືນ URL ສຳລັບເອົາໄປໃສ່ໃນຖານຂໍ້ມູນ
// Supabase Storage ຮັບສະເພາະຊື່ໄຟລ໌ທີ່ເປັນຕົວອັກສອນອັງກິດ/ຕົວເລກ —
// ຖ້າຊື່ຮູບເປັນພາສາລາວ/ໄທ ຈະຖືກປະຕິເສດວ່າ "Invalid key".
// ຈຶ່ງສ້າງຊື່ໃໝ່ໃຫ້ປອດໄພສະເໝີ ໂດຍເກັບແຕ່ນາມສະກຸນໄຟລ໌ໄວ້.
const APP_VERSION = "25 · ບັດໝວດຮູບໃຫຍ່";
let uploadSeq = 0;
function safeFileName(file) {
  const raw = String(file?.name || "");
  const dot = raw.lastIndexOf(".");
  let ext = dot > -1 ? raw.slice(dot + 1) : "";
  ext = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  if (!ext) {
    const fromType = String(file?.type || "").split("/")[1] || "";
    ext = fromType.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${++uploadSeq}-${rand}.${ext}`;
}

// ຫຍໍ້ຮູບກ່ອນອັບ — ປະຢັດພື້ນທີ່ເກັບຫຼາຍເທົ່າ ແລະ ເວັບໂຫລດໄວຂຶ້ນ
// ຮູບຈາກມືຖືມັກໃຫຍ່ 3-5 MB · ຫຼັງຫຍໍ້ເຫຼືອປະມານ 150-300 KB
async function shrinkImage(file, maxSide = 1400, quality = 0.82) {
  if (!file || !file.type.startsWith("image/")) return file;
  if (file.size < 250 * 1024) return file;                 // ນ້ອຍຢູ່ແລ້ວ ບໍ່ຕ້ອງຫຍໍ້
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;       // ຫຍໍ້ແລ້ວບໍ່ນ້ອຍລົງ ໃຊ້ອັນເກົ່າ
    return new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (err) { console.warn("shrink failed, upload original:", err); return file; }
}

async function uploadImage(rawFile, folder) {
  if (!rawFile) return "";
  const file = await shrinkImage(rawFile);
  const path = `${folder}/${safeFileName(file)}`;
  const { error } = await supabase.storage.from("images")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) { console.error("upload failed:", path, error); throw error; }
  const { data: pub } = supabase.storage.from("images").getPublicUrl(path);
  return pub.publicUrl;
}

// ---------- 4) Render functions (ຄືເກົ່າ ບໍ່ໄດ້ແກ້ຫຍັງຫຼາຍ) ----------
// ອັບເດດຕົວເລກຈຳນວນເທິງບັດສິນຄ້າ ໂດຍບໍ່ຕ້ອງ render ໃໝ່ທັງໜ້າ
function syncCardQuantities() {
  $$("#productGrid .product-card").forEach(card => {
    const addBtn = card.querySelector("[data-add-product]"); if (!addBtn) return;
    const id = addBtn.dataset.addProduct;
    const qty = cart.find(line => String(line.productId) === String(id))?.quantity || 0;
    const value = card.querySelector(".qty-value"); if (value) value.textContent = qty;
    const minus = card.querySelector("[data-cart-change]"); if (minus) minus.disabled = qty === 0;
    const added = card.querySelector(".card-added");
    if (added) added.textContent = qty ? `ເລືອກແລ້ວ ${qty} ຊິ້ນ` : "";
    else if (qty) { const holder = card.querySelector(".card-qty"); if (holder) holder.insertAdjacentHTML("beforeend", `<span class="card-added">ເລືອກແລ້ວ ${qty} ຊິ້ນ</span>`); }
    const buy = card.querySelector("[data-buy-now]");
    if (buy) buy.textContent = qty ? `ສັ່ງເລີຍ (${qty} ຊິ້ນ)` : "ສັ່ງເລີຍ";
  });
}

const stockText = (product) => isOnDemand(product)
  ? "ສັ່ງໃຫ້ຕາມອໍເດີ"
  : (product.stock > 0 ? `ພ້ອມສົ່ງ ${product.stock} ຊິ້ນ` : "ສິນຄ້າໝົດ — ສັ່ງໄດ້ ຮ້ານຈະສັ່ງໃຫ້");

function catCard(cat) {
  const count = productCountIn(cat.id);
  const art = cat.image
    ? `<img src="${escapeHtml(cat.image)}" alt="" loading="lazy">`
    : `<span class="cat-emoji">${escapeHtml(cat.icon || "📦")}</span>`;
  const kids = childrenOf(cat.id).length;
  return `<button class="cat-card" type="button" data-cat-open="${cat.id}">
    <span class="cat-art">${art}${kids ? `<span class="cat-go">ເປີດເບິ່ງ ›</span>` : ""}</span>
    <span class="cat-body">
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <small>${count} ລາຍການ${kids ? ` · ${kids} ຮຸ່ນ` : ""}</small>
    </span>
  </button>`;
}

// ຖອຍກັບເທື່ອລະຂັ້ນ: ລຸ້ນ → ໝວດແມ່ → ... → ໜ້າຫຼັກຮ້ານ
function goBackOneLevel() {
  if (navLeaf) { navLeaf = null; return; }
  if (navPath.length) { navPath = navPath.slice(0, -1); return; }
}

// ໃຫ້ປຸ່ມກັບຫຼັງ (ຫຼື ການປັດກັບ) ຂອງໂທລະສັບ ຖອຍໝວດເທື່ອລະຂັ້ນຄືກັນ
function pushNavState() { try { history.pushState({ shopNav: true }, ""); } catch (e) {} }
window.addEventListener("popstate", () => {
  if (navLeaf || navPath.length) { goBackOneLevel(); renderCustomerShop(); pushNavState(); }
});

function renderCustomerShop() {
  if (loadErrorShown && !data.products.length) return;
  const query = $("#customerSearch").value.trim().toLowerCase();
  const grid = $("#catGrid"), chips = $("#catChips"), crumb = $("#catBreadcrumb");
  const searching = query.length > 0;

  // ---- ແຖບກັບຄືນ: ປຸ່ມໃຫຍ່ 2 ປຸ່ມ ກົດງ່າຍ ບອກຊັດວ່າຢູ່ໃສ ----
  if (navPath.length && !searching) {
    const hereId = navLeaf || navPath[navPath.length - 1];
    const here = catById(hereId);
    // ຊື່ຂັ້ນທີ່ຈະກັບໄປ ໃຫ້ຜູ້ໃຊ້ຮູ້ລ່ວງໜ້າວ່າກົດແລ້ວໄປໃສ
    let backName = "ໜ້າຫຼັກຮ້ານ";
    if (navLeaf) { const c = catById(navPath[navPath.length - 1]); if (c) backName = c.name; }
    else if (navPath.length > 1) { const c = catById(navPath[navPath.length - 2]); if (c) backName = c.name; }
    const back = $("#catBackBtn"), label = $("#catHereLabel");
    if (back) back.innerHTML = `<span class="chev" aria-hidden="true">‹</span><span class="lbl">ກັບຄືນ<small>${escapeHtml(backName)}</small></span>`;
    if (label) label.textContent = here ? here.name : "";
    crumb.classList.remove("hidden");
  } else { crumb.classList.add("hidden"); }

  grid.innerHTML = ""; grid.classList.add("hidden");
  chips.innerHTML = ""; chips.classList.add("hidden");
  let showProducts = [];

  if (searching) {
    showProducts = data.products;
  } else {
    const currentId = navPath.length ? navPath[navPath.length - 1] : null;
    const kids = childrenOf(currentId);
    // ຊັ້ນເທິງສຸດ: ສະແດງເປັນບັດສະເໝີ (ໃຫ້ເຫັນໄອຄອນ ແລະ ກົດເຂົ້າໄດ້)
    // ຊັ້ນລຶກລົງໄປ: ອັນທີ່ຍັງມີລູກ = ບັດ · ອັນທີ່ບໍ່ມີລູກ = ຊິບໃຫ້ກັ່ນຕອງ
    const atRoot = currentId == null;
    const branches = atRoot ? kids : kids.filter(k => childrenOf(k.id).length);
    const leaves   = atRoot ? [] : kids.filter(k => !childrenOf(k.id).length && productCountIn(k.id) > 0);
    const showBranches = branches.filter(k => productCountIn(k.id) > 0 || childrenOf(k.id).length);

    if (showBranches.length) {
      grid.innerHTML = (atRoot ? `<p class="cat-hint">ເລືອກໝວດສິນຄ້າທີ່ຕ້ອງການ</p>` : "")
        + showBranches.map(catCard).join("");
      grid.classList.remove("hidden");
    }
    if (leaves.length) {
      const scopeCount = currentId ? productCountIn(currentId) : data.products.length;
      chips.innerHTML = [`<button data-cat-model="all" class="${!navLeaf ? "active" : ""}">ທຸກລຸ້ນ (${scopeCount})</button>`,
        ...leaves.map(m => `<button data-cat-model="${m.id}" class="${String(navLeaf) === String(m.id) ? "active" : ""}">${escapeHtml(m.name)} (${productCountIn(m.id)})</button>`)].join("");
      chips.classList.remove("hidden");
    }

    const scope = navLeaf || currentId;
    if (scope == null) {
      // ໜ້າຫຼັກ: ໃຫ້ເລືອກໝວດກ່ອນ (ເຄສ / ຈໍ / ແບັດ ...)
      showProducts = showBranches.length
        ? data.products.filter(pr => !pr.categoryId || !catById(pr.categoryId))
        : data.products;
    } else {
      const ids = new Set(descendantIds(scope));
      showProducts = data.products.filter(pr => productInScope(pr, ids));
    }
  }

  // ---- ກັ່ນຕອງດ້ວຍຄຳຄົ້ນຫາ ----
  const products = showProducts.filter(product => {
    if (!query) return true;
    const path = categoryPath(product.categoryId).map(c => c.name).join(" ");
    const models = productModelNames(product).join(" ");
    return `${product.name} ${product.description} ${path} ${models}`.toLowerCase().includes(query);
  });

  $("#productGrid").innerHTML = products.map(product => {
    const qty = cart.filter(line => String(line.productId) === String(product.id)).reduce((n, l) => n + l.quantity, 0);
    const path = categoryPath(product.categoryId);
    const label = path.length ? path.map(c => escapeHtml(c.name)).join(" · ") : "ບໍ່ມີໝວດ";
    const imgs = productImages(product);
    const colors = productColors(product);
    const modelNames = productModelNames(product);
    return `<article class="product-card">
      <button class="product-card-media" type="button" data-open-product="${product.id}" aria-label="ເບິ່ງລາຍລະອຽດ ${escapeHtml(product.name)}">
        <div class="product-image">${imageMarkup(product)}</div>
        ${imgs.length > 1 ? `<span class="img-count">🖼 ${imgs.length}</span>` : ""}
        <span class="view-hint">ກົດເບິ່ງລາຍລະອຽດ</span>
      </button>
      <div class="product-body">
        <p class="product-category">${label}</p>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description || "ສິນຄ້າຄຸນນະພາບ ພ້ອມໃຫ້ເລືອກ")}</p>
        ${modelNames.length ? `<p class="fits-line">ໃສ່ໄດ້ <b>${modelNames.length}</b> ລຸ້ນ · ${escapeHtml(modelNames.slice(0,2).join(", "))}${modelNames.length > 2 ? " …" : ""}</p>` : ""}
        ${colors.length ? `<div class="color-dots">${colors.slice(0,6).map(c => `<span title="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join("")}${colors.length > 6 ? `<span>+${colors.length - 6}</span>` : ""}</div>` : ""}
        <div class="product-bottom"><div><strong class="product-price">${money(product.price)}</strong><span class="product-stock">${stockText(product)}</span></div></div>
        <div class="card-actions">
          <button class="buy-now" type="button" data-open-product="${product.id}">${colors.length ? "ເລືອກສີ & ສັ່ງ" : "ເບິ່ງ & ສັ່ງ"}${qty ? ` (${qty})` : ""}</button>
        </div>
      </div></article>`;
  }).join("");

  if (!firstLoadDone && !data.products.length) {
    $("#productGrid").innerHTML = Array.from({ length: 4 }, () =>
      `<article class="product-card skeleton"><div class="product-image"></div><div class="product-body"><span class="sk-line w60"></span><span class="sk-line w90"></span><span class="sk-line w40"></span></div></article>`).join("");
    $("#emptyProducts").classList.add("hidden");
    return;
  }
  const nothingAtAll = !products.length && grid.classList.contains("hidden") && chips.classList.contains("hidden");
  $("#emptyProducts").classList.toggle("hidden", !nothingAtAll);
}

// ---------- ໜ້າລາຍລະອຽດສິນຄ້າ ----------
let detailState = { productId: null, imageIndex: 0, color: "", model: "" };
let detailModelQuery = "";
let pendingTransfer = null;   // ອໍເດີທີ່ລໍໃບໂອນ

function openProductDetail(productId, keepState) {
  const product = productById(productId);
  if (!product) return;
  const imgs = productImages(product);
  const colors = productColors(product);
  const modelNames = productModelNames(product);
  const imgColors = productImageColors(product);
  if (!keepState || String(detailState.productId) !== String(productId)) {
    detailState = { productId, imageIndex: 0, color: colors.length === 1 ? colors[0] : "",
                    model: productModelNames(product).length === 1 ? productModelNames(product)[0] : "" };
    detailModelQuery = "";
  }
  const idx = Math.min(detailState.imageIndex, Math.max(0, imgs.length - 1));
  const main = imgs[idx];
  const inCart = cart.filter(l => String(l.productId) === String(product.id));
  const inCartQty = inCart.reduce((n, l) => n + l.quantity, 0);
  const path = categoryPath(product.categoryId);

  $("#productDetailBody").innerHTML = `
    <div>
      <button class="product-detail-image" type="button" data-zoom-image="${escapeHtml(main || "")}" ${main ? "" : "disabled"}>
        ${main ? `<img src="${escapeHtml(main)}" alt="${escapeHtml(product.name)}">` : placeholder}
        ${main ? `<span class="zoom-hint">🔍 ກົດເບິ່ງຮູບເຕັມ</span>` : ""}
        ${imgs.length > 1 ? `<span class="img-pager">${idx + 1} / ${imgs.length}</span>` : ""}
      </button>
      ${imgs.length > 1 ? `<div class="thumb-strip">${imgs.map((src, i) =>
        `<button type="button" class="thumb${i === idx ? " active" : ""}" data-pick-image="${i}" ${imgColors[i] ? `data-image-color="${escapeHtml(imgColors[i])}"` : ""} aria-label="ຮູບທີ ${i + 1}${imgColors[i] ? ` ສີ${imgColors[i]}` : ""}">
          <img src="${escapeHtml(src)}" alt="" loading="lazy">${imgColors[i] ? `<span class="thumb-color">${escapeHtml(imgColors[i])}</span>` : ""}</button>`).join("")}</div>` : ""}
    </div>
    <div>
      <p class="product-category">${path.length ? path.map(c => escapeHtml(c.name)).join(" · ") : "ບໍ່ມີໝວດ"}</p>
      <h2 id="productDetailName">${escapeHtml(product.name)}</h2>
      <strong class="detail-price">${money(product.price)}</strong>
      <span class="product-stock">${stockText(product)}</span>
      <p class="detail-desc">${escapeHtml(product.description || "ສິນຄ້າຄຸນນະພາບ ພ້ອມໃຫ້ເລືອກ")}</p>
      ${modelNames.length ? `<div class="color-picker" id="detailModelBox">
        <p class="picker-label">ເລືອກລຸ້ນໂທລະສັບຂອງທ່ານ ${detailState.model ? `<b>· ${escapeHtml(detailState.model)}</b>` : `<em>(ຍັງບໍ່ໄດ້ເລືອກ)</em>`}</p>
        ${modelNames.length > 12 ? `<label class="search-box detail-model-search"><span>⌕</span><input type="search" id="detailModelSearch" placeholder="ພິມຫາລຸ້ນ ເຊັ່ນ 15 Pro" value="${escapeHtml(detailModelQuery)}"></label>` : ""}
        <div class="color-options model-options-cust">${modelNames
          .filter(n => !detailModelQuery || normModel(n).includes(normModel(detailModelQuery)))
          .map(n => `<button type="button" class="color-chip${detailState.model === n ? " active" : ""}" data-pick-model="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div>
        <small class="muted">ຮ້ານມີເຄສນີ້ສຳລັບ ${modelNames.length} ລຸ້ນ</small>
      </div>` : ""}
      ${colors.length ? `<div class="color-picker" id="detailColorBox">
        <p class="picker-label">ເລືອກສີ ${detailState.color ? `<b>· ${escapeHtml(detailState.color)}</b>` : `<em>(ຍັງບໍ່ໄດ້ເລືອກ)</em>`}</p>
        <div class="color-options">${colors.map(c =>
          `<button type="button" class="color-chip${detailState.color === c ? " active" : ""}" data-pick-color="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}</div>
      </div>` : ""}
      <div class="detail-facts">
        ${path.map(c => `<div><span>${escapeHtml(c.parentId == null ? "ໝວດ" : "ຮຸ່ນ / ປະເພດ")}</span><b>${escapeHtml(c.name)}</b></div>`).join("")}
        <div><span>ສະຖານະ</span><b>${escapeHtml(stockText(product))}</b></div>
        ${inCartQty ? `<div data-in-cart><span>ໃນກະຕ່າຂອງທ່ານ</span><b>${inCartQty} ຊິ້ນ${inCart.filter(l=>l.color).length ? ` (${inCart.filter(l=>l.color).map(l=>escapeHtml(l.color)).join(", ")})` : ""}</b></div>` : ""}
      </div>
      <div class="detail-actions">
        <button class="primary-button full" type="button" data-detail-add="${product.id}">ເພີ່ມໃສ່ກະຕ່າ</button>
        <button class="secondary-button" type="button" data-detail-buy="${product.id}">ສັ່ງເລີຍ</button>
      </div>
      <button class="text-button detail-back" type="button" data-close-modal>← ເບິ່ງສິນຄ້າອື່ນ</button>
    </div>`;
  if (!keepState) openLayer("#productModal");
}

// ປ່ຽນຮູບ: ແກ້ແຕ່ src ຂອງຮູບໃຫຍ່ ແລະ ກອບຂອງຮູບຍ່ອຍ — ບໍ່ສ້າງ DOM ໃໝ່ທັງໝົດ
function updateDetailImage() {
  const product = productById(detailState.productId); if (!product) return;
  const imgs = productImages(product);
  const idx = Math.min(Math.max(0, detailState.imageIndex), Math.max(0, imgs.length - 1));
  detailState.imageIndex = idx;
  const src = imgs[idx] || "";
  const mainBtn = $("#productDetailBody .product-detail-image");
  const mainImg = mainBtn?.querySelector("img");
  if (mainImg && mainImg.getAttribute("src") !== src) mainImg.src = src;
  if (mainBtn) mainBtn.dataset.zoomImage = src;
  const pager = $("#productDetailBody .img-pager");
  if (pager) pager.textContent = `${idx + 1} / ${imgs.length}`;
  $$("#productDetailBody .thumb").forEach((t, i) => t.classList.toggle("active", i === idx));
}
// ປ່ຽນສີ: ແກ້ແຕ່ປ້າຍ ແລະ ປຸ່ມສີ
// ສຳຄັນ: ຕ້ອງຈຳກັດຂອບເຂດໃຫ້ຖືກກ່ອງຂອງມັນ ບໍ່ດັ່ງນັ້ນ
// ການເລືອກສີຈະໄປລ້າງການເລືອກລຸ້ນ (ແລະ ກັບກັນ) ເພາະໃຊ້ class ດຽວກັນ
function updateDetailColor() {
  const box = $("#detailColorBox"); if (!box) return;
  const label = box.querySelector(".picker-label");
  if (label) label.innerHTML = detailState.color
    ? `ເລືອກສີ <b>· ${escapeHtml(detailState.color)}</b>`
    : `ເລືອກສີ <em>(ຍັງບໍ່ໄດ້ເລືອກ)</em>`;
  box.querySelectorAll("[data-pick-color]").forEach(c =>
    c.classList.toggle("active", c.dataset.pickColor === detailState.color));
}
// ກົດຮູບ → ເລືອກສີໃຫ້ · ກົດສີ → ສະຫຼັບຮູບໃຫ້
function syncImageToColor() {
  const product = productById(detailState.productId); if (!product) return;
  const c = productImageColors(product)[detailState.imageIndex];
  if (c && productColors(product).includes(c)) { detailState.color = c; updateDetailColor(); }
}
function syncColorToImage() {
  const product = productById(detailState.productId); if (!product) return;
  const i = productImageColors(product).findIndex(c => c && c === detailState.color);
  if (i > -1 && i !== detailState.imageIndex) { detailState.imageIndex = i; updateDetailImage(); }
}
function updateDetailModel() {
  const box = $("#detailModelBox"); if (!box) return;
  const label = box.querySelector(".picker-label");
  if (label) label.innerHTML = detailState.model
    ? `ເລືອກລຸ້ນໂທລະສັບຂອງທ່ານ <b>· ${escapeHtml(detailState.model)}</b>`
    : `ເລືອກລຸ້ນໂທລະສັບຂອງທ່ານ <em>(ຍັງບໍ່ໄດ້ເລືອກ)</em>`;
  box.querySelectorAll("[data-pick-model]").forEach(c =>
    c.classList.toggle("active", c.dataset.pickModel === detailState.model));
}

function openImageViewer(src) {
  if (!src) return;
  $("#imageViewerImg").src = src;
  $("#imageViewer").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeImageViewer() {
  $("#imageViewer").classList.add("hidden");
  $("#imageViewerImg").src = "";
  document.body.style.overflow = "";
}

const cartKey = (productId, color, model) => `${productId}::${color || ""}::${model || ""}`;
function validCart() {
  cart = cart.filter(line => data.products.some(product => String(product.id) === String(line.productId)));
  return cart.map(line => ({ ...line, color: line.color || "", model: line.model || "", product: productById(line.productId) })).filter(line => line.product);
}
function renderCart(skipShopRender) {
  const lines = validCart(); saveCart();
  if (!skipShopRender) syncCardQuantities();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);
  $("#checkoutButton").disabled = !lines.length;
  $("#cartItems").innerHTML = lines.length ? lines.map(({ product, quantity, color, model }) => `<div class="cart-line"><div class="cart-thumb">${imageMarkup(product)}</div><div><h4>${escapeHtml(product.name)}</h4>${model ? `<p class="cart-color">ລຸ້ນ: <b>${escapeHtml(model)}</b></p>` : ""}${color ? `<p class="cart-color">ສີ: <b>${escapeHtml(color)}</b></p>` : ""}<p>${money(product.price)}</p><div class="quantity-control"><button data-cart-change="-1" data-product-id="${product.id}" data-color="${escapeHtml(color)}" data-model="${escapeHtml(model)}">−</button><span>${quantity}</span><button data-cart-change="1" data-product-id="${product.id}" data-color="${escapeHtml(color)}" data-model="${escapeHtml(model)}">+</button></div></div><button class="remove-cart" data-cart-remove="${product.id}" data-color="${escapeHtml(color)}" data-model="${escapeHtml(model)}" aria-label="ລຶບ">×</button></div>`).join("") : `<div class="cart-empty"><p>ກະຕ່າຍັງຫວ່າງ</p><small>ເລືອກສິນຄ້າເພື່ອເລີ່ມສັ່ງຊື້</small></div>`;
}
// ລູກຄ້າສັ່ງໄດ້ເຖິງແມ່ນສະຕັອກເປັນ 0 — ຮ້ານຈະໄປສັ່ງມາໃຫ້ (ອໍເດີຈະເຂົ້າ “ຕ້ອງສັ່ງສິນຄ້າ”)
function addToCart(productId, color = "", model = "") {
  const product = productById(productId);
  if (!product) return false;
  const models = productModelNames(product);
  const colors = productColors(product);
  if (models.length && !model) { toast("ກະລຸນາເລືອກລຸ້ນໂທລະສັບກ່ອນ"); return false; }
  if (colors.length && !color) { toast("ກະລຸນາເລືອກສີກ່ອນ"); return false; }
  const key = cartKey(productId, color, model);
  const inCart = cart.find(line => cartKey(line.productId, line.color, line.model) === key);
  if (inCart) inCart.quantity += 1; else cart.push({ productId, color, model, quantity: 1 });
  saveCart(); renderCart();
  const bits = [model, color && `ສີ${color}`].filter(Boolean).join(" · ");
  toast(product.stock > 0 ? `ເພີ່ມໃສ່ກະຕ່າແລ້ວ${bits ? ` (${bits})` : ""}` : `ເພີ່ມແລ້ວ${bits ? ` (${bits})` : ""} · ຮ້ານຈະສັ່ງມາໃຫ້`);
  return true;
}
function changeCart(productId, amount, color = "", model = "") {
  const key = cartKey(productId, color, model);
  const line = cart.find(item => cartKey(item.productId, item.color, item.model) === key);
  if (!line) return;
  line.quantity += amount;
  if (line.quantity <= 0) cart = cart.filter(item => cartKey(item.productId, item.color, item.model) !== key);
  saveCart(); renderCart();
}

function openLayer(name) { $("#overlay").classList.remove("hidden"); if (name === "cart") { $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden", "false"); } else $(name).classList.remove("hidden"); }
function closeLayers() { $("#overlay").classList.add("hidden"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden", "true"); $$(".modal").forEach(modal => modal.classList.add("hidden")); }
function renderCheckout() {
  const lines = validCart(); const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  $("#checkoutItems").innerHTML = lines.map(line => `<div class="checkout-line"><span>${escapeHtml(line.product.name)}${line.model ? ` · ${escapeHtml(line.model)}` : ""}${line.color ? ` · ສີ${escapeHtml(line.color)}` : ""} × ${line.quantity}</span><span>${money(line.product.price * line.quantity)}</span></div>`).join("");
  $("#checkoutTotal").textContent = money(total); renderPaymentDetails();
}
function renderPaymentDetails() {
  const payment = data.payment;
  const acc = $("#transferAccount");
  if (acc) acc.textContent = [payment.accountName, payment.accountNumber].filter(Boolean).join(" · ");
}
const colorHex = (name) => colorOptions.find(c => c.name === name)?.hex || "#cfd8d3";

// ---- ຊຸດສີຂອງຮ້ານ (ຫຼັງບ້ານ) ----
function renderColorSet() {
  const box = $("#colorSetList"); if (!box) return;
  const count = $("#colorSetCount"); if (count) count.textContent = `(${colorOptions.length} ສີ)`;
  box.innerHTML = colorOptions.length ? colorOptions.map((c, i) => `
    <div class="swatch-row">
      <span class="swatch-dot" style="background:${escapeHtml(c.hex || "#ccc")}"></span>
      <span class="swatch-name">${escapeHtml(c.name)}</span>
      <button type="button" data-color-rename="${i}" title="ແກ້ຊື່">✎</button>
      <button type="button" class="danger" data-color-del="${i}" title="ລຶບ">×</button>
    </div>`).join("")
    : `<p class="muted small-copy">ຍັງບໍ່ມີສີ — ເພີ່ມສີທຳອິດຂ້າງເທິງ</p>`;
}
async function saveColorOptions(list) {
  const { error } = await supabase.from("settings").update({ colorOptions: list }).eq("id", "store");
  if (error) { console.error(error); toast(`ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`); return false; }
  colorOptions = list; renderColorSet(); renderProductColorPicker(); return true;
}

// ---- ຕົວເລືອກສີໃນຟອມສິນຄ້າ ----
// ຮູບດຽວ = ເລືອກໄດ້ຫຼາຍສີ · ຫຼາຍຮູບ = ແຕ່ລະຮູບເລືອກ 1 ສີ
function multiImageMode() { return previewUrls.length > 1 || (editingProductId != null && imageColorMap.length > 1); }
function renderProductColorPicker() {
  const box = $("#productColorPicker"); if (!box) return;
  const multi = multiImageMode();
  const hint = $("#colorPickHint");
  if (hint) hint.textContent = multi
    ? "ມີຫຼາຍຮູບ — ໃຫ້ເລືອກສີຂອງແຕ່ລະຮູບຢູ່ແຖບຕົວຢ່າງຮູບຂ້າງເທິງແທນ"
    : "ເລືອກໄດ້ຫຼາຍສີ — ຢາກເພີ່ມ/ແກ້ສີ ໄປທີ່ກ່ອງ “ຊຸດສີຂອງຮ້ານ” ຂ້າງເທິງ";
  box.classList.toggle("disabled", multi);
  box.innerHTML = colorOptions.length ? colorOptions.map(c => `
    <button type="button" class="swatch${pickedColors.has(c.name) ? " on" : ""}" data-pick-swatch="${escapeHtml(c.name)}" ${multi ? "disabled" : ""}>
      <span class="swatch-dot" style="background:${escapeHtml(c.hex || "#ccc")}"></span>
      <span>${escapeHtml(c.name)}</span>
    </button>`).join("")
    : `<p class="muted small-copy">ຍັງບໍ່ມີສີໃນຊຸດ — ເພີ່ມທີ່ກ່ອງ “ຊຸດສີຂອງຮ້ານ” ຂ້າງເທິງ</p>`;
  const cnt = $("#pickedColorCount");
  if (cnt) cnt.textContent = multi ? `(ຕັ້ງທີ່ຮູບ)` : pickedColors.size;
}

function renderCourierSelect() {
  const sel = $("#courierSelect"); if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = couriers.length
    ? [`<option value="">— ເລືອກບໍລິສັດຂົນສົ່ງ —</option>`, ...couriers.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)].join("")
    : `<option value="">ຮ້ານຍັງບໍ່ໄດ້ໃສ່ລາຍຊື່ຂົນສົ່ງ</option>`;
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function renderCourierList() {
  const box = $("#courierList"); if (!box) return;
  box.innerHTML = couriers.length
    ? couriers.map((c, i) => `<div class="category-chip">${escapeHtml(c)} <button class="danger" data-courier-del="${i}" aria-label="ລຶບ">×</button></div>`).join("")
    : `<p class="muted small-copy">ຍັງບໍ່ມີລາຍຊື່ — ລູກຄ້າຈະເລືອກຂົນສົ່ງບໍ່ໄດ້</p>`;
}
async function saveCouriers(list) {
  const { error } = await supabase.from("settings").update({ couriers: list }).eq("id", "store");
  if (error) { console.error(error); toast(`ບັນທຶກບໍ່ສຳເລັດ: ${error.message}`); return false; }
  couriers = list; renderCourierList(); renderCourierSelect(); return true;
}

// ສະຫຼັບຊ່ອງຕາມວິທີຮັບເຄື່ອງ — ຮັບເອງທີ່ຮ້ານ = ປ້ອນແຕ່ຊື່ ແລະ ເບີໂທ
function toggleDeliveryFields() {
  const method = $("input[name=deliveryMethod]:checked")?.value || "pickup";
  const ship = method === "ship";
  $("#shipFields").classList.toggle("hidden", !ship);
  $$("#shipFields input, #shipFields select, #shipFields textarea").forEach(el => { el.disabled = !ship; });
  const courier = $("#courierSelect"); if (courier) courier.required = ship && couriers.length > 0;
}


// ລຳດັບສະຖານະອໍເດີ:
//   new → (ກົດຮັບອໍເດີ) → ມີສະຕັອກຄົບ? → preparing (ຕັດສະຕັອກທັນທີ)
//                          ບໍ່ຄົບ?      → needOrder → ordering → (ຮັບເຂົ້າສະຕັອກ) → preparing
//   preparing → shipping → complete
const ORDER_STATUSES = ["new", "needOrder", "ordering", "preparing", "shipping", "complete", "cancelled"];
function statusLabel(status) {
  return {
    new: "ອໍເດີໃໝ່", needOrder: "ຕ້ອງສັ່ງສິນຄ້າ", ordering: "ກຳລັງສັ່ງສິນຄ້າ",
    preparing: "ຕ້ອງຈັດສົ່ງ", shipping: "ກຳລັງຈັດສົ່ງ", complete: "ສຳເລັດ", cancelled: "ຍົກເລີກ",
    accepted: "ຮັບອໍເດີແລ້ວ", inbound: "ສິນຄ້າກຳລັງມາຮ້ານ"   // ສະຖານະເກົ່າ ເກັບໄວ້ໃຫ້ອໍເດີເກົ່າອ່ານໄດ້
  }[status] || status;
}
function paymentLabel(method) { return { cod: "ເກັບເງິນປາຍທາງ", transfer: "ໂອນເງິນ", pickup: "ຈ່າຍຕອນຮັບທີ່ຮ້ານ" }[method] || method; }

// ---------- ຕົວຊ່ວຍເລື່ອງສະຕັອກ / ອໍເດີ ----------
const productById = (id) => data.products.find(product => String(product.id) === String(id));
const orderById = (id) => data.orders.find(order => String(order.id) === String(id));
// =======================================================================
//  ລະບົບບັນຊີ — ທຶນໝູນວຽນ · ຊັບສິນຄົງທີ່ · ພະນັກງານ · ໜີ້ສິນ
// =======================================================================
// ຫຼັກການ: ທຸກເທື່ອທີ່ເງິນເຂົ້າ ຫຼື ອອກ ຈະລົງ 1 ແຖວໃນ ledger
//   amount ບວກ = ເງິນເຂົ້າ  ·  amount ລົບ = ເງິນອອກ
//   ແຖວທີ່ຜູກກັບອໍເດີ ຈະຫາຍໄປເອງເມື່ອລຶບອໍເດີ (ເງິນທຶນກັບຄືນ)

const LEDGER_KINDS = {
  capital:   { label: "ໃສ່ທຶນ",              icon: "💰" },
  orderCost: { label: "ຕົ້ນທຶນສິນຄ້າ (ອໍເດີ)", icon: "📦" },
  orderSale: { label: "ຂາຍສຳເລັດ (ອໍເດີ)",   icon: "🧾" },
  income:    { label: "ລາຍຮັບອື່ນ",           icon: "➕" },
  expense:   { label: "ລາຍຈ່າຍ",              icon: "➖" },
  salary:    { label: "ເງິນເດືອນ",            icon: "👷" },
  assetBuy:  { label: "ຊື້ຊັບສິນ",            icon: "🏭" },
  loanIn:    { label: "ຮັບເງິນກູ້",           icon: "🏦" },
  loanPay:   { label: "ຈ່າຍໜີ້",              icon: "💳" }
};
const kindLabel = (k) => LEDGER_KINDS[k]?.label || k;
const kindIcon  = (k) => LEDGER_KINDS[k]?.icon || "•";

// ວັນທີແບບທ້ອງຖິ່ນ YYYY-MM-DD (ໃຊ້ເປັນວັນທີເກີດລາຍການ)
const today = () => new Date().toLocaleDateString("en-CA");
const monthOf = (d) => String(d || "").slice(0, 7);            // 2026-09
const thisMonth = () => today().slice(0, 7);
const monthLabel = (ym) => {
  const names = ["ມັງກອນ","ກຸມພາ","ມີນາ","ເມສາ","ພຶດສະພາ","ມິຖຸນາ","ກໍລະກົດ","ສິງຫາ","ກັນຍາ","ຕຸລາ","ພະຈິກ","ທັນວາ"];
  const [y, m] = String(ym || "").split("-");
  return names[Number(m) - 1] ? `${names[Number(m) - 1]} ${y}` : ym;
};

// ---- ຂຽນ 1 ແຖວລົງບັນຊີ ----
async function addLedger(row) {
  const payload = {
    kind: row.kind, description: row.description || "",
    amount: Number(row.amount) || 0,
    happenedAt: row.happenedAt || today(),
    orderId: row.orderId || null, ref: row.ref || ""
  };
  const { error } = await supabase.from("ledger").insert(payload);
  if (error) { console.error("ledger:", error); toast(`ບັນທຶກບັນຊີບໍ່ໄດ້: ${error.message || ""}`); return false; }
  await refreshLedger();
  return true;
}

// ລຶບແຖວບັນຊີຂອງອໍເດີໜຶ່ງ ສະເພາະປະເພດທີ່ລະບຸ (ໃຊ້ຕອນຖອຍສະຖານະ)
async function removeOrderLedger(orderId, kind) {
  const q = supabase.from("ledger").delete().eq("orderId", orderId);
  const { error } = await (kind ? q.eq("kind", kind) : q);
  if (error) console.error("ledger del:", error);
  await refreshLedger();
}
const orderLedgerHas = (orderId, kind) =>
  data.ledger.some(r => String(r.orderId) === String(orderId) && r.kind === kind);

// ---- ຍອດລວມ ----
const cashBalance = () => data.ledger.reduce((sum, r) => sum + Number(r.amount || 0), 0);
const stockValue  = () => data.products.reduce((sum, p) => sum + Number(p.cost || 0) * Number(p.stock || 0), 0);
const debtLeft    = (d) => Math.max(0, Number(d.amount || 0) - Number(d.paid || 0));
const totalDebt   = () => data.debts.reduce((sum, d) => sum + debtLeft(d), 0);

// ---- ຄ່າເສື່ອມລາຄາ ແບບເສັ້ນຊື່ ----
// ຄ່າເສື່ອມຕໍ່ປີ = (ລາຄາຊື້ − ມູນຄ່າຊາກ) ÷ ອາຍຸໃຊ້ງານ
function depreciation(asset) {
  const cost = Number(asset.cost || 0);
  const salvage = Math.min(Number(asset.salvage || 0), cost);
  const life = Math.max(0.5, Number(asset.lifeYears || 1));
  const perYear = (cost - salvage) / life;
  const start = new Date(asset.buyDate || today());
  const years = Math.max(0, (Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
  const used = Math.min(life, years);
  const accumulated = Math.round(perYear * used);
  const bookValue = Math.max(salvage, cost - accumulated);
  return { perYear: Math.round(perYear), perMonth: Math.round(perYear / 12), accumulated, bookValue,
           yearsUsed: used, life, salvage, done: years >= life };
}
// ຕາຕະລາງຄ່າເສື່ອມແຕ່ລະປີ
function depreciationRows(asset) {
  const { perYear, life, salvage } = depreciation(asset);
  const cost = Number(asset.cost || 0);
  const startYear = new Date(asset.buyDate || today()).getFullYear();
  const rows = []; let book = cost;
  for (let i = 0; i < Math.ceil(life); i++) {
    const amount = Math.min(perYear, Math.max(0, book - salvage));
    book = Math.max(salvage, book - amount);
    rows.push({ year: startYear + i, amount, book });
  }
  return rows;
}
const assetBookTotal = () => data.assets.reduce((sum, a) => sum + depreciation(a).bookValue, 0);

// ---- ເງິນເດືອນ: ຮອດມື້ຈ່າຍ ແລະ ຍັງບໍ່ໄດ້ຈ່າຍເດືອນນີ້ ----
function salaryDue(employee, ym = thisMonth()) {
  if (employee.active === false) return false;   // ພັກວຽກ = ບໍ່ຕ້ອງຈ່າຍ
  const paid = data.ledger.some(r => r.kind === "salary" && r.ref === `emp:${employee.id}` && monthOf(r.happenedAt) === ym);
  if (paid) return false;
  const day = new Date().getDate();
  return day >= Number(employee.payDay || 30) || ym !== thisMonth();
}
const salaryDueList = () => data.employees.filter(e => salaryDue(e));

function orderCost(order) { return order.items.reduce((sum, item) => sum + (Number(item.cost) || 0) * item.quantity, 0); }

// ລາຍການທີ່ສະຕັອກບໍ່ພໍ ສຳລັບອໍເດີໜຶ່ງ
function shortfallFor(order) {
  return order.items.map(item => {
    const product = productById(item.productId);
    const have = Number(product?.stock || 0);
    return { item, product, have, missing: Math.max(0, item.quantity - have) };
  }).filter(line => line.missing > 0);
}

// ຕັດສະຕັອກຕາມລາຍການໃນອໍເດີ
async function deductStockFor(order) {
  const updates = order.items.map(item => {
    const product = productById(item.productId);
    if (!product) return null;
    const next = Math.max(0, Number(product.stock || 0) - item.quantity);
    product.stock = next;                                    // ອັບເດດແຄສທັນທີ
    return supabase.from("products").update({ stock: next }).eq("id", product.id);
  }).filter(Boolean);
  await Promise.all(updates);
}

// ກົດ “ຮັບອໍເດີ” — ແຍກເສັ້ນທາງຕາມວ່າຮ້ານມີສະຕັອກຫຼືບໍ່
// ---------- ຕົວຈັດການເຫດການ ຂອງໜ້າບັນຊີ ----------
function wireBooks() {
  const pane = document.querySelector('[data-pane="books"]');
  if (!pane) return;

  $("#bookMonth")?.addEventListener("change", e => { bookMonth = e.target.value; renderBooks(); });
  $("#exportMonthBtn")?.addEventListener("click", () => exportMonthCsv(bookMonth));
  $("#printMonthBtn")?.addEventListener("click", () => printMonthReport(bookMonth));
  $("#exportAssetsBtn")?.addEventListener("click", exportAssetsCsv);

  // ແຖບຍ່ອຍ
  pane.addEventListener("click", async event => {
    const tab = event.target.closest("[data-book-tab]");
    if (tab) {
      bookTab = tab.dataset.bookTab;
      pane.querySelectorAll(".book-tab").forEach(b => b.classList.toggle("active", b.dataset.bookTab === bookTab));
      pane.querySelectorAll(".book-pane").forEach(b => b.classList.toggle("hidden", b.dataset.bookPane !== bookTab));
      return;
    }
    const monthCsv = event.target.closest("[data-month-csv]");
    if (monthCsv) return exportMonthCsv(monthCsv.dataset.monthCsv);

    const plan = event.target.closest("[data-asset-plan]");
    if (plan) return $(`#plan-${plan.dataset.assetPlan}`)?.classList.toggle("hidden");

    // ---- ລຶບແຖວບັນຊີທີ່ພິມເອງ ----
    const delLg = event.target.closest("[data-del-ledger]");
    if (delLg) {
      const row = data.ledger.find(r => String(r.id) === delLg.dataset.delLedger);
      if (!row) return;
      if (!confirm(`ລຶບລາຍການນີ້ບໍ?\n\n${row.description}\n${money(Math.abs(row.amount))}\n\nຍອດເງິນຈະຖືກປັບຄືນທັນທີ`)) return;
      delLg.disabled = true;
      const { error } = await supabase.from("ledger").delete().eq("id", row.id);
      if (error) { toast("ລຶບບໍ່ໄດ້: " + error.message); delLg.disabled = false; return; }
      await refreshLedger(); toast("ລຶບແລ້ວ · ປັບຍອດເງິນຄືນ");
      return;
    }

    // ---- ຊັບສິນ ----
    const delAs = event.target.closest("[data-del-asset]");
    if (delAs) {
      const a = data.assets.find(x => String(x.id) === delAs.dataset.delAsset); if (!a) return;
      if (!confirm(`ລຶບຊັບສິນ “${a.name}” ບໍ?`)) return;
      const { error } = await supabase.from("assets").delete().eq("id", a.id);
      if (error) return toast("ລຶບບໍ່ໄດ້: " + error.message);
      await refreshAssets(); toast("ລຶບຊັບສິນແລ້ວ");
      return;
    }

    // ---- ພະນັກງານ ----
    const pay = event.target.closest("[data-pay-salary]");
    if (pay) {
      const e = data.employees.find(x => String(x.id) === pay.dataset.paySalary); if (!e) return;
      const left = cashBalance() - Number(e.salary || 0);
      if (!confirm(`ຈ່າຍເງິນເດືອນ ${e.name}\n\nຈຳນວນ ${money(e.salary)}\nຈ່າຍແລ້ວເງິນຈະເຫຼືອ ${money(left)}\n\nຢືນຢັນບໍ?`)) return;
      pay.disabled = true;
      await addLedger({ kind: "salary", amount: -Number(e.salary || 0), ref: `emp:${e.id}`,
        description: `ເງິນເດືອນ ${e.name} · ${monthLabel(thisMonth())}` });
      toast(`ຈ່າຍເງິນເດືອນ ${e.name} ແລ້ວ`);
      return;
    }
    const delEmp = event.target.closest("[data-del-emp]");
    if (delEmp) {
      const e = data.employees.find(x => String(x.id) === delEmp.dataset.delEmp); if (!e) return;
      if (!confirm(`ລຶບ “${e.name}” ອອກຈາກລາຍຊື່ບໍ?\n(ປະຫວັດການຈ່າຍເງິນເດືອນຍັງຢູ່ຄືເກົ່າ)`)) return;
      const { error } = await supabase.from("employees").delete().eq("id", e.id);
      if (error) return toast("ລຶບບໍ່ໄດ້: " + error.message);
      await refreshEmployees(); toast("ລຶບແລ້ວ");
      return;
    }

    // ---- ໜີ້ສິນ ----
    const payDebt = event.target.closest("[data-pay-debt]");
    if (payDebt) {
      const d = data.debts.find(x => String(x.id) === payDebt.dataset.payDebt); if (!d) return;
      const left = debtLeft(d);
      const input = prompt(`ຈ່າຍໜີ້ “${d.name}”\nຍັງຄ້າງ ${money(left)}\n\nຈ່າຍເທົ່າໃດ? (₭)`, String(left));
      if (input == null) return;
      const amt = Math.min(left, Number(input) || 0);
      if (amt <= 0) return toast("ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");
      const { error } = await supabase.from("debts").update({ paid: Number(d.paid || 0) + amt }).eq("id", d.id);
      if (error) return toast("ບັນທຶກບໍ່ໄດ້: " + error.message);
      await addLedger({ kind: "loanPay", amount: -amt, ref: `debt:${d.id}`, description: `ຈ່າຍໜີ້ ${d.name}` });
      await refreshDebts(); toast(`ຈ່າຍໜີ້ ${money(amt)} ແລ້ວ`);
      return;
    }
    const delDebt = event.target.closest("[data-del-debt]");
    if (delDebt) {
      const d = data.debts.find(x => String(x.id) === delDebt.dataset.delDebt); if (!d) return;
      if (!confirm(`ລຶບລາຍການໜີ້ “${d.name}” ບໍ?`)) return;
      const { error } = await supabase.from("debts").delete().eq("id", d.id);
      if (error) return toast("ລຶບບໍ່ໄດ້: " + error.message);
      await refreshDebts(); toast("ລຶບແລ້ວ");
    }
  });

  // ---- ຟອມ: ບັນທຶກເງິນເຂົ້າ-ອອກ ----
  $("#ledgerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const kind = fd.get("kind");
    const raw = Math.abs(Number(fd.get("amount") || 0));
    if (raw <= 0) return toast("ໃສ່ຈຳນວນເງິນກ່ອນ");
    const amount = kind === "expense" ? -raw : raw;
    const button = event.target.querySelector("button[type=submit]"); button.disabled = true;
    const done = await addLedger({ kind, amount, description: String(fd.get("description") || "").trim(),
      happenedAt: fd.get("happenedAt") || today() });
    button.disabled = false;
    if (done) { event.target.reset(); toast(kind === "expense" ? "ບັນທຶກລາຍຈ່າຍແລ້ວ" : "ບັນທຶກເງິນເຂົ້າແລ້ວ"); }
  });

  // ---- ຟອມ: ຊັບສິນ ----
  $("#assetForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const row = { name: String(fd.get("name")).trim(), category: String(fd.get("category") || "").trim(),
      cost: Number(fd.get("cost") || 0), buyDate: fd.get("buyDate") || today(),
      lifeYears: Number(fd.get("lifeYears") || 5), salvage: Number(fd.get("salvage") || 0) };
    const button = event.target.querySelector("button[type=submit]"); button.disabled = true;
    const { data: made, error } = await supabase.from("assets").insert(row).select();
    button.disabled = false;
    if (error) return toast("ບັນທຶກບໍ່ໄດ້: " + error.message);
    if (fd.get("spendCash")) {
      await addLedger({ kind: "assetBuy", amount: -row.cost, ref: `asset:${made?.[0]?.id || ""}`,
        description: `ຊື້ຊັບສິນ ${row.name}` });
    }
    await refreshAssets(); event.target.reset(); toast("ເພີ່ມຊັບສິນແລ້ວ");
  });

  // ---- ຟອມ: ພະນັກງານ ----
  $("#employeeForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const row = { name: String(fd.get("name")).trim(), role: String(fd.get("role") || "").trim(),
      salary: Number(fd.get("salary") || 0), payDay: Math.min(31, Math.max(1, Number(fd.get("payDay") || 30))), active: true };
    const button = event.target.querySelector("button[type=submit]"); button.disabled = true;
    const { error } = await supabase.from("employees").insert(row);
    button.disabled = false;
    if (error) return toast("ບັນທຶກບໍ່ໄດ້: " + error.message);
    await refreshEmployees(); event.target.reset(); toast("ເພີ່ມພະນັກງານແລ້ວ");
  });

  // ---- ຟອມ: ໜີ້ສິນ ----
  $("#debtForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const row = { name: String(fd.get("name")).trim(), amount: Number(fd.get("amount") || 0),
      dueDate: fd.get("dueDate") || null, paid: 0 };
    const button = event.target.querySelector("button[type=submit]"); button.disabled = true;
    const { data: made, error } = await supabase.from("debts").insert(row).select();
    button.disabled = false;
    if (error) return toast("ບັນທຶກບໍ່ໄດ້: " + error.message);
    if (fd.get("cashIn")) {
      await addLedger({ kind: "loanIn", amount: row.amount, ref: `debt:${made?.[0]?.id || ""}`,
        description: `ຮັບເງິນກູ້ ${row.name}` });
    }
    await refreshDebts(); event.target.reset(); toast("ເພີ່ມໜີ້ສິນແລ້ວ");
  });
}

// ---- ສະຫຼຸບເດືອນໜຶ່ງ ----
function monthSummary(ym) {
  const rows = data.ledger.filter(r => monthOf(r.happenedAt) === ym);
  const by = (k) => rows.filter(r => r.kind === k).reduce((s, r) => s + Number(r.amount || 0), 0);
  const sales = by("orderSale"), cost = -by("orderCost");
  const otherIncome = by("income"), expense = -by("expense"), salary = -by("salary");
  const gross = sales - cost;
  return { ym, sales, cost, gross, otherIncome, expense, salary,
           net: gross + otherIncome - expense - salary,
           orders: new Set(rows.filter(r => r.kind === "orderSale").map(r => r.orderId)).size };
}
// ທຸກເດືອນທີ່ມີຂໍ້ມູນ (ໃໝ່ສຸດກ່ອນ)
function allMonths() {
  const set = new Set(data.ledger.map(r => monthOf(r.happenedAt)).filter(Boolean));
  set.add(thisMonth());
  return [...set].sort().reverse();
}

let bookMonth = null, bookTab = "cash";

function renderBooks() {
  if (!$("#bookOverview")) return;
  const months = allMonths();
  if (!bookMonth || !months.includes(bookMonth)) bookMonth = months[0] || thisMonth();
  const sel = $("#bookMonth");
  sel.innerHTML = months.map(m => `<option value="${m}" ${m === bookMonth ? "selected" : ""}>${escapeHtml(monthLabel(m))}</option>`).join("");

  // ---- ບັດພາບລວມ ----
  const cash = cashBalance(), stock = stockValue(), fixed = assetBookTotal(), debt = totalDebt();
  const worth = cash + stock + fixed - debt;
  const sum = monthSummary(bookMonth);
  const card = (label, value, note, cls = "") =>
    `<div class="book-card ${cls}"><span>${escapeHtml(label)}</span><strong>${money(value)}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
  $("#bookOverview").innerHTML =
    card("💵 ເງິນສົດ / ທຶນໝູນວຽນ", cash, "ຍອດປັດຈຸບັນ", cash < 0 ? "bad" : "good") +
    card("📦 ມູນຄ່າສະຕັອກ", stock, "ຄິດຕາມຕົ້ນທຶນ") +
    card("🏭 ຊັບສິນຄົງທີ່", fixed, "ຫຼັງຫັກຄ່າເສື່ອມ") +
    card("🏦 ໜີ້ສິນ", debt, "ຍັງຄ້າງຈ່າຍ", debt > 0 ? "bad" : "") +
    card("🏆 ມູນຄ່າກິດຈະການ", worth, "ໝູນວຽນ + ຄົງທີ່ − ໜີ້ສິນ", "hero") +
    card(`📅 ກຳໄລສຸດທິ ${monthLabel(bookMonth)}`, sum.net, `ຂາຍ ${money(sum.sales)}`, sum.net >= 0 ? "good" : "bad");

  // ---- ① ລາຍການໃນເດືອນ ----
  const rows = data.ledger.filter(r => monthOf(r.happenedAt) === bookMonth)
    .sort((a, b) => String(b.happenedAt).localeCompare(String(a.happenedAt)) || Number(b.id) - Number(a.id));
  $("#ledgerList").innerHTML = rows.length ? rows.map(r => {
    const amt = Number(r.amount || 0), locked = !!r.orderId;
    return `<div class="ledger-row ${amt >= 0 ? "in" : "out"}">
      <span class="lg-icon">${kindIcon(r.kind)}</span>
      <div class="lg-body"><b>${escapeHtml(r.description || kindLabel(r.kind))}</b>
        <small>${escapeHtml(r.happenedAt)} · ${escapeHtml(kindLabel(r.kind))}${locked ? " · ມາຈາກອໍເດີ" : ""}</small></div>
      <span class="lg-amount">${amt >= 0 ? "+" : "−"}${money(Math.abs(amt))}</span>
      ${locked ? `<span class="lg-lock" title="ລາຍການນີ້ມາຈາກອໍເດີ ຈະຫາຍໄປເມື່ອລຶບອໍເດີນັ້ນ">🔒</span>`
               : `<button class="small-button delete" type="button" data-del-ledger="${r.id}">ລຶບ</button>`}
    </div>`;
  }).join("") : `<p class="muted small-copy" style="padding:14px">ຍັງບໍ່ມີລາຍການໃນເດືອນນີ້</p>`;

  // ---- ② ຕາຕະລາງລາຍເດືອນ ----
  const table = $("#monthTable");
  if (table) {
    table.innerHTML = `<thead><tr><th>ເດືອນ</th><th class="num">ຍອດຂາຍ</th><th class="num">ຕົ້ນທຶນ</th>
      <th class="num">ກຳໄລຂັ້ນຕົ້ນ</th><th class="num">ລາຍຮັບອື່ນ</th><th class="num">ລາຍຈ່າຍ</th>
      <th class="num">ເງິນເດືອນ</th><th class="num">ກຳໄລສຸດທິ</th><th></th></tr></thead>
      <tbody>${months.map(m => { const x = monthSummary(m);
        return `<tr class="${m === bookMonth ? "on" : ""}"><td><b>${escapeHtml(monthLabel(m))}</b><small class="blk">${x.orders} ອໍເດີ</small></td>
        <td class="num">${money(x.sales)}</td><td class="num">${money(x.cost)}</td>
        <td class="num">${money(x.gross)}</td><td class="num">${money(x.otherIncome)}</td>
        <td class="num">${money(x.expense)}</td><td class="num">${money(x.salary)}</td>
        <td class="num ${x.net >= 0 ? "pos" : "neg"}"><b>${money(x.net)}</b></td>
        <td><button class="small-button" type="button" data-month-csv="${m}">⬇</button></td></tr>`; }).join("")}</tbody>`;
  }

  // ---- ③ ຊັບສິນຄົງທີ່ ----
  $("#assetList").innerHTML = data.assets.length ? data.assets.map(a => {
    const d = depreciation(a);
    const pct = Number(a.cost) ? Math.min(100, Math.round(d.accumulated / Number(a.cost) * 100)) : 0;
    return `<div class="asset-row">
      <div class="ar-main"><b>${escapeHtml(a.name)}</b>
        <small>${escapeHtml(a.category || "ບໍ່ລະບຸໝວດ")} · ຊື້ ${escapeHtml(a.buyDate)} · ອາຍຸ ${Number(a.lifeYears)} ປີ</small>
        <div class="dep-bar"><i style="width:${pct}%"></i></div>
        <small>ຄ່າເສື່ອມ ${money(d.perYear)}/ປີ (${money(d.perMonth)}/ເດືອນ) · ສະສົມແລ້ວ ${money(d.accumulated)}${d.done ? " · ໝົດອາຍຸແລ້ວ" : ""}</small>
      </div>
      <div class="ar-money"><span>ລາຄາຊື້ ${money(a.cost)}</span><strong>ຄົງເຫຼືອ ${money(d.bookValue)}</strong></div>
      <div class="ar-tools">
        <button class="small-button" type="button" data-asset-plan="${a.id}">ຕາຕະລາງ</button>
        <button class="small-button delete" type="button" data-del-asset="${a.id}">ລຶບ</button>
      </div>
      <div class="dep-plan hidden" id="plan-${a.id}">
        <table class="book-table"><thead><tr><th>ປີ</th><th class="num">ຄ່າເສື່ອມ</th><th class="num">ມູນຄ່າຄົງເຫຼືອ</th></tr></thead>
        <tbody>${depreciationRows(a).map(r => `<tr><td>${r.year}</td><td class="num">${money(r.amount)}</td><td class="num">${money(r.book)}</td></tr>`).join("")}</tbody></table>
      </div>
    </div>`;
  }).join("") : `<p class="muted small-copy" style="padding:14px">ຍັງບໍ່ມີຊັບສິນ</p>`;

  // ---- ④ ພະນັກງານ ----
  const due = salaryDueList();
  $("#employeeList").innerHTML = (data.employees.length ? data.employees.map(e => {
    const isDue = salaryDue(e);
    return `<div class="asset-row ${isDue ? "due" : ""}">
      <div class="ar-main"><b>${escapeHtml(e.name)}</b>
        <small>${escapeHtml(e.role || "ພະນັກງານ")} · ຈ່າຍທຸກວັນທີ ${Number(e.payDay)} ຂອງເດືອນ${e.active === false ? " · ພັກວຽກ" : ""}</small>
        ${isDue ? `<small class="warn-line">⚠ ຮອດກຳນົດຈ່າຍແລ້ວ — ຈ່າຍແລ້ວເງິນຈະເຫຼືອ ${money(cashBalance() - Number(e.salary || 0))}</small>` : ""}</div>
      <div class="ar-money"><strong>${money(e.salary)}</strong><span>ຕໍ່ເດືອນ</span></div>
      <div class="ar-tools">
        ${isDue ? `<button class="primary-button small-button" type="button" data-pay-salary="${e.id}">💵 ຈ່າຍ</button>` : ""}
        <button class="small-button delete" type="button" data-del-emp="${e.id}">ລຶບ</button>
      </div></div>`;
  }).join("") : `<p class="muted small-copy" style="padding:14px">ຍັງບໍ່ມີພະນັກງານ</p>`)
    + (data.employees.length ? `<p class="staff-total">ເງິນເດືອນລວມ <b>${money(data.employees.filter(e => e.active !== false).reduce((s, e) => s + Number(e.salary || 0), 0))}</b> / ເດືອນ${due.length ? ` · ຮອດກຳນົດຈ່າຍ ${due.length} ຄົນ` : ""}</p>` : "");

  // ---- ⑤ ໜີ້ສິນ ----
  $("#debtList").innerHTML = data.debts.length ? data.debts.map(d => {
    const left = debtLeft(d);
    const pct = Number(d.amount) ? Math.round(Number(d.paid || 0) / Number(d.amount) * 100) : 0;
    return `<div class="asset-row ${left <= 0 ? "paid" : ""}">
      <div class="ar-main"><b>${escapeHtml(d.name)}</b>
        <small>ຍອດເຕັມ ${money(d.amount)} · ຈ່າຍແລ້ວ ${money(d.paid)}${d.dueDate ? ` · ກຳນົດ ${escapeHtml(d.dueDate)}` : ""}</small>
        <div class="dep-bar paid"><i style="width:${pct}%"></i></div></div>
      <div class="ar-money"><strong>${left > 0 ? money(left) : "ຈ່າຍຄົບແລ້ວ"}</strong><span>${left > 0 ? "ຍັງຄ້າງ" : "✓"}</span></div>
      <div class="ar-tools">
        ${left > 0 ? `<button class="small-button" type="button" data-pay-debt="${d.id}">ຈ່າຍ</button>` : ""}
        <button class="small-button delete" type="button" data-del-debt="${d.id}">ລຶບ</button>
      </div></div>`;
  }).join("") : `<p class="muted small-copy" style="padding:14px">ບໍ່ມີໜີ້ສິນ — ດີແລ້ວ</p>`;

  setBadge("#booksBadge", due.length);
}

// ---- ດຶງອອກເປັນ Excel (.csv) — ບໍ່ໃຊ້ໂປຣແກຣມເສີມ ດຶງຈາກໜ້າເວັບໂດຍກົງ ----
// ໃສ່ BOM ນຳໜ້າ ເພື່ອໃຫ້ Excel ອ່ານພາສາລາວອອກ ບໍ່ເປັນຕົວຕ່າງດາວ
function downloadCsv(filename, rows) {
  const esc = (v) => {
    const t = v == null ? "" : String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = rows.map(r => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`ດາວໂຫລດ ${filename} ແລ້ວ`);
}

function exportOrderCsv(order) {
  const rows = [
    ["ອໍເດີ", order.id], ["ວັນທີ", new Date(order.createdAt).toLocaleString("en-GB")],
    ["ລູກຄ້າ", order.customer?.name || ""], ["ເບີໂທ", order.customer?.phone || ""],
    ["ສະຖານະ", statusLabel(order.status)], [],
    ["ສິນຄ້າ", "ລຸ້ນ", "ສີ", "ຈຳນວນ", "ຕົ້ນທຶນ/ຊິ້ນ", "ລາຄາຂາຍ/ຊິ້ນ", "ລວມຂາຍ", "ລວມຕົ້ນທຶນ"],
    ...order.items.map(i => [i.name, i.model || "", i.color || "", i.quantity,
      Number(i.cost || 0), Number(i.price || 0), Number(i.price || 0) * i.quantity, Number(i.cost || 0) * i.quantity]),
    [], ["ລວມຂາຍ", orderTotal(order)], ["ລວມຕົ້ນທຶນ", orderCost(order)],
    ["ກຳໄລ", orderTotal(order) - orderCost(order)]
  ];
  downloadCsv(`order-${order.id}.csv`, rows);
}

// ສະຫຼຸບເດືອນ → Excel
function exportMonthCsv(ym) {
  const rows = data.ledger.filter(r => monthOf(r.happenedAt) === ym)
    .sort((a, b) => String(a.happenedAt).localeCompare(String(b.happenedAt)));
  const sum = monthSummary(ym);
  const out = [
    [`ສະຫຼຸບບັນຊີ ${monthLabel(ym)}`], [data.profile.shopName || "SL-Mobile"], [],
    ["ຍອດຂາຍ", sum.sales], ["ຕົ້ນທຶນສິນຄ້າ", sum.cost], ["ກຳໄລຂັ້ນຕົ້ນ", sum.gross],
    ["ລາຍຮັບອື່ນ", sum.otherIncome], ["ລາຍຈ່າຍ", sum.expense], ["ເງິນເດືອນ", sum.salary],
    ["ກຳໄລສຸດທິ", sum.net], [], ["ເງິນສົດຄົງເຫຼືອ (ຮອດປັດຈຸບັນ)", cashBalance()], [],
    ["ວັນທີ", "ປະເພດ", "ລາຍລະອຽດ", "ເງິນເຂົ້າ", "ເງິນອອກ"],
    ...rows.map(r => [r.happenedAt, kindLabel(r.kind), r.description,
      Number(r.amount) > 0 ? Number(r.amount) : "", Number(r.amount) < 0 ? -Number(r.amount) : ""])
  ];
  downloadCsv(`banxi-${ym}.csv`, out);
}

// ຊັບສິນຄົງທີ່ + ຄ່າເສື່ອມ → Excel
function exportAssetsCsv() {
  const out = [["ຊັບສິນຄົງທີ່ ແລະ ຄ່າເສື່ອມລາຄາ"], [data.profile.shopName || "SL-Mobile"],
    [`ວັນທີ ${today()}`], [],
    ["ຊື່ຊັບສິນ", "ໝວດ", "ວັນຊື້", "ລາຄາຊື້", "ອາຍຸ (ປີ)", "ມູນຄ່າຊາກ", "ຄ່າເສື່ອມ/ປີ", "ຄ່າເສື່ອມສະສົມ", "ມູນຄ່າຄົງເຫຼືອ"]];
  data.assets.forEach(a => {
    const d = depreciation(a);
    out.push([a.name, a.category, a.buyDate, Number(a.cost || 0), Number(a.lifeYears || 0),
      Number(a.salvage || 0), d.perYear, d.accumulated, d.bookValue]);
  });
  out.push([], ["ລວມລາຄາຊື້", data.assets.reduce((s, a) => s + Number(a.cost || 0), 0)]);
  out.push(["ລວມມູນຄ່າຄົງເຫຼືອ", assetBookTotal()]);
  out.push([], ["ຕາຕະລາງຄ່າເສື່ອມແຕ່ລະປີ"], ["ຊື່ຊັບສິນ", "ປີ", "ຄ່າເສື່ອມ", "ມູນຄ່າຄົງເຫຼືອ"]);
  data.assets.forEach(a => depreciationRows(a).forEach(r => out.push([a.name, r.year, r.amount, r.book])));
  downloadCsv(`sapsin-${today()}.csv`, out);
}

// ---- ພິມ / ບັນທຶກເປັນ PDF — ໃຊ້ໜ້າພິມຂອງ browser ບໍ່ຕ້ອງໂຫລດໂປຣແກຣມ ----
function printMonthReport(ym) {
  const sum = monthSummary(ym);
  const rows = data.ledger.filter(r => monthOf(r.happenedAt) === ym)
    .sort((a, b) => String(a.happenedAt).localeCompare(String(b.happenedAt)));
  const line = (label, value, cls = "") => `<tr class="${cls}"><td>${escapeHtml(label)}</td><td class="num">${money(value)}</td></tr>`;
  const box = document.createElement("div");
  box.id = "printArea";
  box.innerHTML = `
    <h1>${escapeHtml(data.profile.shopName || "SL-Mobile")}</h1>
    <h2>ສະຫຼຸບບັນຊີ ${escapeHtml(monthLabel(ym))}</h2>
    <p class="meta">ພິມວັນທີ ${today()} · ໂທ ${escapeHtml(data.profile.phone || "")}</p>
    <table class="sum">
      ${line("ຍອດຂາຍ", sum.sales)}
      ${line("ຫັກ ຕົ້ນທຶນສິນຄ້າ", -sum.cost)}
      ${line("ກຳໄລຂັ້ນຕົ້ນ", sum.gross, "strong")}
      ${line("ບວກ ລາຍຮັບອື່ນ", sum.otherIncome)}
      ${line("ຫັກ ລາຍຈ່າຍ", -sum.expense)}
      ${line("ຫັກ ເງິນເດືອນ", -sum.salary)}
      ${line("ກຳໄລສຸດທິ", sum.net, "total")}
    </table>
    <h3>ຖານະການເງິນ ຮອດວັນທີ ${today()}</h3>
    <table class="sum">
      ${line("ເງິນສົດ / ທຶນໝູນວຽນ", cashBalance())}
      ${line("ມູນຄ່າສະຕັອກ (ຕົ້ນທຶນ)", stockValue())}
      ${line("ຊັບສິນຄົງທີ່ (ຫຼັງຫັກຄ່າເສື່ອມ)", assetBookTotal())}
      ${line("ຫັກ ໜີ້ສິນ", -totalDebt())}
      ${line("ມູນຄ່າກິດຈະການສຸດທິ", cashBalance() + stockValue() + assetBookTotal() - totalDebt(), "total")}
    </table>
    <h3>ລາຍການທັງໝົດໃນເດືອນ (${rows.length} ລາຍການ)</h3>
    <table class="rows">
      <thead><tr><th>ວັນທີ</th><th>ປະເພດ</th><th>ລາຍລະອຽດ</th><th class="num">ເຂົ້າ</th><th class="num">ອອກ</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.happenedAt)}</td><td>${escapeHtml(kindLabel(r.kind))}</td>
        <td>${escapeHtml(r.description)}</td>
        <td class="num">${Number(r.amount) > 0 ? money(r.amount) : ""}</td>
        <td class="num">${Number(r.amount) < 0 ? money(-r.amount) : ""}</td></tr>`).join("") ||
        `<tr><td colspan="5">ບໍ່ມີລາຍການ</td></tr>`}</tbody>
    </table>
    <p class="sign">ຜູ້ຈັດການ ______________________</p>`;
  document.querySelectorAll("#printArea").forEach(n => n.remove());
  document.body.appendChild(box);
  window.print();
  setTimeout(() => box.remove(), 800);
}

// ຮັບອໍເດີ = ຫັກຕົ້ນທຶນອອກຈາກເງິນທຶນ (ລົງ 1 ເທື່ອເທົ່ານັ້ນ)
async function bookOrderCost(order) {
  if (orderLedgerHas(order.id, "orderCost")) return;
  const cost = orderCost(order);
  if (cost <= 0) return;
  await addLedger({ kind: "orderCost", amount: -cost, orderId: order.id,
    description: `ຕົ້ນທຶນອໍເດີ ${order.id} · ${order.customer?.name || ""}`.trim() });
}
// ອໍເດີສຳເລັດ = ຮັບເງິນຂາຍເຂົ້າ (ລົງ 1 ເທື່ອເທົ່ານັ້ນ)
async function bookOrderSale(order) {
  if (orderLedgerHas(order.id, "orderSale")) return;
  const total = orderTotal(order);
  if (total <= 0) return;
  await addLedger({ kind: "orderSale", amount: total, orderId: order.id,
    description: `ຂາຍສຳເລັດ ${order.id} · ${order.customer?.name || ""}`.trim() });
}
// ຖອຍສະຖານະອອກຈາກ "ສຳເລັດ" = ຖອນເງິນຂາຍອອກ ໃຫ້ຍອດຖືກຕ້ອງສະເໝີ
async function unbookOrderSale(orderId) {
  if (!orderLedgerHas(orderId, "orderSale")) return;
  await removeOrderLedger(orderId, "orderSale");
}

async function acceptOrder(orderId) {
  const order = orderById(orderId);
  if (!order) return;
  const now = new Date().toISOString();
  const short = shortfallFor(order);
  try {
    if (!short.length) {
      await deductStockFor(order);
      const { error } = await supabase.from("orders").update({ status: "preparing", stockDeducted: true, acceptedAt: now }).eq("id", order.id);
      if (error) throw error;
      await bookOrderCost(order);
      await Promise.all([refreshOrders(), refreshProducts()]);
      toast("ຮັບອໍເດີແລ້ວ · ຕັດສະຕັອກ ແລະ ຍ້າຍໄປ “ຕ້ອງຈັດສົ່ງ”");
    } else {
      const { error } = await supabase.from("orders").update({ status: "needOrder", acceptedAt: now }).eq("id", order.id);
      if (error) throw error;
      await bookOrderCost(order);
      await refreshOrders();
      toast(`ຮັບອໍເດີແລ້ວ · ມີ ${short.length} ລາຍການຕ້ອງສັ່ງເພີ່ມ`);
    }
  } catch (err) { console.error(err); toast(`ຮັບອໍເດີບໍ່ສຳເລັດ: ${err.message || err}`); }
}

// ພໍສະຕັອກເພີ່ມຂຶ້ນ ໃຫ້ອໍເດີທີ່ລໍຖ້າຢູ່ຍ້າຍໄປ “ຕ້ອງຈັດສົ່ງ” ອັດຕະໂນມັດ (ອໍເດີເກົ່າກ່ອນ)
async function promotePendingOrders() {
  const waiting = data.orders
    .filter(order => ["needOrder", "ordering"].includes(order.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!waiting.length) return 0;
  // ຈຳລອງສະຕັອກກ່ອນ ເພື່ອບໍ່ໃຫ້ສອງອໍເດີແຍ່ງເອົາຂອງຊິ້ນດຽວກັນ
  const simulated = new Map(data.products.map(product => [String(product.id), Number(product.stock || 0)]));
  const ready = [];
  for (const order of waiting) {
    const enough = order.items.every(item => (simulated.get(String(item.productId)) ?? 0) >= item.quantity);
    if (!enough) continue;
    order.items.forEach(item => simulated.set(String(item.productId), simulated.get(String(item.productId)) - item.quantity));
    ready.push(order);
  }
  for (const order of ready) {
    await deductStockFor(order);
    await supabase.from("orders").update({ status: "preparing", stockDeducted: true }).eq("id", order.id);
  }
  return ready.length;
}

// ເພີ່ມ / ລົບ ສະຕັອກ ຈາກໜ້າຈັດການສິນຄ້າ
async function adjustStock(productId, delta) {
  const product = productById(productId);
  if (!product || !delta) return;
  const next = Math.max(0, Number(product.stock || 0) + delta);
  if (next === Number(product.stock || 0)) return toast("ສະຕັອກເປັນ 0 ຢູ່ແລ້ວ");
  const { error } = await supabase.from("products").update({ stock: next }).eq("id", product.id);
  if (error) { console.error(error); return toast(`ອັບເດດສະຕັອກບໍ່ສຳເລັດ: ${error.message}`); }
  product.stock = next;
  renderManagerProducts(); renderCustomerShop();
  if (delta > 0) {
    const moved = await promotePendingOrders();
    await Promise.all([refreshOrders(), refreshProducts()]);
    toast(moved ? `ຮັບເຂົ້າສະຕັອກ +${delta} · ${moved} ອໍເດີຍ້າຍໄປ “ຕ້ອງຈັດສົ່ງ”` : `ຮັບເຂົ້າສະຕັອກ +${delta} ຊິ້ນແລ້ວ`);
  } else toast(`ລົບສະຕັອກ ${delta} ຊິ້ນແລ້ວ`);
}

// ລວມສິນຄ້າທີ່ຕ້ອງສັ່ງ ຈາກທຸກອໍເດີໃນສະຖານະທີ່ກຳນົດ (ລວມເປັນລາຍສິນຄ້າ ບໍ່ແມ່ນລາຍອໍເດີ)
function restockAggregate(statuses) {
  const map = new Map();
  data.orders.filter(order => statuses.includes(order.status)).forEach(order => {
    order.items.forEach(item => {
      const key = String(item.productId);
      if (!map.has(key)) map.set(key, { productId: item.productId, name: item.name, cost: item.cost, supplierUrl: item.supplierUrl || "", needed: 0, orders: [] });
      const entry = map.get(key);
      entry.needed += item.quantity;
      if (!entry.orders.includes(order.id)) entry.orders.push(order.id);
    });
  });
  return [...map.values()].map(entry => {
    const product = productById(entry.productId);
    const have = Number(product?.stock || 0);
    return { ...entry, product, have, missing: Math.max(0, entry.needed - have) };
  }).sort((a, b) => b.missing - a.missing || b.needed - a.needed);
}

function showManager() {
  closeLayers(); $(".app-shell").classList.add("hidden"); $("#managerView").classList.remove("hidden"); renderManager(); window.scrollTo({ top: 0, behavior: "instant" });
}
function showShop() { $("#managerView").classList.add("hidden"); $(".app-shell").classList.remove("hidden"); renderShopProfile(); renderCustomerShop(); renderCart(); }
function renderManager() { renderShopProfile(); renderDashboard(); renderOrders(); renderRestock(); renderShipping(); renderSlips(); renderManagerProducts(); renderCategoriesManager(); renderPaymentForm(); renderFinancials(); renderShopProfileForm(); renderProductCategories(); renderBooks(); }
function renderDashboard() {
  const activeOrders = data.orders.filter(order => !["cancelled", "complete"].includes(order.status));
  const pendingValue = activeOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const stockCount = data.products.filter(product => !isOnDemand(product)).reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const pendingCost = activeOrders.reduce((sum, order) => sum + orderCost(order), 0);
  const pendingProfit = pendingValue - pendingCost;
  const stats = [
    ["ອໍເດີໃໝ່", activeOrders.filter(order => order.status === "new").length, "ກົດຮັບອໍເດີເພື່ອເລີ່ມດຳເນີນການ"],
    ["ອໍເດີກຳລັງດຳເນີນການ", activeOrders.length, "ບໍ່ລວມອໍເດີສຳເລັດ/ຍົກເລີກ"],
    ["ມູນຄ່າອໍເດີລໍຖ້າ", money(pendingValue), "ຍອດຂາຍລວມຂອງອໍເດີທີ່ຍັງບໍ່ສຳເລັດ"],
    ["ຕົ້ນທຶນອໍເດີລໍຖ້າ", money(pendingCost), "ເງິນທີ່ຕ້ອງຈ່າຍຊື້ສິນຄ້າ"],
    ["ກຳໄລທີ່ຈະໄດ້", money(pendingProfit), "ມູນຄ່າອໍເດີ − ຕົ້ນທຶນ (ຖ້າສຳເລັດທັງໝົດ)"],
    ["ສະຕັອກໃນຮ້ານ", `${stockCount} ຊິ້ນ`, "ບໍ່ລວມສິນຄ້າສັ່ງຕາມອໍເດີ"]
  ];
  $("#statsGrid").innerHTML = stats.map(item => `<div class="stat-card"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const recent = [...data.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  $("#recentOrders").innerHTML = recent.length ? recent.map(order => `<div class="recent-order"><div><strong>${order.id}</strong><small>${escapeHtml(order.customer.name)} · ${money(orderTotal(order))} · ກຳໄລ ${money(orderTotal(order) - orderCost(order))}</small></div><span class="status-badge status-${order.status}">${statusLabel(order.status)}</span></div>`).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີອໍເດີ</p>`;

  // ສະຫຼຸບສະຕັອກຕາມໝວດ (ແລະ ແຍກຍ່ອຍຕາມຮຸ່ນ)
  const byCategory = data.categories.map(category => {
    const items = data.products.filter(product => String(product.categoryId) === String(category.id));
    const total = items.reduce((sum, product) => sum + Number(product.stock || 0), 0);
    const subs = new Map();
    items.forEach(product => {
      const key = product.subcategory?.trim() || "ບໍ່ລະບຸຮຸ່ນ";
      subs.set(key, (subs.get(key) || 0) + Number(product.stock || 0));
    });
    return { name: category.name, count: items.length, total, subs: [...subs.entries()].sort((a, b) => b[1] - a[1]) };
  }).filter(row => row.count > 0).sort((a, b) => b.total - a.total);
  $("#categoryStock").innerHTML = byCategory.length ? byCategory.map(row => `<div class="category-stock-row">
      <div><strong>${escapeHtml(row.name)}</strong><small>${row.count} ລາຍການສິນຄ້າ</small>
        <div class="sub-breakdown">${row.subs.map(([sub, qty]) => `<span>${escapeHtml(sub)}: ${qty}</span>`).join("")}</div>
      </div><b>${row.total} ຊິ້ນ</b></div>`).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີສິນຄ້າໃນໝວດໃດເລີຍ</p>`;

  const needList = restockAggregate(["needOrder"]);
  $("#supplierQueue").innerHTML = needList.length ? needList.slice(0, 6).map(entry => `<div class="queue-line"><div><strong>${escapeHtml(entry.name)} — ຂາດ ${entry.missing} ຊິ້ນ</strong><span>${entry.orders.join(", ")} · ຕົ້ນທຶນ ${money(entry.cost)}</span></div>${entry.supplierUrl ? `<a href="${escapeHtml(entry.supplierUrl)}" target="_blank" rel="noopener" class="supplier-link">ໄປຮ້ານ ↗</a>` : ""}</div>`).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີສິນຄ້າທີ່ຕ້ອງສັ່ງ.</p>`;
  setBadge("#orderBadge", data.orders.filter(order => order.status === "new").length);
  setBadge("#restockBadge", needList.length);
  setBadge("#shippingBadge", data.orders.filter(order => order.status === "preparing").length);
}
function renderFinancials() {
  const completedOrders = data.orders.filter(order => order.status === "complete");
  const revenue = completedOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const productCost = completedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + (Number(item.cost) || 0) * item.quantity, 0), 0);
  const grossProfit = revenue - productCost;
  const extraExpenses = data.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const netProfit = grossProfit - extraExpenses;
  const financials = [["ຍອດຮັບເຂົ້າບັນຊີ", revenue, "ຈາກອໍເດີສຳເລັດ"], ["ຕົ້ນທຶນສິນຄ້າ", productCost, "ລວມຕົ້ນທຶນຂອງອໍເດີສຳເລັດ"], ["ກຳໄລຂັ້ນຕົ້ນ", grossProfit, "ຍອດຂາຍ − ຕົ້ນທຶນສິນຄ້າ"], ["ຄ່າໃຊ້ຈ່າຍເພີ່ມ", extraExpenses, "ຄ່າສົ່ງ/ຫຸ້ມຫໍ່/ໂຄສະນາ"], ["ກຳໄລສຸດທິ", netProfit, "ຫຼັງຫັກຕົ້ນທຶນ ແລະ ຄ່າໃຊ້ຈ່າຍເພີ່ມ"]];
  $("#financialGrid").innerHTML = financials.map(([label, value, note]) => `<div class="stat-card financial-card"><span>${label}</span><strong>${money(value)}</strong><small>${note}</small></div>`).join("");
  const expenses = [...data.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("#expenseList").innerHTML = expenses.length ? expenses.map(expense => `<div class="expense-line"><div><strong>${escapeHtml(expense.description)}</strong><small>${dateLabel(expense.createdAt)}</small></div><div><b>${money(expense.amount)}</b><button data-delete-expense="${expense.id}" aria-label="ລຶບຄ່າໃຊ້ຈ່າຍ">×</button></div></div>`).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີຄ່າໃຊ້ຈ່າຍເພີ່ມ.</p>`;
}
// ບັດອໍເດີ 1 ໃບ — ມີຮູບສິນຄ້າທຸກລາຍການ ເພື່ອໃຫ້ເບິ່ງງ່າຍ
function orderCard(order) {
  const itemsHtml = order.items.map(item => {
    const product = productById(item.productId);
    const thumb = product ? imageMarkup(product) : placeholder;
    return `<div class="order-item-mini">
      <div class="order-item-thumb">${thumb}</div>
      <span>${escapeHtml(item.name)}${item.model ? ` · <b>${escapeHtml(item.model)}</b>` : ""}${item.color ? ` · ສີ${escapeHtml(item.color)}` : ""} × ${item.quantity}${item.supplierUrl ? ` <a class="supplier-link" href="${escapeHtml(item.supplierUrl)}" target="_blank" rel="noopener">ລິ້ງຮ້ານ ↗</a>` : ""}</span>
      <b>${money(item.price * item.quantity)}</b></div>`;
  }).join("");
  const address = order.customer.deliveryMethod === "pickup" ? "ຮັບເອງທີ່ຮ້ານ" : (order.customer.address || "ບໍ່ໄດ້ລະບຸທີ່ຢູ່");
  return `<article class="order-card">
    <div class="order-card-head">
      <div><h3 class="order-id">${escapeHtml(order.id)}</h3><span class="order-date">${dateLabel(order.createdAt)}</span></div>
      <div><div class="order-summary-price">${money(orderTotal(order))}</div><span class="status-badge status-${order.status}">${statusLabel(order.status)}</span></div>
    </div>
    <div class="order-card-body">
      <div><h4>ຂໍ້ມູນລູກຄ້າ</h4>
        <p><b>${escapeHtml(order.customer.name)}</b> · ${escapeHtml(order.customer.phone)}</p>
        <p>${escapeHtml(address)}</p>
        <p>ຂົນສົ່ງ: ${escapeHtml(order.customer.transportBranch || "ບໍ່ໄດ້ລະບຸ")}<br>ຈ່າຍ: ${paymentLabel(order.paymentMethod)}</p>
        ${order.customer.note ? `<p>ໝາຍເຫດ: ${escapeHtml(order.customer.note)}</p>` : ""}
        ${order.receipt ? `<p class="pay-warn">⚠ ລູກຄ້າແຈ້ງໂອນແລ້ວ — <b>ກວດຍອດເງິນໃນບັນຊີກ່ອນສົ່ງ</b></p><button class="receipt-button" data-view-receipt="${escapeHtml(order.id)}">ເບິ່ງໃບໂອນ</button><img id="receipt-${escapeHtml(order.id)}" class="receipt-img hidden" src="${escapeHtml(order.receipt)}" alt="ໃບໂອນ">` : ""}
      </div>
      <div><h4>ສິນຄ້າທີ່ສັ່ງ</h4><div class="order-items-mini">${itemsHtml}</div></div>
    </div>
    <div class="order-card-foot">
      <span class="muted small-copy">ກຳໄລອໍເດີນີ້ ${money(orderTotal(order) - orderCost(order))} · ຕົ້ນທຶນ ${money(orderCost(order))}</span>
      <div class="order-actions">
        ${order.status === "new" ? `<button class="small-button accept-order" data-accept-order="${escapeHtml(order.id)}">✓ ຮັບອໍເດີ</button>` : ""}
        <select class="order-status-select" data-order-status="${escapeHtml(order.id)}">${ORDER_STATUSES.map(st => `<option value="${st}" ${order.status === st ? "selected" : ""}>${statusLabel(st)}</option>`).join("")}</select>
        <button class="small-button danger" data-delete-order="${escapeHtml(order.id)}">🗑 ລຶບອໍເດີ</button>
      </div>
    </div>
  </article>`;
}

function renderOrders() {
  const query = $("#managerOrderSearch").value.trim().toLowerCase();
  const statuses = [["all", "ທັງໝົດ"], ["new", "ໃໝ່"], ["needOrder", "ຕ້ອງສັ່ງສິນຄ້າ"], ["ordering", "ກຳລັງສັ່ງ"], ["preparing", "ຕ້ອງຈັດສົ່ງ"], ["shipping", "ກຳລັງສົ່ງ"], ["complete", "ສຳເລັດ"], ["cancelled", "ຍົກເລີກ"]];
  $("#orderFilters").innerHTML = statuses.map(([value, label]) => `<button data-order-filter="${value}" class="${activeOrderFilter === value ? "active" : ""}">${label}</button>`).join("");
  const orders = [...data.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(order => {
    const matchesStatus = activeOrderFilter === "all" || order.status === activeOrderFilter;
    const text = `${order.id} ${order.customer.name} ${order.customer.phone} ${order.customer.address}`.toLowerCase(); return matchesStatus && text.includes(query);
  });
  $("#ordersList").innerHTML = orders.length ? orders.map(orderCard).join("") : `<div class="empty-state"><h3>ບໍ່ພົບອໍເດີ</h3><p>ລອງເລືອກສະຖານະ ຫຼື ຄົ້ນຫາໃໝ່</p></div>`;
}
let catPickerPath = [];   // ເສັ້ນທາງໃນຕົວເລືອກໝວດສິນຄ້າ

// ປ້າຍສະແດງໝວດທີ່ເລືອກຢູ່
function renderProductCategories() {
  const hidden = $("#productCategory"); const label = $("#catPickerLabel");
  if (!hidden || !label) return;
  const cat = hidden.value ? catById(hidden.value) : null;
  label.textContent = cat ? categoryPath(cat.id).map(c => c.name).join(" › ") : "ກົດເພື່ອເລືອກໝວດ";
  label.classList.toggle("empty", !cat);
}

// ລາຍການໃນຕົວເລືອກໝວດ (ເປີດເປັນຊັ້ນ)
function renderCatPicker() {
  const listBox = $("#catPickerList"), crumbBox = $("#catPickerCrumb");
  if (!listBox) return;
  const currentId = catPickerPath.length ? catPickerPath[catPickerPath.length - 1] : null;

  const crumb = [`<button type="button" class="crumb-btn" data-catpick-goto="root">ທັງໝົດ</button>`];
  catPickerPath.forEach((id, i) => {
    const cat = catById(id); if (!cat) return;
    crumb.push(`<i>›</i>` + (i === catPickerPath.length - 1
      ? `<span>${escapeHtml(cat.name)}</span>`
      : `<button type="button" class="crumb-btn" data-catpick-goto="${cat.id}">${escapeHtml(cat.name)}</button>`));
  });
  crumbBox.innerHTML = crumb.join("");

  const kids = childrenOf(currentId);
  const rows = [];
  if (currentId) {
    const cur = catById(currentId);
    rows.push(`<button type="button" class="picker-folder pick-here" data-catpick-select="${currentId}">
      <span class="pf-name">✓ ໃຊ້ “${escapeHtml(cur?.name || "")}” ເປັນໝວດ</span>
      <span class="pf-meta">ບັນທຶກໄວ້ຊັ້ນນີ້</span></button>`);
  }
  kids.forEach(c => {
    const kidCount = childrenOf(c.id).length;
    rows.push(`<button type="button" class="picker-folder" data-catpick-${kidCount ? "open" : "select"}="${c.id}">
      <span class="pf-name">${escapeHtml(c.icon || "")} ${escapeHtml(c.name)}</span>
      <span class="pf-meta">${kidCount ? `${kidCount} ກຸ່ມຍ່ອຍ` : `${productCountIn(c.id)} ສິນຄ້າ`}</span>
      <span class="pf-go">${kidCount ? "›" : "+"}</span></button>`);
  });
  listBox.innerHTML = rows.length ? rows.join("") : `<p class="muted small-copy" style="padding:12px">ຍັງບໍ່ມີໝວດ</p>`;
}

function renderManagerProducts() {
  const query = ($("#manageProductSearch")?.value || "").trim().toLowerCase();
  const list = data.products.filter(product => {
    const inCat = manageCategoryFilter === "all" || new Set(descendantIds(manageCategoryFilter)).has(String(product.categoryId));
    const hay = `${product.name} ${categoryPath(product.categoryId).map(c => c.name).join(" ")}`.toLowerCase();
    return inCat && hay.includes(query);
  });

  // ແຖບກັ່ນຕອງໝວດ (ພ້ອມຈຳນວນ)
  const filters = [`<button data-manage-cat="all" class="${manageCategoryFilter === "all" ? "active" : ""}">ທັງໝົດ (${data.products.length})</button>`,
    ...childrenOf(null).map(cat => {
      const n = productCountIn(cat.id);
      return `<button data-manage-cat="${cat.id}" class="${manageCategoryFilter === String(cat.id) ? "active" : ""}">${escapeHtml(cat.icon || "")} ${escapeHtml(cat.name)} (${n})</button>`;
    })];
  $("#manageCategoryFilter").innerHTML = filters.join("");
  const totalStock = list.reduce((sum, pr) => sum + Number(pr.stock || 0), 0);
  $("#manageCount").innerHTML = `ສະແດງ <b>${list.length}</b> ລາຍການ · ສະຕັອກລວມ <b>${totalStock}</b> ຊິ້ນ`;

  $("#managerProducts").innerHTML = list.length ? list.map(product => {
    const path = categoryPath(product.categoryId);
    const label = path.length ? path.map(c => escapeHtml(c.name)).join(" › ") : "ບໍ່ມີໝວດ";
    const imgs = productImages(product); const cols = productColors(product); const mdl = productModelIds(product);
    const mode = isOnDemand(product) ? "ສັ່ງຕາມອໍເດີ" : "ພ້ອມສົ່ງ";
    return `<article class="manager-product-row">
      <div class="manager-product-thumb">${imageMarkup(product)}</div>
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${label} · ${mode}${imgs.length > 1 ? ` · 🖼 ${imgs.length} ຮູບ` : ""}${cols.length ? ` · ສີ: ${cols.map(escapeHtml).join(", ")}` : ""}${mdl.length ? ` · ໃສ່ໄດ້ ${mdl.length} ລຸ້ນ` : ""}</p>
        <div class="stock-control">
          <button type="button" data-stock-minus="${product.id}" aria-label="ລົບສະຕັອກ">−</button>
          <input type="number" min="0" step="1" value="${Number(product.stock || 0)}" data-stock-input="${product.id}" aria-label="ຈຳນວນສະຕັອກ">
          <button type="button" data-stock-plus="${product.id}" aria-label="ເພີ່ມສະຕັອກ">+</button>
          <span class="stock-unit">ຊິ້ນ</span>
        </div>
        <div class="mode-control">
          <label>ຮູບແບບຂາຍ
            <select data-sale-mode="${product.id}">
              <option value="inStock" ${!isOnDemand(product) ? "selected" : ""}>ພ້ອມສົ່ງ (ຕັດສະຕັອກ)</option>
              <option value="onDemand" ${isOnDemand(product) ? "selected" : ""}>ສັ່ງຕາມອໍເດີ (ສະຕັອກ 0 ກໍຂາຍໄດ້)</option>
            </select>
          </label>
          <button type="button" class="small-button" data-sold-out="${product.id}">ໝົດແລ້ວ (ສະຕັອກ 0)</button>
        </div>
      </div>
      <div class="product-finance"><strong>ຂາຍ ${money(product.price)}</strong>
        <span>ຕົ້ນທຶນ ${money(product.cost)} · ກຳໄລ ${money(product.price - product.cost)}</span>
        ${Number(product.yuanPrice || 0) > 0 ? `<span class="yuan-tag">¥ ${Number(product.yuanPrice)}${Number(product.shipCost || 0) ? ` + ຂົນສົ່ງ ${money(product.shipCost)}` : ""}</span>` : ""}</div>
      <div class="product-tools"><button class="small-button" data-edit-product="${product.id}">ແກ້ໄຂ</button><button class="small-button delete" data-delete-product="${product.id}">ລຶບ</button></div>
    </article>`;
  }).join("") : `<div class="empty-state"><h3>${data.products.length ? "ບໍ່ພົບສິນຄ້າໃນມູມມອງນີ້" : "ຍັງບໍ່ມີສິນຄ້າ"}</h3><p>${data.products.length ? "ລອງເລືອກໝວດອື່ນ ຫຼື ຄົ້ນຫາໃໝ່" : "ກົດ “ເພີ່ມສິນຄ້າ” ເພື່ອເລີ່ມຕົ້ນ"}</p></div>`;
}

// ---------- ໜ້າ “ຕ້ອງສັ່ງສິນຄ້າ” ----------
function restockRow(entry, mode) {
  const product = entry.product;
  const thumb = product ? imageMarkup(product) : placeholder;
  const phone = data.profile.phone || "";
  const supplierButton = entry.supplierUrl
    ? `<a class="supplier-link" href="${escapeHtml(entry.supplierUrl)}" target="_blank" rel="noopener">🛒 ໄປສັ່ງທີ່ຮ້ານ ↗</a>`
    : `<span class="input-hint" style="text-align:center">ບໍ່ມີລິ້ງຮ້ານຕົ້ນທາງ</span>`;
  const callButton = phone ? `<a class="call-link" href="tel:${escapeHtml(phone.replace(/\s/g, ""))}">📞 ${escapeHtml(phone)}</a>` : "";
  const action = mode === "needOrder"
    ? `<button class="small-button accept-order" data-mark-ordered="${entry.productId}">✓ ສັ່ງແລ້ວ</button>`
    : `<button class="small-button accept-order" data-receive-stock="${entry.productId}" data-suggest="${entry.missing || entry.needed}">📦 ຮັບເຂົ້າສະຕັອກ</button>`;
  const stateChip = mode === "needOrder"
    ? `<span class="restock-state need">ຕ້ອງສັ່ງຈາກຮ້ານຕົ້ນທາງ</span>`
    : `<span class="restock-state ordering">ກຳລັງສັ່ງ · ລໍຖ້າມາຮ້ານ</span>`;
  return `<div class="restock-row">
    <div class="restock-thumb">${thumb}</div>
    <div class="restock-info">
      ${stateChip}
      <h4>${escapeHtml(entry.name)}</h4>
      <p class="restock-meta">
        ຕ້ອງການ <b>${entry.needed}</b> ຊິ້ນ · ມີໃນຮ້ານ <b>${entry.have}</b> · ຂາດອີກ <b>${entry.missing}</b><br>
        ຕົ້ນທຶນ ${money(entry.cost)} / ຊິ້ນ · ລວມທີ່ຕ້ອງຈ່າຍ ${money(entry.cost * entry.missing)}
      </p>
      <div class="restock-orders">${entry.orders.map(id => `<span>${escapeHtml(id)}</span>`).join("")}</div>
    </div>
    <div class="restock-actions">${supplierButton}${callButton}${action}</div>
  </div>`;
}
function renderRestock() {
  const all = restockAggregate(["needOrder", "ordering"]).map(entry => ({
    ...entry,
    state: data.orders.some(order => order.status === "needOrder" && order.items.some(item => String(item.productId) === String(entry.productId))) ? "needOrder" : "ordering"
  }));
  const needList = all.filter(entry => entry.state === "needOrder");
  const orderingList = all.filter(entry => entry.state === "ordering");

  // ແຖບສະຫຼຸບຂ້າງເທິງ
  const totalMissing = needList.reduce((sum, e) => sum + e.missing, 0);
  const totalOrdering = orderingList.reduce((sum, e) => sum + e.missing, 0);
  const totalCost = needList.reduce((sum, e) => sum + e.cost * e.missing, 0);
  $("#restockSummary").innerHTML = [
    ["ຕ້ອງສັ່ງທັງໝົດ", `${totalMissing} ຊິ້ນ`, totalMissing > 0],
    ["ກຳລັງສັ່ງ ລໍຖ້າມາຮ້ານ", `${totalOrdering} ຊິ້ນ`, false],
    ["ລາຍການສິນຄ້າ", `${all.length} ລາຍການ`, false],
    ["ເງິນທີ່ຕ້ອງຈ່າຍ", money(totalCost), false]
  ].map(([label, value, alert]) => `<div class="summary-card${alert ? " alert" : ""}"><span>${label}</span><strong>${value}</strong></div>`).join("");

  // ຈັດກຸ່ມຕາມໝວດ → ສະຫຼຸບເປັນ chip ໃຫ້ເຫັນໄວ
  const groups = new Map();
  all.forEach(entry => {
    const product = entry.product;
    const key = product ? categoryName(product.categoryId) : "ບໍ່ມີໝວດ";
    groups.set(key, (groups.get(key) || 0) + entry.missing);
  });
  $("#restockGroups").innerHTML = groups.size
    ? [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([name, qty]) => `<span class="chip">${escapeHtml(name)} <b>${qty}</b></span>`).join("")
    : "";

  // ແຖບກັ່ນຕອງ: ສະຖານະ + ໝວດ
  const cats = [...new Set(all.map(entry => entry.product ? String(entry.product.categoryId) : ""))].filter(Boolean);
  $("#restockFilters").innerHTML = [
    `<button data-restock-filter="all" class="${restockFilter === "all" ? "active" : ""}">ທັງໝົດ (${all.length})</button>`,
    `<button data-restock-filter="needOrder" class="${restockFilter === "needOrder" ? "active" : ""}">ຕ້ອງສັ່ງ (${needList.length})</button>`,
    `<button data-restock-filter="ordering" class="${restockFilter === "ordering" ? "active" : ""}">ກຳລັງສັ່ງ (${orderingList.length})</button>`,
    ...cats.map(id => {
      const count = all.filter(entry => String(entry.product?.categoryId) === id).length;
      return `<button data-restock-filter="cat:${id}" class="${restockFilter === `cat:${id}` ? "active" : ""}">${escapeHtml(categoryName(Number(id)))} (${count})</button>`;
    })
  ].join("");

  const shown = all.filter(entry => {
    if (restockFilter === "all") return true;
    if (restockFilter.startsWith("cat:")) return String(entry.product?.categoryId) === restockFilter.slice(4);
    return entry.state === restockFilter;
  });
  $("#restockList").innerHTML = shown.length
    ? shown.map(entry => restockRow(entry, entry.state)).join("")
    : `<div class="restock-empty">ບໍ່ມີລາຍການໃນມູມມອງນີ້ — ພໍກົດ “ຮັບອໍເດີ” ແລ້ວຮ້ານບໍ່ມີສະຕັອກ ລາຍການຈະມາລວມຢູ່ນີ້</div>`;
  setBadge("#restockBadge", needList.length);
}

// ---- ໜ້າ “ຕ້ອງຈັດສົ່ງ” ----
let slipRange = "today";   // today | week | all

function renderSlips() {
  const withSlip = data.orders.filter(o => o.receipt && o.status !== "cancelled");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 6 * 86400000;
  const stamp = (o) => new Date(o.slipAt || o.createdAt).getTime();
  const inRange = (o) => slipRange === "all" ? true
    : slipRange === "week" ? stamp(o) >= weekAgo : stamp(o) >= startOfToday;
  const shown = withSlip.filter(inRange).sort((a, b) => stamp(b) - stamp(a));

  const filters = [["today", "ມື້ນີ້"], ["week", "7 ມື້"], ["all", "ທັງໝົດ"]];
  const box = $("#slipFilters");
  if (box) box.innerHTML = filters.map(([v, label]) => {
    const n = withSlip.filter(o => v === "all" ? true : v === "week" ? stamp(o) >= weekAgo : stamp(o) >= startOfToday).length;
    return `<button data-slip-range="${v}" class="${slipRange === v ? "active" : ""}">${label} (${n})</button>`;
  }).join("");

  const total = shown.reduce((sum, o) => sum + orderTotal(o), 0);
  const done = shown.filter(o => o.status === "complete").length;
  $("#slipSummary").innerHTML = [
    ["ຈຳນວນໃບໂອນ", `${shown.length} ໃບ`, shown.length > 0],
    ["ຍອດເງິນລວມ", money(total), false],
    ["ອໍເດີສຳເລັດແລ້ວ", `${done} ອໍເດີ`, false],
    ["ຍັງລໍດຳເນີນການ", `${shown.length - done} ອໍເດີ`, shown.length - done > 0]
  ].map(([l, v, alert]) => `<div class="summary-card${alert ? " alert" : ""}"><span>${l}</span><strong>${v}</strong></div>`).join("");

  $("#slipList").innerHTML = shown.length ? shown.map(o => `<article class="slip-card">
      <button class="slip-thumb" type="button" data-zoom-image="${escapeHtml(o.receipt)}">
        <img src="${escapeHtml(o.receipt)}" alt="ໃບໂອນ ${escapeHtml(o.id)}" loading="lazy">
        <span class="zoom-hint">🔍 ກົດເບິ່ງເຕັມ</span>
      </button>
      <div class="slip-info">
        <div class="slip-head"><b>${escapeHtml(o.id)}</b><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></div>
        <p class="slip-amount">${money(orderTotal(o))}</p>
        <p class="restock-meta">${escapeHtml(o.customer.name)} · ${escapeHtml(o.customer.phone)}<br>
          ສົ່ງໃບໂອນ: ${dateLabel(o.slipAt || o.createdAt)}</p>
        <div class="restock-orders">${o.items.map(it => `<span>${escapeHtml(it.name)}${it.model ? ` ${escapeHtml(it.model)}` : ""} × ${it.quantity}</span>`).join("")}</div>
      </div>
    </article>`).join("")
    : `<div class="restock-empty">ຍັງບໍ່ມີໃບໂອນໃນຊ່ວງນີ້</div>`;

  setBadge("#slipBadge", withSlip.filter(o => o.status === "new").length);
}

function renderShipping() {
  const orders = data.orders.filter(order => ["preparing", "shipping"].includes(order.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const pieces = orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0);
  const value = orders.reduce((sum, order) => sum + orderTotal(order), 0);
  $("#shippingSummary").innerHTML = [
    ["ອໍເດີຕ້ອງຈັດສົ່ງ", `${orders.filter(o => o.status === "preparing").length} ອໍເດີ`, orders.some(o => o.status === "preparing")],
    ["ກຳລັງຈັດສົ່ງ", `${orders.filter(o => o.status === "shipping").length} ອໍເດີ`, false],
    ["ສິນຄ້າລວມ", `${pieces} ຊິ້ນ`, false],
    ["ມູນຄ່າລວມ", money(value), false]
  ].map(([label, v, alert]) => `<div class="summary-card${alert ? " alert" : ""}"><span>${label}</span><strong>${v}</strong></div>`).join("");

  // ສະຫຼຸບວ່າຕ້ອງຫໍ່ສິນຄ້າຫຍັງແດ່ ລວມກີ່ຊິ້ນ
  const items = new Map();
  orders.forEach(order => order.items.forEach(item => {
    const key = String(item.productId);
    if (!items.has(key)) items.set(key, { name: item.name, qty: 0 });
    items.get(key).qty += item.quantity;
  }));
  $("#shippingGroups").innerHTML = items.size
    ? [...items.values()].sort((a, b) => b.qty - a.qty).map(row => `<span class="chip">${escapeHtml(row.name)} <b>${row.qty}</b></span>`).join("")
    : "";

  $("#shippingList").innerHTML = orders.length ? orders.map(orderCard).join("")
    : `<div class="empty-state"><h3>ຍັງບໍ່ມີອໍເດີທີ່ຕ້ອງຈັດສົ່ງ</h3><p>ອໍເດີທີ່ຮັບແລ້ວ ແລະ ມີສະຕັອກ ຈະມາລວມຢູ່ນີ້</p></div>`;
  setBadge("#shippingBadge", orders.filter(o => o.status === "preparing").length);
}
let pendingCategoryImage = null;
let catMgrPath = [];   // ເສັ້ນທາງໃນຕົວຈັດການໝວດສິນຄ້າ

function renderCategoriesManager() {
  const listBox = $("#catMgrList"), crumbBox = $("#catMgrCrumb");
  if (!listBox) return;
  const currentId = catMgrPath.length ? catMgrPath[catMgrPath.length - 1] : null;
  const current = currentId ? catById(currentId) : null;
  if (currentId && !current) { catMgrPath = []; return renderCategoriesManager(); }

  // ເສັ້ນທາງ
  const crumb = [`<button type="button" class="crumb-btn" data-catmgr-goto="root">ໝວດໃຫຍ່ທັງໝົດ</button>`];
  catMgrPath.forEach((id, i) => {
    const cat = catById(id); if (!cat) return;
    crumb.push(`<i>›</i>` + (i === catMgrPath.length - 1
      ? `<span>${escapeHtml(cat.name)}</span>`
      : `<button type="button" class="crumb-btn" data-catmgr-goto="${cat.id}">${escapeHtml(cat.name)}</button>`));
  });
  crumbBox.innerHTML = crumb.join("");

  // ບອກວ່າກຳລັງຈະເພີ່ມໃສ່ໃສ
  const whereEl = $("#catMgrAddWhere");
  if (whereEl) whereEl.innerHTML = current
    ? `ເພີ່ມເຂົ້າໃນ <b>${escapeHtml(categoryPath(current.id).map(c => c.name).join(" › "))}</b>`
    : `ເພີ່ມເປັນ <b>ໝວດໃຫຍ່ໃໝ່</b>`;
  $("#catMgrIconWrap")?.classList.toggle("hidden", !!current);

  const kids = childrenOf(currentId);
  listBox.innerHTML = kids.length ? kids.map(c => {
    const kidCount = childrenOf(c.id).length;
    const items = productCountIn(c.id);
    const isTop = c.parentId == null;
    // ທຸກຊັ້ນໃສ່ຮູບໄດ້ ບໍ່ແມ່ນສະເພາະໝວດໃຫຍ່ — ຮູບຈະໄປໂຜ່ໜ້າຮ້ານແທນໄອຄອນ
    return `<div class="cat-row">
      <button type="button" class="cat-row-main" data-catmgr-open="${c.id}">
        <span class="node-art${c.image ? " has-img" : ""}">${c.image ? `<img src="${escapeHtml(c.image)}" alt="">` : escapeHtml(c.icon || "📦")}</span>
        <span class="pf-name">${escapeHtml(c.name)}</span>
        <span class="pf-meta">${kidCount ? `${kidCount} ລາຍການຍ່ອຍ · ` : ""}${items} ສິນຄ້າ</span>
        <span class="pf-go">›</span>
      </button>
      <span class="node-tools">
        <button type="button" class="img-btn" data-cat-image="${c.id}" title="ໃສ່ຮູບ / ປ່ຽນຮູບ">${c.image ? "🖼 ປ່ຽນຮູບ" : "🖼 ໃສ່ຮູບ"}</button>
        ${c.image ? `<button type="button" data-cat-unimage="${c.id}" title="ເອົາຮູບອອກ ກັບໄປໃຊ້ໄອຄອນ">🚫</button>` : ""}
        ${isTop ? `<button type="button" data-cat-icon="${c.id}" title="ປ່ຽນໄອຄອນ">😀</button>` : ""}
        <button type="button" data-cat-rename="${c.id}" title="ແກ້ໄຂຊື່">✎</button>
        <button type="button" class="danger" data-cat-delete="${c.id}" title="ລຶບ">×</button>
      </span>
    </div>`;
  }).join("") : `<p class="muted small-copy" style="padding:14px">ຍັງບໍ່ມີຫຍັງໃນຊັ້ນນີ້ — ກົດ “+ ເພີ່ມໃນຊັ້ນນີ້”</p>`;
}

function renderPaymentForm() { const form = $("#paymentForm"); form.accountName.value = data.payment.accountName || ""; form.accountNumber.value = data.payment.accountNumber || ""; $("#paymentPreview").innerHTML = data.payment.qrImage ? `<img src="${data.payment.qrImage}" alt="QR ປະຈຸບບັນ">` : `<span class="input-hint">ຍັງບໍ່ໄດ້ອັບໂຫຼດ QR Code</span>`; }
function renderShopProfile() {
  const profile = data.profile;
  $("#shopNameLabel").textContent = profile.shopName;
  $("#shopTaglineLabel").textContent = profile.tagline;
  $("#footerShopName").textContent = profile.shopName;
  $("#footerShopTagline").textContent = profile.tagline;
  $("#brandMark").innerHTML = profile.logo ? `<img src="${profile.logo}" alt="${escapeHtml(profile.shopName)}">` : escapeHtml((profile.shopName || "P").trim().charAt(0).toUpperCase() || "P");
}
function renderShopProfileForm() {
  const form = $("#shopProfileForm"); const profile = data.profile;
  form.shopName.value = profile.shopName || ""; form.tagline.value = profile.tagline || ""; form.ownerName.value = profile.ownerName || ""; form.phone.value = profile.phone || "";
  $("#profilePreview").innerHTML = profile.logo ? `<img src="${profile.logo}" alt="${escapeHtml(profile.shopName)}">` : `<span>${escapeHtml((profile.shopName || "P").trim().charAt(0).toUpperCase() || "P")}</span>`;
}
function switchManagerTab(tab) { $$(".manager-tab").forEach(button => button.classList.toggle("active", button.dataset.managerTab === tab)); $$(".manager-pane").forEach(pane => pane.classList.toggle("hidden", pane.dataset.pane !== tab)); if (tab === "dashboard") renderDashboard(); if (tab === "orders") renderOrders(); if (tab === "restock") renderRestock(); if (tab === "shipping") renderShipping(); if (tab === "slips") renderSlips(); if (tab === "products") { renderProductCategories(); renderManagerProducts(); } if (tab === "categories") renderCategoriesManager(); if (tab === "payment") renderPaymentForm(); if (tab === "financial") renderFinancials(); if (tab === "books") { refreshBooksAll(); renderBooks(); } if (tab === "profile") renderShopProfileForm(); }

function setPriceMode() {
  const mode = $("#priceMode").value;
  $("#markupField").classList.toggle("hidden", mode !== "markup");
  $("#fixedProfitField")?.classList.toggle("hidden", mode !== "fixed");
  $("#sellPriceField").classList.toggle("hidden", mode !== "manual");
  updatePricePreview();
}

// ຢວນ × ເລດ + ຄ່າຂົນສົ່ງ = ຕົ້ນທຶນລວມ (ຕື່ມໃສ່ຊ່ອງຕົ້ນທຶນໃຫ້ອັດຕະໂນມັດ)
function recalcCostFromYuan(force = false) {
  const yuanBox = $("#yuanInput"), costBox = $("#costInput"), shipBox = $("#shipInput");
  if (!yuanBox || !costBox) return;
  const yuan = Number(yuanBox.value || 0);
  const rate = Number(priceRule.yuanRate || 0);
  const ship = Number(shipBox?.value || 0);
  const hint = $("#yuanHint"), brk = $("#costBreakdown");
  if (hint) hint.textContent = rate ? `ເລດປັດຈຸບັນ 1 ¥ = ${money(rate)}` : "ຍັງບໍ່ໄດ້ຕັ້ງເລດຢວນ — ໄປຕັ້ງທີ່ 💱 ຂ້າງເທິງ";
  // ພິມຢວນມາ = ຄິດຕົ້ນທຶນໃຫ້ໃໝ່ · ບໍ່ໄດ້ພິມຢວນ = ປ່ອຍໃຫ້ພິມຕົ້ນທຶນເປັນກີບເອງ
  if (yuan > 0 && rate > 0) {
    const total = Math.round((yuan * rate + ship) / 1000) * 1000;
    costBox.value = total;
    if (brk) brk.textContent = `${yuan} ¥ × ${money(rate)} = ${money(Math.round(yuan * rate))}${ship ? ` + ຂົນສົ່ງ ${money(ship)}` : ""} → ${money(total)}`;
  } else if (force || yuan <= 0) {
    if (brk) brk.textContent = "ພິມລາຄາຢວນຂ້າງເທິງ ຫຼື ພິມຕົ້ນທຶນເປັນກີບໃສ່ຊ່ອງນີ້ໂດຍກົງ";
  }
  updatePricePreview();
}

function updatePricePreview() {
  const cost = Number($("#costInput").value || 0);
  const mode = $("#priceMode").value;
  const markup = Number($("#markupInput").value || 0);
  const fixed = Number($("#fixedProfitInput")?.value || 0);
  let rawPrice;
  if (mode === "markup") rawPrice = Math.round(cost * (1 + markup / 100) / 1000) * 1000;
  else if (mode === "fixed") rawPrice = Math.round((cost + fixed) / 1000) * 1000;
  else rawPrice = Number($("#sellPriceInput").value || 0);
  const price = Math.max(0, rawPrice);
  $("#calculatedPrice").textContent = money(price);
  const profit = price - cost;
  const yuan = Number($("#yuanInput")?.value || 0);
  $("#profitPreview").textContent = `ກຳໄລ ${money(profit)} / ຊິ້ນ${cost ? ` (${Math.round((profit / cost) * 100)}%)` : ""}`
    + (yuan > 0 ? ` · ຕົ້ນທຶນ ${yuan} ¥` : "");
  return price;
}
let imageColorMap = [];   // ສີຂອງແຕ່ລະຮູບໃນຟອມ

// ແຖບຕົວຢ່າງຮູບ ພ້ອມຊ່ອງເລືອກສີຂອງແຕ່ລະຮູບ
function renderPreviewStrip(existingUrls) {
  const box = $("#productImagePreview"); if (!box) return;
  const urls = existingUrls || previewUrls;
  const many = urls.length > 1;
  box.innerHTML = `<div class="preview-strip">${urls.map((u, i) => `
    <figure>
      <img src="${escapeHtml(u)}" alt="ຮູບທີ ${i + 1}"><figcaption>${i + 1}</figcaption>
      ${many ? `<select data-img-color="${i}" class="img-color-select" title="ສີຂອງຮູບນີ້">
        <option value="">— ເລືອກສີ —</option>
        ${colorOptions.map(c => `<option value="${escapeHtml(c.name)}" ${imageColorMap[i] === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      </select>` : ""}
    </figure>`).join("")}</div>
    <p class="muted small-copy" style="width:100%;margin:9px 0 0">${many
      ? "ຫຼາຍຮູບ — ເລືອກ 1 ສີ ໃຫ້ແຕ່ລະຮູບ · ລູກຄ້າກົດຮູບ → ເລືອກສີໃຫ້ເອງ ກົດສີ → ສະຫຼັບຮູບໃຫ້ເອງ"
      : "ຮູບດຽວ — ເລືອກສີໄດ້ຫຼາຍສີ ຢູ່ກ່ອງ “ສີຂອງສິນຄ້ານີ້” ຂ້າງລຸ່ມ"}</p>`;
  renderProductColorPicker();
}

function setImagePreview(html) {
  previewUrls.forEach(u => URL.revokeObjectURL(u)); previewUrls = []; imageColorMap = [];
  $("#productImagePreview").innerHTML = html;
  $("#multiModeBox")?.classList.add("hidden");
}
function openProductForm(product = null) {
  editingProductId = product?.id ?? null; const form = $("#productForm"); form.reset(); renderProductCategories();
  selectedModels = new Set(product ? productModelIds(product) : []);
  pickedColors = new Set(product ? productColors(product) : []);
  renderProductColorPicker();
  if ($("#modelSearch")) $("#modelSearch").value = "";
  pickerPath = []; catPickerPath = []; $("#catPickerPanel")?.classList.add("hidden");
  renderModelList();
  $("#productFormTitle").textContent = product ? "ແກ້ໄຂສິນຄ້າ" : "ເພີ່ມສິນຄ້າໃໝ່";
  if (product) {
    form.productId.value = product.id; form.name.value = product.name; form.categoryId.value = product.categoryId || "";
    form.saleMode.value = product.saleMode || "inStock"; form.stock.value = product.stock; form.description.value = product.description || "";
    form.supplierUrl.value = product.supplierUrl || ""; form.cost.value = product.cost; form.priceMode.value = "manual"; form.sellPrice.value = product.price;
    if (form.yuanPrice) form.yuanPrice.value = product.yuanPrice || "";
    if (form.shipCost) form.shipCost.value = product.shipCost ?? "";
    pickedColors = new Set(productColors(product));
    const existing = productImages(product);
    previewUrls.forEach(u => URL.revokeObjectURL(u)); previewUrls = [];
    imageColorMap = productImageColors(product);
    if (existing.length) renderPreviewStrip(existing);
    else $("#productImagePreview").innerHTML = `<span class="input-hint">ສິນຄ້ານີ້ຍັງບໍ່ມີຮູບ</span>`;
  } else {
    form.saleMode.value = "onDemand"; form.stock.value = 0;
    if (form.yuanPrice) form.yuanPrice.value = "";
    if (form.shipCost) form.shipCost.value = priceRule.shipCost || "";
    // ໃຊ້ສູດກຳໄລຂອງຮ້ານເປັນຄ່າຕັ້ງຕົ້ນ
    if ((priceRule.profitMode || "percent") === "fixed") {
      form.priceMode.value = "fixed";
      if (form.fixedProfit) form.fixedProfit.value = priceRule.profitValue || 0;
      form.markup.value = 20;
    } else {
      form.priceMode.value = "markup"; form.markup.value = priceRule.profitValue || 20;
    }
    setImagePreview(`<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກຮູບ</span>`);
  }
  setPriceMode(); recalcCostFromYuan(true); $("#productFormWrap").classList.remove("hidden"); $("#productFormWrap").scrollIntoView({ behavior: "smooth", block: "start" });
}
// ---------- ລາຍການຕິກເລືອກລຸ້ນ ----------

let pickerPath = [];   // ເສັ້ນທາງທີ່ກຳລັງເປີດຢູ່ໃນລາຍການເລືອກລຸ້ນ
let modelPasteOpen = false;   // ກ່ອງ "ວາງລາຍຊື່ລຸ້ນ" ເປີດຢູ່ ຫຼື ບໍ່

// ຕັດຂໍ້ຄວາມທີ່ວາງມາ ອອກເປັນຊື່ລຸ້ນ
// ຂັ້ນດ້ວຍ: ຂຶ້ນແຖວໃໝ່ · ຈຸດ (.) · ຈຸດເມັດ (• ·) · ຈຸດພາກ (,) · ເຊມິໂຄລອນ · ແທັບ
// ບໍ່ຂັ້ນດ້ວຍ "ຊ່ອງວ່າງ" — ເພາະ "A15 5G" ຄືລຸ້ນດຽວ ບໍ່ແມ່ນສອງລຸ້ນ
function splitModelText(text) {
  return String(text || "")
    .split(/[\n\r\t.,;|•·]+/)
    .map(t => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ນັບລຸ້ນ (ໃບ) ທັງໝົດພາຍໃຕ້ໝວດໜຶ່ງ
// ---- ວາງລາຍຊື່ລຸ້ນ: ມີແລ້ວ→ຕິກໃຫ້ · ຍັງບໍ່ມີ→ເພີ່ມເຂົ້າໝວດນີ້ແລ້ວຕິກໃຫ້ ----
async function applyModelPaste(button) {
  const currentId = pickerPath.length ? Number(pickerPath[pickerPath.length - 1]) : null;
  const result = $("#modelPasteResult");
  if (currentId == null) return toast("ເປີດເຂົ້າໝວດກ່ອນ ເຊັ່ນ Android › Oppo");
  const names = splitModelText($("#modelPasteInput")?.value);
  if (!names.length) return toast("ຍັງບໍ່ໄດ້ວາງລາຍຊື່ລຸ້ນ");

  // ຂອງທີ່ມີຢູ່ແລ້ວໃນໝວດນີ້ (ນັບທຸກຊັ້ນຍ່ອຍ) — ທຽບແບບບໍ່ສົນຊ່ອງວ່າງ/ຕົວພິມ
  const pool = new Map();
  leavesUnder(currentId).forEach(m => pool.set(normModel(m.name), m));
  childrenOf(currentId).forEach(m => { if (!pool.has(normModel(m.name))) pool.set(normModel(m.name), m); });

  const matched = [], toAdd = [], seen = new Set();
  names.forEach(name => {
    const key = normModel(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const hit = pool.get(key);
    if (hit) matched.push(hit); else toAdd.push(name);
  });

  let added = [];
  if (toAdd.length) {
    if (button) button.disabled = true;
    const base = (childrenOf(currentId).length + 1) * 10;
    const rows = toAdd.map((name, i) => ({ name, parentId: currentId, icon: "", sort: base + (i + 1) * 10 }));
    try {
      const { data: inserted, error } = await supabase.from("categories").insert(rows).select();
      if (error) throw error;
      added = inserted || [];
      await refreshCategories();
    } catch (error) {
      if (button) button.disabled = false;
      result.innerHTML = `<span class="miss">ເພີ່ມລຸ້ນໃໝ່ບໍ່ໄດ້: ${escapeHtml(error.message || "")}</span>`;
      return toast("ເພີ່ມລຸ້ນໃໝ່ບໍ່ໄດ້");
    }
    if (button) button.disabled = false;
  }

  [...matched, ...added].forEach(m => { if (m?.id != null) selectedModels.add(String(m.id)); });
  $("#modelPasteInput").value = "";
  renderModelList();
  const r = $("#modelPasteResult");
  if (r) r.innerHTML = [
    matched.length ? `<span class="ok">ຕິກໃຫ້ແລ້ວ ${matched.length} ລຸ້ນ (ມີຢູ່ກ່ອນ)</span>` : "",
    added.length ? `<span class="ok">ເພີ່ມໃໝ່ ${added.length} ລຸ້ນ ແລະ ຕິກໃຫ້ແລ້ວ: ${added.map(a => escapeHtml(a.name)).join(" · ")}</span>` : ""
  ].filter(Boolean).join("<br>");
  toast(`ຕິກໃຫ້ ${matched.length + added.length} ລຸ້ນ${added.length ? ` · ເພີ່ມໃໝ່ ${added.length}` : ""}`);
}

function leavesUnder(id) {
  const out = [];
  const walk = (pid) => childrenOf(pid).forEach(c => {
    const kids = childrenOf(c.id);
    if (kids.length) walk(c.id); else out.push(c);
  });
  walk(id);
  return out;
}

function renderModelList() {
  const box = $("#modelList"); if (!box) return;
  const query = normModel($("#modelSearch")?.value || "");

  // ---- ໂໝດຄົ້ນຫາ: ຫາທົ່ວທຸກຊັ້ນ ບໍ່ສົນເສັ້ນທາງ ----
  if (query) {
    const hits = [];
    childrenOf(null).forEach(l1 => leavesUnder(l1.id).forEach(m => {
      if (normModel(m.name).includes(query)) hits.push({ ...m, path: categoryPath(m.id).slice(0, -1).map(c => c.name).join(" › ") });
    }));
    box.innerHTML = hits.length ? `<div class="model-group"><div class="model-group-head"><b>ຜົນຄົ້ນຫາ ${hits.length} ລຸ້ນ</b>
        <span class="head-tools"><button type="button" class="small-button" data-model-all="${hits.map(h => h.id).join(",")}">ເລືອກໝົດ</button></span></div>
      <div class="model-options">${hits.slice(0, 200).map(m => `
        <label class="model-chip${selectedModels.has(String(m.id)) ? " on" : ""}" title="${escapeHtml(m.path)}">
          <input type="checkbox" data-model-id="${m.id}" ${selectedModels.has(String(m.id)) ? "checked" : ""}>
          <span>${escapeHtml(m.name)}<small>${escapeHtml(m.path)}</small></span>
        </label>`).join("")}</div></div>`
      : `<p class="muted small-copy" style="padding:12px">ບໍ່ພົບລຸ້ນ “${escapeHtml($("#modelSearch").value)}” — ໄປເພີ່ມທີ່ແທັບ “ໝວດສິນຄ້າ”</p>`;
    $("#modelCount").textContent = selectedModels.size;
      return;
  }

  // ---- ໂໝດເປີດເປັນຊັ້ນ ----
  const currentId = pickerPath.length ? pickerPath[pickerPath.length - 1] : null;
  const kids = childrenOf(currentId);
  // ຊັ້ນ 1-2 (ໝວດໃຫຍ່ / ກຸ່ມ ເຊັ່ນ iPhone·Android) ຖືເປັນໂຟນເດີສະເໝີ
  // ເຖິງແມ່ນຍັງບໍ່ມີລຸ້ນຢູ່ຂ້າງໃນ ຈະໄດ້ກົດເຂົ້າໄປເພີ່ມໄດ້
  const isFolder = (c) => childrenOf(c.id).length > 0 || categoryPath(c.id).length <= 2;
  const branches = kids.filter(isFolder);
  const leaves   = kids.filter(c => !isFolder(c));

  // ເສັ້ນທາງ
  const crumb = [`<button type="button" class="crumb-btn" data-picker-goto="root">ທັງໝົດ</button>`];
  pickerPath.forEach((id, i) => {
    const cat = catById(id); if (!cat) return;
    crumb.push(`<i>›</i>` + (i === pickerPath.length - 1
      ? `<span>${escapeHtml(cat.name)}</span>`
      : `<button type="button" class="crumb-btn" data-picker-goto="${cat.id}">${escapeHtml(cat.name)}</button>`));
  });

  const allLeaves = currentId ? leavesUnder(currentId) : [];
  const allOn = allLeaves.length && allLeaves.every(m => selectedModels.has(String(m.id)));

  box.innerHTML = `
    <div class="picker-bar">
      <div class="picker-crumb">${crumb.join("")}</div>
      <div class="picker-actions">
        ${currentId ? `<button type="button" class="small-button" data-model-all="${allLeaves.map(m => m.id).join(",")}">${allOn ? "ເອົາອອກໝົດ" : `ເລືອກໝົດ (${allLeaves.length})`}</button>` : ""}
        ${currentId ? `<button type="button" class="small-button" id="modelPasteToggle">📋 ວາງລາຍຊື່ລຸ້ນ</button>` : ""}
      </div>
    </div>
    ${currentId ? `<div id="modelPasteBox" class="paste-box${modelPasteOpen ? "" : " hidden"}">
      <p class="add-here">ວາງລາຍຊື່ລຸ້ນລົງໃນ <b>${escapeHtml(catById(currentId)?.name || "")}</b> — ມີແລ້ວຈະ<b>ຕິກໃຫ້</b> · ຍັງບໍ່ມີຈະ<b>ເພີ່ມໃຫ້ ແລ້ວຕິກໃຫ້</b></p>
      <textarea id="modelPasteInput" rows="4" placeholder="ຂຶ້ນແຖວໃໝ່ 1 ລຸ້ນ (ວາງຈາກ Excel ໄດ້ເລີຍ) ຫຼື ຂັ້ນດ້ວຍ ຈຸດ (.) · ຈຸດເມັດ (•)&#10;ຕົວຢ່າງ:&#10;A5&#10;A5 5G&#10;A16"></textarea>
      <div class="paste-actions">
        <button type="button" class="primary-button" id="modelPasteApply">✓ ກວດ ແລະ ຕິກໃຫ້</button>
        <button type="button" class="secondary-button" id="modelPasteCancel">ຍົກເລີກ</button>
      </div>
      <p id="modelPasteResult" class="paste-result"></p>
    </div>` : ""}
    ${branches.length ? `<div class="picker-folders">${branches.map(c => {
      const n = leavesUnder(c.id).length;
      const picked = leavesUnder(c.id).filter(m => selectedModels.has(String(m.id))).length;
      return `<button type="button" class="picker-folder" data-picker-open="${c.id}">
        <span class="pf-name">${escapeHtml(c.name)}</span>
        <span class="pf-meta">${n} ລຸ້ນ${picked ? ` · ຕິກແລ້ວ ${picked}` : ""}</span>
        <span class="pf-go">›</span></button>`;
    }).join("")}</div>` : ""}
    ${leaves.length ? `<div class="model-options">${leaves.map(m => `
      <label class="model-chip${selectedModels.has(String(m.id)) ? " on" : ""}">
        <input type="checkbox" data-model-id="${m.id}" ${selectedModels.has(String(m.id)) ? "checked" : ""}>
        <span>${escapeHtml(m.name)}</span>
      </label>`).join("")}</div>` : ""}
    ${!branches.length && !leaves.length ? `<p class="muted small-copy" style="padding:12px">ຍັງບໍ່ມີລຸ້ນໃນນີ້ — ໄປເພີ່ມທີ່ແທັບ “ໝວດສິນຄ້າ”</p>` : ""}`;

  $("#modelCount").textContent = selectedModels.size;
}

function closeProductForm() { $("#productFormWrap").classList.add("hidden"); editingProductId = null; setImagePreview(`<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກຮູບ</span>`); }

// ---------- 5) Database / Storage / Auth ----------

// ຄຳຂໍທີ່ມີກຳນົດເວລາ — ຖ້າຊ້າເກີນ 12 ວິນາທີ ໃຫ້ເລີກລໍ ແລະ ບອກຜູ້ໃຊ້
function withTimeout(promise, ms = 12000, label = "") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`ໝົດເວລາລໍຖ້າ${label ? " (" + label + ")" : ""}`)), ms))
  ]);
}
let lastFetchOk = true;
async function fetchTable(table, orderCol) {
  let query = supabase.from(table).select("*");
  if (orderCol) query = query.order(orderCol, { ascending: false });
  try {
    const { data: rows, error } = await withTimeout(query, 12000, table);
    if (error) { console.error(table, error); lastFetchOk = false; showLoadError(error.message); return []; }
    lastFetchOk = true;
    return rows;
  } catch (err) {
    console.error(table, err); lastFetchOk = false; showLoadError(err.message); return [];
  }
}
// ບອກຜູ້ໃຊ້ຢ່າງຊັດເຈນ ຖ້າໂຫລດຂໍ້ມູນບໍ່ໄດ້ (ບໍ່ໃຫ້ນັ່ງເບິ່ງໜ້າຈໍໝຸນຢູ່ຊື່ໆ)
let loadErrorShown = false;
function showLoadError(message) {
  firstLoadDone = true;
  if (loadErrorShown) return;
  loadErrorShown = true;
  const grid = $("#productGrid");
  if (grid) grid.innerHTML = `<div class="load-error">
      <h3>ໂຫລດສິນຄ້າບໍ່ໄດ້</h3>
      <p>ອິນເຕີເນັດອາດຊ້າ ຫຼື ຖານຂໍ້ມູນຢຸດພັກຢູ່. ລອງໂຫລດໜ້ານີ້ໃໝ່ອີກເທື່ອ.</p>
      <button class="primary-button" type="button" onclick="location.reload()">ໂຫລດໃໝ່</button>
      <small>${escapeHtml(message || "")}</small>
    </div>`;
  $("#emptyProducts")?.classList.add("hidden");
}
async function refreshCategories() { data.categories = await fetchTable("categories"); invalidateCategoryIndex(); renderAll(); }
async function refreshProducts() {
  data.products = await fetchTable("products");
  invalidateCategoryIndex();
  if (lastFetchOk) { firstLoadDone = true; loadErrorShown = false; }
  renderAll();
}
async function refreshOrders() {
  data.orders = await fetchTable("orders", "createdAt");
  renderAll();
  refreshBadges();
}
// ປ້າຍເລກແດງ = ວຽກທີ່ "ຕ້ອງລົງມືເຮັດ" ເທົ່ານັ້ນ
//   ອໍເດີ        → new       (ຕ້ອງກົດຮັບອໍເດີ)
//   ຕ້ອງສັ່ງສິນຄ້າ → needOrder (ຕ້ອງໄປສັ່ງຈາກຮ້ານຕົ້ນທາງ)
//   ຕ້ອງຈັດສົ່ງ   → preparing (ຕ້ອງຫໍ່ ແລະ ສົ່ງໃຫ້ລູກຄ້າ)
//   ordering / shipping / complete / cancelled = ບໍ່ຕ້ອງເຕືອນ (ລໍຖ້າ ຫຼື ຈົບແລ້ວ)
function refreshBadges() {
  const count = (st) => data.orders.filter(o => o.status === st).length;
  setBadge("#orderBadge", count("new"));
  setBadge("#restockBadge", restockAggregate(["needOrder"]).length);
  setBadge("#shippingBadge", count("preparing"));
  setBadge("#slipBadge", data.orders.filter(o => o.receipt && o.status === "new").length);
  setBadge("#booksBadge", salaryDueList().length);   // ຮອດກຳນົດຈ່າຍເງິນເດືອນ
}
async function refreshExpenses() { data.expenses = await fetchTable("expenses"); renderFinancials(); }
async function refreshLedger()    { data.ledger    = await fetchTable("ledger");    renderBooks(); renderDashboard(); }
async function refreshAssets()    { data.assets    = await fetchTable("assets");    renderBooks(); }
async function refreshEmployees() { data.employees = await fetchTable("employees"); renderBooks(); refreshBadges(); }
async function refreshDebts()     { data.debts     = await fetchTable("debts");     renderBooks(); }
async function refreshBooksAll()  { await Promise.all([refreshLedger(), refreshAssets(), refreshEmployees(), refreshDebts()]); }
function renderPriceRule() {
  const rate = $("#ruleYuanRate"); if (!rate) return;
  rate.value = priceRule.yuanRate || "";
  $("#ruleShipCost").value = priceRule.shipCost || "";
  $("#ruleProfitMode").value = priceRule.profitMode || "percent";
  $("#ruleProfitValue").value = priceRule.profitValue ?? "";
  const pct = (priceRule.profitMode || "percent") === "percent";
  $("#ruleProfitHint").textContent = pct ? "ຕົວຢ່າງ: 20 = ບວກ 20%" : "ຕົວຢ່າງ: 20000 = ບວກ 20,000 ₭";
  $("#priceRuleSummary").textContent = priceRule.yuanRate
    ? `(1 ¥ = ${money(priceRule.yuanRate)} · ຂົນສົ່ງ ${money(priceRule.shipCost || 0)} · ກຳໄລ ${pct ? `${priceRule.profitValue || 0}%` : money(priceRule.profitValue || 0)})`
    : "(ຍັງບໍ່ໄດ້ຕັ້ງ)";
  // ຕົວຢ່າງໃຫ້ເຫັນພາບ: ຢວນ 50
  const rateN = Number(priceRule.yuanRate || 0), ship = Number(priceRule.shipCost || 0);
  if (rateN > 0) {
    const cost = 50 * rateN + ship;
    const sell = pct ? cost * (1 + Number(priceRule.profitValue || 0) / 100) : cost + Number(priceRule.profitValue || 0);
    $("#ruleExample").textContent = `ຕົວຢ່າງ: 50 ¥ → ຕົ້ນທຶນ ${money(Math.round(cost))} → ຂາຍ ${money(Math.round(sell / 1000) * 1000)}`;
  } else { $("#ruleExample").textContent = ""; }
}

async function savePriceRule() {
  const next = {
    yuanRate: Number($("#ruleYuanRate").value || 0),
    shipCost: Number($("#ruleShipCost").value || 0),
    profitMode: $("#ruleProfitMode").value === "fixed" ? "fixed" : "percent",
    profitValue: Number($("#ruleProfitValue").value || 0)
  };
  const old = { ...priceRule };
  const { error } = await supabase.from("settings").update({ pricing: next }).eq("id", "store");
  if (error) { console.error(error); toast("ບັນທຶກສູດບໍ່ໄດ້: " + (error.message || "")); showRuleSaved("ບັນທຶກບໍ່ໄດ້", false); return false; }
  priceRule = next; renderPriceRule();
  showRuleSaved("ບັນທຶກສູດລາຄາແລ້ວ", true);
  toast("✓ ບັນທຶກສູດລາຄາແລ້ວ");
  // ເລດ ຫຼື ຄ່າຂົນສົ່ງ ປ່ຽນ → ຖາມວ່າຈະໄລ່ລາຄາສິນຄ້າທີ່ຕັ້ງເປັນຢວນໃໝ່ໝົດບໍ
  if (old.yuanRate !== next.yuanRate || old.profitMode !== next.profitMode || old.profitValue !== next.profitValue) {
    await repriceYuanProducts(old, next);
  }
  return true;
}

// ປ້າຍ "ບັນທຶກແລ້ວ" ໃຫ້ເຫັນຊັດຢູ່ຂ້າງປຸ່ມ
function showRuleSaved(text, good = true) {
  const box = $("#ruleSaved"); if (!box) return;
  box.textContent = (good ? "✓ " : "✕ ") + text;
  box.className = `save-flag ${good ? "ok" : "bad"}`;
  box.classList.remove("hidden");
  clearTimeout(showRuleSaved._t);
  showRuleSaved._t = setTimeout(() => box.classList.add("hidden"), 4000);
}

// ຄິດລາຄາຂາຍຈາກຕົ້ນທຶນ ຕາມສູດກຳໄລຂອງຮ້ານ
function priceFromCost(cost, rule = priceRule) {
  const c = Number(cost || 0);
  const v = Number(rule.profitValue || 0);
  const raw = (rule.profitMode === "fixed") ? c + v : c * (1 + v / 100);
  return Math.max(0, Math.round(raw / 1000) * 1000);
}

// ---- ປ່ຽນເລດຢວນ → ໄລ່ລາຄາສິນຄ້າທີ່ຕັ້ງເປັນຢວນໃໝ່ທັງໝົດ ----
async function repriceYuanProducts(oldRule, newRule) {
  const list = data.products.filter(p => Number(p.yuanPrice || 0) > 0);
  if (!list.length) return;
  const plan = list.map(p => {
    const yuan = Number(p.yuanPrice || 0);
    const ship = Number(p.shipCost ?? newRule.shipCost ?? 0);
    const cost = Math.round((yuan * Number(newRule.yuanRate || 0) + ship) / 1000) * 1000;
    return { p, cost, price: priceFromCost(cost, newRule) };
  }).filter(x => x.cost !== Number(x.p.cost) || x.price !== Number(x.p.price));
  if (!plan.length) { toast("ລາຄາສິນຄ້າຢວນ ຖືກຕ້ອງຢູ່ແລ້ວ ບໍ່ຕ້ອງແກ້"); return; }

  const sample = plan.slice(0, 5).map(x =>
    `• ${x.p.name}\n   ${money(x.p.price)} → ${money(x.price)}  (${x.p.yuanPrice} ¥)`).join("\n");
  const rateLine = oldRule.yuanRate !== newRule.yuanRate
    ? `ເລດ 1 ¥ : ${money(oldRule.yuanRate)} → ${money(newRule.yuanRate)}\n\n` : "";
  if (!confirm(`${rateLine}ມີສິນຄ້າທີ່ຕັ້ງລາຄາເປັນຢວນ ${plan.length} ລາຍການ\nຢາກໃຫ້ໄລ່ລາຄາໃໝ່ໃຫ້ໝົດເລີຍບໍ?\n\n${sample}${plan.length > 5 ? `\n\n…ແລະ ອີກ ${plan.length - 5} ລາຍການ` : ""}\n\nOK = ໄລ່ໃໝ່ໃຫ້ໝົດ\nCancel = ປ່ຽນແຕ່ສູດ ລາຄາເກົ່າຄືເດີມ`)) {
    toast("ບັນທຶກສູດແລ້ວ · ລາຄາສິນຄ້າຍັງເປັນຄ່າເກົ່າ");
    return;
  }
  toast(`ກຳລັງໄລ່ລາຄາໃໝ່ ${plan.length} ລາຍການ...`);
  let done = 0, failed = 0;
  for (const x of plan) {
    const { error } = await supabase.from("products")
      .update({ cost: x.cost, price: x.price, shipCost: Number(x.p.shipCost ?? newRule.shipCost ?? 0) })
      .eq("id", x.p.id);
    if (error) { console.error(error); failed++; } else done++;
  }
  await refreshProducts();
  showRuleSaved(`ໄລ່ລາຄາໃໝ່ ${done} ລາຍການແລ້ວ`, !failed);
  toast(failed ? `ໄລ່ໃໝ່ ${done} ລາຍການ · ຜິດພາດ ${failed}` : `✓ ໄລ່ລາຄາໃໝ່ຄົບ ${done} ລາຍການແລ້ວ`);
}

async function refreshSettings() {
  const { data: row, error } = await supabase.from("settings").select("*").eq("id", "store").maybeSingle();
  if (error) console.error("settings:", error);
  data.profile = { ...defaultProfile, ...(row?.profile || {}) };
  data.payment = { ...defaultPayment, ...(row?.payment || {}) };
  couriers = Array.isArray(row?.couriers) ? row.couriers.filter(Boolean) : [];
  colorOptions = Array.isArray(row?.colorOptions) ? row.colorOptions.filter(c => c && c.name) : [];
  priceRule = { ...defaultPriceRule, ...(row?.pricing || {}) };
  renderPriceRule();
  renderCourierList(); renderCourierSelect(); renderColorSet(); renderProductColorPicker();
  renderShopProfile(); renderShopProfileForm(); renderPaymentForm(); renderPaymentDetails();
}
function renderAll() {
  renderCustomerShop(); renderCart();
  renderDashboard(); renderOrders(); renderRestock(); renderShipping(); renderSlips(); renderManagerProducts(); renderCategoriesManager(); renderProductCategories(); renderFinancials(); renderBooks();
}
// ກວດເບິ່ງວ່າຕິດຕໍ່ຖານຂໍ້ມູນໄດ້ບໍ ຕອນເປີດເວັບ — ຖ້າບໍ່ໄດ້ ໃຫ້ບອກຜູ້ໃຊ້ທັນທີ
async function checkConnection() {
  try {
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (error) { console.error("connection check:", error); toast(`ຕິດຕໍ່ຖານຂໍ້ມູນບໍ່ໄດ້: ${error.message}`); }
  } catch (err) {
    console.error("connection check exception:", err);
    toast("ຕິດຕໍ່ຖານຂໍ້ມູນບໍ່ໄດ້ — ກວດເບິ່ງອິນເຕີເນັດ ຫຼື ຄ່າໃນ supabase-config.js");
  }
}

function subscribeRealtime() {
  supabase.channel("public:categories").on("postgres_changes", { event: "*", schema: "public", table: "categories" }, refreshCategories).subscribe();
  supabase.channel("public:products").on("postgres_changes", { event: "*", schema: "public", table: "products" }, refreshProducts).subscribe();
  supabase.channel("public:orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refreshOrders).subscribe();
  supabase.channel("public:expenses").on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refreshExpenses).subscribe();
  supabase.channel("public:settings").on("postgres_changes", { event: "*", schema: "public", table: "settings" }, refreshSettings).subscribe();
}

// ອໍເດີໃໝ່ຈາກລູກຄ້າ (ບໍ່ຕ້ອງ login — ອະນຸຍາດ insert ໄດ້ໃນ RLS policy)
async function createOrderFromForm(form) {
  const lines = validCart(); if (!lines.length) return;
  const values = new FormData(form);
  const id = `OD-${String(Date.now()).slice(-7)}`;
  const method = values.get("deliveryMethod") || "pickup";
  const isShip = method === "ship";
  const payment = "transfer";   // ບັງຄັບໂອນເງິນກ່ອນທຸກເທື່ອ ບໍ່ວ່າຮັບເອງ ຫຼື ຈັດສົ່ງ

  if (isShip && couriers.length && !values.get("courier")) { toast("ກະລຸນາເລືອກບໍລິສັດຂົນສົ່ງ"); return; }

  const order = {
    id,
    status: "new",
    customer: {
      name: values.get("customerName"),
      phone: values.get("phone"),
      address: isShip ? (values.get("address") || "") : "",
      transportBranch: isShip ? (values.get("courier") || "") : "",
      deliveryMethod: method,
      note: values.get("note") || ""
    },
    paymentMethod: payment,
    receipt: "",
    items: lines.map(({ product, quantity, color, model }) => ({
      productId: product.id, name: product.name, model: model || "", color: color || "",
      price: product.price, cost: product.cost, quantity, supplierUrl: product.supplierUrl || ""
    }))
  };
  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  {
    // ຍັງບໍ່ບັນທຶກອໍເດີເທື່ອ — ຕ້ອງໂອນ ແລະ ສົ່ງໃບໂອນກ່ອນສະເໝີ
    pendingTransfer = { order, total };
    closeLayers();
    $("#transferOrderNo").innerHTML = `ຍອດທີ່ຕ້ອງໂອນ <b>${money(total)}</b> · ອໍເດີຈະຖືກບັນທຶກຫຼັງສົ່ງໃບໂອນ`;
    $("#transferQrBox").innerHTML = data.payment.qrImage
      ? `<img id="qrImageEl" src="${escapeHtml(data.payment.qrImage)}" alt="QR ໂອນເງິນ" crossorigin="anonymous">`
      : `<div class="muted">ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງ QR — ກະລຸນາຕິດຕໍ່ຮ້ານໂດຍກົງ</div>`;
    $("#transferAccount").textContent = [data.payment.accountName, data.payment.accountNumber].filter(Boolean).join(" · ") || "";
    $("#saveQrBtn").classList.toggle("hidden", !data.payment.qrImage);
    $("#slipPreview").innerHTML = `<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກໃບໂອນ</span>`;
    $("#slipInput").value = "";
    openLayer("#transferModal");
    return;
  }

}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  console.log("SL-Mobile app version", APP_VERSION);
  const vBox = $("#appVersion"); if (vBox) vBox.textContent = `ລຸ້ນ ${APP_VERSION}`;
  renderShopProfile(); renderCustomerShop(); renderCart();
  wireBooks();

  // ---- ໂຫລດຂໍ້ມູນຄັ້ງທຳອິດ ແລ້ວເປີດ realtime (ອັບເດດອັດຕະໂນມັດທຸກເຄື່ອງ) ----
  refreshCategories(); refreshProducts(); refreshOrders(); refreshExpenses(); refreshSettings();
  subscribeRealtime();
  checkConnection();

  // ---- ສະຖານະການ login ----
  supabase.auth.onAuthStateChange((event, session) => {
    managerUser = session?.user || null;
    if (managerUser) refreshBooksAll();   // ຂໍ້ມູນບັນຊີ ໂຫລດສະເພາະຜູ້ຈັດການທີ່ login ແລ້ວ
    if (!authReadyOnce) { authReadyOnce = true; if (managerUser) showManager(); }
  });

  $("#customerSearch").addEventListener("input", renderCustomerShop);
  $("#productDetailBody").addEventListener("input", event => {
    if (event.target.id !== "detailModelSearch") return;
    detailModelQuery = event.target.value;
    const pos = event.target.selectionStart;
    openProductDetail(detailState.productId, true);
    const again = $("#detailModelSearch");
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  $(".image-viewer-close").addEventListener("click", closeImageViewer);
  $("#imageViewer").addEventListener("click", event => { if (event.target.id === "imageViewer") closeImageViewer(); });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!$("#imageViewer").classList.contains("hidden")) closeImageViewer();
    else closeLayers();
  });
  $("#cartButton").addEventListener("click", () => openLayer("cart")); $(".close-drawer").addEventListener("click", closeLayers); $("#overlay").addEventListener("click", closeLayers); 
  // ໃຊ້ delegation ເພື່ອໃຫ້ປຸ່ມປິດທີ່ສ້າງຂຶ້ນພາຍຫຼັງ (ເຊັ່ນ ໃນໜ້າລາຍລະອຽດສິນຄ້າ) ໃຊ້ໄດ້ນຳ
  document.addEventListener("click", event => {
    if (event.target.closest(".modal-close")) return closeLayers();
    // ກົດພື້ນສີເຂັ້ມນອກກ່ອງ ກໍປິດໄດ້ (ທາງໜີສຳຮອງ ຖ້າກົດປຸ່ມ × ບໍ່ໄດ້)
    const modal = event.target.closest(".modal");
    if (modal && event.target === modal) closeLayers();
  });
  $("#cartItems").addEventListener("click", event => { const remove = event.target.closest("[data-cart-remove]"); const change = event.target.closest("[data-cart-change]"); if (remove) { const key = cartKey(remove.dataset.cartRemove, remove.dataset.color || "", remove.dataset.model || ""); cart = cart.filter(line => cartKey(line.productId, line.color, line.model) !== key); saveCart(); renderCart(); }
    if (change) changeCart(change.dataset.productId, Number(change.dataset.cartChange), change.dataset.color || "", change.dataset.model || ""); });
  $("#checkoutButton").addEventListener("click", () => { if (!cart.length) return; closeLayers(); renderCheckout(); $("#checkoutModal").classList.remove("hidden"); });
  $("#checkoutForm").addEventListener("submit", event => { event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; createOrderFromForm(event.currentTarget).catch(err => { console.error(err); toast("ສັ່ງຊື້ບໍ່ສຳເລັດ ລອງໃໝ່ພາຍຫຼັງ"); }).finally(() => { button.disabled = false; }); });

  $("#managerButton").addEventListener("click", () => isManager() ? showManager() : openLayer("#loginModal"));
  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = $("#loginError");
    const submitButton = form.querySelector("button[type=submit]");
    const originalLabel = submitButton.textContent;
    const showLoginError = (message) => { errorBox.textContent = message; errorBox.classList.remove("hidden"); };

    errorBox.classList.add("hidden");
    submitButton.disabled = true;
    submitButton.textContent = "ກຳລັງເຂົ້າສູ່ລະບົບ...";
    try {
      const fd = new FormData(form);
      const { error } = await supabase.auth.signInWithPassword({
        email: fd.get("email").trim(),
        password: fd.get("password")
      });
      if (error) {
        // ແປຂໍ້ຄວາມ error ໃຫ້ເຂົ້າໃຈງ່າຍ ແລະ ສະແດງເຫດຜົນຈິງໃຫ້ເຫັນເທິງໜ້າຈໍ
        const raw = (error.message || "").toLowerCase();
        if (raw.includes("invalid login credentials")) showLoginError("ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ");
        else if (raw.includes("email not confirmed")) showLoginError("ອີເມວນີ້ຍັງບໍ່ໄດ້ຢືນຢັນ — ໄປທີ່ Supabase > Authentication > Users ແລ້ວເປີດ Auto Confirm ໃຫ້ຜູ້ໃຊ້ນີ້");
        else if (raw.includes("failed to fetch") || raw.includes("network")) showLoginError("ຕິດຕໍ່ຖານຂໍ້ມູນບໍ່ໄດ້ — ກວດເບິ່ງອິນເຕີເນັດ ຫຼື ຄ່າໃນ supabase-config.js");
        else showLoginError(`ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ: ${error.message}`);
        console.error("login error:", error);
        return;
      }
      form.reset(); closeLayers(); showManager();
    } catch (err) {
      console.error("login exception:", err);
      showLoginError(`ເກີດຂໍ້ຜິດພາດ: ${err?.message || err}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
  $("#logoutButton").addEventListener("click", () => { supabase.auth.signOut().then(() => { showShop(); toast("ອອກຈາກລະບົບແລ້ວ"); }); });
  $("#backToShop").addEventListener("click", showShop);
  $$(".manager-tab").forEach(button => button.addEventListener("click", () => switchManagerTab(button.dataset.managerTab)));
  $("#managerOrderSearch").addEventListener("input", renderOrders); $("#orderFilters").addEventListener("click", event => { const button = event.target.closest("[data-order-filter]"); if (!button) return; activeOrderFilter = button.dataset.orderFilter; renderOrders(); });
  // ບັດອໍເດີສະແດງທັງໃນແທັບ "ອໍເດີ" ແລະ "ຕ້ອງຈັດສົ່ງ" —
  // ຈຶ່ງຜູກທີ່ເອກະສານທັງໜ້າ ເພື່ອໃຫ້ໃຊ້ໄດ້ທັງສອງບ່ອນ
  document.addEventListener("change", event => {
    const select = event.target.closest("[data-order-status]"); if (!select) return;
    select.disabled = true;
    supabase.from("orders").update({ status: select.value }).eq("id", select.dataset.orderStatus)
      .then(async ({ error }) => {
        if (error) { console.error(error); select.disabled = false; return toast(`ອັບເດດບໍ່ສຳເລັດ: ${error.message}`); }
        const id = select.dataset.orderStatus;
        const order = orderById(id);
        // ສຳເລັດ = ຮັບເງິນເຂົ້າ · ຖອຍອອກຈາກສຳເລັດ = ຖອນເງິນຄືນ
        if (order) {
          if (select.value === "complete") await bookOrderSale(order);
          else await unbookOrderSale(id);
          // ຍົກເລີກ = ຄືນຕົ້ນທຶນທີ່ຫັກໄປແລ້ວ
          if (select.value === "cancelled") await removeOrderLedger(id, "orderCost");
          else if (["preparing","needOrder","ordering","shipping","complete"].includes(select.value)) await bookOrderCost(order);
        }
        await refreshOrders();
        toast(`ປ່ຽນເປັນ “${statusLabel(select.value)}” ແລ້ວ`);
      });
  });
  document.addEventListener("click", event => {
    const receipt = event.target.closest("[data-view-receipt]");
    const accept = event.target.closest("[data-accept-order]");
    if (receipt) $(`#receipt-${receipt.dataset.viewReceipt}`)?.classList.toggle("hidden");
    if (accept) { accept.disabled = true; acceptOrder(accept.dataset.acceptOrder).finally(() => { accept.disabled = false; }); }
  });

  // ---- ໜ້າ “ຕ້ອງສັ່ງສິນຄ້າ” ----
  $$(".restock-list").forEach(list => list.addEventListener("click", async event => {
    const marked = event.target.closest("[data-mark-ordered]");
    const receive = event.target.closest("[data-receive-stock]");

    if (marked) {
      // ຍ້າຍທຸກອໍເດີທີ່ມີສິນຄ້ານີ້ ຈາກ needOrder ໄປ ordering
      const productId = marked.dataset.markOrdered;
      const affected = data.orders.filter(order => order.status === "needOrder" && order.items.some(item => String(item.productId) === String(productId)));
      if (!affected.length) return;
      marked.disabled = true;
      try {
        const now = new Date().toISOString();
        await Promise.all(affected.map(order => supabase.from("orders").update({ status: "ordering", orderedAt: now }).eq("id", order.id)));
        await refreshOrders();
        toast(`ໝາຍວ່າສັ່ງແລ້ວ · ${affected.length} ອໍເດີຍ້າຍໄປ “ກຳລັງສັ່ງ”`);
      } catch (err) { console.error(err); toast("ອັບເດດບໍ່ສຳເລັດ"); } finally { marked.disabled = false; }
    }

    if (receive) {
      const productId = receive.dataset.receiveStock;
      const product = productById(productId);
      if (!product) return;
      const suggested = receive.dataset.suggest || "1";
      const answer = prompt(`ຮັບສິນຄ້າ “${product.name}” ເຂົ້າສະຕັອກ\nປ້ອນຈຳນວນທີ່ໄດ້ຮັບ:`, suggested);
      if (answer === null) return;
      const amount = Number(answer);
      if (!Number.isFinite(amount) || amount <= 0) return toast("ກະລຸນາປ້ອນຕົວເລກທີ່ຫຼາຍກວ່າ 0");
      const current = Number(product.stock || 0);
      if (!confirm(`ຢືນຢັນຮັບເຂົ້າສະຕັອກ\n\nສິນຄ້າ: ${product.name}\nຮັບເຂົ້າ ${Math.floor(amount)} ຊິ້ນ\nສະຕັອກຈະເປັນ ${current} → ${current + Math.floor(amount)} ຊິ້ນ\n\nແນ່ໃຈບໍ່ວ່າຕົວເລກຖືກຕ້ອງ?`)) return;
      receive.disabled = true;
      try { await adjustStock(productId, Math.floor(amount)); } finally { receive.disabled = false; }
    }
  }));

  $("#openProductForm").addEventListener("click", () => openProductForm()); $("#closeProductForm").addEventListener("click", closeProductForm); $("#cancelProductForm").addEventListener("click", closeProductForm); $("#priceMode").addEventListener("change", setPriceMode);
  ["#costInput", "#markupInput", "#sellPriceInput", "#fixedProfitInput"].forEach(id => $(id)?.addEventListener("input", updatePricePreview));
  ["#yuanInput", "#shipInput"].forEach(id => $(id)?.addEventListener("input", () => recalcCostFromYuan()));
  $("#savePriceRule")?.addEventListener("click", savePriceRule);
  $("#ruleProfitMode")?.addEventListener("change", () => {
    const pct = $("#ruleProfitMode").value === "percent";
    $("#ruleProfitHint").textContent = pct ? "ຕົວຢ່າງ: 20 = ບວກ 20%" : "ຕົວຢ່າງ: 20000 = ບວກ 20,000 ₭";
  });
  $$("[data-markup]").forEach(button => button.addEventListener("click", () => { $("#markupInput").value = button.dataset.markup; updatePricePreview(); }));
  $("#productForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, fd = new FormData(form);
    const old = editingProductId != null ? productById(editingProductId) : null;
    const files = [...$("#productImageInput").files];
    const mode = form.multiMode ? (form.multiMode.value || "combine") : "combine";
    const submitButton = form.querySelector("button[type=submit]");
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;

    try {
      const price = updatePricePreview();
      const many = files.length > 1 || (old && productImages(old).length > 1 && !files.length);
      const colors = many
        ? [...new Set(imageColorMap.filter(Boolean))]
        : [...pickedColors];
      const base = {
        name: fd.get("name").trim(),
        categoryId: Number(fd.get("categoryId")) || null,
        saleMode: fd.get("saleMode"),
        description: fd.get("description").trim(),
        cost: Number(fd.get("cost")), price,
        stock: Number(fd.get("stock")),
        supplierUrl: fd.get("supplierUrl").trim(),
        yuanPrice: Number(fd.get("yuanPrice") || 0),   // ເຫັນສະເພາະຜູ້ຈັດການ
        shipCost: Number(fd.get("shipCost") || 0),     // ເຫັນສະເພາະຜູ້ຈັດການ
        colors,
        models: [...selectedModels]
      };

      // ອັບໂຫລດຮູບທັງໝົດ (ບອກຄວາມຄືບໜ້າໃຫ້ຮູ້)
      const urls = [];
      for (let i = 0; i < files.length; i++) {
        submitButton.textContent = `ກຳລັງອັບໂຫລດຮູບ ${i + 1}/${files.length}...`;
        urls.push(await uploadImage(files[i], "products"));
      }
      submitButton.textContent = "ກຳລັງບັນທຶກ...";

      if (old) {
        // ແກ້ໄຂ: ຮູບໃໝ່ທັບຮູບເກົ່າ ຖ້າມີການເລືອກ
        const images = urls.length ? urls : productImages(old);
        const imageColors = images.map((_, i) => imageColorMap[i] || "");
        const { error } = await supabase.from("products").update({ ...base, images, imageColors, image: images[0] || "" }).eq("id", old.id);
        if (error) throw error;
        toast("ແກ້ໄຂສິນຄ້າແລ້ວ");
      } else if (files.length > 1 && mode === "split") {
        // ແຍກ: 1 ຮູບ = 1 ສິນຄ້າ ຂໍ້ມູນອື່ນເໝືອນກັນໝົດ
        const rows = urls.map((url, i) => ({ ...base, name: `${base.name} #${i + 1}`, images: [url], imageColors: [imageColorMap[i] || ""], image: url,
          colors: imageColorMap[i] ? [imageColorMap[i]] : [] }));
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
        toast(`ສ້າງ ${rows.length} ສິນຄ້າແຍກກັນແລ້ວ (ລາຄາ ແລະ ຂໍ້ມູນເໝືອນກັນໝົດ)`);
      } else {
        // ລວມ: ສິນຄ້າດຽວ ຫຼາຍຮູບ
        const { error } = await supabase.from("products").insert({ ...base, images: urls,
          imageColors: urls.map((_, i) => imageColorMap[i] || ""), image: urls[0] || "" });
        if (error) throw error;
        toast(urls.length > 1 ? `ເພີ່ມສິນຄ້າແລ້ວ (${urls.length} ຮູບໃນບລັອກດຽວ)` : "ເພີ່ມສິນຄ້າແລ້ວ");
      }
      await refreshProducts();
      closeProductForm();
    } catch (err) {
      console.error(err); toast(`ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ: ${err.message || err}`);
    } finally { submitButton.disabled = false; submitButton.textContent = originalLabel; }
  });

  // ---- ຕົວເລືອກໝວດສິນຄ້າ (ເປີດເປັນຊັ້ນ) ----
  $("#catPickerBtn").addEventListener("click", () => {
    const panel = $("#catPickerPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      const cur = $("#productCategory").value;
      catPickerPath = cur ? categoryPath(cur).slice(0, -1).map(c => String(c.id)) : [];
      renderCatPicker();
    }
  });
  $("#catPickerClose").addEventListener("click", () => $("#catPickerPanel").classList.add("hidden"));
  $("#catPickerPanel").addEventListener("click", event => {
    const open = event.target.closest("[data-catpick-open]");
    const pick = event.target.closest("[data-catpick-select]");
    const goto = event.target.closest("[data-catpick-goto]");
    if (open) { catPickerPath.push(open.dataset.catpickOpen); return renderCatPicker(); }
    if (goto) {
      const t = goto.dataset.catpickGoto;
      if (t === "root") catPickerPath = [];
      else { const i = catPickerPath.findIndex(id => String(id) === String(t)); if (i > -1) catPickerPath = catPickerPath.slice(0, i + 1); }
      return renderCatPicker();
    }
    if (pick) {
      $("#productCategory").value = pick.dataset.catpickSelect;
      renderProductCategories();
      $("#catPickerPanel").classList.add("hidden");
      toast(`ເລືອກໝວດ: ${categoryPath(pick.dataset.catpickSelect).map(c => c.name).join(" › ")}`);
    }
  });

  // ---- ເລືອກລຸ້ນທີ່ໃສ່ໄດ້ ----
  $("#modelSearch").addEventListener("input", renderModelList);
  $("#modelClear").addEventListener("click", () => { selectedModels.clear(); renderModelList(); });
  $("#modelList").addEventListener("change", event => {
    const box = event.target.closest("[data-model-id]"); if (!box) return;
    const id = String(box.dataset.modelId);
    if (box.checked) selectedModels.add(id); else selectedModels.delete(id);
    box.closest(".model-chip")?.classList.toggle("on", box.checked);
    $("#modelCount").textContent = selectedModels.size;
  });
  $("#modelList").addEventListener("click", async event => {
    const openFolder = event.target.closest("[data-picker-open]");
    const goto = event.target.closest("[data-picker-goto]");

    if (openFolder) { pickerPath.push(openFolder.dataset.pickerOpen); modelPasteOpen = false; return renderModelList(); }
    if (goto) {
      const t = goto.dataset.pickerGoto;
      if (t === "root") pickerPath = [];
      else { const i = pickerPath.findIndex(id => String(id) === String(t)); if (i > -1) pickerPath = pickerPath.slice(0, i + 1); }
      modelPasteOpen = false;
      return renderModelList();
    }
    if (event.target.closest("#modelPasteToggle")) { modelPasteOpen = !modelPasteOpen; return renderModelList(); }
    if (event.target.closest("#modelPasteCancel")) { modelPasteOpen = false; return renderModelList(); }
    if (event.target.closest("#modelPasteApply")) return applyModelPaste(event.target.closest("#modelPasteApply"));
    const all = event.target.closest("[data-model-all]"); if (!all) return;
    const ids = all.dataset.modelAll.split(",").filter(Boolean);
    const allOn = ids.every(id => selectedModels.has(id));
    ids.forEach(id => allOn ? selectedModels.delete(id) : selectedModels.add(id));
    renderModelList();
  });

  // ---- ວາງລາຍການລຸ້ນຈາກ Excel / Word ແລ້ວຕິກໃຫ້ອັດຕະໂນມັດ ----


  // ຮູບຕົວຢ່າງ ພໍເລືອກໄຟລ໌ຮູບສິນຄ້າ
  $("#productImageInput").addEventListener("change", event => {
    const files = [...event.target.files];
    previewUrls.forEach(u => URL.revokeObjectURL(u)); previewUrls = [];
    const box = $("#productImagePreview"), modeBox = $("#multiModeBox");
    if (!files.length) { box.innerHTML = `<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກຮູບ</span>`; modeBox.classList.add("hidden"); return; }
    previewUrls = files.map(f => URL.createObjectURL(f));
    imageColorMap = files.map(() => "");
    renderPreviewStrip();
    $("#multiCount").textContent = files.length;
    modeBox.classList.toggle("hidden", files.length < 2);
  });
  // ປຸ່ມເພີ່ມ / ລົບ ສະຕັອກ
  $("#managerProducts").addEventListener("click", event => {
    const minus = event.target.closest("[data-stock-minus]"); const plus = event.target.closest("[data-stock-plus]");
    if (minus) return adjustStock(minus.dataset.stockMinus, -1);
    if (plus) return adjustStock(plus.dataset.stockPlus, 1);
    // ໝົດແລ້ວ = ຕັ້ງສະຕັອກເປັນ 0 ໃນເທື່ອດຽວ
    const soldOut = event.target.closest("[data-sold-out]");
    if (soldOut) {
      const product = productById(soldOut.dataset.soldOut); if (!product) return;
      const current = Number(product.stock || 0);
      if (current === 0) return toast("ສະຕັອກເປັນ 0 ຢູ່ແລ້ວ");
      if (!confirm(`ຕັ້ງ “${product.name}” ເປັນໝົດແລ້ວບໍ?\n\nສະຕັອກ ${current} → 0 ຊິ້ນ`)) return;
      return adjustStock(product.id, -current);
    }
    const edit = event.target.closest("[data-edit-product]"); const remove = event.target.closest("[data-delete-product]");
    if (edit) openProductForm(data.products.find(product => String(product.id) === edit.dataset.editProduct));
    if (remove) { const product = data.products.find(item => String(item.id) === remove.dataset.deleteProduct); if (product && confirm(`ລຶບ “${product.name}” ແທ້ບໍ?`)) { supabase.from("products").delete().eq("id", product.id).then(() => { cart = cart.filter(item => String(item.productId) !== String(product.id)); saveCart(); renderCart(); }); } }
  });
  // ພິມຈຳນວນສະຕັອກໂດຍກົງ ແລ້ວກົດ Enter ຫຼື ຄລິກອອກ
  $("#managerProducts").addEventListener("change", async event => {
    // ປ່ຽນຮູບແບບການຂາຍ ໄດ້ຈາກລາຍການເລີຍ ບໍ່ຕ້ອງເປີດຟອມ
    const mode = event.target.closest("[data-sale-mode]");
    if (mode) {
      const product = productById(mode.dataset.saleMode); if (!product) return;
      const before = product.saleMode;
      mode.disabled = true;
      const { error } = await supabase.from("products").update({ saleMode: mode.value }).eq("id", product.id);
      mode.disabled = false;
      if (error) { mode.value = before; return toast("ປ່ຽນບໍ່ໄດ້: " + error.message); }
      await refreshProducts();
      toast(mode.value === "onDemand" ? "ປ່ຽນເປັນ “ສັ່ງຕາມອໍເດີ” ແລ້ວ · ສະຕັອກ 0 ກໍຂາຍໄດ້" : "ປ່ຽນເປັນ “ພ້ອມສົ່ງ” ແລ້ວ · ຈະຕັດສະຕັອກຕອນຂາຍ");
      return;
    }
    const input = event.target.closest("[data-stock-input]");
    if (!input) return;
    const product = productById(input.dataset.stockInput);
    if (!product) return;
    const target = Math.max(0, Math.floor(Number(input.value)));
    const current = Number(product.stock || 0);
    if (!Number.isFinite(target)) { input.value = current; return toast("ກະລຸນາປ້ອນຕົວເລກ"); }
    if (target === current) return;
    const diff = target - current;
    const ok = confirm(`ຢືນຢັນປ່ຽນສະຕັອກ\n\nສິນຄ້າ: ${product.name}\nຈາກ ${current} ຊິ້ນ → ${target} ຊິ້ນ  (${diff > 0 ? "+" : ""}${diff})\n\nແນ່ໃຈບໍ່ວ່າຕົວເລກຖືກຕ້ອງ?`);
    if (!ok) { input.value = current; return; }
    adjustStock(product.id, diff);
  });
  $("#managerProducts").addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.closest("[data-stock-input]")) { event.preventDefault(); event.target.blur(); }
  });

  $("#paymentForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    const submitButton = form.querySelector("button[type=submit]"); submitButton.disabled = true;
    try {
      const newQr = form.qrImage.files[0] ? await uploadImage(form.qrImage.files[0], "payment") : data.payment.qrImage;
      const payment = { accountName: fd.get("accountName").trim(), accountNumber: fd.get("accountNumber").trim(), qrImage: newQr };
      const { error } = await supabase.from("settings").update({ payment }).eq("id", "store");
      if (error) throw error;
      toast("ບັນທຶກຂໍ້ມູນຮັບເງິນແລ້ວ");
    } catch (err) { console.error(err); toast("ບັນທຶກບໍ່ສຳເລັດ"); } finally { submitButton.disabled = false; }
  });
  $("#expenseForm").addEventListener("submit", async event => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const { error } = await supabase.from("expenses").insert({ description: fd.get("description").trim(), amount: Number(fd.get("amount")) });
    if (error) return toast("ບັນທຶກບໍ່ສຳເລັດ");
    event.currentTarget.reset(); toast("ບັນທຶກຄ່າໃຊ້ຈ່າຍແລ້ວ");
  });
  $("#expenseList").addEventListener("click", event => { const button = event.target.closest("[data-delete-expense]"); if (!button) return; supabase.from("expenses").delete().eq("id", button.dataset.deleteExpense).then(() => toast("ລຶບຄ່າໃຊ້ຈ່າຍແລ້ວ")); });
  $("#shopProfileForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    const submitButton = form.querySelector("button[type=submit]"); submitButton.disabled = true;
    try {
      const logo = form.logo.files[0] ? await uploadImage(form.logo.files[0], "profile") : data.profile.logo;
      const profile = { shopName: fd.get("shopName").trim(), tagline: fd.get("tagline").trim(), ownerName: fd.get("ownerName").trim(), phone: fd.get("phone").trim(), logo };
      const { error } = await supabase.from("settings").update({ profile }).eq("id", "store");
      if (error) throw error;
      toast("ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ");
    } catch (err) { console.error(err); toast("ບັນທຶກບໍ່ສຳເລັດ"); } finally { submitButton.disabled = false; }
  });


  // ---- ກັ່ນຕອງໜ້າ “ຕ້ອງສັ່ງສິນຄ້າ” ----
  $("#restockFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-restock-filter]"); if (!button) return;
    restockFilter = button.dataset.restockFilter; renderRestock();
  });

  // ---- ກັ່ນຕອງ / ຄົ້ນຫາ ໃນໜ້າຈັດການສິນຄ້າ ----
  $("#manageCategoryFilter").addEventListener("click", event => {
    const button = event.target.closest("[data-manage-cat]"); if (!button) return;
    manageCategoryFilter = button.dataset.manageCat; renderManagerProducts();
  });
  $("#manageProductSearch").addEventListener("input", renderManagerProducts);

  // ---- ລຶບອໍເດີ (ເຊັ່ນ ອໍເດີທີ່ລອງທົດສອບ) ----
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-delete-order]"); if (!button) return;
    const order = orderById(button.dataset.deleteOrder); if (!order) return;
    const warn = order.stockDeducted ? "\n⚠ ອໍເດີນີ້ຕັດສະຕັອກໄປແລ້ວ — ລະບົບຈະຄືນສະຕັອກໃຫ້ອັດຕະໂນມັດ." : "";
    const cost = orderCost(order), total = orderTotal(order);
    const booked = orderLedgerHas(order.id, "orderCost"), sold = orderLedgerHas(order.id, "orderSale");
    const moneyBack = [
      booked ? `• ຕົ້ນທຶນ ${money(cost)} ຈະຖືກຄືນເຂົ້າເງິນທຶນ` : "",
      sold ? `• ເງິນຂາຍ ${money(total)} ຈະຖືກຫັກອອກຈາກເງິນທຶນ` : ""
    ].filter(Boolean).join("\n");

    // ຢືນຢັນເທື່ອທີ 1 — ພ້ອມສະເໜີໃຫ້ເຊບໄຟລ໌ໄວ້ກ່ອນ
    if (!confirm(`⚠ ຢືນຢັນເທື່ອທີ 1/2\n\nລຶບອໍເດີ ${order.id}?\nລູກຄ້າ: ${order.customer.name}\nມູນຄ່າ: ${money(total)}${warn}\n${moneyBack ? "\nຜົນຕໍ່ບັນຊີ:\n" + moneyBack + "\n" : ""}\nກົດ OK ເພື່ອໄປຕໍ່`)) return;
    if (confirm("ຢາກເຊບອໍເດີນີ້ເປັນໄຟລ໌ Excel ໄວ້ກ່ອນລຶບບໍ?\n\nOK = ດາວໂຫລດເກັບໄວ້\nCancel = ບໍ່ຕ້ອງ ລຶບເລີຍ")) {
      exportOrderCsv(order);
      await new Promise(r => setTimeout(r, 900));
    }
    // ຢືນຢັນເທື່ອທີ 2 — ເທື່ອສຸດທ້າຍ
    if (!confirm(`🗑 ຢືນຢັນເທື່ອສຸດທ້າຍ 2/2\n\nລຶບອໍເດີ ${order.id} ຖິ້ມແທ້ບໍ?\nລຶບແລ້ວ ກູ້ຄືນບໍ່ໄດ້ອີກ.`)) return;
    button.disabled = true;
    try {
      if (order.stockDeducted) {   // ຄືນສະຕັອກກ່ອນລຶບ
        await Promise.all(order.items.map(item => {
          const product = productById(item.productId); if (!product) return null;
          const next = Number(product.stock || 0) + item.quantity; product.stock = next;
          return supabase.from("products").update({ stock: next }).eq("id", product.id);
        }).filter(Boolean));
      }
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;
      await Promise.all([refreshOrders(), refreshProducts(), refreshLedger()]);
      toast(order.stockDeducted ? "ລຶບອໍເດີ · ຄືນສະຕັອກ ແລະ ຄືນເງິນທຶນແລ້ວ" : "ລຶບອໍເດີ ແລະ ປັບບັນຊີແລ້ວ");
    } catch (err) { console.error(err); toast(`ລຶບບໍ່ສຳເລັດ: ${err.message || err}`); }
    finally { button.disabled = false; }
  });


  // ---- ນຳທາງໝວດ 3 ຊັ້ນ (ໜ້າຮ້ານ) ----
  $("#catGrid").addEventListener("click", event => {
    const card = event.target.closest("[data-cat-open]"); if (!card) return;
    navPath.push(card.dataset.catOpen); navLeaf = null;
    pushNavState();
    renderCustomerShop();
    $("#products").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#catBreadcrumb").addEventListener("click", event => {
    const button = event.target.closest("[data-cat-goto]"); if (!button) return;
    const target = button.dataset.catGoto;
    if (target === "root") { navPath = []; navLeaf = null; }        // ✕ ອອກ = ກັບໜ້າຫຼັກຮ້ານທັນທີ
    else if (target === "back") { goBackOneLevel(); }               // ‹ ກັບຄືນ = ຖອຍເທື່ອລະຂັ້ນ
    else {
      const idx = navPath.findIndex(id => String(id) === String(target));
      if (idx > -1) navPath = navPath.slice(0, idx + 1);
      navLeaf = null;
    }
    renderCustomerShop();
    $("#products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#catChips").addEventListener("click", event => {
    const button = event.target.closest("[data-cat-model]"); if (!button) return;
    const nextLeaf = button.dataset.catModel === "all" ? null : button.dataset.catModel;
    if (nextLeaf && !navLeaf) pushNavState();
    navLeaf = nextLeaf;
    renderCustomerShop();
  });

  // ---- ບັດສິນຄ້າ ແລະ ໜ້າລາຍລະອຽດ ----
  $("#productGrid").addEventListener("click", event => {
    const open = event.target.closest("[data-open-product]");
    if (open) openProductDetail(open.dataset.openProduct);
  });
  $("#productDetailBody").addEventListener("click", event => {
    const pickImg = event.target.closest("[data-pick-image]");
    const pickColor = event.target.closest("[data-pick-color]");
    const zoom = event.target.closest("[data-zoom-image]");
    const add = event.target.closest("[data-detail-add]");
    const buy = event.target.closest("[data-detail-buy]");
    if (pickImg) { detailState.imageIndex = Number(pickImg.dataset.pickImage); updateDetailImage(); return syncImageToColor(); }
    if (pickColor) { detailState.color = pickColor.dataset.pickColor; updateDetailColor(); return syncColorToImage(); }
    const pickModel = event.target.closest("[data-pick-model]");
    if (pickModel) { detailState.model = pickModel.dataset.pickModel; return updateDetailModel(); }
    if (zoom) return openImageViewer(zoom.dataset.zoomImage);
    if (add) {
      if (!addToCart(add.dataset.detailAdd, detailState.color, detailState.model)) return;
      const product = productById(add.dataset.detailAdd);
      const lines = cart.filter(l => String(l.productId) === String(product.id));
      const qty = lines.reduce((n, l) => n + l.quantity, 0);
      const facts = $("#productDetailBody .detail-facts");
      if (facts) {
        let row = facts.querySelector("[data-in-cart]");
        if (!row) { facts.insertAdjacentHTML("beforeend", `<div data-in-cart><span>ໃນກະຕ່າຂອງທ່ານ</span><b></b></div>`); row = facts.querySelector("[data-in-cart]"); }
        const colorNames = lines.filter(l => l.color).map(l => escapeHtml(l.color)).join(", ");
        row.querySelector("b").textContent = `${qty} ຊິ້ນ${colorNames ? ` (${colorNames})` : ""}`;
      }
      return;
    }
    if (buy) {
      const product = productById(buy.dataset.detailBuy);
      const already = cart.some(l => String(l.productId) === String(product.id) && (l.color || "") === (detailState.color || "") && (l.model || "") === (detailState.model || ""));
      if (!already && !addToCart(buy.dataset.detailBuy, detailState.color, detailState.model)) return;
      renderCheckout(); closeLayers();
      $("#checkoutModal").classList.remove("hidden"); $("#overlay").classList.remove("hidden");
    }
  });

  // ---- ຈັດການໝວດສິນຄ້າ (ເພີ່ມ / ແກ້ຊື່ / ລຶບ / ໃສ່ຮູບ) ----
  // ---- ຟອມສັ່ງຊື້: ສະຫຼັບຊ່ອງຕາມວິທີຮັບເຄື່ອງ ----
  $$("input[name=deliveryMethod]").forEach(r => r.addEventListener("change", toggleDeliveryFields));
  toggleDeliveryFields();

  // ---- ຜູກສີໃສ່ຮູບ ໃນຟອມສິນຄ້າ ----
  // ---- ເລືອກສີໃນຟອມສິນຄ້າ (ຮູບດຽວ = ຫຼາຍສີ) ----
  $("#productColorPicker").addEventListener("click", event => {
    const b = event.target.closest("[data-pick-swatch]"); if (!b || b.disabled) return;
    const name = b.dataset.pickSwatch;
    if (pickedColors.has(name)) pickedColors.delete(name); else pickedColors.add(name);
    renderProductColorPicker();
  });

  // ---- ຈັດການຊຸດສີຂອງຮ້ານ ----
  $("#addColorBtn").addEventListener("click", async () => {
    const name = ($("#newColorName").value || "").trim();
    const hex = $("#newColorHex").value || "#cccccc";
    if (!name) return toast("ໃສ່ຊື່ສີກ່ອນ");
    if (colorOptions.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast("ມີສີຊື່ນີ້ຢູ່ແລ້ວ");
    if (await saveColorOptions([...colorOptions, { name, hex }])) { $("#newColorName").value = ""; toast(`ເພີ່ມສີ “${name}” ແລ້ວ`); }
  });
  $("#colorSetList").addEventListener("click", async event => {
    const ren = event.target.closest("[data-color-rename]");
    const del = event.target.closest("[data-color-del]");
    if (ren) {
      const i = Number(ren.dataset.colorRename); const cur = colorOptions[i]; if (!cur) return;
      const name = prompt("ແກ້ໄຂຊື່ສີ:", cur.name); if (name === null) return;
      const clean = name.trim(); if (!clean) return toast("ຊື່ຫວ່າງບໍ່ໄດ້");
      const list = colorOptions.map((c, k) => k === i ? { ...c, name: clean } : c);
      if (await saveColorOptions(list)) toast("ແກ້ຊື່ສີແລ້ວ");
      return;
    }
    if (del) {
      const i = Number(del.dataset.colorDel); const cur = colorOptions[i]; if (!cur) return;
      const used = data.products.filter(pr => productColors(pr).includes(cur.name)).length;
      if (!confirm(`ລຶບສີ “${cur.name}” ຖິ້ມບໍ?${used ? `\n\nມີສິນຄ້າ ${used} ລາຍການໃຊ້ສີນີ້ຢູ່ (ຂໍ້ມູນເກົ່າຈະຍັງຢູ່)` : ""}`)) return;
      if (await saveColorOptions(colorOptions.filter((_, k) => k !== i))) toast("ລຶບສີແລ້ວ");
    }
  });
  $("#productImagePreview").addEventListener("change", event => {
    const sel = event.target.closest("[data-img-color]"); if (!sel) return;
    imageColorMap[Number(sel.dataset.imgColor)] = sel.value;
  });

  // ---- ບໍລິສັດຂົນສົ່ງ ----
  $("#courierAdd").addEventListener("click", async () => {
    const raw = $("#courierInput").value || "";
    const names = raw.split(/[\n\r\t.,;|]+/).map(t => t.trim()).filter(Boolean);
    if (!names.length) return toast("ຍັງບໍ່ໄດ້ໃສ່ຊື່");
    const merged = [...couriers];
    names.forEach(n => { if (!merged.some(c => c.toLowerCase() === n.toLowerCase())) merged.push(n); });
    if (await saveCouriers(merged)) { $("#courierInput").value = ""; toast(`ເພີ່ມແລ້ວ ${merged.length - couriers.length + names.length} ລາຍການ`); }
  });
  $("#courierList").addEventListener("click", async event => {
    const del = event.target.closest("[data-courier-del]"); if (!del) return;
    const i = Number(del.dataset.courierDel);
    if (!confirm(`ລຶບ “${couriers[i]}” ຖິ້ມບໍ?`)) return;
    if (await saveCouriers(couriers.filter((_, k) => k !== i))) toast("ລຶບແລ້ວ");
  });

  // ---- ຂັ້ນຕອນໂອນເງິນ ----
  $("#saveQrBtn").addEventListener("click", async () => {
    const src = data.payment.qrImage; if (!src) return;
    try {
      const res = await fetch(src); const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `QR-${data.profile.shopName || "shop"}.jpg`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast("ບັນທຶກ QR ໄວ້ໃນເຄື່ອງແລ້ວ");
    } catch { window.open(src, "_blank"); toast("ເປີດຮູບ QR ແລ້ວ — ກົດຄ້າງເພື່ອບັນທຶກ"); }
  });
  $("#slipInput").addEventListener("change", event => {
    const file = event.target.files[0];
    const box = $("#slipPreview");
    if (!file) { box.innerHTML = `<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກໃບໂອນ</span>`; return; }
    box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="ໃບໂອນ">`;
  });
  $("#slipSubmit").addEventListener("click", async event => {
    if (!pendingTransfer) return closeLayers();
    const file = $("#slipInput").files[0];
    if (!file) return toast("ກະລຸນາອັບຮູບໃບໂອນກ່ອນ ຈຶ່ງຢືນຢັນໄດ້");
    const button = event.currentTarget; button.disabled = true; const label = button.textContent;
    button.textContent = "ກຳລັງສົ່ງໃບໂອນ...";
    try {
      const url = await uploadImage(file, "receipts");
      // ບັນທຶກອໍເດີພ້ອມໃບໂອນໃນເທື່ອດຽວ
      const order = { ...pendingTransfer.order, receipt: url, slipAt: new Date().toISOString() };
      const { error } = await supabase.from("orders").insert(order);
      if (error) throw error;
      await refreshOrders();
      cart = []; saveCart(); renderCart(); closeLayers();
      $("#successText").textContent = `ຮັບໃບໂອນແລ້ວ · ອໍເດີ ${order.id} · ຍອດ ${money(pendingTransfer.total)} — ຮ້ານຈະກວດຍອດເງິນ ແລ້ວຈັດສົ່ງໃຫ້ໄວໆ`;
      $("#successModal").classList.remove("hidden"); $("#overlay").classList.remove("hidden");
      pendingTransfer = null;
    } catch (err) { console.error(err); toast(`ສົ່ງໃບໂອນບໍ່ສຳເລັດ: ${err.message || err}`); }
    finally { button.disabled = false; button.textContent = label; }
  });
  // ຍົກເລີກ — ຍັງບໍ່ໄດ້ບັນທຶກອໍເດີ ສິນຄ້າຍັງຢູ່ໃນກະຕ່າ
  $("#slipLater").addEventListener("click", () => {
    pendingTransfer = null;
    closeLayers();
    toast("ຍົກເລີກແລ້ວ · ສິນຄ້າຍັງຢູ່ໃນກະຕ່າ ສັ່ງໃໝ່ໄດ້ທຸກເວລາ");
  });

  // ---- ກັ່ນຕອງໜ້າໃບໂອນ ----
  $("#slipFilters").addEventListener("click", event => {
    const b = event.target.closest("[data-slip-range]"); if (!b) return;
    slipRange = b.dataset.slipRange; renderSlips();
  });
  $("#slipList").addEventListener("click", event => {
    const zoom = event.target.closest("[data-zoom-image]"); if (zoom) openImageViewer(zoom.dataset.zoomImage);
  });

  // ---- ຈັດການໝວດສິນຄ້າ: ເປີດເປັນຊັ້ນ · ເພີ່ມທີລະຫຼາຍ · ແກ້ຊື່ · ລຶບ ----
  $("#catMgrCrumb").addEventListener("click", event => {
    const goto = event.target.closest("[data-catmgr-goto]"); if (!goto) return;
    const t = goto.dataset.catmgrGoto;
    if (t === "root") catMgrPath = [];
    else { const i = catMgrPath.findIndex(id => String(id) === String(t)); if (i > -1) catMgrPath = catMgrPath.slice(0, i + 1); }
    $("#catMgrAddBox").classList.add("hidden");
    renderCategoriesManager();
  });

  $("#catMgrList").addEventListener("click", async event => {
    const open = event.target.closest("[data-catmgr-open]");
    const rename = event.target.closest("[data-cat-rename]");
    const remove = event.target.closest("[data-cat-delete]");
    const setImg = event.target.closest("[data-cat-image]");

    if (setImg) { pendingCategoryImage = setImg.dataset.catImage; return $("#categoryImageInput").click(); }

    // ເອົາຮູບອອກ → ກັບໄປໃຊ້ໄອຄອນຕົວອັກສອນ
    const unImg = event.target.closest("[data-cat-unimage]");
    if (unImg) {
      const cat = catById(unImg.dataset.catUnimage); if (!cat) return;
      if (!confirm(`ເອົາຮູບຂອງ “${cat.name}” ອອກບໍ?\n(ຈະກັບໄປສະແດງເປັນໄອຄອນຄືເກົ່າ)`)) return;
      const { error } = await supabase.from("categories").update({ image: "" }).eq("id", cat.id);
      if (error) return toast("ເອົາອອກບໍ່ໄດ້: " + error.message);
      await refreshCategories(); toast("ເອົາຮູບອອກແລ້ວ");
      return;
    }
    // ປ່ຽນໄອຄອນ (ໃຊ້ຕອນຍັງບໍ່ມີຮູບ)
    const setIcon = event.target.closest("[data-cat-icon]");
    if (setIcon) {
      const cat = catById(setIcon.dataset.catIcon); if (!cat) return;
      const icon = prompt(`ໄອຄອນຂອງ “${cat.name}”\nວາງ emoji ໄດ້ເລີຍ ເຊັ່ນ 🛡️ 📱 🔋 🔌 🎧`, cat.icon || "📦");
      if (icon === null) return;
      const { error } = await supabase.from("categories").update({ icon: icon.trim().slice(0, 4) }).eq("id", cat.id);
      if (error) return toast("ປ່ຽນບໍ່ໄດ້: " + error.message);
      await refreshCategories(); toast("ປ່ຽນໄອຄອນແລ້ວ");
      return;
    }

    if (rename) {
      const cat = catById(rename.dataset.catRename); if (!cat) return;
      const name = prompt("ແກ້ໄຂຊື່:", cat.name);
      if (name === null) return;
      const clean = name.trim(); if (!clean) return toast("ຊື່ຫວ່າງບໍ່ໄດ້");
      const { error } = await supabase.from("categories").update({ name: clean }).eq("id", cat.id);
      if (error) { console.error(error); return toast(`ແກ້ໄຂບໍ່ສຳເລັດ: ${error.message}`); }
      await refreshCategories(); toast("ແກ້ໄຂຊື່ແລ້ວ");
      return;
    }

    if (remove) {
      const cat = catById(remove.dataset.catDelete); if (!cat) return;
      const inside = descendantIds(cat.id).length - 1;
      const items = productCountIn(cat.id);
      if (items) return toast(`ລຶບບໍ່ໄດ້: ຍັງມີສິນຄ້າ ${items} ລາຍການໃນນີ້`);
      if (!confirm(`ລຶບ “${cat.name}” ຖິ້ມແທ້ບໍ?${inside ? `\n\nຈະລຶບລາຍການຍ່ອຍພາຍໃນ ${inside} ອັນນຳ.` : ""}`)) return;
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) { console.error(error); return toast(`ລຶບບໍ່ສຳເລັດ: ${error.message}`); }
      await refreshCategories(); toast("ລຶບແລ້ວ");
      return;
    }

    if (open) { catMgrPath.push(open.dataset.catmgrOpen); $("#catMgrAddBox").classList.add("hidden"); renderCategoriesManager(); }
  });

  $("#catMgrAddToggle").addEventListener("click", () => {
    const box = $("#catMgrAddBox"); box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) { $("#catMgrInput").value = ""; $("#catMgrAddResult").textContent = ""; $("#catMgrInput").focus(); }
  });
  $("#catMgrAddCancel").addEventListener("click", () => $("#catMgrAddBox").classList.add("hidden"));

  $("#catMgrAddApply").addEventListener("click", async event => {
    const text = $("#catMgrInput").value || "";
    const names = text.split(/[\n\r\t.,;|/]+/).map(t => t.trim()).filter(Boolean);
    if (!names.length) return toast("ຍັງບໍ່ໄດ້ໃສ່ຊື່");
    const parentId = catMgrPath.length ? Number(catMgrPath[catMgrPath.length - 1]) : null;
    const icon = parentId ? "" : ($("#catMgrIcon").value || "").trim();
    const existing = childrenOf(parentId);
    const rows = []; const skipped = [];
    let sort = (existing.length + 1) * 10;
    names.forEach(name => {
      if (existing.some(c => normModel(c.name) === normModel(name)) || rows.some(r => normModel(r.name) === normModel(name))) { skipped.push(name); return; }
      rows.push({ name, parentId, icon, sort: (sort += 10) });
    });
    if (!rows.length) { $("#catMgrAddResult").innerHTML = `<span class="miss">ທຸກອັນມີຢູ່ແລ້ວ</span>`; return toast("ມີຢູ່ແລ້ວທັງໝົດ"); }
    const button = event.currentTarget; button.disabled = true;
    try {
      const { error } = await supabase.from("categories").insert(rows);
      if (error) throw error;
      await refreshCategories();
      $("#catMgrInput").value = ""; if ($("#catMgrIcon")) $("#catMgrIcon").value = "";
      $("#catMgrAddResult").innerHTML = `<span class="ok">ເພີ່ມແລ້ວ ${rows.length} ອັນ: ${rows.map(r => escapeHtml(r.name)).join(" · ")}</span>`
        + (skipped.length ? `<br><span class="miss">ຂ້າມ ${skipped.length} ອັນ (ມີຢູ່ແລ້ວ): ${skipped.map(escapeHtml).join(", ")}</span>` : "");
      toast(`ເພີ່ມແລ້ວ ${rows.length} ອັນ`);
    } catch (err) { console.error(err); toast(`ເພີ່ມບໍ່ສຳເລັດ: ${err.message || err}`); }
    finally { button.disabled = false; }
  });

  $("#categoryImageInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file || !pendingCategoryImage) { event.target.value = ""; return; }
    toast("ກຳລັງອັບໂຫລດຮູບໝວດ...");
    try {
      const url = await uploadImage(file, "products");
      const { error } = await supabase.from("categories").update({ image: url }).eq("id", pendingCategoryImage);
      if (error) throw error;
      await refreshCategories(); renderCategoriesManager();
      toast("✓ ໃສ່ຮູບແລ້ວ · ຮູບຈະໂຜ່ໜ້າຮ້ານທັນທີ");
    } catch (err) { console.error(err); toast(`ອັບໂຫລດບໍ່ສຳເລັດ: ${err.message || err}`); }
    finally { event.target.value = ""; pendingCategoryImage = null; }
  });

  // ---- ສຳຮອງ / ນຳເຂົ້າຂໍ້ມູນ ----
  $("#exportData").addEventListener("click", () => {
    const exportShape = { profile: data.profile, payment: data.payment, categories: data.categories, products: data.products, orders: data.orders, expenses: data.expenses };
    const blob = new Blob([JSON.stringify(exportShape, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `phonemani-backup-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url);
  });
  // ນຳເຂົ້າ: upsert ຂຽນທັບແຖວທີ່ id ຕົງກັນໃນຖານຂໍ້ມູນອອນລາຍ (ບໍ່ລຶບແຖວເກົ່າທີ່ບໍ່ຢູ່ໃນໄຟລ໌)
  $("#importData").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.products) || !Array.isArray(imported.categories) || !Array.isArray(imported.orders)) throw new Error("bad shape");
      if (!confirm("ຂໍ້ມູນນີ້ຈະຖືກຂຽນທັບໃນຖານຂໍ້ມູນອອນລາຍ (ທຸກຄົນຈະເຫັນທັນທີ). ດຳເນີນການບໍ?")) return;
      for (const category of imported.categories) await supabase.from("categories").upsert(category);
      for (const product of imported.products) await supabase.from("products").upsert(product);
      for (const order of imported.orders) await supabase.from("orders").upsert(order);
      for (const expense of (imported.expenses || [])) await supabase.from("expenses").upsert(expense);
      if (imported.profile || imported.payment) await supabase.from("settings").update({ profile: imported.profile || {}, payment: imported.payment || {} }).eq("id", "store");
      toast("ນຳເຂົ້າຂໍ້ມູນສຳເລັດ");
    } catch (err) { console.error(err); toast("ຟາຍນີ້ບໍ່ຖືກຮູບແບບ ຫຼື ນຳເຂົ້າບໍ່ສຳເລັດ"); } finally { event.target.value = ""; }
  });
});
