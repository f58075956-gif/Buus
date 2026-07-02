# Prometheus Discord Bot (Termux)

Bot de Discord con dos comandos:

- `/obfuscar` — ofusca código Lua usando el motor **Prometheus** (incluido en `engine/`).
- `/desofuscar` — reformatea y renombra variables de código Lua para hacerlo más legible (usa `lua-format`). **No** es una desofuscación mágica: no revierte cifrado de strings ni "control-flow flattening" reales, eso es intencionalmente irreversible sin ejecutar el código.

---

## 1. Preparar Termux

Abrí Termux y corré:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git lua51
```

Verificá que quedó instalado:

```bash
node -v
lua5.1 -v
```

## 2. Copiar el proyecto a Termux

Si trabajás con el zip que armamos, subilo a tu teléfono (por ejemplo a la carpeta Download) y luego:

```bash
termux-setup-storage        # solo la primera vez, para acceder a Download
cd ~
unzip /sdcard/Download/prometheus-discord-bot.zip
cd prometheus-discord-bot
```

## 3. Instalar dependencias de Node

```bash
npm install
```

## 4. Crear tu aplicación de Discord

1. Andá a https://discord.com/developers/applications y creá una **New Application**.
2. En la pestaña **Bot**, creá el bot y copiá el **Token** (botón "Reset Token" si hace falta).
3. En **OAuth2 → General**, copiá el **Application ID** (es el `CLIENT_ID`).
4. En **Bot**, activá los intents que necesites (para este bot no hace falta ningún privileged intent).
5. Generá una URL de invitación en **OAuth2 → URL Generator**, marcá el scope `bot` y `applications.commands`, con permisos mínimos (Send Messages, Attach Files, Use Slash Commands), e invitá el bot a tu servidor.

## 5. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Completá:

```
DISCORD_TOKEN=el_token_de_tu_bot
CLIENT_ID=el_application_id
LUA_BIN=lua5.1
```

Guardá con `Ctrl+O`, Enter, y salí con `Ctrl+X`.

## 6. Correr el bot

```bash
npm start
```

Si ves `Comandos slash registrados.` y `Conectado como TuBot#1234`, ya está andando. Probá en Discord con `/obfuscar` o `/desofuscar`.

### Mantenerlo corriendo en segundo plano

Termux mata procesos si cerrás la app. Dos opciones simples:

- **tmux** (recomendado):
  ```bash
  pkg install tmux
  tmux new -s bot
  npm start
  # Ctrl+B luego D para "desprenderte" sin cortar el proceso
  # Para volver: tmux attach -t bot
  ```
- **Wake lock** para que Android no mate Termux en segundo plano: abrí el menú lateral de Termux (deslizar desde el borde) → "Acquire wakelock".

---

## Estructura del proyecto

```
prometheus-discord-bot/
├── index.js              # Lógica del bot y comandos slash
├── package.json
├── .env.example
├── engine/                # Motor Prometheus (Lua), tal cual el repo original
│   ├── cli.lua
│   └── src/
└── README.md
```

## Límites y notas

- El comando `/obfuscar` acepta un archivo `.lua` (máx. 200 KB) o código pegado directamente.
- Presets disponibles: `Minify`, `Weak`, `Medium`, `Strong` (por defecto `Medium`).
- El proceso Lua tiene timeout de 20 segundos; código muy grande o presets `Strong` en archivos grandes pueden tardar.
- Prometheus se distribuye bajo su propia licencia (ver `engine/LICENSE`): si publicás este bot como producto/SaaS, tenés que dar crédito visible a Prometheus (`https://github.com/prometheus-lua/Prometheus`).
