/* ================= IMPORT MODULE ================= */

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
const { MessageAttachment } = require("discord.js");
const fs = require("fs");


/* ================= FONT REGISTER ================= */

registerFont("./fonts/Montserrat-Bold.ttf", {
  family: "MontserratBold"
});

registerFont("./fonts/Montserrat-Regular.ttf", {
  family: "Montserrat"
});


/* ================= ENV & CONSTANT ================= */

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


/* ================= BAD WORD FILTER ================= */

const badWords = [
  "anjing","bgst","goblok","kntl","gblk","bego",
  "jing","puki","bangsat","kontol","memek","pantek","babi"
];

let strikes = {};

/* ================= FILE STORAGE ================= */

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

/* ================= LEVEL CALCULATION ================= */

function calculateLevel(exp) {
  return Math.floor(0.1 * Math.sqrt(exp));
}

/* ================= LEVEL DATA SYSTEM ================= */

function getLevelData(exp) {

  const level = calculateLevel(exp);

  const nextLevelExp = Math.pow((level + 1) / 0.1, 2);
  const currentLevelExp = Math.pow(level / 0.1, 2);

  const currentXP = Math.floor(exp - currentLevelExp);
  const requiredXP = Math.floor(nextLevelExp - currentLevelExp);

  return {
    level,
    currentXP,
    requiredXP
  };

}

/* ================= RANK SYSTEM ================= */

function getRank(userId, category = "chat") {

  const sorted = Object.entries(levels)
    .map(([id, data]) => ({
      id,
      xp: data?.[category]?.total || 0
    }))
    .sort((a,b) => b.xp - a.xp);

  const index = sorted.findIndex(u => u.id === userId);

  return index === -1 ? 0 : index + 1;

}

/* ================= LEVEL UP SYSTEM ================= */

async function checkLevelUp(member, oldExp, newExp) {

  if (!config.level_up_enabled) return;

  const oldLevel = getLevelData(oldExp).level;
  const newLevel = getLevelData(newExp).level;

  if (newLevel <= oldLevel) return;

  /* ----- ROLE REWARD ----- */

  if (config.role_rewards_enabled && config.role_rewards) {

    const rewards = config.role_rewards;

    const sortedLevels = Object.keys(rewards)
      .map(l => parseInt(l))
      .sort((a,b) => a - b);

    for (const level of sortedLevels) {

      if (newLevel >= level && oldLevel < level) {

        const roleId = rewards[level];
        const role = member.guild.roles.cache.get(roleId);

        if (!role) continue;

        if (config.rank_mode_enabled) {

          for (const otherLevel of sortedLevels) {

            const otherRoleId = rewards[otherLevel];

            if (member.roles.cache.has(otherRoleId)) {
              await member.roles.remove(otherRoleId).catch(()=>{});
            }

          }

        }

        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(()=>{});
        }

      }

    }

  }

  /* ----- LEVEL UP MESSAGE ----- */

  const channel = member.guild.channels.cache.get(config.level_up_channel);
  if (!channel) return;

  const embed = new MessageEmbed()
    .setColor("#2ECC71")
    .setTitle("LEVEL UP!")
    .setDescription(
      config.level_up_mention
        ? `${member} naik ke **Level ${newLevel}**`
        : `User ${member.user.tag} naik ke Level ${newLevel}`
    )
    .addField("Level Sebelumnya", `${oldLevel}`, true)
    .addField("Level Sekarang", `${newLevel}`, true)
    .setFooter({ text: "Pawn Me Premium Level System" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });

}

/* ================= CLIENT INITIALIZATION ================= */

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

/* ================= BOT READY EVENT ================= */

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
  name: "pmxpadd",
  description: "Tambah XP ke member",
  options: [
    { name: "member", description: "Member", type: 6, required: true },
    {
      name: "kategori",
      description: "Kategori XP",
      type: 3,
      required: true,
      choices: [
        { name: "Chat", value: "chat" },
        { name: "Voice", value: "voice" }
      ]
    },
    { name: "xp", description: "Jumlah XP yang ditambah", type: 4, required: true }
  ]
},
{
  name: "pmxpreset",
  description: "Reset XP member",
  options: [
    {
      name: "mode",
      description: "Reset mode (server untuk semua, atau pilih kategori)",
      type: 3,
      required: true,
      choices: [
        { name: "Server (Reset Semua)", value: "server" },
        { name: "Chat", value: "chat" },
        { name: "Voice", value: "voice" }
      ]
    },
    { name: "user", description: "Member (opsional, jika ingin reset 1 member)", type: 6, required: false }
  ]
},

{
  name: "pmxpremove",
  description: "Kurangi XP member",
  options: [
    { name: "user", description: "Member", type: 6, required: true },
    {
      name: "kategori",
      description: "Kategori XP",
      type: 3,
      required: true,
      choices: [
        { name: "Chat", value: "chat" },
        { name: "Voice", value: "voice" }
      ]
    },
    {
      name: "xp",
      description: "Jumlah XP atau pilihan",
      type: 3,
      required: true,
      choices: [
        { name: "Angka (input manual)", value: "custom" },
        { name: "Semua (all)", value: "all" },
        { name: "Setengah (half)", value: "half" }
      ]
    },
    { name: "jumlah", description: "Masukkan jumlah jika pilih 'Angka'", type: 4, required: false }
  ]
},
{
  name: "zuan",
  description: "Auto response system",
  options: [
    {
      name: "enable",
      description: "Aktifkan auto response",
      type: 1
    },
    {
      name: "disable",
      description: "Matikan auto response",
      type: 1
    },
    {
      name: "add",
      description: "Tambah trigger",
      type: 1,
      options: [
        {
          name: "kata",
          description: "kata trigger",
          type: 3,
          required: true
        },
        {
          name: "respon",
          description: "balasan bot",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "remove",
      description: "Hapus trigger",
      type: 1,
      options: [
        {
          name: "kata",
          description: "kata trigger",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "list",
      description: "Lihat semua trigger",
      type: 1
    }
  ]
}, 

  ];

  await client.application.commands.set(commands, GUILD_ID);

  console.log("Slash commands registered.");

});

/* ================= AUTO MODERATION ================= */

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (!message.guild) return;

/* ================= AUTO RESPONSE ================= */

const path = "./data/autoresponse.json";

if (fs.existsSync(path)) {

  const data = JSON.parse(fs.readFileSync(path));
  const guildData = data[message.guild.id];

  if (guildData && guildData.enabled) {

    const content = message.content.toLowerCase();

    for (const trigger in guildData.triggers) {

      if (content.includes(trigger)) {
        message.reply(guildData.triggers[trigger]);
        break;
      }

    }

  }

}

  const normalized = message.content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "");

  const regex = new RegExp(`\\b(${badWords.join("|")})\\b`, "i");

  const detectedWord = regex.exec(normalized)?.[1];

  if (!detectedWord) return;
  if (!message.member || !message.member.moderatable) return;

  await message.delete().catch(()=>{});

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

    await message.author.send({ embeds:[warnEmbed] });

  } catch {

    const tempMsg = await message.channel.send(
      `${message.author}, kamu mendapat strike ke-${count}.`
    );

    setTimeout(()=>{

      tempMsg.delete().catch(()=>{});

    },5000);

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

    logChannel.send({ embeds:[logEmbed] });

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

      logChannel.send({ embeds:[timeoutEmbed] });

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
      chat: { total:0, month:0, week:0, day:0 },
      voice: { total:0, month:0, week:0, day:0 }
    };

  }

  if (cooldowns.has(userId)) {

    const expiration = cooldowns.get(userId) + config.chat_cooldown * 1000;

    if (now < expiration) return;

  }

  cooldowns.set(userId, now);

  let gained = config.chat_exp;

  /* ----- BOOSTER ROLE ----- */

  if (message.member.roles.cache.has(BOOSTER_ROLE_ID)) {

    gained *= config.booster_multiplier;

  }

  /* ----- DOUBLE EXP ----- */

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
        chat: { total:0, month:0, week:0, day:0 },
        voice:{ total:0, month:0, week:0, day:0 }
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

async function sendWelcome(member, channel){

const embed = new MessageEmbed()
.setColor("#1ABC9C")
.setDescription(
`~Ninu Ninu Ninu Ninu🚑🚨  
༻꫞ Ꮅ𝑎𝑤𝑛 𐒄𝑒 ʄ𝑎𝑚𝑠 ꫞༺  

Haii👋🏻, ${member}

Welcome to Pawn Me Family🧸🎉  
Terimakasih karena telah berminat untuk bergabung dengan server kami✨🩷  

Yok jangan malu untuk nimbrung dan ajak ajak untuk main game yok🎮🌟  
Kamu, kita sambut dengan hangat🧸💕

~Tring Tring Tring⏰🎶  

Kamu melupakan sesuatu tidak❓❓  
Ayoo utamakan untuk Literasi Rules lebih dulu dan jangan lupa Take roles nyaa yapp 💭💫  

Semoga betah ya dan jangan malu malu untuk sapa sapa juga membahas hal random🐼✨  

*-Jika merasa tidak nyaman, pengurus Pawn Me siap menerima kritik dan saranmu💕*`
)
.setFooter({
text:`PAWN ME Auto Welcome`,
iconURL:member.guild.iconURL({dynamic:true})
})
.setTimestamp();

await channel.send({
content:"**WELCOME TO PAWN ME FAMILY**",
embeds:[embed]
});

}

client.on("guildMemberAdd", async(member)=>{

const channel = member.guild.channels.cache.get(AUTO_WELCOME_CHANNEL);

if(!channel) return;

sendWelcome(member, channel);

});

/* ================= LEVEL CARD SYSTEM ================= */

function drawRoundedRect(ctx, x, y, width, height, radius) {

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

}

async function generateDualLevelCard(member, data){

const width = 1000;
const height = 420;

const canvas = createCanvas(width,height);
const ctx = canvas.getContext("2d");

const bg = await loadImage("https://i.imgur.com/8mpdC50.png");
ctx.drawImage(bg,0,0,width,height);

const chatExp = data.chat?.total || 0;
const voiceExp = data.voice?.total || 0;

/* LEVEL DATA */

const chatData = getLevelData(chatExp);
const voiceData = getLevelData(voiceExp);

/* AVATAR */

const avatar = await loadImage(member.user.displayAvatarURL({format:"png",size:256}));

ctx.save();
ctx.beginPath();
ctx.arc(120,210,90,0,Math.PI*2);
ctx.clip();
ctx.drawImage(avatar,30,120,180,180);
ctx.restore();

/* USERNAME */

ctx.fillStyle="#FFFFFF";
ctx.font="40px MontserratBold";
ctx.fillText(member.user.username,260,120);

/* CHAT BAR */

const chatProgress = chatData.currentXP / chatData.requiredXP;

ctx.fillStyle="#2C2F33";
ctx.fillRect(260,170,600,28);

const grad1 = ctx.createLinearGradient(260,0,860,0);
grad1.addColorStop(0,"#00FFC6");
grad1.addColorStop(1,"#00A8FF");

ctx.fillStyle = grad1;
ctx.fillRect(260,170,600 * chatProgress,28);

ctx.font="24px Montserrat";
ctx.fillStyle="#FFFFFF";
ctx.fillText(`CHAT • Rank #${getRank(member.id,"chat")}`,260,160);

ctx.fillText(`${chatData.currentXP} / ${chatData.requiredXP} XP`,870,160);

/* VOICE BAR */

const voiceProgress = voiceData.currentXP / voiceData.requiredXP;

ctx.fillStyle="#2C2F33";
ctx.fillRect(260,260,600,28);

const grad2 = ctx.createLinearGradient(260,0,860,0);
grad2.addColorStop(0,"#C471ED");
grad2.addColorStop(1,"#F64F59");

ctx.fillStyle = grad2;
ctx.fillRect(260,260,600 * voiceProgress,28);

ctx.fillText(`VOICE • Rank #${getRank(member.id,"voice")}`,260,250);

ctx.fillText(`${voiceData.currentXP} / ${voiceData.requiredXP} XP`,870,250);

return canvas.toBuffer();
}

/* ================= LEVEL CARD SYSTEM ================= */

async function generateSingleLevelCard(member, exp, rank, label){

const width = 1000;
const height = 360;

const canvas = createCanvas(width,height);
const ctx = canvas.getContext("2d");

const bg = await loadImage("https://i.imgur.com/8mpdC50.png");
ctx.drawImage(bg,0,0,width,height);
ctx.fillStyle = "rgba(0,0,0,0.35)";
ctx.fillRect(0,0,width,height);

/* LEVEL */

const levelData = getLevelData(exp);
const progress = levelData.currentXP / levelData.requiredXP;

/* AVATAR */

const avatar = await loadImage(member.user.displayAvatarURL({format:"png",size:256}));

ctx.save();
ctx.beginPath();
ctx.arc(120,180,90,0,Math.PI*2);
ctx.clip();
ctx.drawImage(avatar,30,90,180,180);
ctx.restore();
ctx.shadowColor = "#00FFC6";
ctx.shadowBlur = 25;

ctx.strokeStyle = "#00FFC6";
ctx.lineWidth = 6;

ctx.beginPath();
ctx.arc(120,180,96,0,Math.PI*2);
ctx.stroke();

ctx.shadowBlur = 0;

/* USERNAME */

ctx.fillStyle="#FFFFFF";
ctx.font="40px MontserratBold";
ctx.fillText(member.user.username,260,120);
ctx.fillStyle = "#FFD166";

drawRoundedRect(ctx,260,150,120,32,10);
ctx.fill();

ctx.fillStyle = "#000";
ctx.font = "20px MontserratBold";
ctx.fillText(`#${rank}`,285,172);
ctx.fillStyle = "#00FFC6";

drawRoundedRect(ctx,820,90,120,40,12);
ctx.fill();

ctx.fillStyle = "#000";
ctx.font = "24px MontserratBold";
ctx.fillText(`LV ${levelData.level}`,835,118);


/* BAR */

ctx.fillStyle="#2C2F33";
const barX = 260;
const barY = 210;
const barWidth = 600;
const barHeight = 32;

ctx.fillStyle = "#2C2F33";

drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 20);
ctx.fill();

const gradient = ctx.createLinearGradient(barX,0,barX+barWidth,0);

gradient.addColorStop(0,"#00FFC6");
gradient.addColorStop(1,"#00A8FF");

ctx.fillStyle = gradient;

drawRoundedRect(ctx, barX, barY, barWidth * progress, barHeight, 20);
ctx.fill();


/* XP */

ctx.font="22px Montserrat";
ctx.fillText(`${levelData.currentXP} / ${levelData.requiredXP} XP`,870,200);

ctx.fillText(`Level ${levelData.level}`,870,120);

ctx.fillText(label,260,200);

return canvas.toBuffer();
}

/* ================= INTERACTION SYSTEM ================= */

client.on("interactionCreate", async (interaction) => {

const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);

/* ================= BUTTON HANDLER ================= */

if (interaction.isButton()) {

/* ===== EXP SETTINGS ===== */

if (interaction.customId === "config_exp") {

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


/* ===== DOUBLE EXP TOGGLE ===== */

if (interaction.customId === "config_double") {

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

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}


/* ===== BOOSTER MULTIPLIER ===== */

if (interaction.customId === "config_booster") {

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


/* ===== ROLE REWARD MODAL ===== */

if (interaction.customId === "config_role") {

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


/* ===== RANK MODE TOGGLE ===== */

if (interaction.customId === "config_rankmode") {

config.rank_mode_enabled = !config.rank_mode_enabled;

saveConfig();

const embed = new MessageEmbed()
.setColor(config.rank_mode_enabled ? "#2ECC71" : "#E74C3C")
.setTitle("🏆 Rank Mode Updated")
.setDescription(
config.rank_mode_enabled
? "Rank Mode sekarang **AKTIF**."
: "Rank Mode sekarang **NONAKTIF**."
)
.setTimestamp();

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}


/* ===== LEVEL UP TOGGLE ===== */

if (interaction.customId === "config_levelup") {

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

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}

/* ===== MANAGE REWARDS ===== */

if (interaction.customId === "config_manage_rewards") {

  if (!config.role_rewards || Object.keys(config.role_rewards).length === 0) {

    return interaction.reply({
      content: "Belum ada role reward yang diatur.",
      ephemeral: true
    });

  }

  const rewards = Object.entries(config.role_rewards)
    .sort((a,b)=>Number(a[0]) - Number(b[0]))
    .map(([level, roleId]) => `Level ${level} → <@&${roleId}>`)
    .join("\n");

  const embed = new MessageEmbed()
    .setColor("#3498DB")
    .setTitle("📋 Current Role Rewards")
    .setDescription("Role rewards yang sudah diatur:\n\n" + rewards)
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });

}


/* ===== SUGGESTION MODAL ===== */

 if (interaction.customId === "open_saran") {
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


/* ===== MONTHLY SCHEDULER ===== */

if (interaction.customId === "config_scheduler") {

config.monthly_scheduler_enabled = !config.monthly_scheduler_enabled;

saveConfig();

const embed = new MessageEmbed()
.setColor(config.monthly_scheduler_enabled ? "#2ECC71" : "#E74C3C")
.setTitle("📅 Monthly Leaderboard Control")
.setDescription(
config.monthly_scheduler_enabled
? "Manual monthly leaderboard **ON**"
: "Manual monthly leaderboard **OFF**"
)
.setTimestamp();

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}

}

/* ================= MODAL HANDLER ================= */

if (interaction.isModalSubmit()) {


/* ===== EXP SETTINGS MODAL ===== */

if (interaction.customId === "modal_exp_settings") {

const newChatExp = parseInt(
interaction.fields.getTextInputValue("chat_exp")
);

const newVoiceExp = parseInt(
interaction.fields.getTextInputValue("voice_exp")
);

const newCooldown = parseInt(
interaction.fields.getTextInputValue("chat_cooldown")
);

if (isNaN(newChatExp) || isNaN(newVoiceExp) || isNaN(newCooldown)) {

return interaction.reply({
content:"Input harus berupa angka.",
ephemeral:true
});

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

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}

/* ===== SUGGESTION MODAL SUBMIT ===== */

if (interaction.customId === "modal_saran") {

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

    await msg.startThread({
      name: "Berikan Tanggapan",
      autoArchiveDuration: 1440
    });

    await interaction.editReply("Terima kasih! Saran kamu sudah terkirim.");

}


/* ===== BOOSTER MULTIPLIER MODAL ===== */

if (interaction.customId === "modal_booster_settings") {

const newMultiplier = parseFloat(
interaction.fields.getTextInputValue("booster_multiplier")
);

if (isNaN(newMultiplier)) {

return interaction.reply({
content:"Multiplier harus angka.",
ephemeral:true
});

}

config.booster_multiplier = newMultiplier;

saveConfig();

const embed = new MessageEmbed()
.setColor("#9B59B6")
.setTitle("🚀 Booster Multiplier Updated")
.setDescription(`Multiplier sekarang **${config.booster_multiplier}x**`)
.setTimestamp();

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}


/* ===== ROLE REWARD MODAL ===== */

if (interaction.customId === "modal_role_reward") {

const level = interaction.fields.getTextInputValue("reward_level");
const roleId = interaction.fields.getTextInputValue("reward_role_id");

if (isNaN(level)) {

return interaction.reply({
content:"Level harus berupa angka.",
ephemeral:true
});

}

const role = interaction.guild.roles.cache.get(roleId);

if (!role) {

return interaction.reply({
content:"Role ID tidak ditemukan.",
ephemeral:true
});

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
.setDescription(`Level **${level}** akan mendapatkan role <@&${roleId}>`)
.setTimestamp();

return interaction.reply({
embeds:[embed],
ephemeral:true
});

}

}

if (!interaction.isCommand()) return;

/* ================= PING ================= */

if (interaction.commandName === "ping") {

return interaction.reply("pong");

}

/* ================= WELCOME TEST ================= */

if (interaction.commandName === "welcome") {

const user = interaction.options.getUser("user1");

const member = await interaction.guild.members.fetch(user.id);

await sendWelcome(member, interaction.channel);

return interaction.reply({
content:"Test welcome terkirim.",
ephemeral:true
});

}

/* ================= PMLEVEL ================= */

if (interaction.commandName === "pmlevel") {

await interaction.deferReply();

const user = interaction.options.getUser("user") || interaction.user;
const kategori = interaction.options.getString("kategori");

const member = await interaction.guild.members.fetch(user.id);

if (!levels[user.id]) {
levels[user.id] = { chat:{total:0}, voice:{total:0} };
saveLevels();
}

const data = levels[user.id];

/* ===== DUAL CARD ===== */

if(!kategori){

const buffer = await generateDualLevelCard(member,data);

const attachment = new MessageAttachment(buffer,"pm-level.png");

return interaction.editReply({files:[attachment]});

}

/* ===== CHAT CARD ===== */

if(kategori === "chat"){

const exp = data.chat?.total || 0;

const rank = getRank(user.id,"chat");

const buffer = await generateSingleLevelCard(member,exp,rank,"CHAT");

const attachment = new MessageAttachment(buffer,"pm-chat.png");

return interaction.editReply({files:[attachment]});

}

/* ===== VOICE CARD ===== */

if(kategori === "voice"){

const exp = data.voice?.total || 0;

const rank = getRank(user.id,"voice");

const buffer = await generateSingleLevelCard(member,exp,rank,"VOICE");

const attachment = new MessageAttachment(buffer,"pm-voice.png");

return interaction.editReply({files:[attachment]});

}

}

/* ================= CHECK STRIKE ================= */

if (interaction.commandName === "checkstrike") {

const user = interaction.options.getUser("user");

const count = strikes[user.id] || 0;

return interaction.reply({
content:`${user.tag} memiliki ${count} strike.`,
ephemeral:true
});

}


/* ================= CLEAR STRIKE ================= */

if (interaction.commandName === "clearstrikes") {

const user = interaction.options.getUser("user");

strikes[user.id] = 0;

return interaction.reply({
content:`Strike ${user.tag} berhasil direset.`,
ephemeral:true
});

}

/* ================= TIMEOUT ================= */

if (interaction.commandName === "timeout" || interaction.commandName === "mute") {

if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {

return interaction.reply({
content:"Kamu tidak punya izin.",
ephemeral:true
});

}

const user = interaction.options.getUser("user");
const duration = interaction.options.getInteger("duration");

const reason = interaction.options.getString("reason") || "Tidak ada alasan";

const member = interaction.guild.members.cache.get(user.id);

if (!member.moderatable) {

return interaction.reply({
content:"Tidak bisa memoderasi user ini.",
ephemeral:true
});

}

await member.timeout(duration * 60000, reason);

interaction.reply(`${user.tag} di-timeout ${duration} menit.`);

if (logChannel) {

logChannel.send(`🔇 ${user.tag} di-timeout ${duration} menit\nAlasan: ${reason}`);

}

}

/* ================= KICK ================= */

if (interaction.commandName === "kick") {

const user = interaction.options.getUser("user");
const reason = interaction.options.getString("reason") || "Tidak ada alasan";

const member = interaction.guild.members.cache.get(user.id);

if (!member.kickable) {

return interaction.reply({
content:"Tidak bisa kick user ini.",
ephemeral:true
});

}

await member.kick(reason);

interaction.reply(`${user.tag} berhasil di-kick.`);

if (logChannel) {

logChannel.send(`👢 ${user.tag} di-kick\nAlasan: ${reason}`);

}

}

/* ================= BAN ================= */

if (interaction.commandName === "ban") {

const user = interaction.options.getUser("user");
const reason = interaction.options.getString("reason") || "Tidak ada alasan";

const member = interaction.guild.members.cache.get(user.id);

if (!member.bannable) {

return interaction.reply({
content:"Tidak bisa ban user ini.",
ephemeral:true
});

}

await member.ban({reason});

interaction.reply(`${user.tag} berhasil di-ban.`);

if (logChannel) {

logChannel.send(`🔨 ${user.tag} di-ban\nAlasan: ${reason}`);

}

}

/* ================= PMLEADERBOARD ================= */

if (interaction.commandName === "pmleaderboard") {

  await interaction.deferReply();

  const kategori = interaction.options.getString("kategori");
  const waktu = interaction.options.getString("waktu") || "total";
  let jumlah = interaction.options.getInteger("jumlah");

  if (!kategori) {
    jumlah = jumlah || 5;      // default jika dua kategori
  } else {
    jumlah = jumlah || 10;     // default jika satu kategori
  }

  const data = Object.entries(levels);

  const getSorted = (type) => {
    return data
      .sort((a, b) => (b[1][type]?.[waktu] || 0) - (a[1][type]?.[waktu] || 0))
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

  /* ===== MODE DUAL (CHAT + VOICE) ===== */

  if (!kategori) {

    let chatTop = getSorted("chat");
    let voiceTop = getSorted("voice");

    await interaction.guild.members.fetch();

    const guildMembers = interaction.guild.members.cache
      .filter(m => !m.user.bot)
      .map(m => m.id);

    function getRandomMembers(amount, exclude = []) {
      const pool = guildMembers.filter(id => !exclude.includes(id));
      const shuffled = pool.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, amount);
    }

    if (chatTop.length < jumlah) {

      const needed = jumlah - chatTop.length;

      const existingIds = chatTop.map(u => u[0]);

      const randomIds = getRandomMembers(needed, existingIds);

      const filler = randomIds.map(id => [
        id,
        { chat: { [waktu]: 0 } }
      ]);

      chatTop = [...chatTop, ...filler];

    }

    if (voiceTop.length < jumlah) {

      const needed = jumlah - voiceTop.length;

      const existingIds = voiceTop.map(u => u[0]);

      const randomIds = getRandomMembers(needed, existingIds);

      const filler = randomIds.map(id => [
        id,
        { voice: { [waktu]: 0 } }
      ]);

      voiceTop = [...voiceTop, ...filler];

    }

    const chatText = chatTop
      .map((u, i) => `${i + 1}. <@${u[0]}>  >  ${u[1].chat?.[waktu] || 0} XP`)
      .join("\n");

    const voiceText = voiceTop
      .map((u, i) => `${i + 1}. <@${u[0]}>  >  ${u[1].voice?.[waktu] || 0} XP`)
      .join("\n");

    embed.addField("💬 Top Chat", chatText);
    embed.addField("🎧 Top Voice", voiceText);

  }

  /* ===== MODE SINGLE CATEGORY ===== */

  else {

    let top = getSorted(kategori);

    await interaction.guild.members.fetch();

    const guildMembers = interaction.guild.members.cache
      .filter(m => !m.user.bot)
      .map(m => m.id);

    function getRandomMembers(amount, exclude = []) {
      const pool = guildMembers.filter(id => !exclude.includes(id));
      const shuffled = pool.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, amount);
    }

    if (top.length < jumlah) {

      const needed = jumlah - top.length;

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

    const text = top
      .map((u, i) => `${i + 1}. <@${u[0]}> — ${u[1][kategori]?.[waktu] || 0} XP`)
      .join("\n");

    embed.addField(
      kategori === "chat" ? "💬 Top Chat" : "🎧 Top Voice",
      text
    );

  }

  return interaction.editReply({ embeds: [embed] });

}


/* ================= SARANPANEL ================= */

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

/* ================= PMCONFIG PANEL ================= */

if (interaction.commandName === "pmconfig") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({
      content: "Kamu tidak punya izin.",
      ephemeral: true
    });
  }

  const embed = new MessageEmbed()
    .setColor("#1ABC9C")
    .setTitle("🎛 Pawn Me Leveling Control Panel")
    .setDescription("Gunakan tombol di bawah untuk mengatur sistem leveling Pawn Me.")
    .addField("Chat EXP", `${config.chat_exp}`, true)
    .addField("Voice EXP / Minute", `${config.voice_exp_per_minute}`, true)
    .addField("Chat Cooldown", `${config.chat_cooldown} sec`, true)
    .addField("Booster Multiplier", `${config.booster_multiplier}x`, true)
    .addField("Double EXP", config.double_exp ? "Aktif" : "Nonaktif", true)
    .addField("Role Reward", config.role_rewards_enabled ? "Aktif" : "Nonaktif", true)
    .addField("Rank Mode", config.rank_mode_enabled ? "Aktif" : "Nonaktif", true)
    .setFooter({
      text: "Pawn Me Premium Level System"
    })
    .setTimestamp();


/* ===== ROW 1 ===== */

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
    .setLabel("Booster Multiplier")
    .setStyle("SECONDARY"),

  new MessageButton()
    .setCustomId("config_role")
    .setLabel("Role Reward")
    .setStyle("DANGER")

);


/* ===== ROW 2 ===== */

const row2 = new MessageActionRow().addComponents(

  new MessageButton()
    .setCustomId("config_scheduler")
    .setLabel("Monthly Scheduler")
    .setStyle("SECONDARY"),

  new MessageButton()
    .setCustomId("config_rankmode")
    .setLabel("Rank Mode")
    .setStyle("SECONDARY"),

  new MessageButton()
    .setCustomId("config_levelup")
    .setLabel("Level Up Toggle")
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

/* ================= PMXPADD ================= */

if (interaction.commandName === "pmxpadd") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({
      content: "Kamu tidak punya izin.",
      ephemeral: true
    });
  }

  const user = interaction.options.getUser("member");
  const kategori = interaction.options.getString("kategori");
  const xpToAdd = interaction.options.getInteger("xp");

  if (xpToAdd <= 0) {
    return interaction.reply({
      content: "XP harus lebih dari 0.",
      ephemeral: true
    });
  }

  if (!levels[user.id]) {
    levels[user.id] = {
      chat: { total: 0, month: 0, week: 0, day: 0 },
      voice: { total: 0, month: 0, week: 0, day: 0 }
    };
  }

  const oldXp = levels[user.id][kategori].total;

  levels[user.id][kategori].total += xpToAdd;
  levels[user.id][kategori].month += xpToAdd;
  levels[user.id][kategori].week += xpToAdd;
  levels[user.id][kategori].day += xpToAdd;

  const newXp = levels[user.id][kategori].total;

  saveLevels();

  const embed = new MessageEmbed()
    .setColor("#2ECC71")
    .setTitle("✅ XP Added")
    .setDescription(`${user} mendapat **+${xpToAdd} XP** (${kategori})`)
    .addField("XP Sebelumnya", `${oldXp}`, true)
    .addField("XP Sekarang", `${newXp}`, true)
    .setTimestamp();

  interaction.reply({
    embeds: [embed],
    ephemeral: true
  });

  if (logChannel) {
    logChannel.send({
      embeds: [new MessageEmbed()
        .setColor("#2ECC71")
        .setTitle("📊 XP Added")
        .addField("User", `${user}`, true)
        .addField("Kategori", kategori, true)
        .addField("XP", `+${xpToAdd}`, true)
        .addField("Admin", `${interaction.user}`, true)
        .setTimestamp()]
    });
  }

}

/* ================= PMXPRESET ================= */

if (interaction.commandName === "pmxpreset") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({
      content: "Kamu tidak punya izin.",
      ephemeral: true
    });
  }

  const mode = interaction.options.getString("mode");
  const targetUser = interaction.options.getUser("user");

  let resetCount = 0;

  if (mode === "server") {
    // Reset semua member, semua kategori
    for (const userId in levels) {
      levels[userId].chat.total = 0;
      levels[userId].chat.month = 0;
      levels[userId].chat.week = 0;
      levels[userId].chat.day = 0;

      levels[userId].voice.total = 0;
      levels[userId].voice.month = 0;
      levels[userId].voice.week = 0;
      levels[userId].voice.day = 0;

      resetCount++;
    }

    saveLevels();

    const embed = new MessageEmbed()
      .setColor("#E74C3C")
      .setTitle("🔴 Server XP Reset")
      .setDescription(`Semua XP member di server telah direset!`)
      .addField("Total Member", `${resetCount}`, true)
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } else if (targetUser) {
    // Reset satu member, kategori tertentu
    if (!levels[targetUser.id]) {
      return interaction.reply({
        content: "Member ini tidak memiliki XP.",
        ephemeral: true
      });
    }

    const oldXp = levels[targetUser.id][mode].total;

    levels[targetUser.id][mode].total = 0;
    levels[targetUser.id][mode].month = 0;
    levels[targetUser.id][mode].week = 0;
    levels[targetUser.id][mode].day = 0;

    saveLevels();

    const embed = new MessageEmbed()
      .setColor("#E74C3C")
      .setTitle("🔴 Member XP Reset")
      .setDescription(`${targetUser} XP ${mode} telah direset!`)
      .addField("Kategori", mode.toUpperCase(), true)
      .addField("XP Sebelumnya", `${oldXp}`, true)
      .setTimestamp();

    interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send({
        embeds: [new MessageEmbed()
          .setColor("#E74C3C")
          .setTitle("🔴 Member XP Reset")
          .addField("User", `${targetUser}`, true)
          .addField("Kategori", mode, true)
          .addField("XP Lama", `${oldXp}`, true)
          .addField("Admin", `${interaction.user}`, true)
          .setTimestamp()]
      });
    }

  } else {
    // Reset semua member, kategori tertentu
    for (const userId in levels) {
      levels[userId][mode].total = 0;
      levels[userId][mode].month = 0;
      levels[userId][mode].week = 0;
      levels[userId][mode].day = 0;
      resetCount++;
    }

    saveLevels();

    const embed = new MessageEmbed()
      .setColor("#E74C3C")
      .setTitle("🔴 Category XP Reset")
      .setDescription(`Semua XP **${mode.toUpperCase()}** di semua member telah direset!`)
      .addField("Total Member", `${resetCount}`, true)
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  }

}

/* ================= PMXPREMOVE ================= */

if (interaction.commandName === "pmxpremove") {

  if (!interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
    return interaction.reply({
      content: "Kamu tidak punya izin.",
      ephemeral: true
    });
  }

  const user = interaction.options.getUser("user");
  const kategori = interaction.options.getString("kategori");
  const xpChoice = interaction.options.getString("xp");
  const customXp = interaction.options.getInteger("jumlah");

  if (!levels[user.id]) {
    return interaction.reply({
      content: "Member ini tidak memiliki XP.",
      ephemeral: true
    });
  }

  let xpToRemove = 0;
  const currentXp = levels[user.id][kategori].total;

  if (xpChoice === "custom") {
    if (!customXp || customXp <= 0) {
      return interaction.reply({
        content: "Masukkan jumlah XP yang valid.",
        ephemeral: true
      });
    }
    xpToRemove = customXp;
  } else if (xpChoice === "all") {
    xpToRemove = currentXp;
  } else if (xpChoice === "half") {
    xpToRemove = Math.floor(currentXp / 2);
  }

  if (xpToRemove > currentXp) {
    xpToRemove = currentXp;
  }

  const newXp = Math.max(0, levels[user.id][kategori].total - xpToRemove);

  levels[user.id][kategori].total = newXp;
  levels[user.id][kategori].month = Math.max(0, levels[user.id][kategori].month - xpToRemove);
  levels[user.id][kategori].week = Math.max(0, levels[user.id][kategori].week - xpToRemove);
  levels[user.id][kategori].day = Math.max(0, levels[user.id][kategori].day - xpToRemove);

  saveLevels();

  const embed = new MessageEmbed()
    .setColor("#E74C3C")
    .setTitle("✅ XP Removed")
    .setDescription(`${user} kehilangan **-${xpToRemove} XP** (${kategori})`)
    .addField("XP Sebelumnya", `${currentXp}`, true)
    .addField("XP Sesudahnya", `${newXp}`, true)
    .setTimestamp();

  interaction.reply({
    embeds: [embed],
    ephemeral: true
  });

  if (logChannel) {
    logChannel.send({
      embeds: [new MessageEmbed()
        .setColor("#E74C3C")
        .setTitle("📊 XP Removed")
        .addField("User", `${user}`, true)
        .addField("Kategori", kategori, true)
        .addField("XP", `-${xpToRemove}`, true)
        .addField("Admin", `${interaction.user}`, true)
        .setTimestamp()]
    });
  }

}


/* ================= MONTHLY LEADERBOARD SCHEDULER ================= */

setInterval(async () => {

  if (!config.monthly_scheduler_enabled) return;

  const now = new Date();

  if (now.getDate() !== 1 || now.getHours() !== 0) return;

  const channel = client.channels.cache.get(MONTHLY_LEADERBOARD_CHANNEL);

  if (!channel) return;

  const monthName = now.toLocaleString("id-ID", { month: "long" });
  const year = now.getFullYear();

  const chatTop = Object.entries(levels)
    .map(([id, data]) => ({ id, value: data.chat?.month || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const voiceTop = Object.entries(levels)
    .map(([id, data]) => ({ id, value: data.voice?.month || 0 }))
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
      "🎧 VOICE TOP 10",
      voiceTop.length
        ? voiceTop.map((u, i) => `**${i+1}.** <@${u.id}> — ${u.value} XP`).join("\n")
        : "Belum ada data"
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  /* ===== RESET MONTHLY DATA ===== */

  for (const id in levels) {
    if (levels[id].chat) levels[id].chat.month = 0;
    if (levels[id].voice) levels[id].voice.month = 0;
  }

  saveLevels();

}, 60 * 60 * 1000);

});

/* ================= BOT LOGIN ================= */

client.login(TOKEN);