7-require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;

// Ambil pesan dari pesan.txt
const messages = fs.readFileSync('pesan.txt', 'utf-8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

if (messages.length === 0) {
  console.error("[!] File pesan.txt kosong.");
  process.exit(1);
}

const interval = 60 * 1000; // 60 detik

async function sendMessage() {
  const message = messages[Math.floor(Math.random() * messages.length)];

  try {
    const res = await axios.post(
      `https://discord.com/api/v9/channels/${channelId}/messages`,
      { content: message },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      }
    );
    console.log(`[✔] Terkirim: "${message}"`);
  } catch (err) {
    if (err.response) {
      const { status, data } = err.response;

      if (status === 429) {
        console.warn(`[⏳] Kena rate limit! Tunggu ${data.retry_after} detik`);
      } else {
        console.error(`[!] Gagal (${status}):`, data?.message || data);
      }

    } else {
      console.error(`[!] Error jaringan atau lain-lain:`, err.message);
    }
  }
}

setInterval(sendMessage, interval);
sendMessage(); // kirim pertama langsung
