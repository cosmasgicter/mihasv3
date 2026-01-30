/**
 * Plugin Manager Component
 * Administrative interface for managing plugins
 */

import React, { useState } from 'react'
import { usePlugins } from '../../hooks/usePlugins'
import { PluginManifest, PluginConfig } from '../../types/plugins'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Switch } from '../ui/Switch'
import { Input } from '../ui/Input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { 
  Download, 
  Trash2, 
  Settings, 
  Shield, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  RefreshCw
} from 'lucide-react'

export function PluginManager() {
  const {
    plugins,
    enabledPlugins,
    isLoading,
    error,
    enablePlugin,
    disablePlugin,
    uninstallPlugin,
    updatePluginConfig,
    isPluginEnabled,
    getPluginConfig,
    refreshPlugins
  } = usePlugins()

  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState<string | null>(null)

  const filteredPlugins = plugins.filter(plugin =>
    plugin.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plugin.metadata.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plugin.metadata.author.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleTogglePlugin = async (pluginId: string) => {
    try {
      if (isPluginEnabled(pluginId)) {
        await disablePlugin(pluginId)
      } else {
        await enablePlugin(pluginId)
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error)
    }
  }

  const handleUninstallPlugin = async (pluginId: string) => {
    if (window.confirm('Are you sure you want to uninstall this plugin? This action cannot be undone.')) {
      try {
        await uninstallPlugin(pluginId)
      } catch (error) {
        console.error('Failed to uninstall plugin:', error)
      }
    }
  }

  const handleUpdateConfig = async (pluginId: string, config: Partial<PluginConfig>) => {
    try {
      await updatePluginConfig(pluginId, config)
      setShowSettings(null)
    } catch (error) {
      console.error('Failed to update plugin config:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading plugins...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plugin Manager</h1>
          <p className="text-gray-600">Manage and configure system plugins</p>
        </div>
        <Button onClick={refreshPlugins} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      <Tabs defaultValue="installed" className="w-full">
        <TabsList>
          <TabsTrigger value="installed">Installed Plugins</TabsTrigger>
          <TabsTrigger value="available">Available Plugins</TabsTrigger>
          <TabsTrigger value="settings">System Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search plugins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-gray-500">
              {filteredPlugins.length} of {plugins.length} plugins
            </div>
          </div>

          <div className="grid gap-4">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={plugin.metadata.id}
                plugin={plugin}
                isEnabled={isPluginEnabled(plugin.metadata.id)}
                config={getPluginConfig(plugin.metadata.id)}
                onToggle={() => handleTogglePlugin(plugin.metadata.id)}
                onUninstall={() => handleUninstallPlugin(plugin.metadata.id)}
                onSettings={() => setShowSettings(plugin.metadata.id)}
                showSettings={showSettings === plugin.metadata.id}
                onUpdateConfig={(config) => handleUpdateConfig(plugin.metadata.id, config)}
              />
            ))}
          </div>

          {filteredPlugins.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No plugins found matching your search.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <div className="text-center py-8">
            <Download className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Plugin Registry</h3>
            <p className="text-gray-500 mb-4">
              Browse and install plugins from the MIHAS plugin registry.
            </p>
            <Button variant="outline">
              Browse Registry
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SystemSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface PluginCardProps {
  plugin: PluginManifest
  isEnabled: boolean
  config?: PluginConfig
  onToggle: () => void
  onUninstall: () => void
  onSettings: () => void
  showSettings: boolean
  onUpdateConfig: (config: Partial<PluginConfig>) => void
}

function PluginCard({
  plugin,
  isEnabled,
  config,
  onToggle,
  onUninstall,
  onSettings,
  showSettings,
  onUpdateConfig
}: PluginCardProps) {
  const [localConfig, setLocalConfig] = useState<Partial<PluginConfig>>(config || {})

  const getStatusColor = () => {
    if (isEnabled) return 'text-green-600'
    return 'text-gray-400'
  }

  const getStatusIcon = () => {
    if (isEnabled) return <CheckCircle className="h-4 w-4" />
    return <XCircle className="h-4 w-4" />
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold">{plugin.metadata.name}</h3>
            <Badge variant="outline">{plugin.metadata.version}</Badge>
            <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
              {getStatusIcon()}
              <span className="text-sm">{isEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
          
          <p className="text-gray-600 mb-3">{plugin.metadata.description}</p>
          
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>By {plugin.metadata.author}</span>
            <span>•</span>
            <span>License: {plugin.metadata.license}</span>
            {plugin.metadata.keywords.length > 0 && (
              <>
                <span>•</span>
                <div className="flex space-x-1">
                  {plugin.metadata.keywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={isEnabled}
            onCheckedChange={onToggle}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onUninstall}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-6 pt-6 border-t">
          <PluginSettings
            plugin={plugin}
            config={localConfig}
            onConfigChange={setLocalConfig}
            onSave={() => onUpdateConfig(localConfig)}
            onCancel={() => onSettings()}
          />
        </div>
      )}
    </Card>
  )
}

interface PluginSettingsProps {
  plugin: PluginManifest
  config: Partial<PluginConfig>
  onConfigChange: (config: Partial<PluginConfig>) => void
  onSave: () => void
  onCancel: () => void
}

function PluginSettings({ plugin, config, onConfigChange, onSave, onCancel }: PluginSettingsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-lg font-medium flex items-center">
        <Settings className="h-5 w-5 mr-2" />
        Plugin Settings
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Auto Start</label>
          <Switch
            checked={config.autoStart || false}
            onCheckedChange={(checked) => 
              onConfigChange({ ...config, autoStart: checked })
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Start this plugin automatically when the system starts
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Priority</label>
          <Input
            type="number"
            value={config.priority || 0}
            onChange={(e) => 
              onConfigChange({ ...config, priority: parseInt(e.target.value) || 0 })
            }
            min="0"
            max="100"
          />
          <p className="text-xs text-gray-500 mt-1">
            Loading priority (higher numbers load first)
          </p>
        </div>
      </div>

      <div>
        <h5 className="text-sm font-medium mb-2 flex items-center">
          <Shield className="h-4 w-4 mr-1" />
          Permissions
        </h5>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {plugin.permissions.database && (
              <div className="flex items-center">
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                Database Access
              </div>
            )}
            {plugin.permissions.system?.notifications && (
              <div className="flex items-center">
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                Notifications
              </div>
            )}
            {plugin.permissions.system?.analytics && (
              <div className="flex items-center">
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                Analytics
              </div>
            )}
            {plugin.permissions.system?.storage && (
              <div className="flex items-center">
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                Storage
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>
          Save Settings
        </Button>
      </div>
    </div>
  )
}

function SystemSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Plugin System Settings</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Enable Plugin System</label>
              <p className="text-xs text-gray-500">Allow plugins to be loaded and executed</p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Auto-update Plugins</label>
              <p className="text-xs text-gray-500">Automatically update plugins when new versions are available</p>
            </div>
            <Switch />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Sandbox Mode</label>
              <p className="text-xs text-gray-500">Run plugins in isolated sandboxes for security</p>
            </div>
            <Switch defaultChecked />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Plugin Registry URL</label>
            <Input 
              defaultValue="***REMOVED***/plugins"
              placeholder="Registry URL"
            />
            <p className="text-xs text-gray-500 mt-1">
              URL of the plugin registry to search for available plugins
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Max Plugin Memory (MB)</label>
            <Input 
              type="number"
              defaultValue="50"
              min="10"
              max="500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum memory each plugin can use
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button>Save System Settings</Button>
      </div>
    </div>
  )
}