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

let data = {
  profile: { ...defaultProfile },
  payment: { ...defaultPayment },
  categories: [],
  products: [],
  orders: [],
  expenses: []
};

let cart = readJson("phonemani-cart", []);
let navL1 = null;   // ໝວດໃຫຍ່ທີ່ເລືອກຢູ່ (null = ສະແດງບັດໝວດໃຫຍ່)
let navL2 = null;   // iPhone / Android
let navL3 = null;   // ຮຸ່ນ
let activeOrderFilter = "all";
let restockFilter = "all";
let manageCategoryFilter = "all";
let editingProductId = null;
let selectedModels = new Set();   // ລຸ້ນທີ່ຕິກໄວ້ໃນຟອມສິນຄ້າ
let pendingNewModels = [];        // ລຸ້ນທີ່ວາງມາແຕ່ຍັງບໍ່ມີໃນລະບົບ
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
  for (const arr of childIndex.values()) arr.sort(bySort);
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
  return productModelIds(product).map(id => catById(id)?.name).filter(Boolean);
}
// ຈັບຄູ່ຊື່ລຸ້ນແບບຢືດຢຸ່ນ (ບໍ່ສົນຕົວພິມ ຫຼື ຊ່ອງວ່າງ)
const normModel = (t) => String(t || "").toLowerCase().replace(/[\s._\-()]/g, "");

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
const APP_VERSION = "10 · ເພີ່ມລຸ້ນໄດ້ໃນຟອມ + ຫຼັງບ້ານກະທັດຮັດ";
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

async function uploadImage(file, folder) {
  if (!file) return "";
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
    <span class="cat-art">${art}</span>
    <span class="cat-name">${escapeHtml(cat.name)}</span>
    <small>${count} ລາຍການ${kids ? ` · ${kids} ຮຸ່ນ` : ""}</small>
  </button>`;
}

function renderCustomerShop() {
  if (loadErrorShown && !data.products.length) return;
  const query = $("#customerSearch").value.trim().toLowerCase();
  const grid = $("#catGrid"), chips = $("#catChips"), crumb = $("#catBreadcrumb");

  // ຄົ້ນຫາ → ຂ້າມການນຳທາງ ຄົ້ນທົ່ວຮ້ານເລີຍ
  const searching = query.length > 0;

  // ---- ເສັ້ນທາງ (breadcrumb) ----
  if (navL1 && !searching) {
    const parts = [`<button type="button" data-cat-goto="root">ໜ້າຫຼັກຮ້ານ</button>`];
    [navL1, navL2, navL3].filter(Boolean).forEach((id, i, arr) => {
      const cat = catById(id); if (!cat) return;
      parts.push(i === arr.length - 1
        ? `<span aria-current="page">${escapeHtml(cat.name)}</span>`
        : `<button type="button" data-cat-goto="${cat.id}">${escapeHtml(cat.name)}</button>`);
    });
    crumb.innerHTML = parts.join('<i aria-hidden="true">›</i>');
    crumb.classList.remove("hidden");
  } else { crumb.innerHTML = ""; crumb.classList.add("hidden"); }

  // ---- ເລືອກວ່າຈະສະແດງບັດໝວດ ຫຼື ຊິບຮຸ່ນ ----
  let showProducts = [];
  grid.innerHTML = ""; grid.classList.add("hidden");
  chips.innerHTML = ""; chips.classList.add("hidden");

  if (searching) {
    showProducts = data.products;
  } else if (!navL1) {
    // ຊັ້ນ 1 — ບັດໝວດໃຫຍ່ພ້ອມໄອຄອນ
    const roots = childrenOf(null).filter(c => productCountIn(c.id) > 0 || childrenOf(c.id).length);
    if (roots.length) { grid.innerHTML = roots.map(catCard).join(""); grid.classList.remove("hidden"); }
    // ສິນຄ້າທີ່ບໍ່ໄດ້ຢູ່ໝວດໃດ ຫຼື ບໍ່ມີໝວດເລີຍ → ສະແດງທັງໝົດ
    showProducts = roots.length ? data.products.filter(pr => !pr.categoryId || !catById(pr.categoryId)) : data.products;
  } else if (!navL2) {
    // ຊັ້ນ 2 — iPhone / Android
    const kids = childrenOf(navL1);
    if (kids.length) { grid.innerHTML = kids.map(catCard).join(""); grid.classList.remove("hidden"); }
    const ids = new Set(descendantIds(navL1));
    showProducts = kids.length
      ? data.products.filter(pr => String(pr.categoryId) === String(navL1))
      : data.products.filter(pr => productInScope(pr, ids));
  } else {
    // ຊັ້ນ 3 — ຊິບຮຸ່ນ (ສະແດງສະເພາະຮຸ່ນທີ່ມີສິນຄ້າ)
    const models = childrenOf(navL2).filter(c => productCountIn(c.id) > 0);
    if (models.length) {
      chips.innerHTML = [`<button data-cat-model="all" class="${!navL3 ? "active" : ""}">ທຸກຮຸ່ນ (${productCountIn(navL2)})</button>`,
        ...models.map(m => `<button data-cat-model="${m.id}" class="${String(navL3) === String(m.id) ? "active" : ""}">${escapeHtml(m.name)} (${productCountIn(m.id)})</button>`)].join("");
      chips.classList.remove("hidden");
    }
    const scope = navL3 || navL2;
    const ids = new Set(descendantIds(scope));
    showProducts = data.products.filter(pr => productInScope(pr, ids));
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
let detailState = { productId: null, imageIndex: 0, color: "" };

function openProductDetail(productId, keepState) {
  const product = productById(productId);
  if (!product) return;
  const imgs = productImages(product);
  const colors = productColors(product);
  const modelNames = productModelNames(product);
  if (!keepState || String(detailState.productId) !== String(productId)) {
    detailState = { productId, imageIndex: 0, color: colors.length === 1 ? colors[0] : "" };
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
        `<button type="button" class="thumb${i === idx ? " active" : ""}" data-pick-image="${i}" aria-label="ຮູບທີ ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    </div>
    <div>
      <p class="product-category">${path.length ? path.map(c => escapeHtml(c.name)).join(" · ") : "ບໍ່ມີໝວດ"}</p>
      <h2 id="productDetailName">${escapeHtml(product.name)}</h2>
      <strong class="detail-price">${money(product.price)}</strong>
      <span class="product-stock">${stockText(product)}</span>
      <p class="detail-desc">${escapeHtml(product.description || "ສິນຄ້າຄຸນນະພາບ ພ້ອມໃຫ້ເລືອກ")}</p>
      ${modelNames.length ? `<div class="fits-box">
        <p class="picker-label">ໃສ່ໄດ້ກັບ <b>${modelNames.length}</b> ລຸ້ນ</p>
        <div class="fits-chips">${modelNames.map(n => `<span>${escapeHtml(n)}</span>`).join("")}</div>
      </div>` : ""}
      ${colors.length ? `<div class="color-picker">
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
function updateDetailColor() {
  const label = $("#productDetailBody .picker-label");
  if (label) label.innerHTML = detailState.color
    ? `ເລືອກສີ <b>· ${escapeHtml(detailState.color)}</b>`
    : `ເລືອກສີ <em>(ຍັງບໍ່ໄດ້ເລືອກ)</em>`;
  $$("#productDetailBody .color-chip").forEach(c =>
    c.classList.toggle("active", c.dataset.pickColor === detailState.color));
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

const cartKey = (productId, color) => `${productId}::${color || ""}`;
function validCart() {
  cart = cart.filter(line => data.products.some(product => String(product.id) === String(line.productId)));
  return cart.map(line => ({ ...line, color: line.color || "", product: productById(line.productId) })).filter(line => line.product);
}
function renderCart(skipShopRender) {
  const lines = validCart(); saveCart();
  if (!skipShopRender) syncCardQuantities();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);
  $("#checkoutButton").disabled = !lines.length;
  $("#cartItems").innerHTML = lines.length ? lines.map(({ product, quantity, color }) => `<div class="cart-line"><div class="cart-thumb">${imageMarkup(product)}</div><div><h4>${escapeHtml(product.name)}</h4>${color ? `<p class="cart-color">ສີ: <b>${escapeHtml(color)}</b></p>` : ""}<p>${money(product.price)}</p><div class="quantity-control"><button data-cart-change="-1" data-product-id="${product.id}" data-color="${escapeHtml(color)}">−</button><span>${quantity}</span><button data-cart-change="1" data-product-id="${product.id}" data-color="${escapeHtml(color)}">+</button></div></div><button class="remove-cart" data-cart-remove="${product.id}" data-color="${escapeHtml(color)}" aria-label="ລຶບ">×</button></div>`).join("") : `<div class="cart-empty"><p>ກະຕ່າຍັງຫວ່າງ</p><small>ເລືອກສິນຄ້າເພື່ອເລີ່ມສັ່ງຊື້</small></div>`;
}
// ລູກຄ້າສັ່ງໄດ້ເຖິງແມ່ນສະຕັອກເປັນ 0 — ຮ້ານຈະໄປສັ່ງມາໃຫ້ (ອໍເດີຈະເຂົ້າ “ຕ້ອງສັ່ງສິນຄ້າ”)
function addToCart(productId, color = "") {
  const product = productById(productId);
  if (!product) return false;
  const colors = productColors(product);
  if (colors.length && !color) { toast("ກະລຸນາເລືອກສີກ່ອນ"); return false; }
  const key = cartKey(productId, color);
  const inCart = cart.find(line => cartKey(line.productId, line.color) === key);
  if (inCart) inCart.quantity += 1; else cart.push({ productId, color, quantity: 1 });
  saveCart(); renderCart();
  const suffix = color ? ` (ສີ${color})` : "";
  toast(product.stock > 0 ? `ເພີ່ມໃສ່ກະຕ່າແລ້ວ${suffix}` : `ເພີ່ມແລ້ວ${suffix} · ຮ້ານຈະສັ່ງມາໃຫ້`);
  return true;
}
function changeCart(productId, amount, color = "") {
  const key = cartKey(productId, color);
  const line = cart.find(item => cartKey(item.productId, item.color) === key);
  if (!line) return;
  line.quantity += amount;
  if (line.quantity <= 0) cart = cart.filter(item => cartKey(item.productId, item.color) !== key);
  saveCart(); renderCart();
}

function openLayer(name) { $("#overlay").classList.remove("hidden"); if (name === "cart") { $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden", "false"); } else $(name).classList.remove("hidden"); }
function closeLayers() { $("#overlay").classList.add("hidden"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden", "true"); $$(".modal").forEach(modal => modal.classList.add("hidden")); }
function renderCheckout() {
  const lines = validCart(); const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  $("#checkoutItems").innerHTML = lines.map(line => `<div class="checkout-line"><span>${escapeHtml(line.product.name)}${line.color ? ` · ສີ${escapeHtml(line.color)}` : ""} × ${line.quantity}</span><span>${money(line.product.price * line.quantity)}</span></div>`).join("");
  $("#checkoutTotal").textContent = money(total); renderPaymentDetails();
}
function renderPaymentDetails() {
  const payment = data.payment;
  $("#paymentAccount").textContent = [payment.accountName, payment.accountNumber].filter(Boolean).join(" · ") || "ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງຄ່າ QR Code";
  $("#paymentQrBox").innerHTML = payment.qrImage ? `<img src="${payment.qrImage}" alt="QR Code ຮັບເງິນ">` : "<div>ຜູ້ຈັດການຈະອັບໂຫຼດ QR Code ໄວ້ບ່ອນນີ້</div>";
}
function toggleTransferFields() { const isTransfer = $("input[name=paymentMethod]:checked").value === "transfer"; $("#transferFields").classList.toggle("hidden", !isTransfer); }

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
      await Promise.all([refreshOrders(), refreshProducts()]);
      toast("ຮັບອໍເດີແລ້ວ · ຕັດສະຕັອກ ແລະ ຍ້າຍໄປ “ຕ້ອງຈັດສົ່ງ”");
    } else {
      const { error } = await supabase.from("orders").update({ status: "needOrder", acceptedAt: now }).eq("id", order.id);
      if (error) throw error;
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
function renderManager() { renderShopProfile(); renderDashboard(); renderOrders(); renderRestock(); renderShipping(); renderManagerProducts(); renderCategoriesManager(); renderPaymentForm(); renderFinancials(); renderShopProfileForm(); renderProductCategories(); }
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
      <span>${escapeHtml(item.name)} × ${item.quantity}${item.supplierUrl ? ` <a class="supplier-link" href="${escapeHtml(item.supplierUrl)}" target="_blank" rel="noopener">ລິ້ງຮ້ານ ↗</a>` : ""}</span>
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
        ${order.receipt ? `<button class="receipt-button" data-view-receipt="${escapeHtml(order.id)}">ເບິ່ງໃບໂອນ</button><img id="receipt-${escapeHtml(order.id)}" class="receipt-img hidden" src="${escapeHtml(order.receipt)}" alt="ໃບໂອນ">` : ""}
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
function renderProductCategories() {
  const opts = [`<option value="">— ບໍ່ລະບຸໝວດ —</option>`];
  childrenOf(null).forEach(l1 => {
    opts.push(`<option value="${l1.id}">${escapeHtml(l1.icon || "")} ${escapeHtml(l1.name)}</option>`);
    childrenOf(l1.id).forEach(l2 => {
      opts.push(`<option value="${l2.id}">　└ ${escapeHtml(l2.name)} (ທົ່ວໄປ)</option>`);
      childrenOf(l2.id).forEach(l3 =>
        opts.push(`<option value="${l3.id}">　　└ ${escapeHtml(l2.name)} › ${escapeHtml(l3.name)}</option>`));
    });
  });
  const sel = $("#productCategory"); const keep = sel.value;
  sel.innerHTML = opts.join("");
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
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
      </div>
      <div class="product-finance"><strong>ຂາຍ ${money(product.price)}</strong><span>ຕົ້ນທຶນ ${money(product.cost)} · ກຳໄລ ${money(product.price - product.cost)}</span></div>
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
function renderCategoriesManager() {
  // ຊ່ອງເລືອກ "ເພີ່ມເຂົ້າໃນ"
  const options = [`<option value="">— ສ້າງເປັນໝວດໃຫຍ່ໃໝ່ —</option>`];
  childrenOf(null).forEach(l1 => {
    options.push(`<option value="${l1.id}">${escapeHtml(l1.icon || "")} ${escapeHtml(l1.name)}</option>`);
    childrenOf(l1.id).forEach(l2 => options.push(`<option value="${l2.id}">　└ ${escapeHtml(l1.name)} › ${escapeHtml(l2.name)}</option>`));
  });
  const parentSelect = $("#categoryParent");
  const keep = parentSelect.value;
  parentSelect.innerHTML = options.join("");
  if ([...parentSelect.options].some(o => o.value === keep)) parentSelect.value = keep;

  // ຕົ້ນໄມ້ໝວດ
  const roots = childrenOf(null);
  $("#categoryTree").innerHTML = roots.length ? roots.map(l1 => {
    const kids = childrenOf(l1.id);
    return `<details class="cat-node level-1" open>
      <summary>
        <span class="node-art">${l1.image ? `<img src="${escapeHtml(l1.image)}" alt="">` : escapeHtml(l1.icon || "📦")}</span>
        <b>${escapeHtml(l1.name)}</b>
        <small>${productCountIn(l1.id)} ລາຍການ · ${kids.length} ກຸ່ມ</small>
        <span class="node-tools">
          <button type="button" data-cat-image="${l1.id}" title="ໃສ່ຮູບໝວດ">🖼</button>
          <button type="button" data-cat-rename="${l1.id}" title="ແກ້ໄຂຊື່">✎</button>
          <button type="button" class="danger" data-cat-delete="${l1.id}" title="ລຶບ">×</button>
        </span>
      </summary>
      ${kids.map(l2 => {
        const models = childrenOf(l2.id);
        return `<details class="cat-node level-2">
          <summary>
            <b>${escapeHtml(l2.name)}</b>
            <small>${productCountIn(l2.id)} ລາຍການ · ${models.length} ຮຸ່ນ</small>
            <span class="node-tools">
              <button type="button" data-cat-rename="${l2.id}" title="ແກ້ໄຂຊື່">✎</button>
              <button type="button" class="danger" data-cat-delete="${l2.id}" title="ລຶບ">×</button>
            </span>
          </summary>
          <div class="model-chips">${models.length ? models.map(m =>
            `<span class="category-chip${productCountIn(m.id) ? " has-items" : ""}">${escapeHtml(m.name)}<small class="muted">(${productCountIn(m.id)})</small>
              <button type="button" data-cat-rename="${m.id}" title="ແກ້ໄຂຊື່">✎</button>
              <button type="button" class="danger" data-cat-delete="${m.id}" title="ລຶບ">×</button></span>`).join("")
            : `<p class="muted small-copy">ຍັງບໍ່ມີຮຸ່ນ — ເພີ່ມຈາກຟອມຂ້າງເທິງ</p>`}</div>
        </details>`;
      }).join("") || `<p class="muted small-copy" style="padding:8px 12px">ຍັງບໍ່ມີກຸ່ມຍ່ອຍ</p>`}
    </details>`;
  }).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີໝວດສິນຄ້າ — ເພີ່ມໝວດໃຫຍ່ທຳອິດຈາກຟອມຂ້າງເທິງ</p>`;
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
function switchManagerTab(tab) { $$(".manager-tab").forEach(button => button.classList.toggle("active", button.dataset.managerTab === tab)); $$(".manager-pane").forEach(pane => pane.classList.toggle("hidden", pane.dataset.pane !== tab)); if (tab === "dashboard") renderDashboard(); if (tab === "orders") renderOrders(); if (tab === "restock") renderRestock(); if (tab === "shipping") renderShipping(); if (tab === "products") { renderProductCategories(); renderManagerProducts(); } if (tab === "categories") renderCategoriesManager(); if (tab === "payment") renderPaymentForm(); if (tab === "financial") renderFinancials(); if (tab === "profile") renderShopProfileForm(); }

function setPriceMode() { const mode = $("#priceMode").value; $("#markupField").classList.toggle("hidden", mode !== "markup"); $("#sellPriceField").classList.toggle("hidden", mode !== "manual"); updatePricePreview(); }
function updatePricePreview() { const cost = Number($("#costInput").value || 0); const mode = $("#priceMode").value; const markup = Number($("#markupInput").value || 0); const rawPrice = mode === "markup" ? Math.round(cost * (1 + markup / 100) / 1000) * 1000 : Number($("#sellPriceInput").value || 0); const price = Math.max(0, rawPrice); $("#calculatedPrice").textContent = money(price); const profit = price - cost; $("#profitPreview").textContent = `ກຳໄລ ${money(profit)} / ຊິ້ນ${cost ? ` (${Math.round((profit / cost) * 100)}%)` : ""}`; return price; }
function setImagePreview(html) {
  previewUrls.forEach(u => URL.revokeObjectURL(u)); previewUrls = [];
  $("#productImagePreview").innerHTML = html;
  $("#multiModeBox")?.classList.add("hidden");
}
function openProductForm(product = null) {
  editingProductId = product?.id ?? null; const form = $("#productForm"); form.reset(); renderProductCategories();
  selectedModels = new Set(product ? productModelIds(product) : []);
  if ($("#modelSearch")) $("#modelSearch").value = "";
  $("#modelPasteBox")?.classList.add("hidden");
  if ($("#modelPasteInput")) $("#modelPasteInput").value = "";
  if ($("#modelPasteResult")) $("#modelPasteResult").textContent = "";
  pendingNewModels = [];
  $("#modelAddMissing")?.classList.add("hidden");
  renderModelList();
  $("#productFormTitle").textContent = product ? "ແກ້ໄຂສິນຄ້າ" : "ເພີ່ມສິນຄ້າໃໝ່";
  if (product) {
    form.productId.value = product.id; form.name.value = product.name; form.categoryId.value = product.categoryId;
    form.saleMode.value = product.saleMode || "inStock"; form.stock.value = product.stock; form.description.value = product.description || "";
    form.supplierUrl.value = product.supplierUrl || ""; form.cost.value = product.cost; form.priceMode.value = "manual"; form.sellPrice.value = product.price;
    form.colors.value = productColors(product).join(", ");
    const existing = productImages(product);
    setImagePreview(existing.length
      ? `<div class="preview-strip">${existing.map((u, i) => `<figure><img src="${escapeHtml(u)}" alt=""><figcaption>${i + 1}</figcaption></figure>`).join("")}</div>`
      : `<span class="input-hint">ສິນຄ້ານີ້ຍັງບໍ່ມີຮູບ</span>`);
  } else {
    form.saleMode.value = "onDemand"; form.stock.value = 0; form.priceMode.value = "markup"; form.markup.value = 20;
    setImagePreview(`<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກຮູບ</span>`);
  }
  setPriceMode(); $("#productFormWrap").classList.remove("hidden"); $("#productFormWrap").scrollIntoView({ behavior: "smooth", block: "start" });
}
// ---------- ລາຍການຕິກເລືອກລຸ້ນ ----------
// ສ້າງລຸ້ນໃໝ່ເຂົ້າກຸ່ມ (ຂ້າມອັນທີ່ມີຢູ່ແລ້ວ) ແລ້ວຕິກໃຫ້ທັງໝົດ
async function addModelsToGroup(parentId, names) {
  const parent = catById(parentId);
  if (!parent) { toast("ບໍ່ພົບກຸ່ມ"); return { added: [], existed: [] }; }
  const existing = childrenOf(parentId);
  const added = [], existed = [];
  const rows = [];
  let sort = (existing.length + 1) * 10;
  names.forEach(raw => {
    const name = String(raw).trim();
    if (!name) return;
    const hit = existing.find(c => normModel(c.name) === normModel(name));
    if (hit) { selectedModels.add(String(hit.id)); existed.push(hit.name); return; }
    if (rows.some(r => normModel(r.name) === normModel(name))) return;
    rows.push({ name, parentId: Number(parentId), sort: (sort += 10) });
    added.push(name);
  });
  if (rows.length) {
    const { data: created, error } = await supabase.from("categories").insert(rows).select();
    if (error) { console.error(error); toast(`ເພີ່ມບໍ່ສຳເລັດ: ${error.message}`); return { added: [], existed }; }
    (created || []).forEach(c => selectedModels.add(String(c.id)));
    await refreshCategories();
  }
  renderModelList();
  return { added, existed };
}
// ຊ່ອງເລືອກກຸ່ມ ສຳລັບ "ເພີ່ມລຸ້ນທີ່ຍັງບໍ່ມີ"
function renderModelGroupSelect() {
  const sel = $("#modelAddGroup"); if (!sel) return;
  const keep = sel.value;
  const opts = [];
  childrenOf(null).forEach(l1 => childrenOf(l1.id).forEach(l2 =>
    opts.push(`<option value="${l2.id}">${escapeHtml(l1.icon || "")} ${escapeHtml(l1.name)} › ${escapeHtml(l2.name)}</option>`)));
  sel.innerHTML = opts.join("");
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function renderModelList() {
  const query = normModel($("#modelSearch")?.value || "");
  // ສ້າງກຸ່ມຈາກໂຄງໝວດ (ກຸ່ມທີ່ຍັງບໍ່ມີລຸ້ນເລີຍ ກໍສະແດງ ເພື່ອກົດ + ເພີ່ມໄດ້)
  const groups = new Map();
  childrenOf(null).forEach(l1 => childrenOf(l1.id).forEach(l2 => {
    const key = `${l1.icon || ""} ${l1.name} › ${l2.name}`;
    const items = childrenOf(l2.id).filter(m => !query || normModel(m.name).includes(query));
    if (query && !items.length) return;
    groups.set(key, { parentId: l2.id, items });
  }));
  const box = $("#modelList");
  if (!box) return;
  box.innerHTML = groups.size ? [...groups.entries()].map(([label, { parentId, items }]) => {
    const allOn = items.length && items.every(m => selectedModels.has(String(m.id)));
    return `<div class="model-group">
      <div class="model-group-head">
        <b>${escapeHtml(label)}</b>
        <span class="head-tools">
          <button type="button" class="small-button" data-model-all="${items.map(m => m.id).join(",")}">${allOn ? "ເອົາອອກ" : "ເລືອກໝົດ"}</button>
          <button type="button" class="small-button add" data-model-add-to="${parentId}">+ ເພີ່ມລຸ້ນ</button>
        </span>
      </div>
      <div class="model-options">${items.length ? items.map(m => `
        <label class="model-chip${selectedModels.has(String(m.id)) ? " on" : ""}">
          <input type="checkbox" data-model-id="${m.id}" ${selectedModels.has(String(m.id)) ? "checked" : ""}>
          <span>${escapeHtml(m.name)}</span>
        </label>`).join("") : `<span class="muted small-copy">ຍັງບໍ່ມີລຸ້ນໃນກຸ່ມນີ້ — ກົດ “+ ເພີ່ມລຸ້ນ”</span>`}</div>
    </div>`;
  }).join("") : `<p class="muted small-copy">ບໍ່ພົບລຸ້ນ — ລອງພິມຄຳອື່ນ ຫຼື ໄປເພີ່ມລຸ້ນໃໝ່ທີ່ແທັບ “ໝວດສິນຄ້າ”</p>`;
  const countEl = $("#modelCount"); if (countEl) countEl.textContent = selectedModels.size;
  renderModelGroupSelect();
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
}
async function refreshExpenses() { data.expenses = await fetchTable("expenses"); renderFinancials(); }
async function refreshSettings() {
  const { data: row, error } = await supabase.from("settings").select("*").eq("id", "store").maybeSingle();
  if (error) console.error("settings:", error);
  data.profile = { ...defaultProfile, ...(row?.profile || {}) };
  data.payment = { ...defaultPayment, ...(row?.payment || {}) };
  renderShopProfile(); renderShopProfileForm(); renderPaymentForm(); renderPaymentDetails();
}
function renderAll() {
  renderCustomerShop(); renderCart();
  renderDashboard(); renderOrders(); renderRestock(); renderShipping(); renderManagerProducts(); renderCategoriesManager(); renderProductCategories(); renderFinancials();
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
  const receiptFile = $("#receiptInput").files[0];
  const receipt = await uploadImage(receiptFile, "receipts");
  const order = {
    id,
    status: "new",
    customer: { name: values.get("customerName"), phone: values.get("phone"), address: values.get("address"), transportBranch: values.get("transportBranch"), deliveryMethod: values.get("deliveryMethod"), note: values.get("note") },
    paymentMethod: values.get("paymentMethod"),
    receipt,
    items: lines.map(({ product, quantity, color }) => ({ productId: product.id, name: product.name, color: color || "", price: product.price, cost: product.cost, quantity, supplierUrl: product.supplierUrl || "" }))
  };
  const { error } = await supabase.from("orders").insert(order);
  if (error) throw error;
  // ບໍ່ຕັດສະຕັອກຢູ່ບ່ອນນີ້ອີກແລ້ວ — ຈະຕັດຕອນຜູ້ຈັດການກົດ “ຮັບອໍເດີ” (ເບິ່ງ acceptOrder)
  await refreshOrders();
  cart = []; saveCart(); closeLayers();
  $("#successText").textContent = `ເລກອໍເດີຂອງທ່ານ: ${id} · ຮ້ານຈະຕິດຕໍ່ກັບໄວ.`; $("#successModal").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  console.log("SL-Mobile app version", APP_VERSION);
  const vBox = $("#appVersion"); if (vBox) vBox.textContent = `ລຸ້ນ ${APP_VERSION}`;
  renderShopProfile(); renderCustomerShop(); renderCart();

  // ---- ໂຫລດຂໍ້ມູນຄັ້ງທຳອິດ ແລ້ວເປີດ realtime (ອັບເດດອັດຕະໂນມັດທຸກເຄື່ອງ) ----
  refreshCategories(); refreshProducts(); refreshOrders(); refreshExpenses(); refreshSettings();
  subscribeRealtime();
  checkConnection();

  // ---- ສະຖານະການ login ----
  supabase.auth.onAuthStateChange((event, session) => {
    managerUser = session?.user || null;
    if (!authReadyOnce) { authReadyOnce = true; if (managerUser) showManager(); }
  });

  $("#customerSearch").addEventListener("input", renderCustomerShop);
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
  $("#cartItems").addEventListener("click", event => { const remove = event.target.closest("[data-cart-remove]"); const change = event.target.closest("[data-cart-change]"); if (remove) { const key = cartKey(remove.dataset.cartRemove, remove.dataset.color || ""); cart = cart.filter(line => cartKey(line.productId, line.color) !== key); saveCart(); renderCart(); }
    if (change) changeCart(change.dataset.productId, Number(change.dataset.cartChange), change.dataset.color || ""); });
  $("#checkoutButton").addEventListener("click", () => { if (!cart.length) return; closeLayers(); renderCheckout(); $("#checkoutModal").classList.remove("hidden"); });
  $$("input[name=paymentMethod]").forEach(input => input.addEventListener("change", toggleTransferFields));
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

  $("#openProductForm").addEventListener("click", () => openProductForm()); $("#closeProductForm").addEventListener("click", closeProductForm); $("#cancelProductForm").addEventListener("click", closeProductForm); $("#priceMode").addEventListener("change", setPriceMode); ["#costInput", "#markupInput", "#sellPriceInput"].forEach(id => $(id).addEventListener("input", updatePricePreview));
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
      const colors = (fd.get("colors") || "").split(",").map(c => c.trim()).filter(Boolean);
      const base = {
        name: fd.get("name").trim(),
        categoryId: Number(fd.get("categoryId")) || null,
        saleMode: fd.get("saleMode"),
        description: fd.get("description").trim(),
        cost: Number(fd.get("cost")), price,
        stock: Number(fd.get("stock")),
        supplierUrl: fd.get("supplierUrl").trim(),
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
        const { error } = await supabase.from("products").update({ ...base, images, image: images[0] || "" }).eq("id", old.id);
        if (error) throw error;
        toast("ແກ້ໄຂສິນຄ້າແລ້ວ");
      } else if (files.length > 1 && mode === "split") {
        // ແຍກ: 1 ຮູບ = 1 ສິນຄ້າ ຂໍ້ມູນອື່ນເໝືອນກັນໝົດ
        const rows = urls.map((url, i) => ({ ...base, name: `${base.name} #${i + 1}`, images: [url], image: url }));
        const { error } = await supabase.from("products").insert(rows);
        if (error) throw error;
        toast(`ສ້າງ ${rows.length} ສິນຄ້າແຍກກັນແລ້ວ (ລາຄາ ແລະ ຂໍ້ມູນເໝືອນກັນໝົດ)`);
      } else {
        // ລວມ: ສິນຄ້າດຽວ ຫຼາຍຮູບ
        const { error } = await supabase.from("products").insert({ ...base, images: urls, image: urls[0] || "" });
        if (error) throw error;
        toast(urls.length > 1 ? `ເພີ່ມສິນຄ້າແລ້ວ (${urls.length} ຮູບໃນບລັອກດຽວ)` : "ເພີ່ມສິນຄ້າແລ້ວ");
      }
      await refreshProducts();
      closeProductForm();
    } catch (err) {
      console.error(err); toast(`ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ: ${err.message || err}`);
    } finally { submitButton.disabled = false; submitButton.textContent = originalLabel; }
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
    const addTo = event.target.closest("[data-model-add-to]");
    if (addTo) {
      const parent = catById(addTo.dataset.modelAddTo);
      const input = prompt(`ເພີ່ມລຸ້ນເຂົ້າກຸ່ມ “${parent?.name || ""}”\n\nໃສ່ຫຼາຍລຸ້ນພ້ອມກັນໄດ້ — ຂັ້ນດ້ວຍ ຈຸດ (.) ຫຼື ຈຸດພາກ (,)\nຕົວຢ່າງ:  iPhone 18 . iPhone 18 Pro Max`, "");
      if (input === null) return;
      const names = input.split(/[\n\r\t.,;|/]+/).map(t => t.trim()).filter(Boolean);
      if (!names.length) return toast("ຍັງບໍ່ໄດ້ໃສ່ຊື່ລຸ້ນ");
      const { added, existed } = await addModelsToGroup(addTo.dataset.modelAddTo, names);
      toast(added.length ? `ເພີ່ມ ${added.length} ລຸ້ນ ແລະ ຕິກໃຫ້ແລ້ວ` : (existed.length ? "ລຸ້ນເຫຼົ່ານີ້ມີຢູ່ແລ້ວ · ຕິກໃຫ້ແລ້ວ" : "ບໍ່ໄດ້ເພີ່ມຫຍັງ"));
      return;
    }
    const all = event.target.closest("[data-model-all]"); if (!all) return;
    const ids = all.dataset.modelAll.split(",").filter(Boolean);
    const allOn = ids.every(id => selectedModels.has(id));
    ids.forEach(id => allOn ? selectedModels.delete(id) : selectedModels.add(id));
    renderModelList();
  });

  // ---- ວາງລາຍການລຸ້ນຈາກ Excel / Word ແລ້ວຕິກໃຫ້ອັດຕະໂນມັດ ----
  $("#modelPasteToggle").addEventListener("click", () => {
    const box = $("#modelPasteBox"); box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) $("#modelPasteInput").focus();
  });
  $("#modelPasteCancel").addEventListener("click", () => { $("#modelPasteBox").classList.add("hidden"); });
  $("#modelPasteApply").addEventListener("click", () => {
    const text = $("#modelPasteInput").value || "";
    // ຂັ້ນດ້ວຍ ຈຸດ / ຈຸດພາກ / ຂຶ້ນແຖວ / ແທັບ / ຂີດຕັ້ງ
    const parts = text.split(/[\n\r\t.,;|/]+/).map(t => t.trim()).filter(Boolean);
    if (!parts.length) return toast("ຍັງບໍ່ມີຂໍ້ຄວາມໃຫ້ອ່ານ");
    const models = allModelCategories();
    const matched = [], missed = [];
    parts.forEach(raw => {
      const key = normModel(raw);
      if (!key) return;
      // ຈັບຄູ່ຕົງກ່ອນ ຖ້າບໍ່ໄດ້ຄ່ອຍຈັບແບບມີຢູ່ໃນຊື່
      let hit = models.find(m => normModel(m.name) === key)
             || models.find(m => normModel(m.name).endsWith(key) && key.length >= 2)
             || models.find(m => normModel(m.name).includes(key) && key.length >= 3);
      if (hit) { selectedModels.add(String(hit.id)); if (!matched.includes(hit.name)) matched.push(hit.name); }
      else missed.push(raw);
    });
    renderModelList();
    pendingNewModels = [...new Set(missed)];
    const result = $("#modelPasteResult");
    result.innerHTML = `<b>ຕິກໃຫ້ແລ້ວ ${matched.length} ລຸ້ນ</b>`
      + (matched.length ? `<br><span class="ok">${matched.map(escapeHtml).join(" · ")}</span>` : "")
      + (pendingNewModels.length ? `<br><span class="miss">ຍັງບໍ່ມີໃນລະບົບ ${pendingNewModels.length} ລຸ້ນ: ${pendingNewModels.map(escapeHtml).join(", ")}</span>` : "");
    $("#modelAddMissing").classList.toggle("hidden", !pendingNewModels.length);
    if (pendingNewModels.length) $("#modelAddApply").textContent = `+ ເພີ່ມ ${pendingNewModels.length} ລຸ້ນນີ້ ແລະ ຕິກໃຫ້ເລີຍ`;
    toast(pendingNewModels.length ? `ຕິກໄດ້ ${matched.length} · ຍັງບໍ່ມີ ${pendingNewModels.length} ລຸ້ນ` : `ຕິກໃຫ້ແລ້ວ ${matched.length} ລຸ້ນ`);
  });

  // ເພີ່ມລຸ້ນທີ່ຍັງບໍ່ມີ ເຂົ້າໃນກຸ່ມທີ່ເລືອກ
  $("#modelAddApply").addEventListener("click", async event => {
    if (!pendingNewModels.length) return;
    const parentId = $("#modelAddGroup").value;
    if (!parentId) return toast("ກະລຸນາເລືອກກຸ່ມກ່ອນ");
    const button = event.currentTarget; button.disabled = true;
    try {
      const { added } = await addModelsToGroup(parentId, pendingNewModels);
      const parent = catById(parentId);
      $("#modelPasteResult").innerHTML = `<span class="ok">ເພີ່ມ ${added.length} ລຸ້ນເຂົ້າ “${escapeHtml(parent?.name || "")}” ແລະ ຕິກໃຫ້ແລ້ວ</span>`;
      pendingNewModels = [];
      $("#modelAddMissing").classList.add("hidden");
      toast(`ເພີ່ມ ${added.length} ລຸ້ນແລ້ວ`);
    } finally { button.disabled = false; }
  });

  // ຮູບຕົວຢ່າງ ພໍເລືອກໄຟລ໌ຮູບສິນຄ້າ
  $("#productImageInput").addEventListener("change", event => {
    const files = [...event.target.files];
    previewUrls.forEach(u => URL.revokeObjectURL(u)); previewUrls = [];
    const box = $("#productImagePreview"), modeBox = $("#multiModeBox");
    if (!files.length) { box.innerHTML = `<span class="input-hint">ຍັງບໍ່ໄດ້ເລືອກຮູບ</span>`; modeBox.classList.add("hidden"); return; }
    previewUrls = files.map(f => URL.createObjectURL(f));
    box.innerHTML = `<div class="preview-strip">${previewUrls.map((u, i) =>
      `<figure><img src="${u}" alt="ຮູບທີ ${i + 1}"><figcaption>${i + 1}</figcaption></figure>`).join("")}</div>`;
    $("#multiCount").textContent = files.length;
    modeBox.classList.toggle("hidden", files.length < 2);
  });
  // ປຸ່ມເພີ່ມ / ລົບ ສະຕັອກ
  $("#managerProducts").addEventListener("click", event => {
    const minus = event.target.closest("[data-stock-minus]"); const plus = event.target.closest("[data-stock-plus]");
    if (minus) return adjustStock(minus.dataset.stockMinus, -1);
    if (plus) return adjustStock(plus.dataset.stockPlus, 1);
    const edit = event.target.closest("[data-edit-product]"); const remove = event.target.closest("[data-delete-product]");
    if (edit) openProductForm(data.products.find(product => String(product.id) === edit.dataset.editProduct));
    if (remove) { const product = data.products.find(item => String(item.id) === remove.dataset.deleteProduct); if (product && confirm(`ລຶບ “${product.name}” ແທ້ບໍ?`)) { supabase.from("products").delete().eq("id", product.id).then(() => { cart = cart.filter(item => String(item.productId) !== String(product.id)); saveCart(); renderCart(); }); } }
  });
  // ພິມຈຳນວນສະຕັອກໂດຍກົງ ແລ້ວກົດ Enter ຫຼື ຄລິກອອກ
  $("#managerProducts").addEventListener("change", event => {
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

  $("#categoryForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, fd = new FormData(form);
    const name = (fd.get("name") || "").trim();
    const parentId = fd.get("parentId") ? Number(fd.get("parentId")) : null;
    const icon = (fd.get("icon") || "").trim();
    if (!name) return;
    const siblings = childrenOf(parentId);
    if (siblings.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast("ມີຊື່ນີ້ຢູ່ໃນລະດັບນີ້ແລ້ວ");
    const row = { name, parentId, icon, sort: (siblings.length + 1) * 10 };
    const { error } = await supabase.from("categories").insert(row);
    if (error) { console.error(error); return toast(`ເພີ່ມບໍ່ສຳເລັດ: ${error.message}`); }
    form.name.value = ""; form.icon.value = "";
    await refreshCategories();
    toast(parentId ? "ເພີ່ມຮຸ່ນ / ກຸ່ມຍ່ອຍແລ້ວ" : "ເພີ່ມໝວດໃຫຍ່ແລ້ວ");
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
    const warn = order.stockDeducted ? "\n\n⚠ ອໍເດີນີ້ຕັດສະຕັອກໄປແລ້ວ — ລະບົບຈະຄືນສະຕັອກໃຫ້ອັດຕະໂນມັດ." : "";
    if (!confirm(`ລຶບອໍເດີ ${order.id} ຖິ້ມແທ້ບໍ?\n\nລູກຄ້າ: ${order.customer.name}\nມູນຄ່າ: ${money(orderTotal(order))}${warn}\n\nລຶບແລ້ວກູ້ຄືນບໍ່ໄດ້.`)) return;
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
      await Promise.all([refreshOrders(), refreshProducts()]);
      toast(order.stockDeducted ? "ລຶບອໍເດີ ແລະ ຄືນສະຕັອກແລ້ວ" : "ລຶບອໍເດີແລ້ວ");
    } catch (err) { console.error(err); toast(`ລຶບບໍ່ສຳເລັດ: ${err.message || err}`); }
    finally { button.disabled = false; }
  });


  // ---- ນຳທາງໝວດ 3 ຊັ້ນ (ໜ້າຮ້ານ) ----
  $("#catGrid").addEventListener("click", event => {
    const card = event.target.closest("[data-cat-open]"); if (!card) return;
    const id = card.dataset.catOpen;
    if (!navL1) { navL1 = id; navL2 = null; navL3 = null; }
    else if (!navL2) { navL2 = id; navL3 = null; }
    renderCustomerShop();
    $("#products").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#catBreadcrumb").addEventListener("click", event => {
    const button = event.target.closest("[data-cat-goto]"); if (!button) return;
    const target = button.dataset.catGoto;
    if (target === "root") { navL1 = navL2 = navL3 = null; }
    else if (String(target) === String(navL1)) { navL2 = navL3 = null; }
    else if (String(target) === String(navL2)) { navL3 = null; }
    renderCustomerShop();
  });
  $("#catChips").addEventListener("click", event => {
    const button = event.target.closest("[data-cat-model]"); if (!button) return;
    navL3 = button.dataset.catModel === "all" ? null : button.dataset.catModel;
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
    if (pickImg) { detailState.imageIndex = Number(pickImg.dataset.pickImage); return updateDetailImage(); }
    if (pickColor) { detailState.color = pickColor.dataset.pickColor; return updateDetailColor(); }
    if (zoom) return openImageViewer(zoom.dataset.zoomImage);
    if (add) {
      if (!addToCart(add.dataset.detailAdd, detailState.color)) return;
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
      const already = cart.some(l => String(l.productId) === String(product.id) && (l.color || "") === (detailState.color || ""));
      if (!already && !addToCart(buy.dataset.detailBuy, detailState.color)) return;
      renderCheckout(); closeLayers();
      $("#checkoutModal").classList.remove("hidden"); $("#overlay").classList.remove("hidden");
    }
  });

  // ---- ຈັດການໝວດສິນຄ້າ (ເພີ່ມ / ແກ້ຊື່ / ລຶບ / ໃສ່ຮູບ) ----
  let pendingCategoryImage = null;
  $("#categoryTree").addEventListener("click", async event => {
    const rename = event.target.closest("[data-cat-rename]");
    const remove = event.target.closest("[data-cat-delete]");
    const setImg = event.target.closest("[data-cat-image]");
    if (rename || remove || setImg) { event.preventDefault(); event.stopPropagation(); }

    if (setImg) { pendingCategoryImage = setImg.dataset.catImage; $("#categoryImageInput").click(); return; }

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
      const kids = descendantIds(cat.id).length - 1;
      const items = productCountIn(cat.id);
      if (items) return toast(`ລຶບບໍ່ໄດ້: ຍັງມີສິນຄ້າ ${items} ລາຍການຢູ່ໃນນີ້`);
      if (!confirm(`ລຶບ “${cat.name}” ແທ້ບໍ?${kids ? `\n\nຈະລຶບໝວດຍ່ອຍພາຍໃນ ${kids} ລາຍການນຳ.` : ""}`)) return;
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) { console.error(error); return toast(`ລຶບບໍ່ສຳເລັດ: ${error.message}`); }
      await refreshCategories(); toast("ລຶບແລ້ວ");
    }
  });
  $("#categoryImageInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file || !pendingCategoryImage) { event.target.value = ""; return; }
    toast("ກຳລັງອັບໂຫລດຮູບໝວດ...");
    try {
      const url = await uploadImage(file, "products");
      const { error } = await supabase.from("categories").update({ image: url }).eq("id", pendingCategoryImage);
      if (error) throw error;
      await refreshCategories(); toast("ໃສ່ຮູບໝວດແລ້ວ");
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
