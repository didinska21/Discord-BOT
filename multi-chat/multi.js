// multi.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Ambil data dari .env
const tokenA = process.env.USER_TOKEN_A;
const tokenB = process.env.USER_TOKEN_B;
const channelId = process.env.CHANNEL_ID;

// Load pesan dari file
const pesanA = fs.readFileSync('akunA.txt', 'utf-8')
  .split('\n').map(line => line.trim()).filter(Boolean);
const pesanB = fs.readFileSync('akunB.txt', 'utf-8')
  .split('\n').map(line => line.trim()).filter(Boolean);

if (!pesanA.length || !pesanB.length) {
  console.error('[!] File akunA.txt atau akunB.txt kosong.');
  process.exit(1);
}

let indexA = 0;
let indexB = 0;
let giliran = 'A'; // Akun A mulai duluan
let lastMessageId = null;

// Fungsi delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi kirim pesan + reply
async function kirimPesan(token, konten, replyTo, label) {
  const payload = {
    content: konten,
    message_reference: replyTo ? {
      message_id: replyTo,
      fail_if_not_exists: false
    } : undefined
  };

  try {
    const res = await axios.post(
      `https://discord.com/api/v9/channels/${channelId}/messages`,
      payload,
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    console.log(`[${label}] Kirim: "${konten}"`);
    return res.data.id;
  } catch (err) {
    console.error(`[!] Gagal kirim oleh ${label}:`, err.response?.data || err.message);
    return null;
  }
}

// Fungsi utama loop chat
async function loopChat() {
  while (true) {
    if (giliran === 'A') {
      const pesan = pesanA[indexA];
      lastMessageId = await kirimPesan(tokenA, pesan, lastMessageId, 'Akun A');
      indexA = (indexA + 1) % pesanA.length;
      giliran = 'B';
    } else {
      const pesan = pesanB[indexB];
      lastMessageId = await kirimPesan(tokenB, pesan, lastMessageId, 'Akun B');
      indexB = (indexB + 1) % pesanB.length;
      giliran = 'A';
    }

    await delay(30 * 1000); // Delay 30 detik antar giliran
  }
}

console.log('[💬] Memulai simulasi chat balasan bertingkat...');
loopChat();
