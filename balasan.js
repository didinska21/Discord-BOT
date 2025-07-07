require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const cliProgress = require('cli-progress');

const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;
const BASE_URL = `https://discord.com/api/v9`;

// Baca pesan.txt
if (!fs.existsSync('pesan.txt')) {
  console.error("[!] File pesan.txt tidak ditemukan.");
  process.exit(1);
}
const pesanList = fs.readFileSync('pesan.txt', 'utf-8')
  .split('\n').map(p => p.trim()).filter(Boolean);
if (pesanList.length === 0) {
  console.error("[!] File pesan.txt kosong.");
  process.exit(1);
}

// Baca balasan.txt
if (!fs.existsSync('balasan.txt')) {
  console.error("[!] File balasan.txt tidak ditemukan.");
  process.exit(1);
}
const balasanList = fs.readFileSync('balasan.txt', 'utf-8')
  .split('\n').map(p => p.trim()).filter(Boolean);
if (balasanList.length === 0) {
  console.error("[!] File balasan.txt kosong.");
  process.exit(1);
}

let indexPesan = 0;
let lastMessageId = null;
let statusMode = 'NORMAL'; // 'NORMAL', 'WAITING_REPLY', 'REPLY'

const headers = {
  Authorization: token,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0'
};

function getRandomBalasan() {
  return balasanList[Math.floor(Math.random() * balasanList.length)];
}

async function countdown(seconds) {
  const bar = new cliProgress.SingleBar({
    format: '⏳ Menunggu {remaining}s: [{bar}] {percentage}%',
    barCompleteChar: '█',
    barIncompleteChar: '-',
    hideCursor: true,
    clearOnComplete: true
  });

  bar.start(seconds, 0, { remaining: seconds });

  for (let i = 0; i <= seconds; i++) {
    bar.update(i, { remaining: seconds - i });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  bar.stop();
}

async function kirimPesan(pesan) {
  const res = await axios.post(`${BASE_URL}/channels/${channelId}/messages`,
    { content: pesan },
    { headers }
  );
  lastMessageId = res.data.id;
  console.log(`[✔] Kirim: "${pesan}" (id: ${lastMessageId})`);
}

async function balasPesan(originalMsg) {
  const balasan = getRandomBalasan();
  await axios.post(`${BASE_URL}/channels/${channelId}/messages`,
    {
      content: `${balasan}`,
      message_reference: {
        message_id: originalMsg.id,
        channel_id: channelId
      }
    },
    { headers }
  );
  console.log(`[↩] Balas ke ${originalMsg.author.username}: "${balasan}"`);
}

async function cekReply() {
  try {
    const res = await axios.get(`${BASE_URL}/channels/${channelId}/messages?limit=20`, { headers });
    const replies = res.data.filter(msg =>
      msg.type === 19 &&
      msg.message_reference?.message_id === lastMessageId &&
      msg.author?.id !== token.split('.')[0]
    );
    return replies;
  } catch (err) {
    console.error(`[!] Gagal cek reply`, err.message);
    return [];
  }
}

async function loopUtama() {
  while (true) {
    if (statusMode === 'NORMAL') {
      const pesan = pesanList[indexPesan];
      indexPesan = (indexPesan + 1) % pesanList.length;

      try {
        await kirimPesan(pesan);
        statusMode = 'WAITING_REPLY';
        await countdown(60);
      } catch (err) {
        console.error(`[!] Gagal kirim pesan`, err.response?.status, err.response?.data || err.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
    }

    if (statusMode === 'WAITING_REPLY') {
      const replies = await cekReply();
      if (replies.length > 0) {
        statusMode = 'REPLY';
        for (const msg of replies) {
          await balasPesan(msg);
          await countdown(60); // Delay setelah balas
        }
        statusMode = 'NORMAL';
      } else {
        statusMode = 'NORMAL'; // Tidak ada reply, lanjut kirim pesan
      }
    }
  }
}

loopUtama();
