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
} 

  ];

  await client.application.commands.set(commands, GUILD_ID);

  console.log("Slash commands registered.");

});

/* ================= AUTO MODERATION ================= */

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

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

async function generateDualLevelCard(member,data){

const canvas = createCanvas(1000,400);
const ctx = canvas.getContext("2d");

const bg = await loadImage("https://i.imgur.com/8mpdC50.png");
ctx.drawImage(bg,0,0,1000,400);

/* ===== AVATAR ===== */

const avatar = await loadImage(
member.user.displayAvatarURL({extension:"png",size:256})
);

ctx.save();
ctx.beginPath();
ctx.arc(120,200,80,0,Math.PI*2,true);
ctx.closePath();
ctx.clip();
ctx.drawImage(avatar,40,120,160,160);
ctx.restore();

/* ===== USERNAME ===== */

ctx.fillStyle="#ffffff";
ctx.font="bold 40px Sans";
ctx.fillText(member.user.username,240,140);

/* ===== CHAT EXP ===== */

const chatExp=data.chat?.total||0;

ctx.font="28px Sans";
ctx.fillText(`Chat EXP: ${chatExp}`,240,200);

/* ===== VOICE EXP ===== */

const voiceExp=data.voice?.total||0;

ctx.fillText(`Voice EXP: ${voiceExp}`,240,250);

return canvas.toBuffer();

}

/* ================= LEVEL CARD SYSTEM ================= */

async function generateLevelCard(member, totalExp, rank){

const width = 1000;
const height = 350;

const canvas = createCanvas(width,height);
const ctx = canvas.getContext("2d");

/* ===== BACKGROUND LOCAL FILE ===== */

const background = await loadImage("https://i.imgur.com/8mpdC50.png");

ctx.drawImage(background,0,0,width,height);

/* ===== LEVEL CALCULATION ===== */

const level = Math.floor(0.1 * Math.sqrt(totalExp));

const nextLevelExp = Math.pow((level + 1) / 0.1, 2);
const currentLevelExp = Math.pow(level / 0.1, 2);

const currentXP = Math.floor(totalExp - currentLevelExp);
const requiredXP = Math.floor(nextLevelExp - currentLevelExp);

const progress = currentXP / requiredXP;

/* ===== AVATAR ===== */

const avatar = await loadImage(
member.user.displayAvatarURL({format:"png",size:256})
);

ctx.save();

ctx.beginPath();
ctx.arc(170,175,85,0,Math.PI*2);
ctx.closePath();
ctx.clip();

ctx.drawImage(avatar,85,90,170,170);

ctx.restore();

ctx.strokeStyle="#1ABC9C";
ctx.lineWidth=6;

ctx.beginPath();
ctx.arc(170,175,90,0,Math.PI*2);
ctx.stroke();

/* ===== TEXT ===== */

ctx.fillStyle="#FFFFFF";
ctx.font="32px Poppins";

ctx.fillText(member.user.username,320,120);

ctx.font="24px Poppins";

ctx.fillText(`RANK #${rank}`,320,80);
ctx.fillText(`LEVEL ${level}`,780,80);

/* ===== BAR ===== */

const barWidth=520;
const barHeight=28;

const barX=320;
const barY=190;

ctx.fillStyle="#2C2F33";

ctx.fillRect(barX,barY,barWidth,barHeight);

const gradient=ctx.createLinearGradient(barX,0,barX+barWidth,0);

gradient.addColorStop(0,"#1ABC9C");
gradient.addColorStop(1,"#00E5FF");

ctx.fillStyle=gradient;

ctx.fillRect(barX,barY,barWidth*progress,barHeight);

/* ===== XP TEXT ===== */

ctx.font="20px Poppins";

ctx.textAlign="right";

ctx.fillText(
`${currentXP} / ${requiredXP} XP`,
barX + barWidth,
160
);

ctx.textAlign="left";

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

if(interaction.customId === "kirim_saran"){

const modal = new ModalBuilder()
.setCustomId("modal_saran")
.setTitle("Kirim Kritik & Saran");

const saranInput = new TextInputBuilder()
.setCustomId("isi_saran")
.setLabel("Tulis saran kamu")
.setStyle(TextInputStyle.Paragraph)
.setRequired(true);

const row = new ActionRowBuilder().addComponents(saranInput);

modal.addComponents(row);

await interaction.showModal(modal);

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

if(interaction.customId === "modal_saran"){

const saran = interaction.fields.getTextInputValue("isi_saran");

const embed = new EmbedBuilder()
.setColor("#5865F2")
.setTitle("📬 Kritik & Saran")
.addFields(
{
name: "👤 Pengirim:",
value: interaction.user.username,
inline: false
},
{
name: "✉️ Isi Saran:",
value: saran,
inline: false
}
)
.setFooter({text: "Terimakasih sudah memberikan saran!"})
.setTimestamp();

await interaction.channel.send({embeds:[embed]});

await interaction.reply({
content:"Saran kamu berhasil dikirim.",
ephemeral:true
});

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

if (!levels[user.id]) {

levels[user.id] = {
chat:{total:0},
voice:{total:0}
};

saveLevels();

}

const data = levels[user.id];

const member = await interaction.guild.members.fetch(user.id);

/* ===== TOTAL EXP ===== */

const totalExp = (data.chat?.total || 0) + (data.voice?.total || 0);

/* ===== GLOBAL RANK ===== */

const sorted = Object.entries(levels)
.map(([id,d])=>({
id,
total:(d.chat?.total||0)+(d.voice?.total||0)
}))
.sort((a,b)=>b.total-a.total);

const rank = sorted.findIndex(u=>u.id===user.id)+1;

/* ===== GENERATE CARD ===== */

const buffer = await generateLevelCard(member,totalExp,rank);

const attachment = new MessageAttachment(buffer,"pm-level.png");

return interaction.editReply({
files:[attachment]
});

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