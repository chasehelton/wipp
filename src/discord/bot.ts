import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  REST,
  Routes,
  type Message,
  type Interaction,
  type SendableChannels,
} from "discord.js";
import { loadConfig, type Config } from "../config.js";
import { getAllRepos } from "../git/repos.js";
import { messageQueue } from "../queue.js";
import { createLogger } from "../utils/logger.js";
import { chunkMessage, formatError, formatWorkerStatus } from "./formatter.js";
import { StatusMessage } from "./status.js";
import { workerManager } from "../copilot/workers.js";
import { commands } from "./commands.js";

const log = createLogger("discord");

let _client: Client | null = null;
let _config: Config;
let _proactiveChannel: SendableChannels | null = null;
let _activeStatus: StatusMessage | null = null;

function isAuthorized(userId: string): boolean {
  return userId === _config.DISCORD_AUTHORIZED_USER_ID;
}

async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!isAuthorized(message.author.id)) return;

  const content = message.content.trim();
  if (!content) return;

  const channel = message.channel;
  if (!channel.isSendable()) return;

  // Store the channel for proactive messages
  _proactiveChannel = channel;

  // Show typing indicator
  const typingInterval = setInterval(() => {
    void channel.sendTyping();
  }, 4000);
  void channel.sendTyping();

  try {
    const response = await messageQueue.enqueue(content, "discord");
    clearInterval(typingInterval);

    if (_activeStatus) {
      await _activeStatus.finalize("success");
      _activeStatus = null;
    }

    const chunks = chunkMessage(response);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    clearInterval(typingInterval);

    if (_activeStatus) {
      await _activeStatus.finalize("failure");
      _activeStatus = null;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Error processing message", { error: errMsg });
    await message.reply(formatError(errMsg));
  }
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  if (!isAuthorized(interaction.user.id)) {
    await interaction.reply({ content: "Unauthorized.", ephemeral: true });
    return;
  }

  switch (interaction.commandName) {
    case "status": {
      const uptime = process.uptime();
      const mem = process.memoryUsage();
      await interaction.reply(
        `🟢 **Wipp is running**\n` +
          `Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s\n` +
          `Memory: ${Math.round(mem.rss / 1024 / 1024)}MB RSS\n` +
          `Queue: ${messageQueue.length} pending, ${messageQueue.isProcessing ? "processing" : "idle"}`,
      );
      break;
    }
    case "cancel": {
      const cancelled = messageQueue.cancelCurrent();
      await interaction.reply(
        cancelled ? "✅ Cancelled current operation." : "Nothing to cancel.",
      );
      break;
    }
    case "model": {
      const config = loadConfig();
      await interaction.reply(
        `**Models**\n` +
          `Orchestrator: \`${config.COPILOT_ORCHESTRATOR_MODEL}\`\n` +
          `Worker: \`${config.COPILOT_WORKER_MODEL}\``,
      );
      break;
    }
    case "workers": {
      const workers = workerManager.getActiveWorkers();
      await interaction.reply(formatWorkerStatus(workers));
      break;
    }
    case "repos": {
      const repos = getAllRepos();
      if (repos.length === 0) {
        await interaction.reply("No repos configured.");
      } else {
        const list = repos
          .map((r) => `• **${r.name}** — \`${r.local_path}\` (branch: \`${r.default_branch}\`)`)
          .join("\n");
        await interaction.reply(`**Repos (${repos.length})**\n${list}`);
      }
      break;
    }
    default:
      await interaction.reply({
        content: `Command \`/${interaction.commandName}\` not yet implemented.`,
        ephemeral: true,
      });
  }
}

async function registerSlashCommands(
  token: string,
  clientId: string,
): Promise<void> {
  const rest = new REST().setToken(token);
  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((c) => c.toJSON()),
    });
    log.info("Registered slash commands");
  } catch (err) {
    log.warn("Failed to register slash commands", { error: String(err) });
  }
}

export async function startDiscordBot(): Promise<Client> {
  _config = loadConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.on(Events.MessageCreate, (msg) => void handleMessage(msg));
  client.on(Events.InteractionCreate, (interaction) =>
    void handleInteraction(interaction),
  );

  client.once(Events.ClientReady, (c) => {
    log.info("Discord bot connected", { user: c.user.tag });
    void registerSlashCommands(_config.DISCORD_BOT_TOKEN, c.user.id);
  });

  await client.login(_config.DISCORD_BOT_TOKEN);
  _client = client;

  // Set up worker lifecycle event listeners for live status messages
  workerManager.events.on("worker:created", ({ branch }: { name: string; branch: string; worktreePath: string }) => {
    void (async () => {
      if (!_proactiveChannel || _activeStatus) return;
      _activeStatus = new StatusMessage(`Working on ${branch}`);
      await _activeStatus.send(_proactiveChannel);
      _activeStatus.addStep("Worktree created", "done");
      _activeStatus.addStep("Worker spawned", "done");
      _activeStatus.addStep("Coding...", "active");
    })();
  });

  workerManager.events.on("worker:completed", ({ name: _name }: { name: string }) => {
    if (_activeStatus) {
      _activeStatus.updateStep("Coding...", "done");
      _activeStatus.addStep("Worker finished", "done");
    }
  });

  workerManager.events.on("worker:failed", ({ name: _name }: { name: string; error: string }) => {
    if (_activeStatus) {
      _activeStatus.updateStep("Coding...", "failed");
    }
  });

  workerManager.events.on("worker:killed", ({ name: _name }: { name: string }) => {
    if (_activeStatus) {
      _activeStatus.updateStep("Coding...", "failed");
    }
  });

  return client;
}

export async function sendProactiveMessage(text: string): Promise<void> {
  if (!_proactiveChannel) {
    log.warn("No channel available for proactive message");
    return;
  }

  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await _proactiveChannel.send(chunk);
  }
}

export async function stopDiscordBot(): Promise<void> {
  if (_client) {
    log.info("Disconnecting Discord bot");
    await _client.destroy();
    _client = null;
  }
}
