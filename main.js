require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');

const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;
const userId = process.env.USER_ID;

const pesanList = fs.readFileSync('pesan.txt', 'utf-8')
  .split('\n').map(p => p.trim()).filter(p => p !== '');

const balasanList = fs.readFileSync('balasan.txt', 'utf-8')
  .split('\n').map(b => b.trim()).filter(b => b !== '');

if (pesanList.length === 0) {
  console.error("[!] File pesan.txt kosong.");
  process.exit(1);
}

let indexPesan = 0;
let isPaused = false;

async function hapusPesan(messageId) {
  try {
    await axios.delete(`https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`, {
      headers: {
        Authorization: token,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log(`[🗑️] Pesan ${messageId} berhasil dihapus`);
  } catch (err) {
    console.error(`[!] Gagal hapus pesan:`, err.response?.status, err.response?.data || err.message);
  }
}

async function kirimPesan() {
  if (isPaused) return;

  const pesan = pesanList[indexPesan];
  indexPesan = (indexPesan + 1) % pesanList.length;

  try {
    const res = await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`,
      { content: pesan },
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    console.log(`[✔] Kirim rutin: "${pesan}"`);
    setTimeout(() => hapusPesan(res.data.id), 500); // 🔥 Hapus setelah 0.5 detik

  } catch (err) {
    console.error(`[!] Gagal kirim rutin:`, err.response?.status, err.response?.data || err.message);
  }
}

setInterval(kirimPesan, 60 * 1000);
kirimPesan(); // Kirim pertama langsung

// ===== WebSocket untuk auto-reply =====
const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');
let heartbeatInterval;

ws.on('open', () => {
  console.log('[📡] Terhubung ke Discord Gateway...');
});

ws.on('message', (data) => {
  const payload = JSON.parse(data);
  const { t: eventType, s: sequence, op, d } = payload;

  if (op === 10) {
    const { heartbeat_interval } = d;
    heartbeatInterval = setInterval(() => {
      ws.send(JSON.stringify({ op: 1, d: sequence }));
    }, heartbeat_interval);

    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: token,
        intents: 513,
        properties: {
          os: "linux",
          browser: "chrome",
          device: "pc"
        }
      }
    }));
  }

  if (eventType === 'MESSAGE_CREATE') {
    if (!d.mentions || d.author?.id === userId) return;

    const mentioned = d.mentions.some(m => m.id === userId);
    if (mentioned && d.channel_id === channelId) {
      if (isPaused) return;

      isPaused = true;
      const balasan = balasanList[Math.floor(Math.random() * balasanList.length)];

      console.log(`[⏳] Di-mention oleh ${d.author.username}, membalas dalam 60 detik...`);

      setTimeout(async () => {
        try {
          const res = await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`,
            { content: balasan },
            {
              headers: {
                Authorization: token,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
              }
            }
          );
          console.log(`[💬] Auto-reply ke ${d.author.username}: "${balasan}"`);
          setTimeout(() => hapusPesan(res.data.id), 500); // 🔥 Hapus balasan setelah 0.5 detik
        } catch (err) {
          console.error(`[!] Gagal auto-reply:`, err.response?.status, err.response?.data || err.message);
        } finally {
          isPaused = false;
        }
      }, 60 * 1000);
    }
  }
});

ws.on('close', () => {
  console.warn('[⚠️] WebSocket ditutup. Reconnect manual diperlukan.');
  clearInterval(heartbeatInterval);
});
