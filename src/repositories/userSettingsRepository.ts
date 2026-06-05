import prisma from "../lib/prisma";
import type { UserSettings } from "@prisma/client";
import { ChatSound, Theme } from "@prisma/client";

export const userSettingsRepository = {
  async findByUserId(userId: string): Promise<UserSettings | null> {
    return prisma.userSettings.findUnique({
      where: { userId },
    });
  },

  async create(data: {
    userId: string;
    notificationsEnabled?: boolean;
    chatSound?: ChatSound;
    theme?: Theme;
    browserAlerts?: boolean;
  }): Promise<UserSettings> {
    return prisma.userSettings.create({
      data: {
        userId: data.userId,
        notificationsEnabled: data.notificationsEnabled ?? true,
        chatSound: data.chatSound ?? ChatSound.PING,
        theme: data.theme ?? Theme.LIGHT,
        browserAlerts: data.browserAlerts ?? true,
      },
    });
  },

  async upsert(
    userId: string,
    data: {
      notificationsEnabled?: boolean;
      chatSound?: ChatSound;
      theme?: Theme;
      browserAlerts?: boolean;
    }
  ): Promise<UserSettings> {
    return prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(data.notificationsEnabled !== undefined && { notificationsEnabled: data.notificationsEnabled }),
        ...(data.chatSound !== undefined && { chatSound: data.chatSound }),
        ...(data.theme !== undefined && { theme: data.theme }),
        ...(data.browserAlerts !== undefined && { browserAlerts: data.browserAlerts }),
      },
      create: {
        userId,
        notificationsEnabled: data.notificationsEnabled ?? true,
        chatSound: data.chatSound ?? ChatSound.PING,
        theme: data.theme ?? Theme.LIGHT,
        browserAlerts: data.browserAlerts ?? true,
      },
    });
  },
};

