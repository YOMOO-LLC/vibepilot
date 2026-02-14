import { MessageType, type MessageTypeValue } from './constants.js';
import type { FileNode, TerminalSize, ProjectInfo } from './types.js';

// Base message envelope
export interface VPMessage<T extends string = string, P = unknown> {
  type: T;
  id: string;
  timestamp: number;
  payload: P;
}

// --- Terminal Messages ---

export interface TerminalCreatePayload {
  sessionId: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
}

export interface TerminalCreatedPayload {
  sessionId: string;
  pid: number;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalDestroyPayload {
  sessionId: string;
}

export interface TerminalDestroyedPayload {
  sessionId: string;
  exitCode?: number;
}

export interface TerminalCwdPayload {
  sessionId: string;
  cwd: string;
}

export interface TerminalAttachPayload {
  sessionId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalAttachedPayload {
  sessionId: string;
  pid: number;
  bufferedOutput: string;
}

// --- File Tree Messages ---

export interface FileTreeListPayload {
  path: string;
  depth?: number;
}

export interface FileTreeDataPayload {
  path: string;
  entries: FileNode[];
}

export interface FileTreeChangedPayload {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
}

// --- Image Messages ---

export interface ImageStartPayload {
  transferId: string;
  sessionId: string;
  filename: string;
  totalSize: number;
  mimeType: string;
}

export interface ImageChunkPayload {
  transferId: string;
  chunkIndex: number;
  data: string; // base64
}

export interface ImageCompletePayload {
  transferId: string;
}

export interface ImageSavedPayload {
  transferId: string;
  sessionId: string;
  filePath: string;
}

// --- Signal Messages ---

export interface ConnectionRequestPayload {
  agentId: string;
}

export interface ConnectionReadyPayload {
  agentId: string;
}

export interface SignalOfferPayload {
  sdp: string;
}

export interface SignalAnswerPayload {
  sdp: string;
}

export interface SignalCandidatePayload {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

// --- Project Messages ---

export interface ProjectSwitchPayload {
  projectId: string;
}

export interface ProjectSwitchedPayload {
  project: ProjectInfo;
}

export interface ProjectListPayload {}

export interface ProjectListDataPayload {
  projects: ProjectInfo[];
  currentProjectId: string | null;
}

export interface ProjectAddPayload {
  name: string;
  path: string;
  favorite?: boolean;
  color?: string;
  tags?: string[];
}

export interface ProjectAddedPayload {
  project: ProjectInfo;
}

export interface ProjectRemovePayload {
  projectId: string;
}

export interface ProjectRemovedPayload {
  projectId: string;
}

export interface ProjectUpdatePayload {
  projectId: string;
  updates: Partial<Pick<ProjectInfo, 'name' | 'favorite' | 'color' | 'tags'>>;
}

export interface ProjectUpdatedPayload {
  project: ProjectInfo;
}

export interface ProjectErrorPayload {
  operation: string;
  error: string;
  projectId?: string;
}

// --- File Content Messages ---

export interface FileReadPayload {
  filePath: string;
}

export interface FileDataPayload {
  filePath: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  language: string;
  mimeType: string;
  size: number;
  readonly: boolean;
}

export interface FileWritePayload {
  filePath: string;
  content: string;
  encoding: 'utf-8';
}

export interface FileWrittenPayload {
  filePath: string;
  size: number;
}

export interface FileErrorPayload {
  filePath: string;
  error: string;
}

// --- Browser Messages ---

export interface BrowserStartPayload {
  url?: string;
  width?: number;
  height?: number;
  quality?: number;
  mobile?: boolean;
}

export interface BrowserStartedPayload {
  cdpPort: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface BrowserStopPayload {}

export interface BrowserStoppedPayload {}

export interface BrowserErrorPayload {
  error: string;
  code: 'CHROME_NOT_FOUND' | 'LAUNCH_FAILED' | 'CDP_ERROR' | 'NAVIGATE_FAILED';
}

export interface BrowserFramePayload {
  data: string;
  encoding: 'jpeg' | 'h264';
  timestamp: number;
  metadata: {
    width: number;
    height: number;
    pageUrl: string;
    pageTitle: string;
  };
}

export interface BrowserFrameAckPayload {
  timestamp: number;
}

export interface BrowserInputPayload {
  type:
    | 'mousePressed'
    | 'mouseReleased'
    | 'mouseMoved'
    | 'mouseWheel'
    | 'keyDown'
    | 'keyUp'
    | 'insertText';
  x?: number;
  y?: number;
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}

export interface BrowserNavigatePayload {
  url: string;
}

export interface BrowserNavigatedPayload {
  url: string;
  title: string;
}

export interface BrowserCursorPayload {
  cursor: string;
}

export interface BrowserResizePayload {
  width: number;
  height: number;
}

// --- Message type map ---

export interface MessagePayloadMap {
  [MessageType.TERMINAL_CREATE]: TerminalCreatePayload;
  [MessageType.TERMINAL_CREATED]: TerminalCreatedPayload;
  [MessageType.TERMINAL_INPUT]: TerminalInputPayload;
  [MessageType.TERMINAL_OUTPUT]: TerminalOutputPayload;
  [MessageType.TERMINAL_RESIZE]: TerminalResizePayload;
  [MessageType.TERMINAL_DESTROY]: TerminalDestroyPayload;
  [MessageType.TERMINAL_DESTROYED]: TerminalDestroyedPayload;
  [MessageType.TERMINAL_CWD]: TerminalCwdPayload;
  [MessageType.TERMINAL_ATTACH]: TerminalAttachPayload;
  [MessageType.TERMINAL_ATTACHED]: TerminalAttachedPayload;
  [MessageType.FILETREE_LIST]: FileTreeListPayload;
  [MessageType.FILETREE_DATA]: FileTreeDataPayload;
  [MessageType.FILETREE_CHANGED]: FileTreeChangedPayload;
  [MessageType.IMAGE_START]: ImageStartPayload;
  [MessageType.IMAGE_CHUNK]: ImageChunkPayload;
  [MessageType.IMAGE_COMPLETE]: ImageCompletePayload;
  [MessageType.IMAGE_SAVED]: ImageSavedPayload;
  [MessageType.CONNECTION_REQUEST]: ConnectionRequestPayload;
  [MessageType.CONNECTION_READY]: ConnectionReadyPayload;
  [MessageType.SIGNAL_OFFER]: SignalOfferPayload;
  [MessageType.SIGNAL_ANSWER]: SignalAnswerPayload;
  [MessageType.SIGNAL_CANDIDATE]: SignalCandidatePayload;
  [MessageType.PROJECT_SWITCH]: ProjectSwitchPayload;
  [MessageType.PROJECT_SWITCHED]: ProjectSwitchedPayload;
  [MessageType.PROJECT_LIST]: ProjectListPayload;
  [MessageType.PROJECT_LIST_DATA]: ProjectListDataPayload;
  [MessageType.PROJECT_ADD]: ProjectAddPayload;
  [MessageType.PROJECT_ADDED]: ProjectAddedPayload;
  [MessageType.PROJECT_REMOVE]: ProjectRemovePayload;
  [MessageType.PROJECT_REMOVED]: ProjectRemovedPayload;
  [MessageType.PROJECT_UPDATE]: ProjectUpdatePayload;
  [MessageType.PROJECT_UPDATED]: ProjectUpdatedPayload;
  [MessageType.PROJECT_ERROR]: ProjectErrorPayload;
  [MessageType.FILE_READ]: FileReadPayload;
  [MessageType.FILE_DATA]: FileDataPayload;
  [MessageType.FILE_WRITE]: FileWritePayload;
  [MessageType.FILE_WRITTEN]: FileWrittenPayload;
  [MessageType.FILE_ERROR]: FileErrorPayload;
  [MessageType.BROWSER_START]: BrowserStartPayload;
  [MessageType.BROWSER_STARTED]: BrowserStartedPayload;
  [MessageType.BROWSER_STOP]: BrowserStopPayload;
  [MessageType.BROWSER_STOPPED]: BrowserStoppedPayload;
  [MessageType.BROWSER_ERROR]: BrowserErrorPayload;
  [MessageType.BROWSER_FRAME]: BrowserFramePayload;
  [MessageType.BROWSER_FRAME_ACK]: BrowserFrameAckPayload;
  [MessageType.BROWSER_INPUT]: BrowserInputPayload;
  [MessageType.BROWSER_NAVIGATE]: BrowserNavigatePayload;
  [MessageType.BROWSER_NAVIGATED]: BrowserNavigatedPayload;
  [MessageType.BROWSER_CURSOR]: BrowserCursorPayload;
  [MessageType.BROWSER_RESIZE]: BrowserResizePayload;
}

// --- Helper functions ---

let counter = 0;

function generateId(): string {
  return `${Date.now()}-${++counter}`;
}

export function createMessage<T extends MessageTypeValue>(
  type: T,
  payload: T extends keyof MessagePayloadMap ? MessagePayloadMap[T] : unknown
): VPMessage<T, typeof payload> {
  return {
    type,
    id: generateId(),
    timestamp: Date.now(),
    payload,
  };
}

export function parseMessage(data: string): VPMessage {
  const msg = JSON.parse(data);
  if (!msg.type || !msg.id || typeof msg.timestamp !== 'number') {
    throw new Error('Invalid VPMessage format');
  }
  return msg;
}
