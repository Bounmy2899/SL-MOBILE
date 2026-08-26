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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseUrl, supabaseAnonKey } from "./supabase-config.js";

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
let activeCategory = "all";
let activeOrderFilter = "all";
let editingProductId = null;

// ---------- 3) Helpers ----------
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const money = (value) => `${Number(value || 0).toLocaleString("en-US")} ₭`;
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveCart() { localStorage.setItem("phonemani-cart", JSON.stringify(cart)); }
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const placeholder = '<div class="placeholder-art" aria-hidden="true"></div>';
const imageMarkup = (product, className = "") => product.image ? `<img class="${className}" src="${product.image}" alt="${escapeHtml(product.name)}">` : placeholder;
const categoryName = (id) => data.categories.find(category => category.id === id)?.name || "ບໍ່ມີໝວດ";
const isOnDemand = (product) => product.saleMode === "onDemand";
function isManager() { return !!managerUser; }
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add("hidden"), 2800); }
function dateLabel(value) { return new Date(value).toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" }); }
function orderTotal(order) { return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0); }

// ອັບໂຫລດຮູບໜຶ່ງໃບຂຶ້ນ Supabase Storage (bucket ຊື່ "images"), ໄດ້ຄືນ URL ສຳລັບເອົາໄປໃສ່ໃນຖານຂໍ້ມູນ
async function uploadImage(file, folder) {
  if (!file) return "";
  const path = `${folder}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("images").upload(path, file, { upsert: false });
  if (error) { console.error(error); throw error; }
  const { data: pub } = supabase.storage.from("images").getPublicUrl(path);
  return pub.publicUrl;
}

// ---------- 4) Render functions (ຄືເກົ່າ ບໍ່ໄດ້ແກ້ຫຍັງຫຼາຍ) ----------
function renderCustomerShop() {
  const query = $("#customerSearch").value.trim().toLowerCase();
  $("#categoryTabs").innerHTML = [`<button class="${activeCategory === "all" ? "active" : ""}" data-category="all">ທັງໝົດ</button>`, ...data.categories.map(c => `<button class="${activeCategory === c.id ? "active" : ""}" data-category="${c.id}">${escapeHtml(c.name)}</button>`)].join("");
  const products = data.products.filter(product => {
    const matchesCategory = activeCategory === "all" || product.categoryId === activeCategory;
    const haystack = `${product.name} ${product.description} ${categoryName(product.categoryId)}`.toLowerCase();
    return matchesCategory && haystack.includes(query);
  });
  $("#productGrid").innerHTML = products.map(product => {
    const available = isOnDemand(product) || product.stock > 0;
    const stockText = isOnDemand(product) ? "ສັ່ງໃຫ້ຕາມອໍເດີ" : (product.stock > 0 ? `ພ້ອມສົ່ງ ${product.stock} ຊິ້ນ` : "ສິນຄ້າໝົດ");
    return `<article class="product-card"><div class="product-image">${imageMarkup(product)}</div><div class="product-body"><p class="product-category">${escapeHtml(categoryName(product.categoryId))}</p><h3 class="product-name">${escapeHtml(product.name)}</h3><p class="product-description">${escapeHtml(product.description || "ສິນຄ້າຄຸນນະພາບ ພ້ອມໃຫ້ເລືອກ")}</p><div class="product-bottom"><div><strong class="product-price">${money(product.price)}</strong><span class="product-stock">${stockText}</span></div><button class="add-button" data-add-product="${product.id}" ${!available ? "disabled" : ""} aria-label="ເພີ່ມ ${escapeHtml(product.name)} ໃສ່ກະຕ່າ">+</button></div></div></article>`;
  }).join("");
  $("#emptyProducts").classList.toggle("hidden", products.length > 0);
}

function validCart() {
  cart = cart.filter(line => data.products.some(product => String(product.id) === String(line.productId)));
  return cart.map(line => ({ ...line, product: data.products.find(product => String(product.id) === String(line.productId)) })).filter(line => line.product);
}
function renderCart() {
  const lines = validCart(); saveCart();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);
  $("#checkoutButton").disabled = !lines.length;
  $("#cartItems").innerHTML = lines.length ? lines.map(({ product, quantity }) => `<div class="cart-line"><div class="cart-thumb">${imageMarkup(product)}</div><div><h4>${escapeHtml(product.name)}</h4><p>${money(product.price)}</p><div class="quantity-control"><button data-cart-change="-1" data-product-id="${product.id}">−</button><span>${quantity}</span><button data-cart-change="1" data-product-id="${product.id}">+</button></div></div><button class="remove-cart" data-cart-remove="${product.id}" aria-label="ລຶບ">×</button></div>`).join("") : `<div class="cart-empty"><p>ກະຕ່າຍັງຫວ່າງ</p><small>ເລືອກສິນຄ້າເພື່ອເລີ່ມສັ່ງຊື້</small></div>`;
}
function addToCart(productId) {
  const product = data.products.find(item => String(item.id) === String(productId));
  if (!product || (!isOnDemand(product) && product.stock <= 0)) return;
  const inCart = cart.find(line => String(line.productId) === String(productId));
  if (inCart) { if (!isOnDemand(product) && inCart.quantity >= product.stock) return toast("ຈຳນວນໃນກະຕ່າເທົ່າກັບສະຕັອກແລ້ວ"); inCart.quantity += 1; } else cart.push({ productId, quantity: 1 });
  saveCart(); renderCart(); toast("ເພີ່ມໃສ່ກະຕ່າແລ້ວ");
}
function changeCart(productId, amount) {
  const line = cart.find(item => String(item.productId) === String(productId)); const product = data.products.find(item => String(item.id) === String(productId)); if (!line || !product) return;
  line.quantity += amount; if (line.quantity <= 0) cart = cart.filter(item => String(item.productId) !== String(productId)); if (!isOnDemand(product) && line.quantity > product.stock) { line.quantity = product.stock; toast("ສິນຄ້າມີເທົ່າຈຳນວນສະຕັອກ"); }
  saveCart(); renderCart();
}

function openLayer(name) { $("#overlay").classList.remove("hidden"); if (name === "cart") { $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden", "false"); } else $(name).classList.remove("hidden"); }
function closeLayers() { $("#overlay").classList.add("hidden"); $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden", "true"); $$(".modal").forEach(modal => modal.classList.add("hidden")); }
function renderCheckout() {
  const lines = validCart(); const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  $("#checkoutItems").innerHTML = lines.map(line => `<div class="checkout-line"><span>${escapeHtml(line.product.name)} × ${line.quantity}</span><span>${money(line.product.price * line.quantity)}</span></div>`).join("");
  $("#checkoutTotal").textContent = money(total); renderPaymentDetails();
}
function renderPaymentDetails() {
  const payment = data.payment;
  $("#paymentAccount").textContent = [payment.accountName, payment.accountNumber].filter(Boolean).join(" · ") || "ຮ້ານຍັງບໍ່ໄດ້ຕັ້ງຄ່າ QR Code";
  $("#paymentQrBox").innerHTML = payment.qrImage ? `<img src="${payment.qrImage}" alt="QR Code ຮັບເງິນ">` : "<div>ຜູ້ຈັດການຈະອັບໂຫຼດ QR Code ໄວ້ບ່ອນນີ້</div>";
}
function toggleTransferFields() { const isTransfer = $("input[name=paymentMethod]:checked").value === "transfer"; $("#transferFields").classList.toggle("hidden", !isTransfer); }

function statusLabel(status) { return { new: "ອໍເດີໃໝ່", accepted: "ຮັບອໍເດີແລ້ວ", ordering: "ກຳລັງສັ່ງສິນຄ້າ", inbound: "ສິນຄ້າກຳລັງມາຮ້ານ", preparing: "ກຽມສົ່ງໃຫ້ລູກຄ້າ", shipping: "ກຳລັງຈັດສົ່ງ", complete: "ສຳເລັດ", cancelled: "ຍົກເລີກ" }[status] || status; }
function paymentLabel(method) { return { cod: "ເກັບເງິນປາຍທາງ", transfer: "ໂອນເງິນ", pickup: "ຈ່າຍຕອນຮັບທີ່ຮ້ານ" }[method] || method; }

function showManager() {
  closeLayers(); $(".app-shell").classList.add("hidden"); $("#managerView").classList.remove("hidden"); renderManager(); window.scrollTo({ top: 0, behavior: "instant" });
}
function showShop() { $("#managerView").classList.add("hidden"); $(".app-shell").classList.remove("hidden"); renderShopProfile(); renderCustomerShop(); renderCart(); }
function renderManager() { renderShopProfile(); renderDashboard(); renderOrders(); renderManagerProducts(); renderCategoriesManager(); renderPaymentForm(); renderFinancials(); renderShopProfileForm(); renderProductCategories(); }
function renderDashboard() {
  const activeOrders = data.orders.filter(order => !["cancelled", "complete"].includes(order.status));
  const pendingValue = activeOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const stockCount = data.products.filter(product => !isOnDemand(product)).reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const stats = [["ອໍເດີໃໝ່", activeOrders.filter(order => order.status === "new").length, "ກົດຮັບອໍເດີເພື່ອເລີ່ມດຳເນີນການ"], ["ອໍເດີກຳລັງດຳເນີນການ", activeOrders.length, "ບໍ່ລວມອໍເດີສຳເລັດ/ຍົກເລີກ"], ["ມູນຄ່າອໍເດີລໍຖ້າ", money(pendingValue), "ຍັງບໍ່ໄດ້ນັບເປັນຍອດຮັບເຂົ້າ"], ["ສະຕັອກພ້ອມສົ່ງ", `${stockCount} ຊິ້ນ`, "ບໍ່ລວມສິນຄ້າສັ່ງຕາມອໍເດີ"]];
  $("#statsGrid").innerHTML = stats.map(item => `<div class="stat-card"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const recent = [...data.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  $("#recentOrders").innerHTML = recent.length ? recent.map(order => `<div class="recent-order"><div><strong>${order.id}</strong><small>${escapeHtml(order.customer.name)} · ${money(orderTotal(order))}</small></div><span class="status-badge status-${order.status}">${statusLabel(order.status)}</span></div>`).join("") : `<p class="muted small-copy">ຍັງບໍ່ມີອໍເດີ</p>`;
  const queueList = data.orders.filter(order => ["accepted", "ordering", "inbound", "preparing"].includes(order.status)).flatMap(order => order.items.map(item => ({...item, orderId: order.id}))).filter(item => item.supplierUrl);
  $("#supplierQueue").innerHTML = queueList.length ? queueList.map(item => `<div class="queue-line"><div><strong>${escapeHtml(item.name)} × ${item.quantity}</strong><span>${item.orderId} · ຕົ້ນທຶນ ${money(item.cost)}</span></div><a href="${escapeHtml(item.supplierUrl)}" target="_blank" rel="noopener" class="supplier-link">ໄປຮ້ານ ↗</a></div>`).join("") : `<p class="muted small-copy">ສິນຄ້າທີ່ມີລິ້ງຮ້ານຕົ້ນທາງຈະສະແດງຢູ່ບ່ອນນີ້.</p>`;
  $("#orderBadge").textContent = data.orders.filter(order => order.status === "new").length;
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
function renderOrders() {
  const query = $("#managerOrderSearch").value.trim().toLowerCase();
  const statuses = [["all", "ທັງໝົດ"], ["new", "ໃໝ່"], ["accepted", "ຮັບແລ້ວ"], ["ordering", "ກຳລັງສັ່ງ"], ["inbound", "ສິນຄ້າກຳລັງມາ"], ["preparing", "ກຽມສົ່ງ"], ["shipping", "ກຳລັງສົ່ງ"], ["complete", "ສຳເລັດ"], ["cancelled", "ຍົກເລີກ"]];
  $("#orderFilters").innerHTML = statuses.map(([value, label]) => `<button data-order-filter="${value}" class="${activeOrderFilter === value ? "active" : ""}">${label}</button>`).join("");
  const orders = [...data.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(order => {
    const matchesStatus = activeOrderFilter === "all" || order.status === activeOrderFilter;
    const text = `${order.id} ${order.customer.name} ${order.customer.phone} ${order.customer.address}`.toLowerCase(); return matchesStatus && text.includes(query);
  });
  $("#ordersList").innerHTML = orders.length ? orders.map(order => `<article class="order-card"><div class="order-card-head"><div><h3 class="order-id">${order.id}</h3><span class="order-date">${dateLabel(order.createdAt)}</span></div><div><div class="order-summary-price">${money(orderTotal(order))}</div><span class="status-badge status-${order.status}">${statusLabel(order.status)}</span></div></div><div class="order-card-body"><div><h4>ຂໍ້ມູນລູກຄ້າ</h4><p><b>${escapeHtml(order.customer.name)}</b> · ${escapeHtml(order.customer.phone)}</p><p>${escapeHtml(order.customer.deliveryMethod === "pickup" ? "ຮັບເອງທີ່ຮ້ານ" : (order.customer.address || "ບໍ່ໄດ້ລະບຸທີ່ຢູ່"))}</p><p>ຂົນສົ່ງ: ${escapeHtml(order.customer.transportBranch || "ບໍ່ໄດ້ລະບຸ")}<br>ຈ່າຍ: ${paymentLabel(order.paymentMethod)}</p>${order.customer.note ? `<p>ໝາຍເຫດ: ${escapeHtml(order.customer.note)}</p>` : ""}${order.receipt ? `<button class="receipt-button" data-view-receipt="${order.id}">ເບິ່ງໃບໂອນ</button><img id="receipt-${order.id}" class="receipt-img hidden" src="${order.receipt}" alt="ໃບໂອນ">` : ""}</div><div><h4>ສິນຄ້າທີ່ສັ່ງ</h4><div class="order-items-mini">${order.items.map(item => `<div class="order-item-mini"><span>${escapeHtml(item.name)} × ${item.quantity}${item.supplierUrl ? ` <a class="supplier-link" href="${escapeHtml(item.supplierUrl)}" target="_blank" rel="noopener">ລິ້ງຮ້ານ ↗</a>` : ""}</span><b>${money(item.price * item.quantity)}</b></div>`).join("")}</div></div></div><div class="order-card-foot"><span class="muted small-copy">ສາມາດປ່ຽນຫຼືຍ້ອນສະຖານະໄດ້ທຸກເວລາ</span><div class="order-actions">${order.status === "new" ? `<button class="small-button accept-order" data-accept-order="${order.id}">✓ ຮັບອໍເດີ</button>` : ""}<select class="order-status-select" data-order-status="${order.id}">${["new","accepted","ordering","inbound","preparing","shipping","complete","cancelled"].map(status => `<option value="${status}" ${order.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div></div></article>`).join("") : `<div class="empty-state"><h3>ບໍ່ພົບອໍເດີ</h3><p>ລອງເລືອກສະຖານະ ຫຼື ຄົ້ນຫາໃໝ່</p></div>`;
}
function renderProductCategories() { $("#productCategory").innerHTML = data.categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join(""); }
function renderManagerProducts() {
  $("#managerProducts").innerHTML = data.products.length ? data.products.map(product => `<article class="manager-product-row"><div class="manager-product-thumb">${imageMarkup(product)}</div><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(categoryName(product.categoryId))} · ${isOnDemand(product) ? "ສັ່ງຕາມອໍເດີ (ສະຕັອກ 0 ກໍໄດ້)" : `ພ້ອມສົ່ງ · ສະຕັອກ ${product.stock} ຊິ້ນ`}</p></div><div class="product-finance"><strong>ຂາຍ ${money(product.price)}</strong><span>ຕົ້ນທຶນ ${money(product.cost)} · ກຳໄລ ${money(product.price - product.cost)}</span></div><div class="product-tools"><button class="small-button" data-edit-product="${product.id}">ແກ້ໄຂ</button><button class="small-button delete" data-delete-product="${product.id}">ລຶບ</button></div></article>`).join("") : `<div class="empty-state"><h3>ຍັງບໍ່ມີສິນຄ້າ</h3><p>ກົດ “ເພີ່ມສິນຄ້າ” ເພື່ອເລີ່ມຕົ້ນ</p></div>`;
}
function renderCategoriesManager() { $("#categoriesManagerList").innerHTML = data.categories.map(category => `<div class="category-chip">${escapeHtml(category.name)} <button data-delete-category="${category.id}" aria-label="ລຶບໝວດ">×</button></div>`).join(""); }
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
function switchManagerTab(tab) { $$(".manager-tab").forEach(button => button.classList.toggle("active", button.dataset.managerTab === tab)); $$(".manager-pane").forEach(pane => pane.classList.toggle("hidden", pane.dataset.pane !== tab)); if (tab === "dashboard") renderDashboard(); if (tab === "orders") renderOrders(); if (tab === "products") { renderProductCategories(); renderManagerProducts(); } if (tab === "categories") renderCategoriesManager(); if (tab === "payment") renderPaymentForm(); if (tab === "financial") renderFinancials(); if (tab === "profile") renderShopProfileForm(); }

function setPriceMode() { const mode = $("#priceMode").value; $("#markupField").classList.toggle("hidden", mode !== "markup"); $("#sellPriceField").classList.toggle("hidden", mode !== "manual"); updatePricePreview(); }
function updatePricePreview() { const cost = Number($("#costInput").value || 0); const mode = $("#priceMode").value; const markup = Number($("#markupInput").value || 0); const rawPrice = mode === "markup" ? Math.round(cost * (1 + markup / 100) / 1000) * 1000 : Number($("#sellPriceInput").value || 0); const price = Math.max(0, rawPrice); $("#calculatedPrice").textContent = money(price); const profit = price - cost; $("#profitPreview").textContent = `ກຳໄລ ${money(profit)} / ຊິ້ນ${cost ? ` (${Math.round((profit / cost) * 100)}%)` : ""}`; return price; }
function openProductForm(product = null) {
  editingProductId = product?.id ?? null; const form = $("#productForm"); form.reset(); renderProductCategories(); $("#productFormTitle").textContent = product ? "ແກ້ໄຂສິນຄ້າ" : "ເພີ່ມສິນຄ້າໃໝ່";
  if (product) { form.productId.value = product.id; form.name.value = product.name; form.categoryId.value = product.categoryId; form.saleMode.value = product.saleMode || "inStock"; form.stock.value = product.stock; form.description.value = product.description || ""; form.supplierUrl.value = product.supplierUrl || ""; form.cost.value = product.cost; form.priceMode.value = "manual"; form.sellPrice.value = product.price; }
  else { form.saleMode.value = "onDemand"; form.stock.value = 0; form.priceMode.value = "markup"; form.markup.value = 20; }
  setPriceMode(); $("#productFormWrap").classList.remove("hidden"); $("#productFormWrap").scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeProductForm() { $("#productFormWrap").classList.add("hidden"); editingProductId = null; }

// ---------- 5) Database / Storage / Auth ----------

async function fetchTable(table, orderCol) {
  let query = supabase.from(table).select("*");
  if (orderCol) query = query.order(orderCol, { ascending: false });
  const { data: rows, error } = await query;
  if (error) { console.error(table, error); return []; }
  return rows;
}
async function refreshCategories() { data.categories = await fetchTable("categories"); renderAll(); }
async function refreshProducts() { data.products = await fetchTable("products"); renderAll(); }
async function refreshOrders() { data.orders = await fetchTable("orders", "createdAt"); renderAll(); }
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
  renderDashboard(); renderOrders(); renderManagerProducts(); renderCategoriesManager(); renderProductCategories(); renderFinancials();
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
  for (const line of lines) if (!isOnDemand(line.product) && line.quantity > line.product.stock) return toast(`${line.product.name} ມີສະຕັອກບໍ່ພຽງພໍ`);
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
    items: lines.map(({ product, quantity }) => ({ productId: product.id, name: product.name, price: product.price, cost: product.cost, quantity, supplierUrl: product.supplierUrl || "" }))
  };
  const { error } = await supabase.from("orders").insert(order);
  if (error) throw error;
  await Promise.all(lines.filter(line => !isOnDemand(line.product)).map(line => supabase.from("products").update({ stock: line.product.stock - line.quantity }).eq("id", line.product.id)));
  cart = []; saveCart(); closeLayers();
  $("#successText").textContent = `ເລກອໍເດີຂອງທ່ານ: ${id} · ຮ້ານຈະຕິດຕໍ່ກັບໄວ.`; $("#successModal").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  renderShopProfile(); renderCustomerShop(); renderCart();

  // ---- ໂຫລດຂໍ້ມູນຄັ້ງທຳອິດ ແລ້ວເປີດ realtime (ອັບເດດອັດຕະໂນມັດທຸກເຄື່ອງ) ----
  refreshCategories(); refreshProducts(); refreshOrders(); refreshExpenses(); refreshSettings();
  subscribeRealtime();

  // ---- ສະຖານະການ login ----
  supabase.auth.onAuthStateChange((event, session) => {
    managerUser = session?.user || null;
    if (!authReadyOnce) { authReadyOnce = true; if (managerUser) showManager(); }
  });

  $("#customerSearch").addEventListener("input", renderCustomerShop);
  $("#categoryTabs").addEventListener("click", event => { const button = event.target.closest("button[data-category]"); if (!button) return; activeCategory = button.dataset.category === "all" ? "all" : Number(button.dataset.category) || button.dataset.category; renderCustomerShop(); });
  $("#productGrid").addEventListener("click", event => { const button = event.target.closest("[data-add-product]"); if (button) addToCart(button.dataset.addProduct); });
  $("#cartButton").addEventListener("click", () => openLayer("cart")); $(".close-drawer").addEventListener("click", closeLayers); $("#overlay").addEventListener("click", closeLayers); $$(".modal-close").forEach(button => button.addEventListener("click", closeLayers));
  $("#cartItems").addEventListener("click", event => { const remove = event.target.closest("[data-cart-remove]"); const change = event.target.closest("[data-cart-change]"); if (remove) { cart = cart.filter(line => String(line.productId) !== remove.dataset.cartRemove); saveCart(); renderCart(); } if (change) changeCart(change.dataset.productId, Number(change.dataset.cartChange)); });
  $("#checkoutButton").addEventListener("click", () => { if (!cart.length) return; closeLayers(); renderCheckout(); $("#checkoutModal").classList.remove("hidden"); });
  $$("input[name=paymentMethod]").forEach(input => input.addEventListener("change", toggleTransferFields));
  $("#checkoutForm").addEventListener("submit", event => { event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; createOrderFromForm(event.currentTarget).catch(err => { console.error(err); toast("ສັ່ງຊື້ບໍ່ສຳເລັດ ລອງໃໝ່ພາຍຫຼັງ"); }).finally(() => { button.disabled = false; }); });

  $("#managerButton").addEventListener("click", () => isManager() ? showManager() : openLayer("#loginModal"));
  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: fd.get("email").trim(), password: fd.get("password") });
    if (error) { $("#loginError").classList.remove("hidden"); return; }
    $("#loginError").classList.add("hidden"); event.currentTarget.reset(); closeLayers(); showManager();
  });
  $("#logoutButton").addEventListener("click", () => { supabase.auth.signOut().then(() => { showShop(); toast("ອອກຈາກລະບົບແລ້ວ"); }); });
  $("#backToShop").addEventListener("click", showShop);
  $$(".manager-tab").forEach(button => button.addEventListener("click", () => switchManagerTab(button.dataset.managerTab)));
  $("#managerOrderSearch").addEventListener("input", renderOrders); $("#orderFilters").addEventListener("click", event => { const button = event.target.closest("[data-order-filter]"); if (!button) return; activeOrderFilter = button.dataset.orderFilter; renderOrders(); });
  $("#ordersList").addEventListener("change", event => { const select = event.target.closest("[data-order-status]"); if (!select) return; supabase.from("orders").update({ status: select.value }).eq("id", select.dataset.orderStatus).then(({ error }) => { if (error) return toast("ອັບເດດບໍ່ສຳເລັດ"); toast("ອັບເດດສະຖານະອໍເດີແລ້ວ"); }); });
  $("#ordersList").addEventListener("click", event => { const receipt = event.target.closest("[data-view-receipt]"); const accept = event.target.closest("[data-accept-order]"); if (receipt) $(`#receipt-${receipt.dataset.viewReceipt}`).classList.toggle("hidden"); if (accept) { supabase.from("orders").update({ status: "accepted" }).eq("id", accept.dataset.acceptOrder).then(() => toast("ຮັບອໍເດີແລ້ວ · ພ້ອມດຳເນີນການສັ່ງສິນຄ້າ")); } });

  $("#openProductForm").addEventListener("click", () => openProductForm()); $("#closeProductForm").addEventListener("click", closeProductForm); $("#cancelProductForm").addEventListener("click", closeProductForm); $("#priceMode").addEventListener("change", setPriceMode); ["#costInput", "#markupInput", "#sellPriceInput"].forEach(id => $(id).addEventListener("input", updatePricePreview));
  $$("[data-markup]").forEach(button => button.addEventListener("click", () => { $("#markupInput").value = button.dataset.markup; updatePricePreview(); }));
  $("#productForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form);
    const old = editingProductId != null ? data.products.find(product => String(product.id) === String(editingProductId)) : null;
    const imageFile = form.image.files[0];
    const submitButton = form.querySelector("button[type=submit]"); submitButton.disabled = true;
    try {
      const image = imageFile ? await uploadImage(imageFile, "products") : (old?.image || "");
      const price = updatePricePreview();
      const product = { name: fd.get("name").trim(), categoryId: Number(fd.get("categoryId")), saleMode: fd.get("saleMode"), description: fd.get("description").trim(), cost: Number(fd.get("cost")), price, stock: Number(fd.get("stock")), supplierUrl: fd.get("supplierUrl").trim(), image };
      const { error } = old ? await supabase.from("products").update(product).eq("id", old.id) : await supabase.from("products").insert(product);
      if (error) throw error;
      closeProductForm(); toast(old ? "ແກ້ໄຂສິນຄ້າແລ້ວ" : "ເພີ່ມສິນຄ້າແລ້ວ");
    } catch (err) { console.error(err); toast("ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ"); } finally { submitButton.disabled = false; }
  });
  $("#managerProducts").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-product]"); const remove = event.target.closest("[data-delete-product]");
    if (edit) openProductForm(data.products.find(product => String(product.id) === edit.dataset.editProduct));
    if (remove) { const product = data.products.find(item => String(item.id) === remove.dataset.deleteProduct); if (product && confirm(`ລຶບ “${product.name}” ແທ້ບໍ?`)) { supabase.from("products").delete().eq("id", product.id).then(() => { cart = cart.filter(item => String(item.productId) !== String(product.id)); saveCart(); renderCart(); }); } }
  });
  $("#categoryForm").addEventListener("submit", async event => {
    event.preventDefault(); const name = new FormData(event.currentTarget).get("name").trim(); if (!name) return;
    if (data.categories.some(category => category.name.toLowerCase() === name.toLowerCase())) return toast("ມີໝວດນີ້ຢູ່ແລ້ວ");
    const { error } = await supabase.from("categories").insert({ name }); if (error) return toast("ເພີ່ມໝວດບໍ່ສຳເລັດ");
    event.currentTarget.reset(); toast("ເພີ່ມໝວດແລ້ວ");
  });
  $("#categoriesManagerList").addEventListener("click", event => {
    const button = event.target.closest("[data-delete-category]"); if (!button) return;
    const used = data.products.some(product => String(product.categoryId) === button.dataset.deleteCategory);
    if (used) return toast("ລຶບໝວດນີ້ບໍ່ໄດ້: ຍັງມີສິນຄ້າຢູ່");
    supabase.from("categories").delete().eq("id", button.dataset.deleteCategory);
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
