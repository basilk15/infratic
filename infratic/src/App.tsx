import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { AlertToasts } from '@/components/alerts/AlertToasts';
import { AddServerModal } from '@/components/servers/AddServerModal';
import { HostKeyModal } from '@/components/servers/HostKeyModal';
import { AppShell } from '@/components/layout/AppShell';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import { DetailPane } from '@/components/layout/DetailPane';
import { DeployPanel } from '@/components/deploy/DeployPanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { EmbeddedTerminal } from '@/components/terminal/EmbeddedTerminal';
import { SplashScreen } from '@/components/onboarding/SplashScreen';
import { ipc } from '@/lib/ipc';
import { useGroupsStore } from '@/store/groups.store';
import { useAlertsStore } from '@/store/alerts.store';
import { subscribeToDeployEvents, useDeployStore } from '@/store/deploy.store';
import { subscribeToHealthCheckUpdates, useHealthChecksStore } from '@/store/health-checks.store';
import { subscribeToMetricsUpdates, useMetricsStore } from '@/store/metrics.store';
import { useServersStore } from '@/store/servers.store';
import { useSettingsStore } from '@/store/settings.store';
import { useServicesStore } from '@/store/services.store';

interface HostKeyPrompt {
  host: string;
  fingerprint: string;
}

const App = (): JSX.Element => {
  const [showSplash, setShowSplash] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPrompt | null>(null);
  const [serviceFilter, setServiceFilter] = useState<'running' | 'all'>('running');
  const [serviceSearch, setServiceSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  const servers = useServersStore((state) => state.servers);
  const statuses = useServersStore((state) => state.statuses);
  const selectedServerId = useServersStore((state) => state.selectedServerId);
  const setSelectedServer = useServersStore((state) => state.setSelectedServer);
  const loadServers = useServersStore((state) => state.loadServers);
  const connectServer = useServersStore((state) => state.connectServer);
  const disconnectServer = useServersStore((state) => state.disconnectServer);
  const setStatus = useServersStore((state) => state.setStatus);
  const setServerGroup = useServersStore((state) => state.setServerGroup);
  const serverError = useServersStore((state) => state.error);

  const groups = useGroupsStore((state) => state.groups);
  const groupsError = useGroupsStore((state) => state.error);
  const loadGroups = useGroupsStore((state) => state.loadGroups);
  const createGroup = useGroupsStore((state) => state.createGroup);
  const renameGroup = useGroupsStore((state) => state.renameGroup);
  const setGroupCollapsed = useGroupsStore((state) => state.setCollapsed);

  const alertSettings = useSettingsStore((state) => state.alerts);
  const alertEvents = useAlertsStore((state) => state.events);
  const pushAlertEvent = useAlertsStore((state) => state.pushEvent);
  const dismissAlertEvent = useAlertsStore((state) => state.dismissEvent);
  const onboardingCompleted = useSettingsStore((state) => state.onboardingCompleted);
  const serverSettings = useSettingsStore((state) => state.serverSettings);
  const settingsError = useSettingsStore((state) => state.error);
  const loadSettings = useSettingsStore((state) => state.load);
  const markOnboardingCompleted = useSettingsStore((state) => state.markOnboardingCompleted);
  const updateAlerts = useSettingsStore((state) => state.updateAlerts);
  const setServerNotifications = useSettingsStore((state) => state.setServerNotifications);

  const servicesByServer = useServicesStore((state) => state.servicesByServer);
  const loadingByServer = useServicesStore((state) => state.loadingByServer);
  const selectedServiceId = useServicesStore((state) => state.selectedServiceId);
  const selectService = useServicesStore((state) => state.selectService);
  const discover = useServicesStore((state) => state.discover);
  const controlService = useServicesStore((state) => state.controlService);
  const getSelectedService = useServicesStore((state) => state.getSelectedService);
  const servicesError = useServicesStore((state) => state.error);

  const liveMetrics = useMetricsStore((state) => state.live);
  const history = useMetricsStore((state) => state.history);
  const startPolling = useMetricsStore((state) => state.startPolling);
  const stopPolling = useMetricsStore((state) => state.stopPolling);

  const healthChecksByServiceKey = useHealthChecksStore((state) => state.checksByServiceKey);
  const healthResultsByCheck = useHealthChecksStore((state) => state.resultsByCheck);
  const healthError = useHealthChecksStore((state) => state.error);
  const loadHealthForServer = useHealthChecksStore((state) => state.loadForServer);
  const addHealthCheck = useHealthChecksStore((state) => state.addCheck);
  const removeHealthCheck = useHealthChecksStore((state) => state.removeCheck);
  const toggleHealthCheck = useHealthChecksStore((state) => state.toggleCheck);
  const getServiceHealthStatus = useHealthChecksStore((state) => state.getServiceHealthStatus);

  const deployCommandsByServer = useDeployStore((state) => state.commandsByServer);
  const deployHistoryByCommand = useDeployStore((state) => state.historyByCommand);
  const deployRunningByServer = useDeployStore((state) => state.runningByServer);
  const activeRunIdByServer = useDeployStore((state) => state.activeRunIdByServer);
  const lastRunIdByServer = useDeployStore((state) => state.lastRunIdByServer);
  const activeCommandIdByServer = useDeployStore((state) => state.activeCommandIdByServer);
  const deployOutputByRun = useDeployStore((state) => state.outputByRun);
  const deployError = useDeployStore((state) => state.error);
  const loadDeployCommands = useDeployStore((state) => state.loadCommands);
  const addDeployCommand = useDeployStore((state) => state.addCommand);
  const removeDeployCommand = useDeployStore((state) => state.removeCommand);
  const runDeployCommand = useDeployStore((state) => state.runCommand);
  const cancelDeploy = useDeployStore((state) => state.cancel);

  const activeServices = useMemo(() => {
    if (!selectedServerId) {
      return [];
    }
    return servicesByServer[selectedServerId] ?? [];
  }, [selectedServerId, servicesByServer]);
  const filteredServices = useMemo(() => {
    const byFilter = serviceFilter === 'all' ? activeServices : activeServices.filter((service) => service.status === 'running');
    const normalizedQuery = serviceSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return byFilter;
    }

    return byFilter.filter((service) => {
      const searchable = [
        service.displayName,
        service.name,
        service.manager,
        service.cmdline,
        ...service.ports.map((port) => `${port.port}`)
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [activeServices, serviceFilter, serviceSearch]);

  const selectedService = getSelectedService(selectedServerId);
  const selectedServerStatus = selectedServerId ? statuses[selectedServerId] ?? 'disconnected' : 'disconnected';
  const isDiscovering = selectedServerId ? (loadingByServer[selectedServerId] ?? false) : false;
  const selectedServer = selectedServerId ? servers.find((server) => server.id === selectedServerId) ?? null : null;

  useEffect(() => {
    void loadServers();
    void loadSettings();
    void loadGroups();
  }, [loadServers, loadSettings, loadGroups]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const unsubscribeMetrics = subscribeToMetricsUpdates();
    const unsubscribeStatus = ipc.servers.onStatus((id, status) => {
      setStatus(id, status);
    });
    const unsubscribeHostKey = ipc.hostKey.onVerify((host, fingerprint) => {
      setHostKeyPrompt({ host, fingerprint });
    });
    const unsubscribeAlerts = ipc.alerts.onEvent((event) => {
      pushAlertEvent(event);
    });
    const unsubscribeHealth = subscribeToHealthCheckUpdates();
    const unsubscribeDeploy = subscribeToDeployEvents();

    return () => {
      unsubscribeMetrics();
      unsubscribeStatus();
      unsubscribeHostKey();
      unsubscribeAlerts();
      unsubscribeHealth();
      unsubscribeDeploy();
    };
  }, [pushAlertEvent, setStatus]);

  useEffect(() => {
    if (servers.length > 0 && !onboardingCompleted) {
      markOnboardingCompleted();
    }
  }, [markOnboardingCompleted, onboardingCompleted, servers.length]);

  useEffect(() => {
    if (!selectedServerId) {
      return;
    }

    if (!['connected', 'degraded', 'reconnecting'].includes(selectedServerStatus)) {
      return;
    }

    void discover(selectedServerId);
  }, [selectedServerId, selectedServerStatus, discover]);

  useEffect(() => {
    if (!selectedServerId || activeServices.length === 0) {
      return;
    }

    void loadHealthForServer(
      selectedServerId,
      activeServices.map((service) => ({ stableKey: service.stableKey, id: service.id }))
    );
  }, [activeServices, loadHealthForServer, selectedServerId]);

  useEffect(() => {
    if (!selectedServerId) {
      return;
    }
    void loadDeployCommands(selectedServerId);
  }, [loadDeployCommands, selectedServerId]);

  useEffect(() => {
    if (!selectedServerId) {
      return;
    }

    if (!['connected', 'degraded', 'reconnecting'].includes(selectedServerStatus)) {
      return;
    }

    const pids = activeServices.map((service) => service.pid);
    if (pids.length === 0) {
      return;
    }

    void startPolling(selectedServerId, pids);

    return () => {
      void stopPolling(selectedServerId);
    };
  }, [activeServices, selectedServerId, selectedServerStatus, startPolling, stopPolling]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault();
        setTerminalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showSplash ? 0 : 1 }}
        transition={{ duration: 0.45, delay: showSplash ? 0 : 0.08 }}
        className="h-full"
      >
        <AppShell
          sidebar={
            <Sidebar
              servers={servers}
              groups={groups}
              statuses={statuses}
              deployRunningByServer={deployRunningByServer}
              selectedServerId={selectedServerId}
              groupError={groupsError}
              onSelectServer={setSelectedServer}
              onAddServer={() => setShowAddModal(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onCreateGroup={createGroup}
              onRenameGroup={renameGroup}
              onToggleGroupCollapsed={setGroupCollapsed}
              onMoveServerToGroup={setServerGroup}
              onToggleConnection={(id, status) => {
                if (status === 'connected') {
                  void disconnectServer(id);
                  return;
                }
                void connectServer(id);
              }}
            />
          }
          main={
            servers.length === 0 && !onboardingCompleted ? (
              <WelcomeScreen onAddServer={() => setShowAddModal(true)} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-bg-elevated bg-bg-secondary px-4 py-2">
                  <div>
                    <h1 className="text-base font-semibold">ServerPilot Studio</h1>
                    <p className="text-xs text-text-secondary">
                      {selectedServer ? `${selectedServer.name} (${selectedServer.host}:${selectedServer.port})` : 'Select a server'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!selectedServerId || isDiscovering || !['connected', 'degraded', 'reconnecting'].includes(selectedServerStatus)}
                      className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs font-semibold hover:bg-bg-tertiary disabled:opacity-50"
                      onClick={() => {
                        if (selectedServerId) {
                          void discover(selectedServerId);
                        }
                      }}
                    >
                      {isDiscovering ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      type="button"
                      disabled={!selectedServerId}
                      className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs font-semibold hover:bg-bg-tertiary disabled:opacity-50"
                      onClick={() => setDeployOpen(true)}
                    >
                      Deploy
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-bg-elevated px-3 py-1.5 text-xs font-semibold hover:bg-bg-tertiary"
                      onClick={() => setTerminalOpen((prev) => !prev)}
                    >
                      Terminal (Ctrl+`)
                    </button>
                  </div>
                </div>

              <div className="flex items-center justify-between border-b border-bg-elevated bg-bg-secondary px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-text-secondary">
                    Showing {filteredServices.length} of {activeServices.length} services
                  </div>
                  <input
                    value={serviceSearch}
                    onChange={(event) => setServiceSearch(event.target.value)}
                    placeholder="Search services"
                    className="w-56 rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-1.5 text-xs"
                  />
                </div>
                <div className="inline-flex rounded-md bg-bg-elevated p-0.5">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${serviceFilter === 'running' ? 'bg-accent-blue text-bg-primary' : 'text-text-secondary'}`}
                    onClick={() => setServiceFilter('running')}
                  >
                    Running only
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${serviceFilter === 'all' ? 'bg-accent-blue text-bg-primary' : 'text-text-secondary'}`}
                    onClick={() => setServiceFilter('all')}
                  >
                    All services
                  </button>
                </div>
              </div>

                {(serverError || servicesError || settingsError || groupsError || healthError || deployError) && (
                  <div className="border-b border-accent-red/30 bg-accent-red/10 px-4 py-2 text-xs text-accent-red">
                    {serverError || servicesError || settingsError || groupsError || healthError || deployError}
                  </div>
                )}

                <MainCanvas
                  services={filteredServices}
                  selectedServiceId={selectedServiceId}
                  liveMetrics={liveMetrics}
                  healthStatuses={Object.fromEntries(filteredServices.map((service) => [service.id, getServiceHealthStatus(service.stableKey)]))}
                  serverStatus={selectedServerStatus}
                  isDiscovering={isDiscovering}
                  onSelectService={selectService}
                />
              </div>
            )
          }
          detail={
            <DetailPane
              serverId={selectedServerId}
              serverName={selectedServer?.name}
              service={selectedService}
              metric={selectedService ? liveMetrics[selectedService.id] : undefined}
              history={selectedService ? history[selectedService.id]?.samples ?? [] : []}
              healthChecks={selectedService ? healthChecksByServiceKey[selectedService.stableKey] ?? [] : []}
              healthResultsByCheck={healthResultsByCheck}
              onAddHealthCheck={
                selectedServerId && selectedService
                  ? async (config) => addHealthCheck(selectedServerId, selectedService.stableKey, config)
                  : undefined
              }
              onRemoveHealthCheck={
                selectedService
                  ? async (checkId) => removeHealthCheck(selectedService.stableKey, checkId)
                  : undefined
              }
              onToggleHealthCheck={async (checkId, enabled) => toggleHealthCheck(checkId, enabled)}
              onAction={async (action) => {
                if (!selectedServerId || !selectedService) {
                  return { success: false, message: 'No service selected' };
                }

                const result = await controlService(selectedServerId, selectedService.id, action);
                await discover(selectedServerId);
                return result;
              }}
            />
          }
          terminal={<EmbeddedTerminal serverId={selectedServerId} visible={terminalOpen} onClose={() => setTerminalOpen(false)} />}
        />
      </motion.div>

      <AnimatePresence>{showSplash ? <SplashScreen /> : null}</AnimatePresence>

      <AddServerModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      <AlertToasts events={alertEvents} onDismiss={dismissAlertEvent} />
      <DeployPanel
        open={deployOpen}
        commands={selectedServerId ? deployCommandsByServer[selectedServerId] ?? [] : []}
        historyByCommand={deployHistoryByCommand}
        running={selectedServerId ? deployRunningByServer[selectedServerId] ?? false : false}
        displayRunId={
          selectedServerId
            ? activeRunIdByServer[selectedServerId] ?? lastRunIdByServer[selectedServerId] ?? null
            : null
        }
        activeCommandId={selectedServerId ? activeCommandIdByServer[selectedServerId] ?? null : null}
        output={
          selectedServerId
            ? deployOutputByRun[
                activeRunIdByServer[selectedServerId] ?? lastRunIdByServer[selectedServerId] ?? ''
              ] ?? ''
            : ''
        }
        error={deployError}
        onClose={() => setDeployOpen(false)}
        onAdd={
          selectedServerId
            ? async (config) => addDeployCommand(selectedServerId, config)
            : async () => {}
        }
        onRemove={
          selectedServerId
            ? async (commandId) => removeDeployCommand(selectedServerId, commandId)
            : async () => {}
        }
        onRun={
          selectedServerId
            ? async (commandId) => runDeployCommand(selectedServerId, commandId)
            : async () => {}
        }
        onCancel={
          selectedServerId
            ? async () => cancelDeploy(selectedServerId)
            : async () => {}
        }
      />
      <SettingsPanel
        open={settingsOpen}
        alerts={alertSettings}
        servers={servers}
        serverNotifications={Object.fromEntries(
          Object.values(serverSettings).map((item) => [item.serverId, item.notificationsEnabled])
        )}
        error={settingsError}
        onClose={() => setSettingsOpen(false)}
        onSaveAlerts={updateAlerts}
        onToggleServer={setServerNotifications}
      />

      {hostKeyPrompt && (
        <HostKeyModal
          host={hostKeyPrompt.host}
          fingerprint={hostKeyPrompt.fingerprint}
          onAccept={() => {
            ipc.hostKey.respond(hostKeyPrompt.host, true);
            setHostKeyPrompt(null);
          }}
          onReject={() => {
            ipc.hostKey.respond(hostKeyPrompt.host, false);
            setHostKeyPrompt(null);
          }}
        />
      )}
    </>
  );
};

export default App;
