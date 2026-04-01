import { type Message, type SendableChannels } from "discord.js";

interface StatusStep {
  label: string;
  state: "pending" | "active" | "done" | "failed";
  startedAt?: Date;
}

export class StatusMessage {
  private message: Message | null = null;
  private title: string;
  private steps: StatusStep[] = [];
  private outcome: "pending" | "success" | "failure" = "pending";
  private lastEditTime = 0;
  private editTimer: ReturnType<typeof setTimeout> | null = null;

  // Throttle: min 2 seconds between edits (Discord rate limit is 5/5s)
  private static EDIT_THROTTLE_MS = 2000;

  constructor(title: string) {
    this.title = title;
  }

  async send(channel: SendableChannels): Promise<void> {
    this.message = await channel.send(this.render());
  }

  addStep(label: string, state: "active" | "done" = "active"): void {
    // If adding a new active step, mark any currently active step done
    if (state === "active") {
      for (const step of this.steps) {
        if (step.state === "active") {
          step.state = "done";
        }
      }
    }
    this.steps.push({ label, state, startedAt: state === "active" ? new Date() : undefined });
    this.scheduleEdit();
  }

  updateStep(label: string, state: "done" | "failed"): void {
    const step = this.steps.find((s) => s.label === label);
    if (step) {
      step.state = state;
      this.scheduleEdit();
    }
  }

  async finalize(outcome: "success" | "failure"): Promise<void> {
    this.outcome = outcome;
    for (const step of this.steps) {
      if (step.state === "active" || step.state === "pending") {
        step.state = outcome === "success" ? "done" : "failed";
      }
    }
    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }
    await this.doEdit();
  }

  private render(): string {
    const icon =
      this.outcome === "success" ? "✅" : this.outcome === "failure" ? "❌" : "🔧";
    const titleSuffix =
      this.outcome === "success"
        ? " — done"
        : this.outcome === "failure"
          ? " — failed"
          : "";
    let text = `${icon} **${this.title}**${titleSuffix}\n`;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      const isLast = i === this.steps.length - 1;
      const prefix = isLast ? "└" : "├";
      const stateIcon =
        step.state === "done"
          ? "✅"
          : step.state === "failed"
            ? "❌"
            : step.state === "active"
              ? "⏳"
              : "⬜";

      let elapsed = "";
      if (step.state === "active" && step.startedAt) {
        const seconds = Math.floor((Date.now() - step.startedAt.getTime()) / 1000);
        if (seconds >= 5) {
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          elapsed = mins > 0 ? ` (${mins}m ${secs}s)` : ` (${secs}s)`;
        }
      }

      text += `${prefix} ${stateIcon} ${step.label}${elapsed}\n`;
    }

    return text.trim();
  }

  private scheduleEdit(): void {
    const now = Date.now();
    const timeSinceLastEdit = now - this.lastEditTime;

    if (timeSinceLastEdit >= StatusMessage.EDIT_THROTTLE_MS) {
      void this.doEdit();
    } else if (!this.editTimer) {
      this.editTimer = setTimeout(() => {
        this.editTimer = null;
        void this.doEdit();
      }, StatusMessage.EDIT_THROTTLE_MS - timeSinceLastEdit);
    }
  }

  private async doEdit(): Promise<void> {
    if (!this.message) return;
    try {
      await this.message.edit(this.render());
      this.lastEditTime = Date.now();
    } catch {
      // Silently ignore edit failures — message may have been deleted
    }
  }
}
