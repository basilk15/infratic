export const IPC_EVENTS = {
  servers: {
    list: 'servers:list',
    add: 'servers:add',
    addWithSecret: 'servers:addWithSecret',
    testConnection: 'servers:testConnection',
    remove: 'servers:remove',
    connect: 'servers:connect',
    disconnect: 'servers:disconnect',
    getStatus: 'servers:getStatus',
    statusChanged: 'servers:statusChanged'
  },
  services: {
    discover: 'services:discover',
    control: 'services:control',
    portOverview: 'services:portOverview'
  },
  metrics: {
    start: 'metrics:startPolling',
    stop: 'metrics:stopPolling',
    update: 'metrics:update'
  },
  logs: {
    start: 'logs:start',
    stop: 'logs:stop',
    pause: 'logs:pause',
    resume: 'logs:resume',
    line: 'logs:line',
    export: 'logs:export'
  },
  settings: {
    get: 'settings:get',
    updateAlerts: 'settings:updateAlerts',
    setServerNotifications: 'settings:setServerNotifications'
  },
  alerts: {
    event: 'alerts:event'
  },
  healthChecks: {
    list: 'healthChecks:list',
    add: 'healthChecks:add',
    remove: 'healthChecks:remove',
    getResults: 'healthChecks:getResults',
    toggle: 'healthChecks:toggle',
    results: 'healthChecks:results'
  },
  deploy: {
    list: 'deploy:list',
    add: 'deploy:add',
    remove: 'deploy:remove',
    run: 'deploy:run',
    cancel: 'deploy:cancel',
    getHistory: 'deploy:getHistory',
    output: 'deploy:output',
    complete: 'deploy:complete',
    state: 'deploy:state'
  },
  groups: {
    list: 'groups:list',
    create: 'groups:create',
    rename: 'groups:rename',
    setCollapsed: 'groups:setCollapsed',
    assignServer: 'groups:assignServer'
  },
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    close: 'terminal:close',
    data: 'terminal:data'
  },
  hostKey: {
    verify: 'hostKey:verify',
    mismatch: 'hostKey:mismatch',
    respond: 'hostKey:respond'
  }
} as const;
