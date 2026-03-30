const MAX_MESSAGE_LENGTH = 2000;

export function chunkMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a code block boundary
    let splitIdx = remaining.lastIndexOf("\n```\n", MAX_MESSAGE_LENGTH);
    if (splitIdx === -1 || splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // Try to split at a newline
      splitIdx = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (splitIdx === -1 || splitIdx < MAX_MESSAGE_LENGTH / 2) {
      // Hard split
      splitIdx = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }

  return chunks;
}

export function formatError(error: string): string {
  return `⚠️ **Error**: ${error}`;
}

export function formatWorkerStatus(
  workers: Array<{
    name: string;
    status: string;
    branch: string;
    taskDescription: string;
  }>,
): string {
  if (workers.length === 0) return "No active workers.";

  const lines = workers.map(
    (w) =>
      `• **${w.name}** [${w.status}]\n  Branch: \`${w.branch}\`\n  Task: ${w.taskDescription}`,
  );
  return `**Active Workers (${workers.length})**\n${lines.join("\n\n")}`;
}
