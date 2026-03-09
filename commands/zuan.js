const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");

const path = "./data/autoresponse.json";

function load() {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path));
}

function save(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("zuan")
    .setDescription("Auto response system")
    .addSubcommand(sub =>
      sub.setName("enable")
        .setDescription("Aktifkan auto response"))
    .addSubcommand(sub =>
      sub.setName("disable")
        .setDescription("Matikan auto response"))
    .addSubcommand(sub =>
      sub.setName("add")
        .setDescription("Tambah trigger baru")
        .addStringOption(opt =>
          opt.setName("kata")
            .setDescription("kata yang akan dideteksi")
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName("respon")
            .setDescription("balasan bot")
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName("remove")
        .setDescription("Hapus trigger")
        .addStringOption(opt =>
          opt.setName("kata")
            .setDescription("kata trigger")
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("Lihat semua trigger")),

  async execute(interaction) {

    const data = load();
    const guildId = interaction.guild.id;

    if (!data[guildId]) {
      data[guildId] = {
        enabled: false,
        triggers: {}
      };
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "enable") {
      data[guildId].enabled = true;
      save(data);
      return interaction.reply("Auto response diaktifkan.");
    }

    if (sub === "disable") {
      data[guildId].enabled = false;
      save(data);
      return interaction.reply("Auto response dimatikan.");
    }

    if (sub === "add") {
      const kata = interaction.options.getString("kata").toLowerCase();
      const respon = interaction.options.getString("respon");

      data[guildId].triggers[kata] = respon;
      save(data);

      return interaction.reply(`Trigger ditambahkan: ${kata}`);
    }

    if (sub === "remove") {
      const kata = interaction.options.getString("kata").toLowerCase();

      delete data[guildId].triggers[kata];
      save(data);

      return interaction.reply(`Trigger dihapus: ${kata}`);
    }

    if (sub === "list") {

      const triggers = Object.keys(data[guildId].triggers);

      if (!triggers.length) {
        return interaction.reply("Belum ada trigger.");
      }

      const list = triggers.map(t => `• ${t}`).join("\n");

      return interaction.reply(`Daftar trigger:\n${list}`);
    }
  }
};
