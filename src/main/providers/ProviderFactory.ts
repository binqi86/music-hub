import type { MusicProvider } from './types';
import { SunoProvider } from './SunoProvider';
import { FlowMusicProvider } from './FlowMusicProvider';

type ProviderConstructor = new () => MusicProvider;

const registry = new Map<string, ProviderConstructor>();

registry.set('suno', SunoProvider);
registry.set('flowmusic', FlowMusicProvider);

export class ProviderFactory {
  static getProvider(model: string): MusicProvider {
    const Ctor = registry.get(model.toLowerCase());
    if (!Ctor) {
      throw new Error(`Unknown music provider: ${model}. Available: ${Array.from(registry.keys()).join(', ')}`);
    }
    return new Ctor();
  }

  static registerProvider(model: string, ctor: ProviderConstructor): void {
    registry.set(model.toLowerCase(), ctor);
  }

  static getAvailableProviders(): string[] {
    return Array.from(registry.keys());
  }

  static getModelsForProvider(providerName: string): string[] {
    if (providerName === 'apimart') {
      return ['suno', 'flowmusic'];
    }
    // For unknown providers, return all registered models
    return Array.from(registry.keys());
  }
}