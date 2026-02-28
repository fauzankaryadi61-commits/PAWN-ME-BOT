const { 
  Client, 
  Intents, 
  MessageActionRow, 
  MessageButton, 
  Modal, 
  TextInputComponent,
  Permissions,
  MessageEmbed
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const SARAN_CHANNEL_ID = "1476667741233746052";
const LOG_CHANNEL_ID = "1476988040252489728";
const AUTO_WELCOME_CHANNEL = "1466412308346703888";
const LEVEL_UP_CHANNEL = "1477220362747117658";
const MONTHLY_LEADERBOARD_CHANNEL = "1476665795307114607";
const BOOSTER_ROLE_ID = "1469588025288823019";

const MAX_STRIKE = 3;
const TIMEOUT_DURATION = 10 * 60 * 1000;

const badWords = ["anjing", "anj", "bgst", "goblok", "kntl", "gblk", "bego", "mmk", "jing", "puki", "bangsat", "kontol", "memek", "babi"];
let strikes = {};
const fs = require("fs");

const LEVEL_FILE = "./levels.json";
const CONFIG_FILE = "./config.json";

let levels = {};
let config = {};

if (!fs.existsSync(LEVEL_FILE)) {
  fs.writeFileSync(LEVEL_FILE, JSON.stringify({}));
}

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    chat_exp: 5,
    chat_cooldown: 10,
    voice_exp_per_minute: 1,
    voice_minimum_minutes: 1,
    booster_multiplier: 1.5,
    double_exp: false,
    double_exp_multiplier: 2,
    role_rewards_enabled: false
  }, null, 2));
}

levels = JSON.parse(fs.readFileSync(LEVEL_FILE));
config = JSON.parse(fs.readFileSync(CONFIG_FILE));

function saveLevels() {
  fs.writeFileSync(LEVEL_FILE, JSON.stringify(levels, null, 2));
}

function calculateLevel(exp) {
  return Math.floor(0.1 * Math.sqrt(exp));
}

async function checkLevelUp(member, oldExp, newExp) {
  const oldLevel = calculateLevel(oldExp);
  const newLevel = calculateLevel(newExp);

  if (newLevel <= oldLevel) return;

  const channel = member.guild.channels.cache.get(LEVEL_UP_CHANNEL);
  if (!channel) return;

  const embed = new MessageEmbed()
    .setColor("#2ECC71")
    .setTitle("🎉 LEVEL UP!")
    .setDescription(`${member} naik ke **Level ${newLevel}** 🚀`)
    .addField("Level Sebelumnya", `${oldLevel}`, true)
    .addField("Level Sekarang", `${newLevel}`, true)
    .setFooter({ text: "Pawn Me Level System" })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  await msg.react("🎉");
  await msg.react("🔥");
}

const cooldowns = new Map();
const voiceTracker = new Map();

const client = new Client({
  intents: [
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_MESSAGES,
  Intents.FLAGS.GUILD_MEMBERS,
  Intents.FLAGS.GUILD_VOICE_STATES,
  Intents.FLAGS.MESSAGE_CONTENT
]
});

client.once("ready", async () => {
  console.log(`${client.user.tag} is online!`);

  const commands = [
    { name: "ping", description: "Ping test command" },
    { name: "pawn", description: "Informasi Pawn Me" },
    { name: "saranpanel", description: "Tampilkan panel kotak saran" },

    {
      name: "welcome",
      description: "Welcome member ke server",
      options: [
        { name: "user1", description: "Member", type: 6, required: true }
      ]
    },

    {
      name: "checkstrike",
      description: "Cek jumlah strike member",
      options: [
        { name: "user", description: "Target user", type: 6, required: true }
      ]
    },

    {
      name: "clearstrikes",
      description: "Reset strike member",
      options: [
        { name: "user", description: "Target user", type: 6, required: true }
      ]
    },

    {
      name: "mute",
      description: "Mute user (menit)",
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "duration", description: "Durasi menit", type: 4, required: true },
        { name: "reason", description: "Alasan", type: 3, required: false }
      ]
    },

    {
      name: "timeout",
      description: "Timeout user (menit)",
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "duration", description: "Durasi menit", type: 4, required: true },
        { name: "reason", description: "Alasan", type: 3, required: false }
      ]
    },

    {
      name: "kick",
      description: "Kick user",
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "reason", description: "Alasan", type: 3, required: false }
      ]
    },

    {
      name: "ban",
      description: "Ban user",
      options: [
        { name: "user", description: "Target user", type: 6, required: true },
        { name: "reason", description: "Alasan", type: 3, required: false }
      ]
    },
    
    {
      name: "pmlevel",
      description: "Cek level kamu atau user lain",
      options: [
        { name: "user", description: "Target user", type: 6, required: false }
      ]
    },
    {
  name: "pmleaderboard",
  description: "Lihat leaderboard Pawn Me",
  options: [
    {
      name: "kategori",
      description: "Kategori leaderboard",
      type: 3,
      required: false,
      choices: [
        { name: "Chat", value: "chat" },
        { name: "Voice", value: "voice" }
      ]
    },
    {
      name: "waktu",
      description: "Periode waktu",
      type: 3,
      required: false,
      choices: [
        { name: "All Time", value: "total" },
        { name: "Month", value: "month" },
        { name: "Week", value: "week" },
        { name: "Day", value: "day" }
      ]
    },
    {
       name: "jumlah",
       description: "Jumlah yang ditampilkan",
       type: 4,
       required: false,
       choices: [
         { name: "5", value: 5 },
         { name: "10", value: 10 },
         { name: "15", value: 15 }
        ]
      }
    ]
  } 
];

  await client.application.commands.set(commands, GUILD_ID);
  console.log("Slash commands registered.");
});


client.on("messageCreate", async (message) => {
  if (message.author.bot) return;


/* ================= AUTO MODERATION ================= */

  const content = message.content.toLowerCase();

  const detectedWord = badWords.find(word =>
    new RegExp(word.split("").join("\\s*"), "i").test(content)
  );

  if (!detectedWord) return;
  if (!message.member || !message.member.moderatable) return;

  await message.delete().catch(() => {});

  if (!strikes[message.author.id]) strikes[message.author.id] = 0;
  strikes[message.author.id]++;

  const count = strikes[message.author.id];

  const warnEmbed = new MessageEmbed()
    .setColor("#ED4245")
    .setTitle("⚠️ Warning - Toxic Language")
    .setDescription(`Kamu mendapat strike ke-${count}.`)
    .addField("Batas Strike", `${MAX_STRIKE} strike = timeout 10 menit`)
    .setTimestamp();

  try {
    await message.author.send({ embeds: [warnEmbed] });
  } catch {
    const tempMsg = await message.channel.send(
      `${message.author}, kamu mendapat strike ke-${count}.`
    );
    setTimeout(() => tempMsg.delete().catch(()=>{}), 5000);
  }

  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);

  if (logChannel) {
    const logEmbed = new MessageEmbed()
      .setColor("#FEE75C")
      .setTitle("⚠️ Auto Moderation Warning")
      .addField("User", `${message.author}`, true)
      .addField("Kata Terdeteksi", detectedWord, true)
      .addField("Strike", `${count}/${MAX_STRIKE}`, true)
      .addField("Channel", `${message.channel}`, true)
      .setTimestamp();

    logChannel.send({ embeds: [logEmbed] });
  }

  if (count >= MAX_STRIKE) {
    await message.member.timeout(TIMEOUT_DURATION, "Auto moderation");
    strikes[message.author.id] = 0;

    if (logChannel) {
      const timeoutEmbed = new MessageEmbed()
        .setColor("#ED4245")
        .setTitle("🚫 Auto Timeout")
        .addField("User", `${message.author}`, true)
        .addField("Durasi", "10 Menit", true)
        .addField("Alasan", "Mencapai 3 strike", true)
        .setTimestamp();

      logChannel.send({ embeds: [timeoutEmbed] });
    }
  }
});
/* ================= LEVELING CHAT ================= */

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.member) return;
  if (message.content.length < 3) return;

  const now = Date.now();
  const userId = message.author.id;

  if (!levels[userId]) {
    levels[userId] = {
      chat: { total: 0, month: 0, week: 0, day: 0 },
      voice: { total: 0, month: 0, week: 0, day: 0 }
    };
  }

  if (cooldowns.has(userId)) {
    const expiration = cooldowns.get(userId) + config.chat_cooldown * 1000;
    if (now < expiration) return;
  }

  cooldowns.set(userId, now);

  let gained = config.chat_exp;

  // Booster
  if (message.member.roles.cache.has(BOOSTER_ROLE_ID)) {
    gained *= config.booster_multiplier;
  }

  // Double EXP
  if (config.double_exp) {
    gained *= config.double_exp_multiplier;
  }

  gained = Math.floor(gained);

  const oldTotal = levels[userId].chat.total + levels[userId].voice.total;

  levels[userId].chat.total += gained;
  levels[userId].chat.month += gained;
  levels[userId].chat.week += gained;
  levels[userId].chat.day += gained;

  const newTotal = levels[userId].chat.total + levels[userId].voice.total;

  saveLevels();
  checkLevelUp(message.member, oldTotal, newTotal);
});

/* ================= LEVELING VOICE ================= */

client.on("voiceStateUpdate", async (oldState, newState) => {

  if (!oldState.channelId && newState.channelId) {
    voiceTracker.set(newState.id, Date.now());
  }

  if (oldState.channelId && !newState.channelId) {

    const joinTime = voiceTracker.get(oldState.id);
    if (!joinTime) return;

    const duration = (Date.now() - joinTime) / 60000;
    voiceTracker.delete(oldState.id);

    if (duration < config.voice_minimum_minutes) return;

    const member = oldState.member;
    const userId = oldState.id;

    if (!levels[userId]) {
      levels[userId] = {
        chat: { total: 0, month: 0, week: 0, day: 0 },
        voice: { total: 0, month: 0, week: 0, day: 0 }
      };
    }

    let gained = Math.floor(duration * config.voice_exp_per_minute);

    if (member.roles.cache.has(BOOSTER_ROLE_ID)) {
      gained *= config.booster_multiplier;
    }

    if (config.double_exp) {
      gained *= config.double_exp_multiplier;
    }

    gained = Math.floor(gained);

    const oldTotal = levels[userId].chat.total + levels[userId].voice.total;

    levels[userId].voice.total += gained;
    levels[userId].voice.month += gained;
    levels[userId].voice.week += gained;
    levels[userId].voice.day += gained;

    const newTotal = levels[userId].chat.total + levels[userId].voice.total;

    saveLevels();
    checkLevelUp(member, oldTotal, newTotal);
  }
});

/* ================= AUTO WELCOME ================= */

client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.channels.cache.get(AUTO_WELCOME_CHANNEL);
  if (!channel) return;

  await channel.send(`~Ninu Ninu Ninu Ninu🚑🚨
༻꫞ Ꮅ𝑎𝑤𝑛 𐒄𝑒 ʄ𝑎𝑚𝑠 ꫞༺

Haii👋🏻, ${member}

Welcome to Pawn Me Family🧸🎉 Terimakasih karena telah berminat untuk bergabung dengan server kami✨🩷 Yok jangan malu untuk nimbrung dan ajak ajak untuk main game yok🎮🌟 Kamu, kita sambut dengan hangat🧸💕

~Tring Tring Tring⏰🎶

Kamu melupakan sesuatu tidak❓❓ Ayoo utamakan untuk Literasi Rules lebih dulu dan jangan lupa Take roles nyaa yapp, don't forget 💭💫

Semoga betah ya dan jangan malu malu untuk sapa sapa juga membahas hal random🐼✨ Anggap Pawn Me sebagai keluarga kamu dan rumah kedua mu🏡💞

*-Jangan sungkan sungkan kalo merasa tidak nyaman dan ingin mengeluh. Pengurus Pawn Me akan menerima semua kritik, saran dan keluhanmu di PM-💕✨*
`);
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async (interaction) => {

  if (interaction.isCommand()) {

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    
    if (interaction.commandName === "pmlevel") {
  const user = interaction.options.getUser("user") || interaction.user;
  const data = levels[user.id];

  if (!data) {
    return interaction.reply({ content: "User belum memiliki data level.", ephemeral: true });
  }

  const totalExp = data.chat.total + data.voice.total;
  const level = Math.floor(0.1 * Math.sqrt(totalExp));

  const embed = new MessageEmbed()
    .setColor("#9B59B6")
    .setTitle("🎮 Pawn Me Level")
    .addField("User", user.tag, true)
    .addField("Level", `${level}`, true)
    .addField("Total EXP", `${totalExp}`, true)
    .addField("Chat EXP", `${data.chat.total}`, true)
    .addField("Voice EXP", `${data.voice.total}`, true)
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

if (interaction.commandName === "pmleaderboard") {

  await interaction.deferReply();

  const kategori = interaction.options.getString("kategori");
  const waktu = interaction.options.getString("waktu") || "total";
  let jumlah = interaction.options.getInteger("jumlah");

  // Default logic
  if (!kategori) {
    jumlah = jumlah || 5; // 5 chat + 5 voice
  } else {
    jumlah = jumlah || 10; // kalau pilih kategori → default 10
  }

  const data = Object.entries(levels);

  const getSorted = (type) => {
    return data
      .sort((a, b) => (b[1][type][waktu] || 0) - (a[1][type][waktu] || 0))
      .slice(0, jumlah);
  };

  const embed = new MessageEmbed()
  .setColor("#F1C40F")
  .setTitle("🏆 Pawn Me Leaderboard")
  .setFooter({
    text: "Pawn Me Level System",
    iconURL: interaction.guild.iconURL({ dynamic: true })
  })
  .setTimestamp();

  // Kalau tidak pilih kategori → tampil dua-duanya
  if (!kategori) {

    let chatTop = getSorted("chat");
    let voiceTop = getSorted("voice");

const targetAmount = jumlah; // 5 atau 10 tergantung mode

await interaction.guild.members.fetch({ force: true });
const guildMembers = interaction.guild.members.cache;
const realMembers = guildMembers
  .filter(m => !m.user.bot)
  .map(m => m.id);

function getRandomMembers(amount, exclude = []) {
  const pool = realMembers.filter(id => !exclude.includes(id));
  const shuffled = pool.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, amount);
}

// Paksa Chat jadi targetAmount
if (chatTop.length < targetAmount) {
  const needed = targetAmount - chatTop.length;

  const existingIds = chatTop.map(u => u[0]);

  const randomIds = getRandomMembers(targetAmount * 2)
    .filter(id => !existingIds.includes(id))
    .slice(0, needed);

  const randomUsers = randomIds.map(id => [
    id,
    { chat: { [waktu]: 0 } }
  ]);

  chatTop = [...chatTop, ...randomUsers];
}
// Paksa Voice jadi targetAmount
if (voiceTop.length < targetAmount) {
  const needed = targetAmount - voiceTop.length;
  const existingIds = voiceTop.map(u => u[0]);
  const randomIds = getRandomMembers(needed, existingIds);

  const randomData = randomIds.map(id => [
    id,
    { voice: { [waktu]: 0 } }
  ]);

  voiceTop = [...voiceTop, ...randomData];
}

    const chatText = chatTop.map((u, i) =>
  `${i + 1}. <@${u[0]}> — ${u[1].chat[waktu] || 0} XP`
).join("\n");

const voiceText = voiceTop.map((u, i) =>
  `${i + 1}. <@${u[0]}> — ${u[1].voice[waktu] || 0} XP`
).join("\n");

    embed.addField("💬 Top Chat", chatText);
    embed.addField("🎧 Top Voice", voiceText);

  } else {

  let top = getSorted(kategori);
  const targetAmount = jumlah;

  const guildMembers = await interaction.guild.members.fetch();
  const realMembers = guildMembers
    .filter(m => !m.user.bot)
    .map(m => m.id);

  function getRandomMembers(amount, exclude = []) {
    const pool = realMembers.filter(id => !exclude.includes(id));
    const shuffled = pool.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, amount);
  }

  if (top.length < targetAmount) {
    const needed = targetAmount - top.length;
    const existingIds = top.map(u => u[0]);
    const randomIds = getRandomMembers(needed, existingIds);

    const filler = randomIds.map(id => [
      id,
      {
        chat: { [waktu]: 0 },
        voice: { [waktu]: 0 }
      }
    ]);

    top = [...top, ...filler];
  }

  const text = top.map((u, i) =>
    `${i + 1}. <@${u[0]}> — ${u[1][kategori][waktu] || 0} XP`
  ).join("\n");

  embed.addField(
    kategori === "chat" ? "💬 Top Chat" : "🎧 Top Voice",
    text
  );
}

  return interaction.editReply({ embeds: [embed] });
}

    if (interaction.commandName === "ping") return interaction.reply("pong");

    if (interaction.commandName === "saranpanel") {
      const row = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("open_saran")
          .setLabel("📬 Kirim Saran")
          .setStyle("PRIMARY")
      );

      return interaction.reply({
        embeds: [
          new MessageEmbed()
            .setTitle("📬 Kotak Saran")
            .setDescription("Klik tombol di bawah untuk mengirim kritik & saran.")
            .setColor("#5865F2")
        ],
        components: [row]
      });
    }

    if (["mute","timeout","kick","ban","clearstrikes"].includes(interaction.commandName)) {
      if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
        return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
      }
    }

    if (interaction.commandName === "checkstrike") {
      const user = interaction.options.getUser("user");
      const count = strikes[user.id] || 0;
      return interaction.reply({ content: `${user.tag} memiliki ${count} strike.`, ephemeral: true });
    }

    if (interaction.commandName === "clearstrikes") {
      const user = interaction.options.getUser("user");
      strikes[user.id] = 0;
      return interaction.reply({ content: `Strike ${user.tag} berhasil direset.`, ephemeral: true });
    }

    if (interaction.commandName === "mute" || interaction.commandName === "timeout") {
      const user = interaction.options.getUser("user");
      const duration = interaction.options.getInteger("duration");
      const reason = interaction.options.getString("reason") || "Tidak ada alasan";
      const member = interaction.guild.members.cache.get(user.id);
      if (!member.moderatable) return interaction.reply({ content: "Tidak bisa memoderasi user ini.", ephemeral: true });
      await member.timeout(duration * 60000, reason);
      interaction.reply(`${user.tag} di-timeout ${duration} menit.`);
      if (logChannel) logChannel.send(`🔇 ${user.tag} di-timeout ${duration} menit.\nAlasan: ${reason}`);
    }

    if (interaction.commandName === "kick") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Tidak ada alasan";
      const member = interaction.guild.members.cache.get(user.id);
      if (!member.kickable) return interaction.reply({ content: "Tidak bisa kick user ini.", ephemeral: true });
      await member.kick(reason);
      interaction.reply(`${user.tag} berhasil di-kick.`);
      if (logChannel) logChannel.send(`👢 ${user.tag} di-kick.\nAlasan: ${reason}`);
    }

    if (interaction.commandName === "ban") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Tidak ada alasan";
      const member = interaction.guild.members.cache.get(user.id);
      if (!member.bannable) return interaction.reply({ content: "Tidak bisa ban user ini.", ephemeral: true });
      await member.ban({ reason });
      interaction.reply(`${user.tag} berhasil di-ban.`);
      if (logChannel) logChannel.send(`🔨 ${user.tag} di-ban.\nAlasan: ${reason}`);
    }
  }

  if (interaction.isButton() && interaction.customId === "open_saran") {
    const modal = new Modal()
      .setCustomId("modal_saran")
      .setTitle("Kritik & Saran");

    const namaInput = new TextInputComponent()
      .setCustomId("nama")
      .setLabel("Nama (kosongkan untuk anonim)")
      .setStyle("SHORT");

    const isiInput = new TextInputComponent()
      .setCustomId("isi")
      .setLabel("Isi saran kamu")
      .setStyle("PARAGRAPH")
      .setRequired(true);

    modal.addComponents(
      new MessageActionRow().addComponents(namaInput),
      new MessageActionRow().addComponents(isiInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "modal_saran") {

    await interaction.deferReply({ ephemeral: true });

    const nama = interaction.fields.getTextInputValue("nama") || "Anonim";
    const isi = interaction.fields.getTextInputValue("isi");

    const now = new Date();
    const tanggal = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });
    const jam = now.toLocaleTimeString("en-US", { 
      timeZone: "Asia/Jakarta", 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: true 
    });
    
    const guildIcon = interaction.guild.iconURL({ dynamic: true });

    const embed = new MessageEmbed()
      .setTitle("📬 Kritik & Saran")
      .addField("👤 Pengirim:", nama)
      .addField("✉️ Isi Saran:", isi)
      .setColor("#57F287")
      .setFooter({
        text: `Terimakasih sudah memberikan saran! | ${tanggal} ${jam} WIB`,
        iconURL: guildIcon
      });

     const buttonRow = new MessageActionRow().addComponents(
       new MessageButton()
         .setCustomId("open_saran")
         .setLabel("📬 Kirim Saran")
         .setStyle("PRIMARY")
     );

     const channel = await client.channels.fetch(SARAN_CHANNEL_ID);

     const msg = await channel.send({
       embeds: [embed],
       components: [buttonRow]
});

    await msg.react("✅");
    await msg.react("❌");
    await msg.react("🙂");

    await msg.startThread({
      name: "Berikan Tanggapan",
      autoArchiveDuration: 1440
    });

    await interaction.editReply("Terima kasih! Saran kamu sudah terkirim.");
  }

});

// ================= LEVEL LEADERBOARD ================= \\

  setInterval(async () => {

  const now = new Date();
  if (now.getDate() !== 1 || now.getHours() !== 0) return;

  const channel = client.channels.cache.get(MONTHLY_LEADERBOARD_CHANNEL);
  if (!channel) return;

  const monthName = now.toLocaleString("id-ID", { month: "long" });
  const year = now.getFullYear();

  const chatTop = Object.entries(levels)
    .map(([id, data]) => ({ id, value: data.chat.month || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const voiceTop = Object.entries(levels)
    .map(([id, data]) => ({ id, value: data.voice.month || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const embed = new MessageEmbed()
    .setColor("#27AE60")
    .setTitle(`🏆 TOP AKTIF MEMBER PAWN ME BULAN ${monthName.toUpperCase()} ${year}`)
    .addField(
      "💬 CHAT TOP 10",
      chatTop.length
        ? chatTop.map((u, i) => `**${i+1}.** <@${u.id}> — ${u.value} XP`).join("\n")
        : "Belum ada data"
    )
    .addField(
      "🎙 VOICE TOP 10",
      voiceTop.length
        ? voiceTop.map((u, i) => `**${i+1}.** <@${u.id}> — ${u.value} XP`).join("\n")
        : "Belum ada data"
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  // Reset monthly
  for (const id in levels) {
    levels[id].chat.month = 0;
    levels[id].voice.month = 0;
  }

  saveLevels();

}, 60 * 60 * 1000);

client.login(TOKEN);
