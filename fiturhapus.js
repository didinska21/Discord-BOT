require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const cliProgress = require('cli-progress');

const token = process.env.USER_TOKEN;
const channelId = process.env.CHANNEL_ID;

const pesanList = fs.readFileSync('pesan.txt', 'utf-8')
  .split('\n').map(p => p.trim()).filter(p => p !== '');

if (pesanList.length === 0) {
  console.error("[!] File pesan.txt kosong.");
  process.exit(1);
}

let indexPesan = 0;

async function hapusPesan(messageId) {
  while (true) {
    try {
      await axios.delete(`https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`, {
        headers: {
          Authorization: token,
          'User-Agent': 'Mozilla/5.0'
        }
      });
      console.log(`\n[🗑️] Pesan ${messageId} berhasil dihapus`);
      break; // Keluar dari loop jika berhasil
    } catch (err) {
      console.error(`\n[!] Gagal hapus pesan:`, err.response?.status, err.response?.data || err.message);
      console.log(`[↻] Retry hapus pesan dalam 3 detik...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

async function countdown(seconds) {
  const bar = new cliProgress.SingleBar({
    format: '⏳ Menunggu {remaining}s: [{bar}] {percentage}%',
    barCompleteChar: '█',
    barIncompleteChar: '-',
    hideCursor: true,
    linewrap: false,
    clearOnComplete: true
  });
  
  bar.start(seconds, 0, { remaining: seconds });
  
  for (let i = 0; i <= seconds; i++) {
    bar.update(i, { remaining: seconds - i });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  bar.stop();
  console.log('⏰ Waktu tunggu selesai, lanjut kirim pesan berikutnya...\n');
}

async function kirimPesanDenganRetry() {
  const pesan = pesanList[indexPesan];
  indexPesan = (indexPesan + 1) % pesanList.length;
  
  while (true) {
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
      
      console.log(`\n[✔] Kirim: "${pesan}"`);
      
      // Tunggu sebentar lalu hapus pesan dengan retry
      setTimeout(() => hapusPesan(res.data.id), 500);
      break;
    } catch (err) {
      console.error(`\n[!] Gagal kirim, retry dalam 5 detik...`, err.response?.status, err.response?.data || err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  await countdown(60);
  kirimPesanDenganRetry();
}

kirimPesanDenganRetry();
