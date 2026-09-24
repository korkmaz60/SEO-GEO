import { Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

import type { AppConfig, SmtpConfig } from "../config/env.js";
import type { EmailContent } from "./templates.js";

export interface MailMessage extends EmailContent {
  to: string;
}

/** Injection token for the {@link Mailer}. */
export const MAILER = Symbol("MAILER");

export interface Mailer {
  /** Whether messages reach the recipient. Email verification is only required when true. */
  readonly deliversEmail: boolean;
  send(message: MailMessage): Promise<void>;
}

export class SmtpMailer implements Mailer {
  readonly deliversEmail = true;
  private readonly transport: Transporter;

  constructor(private readonly smtp: SmtpConfig) {
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? "" } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.smtp.from, ...message });
  }
}

/**
 * Used when no SMTP server is configured. In development it prints messages, links included,
 * so sign-up and invitations can be tested locally; elsewhere it never logs their content,
 * because the links are credentials.
 */
export class ConsoleMailer implements Mailer {
  readonly deliversEmail = false;
  private readonly logger = new Logger("Mailer");

  constructor(private readonly printContent: boolean) {}

  async send(message: MailMessage): Promise<void> {
    if (this.printContent) {
      this.logger.log(`Email to ${message.to}: ${message.subject}\n${message.text}`);
    } else {
      this.logger.warn(`Email "${message.subject}" was not sent: SMTP is not configured`);
    }
  }
}

export function createMailer(config: AppConfig): Mailer {
  return config.smtp
    ? new SmtpMailer(config.smtp)
    : new ConsoleMailer(config.nodeEnv === "development");
}
