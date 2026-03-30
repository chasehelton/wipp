import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show wipp daemon status"),
  new SlashCommandBuilder()
    .setName("workers")
    .setDescription("List active worker sessions"),
  new SlashCommandBuilder()
    .setName("repos")
    .setDescription("List registered repositories"),
  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Show stored memories"),
  new SlashCommandBuilder()
    .setName("cancel")
    .setDescription("Cancel the current operation"),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Show current model configuration"),
];
