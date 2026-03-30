import { createLogger } from "./utils/logger.js";

const log = createLogger("queue");

export interface QueueItem {
  id: string;
  message: string;
  source: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

type MessageHandler = (message: string, source: string) => Promise<string>;

export class MessageQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private handler: MessageHandler | null = null;
  private currentItem: QueueItem | null = null;
  private idCounter = 0;

  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  enqueue(message: string, source = "discord"): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const id = `msg-${++this.idCounter}`;
      this.queue.push({ id, message, source, resolve, reject });
      log.debug("Enqueued message", { id, source, queueLength: this.queue.length });
      void this.processNext();
    });
  }

  cancelCurrent(): boolean {
    if (this.currentItem) {
      this.currentItem.reject(new Error("Cancelled by user"));
      this.currentItem = null;
      return true;
    }
    return false;
  }

  get length(): number {
    return this.queue.length;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.handler) return;

    this.processing = true;
    const item = this.queue.shift()!;
    this.currentItem = item;

    log.debug("Processing message", { id: item.id, source: item.source });

    try {
      const response = await this.handler(item.message, item.source);
      item.resolve(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error("Error processing message", { id: item.id, error: error.message });
      item.reject(error);
    } finally {
      this.currentItem = null;
      this.processing = false;
      // Process next item in queue
      void this.processNext();
    }
  }
}

// Singleton queue
export const messageQueue = new MessageQueue();
