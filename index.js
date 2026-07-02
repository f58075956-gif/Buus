// index.js
// Bot de Discord: obfuscador (Prometheus, Lua) y "desofuscador" (lua-format)
// Pensado para correr en Termux (Android) con Node.js.

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
} = require("discord.js");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const luamin = require("lua-format");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LUA_BIN = process.env.LUA_BIN || "lua5.1"; // en Termux: pkg install lua51
const ENGINE_CLI = path.join(__dirname, "engine", "cli.lua");
const MAX_INPUT_BYTES = 200 * 1024; // 200 KB, límite razonable para un bot

if (!TOKEN || !CLIENT_ID) {
  console.error(
    "Faltan variables de entorno. Copiá .env.example a .env y completá DISCORD_TOKEN y CLIENT_ID."
  );
  process.exit(1);
}

const PRESETS = ["Minify", "Weak", "Medium", "Strong"];

// ---------- Definición de comandos slash ----------
const commands = [
  new SlashCommandBuilder()
    .setName("obfuscar")
    .setDescription("Ofusca un archivo o bloque de código Lua con Prometheus")
    .addAttachmentOption((opt) =>
      opt.setName("archivo").setDescription("Archivo .lua a ofuscar")
    )
    .addStringOption((opt) =>
      opt
        .setName("codigo")
        .setDescription("Pegá el código Lua directamente (si no subís archivo)")
    )
    .addStringOption((opt) =>
      opt
        .setName("preset")
        .setDescription("Nivel de ofuscación")
        .addChoices(...PRESETS.map((p) => ({ name: p, value: p })))
    ),
  new SlashCommandBuilder()
    .setName("desofuscar")
    .setDescription(
      "Reformatea/embellece código Lua ofuscado (no revierte cifrado real)"
    )
    .addAttachmentOption((opt) =>
      opt.setName("archivo").setDescription("Archivo .lua a desofuscar")
    )
    .addStringOption((opt) =>
      opt
        .setName("codigo")
        .setDescription("Pegá el código Lua directamente (si no subís archivo)")
    ),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Comandos slash registrados.");
}

// ---------- Utilidades ----------

async function getInputCode(interaction) {
  const attachment = interaction.options.getAttachment("archivo");
  const codeOption = interaction.options.getString("codigo");

  if (attachment) {
    if (!attachment.name.toLowerCase().endsWith(".lua")) {
      throw new Error("El archivo adjunto debe tener extensión .lua");
    }
    if (attachment.size > MAX_INPUT_BYTES) {
      throw new Error("El archivo es demasiado grande (máximo 200 KB).");
    }
    const res = await fetch(attachment.url);
    const text = await res.text();
    return text;
  }

  if (codeOption) {
    // Permite que el usuario pegue el código con o sin ```lua ... ```
    return codeOption.replace(/^```(?:lua)?\n?/i, "").replace(/```$/i, "");
  }

  throw new Error(
    "Tenés que adjuntar un archivo .lua o pegar código con la opción `codigo`."
  );
}

function runLuaCli(args) {
  return new Promise((resolve, reject) => {
    execFile(
      LUA_BIN,
      [ENGINE_CLI, ...args],
      { timeout: 20_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

async function obfuscate(code, preset) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prom-"));
  const inFile = path.join(tmpDir, "input.lua");
  const outFile = path.join(tmpDir, "output.lua");
  fs.writeFileSync(inFile, code, "utf8");

  try {
    await runLuaCli([
      "--preset",
      preset,
      inFile,
      "--out",
      outFile,
      "--nocolors",
    ]);
    if (!fs.existsSync(outFile)) {
      throw new Error("Prometheus no generó salida (revisá que el código Lua sea válido).");
    }
    return fs.readFileSync(outFile, "utf8");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function deobfuscateBestEffort(code) {
  // lua-format / luamin: embellece, renombra variables e intenta resolver
  // operaciones matemáticas constantes. NO desencripta strings ni revierte
  // flattening de flujo de control diseñado para ser irreversible.
  return luamin.Beautify(code, {
    RenameVariables: true,
    RenameGlobals: false,
    SolveMath: true,
    Indentation: "  ",
  });
}

function codeAsAttachmentOrMessage(content, filename) {
  const block = "```lua\n" + content + "\n```";
  if (block.length <= 1900) {
    return { content: block };
  }
  const buffer = Buffer.from(content, "utf8");
  return {
    content: "El resultado es muy largo, te lo mando como archivo:",
    files: [new AttachmentBuilder(buffer, { name: filename })],
  };
}

// ---------- Cliente de Discord ----------

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Conectado como ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "obfuscar") {
      await interaction.deferReply();
      const code = await getInputCode(interaction);
      const preset = interaction.options.getString("preset") || "Medium";
      const result = await obfuscate(code, preset);
      const payload = codeAsAttachmentOrMessage(result, "output.obfuscated.lua");
      const embed = new EmbedBuilder()
        .setTitle("Código ofuscado")
        .setDescription(`Preset usado: **${preset}**`)
        .setColor(0xef4444);
      await interaction.editReply({ embeds: [embed], ...payload });
      return;
    }

    if (interaction.commandName === "desofuscar") {
      await interaction.deferReply();
      const code = await getInputCode(interaction);
      const result = deobfuscateBestEffort(code);
      const payload = codeAsAttachmentOrMessage(result, "output.deobfuscated.lua");
      const embed = new EmbedBuilder()
        .setTitle("Código reformateado")
        .setDescription(
          "⚠️ Esto embellece y renombra variables, pero **no revierte** cifrado de strings ni control-flow flattening reales."
        )
        .setColor(0x22c55e);
      await interaction.editReply({ embeds: [embed], ...payload });
      return;
    }
  } catch (err) {
    console.error(err);
    const msg = `❌ Error: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();
