import { useMemo, useState } from 'react';
import type { ConnectionStatus, ServerConfig, ServerGroup } from '@/types';
import { ServerCard } from '@/components/servers/ServerCard';

interface SidebarProps {
  servers: ServerConfig[];
  groups: ServerGroup[];
  statuses: Record<string, ConnectionStatus>;
  deployRunningByServer?: Record<string, boolean>;
  selectedServerId: string | null;
  groupError: string | null;
  onSelectServer: (id: string) => void;
  onToggleConnection: (id: string, status: ConnectionStatus) => void;
  onAddServer: () => void;
  onOpenSettings: () => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => Promise<void>;
  onMoveServerToGroup: (serverId: string, groupId: string | null) => Promise<void>;
}

interface SidebarSectionProps {
  title: string;
  collapsible: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRename?: () => void;
  onDropServer: (serverId: string) => void;
  children: React.ReactNode;
}

interface GroupDialogState {
  mode: 'create' | 'rename';
  groupId?: string;
  value: string;
}

const SidebarSection = ({
  title,
  collapsible,
  collapsed,
  onToggleCollapsed,
  onRename,
  onDropServer,
  children
}: SidebarSectionProps): JSX.Element => {
  return (
    <section
      className="rounded-lg border border-bg-elevated bg-bg-primary/40 p-2"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const serverId = event.dataTransfer.getData('text/server-id');
        if (serverId) {
          onDropServer(serverId);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          <span>{collapsible ? (collapsed ? '>' : 'v') : 'v'}</span>
          <span>{title}</span>
        </button>
        {onRename && (
          <button
            type="button"
            onClick={onRename}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-text-primary"
          >
            Rename
          </button>
        )}
      </div>
      {!collapsed && <div className="space-y-2">{children}</div>}
    </section>
  );
};

export const Sidebar = ({
  servers,
  groups,
  statuses,
  deployRunningByServer,
  selectedServerId,
  groupError,
  onSelectServer,
  onToggleConnection,
  onAddServer,
  onOpenSettings,
  onCreateGroup,
  onRenameGroup,
  onToggleGroupCollapsed,
  onMoveServerToGroup
}: SidebarProps): JSX.Element => {
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [dialogState, setDialogState] = useState<GroupDialogState | null>(null);

  const groupedServers = useMemo(() => {
    const mapped = new Map<string | null, ServerConfig[]>();
    mapped.set(null, []);

    for (const group of groups) {
      mapped.set(group.id, []);
    }

    for (const server of servers) {
      const groupId = server.groupId ?? null;
      const bucket = mapped.get(groupId) ?? mapped.get(null) ?? [];
      bucket.push(server);
      mapped.set(groupId, bucket);
    }

    return mapped;
  }, [groups, servers]);

  return (
    <>
      <aside className="flex h-full w-[260px] flex-col border-r border-bg-elevated bg-bg-secondary">
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <SidebarSection
            title="Default"
            collapsible
            collapsed={defaultCollapsed}
            onToggleCollapsed={() => setDefaultCollapsed((current) => !current)}
            onDropServer={(serverId) => {
              void onMoveServerToGroup(serverId, null);
            }}
          >
            {(groupedServers.get(null) ?? []).map((server) => (
              <div
                key={server.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/server-id', server.id);
                }}
              >
                <ServerCard
                  server={server}
                  status={statuses[server.id] ?? 'disconnected'}
                  deploying={deployRunningByServer?.[server.id] ?? false}
                  selected={selectedServerId === server.id}
                  onSelect={() => onSelectServer(server.id)}
                  onConnectToggle={() => onToggleConnection(server.id, statuses[server.id] ?? 'disconnected')}
                />
              </div>
            ))}

            {(groupedServers.get(null) ?? []).length === 0 && <p className="px-1 py-2 text-xs text-text-muted">No ungrouped servers.</p>}
          </SidebarSection>

          {groups.map((group) => (
            <SidebarSection
              key={group.id}
              title={group.name}
              collapsible
              collapsed={group.collapsed}
              onToggleCollapsed={() => {
                void onToggleGroupCollapsed(group.id, !group.collapsed);
              }}
              onRename={() => {
                setDialogState({
                  mode: 'rename',
                  groupId: group.id,
                  value: group.name
                });
              }}
              onDropServer={(serverId) => {
                void onMoveServerToGroup(serverId, group.id);
              }}
            >
              {(groupedServers.get(group.id) ?? []).map((server) => (
                <div
                  key={server.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/server-id', server.id);
                  }}
                >
                  <ServerCard
                    server={server}
                    status={statuses[server.id] ?? 'disconnected'}
                    deploying={deployRunningByServer?.[server.id] ?? false}
                    selected={selectedServerId === server.id}
                    onSelect={() => onSelectServer(server.id)}
                    onConnectToggle={() => onToggleConnection(server.id, statuses[server.id] ?? 'disconnected')}
                  />
                </div>
              ))}

              {(groupedServers.get(group.id) ?? []).length === 0 && <p className="px-1 py-2 text-xs text-text-muted">Drop servers here.</p>}
            </SidebarSection>
          ))}

          {servers.length === 0 && <p className="px-1 py-2 text-xs text-text-muted">No servers yet.</p>}
          {groupError && <p className="px-1 py-2 text-xs text-accent-red">{groupError}</p>}
        </div>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => {
              setDialogState({
                mode: 'create',
                value: ''
              });
            }}
            className="w-full rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm font-semibold hover:bg-bg-elevated"
          >
            + New Group
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddServer}
              className="flex-1 rounded-lg bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90"
            >
              + Add Server
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm font-semibold hover:bg-bg-elevated"
              aria-label="Open settings"
            >
              Gear
            </button>
          </div>
        </div>
      </aside>

      {dialogState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-bg-elevated bg-bg-secondary p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {dialogState.mode === 'create' ? 'Create Group' : 'Rename Group'}
              </h2>
              <button
                type="button"
                className="text-sm text-text-secondary hover:text-text-primary"
                onClick={() => setDialogState(null)}
              >
                Close
              </button>
            </div>

            <label className="mt-4 block text-sm">
              Group name
              <input
                autoFocus
                value={dialogState.value}
                onChange={(event) =>
                  setDialogState((current) => (current ? { ...current, value: event.target.value } : current))
                }
                className="mt-1 w-full rounded-md border border-bg-elevated bg-bg-tertiary px-3 py-2"
                placeholder="Production"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md bg-bg-elevated px-3 py-2 text-sm hover:bg-bg-tertiary"
                onClick={() => setDialogState(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-accent-blue px-3 py-2 text-sm font-semibold hover:opacity-90"
                onClick={async () => {
                  const nextName = dialogState.value.trim();
                  if (!nextName) {
                    return;
                  }

                  if (dialogState.mode === 'create') {
                    await onCreateGroup(nextName);
                  } else if (dialogState.groupId) {
                    await onRenameGroup(dialogState.groupId, nextName);
                  }

                  setDialogState(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
