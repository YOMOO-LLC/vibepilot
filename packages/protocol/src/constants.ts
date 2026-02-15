export const PROTOCOL_VERSION = '0.1.0';

export const MessageType = {
  // Terminal lifecycle
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_CREATED: 'terminal:created',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_DESTROYED: 'terminal:destroyed',
  TERMINAL_CWD: 'terminal:cwd',
  TERMINAL_ATTACH: 'terminal:attach',
  TERMINAL_ATTACHED: 'terminal:attached',
  TERMINAL_SUBSCRIBE: 'terminal:subscribe',
  TERMINAL_SUBSCRIBED: 'terminal:subscribed',
  TERMINAL_LIST_SESSIONS: 'terminal:list-sessions',
  TERMINAL_SESSIONS: 'terminal:sessions',

  // File tree
  FILETREE_LIST: 'filetree:list',
  FILETREE_DATA: 'filetree:data',
  FILETREE_CHANGED: 'filetree:changed',

  // Image transfer
  IMAGE_START: 'image:start',
  IMAGE_CHUNK: 'image:chunk',
  IMAGE_COMPLETE: 'image:complete',
  IMAGE_SAVED: 'image:saved',

  // WebRTC signaling (Supabase Broadcast)
  CONNECTION_REQUEST: 'connection-request',
  CONNECTION_READY: 'connection-ready',
  SIGNAL_OFFER: 'signal:offer',
  SIGNAL_ANSWER: 'signal:answer',
  SIGNAL_CANDIDATE: 'signal:candidate',

  // Project management
  PROJECT_SWITCH: 'project:switch',
  PROJECT_SWITCHED: 'project:switched',
  PROJECT_LIST: 'project:list',
  PROJECT_LIST_DATA: 'project:list-data',
  PROJECT_ADD: 'project:add',
  PROJECT_ADDED: 'project:added',
  PROJECT_REMOVE: 'project:remove',
  PROJECT_REMOVED: 'project:removed',
  PROJECT_UPDATE: 'project:update',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_ERROR: 'project:error',

  // File content
  FILE_READ: 'file:read',
  FILE_DATA: 'file:data',
  FILE_WRITE: 'file:write',
  FILE_WRITTEN: 'file:written',
  FILE_ERROR: 'file:error',

  // Browser (12)
  BROWSER_START: 'browser:start',
  BROWSER_STARTED: 'browser:started',
  BROWSER_STOP: 'browser:stop',
  BROWSER_STOPPED: 'browser:stopped',
  BROWSER_ERROR: 'browser:error',
  BROWSER_FRAME: 'browser:frame',
  BROWSER_FRAME_ACK: 'browser:frame-ack',
  BROWSER_INPUT: 'browser:input',
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_NAVIGATED: 'browser:navigated',
  BROWSER_CURSOR: 'browser:cursor',
  BROWSER_RESIZE: 'browser:resize',

  // HTTP Tunnel (4)
  TUNNEL_OPEN: 'tunnel:open',
  TUNNEL_OPENED: 'tunnel:opened',
  TUNNEL_REQUEST: 'tunnel:request',
  TUNNEL_RESPONSE: 'tunnel:response',
  TUNNEL_CLOSE: 'tunnel:close',
  TUNNEL_ERROR: 'tunnel:error',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export const DEFAULT_SHELL = process.env.SHELL || '/bin/bash';
export const DEFAULT_PORT = 9800;
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
