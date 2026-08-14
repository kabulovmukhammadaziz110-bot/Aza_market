require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// CORS - Barcha frontend so'rovlariga ruxsat beradi
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

// Sizning Render havolangiz (Avtomatik webhook uchun)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://aza-market.onrender.com";

// Isbot rasmlari va matni
const ISBOT_PHOTOS = [
  "https://i.postimg.cc/QHd40sqp/isbot1.jpg",
  "https://i.postimg.cc/CzxPmY4G/isbot2.jpg",
  "https://i.postimg.cc/CzxPmY4C/isbot3.jpg",
  "https://i.postimg.cc/crL9XZcM/isbot4.jpg",
];

const ISBOT_CAPTION = `Fc point haridorlarimizning sharhlari‼️\nUzbdagi eng arzo narx✅\nBizda aldov yoq‼️\nBuyurtmalar vaqtida olinib oz vaqtida egasiga boradi‼️`;

const CATEGORIES = ["rifle", "sniper", "pistol", "smg", "shotgun", "knife", "gloves", "agent", "case", "music", "zeus"];
const RARITIES = ["consumer", "milspec", "restricted", "classified", "covert", "gold"];

// Telegram Helper (Xatoliklarni aniq ko'rsatadi)
async function tg(method, payload) {
  try {
    const res = await fetch(`${TG_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API xatosi [${method}]:`, data.description);
    }
    return data;
  } catch (err) {
    console.error(`Fetch xatosi [${method}]:`, err.message);
    return null;
  }
}

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
    throw new Error("Buyum bazaga qo'shilmadi: " + (e.message || String(e)));
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

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || (req.body && req.body.token) || (req.query && req.query.token);
  const expectedToken = String(process.env.ADMIN_TOKEN || "Salom2011").trim();
  const inputToken = token ? String(token).trim() : "";

  if (!inputToken || inputToken !== expectedToken) {
    return res.status(401).json({ ok: false, error: "Ruxsat etilmadi: Admin paroli noto'g'ri" });
  }
  next();
}

app.post("/api/admin/verify", requireAdmin, (req, res) => {
  res.json({ ok: true, message: "Admin autentifikatsiyasi muvaffaqiyatli" });
});

app.get("/api/skins", async (req, res) => {
  try {
    res.json(await getSkins());
  } catch (e) {
    res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
  }
});

app.post("/api/skins", requireAdmin, async (req, res) => {
  if (Array.isArray(req.body)) {
    try {
      const added = [];
      for (const item of req.body) {
        if (item.weapon && item.name && item.price) {
          added.push(await addSkin(item));
        }
      }
      return res.json(added);
    } catch(e) {
      return res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
    }
  }

  const { weapon, name, price } = req.body || {};
  if (!weapon || !name || !price) return res.status(400).json({ error: "weapon, name va price kiritilishi shart" });
  try {
    res.json(await addSkin(req.body));
  } catch (e) {
    res.status(500).json({ error: "Supabase xatosi", detail: String(e) });
  }
});

app.put("/api/skins/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await updateSkinById(req.params.id, req.body);
    res.json({ ok: true, updated });
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

const orders = new Map();
let nextOrderId = 1;

app.post("/api/order", async (req, res) => {
  const { product, price, tradeUrl, telegramUsername, telegramId, pubgId, fcAccount } = req.body || {};
  if (!product || !price) return res.status(400).json({ error: "product va price shart" });

  const id = String(nextOrderId++);
  orders.set(id, { id, product, price, status: "pending" });

  let deliveryLines = "";
  if (tradeUrl) deliveryLines += `\n📦 Steam Trade URL: ${tradeUrl}`;
  if (telegramUsername) deliveryLines += `\n✦ Telegram (Premium): ${telegramUsername}`;
  if (telegramId) deliveryLines += `\n⭐ Telegram ID / Nik: ${telegramId}`;
  if (pubgId) deliveryLines += `\n🪙 PUBG Player ID: ${pubgId}`;
  if (fcAccount) deliveryLines += `\n⚽ EA / FC Akkaunt (Login & Parol / ID): ${fcAccount}`;

  await tg("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text: `🆕 <b>YANGI BUYURTMA #${id}</b>\n\n<b>Mahsulot(lar):</b>\n${product}\n\n<b>Jami Narxi:</b> ${price}${deliveryLines}\n\nXaridor to'lov qilganini tasdiqladi. To'lovni tekshiring:`,
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

// Asosiy sahifa tekshirish uchun
app.get("/", (req, res) => {
  res.send("AZA Market Serveri ishlab turibdi!");
});

// Telegram Webhook
let addFlow = null;
let lastList = [];

app.post("/webhook", async (req, res) => {
  const body = req.body || {};

  // 1. Tugmalar (Callback Query)
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
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // 2. /isbot BUYRUG'I (Barcha foydalanuvchilar uchun)
  if (text === "/isbot") {
    console.log(`[BOT] ${chatId} dan /isbot so'rovi qabul qilindi`);
    const mediaGroup = ISBOT_PHOTOS.map((url, index) => ({
      type: "photo",
      media: url,
      caption: index === 0 ? ISBOT_CAPTION : undefined,
    }));

    const result = await tg("sendMediaGroup", {
      chat_id: chatId,
      media: mediaGroup,
    });

    if (!result || !result.ok) {
      // Agar rasmlarni albom qilib yuklashda xatolik bo'lsa, oddiy matn tarzida jo'natadi
      await tg("sendMessage", {
        chat_id: chatId,
        text: ISBOT_CAPTION,
      });
    }
    return res.sendStatus(200);
  }

  // 3. ADMIN UCHUN BUYRUQLAR
  if (String(chatId) !== ADMIN_CHAT_ID) {
    if (text === "/start") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Assalomu alaykum! Isbotlarni ko'rish uchun /isbot buyrug'ini yuboring.",
      });
    }
    return res.sendStatus(200);
  }

  async function send(t) {
    await tg("sendMessage", { chat_id: ADMIN_CHAT_ID, text: t });
  }

  try {
    if (addFlow) {
      if (text === "/bekor") {
        addFlow = null;
        await send("Qo'shish bekor qilindi.");
        return res.sendStatus(200);
      }

      if (addFlow.step === "weapon") {
        addFlow.weapon = text;
        addFlow.step = "name";
        await send("Nomi yoki turini yozing (masalan: Redline, Dreams Case):");
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
        await send("Holatini yozing:\n(Factory New, Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred, Standard)");
        return res.sendStatus(200);
      }
      if (addFlow.step === "wear") {
        addFlow.wear = text;
        addFlow.step = "price";
        await send("Narxini yozing (masalan: 150000):");
        return res.sendStatus(200);
      }
      if (addFlow.step === "price") {
        addFlow.price = text;
        addFlow.step = "category";
        await send("Kategoriyasini yozing:\n(rifle, sniper, pistol, smg, shotgun, knife, gloves, agent, case, music, zeus)");
        return res.sendStatus(200);
      }
      if (addFlow.step === "category") {
        addFlow.category = CATEGORIES.includes(text.toLowerCase()) ? text.toLowerCase() : "rifle";
        addFlow.step = "image";
        await send("Rasm URL havolasini yozing (Yo'q bo'lsa 'yoq' deb yozing):");
        return res.sendStatus(200);
      }
      if (addFlow.step === "image") {
        const imgUrl = (text.toLowerCase() === "yoq" || text.toLowerCase() === "yo'q" || text === "-") ? "" : text;
        addFlow.image = imgUrl;

        const created = await addSkin(addFlow);
        await send(`✅ Yangi buyum qo'shildi!\nID: ${created.id}\nNomi: ${created.weapon} | ${created.name}`);
        addFlow = null;
        return res.sendStatus(200);
      }
    }

    if (text === "/start") {
      await send("Salom! AZA Market Admin boti.\n\n/qoshish — Buyum qo'shish\n/royxat — Barcha buyumlar\n/ochirish N — O'chirish");
    } else if (text === "/qoshish") {
      addFlow = { step: "weapon" };
      await send("Yangi buyum qo'shish boshlandi.\nTurini yozing:");
    } else if (text === "/royxat") {
      const skins = await getSkins();
      lastList = skins.map(s => s.id);
      if (!skins.length) {
        await send("Market bo'sh.");
      } else {
        const lines = skins.map((s, i) => `${i + 1}. ${s.weapon} | ${s.name} — ${s.price}`);
        await send("Joriy buyumlar:\n\n" + lines.join("\n"));
      }
    } else if (text.startsWith("/ochirish")) {
      const n = parseInt(text.split(" ")[1], 10);
      const id = lastList[n - 1];
      if (!id) {
        await send("Avval /royxat buyrug'ini bering.");
      } else {
        await deleteSkinById(id);
        await send(`O'chirildi: #${n}`);
      }
    }
  } catch (e) {
    await send("Xatolik: " + e.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

// Server ishga tushganda avtomatik Webhook'ni ulaydi
app.listen(PORT, async () => {
  console.log(`AZA Server ${PORT}-portda ishlamoqda`);
  
  // Telegram Webhook avtomatik sozlash
  const webhookUrl = `${RENDER_URL}/webhook`;
  const setHookRes = await tg("setWebhook", { url: webhookUrl });
  console.log("Telegram Webhook natijasi:", setHookRes);
});
