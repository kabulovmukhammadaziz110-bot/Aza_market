require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || "8755812732:AAEPOaSL8ATcDhze9Zvzv1ggZ6r9VKmYvWs";
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "8020387112");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "Salom2011";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hyaousowxnefdhpwttcw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "sb_publishable_ooo7x36cmCAjezqJ_WW_IA_mS7QALGz";
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://aza-market.onrender.com";

// ==========================================
// SIZNING 4 TA ISBOT RASMINGIZ (FILE_ID)
// ==========================================
const ISBOT_PHOTOS = [
  "AgACAgIAAxkBAAPNan9KsOIiPxGxw2QlGfuQk5bPMYYAArsXaxuf7QFIdIOuUJ8AAXtAAQADAgADeQADPQQ",
  "AgACAgIAAxkBAAPMan9KsN0jXuHkZhKm0sQhn15hhrIAAroXaxuf7QFI6YNGWC2IbgsBAAMCAAN5AAM9BA",
  "AgACAgIAAxkBAAPLan9KsF_nOL5RbIgK98tTWiPcpY8AArgXaxuf7QFItEsmLQNibYABAAMCAAN5AAM9BA",
  "AgACAgIAAxkBAAPKan9KsIh9KRTVxtEg1zuR68Cfg-MAArkXaxuf7QFI8WdlNZFvTYsBAAMCAAN5AAM9BA"
];

const ISBOT_CAPTION = `Fc point haridorlarimizning sharhlari‼️\nUzbdagi eng arzo narx✅\nBizda aldov yoq‼️\nBuyurtmalar vaqtida olinib oz vaqtida egasiga boradi‼️`;

const CATEGORIES = ["rifle", "sniper", "pistol", "smg", "shotgun", "knife", "gloves", "agent", "case", "music", "zeus"];
const RARITIES = ["consumer", "milspec", "restricted", "classified", "covert", "gold"];

async function tg(method, payload) {
  try {
    const res = await fetch(`${TG_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.error(`Telegram xatolik [${method}]:`, data.description);
    return data;
  } catch (err) {
    console.error(`Fetch xatolik [${method}]:`, err.message);
    return null;
  }
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
  return data;
}

async function getSkins() { return sb("skins?select=*&order=id.desc"); }
async function addSkin(fields) {
  const row = {
    weapon: fields.weapon,
    name: fields.name,
    rarity: fields.rarity || "consumer",
    wear: fields.wear || "Field-Tested",
    price: fields.price,
    category: CATEGORIES.includes(fields.category) ? fields.category : "rifle",
    image: fields.image || "",
  };
  const inserted = await sb("skins", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([row]),
  });
  return (Array.isArray(inserted) && inserted.length > 0) ? inserted[0] : { id: Date.now(), ...row };
}
async function deleteSkinById(id) { await sb(`skins?id=eq.${id}`, { method: "DELETE" }); }
async function updateSkinById(id, fields) {
  const updated = await sb(`skins?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  return updated[0];
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || (req.body && req.body.token) || (req.query && req.query.token);
  if (!token || token.trim() !== String(process.env.ADMIN_TOKEN || "Salom2011").trim()) {
    return res.status(401).json({ ok: false, error: "Ruxsat etilmadi" });
  }
  next();
}

app.post("/api/admin/verify", requireAdmin, (req, res) => res.json({ ok: true }));
app.get("/api/skins", async (req, res) => {
  try { res.json(await getSkins()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/skins", requireAdmin, async (req, res) => {
  try { res.json(await addSkin(req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/skins/:id", requireAdmin, async (req, res) => {
  try { res.json({ ok: true, updated: await updateSkinById(req.params.id, req.body) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/skins/:id", requireAdmin, async (req, res) => {
  try { await deleteSkinById(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

const orders = new Map();
let nextOrderId = 1;

app.post("/api/order", async (req, res) => {
  const { product, price, tradeUrl, telegramUsername, telegramId, pubgId, fcAccount } = req.body || {};
  if (!product || !price) return res.status(400).json({ error: "product va price shart" });
  const id = String(nextOrderId++);
  orders.set(id, { id, product, price, status: "pending" });

  let deliveryLines = "";
  if (tradeUrl) deliveryLines += `\n📦 Steam Trade URL: ${tradeUrl}`;
  if (telegramUsername) deliveryLines += `\n✦ Telegram: ${telegramUsername}`;
  if (telegramId) deliveryLines += `\n⭐ Telegram ID: ${telegramId}`;
  if (pubgId) deliveryLines += `\n🪙 PUBG ID: ${pubgId}`;
  if (fcAccount) deliveryLines += `\n⚽ EA/FC: ${fcAccount}`;

  await tg("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text: `🆕 <b>YANGI BUYURTMA #${id}</b>\n\n<b>Mahsulot:</b>\n${product}\n\n<b>Narxi:</b> ${price}${deliveryLines}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `confirm:${id}` },
        { text: "❌ Bekor qilish", callback_data: `reject:${id}` },
      ]]
    },
  });
  res.json({ id });
});

app.get("/api/order/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Topilmadi" });
  res.json(order);
});

app.get("/", (req, res) => res.send("AZA Market Serveri ishlab turibdi!"));

let addFlow = null;
let lastList = [];

app.post("/webhook", async (req, res) => {
  const body = req.body || {};

  if (body.callback_query) {
    const cb = body.callback_query;
    const [action, id] = (cb.data || "").split(":");
    let order = orders.get(id) || { id, status: action === "confirm" ? "confirmed" : "rejected" };
    order.status = action === "confirm" ? "confirmed" : "rejected";
    orders.set(id, order);

    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Bajarildi!" });
    if (cb.message) {
      await tg("editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text || ""}\n\n<b>Holat: ${order.status === "confirmed" ? "✅ TASDIQLANDI" : "❌ RAD ETILDI"}</b>`,
        parse_mode: "HTML",
      });
    }
    return res.sendStatus(200);
  }

  const msg = body.message;
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // Admin yangi rasm tashlasa file_id berish
  if (String(chatId) === ADMIN_CHAT_ID && msg.photo && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    await tg("sendMessage", {
      chat_id: ADMIN_CHAT_ID,
      text: `📸 <b>Rasmning FILE_ID kodi:</b>\n\n<code>${largestPhoto.file_id}</code>`,
      parse_mode: "HTML",
    });
    return res.sendStatus(200);
  }

  // /isbot BUYRUG'I
  if (text === "/isbot") {
    const mediaGroup = ISBOT_PHOTOS.map((fileId, index) => ({
      type: "photo",
      media: fileId,
      caption: index === 0 ? ISBOT_CAPTION : undefined,
    }));

    await tg("sendMediaGroup", {
      chat_id: chatId,
      media: mediaGroup,
    });
    return res.sendStatus(200);
  }

  // ODDIY FOYDALANUVCHILAR
  if (String(chatId) !== ADMIN_CHAT_ID) {
    if (text === "/start") {
      await tg("sendMessage", { chat_id: chatId, text: "Assalomu alaykum! Isbotlarni ko'rish uchun /isbot buyrug'ini yozing." });
    }
    return res.sendStatus(200);
  }

  // ADMIN BUYRUQLARI
  if (text === "/start") {
    await tg("sendMessage", { chat_id: ADMIN_CHAT_ID, text: "Salom Admin!\n\n/qoshish — Buyum qo'shish\n/royxat — Barcha buyumlar", parse_mode: "HTML" });
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`AZA Server ${PORT}-portda ishlamoqda`);
  await tg("setWebhook", { url: `${RENDER_URL}/webhook` });
});
