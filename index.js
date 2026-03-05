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

const { createCanvas, loadImage, registerFont } = require("canvas");

registerFont("./fonts/Montserrat-Bold.ttf", {
  family: "MontserratBold"
});

registerFont("./fonts/Montserrat-Regular.ttf", {
  family: "Montserrat"
});

const { MessageAttachment } = require("discord.js");

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

const badWords = ["anjing", "bgst", "goblok", "kntl", "gblk", "bego", "jing", "puki", "bangsat", "kontol", "memek", "pantek", "babi"];
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

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function calculateLevel(exp) {
  return Math.floor(0.1 * Math.sqrt(exp));
}

async function checkLevelUp(member, oldExp, newExp) {

  if (!config.level_up_enabled) return;

  const oldLevel = getLevelData(oldExp).level;
  const newLevel = getLevelData(newExp).level;

  if (newLevel <= oldLevel) return;

// ================= ROLE REWARD =================

if (config.role_rewards_enabled && config.role_rewards) {

  const rewards = config.role_rewards;

  // Urutkan level reward
  const sortedLevels = Object.keys(rewards)
    .map(l => parseInt(l))
    .sort((a, b) => a - b);

  for (const level of sortedLevels) {

    if (newLevel >= level && oldLevel < level) {

      const roleId = rewards[level];
      const role = member.guild.roles.cache.get(roleId);

      if (!role) continue;

      // Rank mode aktif → hapus semua role reward lain
      if (config.rank_mode_enabled) {
        for (const otherLevel of sortedLevels) {
          const otherRoleId = rewards[otherLevel];
          if (member.roles.cache.has(otherRoleId)) {
            await member.roles.remove(otherRoleId).catch(() => {});
          }
        }
      }

      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(() => {});
      }
    }
  }
}

  const channel = member.guild.channels.cache.get(config.level_up_channel);
  if (!channel) return;

  const embed = new MessageEmbed()
    .setColor("#2ECC71")
    .setTitle("🎉 LEVEL UP!")
    .setDescription(
      config.level_up_mention
        ? `${member} naik ke **Level ${newLevel}** 🚀`
        : `User ${member.user.tag} naik ke Level ${newLevel}`
    )
    .addField("Level Sebelumnya", `${oldLevel}`, true)
    .addField("Level Sekarang", `${newLevel}`, true)
    .setFooter({ text: "Pawn Me Premium Level System" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
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
    {
      name: "kategori",
      description: "Kategori level",
      type: 3,
      required: false,
      choices: [
        { name: "Chat", value: "chat" },
        { name: "Voice", value: "voice" }
      ]
    },
    {
      name: "user",
      description: "Target user",
      type: 6,
      required: false
    }
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
},
{
    name: "pmconfig",
    description: "Panel pengaturan sistem leveling Pawn Me"
  },
  {
    name: "pmmonthly",
    description: "Trigger monthly leaderboard manual"
},
{
 name: "pmexpadd",
 description: "Tambah EXP member",
 options: [
  {
   name: "member",
   description: "Target member",
   type: 6,
   required: true
  },
  {
   name: "exp",
   description: "Jumlah EXP",
   type: 4,
   required: true
  },
  {
   name: "kategori",
   description: "Kategori EXP",
   type: 3,
   required: true,
   choices: [
    { name: "Chat", value: "chat" },
    { name: "Voice", value: "voice" }
   ]
  }
 ]
},

{
 name: "pmexpremove",
 description: "Kurangi EXP member",
 options: [
  {
   name: "member",
   description: "Target member",
   type: 6,
   required: true
  },
  {
   name: "exp",
   description: "Jumlah EXP",
   type: 4,
   required: true
  },
  {
   name: "kategori",
   description: "Kategori EXP",
   type: 3,
   required: true,
   choices: [
    { name: "Chat", value: "chat" },
    { name: "Voice", value: "voice" }
   ]
  }
 ]
},

{
 name: "pmexpreset",
 description: "Reset EXP",
 options: [
  {
   name: "kategori",
   description: "Kategori reset",
   type: 3,
   required: true,
   choices: [
    { name: "Member", value: "member" },
    { name: "Server", value: "server" }
   ]
  },
  {
   name: "member",
   description: "Target member",
   type: 6,
   required: false
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

  const normalized = message.content
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, "");

const regex = new RegExp(`\\b(${badWords.join("|")})\\b`, "i");

const detectedWord = regex.exec(normalized)?.[1];

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

async function sendWelcome(member, channel) {

  const embed = new MessageEmbed()
    .setColor("#1ABC9C")
    .setDescription(
`~Ninu Ninu Ninu Ninu🚑🚨  
༻꫞ Ꮅ𝑎𝑤𝑛 𐒄𝑒 ʄ𝑎𝑚𝑠 ꫞༺  

Haii👋🏻, ${member}

Welcome to Pawn Me Family🧸🎉 Terimakasih karena telah berminat untuk bergabung dengan server kami✨🩷  
Yok jangan malu untuk nimbrung dan ajak ajak untuk main game yok🎮🌟  
Kamu, kita sambut dengan hangat🧸💕

~Tring Tring Tring⏰🎶  

Kamu melupakan sesuatu tidak❓❓  
Ayoo utamakan untuk Literasi Rules lebih dulu dan jangan lupa Take roles nyaa yapp, don't forget 💭💫  

Semoga betah ya dan jangan malu malu untuk sapa sapa juga membahas hal random🐼✨  
Anggap Pawn Me sebagai keluarga kamu dan rumah kedua mu🏡💞  

*-Jangan sungkan sungkan kalo merasa tidak nyaman dan ingin mengeluh.  
Pengurus Pawn Me akan menerima semua kritik, saran dan keluhanmu di PM-💕✨*`
)

    .setFooter({
      text: `PAWN ME Auto Welcome`,
      iconURL: member.guild.iconURL({ dynamic: true })
    })
    .setTimestamp();

  await channel.send({
  content: "**WELCOME TO PAWN ME FAMILY**",
  embeds: [embed]
});
}

client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.channels.cache.get(AUTO_WELCOME_CHANNEL);
  if (!channel) return;

  sendWelcome(member, channel);
});

// ===== LEVEL SYSTEM =====
function getLevelData(exp) {

let level = 0;
let xpNeeded = 100;
let currentXP = exp;

while (currentXP >= xpNeeded) {
  currentXP -= xpNeeded;
  level++;
  xpNeeded = Math.floor(xpNeeded * 1.5);
}

return {
  level: level,
  currentXP: currentXP,
  requiredXP: xpNeeded
};

}
/* ================= LEVEL CARD ================= */

async function generateLevelCard(member, totalExp, rank) {

function roundRect(ctx, x, y, width, height, radius, fillColor) {
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

  const width = 1000;
  const height = 350;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
const background = await loadImage("https://cdn.discordapp.com/attachments/1466412308128465031/1478023678355832833/image0_91.jpg?ex=69a8de91&is=69a78d11&hm=e57c1482112fbff9d967dbfc17b6a2bc209a32d5ccda71451e53d813dd774842&");
ctx.drawImage(background, 0, 0, width, height);

// (Optional) subtle gradient overlay kalau kamu pakai
const overlay = ctx.createLinearGradient(0, 0, 0, height);
overlay.addColorStop(0, "rgba(0,0,0,0.2)");
overlay.addColorStop(1, "rgba(0,0,0,0.5)");
ctx.fillStyle = overlay;
ctx.fillRect(0, 0, width, height);

// Glass panel
roundRect(ctx, 40, 40, width - 80, height - 80, 30, "rgba(10,10,30,0.55)");

  ctx.strokeStyle = "rgba(120, 180, 255, 0.4)";
ctx.lineWidth = 2;
roundRect(ctx, 40, 40, width - 80, height - 80, 30, "transparent");
ctx.stroke();

// Border tipis glow
ctx.strokeStyle = "rgba(120, 150, 255, 0.5)";
ctx.lineWidth = 2;
ctx.strokeRect(40, 40, width - 80, height - 80);

  // === Hitung Level ===
  const levelData = getLevelData(totalExp);

const level = levelData.level;
const currentXP = levelData.currentXP;
const requiredXP = levelData.requiredXP;

const progress = currentXP / requiredXP;

  // === Avatar ===
  const avatar = await loadImage(
    member.user.displayAvatarURL({ format: "png", size: 256 })
  );

  // Avatar border
ctx.strokeStyle = "#000000";
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(160, 175, 90, 0, Math.PI * 2);
ctx.stroke();

// Status dot
ctx.fillStyle = "#00FF88";
ctx.beginPath();
ctx.arc(225, 235, 18, 0, Math.PI * 2);
ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(160, 175, 90, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 70, 85, 180, 180);
  ctx.restore();
  
  ctx.beginPath();
ctx.arc(160, 175, 95, 0, Math.PI * 2);
ctx.strokeStyle = "rgba(26,188,156,0.8)";
ctx.lineWidth = 6;
ctx.shadowColor = "rgba(26,188,156,0.7)";
ctx.shadowBlur = 20;
ctx.stroke();
ctx.shadowBlur = 0;

  // === Text Settings ===
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "24px Montserrat";
  ctx.fillText(`RANK #${rank}`, 300, 90);

  ctx.font = "28px Montserrat";
ctx.fillStyle = "#00E5FF";
ctx.shadowColor = "#00E5FF";
ctx.shadowBlur = 15;
ctx.fillText(`LEVEL ${level}`, 780, 90);
ctx.shadowBlur = 0;

  // Username
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "32px MontserratBold";
  ctx.fillText(member.user.username, 300, 160);

  // === Progress Bar ===
  const barWidth = 520;
  const barHeight = 30;
  const barX = 300;
  const barY = 210;
  const xpX = barX + barWidth;

  roundRect(ctx, barX, barY, barWidth, barHeight, 20, "#2C2F33");

  // XP Right Aligned (P sejajar dengan level)
  ctx.font = "22px Montserrat";
  ctx.textAlign = "right";
  ctx.fillText(`${currentXP} / ${requiredXP} XP`, xpX, 160);
  ctx.textAlign = "left";

  
// Gradient
const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
gradient.addColorStop(0, "#1ABC9C");
gradient.addColorStop(1, "#00E5FF");

// Glow
ctx.shadowColor = "#00E5FF";
ctx.shadowBlur = 20;

// Fill
roundRect(ctx, barX, barY, barWidth * progress, barHeight, 20, gradient);

// Reset shadow
ctx.shadowBlur = 0;

  return canvas.toBuffer();
}

// ================= DUAL LEVEL CARD SYSTEM ================= \\

async function generateDualLevelCard(member, data, rankChat, rankVoice) {

// ===== SAFETY DATA =====
data = data || {};
data.chat = data.chat || { total: 0 };
data.voice = data.voice || { total: 0 };

const width = 1000;
const height = 350;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

// ================= HELPER ================= \\
function roundRect(ctx, x, y, width, height, radius, color) {
ctx.fillStyle = color;
ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.lineTo(x + width - radius, y);
ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
ctx.lineTo(x + width, y + height - radius);
ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
ctx.lineTo(x + radius, y + height);
ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
ctx.lineTo(x, y + radius);
ctx.quadraticCurveTo(x, y, x + radius, y);
ctx.closePath();
ctx.fill();
}

// ================= BACKGROUND ================= \\
const background = await loadImage("https://cdn.discordapp.com/attachments/1466412308128465031/1478023678355832833/image0_91.jpg?ex=69a8de91&is=69a78d11&hm=e57c1482112fbff9d967dbfc17b6a2bc209a32d5ccda71451e53d813dd774842&");
ctx.drawImage(background, 0, 0, width, height);

const overlay = ctx.createLinearGradient(0, 0, 0, height);
overlay.addColorStop(0, "rgba(0,0,0,0.3)");
overlay.addColorStop(1, "rgba(0,0,0,0.6)");
ctx.fillStyle = overlay;
ctx.fillRect(0, 0, width, height);

roundRect(ctx, 40, 40, width - 80, height - 80, 30, "rgba(10,10,30,0.55)");


// ================= AVATAR ================= \\
const avatar = await loadImage(
member.user.displayAvatarURL({ format: "png", size: 256 })
);

ctx.save();
ctx.beginPath();
ctx.arc(170, 175, 85, 0, Math.PI * 2);
ctx.closePath();
ctx.clip();
ctx.drawImage(avatar, 85, 90, 170, 170);
ctx.restore();

ctx.strokeStyle = "#1ABC9C";
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(170, 175, 90, 0, Math.PI * 2);
ctx.stroke();


// ================= USERNAME ================= \\
ctx.fillStyle = "#FFFFFF";
ctx.font = "32px MontserratBold";
ctx.fillText(member.user.username, 320, 120);


// ================= BAR SETTINGS ================= \\
const barWidth = 500;
const barHeight = 28;
const barX = 320;


// ================= EXP DATA ================= \\
const chatExp = data.chat.total || 0;
const voiceExp = data.voice.total || 0;

const chatData = getLevelData(chatExp);
const voiceData = getLevelData(voiceExp);

const chatLevel = chatData.level;
const voiceLevel = voiceData.level;

const chatXP = chatData.currentXP;
const voiceXP = voiceData.currentXP;

const chatNeed = chatData.requiredXP;
const voiceNeed = voiceData.requiredXP;

const chatProgress = chatXP / chatNeed;
const voiceProgress = voiceXP / voiceNeed;


// ================= CHAT BAR ================= \\
const chatY = 170;

ctx.fillStyle = "#FFFFFF";
ctx.font = "20px Montserrat";
ctx.fillText("CHAT", barX, chatY - 10);

ctx.textAlign = "right";
ctx.fillText(`${Math.floor(chatXP)} / ${Math.floor(chatNeed)} XP`, barX + barWidth, chatY - 10);
ctx.textAlign = "left";

roundRect(ctx, barX, chatY, barWidth, barHeight, 15, "#2C2F33");

const chatGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
chatGradient.addColorStop(0, "#1ABC9C");
chatGradient.addColorStop(1, "#00E5FF");

ctx.fillStyle = chatGradient;
roundRect(ctx, barX, chatY, barWidth * chatProgress, barHeight, 15, chatGradient);

ctx.fillStyle = "#FFFFFF";
ctx.font = "18px Montserrat";
ctx.fillText(`Rank #${rankChat}`, barX + 170, chatY - 10);
ctx.fillText(`LVL ${chatLevel}`, barX + barWidth + 20, chatY + 20);


// ================= VOICE BAR ================= \\
const voiceY = 240;

ctx.fillStyle = "#FFFFFF";
ctx.font = "20px Montserrat";
ctx.fillText("?VOICE", barX, voiceY - 10);

ctx.textAlign = "right";
ctx.fillText(`${Math.floor(voiceXP)} / ${Math.floor(voiceNeed)} XP`, barX + barWidth, voiceY - 10);
ctx.textAlign = "left";

roundRect(ctx, barX, voiceY, barWidth, barHeight, 15, "#2C2F33");

const voiceGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
voiceGradient.addColorStop(0, "#9B59B6");
voiceGradient.addColorStop(1, "#3498DB");

ctx.fillStyle = voiceGradient;
roundRect(ctx, barX, voiceY, barWidth * voiceProgress, barHeight, 15, voiceGradient);

ctx.fillStyle = "#FFFFFF";
ctx.font = "18px Montserrat";
ctx.fillText(`Rank #${rankVoice}`, barX + 170, voiceY - 10);
ctx.fillText(`LVL ${voiceLevel}`, barX + barWidth + 20, voiceY + 20);

return canvas.toBuffer();

}

// ================= END DUAL LEVEL CARD ================= \\

// ================= SINGLE LEVEL CARD ================= \\

async function generateSingleLevelCard(member, exp, rank, type) {

const width = 1000;
const height = 350;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

function roundRect(ctx, x, y, width, height, radius, color) {
ctx.fillStyle = color;
ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.lineTo(x + width - radius, y);
ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
ctx.lineTo(x + width, y + height - radius);
ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
ctx.lineTo(x + radius, y + height);
ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
ctx.lineTo(x, y + radius);
ctx.quadraticCurveTo(x, y, x + radius, y);
ctx.closePath();
ctx.fill();
}

// ================= BACKGROUND ================= \\

ctx.fillStyle = "#0f172a";
ctx.fillRect(0,0,width,height);

roundRect(ctx, 40, 40, width - 80, height - 80, 30, "rgba(10,10,30,0.6)");


// ================= AVATAR ================= \\

const avatar = await loadImage(
member.user.displayAvatarURL({ format: "png", size: 256 })
);

ctx.save();
ctx.beginPath();
ctx.arc(170,175,85,0,Math.PI*2);
ctx.closePath();
ctx.clip();
ctx.drawImage(avatar,85,90,170,170);
ctx.restore();

ctx.strokeStyle = "#00E5FF";
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(170,175,90,0,Math.PI*2);
ctx.stroke();


// ================= LEVEL CALC ================= \\

const levelData = getLevelData(exp);

const level = levelData.level;
const currentXP = levelData.currentXP;
const requiredXP = levelData.requiredXP;

const progress = currentXP / requiredXP;


// ================= TEXT ================= \\

ctx.fillStyle = "#FFFFFF";
ctx.font = "32px Sans";
ctx.fillText(member.user.username,320,120);

ctx.font = "24px Sans";
ctx.fillText(`Rank #${rank}`,320,170);

ctx.font = "26px Sans";
ctx.fillText(`Level ${level}`,780,120);


// ================= BAR ================= \\

const barWidth = 520;
const barHeight = 30;

const barX = 320;
const barY = 210;

roundRect(ctx,barX,barY,barWidth,barHeight,20,"#2C2F33");

const gradient = ctx.createLinearGradient(barX,0,barX+barWidth,0);

if(type === "chat"){
gradient.addColorStop(0,"#1ABC9C");
gradient.addColorStop(1,"#00E5FF");
}else{
gradient.addColorStop(0,"#9B59B6");
gradient.addColorStop(1,"#3498DB");
}

ctx.fillStyle = gradient;

roundRect(ctx,barX,barY,barWidth*progress,barHeight,20,gradient);


// ================= XP TEXT ================= \\

ctx.fillStyle = "#FFFFFF";
ctx.font = "22px Sans";
ctx.textAlign = "right";

ctx.fillText(
`${Math.floor(currentXP)} / ${Math.floor(requiredXP)} XP`,
barX + barWidth,
170
);

ctx.textAlign = "left";

return canvas.toBuffer();

}

// ================= END SINGLE LEVEL CARD ================= \\

/* ================= INTERACTION ================= */

client.on("interactionCreate", async (interaction) => {

  if (!interaction.isCommand()) return;

  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);

  if (interaction.commandName === "pmlevel") {

  await interaction.deferReply();

  const user = interaction.options.getUser("user") || interaction.user;
  const kategori = interaction.options.getString("kategori");

  if (!levels[user.id]) {
    levels[user.id] = {
      chat: { total: 0 },
      voice: { total: 0 }
    };
    saveLevels();
  }

  const data = levels[user.id];
  const member = await interaction.guild.members.fetch(user.id);

  // ================= HITUNG RANK CHAT =================
  const sortedChat = Object.entries(levels)
    .map(([id, d]) => ({
      id,
      total: d.chat?.total || 0
    }))
    .sort((a, b) => b.total - a.total);

  const rankChat = sortedChat.findIndex(u => u.id === user.id) + 1;


  // ================= HITUNG RANK VOICE =================
  const sortedVoice = Object.entries(levels)
    .map(([id, d]) => ({
      id,
      total: d.voice?.total || 0
    }))
    .sort((a, b) => b.total - a.total);

  const rankVoice = sortedVoice.findIndex(u => u.id === user.id) + 1;


  let buffer;

  if (kategori === "chat") {

    buffer = await generateSingleLevelCard(
      member,
      data.chat.total || 0,
      rankChat,
      "chat"
    );

  } else if (kategori === "voice") {

    buffer = await generateSingleLevelCard(
      member,
      data.voice.total || 0,
      rankVoice,
      "voice"
    );

  } else {

    buffer = await generateDualLevelCard(
      member,
      data,
      rankChat,
      rankVoice
    );

  }

  const attachment = new MessageAttachment(buffer, "pm-level.png");

  await interaction.editReply({
    files: [attachment]
  });
}


  // ================= WELCOME =================

  if (interaction.commandName === "welcome") {

    const user = interaction.options.getUser("user1");
    const member = await interaction.guild.members.fetch(user.id);
  await sendWelcome(member, interaction.channel);

  return interaction.reply({ content: "Test welcome terkirim.", ephemeral: true });
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

    if (interaction.commandName === "pmmonthly") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  await interaction.reply({ content: "Manual monthly leaderboard dijalankan.", ephemeral: true });

  // Panggil ulang logic leaderboard monthly di sini
}

    if (interaction.commandName === "pmconfig") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const embed = new MessageEmbed()
    .setColor("#1ABC9C")
    .setTitle("🎛 Pawn Me Leveling Control Panel")
    .setDescription("Gunakan tombol di bawah untuk mengatur sistem leveling.")
    .addField("Chat EXP", `${config.chat_exp}`, true)
    .addField("Voice EXP / Min", `${config.voice_exp_per_minute}`, true)
    .addField("Chat Cooldown", `${config.chat_cooldown} detik`, true)
    .addField("Booster Multiplier", `${config.booster_multiplier}x`, true)
    .addField("Double EXP", config.double_exp ? "Aktif" : "Nonaktif", true)
    .addField("Level Up", config.level_up_enabled ? "Aktif" : "Nonaktif", true)
    .addField("Level Up Channel", `<#${config.level_up_channel}>`, true)
    .addField("Level Up Mention", config.level_up_mention ? "On" : "Off", true)
    .addField("Role Reward", config.role_rewards_enabled ? "Aktif" : "Nonaktif", true)
    .addField("Rank Mode", config.rank_mode_enabled ? "Aktif" : "Nonaktif", true)
    .setFooter({ text: "Pawn Me Premium Level System" })
    .setTimestamp();

  const row1 = new MessageActionRow().addComponents(
  new MessageButton()
    .setCustomId("config_exp")
    .setLabel("EXP Settings")
    .setStyle("PRIMARY"),
  new MessageButton()
    .setCustomId("config_double")
    .setLabel("Double EXP")
    .setStyle("SUCCESS"),
  new MessageButton()
    .setCustomId("config_booster")
    .setLabel("Booster")
    .setStyle("SECONDARY"),
  new MessageButton()
    .setCustomId("config_role")
    .setLabel("Role Reward")
    .setStyle("DANGER"),
  new MessageButton()
    .setCustomId("config_scheduler")
    .setLabel("Scheduler")
    .setStyle("SECONDARY")
);

const row2 = new MessageActionRow().addComponents(
  new MessageButton()
    .setCustomId("config_rankmode")
    .setLabel("Rank Mode")
    .setStyle("SECONDARY"),

  new MessageButton()
    .setCustomId("config_levelup")
    .setLabel("Level Up")
    .setStyle("SECONDARY"),

  new MessageButton()
    .setCustomId("config_manage_rewards")
    .setLabel("Manage Rewards")
    .setStyle("PRIMARY")
);

  return interaction.reply({
  embeds: [embed],
  components: [row1, row2],
  ephemeral: true
});
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

if (interaction.commandName === "pmexpadd") {

const member = interaction.options.getMember("member");
const exp = interaction.options.getInteger("exp");
const kategori = interaction.options.getString("kategori");

if (!levels[member.id]) {
levels[member.id] = { chat:{total:0}, voice:{total:0} };
}

levels[member.id][kategori].total += exp;

saveLevels();

return interaction.reply({
content:`✅ ${exp} EXP ditambahkan ke ${member}`,
ephemeral:true
});

}

if (interaction.commandName === "pmexpremove") {

const member = interaction.options.getMember("member");
const exp = interaction.options.getInteger("exp");
const kategori = interaction.options.getString("kategori");

if (!levels[member.id]) {
levels[member.id] = { chat:{total:0}, voice:{total:0} };
}

levels[member.id][kategori].total =
Math.max(0, levels[member.id][kategori].total - exp);

saveLevels();

return interaction.reply({
content:`❌ ${exp} EXP dikurangi dari ${member}`,
ephemeral:true
});

}

if (interaction.commandName === "pmexpreset") {

const kategori = interaction.options.getString("kategori");
const member = interaction.options.getMember("member");

if (kategori === "member") {

if (!member) {
return interaction.reply({
content: "Pilih member.",
ephemeral: true
});
}

levels[member.id] = { chat:{total:0}, voice:{total:0} };

saveLevels();

return interaction.reply({
content: `♻️ EXP ${member} berhasil direset`,
ephemeral: true
});

}

else if (kategori === "server") {

levels = {};
saveLevels();

return interaction.reply({
content: "♻️ Semua EXP server direset",
ephemeral: true
});

}

}
  if (interaction.isButton()) {

  if (interaction.customId === "config_exp") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const modal = new Modal()
    .setCustomId("modal_exp_settings")
    .setTitle("Edit EXP Settings");

  const chatExpInput = new TextInputComponent()
    .setCustomId("chat_exp")
    .setLabel("Chat EXP per pesan")
    .setStyle("SHORT")
    .setValue(String(config.chat_exp))
    .setRequired(true);

  const voiceExpInput = new TextInputComponent()
    .setCustomId("voice_exp")
    .setLabel("Voice EXP per menit")
    .setStyle("SHORT")
    .setValue(String(config.voice_exp_per_minute))
    .setRequired(true);

  const cooldownInput = new TextInputComponent()
    .setCustomId("chat_cooldown")
    .setLabel("Chat Cooldown (detik)")
    .setStyle("SHORT")
    .setValue(String(config.chat_cooldown))
    .setRequired(true);

  modal.addComponents(
    new MessageActionRow().addComponents(chatExpInput),
    new MessageActionRow().addComponents(voiceExpInput),
    new MessageActionRow().addComponents(cooldownInput)
  );

  return interaction.showModal(modal);
}

if (interaction.customId === "config_manage_rewards") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  if (!config.role_rewards || Object.keys(config.role_rewards).length === 0) {
    return interaction.reply({
      content: "Belum ada role reward yang terdaftar.",
      ephemeral: true
    });
  }

  const sorted = Object.keys(config.role_rewards)
    .map(l => parseInt(l))
    .sort((a, b) => a - b);

  const listText = sorted.map(level => {
    const roleId = config.role_rewards[level];
    return `Level ${level} → <@&${roleId}>`;
  }).join("\n");

  const embed = new MessageEmbed()
    .setColor("#F1C40F")
    .setTitle("🎖 Role Reward List")
    .setDescription(listText)
    .setFooter({ text: "Gunakan modal untuk hapus reward tertentu" })
    .setTimestamp();

  const row = new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId("config_remove_reward")
      .setLabel("Remove Reward")
      .setStyle("DANGER")
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

if (interaction.customId === "config_remove_reward") {

  const modal = new Modal()
    .setCustomId("modal_remove_reward")
    .setTitle("Remove Role Reward");

  const levelInput = new TextInputComponent()
    .setCustomId("remove_level")
    .setLabel("Masukkan level yang ingin dihapus")
    .setStyle("SHORT")
    .setRequired(true);

  modal.addComponents(
    new MessageActionRow().addComponents(levelInput)
  );

  return interaction.showModal(modal);
}

if (interaction.customId === "config_rankmode") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  config.rank_mode_enabled = !config.rank_mode_enabled;
  saveConfig();

  const embed = new MessageEmbed()
    .setColor(config.rank_mode_enabled ? "#2ECC71" : "#E74C3C")
    .setTitle("🏆 Rank Mode Updated")
    .setDescription(
      config.rank_mode_enabled
        ? "Rank Mode sekarang **AKTIF**.\nRole lama akan dicabut saat naik level."
        : "Rank Mode sekarang **NONAKTIF**.\nRole akan menumpuk."
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

  if (interaction.customId === "config_levelup") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  config.level_up_enabled = !config.level_up_enabled;
  saveConfig();

  const embed = new MessageEmbed()
    .setColor(config.level_up_enabled ? "#2ECC71" : "#E74C3C")
    .setTitle("🎉 Level Up Notification")
    .setDescription(
      config.level_up_enabled
        ? "Level Up sekarang **AKTIF**."
        : "Level Up sekarang **NONAKTIF**."
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

  if (interaction.customId === "config_scheduler") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  config.monthly_scheduler_enabled = !config.monthly_scheduler_enabled;
saveConfig();

const statusText = config.monthly_scheduler_enabled
  ? "Manual monthly leaderboard ON"
  : "Manual monthly leaderboard OFF";

const embed = new MessageEmbed()
  .setColor(config.monthly_scheduler_enabled ? "#2ECC71" : "#E74C3C")
  .setTitle("📅 Monthly Leaderboard Control")
  .setDescription(`Status: **${statusText}**`)
  .setTimestamp();

return interaction.reply({ embeds: [embed], ephemeral: true });
}

  if (interaction.customId === "config_booster") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const modal = new Modal()
    .setCustomId("modal_booster_settings")
    .setTitle("Edit Booster Multiplier");

  const boosterInput = new TextInputComponent()
    .setCustomId("booster_multiplier")
    .setLabel("Booster Multiplier (contoh: 1.5)")
    .setStyle("SHORT")
    .setValue(String(config.booster_multiplier))
    .setRequired(true);

  modal.addComponents(
    new MessageActionRow().addComponents(boosterInput)
  );

  return interaction.showModal(modal);
}

if (interaction.customId === "config_role") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const modal = new Modal()
    .setCustomId("modal_role_reward")
    .setTitle("Set Role Reward");

  const levelInput = new TextInputComponent()
    .setCustomId("reward_level")
    .setLabel("Level (contoh: 5)")
    .setStyle("SHORT")
    .setRequired(true);

  const roleInput = new TextInputComponent()
    .setCustomId("reward_role_id")
    .setLabel("Role ID")
    .setStyle("SHORT")
    .setRequired(true);

  modal.addComponents(
    new MessageActionRow().addComponents(levelInput),
    new MessageActionRow().addComponents(roleInput)
  );

  return interaction.showModal(modal);
}

  if (interaction.customId === "config_double") {

    if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
      return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
    }

    config.double_exp = !config.double_exp;
    saveConfig();

    const embed = new MessageEmbed()
      .setColor(config.double_exp ? "#2ECC71" : "#E74C3C")
      .setTitle("⚡ Double EXP Updated")
      .setDescription(
        config.double_exp
          ? "Double EXP sekarang **AKTIF**."
          : "Double EXP sekarang **NONAKTIF**."
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

}

if (interaction.isModalSubmit() && interaction.customId === "modal_remove_reward") {

  const level = interaction.fields.getTextInputValue("remove_level");

  if (!config.role_rewards[level]) {
    return interaction.reply({
      content: "Level tersebut tidak memiliki role reward.",
      ephemeral: true
    });
  }

  delete config.role_rewards[level];
  saveConfig();

  const embed = new MessageEmbed()
    .setColor("#E74C3C")
    .setTitle("🗑 Role Reward Removed")
    .setDescription(`Reward untuk level ${level} berhasil dihapus.`)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

  if (interaction.isModalSubmit() && interaction.customId === "modal_role_reward") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const level = interaction.fields.getTextInputValue("reward_level");
  const roleId = interaction.fields.getTextInputValue("reward_role_id");

  if (isNaN(level)) {
    return interaction.reply({ content: "Level harus angka.", ephemeral: true });
  }

  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({ content: "Role ID tidak ditemukan.", ephemeral: true });
  }

  if (!config.role_rewards) {
    config.role_rewards = {};
  }

  config.role_rewards[level] = roleId;
  config.role_rewards_enabled = true;

  saveConfig();

  const embed = new MessageEmbed()
    .setColor("#2ECC71")
    .setTitle("🎖 Role Reward Updated")
    .setDescription(`Level **${level}** sekarang akan mendapatkan role <@&${roleId}>`)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

  if (interaction.isModalSubmit() && interaction.customId === "modal_exp_settings") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({ content: "Kamu tidak punya izin.", ephemeral: true });
  }

  const newChatExp = parseInt(interaction.fields.getTextInputValue("chat_exp"));
  const newVoiceExp = parseInt(interaction.fields.getTextInputValue("voice_exp"));
  const newCooldown = parseInt(interaction.fields.getTextInputValue("chat_cooldown"));

  if (isNaN(newChatExp) || isNaN(newVoiceExp) || isNaN(newCooldown)) {
    return interaction.reply({ content: "Input harus berupa angka.", ephemeral: true });
  }

  config.chat_exp = newChatExp;
  config.voice_exp_per_minute = newVoiceExp;
  config.chat_cooldown = newCooldown;

  saveConfig();

  const embed = new MessageEmbed()
    .setColor("#3498DB")
    .setTitle("✅ EXP Settings Updated")
    .addField("Chat EXP", `${config.chat_exp}`, true)
    .addField("Voice EXP / Min", `${config.voice_exp_per_minute}`, true)
    .addField("Chat Cooldown", `${config.chat_cooldown} detik`, true)
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
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

  if (!config.monthly_scheduler_enabled) return;

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
