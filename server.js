require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// CORS - Barcha frontend va Netlify havolalaridan sorovlarga ruxsat beradi
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || "8755812732:AAEPOaSL8ATcDhze9Zvzv1ggZ6r9VKmYvWs";
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "8020387112");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "Muh123$$$";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hyaousowxnefdhpwttcw.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "sb_publishable_ooo7x36cmCAjezqJ_WW_IA_mS7QALGz";
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const CATEGORIES = ["rifle", "sniper", "pistol", "smg", "shotgun", "knife", "gloves", "agent"];
const RARITIES = ["consumer", "milspec", "restricted", "classified", "covert", "gold"];

// Supabase REST Helper
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

async function getSkins() {
  return sb("skins?select=*&order=id.desc");
}

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
  try {
    const inserted = await sb("skins", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([row]),
    });
    if (Array.isArray(inserted) && inserted.length > 0) {
      return inserted[0];
    }
    return { id: Date.now(), ...row };
  } catch (e) {
    console.error("Supabase addSkin error:", e);
    throw new Error("Skin bazaga qo'shilmadi: " + (e.message || String(e)));
  }
}

async function deleteSkinById(id) {
  await sb(`skins?id=eq.${id}`, { method: "DELETE" });
}

async function updateSkinById(id, fields) {
  const updated = await sb(`skins?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  return updated[0];
}

// Admin Auth Middleware
function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token");
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Ruxsat etilmadi (invalid token)" });
  }
  next();
}

// Admin Token tekshirish yo'lagi
app.post("/api/admin/verify", requireAdmin, (req, res) => {
  res.json({ ok: true, message: "Admin autentifikatsiyasi muvaffaqiyatli" });
});

// Skin Endpoints
app.get("/api/skins", async (req, res) => {
  try {
    res.json(await getSkins());
  } catch (e) {
    res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
  }
});

app.post("/api/skins", requireAdmin, async (req, res) => {
  const { weapon, name, price } = req.body || {};
  if (!weapon || !name || !price) return res.status(400).json({ error: "weapon, name va price kiritilishi shart" });
  try {
    res.json(await addSkin(req.body));
  } catch (e) {
    res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
  }
});

app.delete("/api/skins/:id", requireAdmin, async (req, res) => {
  try {
    await deleteSkinById(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
  }
});

// Orders Store
const orders = new Map();
let nextOrderId = 1;

async function tg(method, payload) {
  return fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(r => r.json());
}

app.post("/api/order", async (req, res) => {
  const { product, price, tradeUrl, telegramUsername, telegramId, pubgId } = req.body || {};
  if (!product || !price) return res.status(400).json({ error: "product va price shart" });

  const id = String(nextOrderId++);
  orders.set(id, { id, product, price, status: "pending" });

  let deliveryLines = "";
  if (tradeUrl) deliveryLines += `\nSteam Trade URL: ${tradeUrl}`;
  if (telegramUsername) deliveryLines += `\nTelegram (Premium): ${telegramUsername}`;
  if (telegramId) deliveryLines += `\nTelegram (Stars): ${telegramId}`;
  if (pubgId) deliveryLines += `\nPUBG Player ID: ${pubgId}`;

  await tg("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text: `🆕 Yangi buyurtma #${id}\nMahsulot: ${product}\nNarxi: ${price}${deliveryLines}\n\nXaridor to'lov qilganini tasdiqladi. To'lovni tekshiring:`,
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

// Telegram Bot Webhook & Step-by-Step Skin Add Flow
let addFlow = null;
let lastList = [];

app.post("/webhook", async (req, res) => {
  const body = req.body || {};

  // Inline knopkalar bosilganda (To'lovni tasdiqlash/rad etish)
  if (body.callback_query) {
    const cb = body.callback_query;
    const [action, id] = (cb.data || "").split(":");
    let order = orders.get(id);
    
    if (!order) {
      order = { id, status: action === "confirm" ? "confirmed" : "rejected" };
      orders.set(id, order);
    } else {
      order.status = action === "confirm" ? "confirmed" : "rejected";
    }

    const isConfirm = action === "confirm";
    const statusLabel = isConfirm ? "✅ TASDIQLANDI" : "❌ RAD ETILDI";

    await tg("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: isConfirm ? "To'lov tasdiqlandi!" : "Buyurtma rad etildi!",
    });

    if (cb.message) {
      const origText = cb.message.text || "";
      await tg("editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${origText}\n\n<b>Holat: ${statusLabel}</b>`,
        parse_mode: "HTML",
      });
    }

    return res.sendStatus(200);
  }

  const msg = body.message;
  if (!msg || String(msg.chat.id) !== ADMIN_CHAT_ID) return res.sendStatus(200);
  const text = (msg.text || "").trim();

  async function send(t) {
    await tg("sendMessage", { chat_id: ADMIN_CHAT_ID, text: t });
  }

  try {
    // Step-by-step Skin qo'shish jarayoni
    if (addFlow) {
      if (text === "/bekor") {
        addFlow = null;
        await send("Skin qo'shish bekor qilindi.");
        return res.sendStatus(200);
      }

      if (addFlow.step === "weapon") {
        addFlow.weapon = text;
        addFlow.step = "name";
        await send("Skin nomini yozing (masalan: Redline):");
        return res.sendStatus(200);
      }
      if (addFlow.step === "name") {
        addFlow.name = text;
        addFlow.step = "rarity";
        await send("Noyobligini tanlang:\n(consumer, milspec, restricted, classified, covert, gold)");
        return res.sendStatus(200);
      }
      if (addFlow.step === "rarity") {
        addFlow.rarity = RARITIES.includes(text.toLowerCase()) ? text.toLowerCase() : "consumer";
        addFlow.step = "wear";
        await send("Holatini yozing:\n(Factory New, Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred)");
        return res.sendStatus(200);
      }
      if (addFlow.step === "wear") {
        addFlow.wear = text;
        addFlow.step = "price";
        await send("Narxini yozing (masalan: $42.30):");
        return res.sendStatus(200);
      }
      if (addFlow.step === "price") {
        addFlow.price = text;
        addFlow.step = "category";
        await send("Kategoriyasini yozing:\n(rifle, sniper, pistol, smg, shotgun, knife, gloves, agent)");
        return res.sendStatus(200);
      }
      if (addFlow.step === "category") {
        addFlow.category = CATEGORIES.includes(text.toLowerCase()) ? text.toLowerCase() : "rifle";
        addFlow.step = "image";
        await send("Rasm URL havolasini yozing (Agar rasm bo'lmasa 'yoq' deb yozing):");
        return res.sendStatus(200);
      }
      if (addFlow.step === "image") {
        const imgUrl = (text.toLowerCase() === "yoq" || text.toLowerCase() === "yo'q" || text === "-") ? "" : text;
        addFlow.image = imgUrl;

        const created = await addSkin(addFlow);
        await send(`✅ Yangi skin bazaga qo'shildi!\n\nID: ${created.id}\nSkin: ${created.weapon} | ${created.name}\nNarxi: ${created.price}`);
        addFlow = null;
        return res.sendStatus(200);
      }
    }

    // Buyruqlar
    if (text === "/start") {
      await send("Salom! AZA Market Admin boti.\n\nBuyruqlar:\n/qoshish — Yangi skin qo'shish\n/royxat — Barcha skinlarni ko'rish\n/ochirish N — N-o'rindagi skinni o'chirish\n/rasm N <link> — Skin rasmini yangilash\n/bekor — Amalni bekor qilish");
    } else if (text === "/qoshish") {
      addFlow = { step: "weapon" };
      await send("Yangi skin qo'shish boshlandi.\nQurol nomini yozing (masalan: AK-47):");
    } else if (text === "/royxat") {
      const skins = await getSkins();
      lastList = skins.map(s => s.id);
      if (!skins.length) {
        await send("Market xozircha bo'sh.");
      } else {
        const lines = skins.map((s, i) => `${i + 1}. ${s.weapon} | ${s.name} — ${s.price} [${s.rarity}]`);
        await send("Joriy skinlar ro'yxati:\n\n" + lines.join("\n") + "\n\nO'chirish uchun: /ochirish <tartib_raqam>");
      }
    } else if (text.startsWith("/ochirish")) {
      const n = parseInt(text.split(" ")[1], 10);
      const id = lastList[n - 1];
      if (!id) {
        await send("Avval /royxat buyrug'ini yuboring va tartib raqamni aniqlang.");
      } else {
        await deleteSkinById(id);
        await send(`Muvaffaqiyatli o'chirildi: #${n}`);
      }
    } else if (text.startsWith("/rasm")) {
      const parts = text.split(" ");
      const n = parseInt(parts[1], 10);
      const url = parts.slice(2).join(" ").trim();
      const id = lastList[n - 1];
      if (!id || !url) {
        await send("Format: /rasm <tartib_raqam> <rasm_havolasi>");
      } else {
        const updated = await updateSkinById(id, { image: url });
        await send(`Rasm yangilandi: #${n} — ${updated.weapon} | ${updated.name}`);
      }
    }
  } catch (e) {
    await send("Xatolik yuz berdi: " + e.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AZA Server ${PORT}-portda ishlamoqda`));
