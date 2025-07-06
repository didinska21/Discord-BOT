require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Konfigurasi akun dan karakter
const akun = [
  {
    token: process.env.USER_TOKEN_1,
    label: 'Kang Info',
    file: 'pesan/pemberi_info.txt'
  },
  {
    token: process.env.USER_TOKEN_2,
    label: 'Kang Analisa',
    file: 'pesan/analisa.txt'
  },
  {
    token: process.env.USER_TOKEN_3,
    label: 'Kang Tanya',
    file: 'pesan/tanya_serius.txt'
  },
  {
    token: process.env.USER_TOKEN_4,
    label: 'Kang Kepo',
    file: 'pesan/tanya_santai.txt'
  }
];

// Load pesan per akun
akun.forEach(user => {
  user.pesan = fs.readFileSync(user.file, 'utf-8').split('\n').map(p => p.trim()).filter(Boolean);
  user.index = 0;
});

const channelId = process.env.CHANNEL_ID;
const recentMessages = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const emojiList = ['😂', '😅', '🔥', '🍜', '😎', '😭', '👍', '💀'];
const kataAkhiran = ['sih', 'dong', 'loh', 'gitu', 'kan', 'ya', 'nih'];

// Gaya natural
function gayaPesan(pesan) {
  let hasil = pesan;
  if (Math.random() < 0.3) hasil += ' ' + kataAkhiran[Math.floor(Math.random() * kataAkhiran.length)];
  if (Math.random() < 0.2) hasil = hasil.replace(/a/g, 'aa').replace(/e/g, 'ee'); // typo ringan
  if (Math.random() < 0.4) hasil += ' ' + emojiList[Math.floor(Math.random() * emojiList.length)];
  return hasil;
}

async function kirimPesan(token, konten, replyTo, label) {
  const payload = {
    content: gayaPesan(konten),
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
    const msgId = res.data.id;
    console.log(`[${label}] ${payload.content}${replyTo ? ' (reply)' : ''}`);
    return msgId;
  } catch (err) {
    console.error(`[!] Error dari ${label}:`, err.response?.data || err.message);
    return null;
  }
}

async function mulaiChat() {
  console.log('[🤖] Obrolan 4 akun dimulai...\n');

  let giliran = 0;
  while (true) {
    const user = akun[giliran];
    const pesan = user.pesan[user.index];
    user.index = (user.index + 1) % user.pesan.length;

    const replyTo = Math.random() < 0.5 && recentMessages.length
      ? recentMessages[Math.floor(Math.random() * recentMessages.length)]
      : null;

    const msgId = await kirimPesan(user.token, pesan, replyTo, user.label);
    if (msgId) {
      recentMessages.push(msgId);
      if (recentMessages.length > 30) recentMessages.shift();
    }

    giliran = (giliran + 1) % akun.length;
    await delay(15000); // 15 detik antar akun (60 detik per akun)
  }
}

mulaiChat();
