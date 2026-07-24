import type { IpcMain } from 'electron';
import { prisma } from '../lib/prisma';
import type { ProviderConfigData } from '../../shared/types';

export function registerProviderHandlers(ipcMain: IpcMain) {
  ipcMain.handle('provider:list', async (): Promise<ProviderConfigData[]> => {
    const configs = await prisma.providerConfig.findMany();
    return configs.map((c) => ({
      ...c,
      apiKey: maskApiKey(c.apiKey),
    }));
  });

  ipcMain.handle('provider:get', async (_event, id: string): Promise<ProviderConfigData | null> => {
    const config = await prisma.providerConfig.findUnique({ where: { id } });
    if (!config) return null;
    return config;
  });

  ipcMain.handle('provider:update', async (_event, id: string, data: { apiKey?: string; baseUrl?: string; displayName?: string; isActive?: boolean; useTunnel?: boolean }): Promise<ProviderConfigData> => {
    const config = await prisma.providerConfig.update({
      where: { id },
      data,
    });
    return config;
  });

  ipcMain.handle('provider:set-active', async (_event, id: string): Promise<void> => {
    await prisma.providerConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await prisma.providerConfig.update({
      where: { id },
      data: { isActive: true },
    });
  });
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '****' + key.slice(-4);
}