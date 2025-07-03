// main.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Ambil token dan channel dari file .env
const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;

// Baca isi pesan dari pesan.txt
const messages = fs.readFileSync('pesan.txt', 'utf-8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line !== '');

if (messages.length === 0) {
  console.error("[!] File pesan.txt kosong atau tidak valid.");
  process.exit(1);
}

const interval = 60 * 1000; // 60 detik
let currentIndex = 0;

async function sendMessage() {
  const message = messages[currentIndex];
  currentIndex = (currentIndex + 1) % messages.length;

  try {
    await axios.post(
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
        const wait = data?.retry_after || 0;
        console.warn(`[⏳] Rate limited! Tunggu ${wait} detik`);
      } else {
        console.error(`[!] Error ${status}:`, data?.message || data);
      }

    } else {
      console.error(`[!] Error koneksi:`, err.message);
    }
  }
}

// Kirim pertama kali langsung saat script jalan
sendMessage();

// Lalu kirim tiap 60 detik sekali, berurutan dan loop
setInterval(sendMessage, interval);
