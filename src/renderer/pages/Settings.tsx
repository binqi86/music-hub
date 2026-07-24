import React, { useEffect, useState } from 'react';
import { Check, Edit3, Save, X, Key, Globe, Power, Radio } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { getProviderConfigs, updateProviderConfig, setActiveProvider } from '../lib/electron-api';
import type { ProviderConfigData } from '../../shared/types';

export function Settings() {
  const [configs, setConfigs] = useState<ProviderConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ apiKey: '', baseUrl: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const result = await getProviderConfigs();
      setConfigs(result);
    } catch (err) {
      setError('加载配置失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleEdit = (config: ProviderConfigData) => {
    setEditingId(config.id);
    setEditForm({ apiKey: '', baseUrl: config.baseUrl });
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const data: { apiKey?: string; baseUrl?: string } = {};
      if (editForm.apiKey) data.apiKey = editForm.apiKey;
      if (editForm.baseUrl) data.baseUrl = editForm.baseUrl;
      await updateProviderConfig(id, data);
      setEditingId(null);
      setSuccess('配置已保存');
      loadConfigs();
    } catch (err) {
      setError('保存失败');
    }
    setSaving(false);
  };

  const handleSetActive = async (id: string) => {
    try {
      await setActiveProvider(id);
      setSuccess('已切换供应商');
      loadConfigs();
    } catch (err) {
      setError('切换失败');
    }
  };

  const handleToggleTunnel = async (id: string, current: boolean) => {
    try {
      await updateProviderConfig(id, { useTunnel: !current });
      setSuccess(current ? '隧道已关闭' : '隧道已开启');
      loadConfigs();
    } catch (err) {
      setError('设置失败');
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">设置</h1>
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">设置</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          {success}
        </div>
      )}

      <div className="space-y-4">
        {configs.map((config) => (
          <Card key={config.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-lg">{config.displayName}</h3>
                  {config.isActive && (
                    <Badge variant="success">当前使用</Badge>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  {/* API Key */}
                  <div className="flex items-center gap-2 text-theme-secondary">
                    <Key className="w-4 h-4" />
                    {editingId === config.id ? (
                      <input
                        type="password"
                        value={editForm.apiKey}
                        onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                        placeholder="输入新的 API Key"
                        className="flex-1 bg-surface-900 border border-surface-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                      />
                    ) : (
                      <span>{config.apiKey ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}` : '未设置'}</span>
                    )}
                  </div>

                  {/* Base URL */}
                  <div className="flex items-center gap-2 text-theme-secondary">
                    <Globe className="w-4 h-4" />
                    {editingId === config.id ? (
                      <input
                        type="text"
                        value={editForm.baseUrl}
                        onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                        placeholder="Base URL"
                        className="flex-1 bg-surface-900 border border-surface-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                      />
                    ) : (
                      <span className="font-mono text-xs">{config.baseUrl}</span>
                    )}
                  </div>
                </div>

                {/* Tunnel toggle */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-theme-secondary flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5" />
                    上传隧道 (Cloudflare)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleTunnel(config.id, config.useTunnel)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      config.useTunnel ? 'bg-brand-600' : 'bg-surface-200'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        config.useTunnel ? 'translate-x-3.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs text-theme-tertiary">
                    {config.useTunnel ? '上传本地文件时自动启用' : '仅支持公网 URL 上传'}
                  </span>
                </div>

                {/* Available models */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-theme-secondary">可用模型:</span>
                  <div className="flex gap-1">
                    {config.name === 'apimart' ? (
                      <>
                        <Badge>Suno</Badge>
                        <Badge>Flow Music</Badge>
                      </>
                    ) : (
                      <Badge>配置中</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                {editingId === config.id ? (
                  <Button size="sm" loading={saving} onClick={() => handleSave(config.id)}>
                    <Save className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(config)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                )}

                {!config.isActive && (
                  <Button size="sm" variant="ghost" onClick={() => handleSetActive(config.id)}>
                    <Power className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {configs.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-theme-secondary">暂无供应商配置</p>
        </Card>
      )}
    </div>
  );
}