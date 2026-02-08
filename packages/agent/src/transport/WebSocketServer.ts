import { WebSocketServer, WebSocket } from 'ws';
import {
  MessageType,
  createMessage,
  parseMessage,
  type VPMessage,
  type TerminalCreatePayload,
  type TerminalInputPayload,
  type TerminalResizePayload,
  type TerminalDestroyPayload,
  type FileTreeListPayload,
  type ProjectSwitchPayload,
  type TerminalCwdPayload,
  type FileReadPayload,
  type FileWritePayload,
  type ImageStartPayload,
  type ImageChunkPayload,
  type ImageCompletePayload,
} from '@vibepilot/protocol';
import { PtyManager } from '../pty/PtyManager.js';
import { FileTreeService } from '../fs/FileTreeService.js';
import { FileWatcher } from '../fs/FileWatcher.js';
import { SignalingHandler } from './SignalingHandler.js';
import { WebRTCPeer } from './WebRTCPeer.js';
import { ProjectManager } from '../config/ProjectManager.js';
import { FileContentService } from '../fs/FileContentService.js';
import { ImageReceiver } from '../image/ImageReceiver.js';

export interface VPWebSocketServerOptions {
  port: number;
  cwd?: string;
}

interface ClientState {
  ws: WebSocket;
  sessionIds: Set<string>;
  signalingHandler?: SignalingHandler;
  webrtcPeer?: WebRTCPeer;
}

export class VPWebSocketServer {
  private wss: WebSocketServer | null = null;
  private ptyManager = new PtyManager();
  private fileTreeService: FileTreeService;
  private fileWatcher: FileWatcher;
  private clients = new Map<WebSocket, ClientState>();
  private cwdTrackers = new Map<string, { timer: ReturnType<typeof setInterval>; lastCwd: string }>();
  private port: number;
  private cwd: string;
  private projectManager: ProjectManager;
  private fileContentService = new FileContentService();
  private imageReceiver = new ImageReceiver();
  private imageSessionMap = new Map<string, string>(); // transferId → sessionId

  constructor(options: VPWebSocketServerOptions) {
    this.port = options.port;
    this.cwd = options.cwd || process.cwd();
    this.fileTreeService = new FileTreeService(this.cwd);
    this.fileWatcher = new FileWatcher(this.cwd);
    this.projectManager = new ProjectManager();
  }

  async start(): Promise<void> {
    await this.projectManager.load();
    await this.imageReceiver.init();

    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        resolve();
      });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      // Start file watcher and broadcast changes to all clients
      this.fileWatcher.start();
      this.fileWatcher.on('add', (path) => this.broadcastFileChange('add', path));
      this.fileWatcher.on('change', (path) => this.broadcastFileChange('change', path));
      this.fileWatcher.on('unlink', (path) => this.broadcastFileChange('unlink', path));
      this.fileWatcher.on('addDir', (path) => this.broadcastFileChange('addDir', path));
      this.fileWatcher.on('unlinkDir', (path) => this.broadcastFileChange('unlinkDir', path));
    });
  }

  async stop(): Promise<void> {
    this.ptyManager.destroyAll();
    await this.fileWatcher.stop();

    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      // Close all client connections
      for (const client of this.wss.clients) {
        client.close();
      }
      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    const state: ClientState = { ws, sessionIds: new Set() };
    this.clients.set(ws, state);

    ws.on('message', (data) => {
      try {
        const msg = parseMessage(data.toString());
        this.handleMessage(ws, state, msg);
      } catch {
        // Invalid message, ignore
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(state);
      this.clients.delete(ws);
    });
  }

  private handleMessage(
    ws: WebSocket,
    state: ClientState,
    msg: VPMessage
  ): void {
    // Delegate signaling messages to SignalingHandler
    if (SignalingHandler.isSignalingMessage(msg.type)) {
      this.ensureSignalingHandler(ws, state);
      const sendResponse = (responseMsg: VPMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(responseMsg));
        }
      };
      state.signalingHandler!.handleMessage(msg, sendResponse);
      return;
    }

    switch (msg.type) {
      case MessageType.TERMINAL_CREATE:
        this.handleTerminalCreate(ws, state, msg.payload as TerminalCreatePayload);
        break;
      case MessageType.TERMINAL_INPUT:
        this.handleTerminalInput(msg.payload as TerminalInputPayload);
        break;
      case MessageType.TERMINAL_RESIZE:
        this.handleTerminalResize(msg.payload as TerminalResizePayload);
        break;
      case MessageType.TERMINAL_DESTROY:
        this.handleTerminalDestroy(state, msg.payload as TerminalDestroyPayload);
        break;
      case MessageType.FILETREE_LIST:
        this.handleFileTreeList(ws, msg.payload as FileTreeListPayload);
        break;
      case MessageType.PROJECT_SWITCH:
        this.handleProjectSwitch(ws, msg.payload as ProjectSwitchPayload);
        break;
      case MessageType.PROJECT_LIST:
        this.handleProjectList(ws);
        break;
      case MessageType.FILE_READ:
        this.handleFileRead(ws, msg.payload as FileReadPayload);
        break;
      case MessageType.FILE_WRITE:
        this.handleFileWrite(ws, msg.payload as FileWritePayload);
        break;
      case MessageType.IMAGE_START:
        this.handleImageStart(msg.payload as ImageStartPayload);
        break;
      case MessageType.IMAGE_CHUNK:
        this.handleImageChunk(msg.payload as ImageChunkPayload);
        break;
      case MessageType.IMAGE_COMPLETE:
        this.handleImageComplete(ws, msg.payload as ImageCompletePayload);
        break;
    }
  }

  private ensureSignalingHandler(ws: WebSocket, state: ClientState): void {
    if (!state.signalingHandler) {
      const peer = new WebRTCPeer();
      const handler = new SignalingHandler(peer);

      // Set up persistent send function for ICE candidate forwarding
      handler.setSendFunction((msg: VPMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      });

      // Route incoming DataChannel messages to the same handler as WS messages
      peer.on('message', (_label: string, msg: VPMessage) => {
        this.handleMessage(ws, state, msg);
      });

      state.webrtcPeer = peer;
      state.signalingHandler = handler;
    }
  }

  private handleTerminalCreate(
    ws: WebSocket,
    state: ClientState,
    payload: TerminalCreatePayload
  ): void {
    const { sessionId, cols, rows, cwd, shell } = payload;
    const effectiveCwd = cwd || this.cwd;

    const { pid } = this.ptyManager.create(sessionId, {
      cols,
      rows,
      cwd: effectiveCwd,
      shell,
    });

    state.sessionIds.add(sessionId);

    // Start tracking cwd changes for this session
    this.startCwdTracking(ws, sessionId, effectiveCwd);

    // Forward PTY output to client
    this.ptyManager.onOutput(sessionId, (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const outputMsg = createMessage(MessageType.TERMINAL_OUTPUT, {
          sessionId,
          data,
        });
        ws.send(JSON.stringify(outputMsg));
      }
    });

    // Handle PTY exit
    this.ptyManager.onExit(sessionId, (exitCode) => {
      if (ws.readyState === WebSocket.OPEN) {
        const destroyedMsg = createMessage(MessageType.TERMINAL_DESTROYED, {
          sessionId,
          exitCode,
        });
        ws.send(JSON.stringify(destroyedMsg));
      }
      state.sessionIds.delete(sessionId);
    });

    // Send created response
    const response = createMessage(MessageType.TERMINAL_CREATED, {
      sessionId,
      pid,
    });
    ws.send(JSON.stringify(response));
  }

  private startCwdTracking(ws: WebSocket, sessionId: string, initialCwd: string): void {
    // Send initial cwd immediately
    const cwdMsg = createMessage(MessageType.TERMINAL_CWD, { sessionId, cwd: initialCwd } as TerminalCwdPayload);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cwdMsg));
    }

    const tracker = {
      timer: setInterval(async () => {
        const cwd = await this.ptyManager.getCwd(sessionId);
        if (cwd && cwd !== tracker.lastCwd) {
          tracker.lastCwd = cwd;
          const msg = createMessage(MessageType.TERMINAL_CWD, { sessionId, cwd } as TerminalCwdPayload);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        }
      }, 2000),
      lastCwd: initialCwd,
    };
    this.cwdTrackers.set(sessionId, tracker);
  }

  private stopCwdTracking(sessionId: string): void {
    const tracker = this.cwdTrackers.get(sessionId);
    if (tracker) {
      clearInterval(tracker.timer);
      this.cwdTrackers.delete(sessionId);
    }
  }

  private handleTerminalInput(payload: TerminalInputPayload): void {
    const { sessionId, data } = payload;
    try {
      this.ptyManager.write(sessionId, data);
    } catch {
      // Session might be gone
    }
  }

  private handleTerminalResize(payload: TerminalResizePayload): void {
    const { sessionId, cols, rows } = payload;
    try {
      this.ptyManager.resize(sessionId, cols, rows);
    } catch {
      // Session might be gone
    }
  }

  private handleTerminalDestroy(
    state: ClientState,
    payload: TerminalDestroyPayload
  ): void {
    const { sessionId } = payload;
    this.stopCwdTracking(sessionId);
    this.ptyManager.destroy(sessionId);
    state.sessionIds.delete(sessionId);
  }

  private handleDisconnect(state: ClientState): void {
    for (const sessionId of state.sessionIds) {
      this.stopCwdTracking(sessionId);
      this.ptyManager.destroy(sessionId);
    }
    state.sessionIds.clear();

    // Clean up WebRTC peer if present
    if (state.webrtcPeer) {
      state.webrtcPeer.close();
      state.webrtcPeer = undefined;
      state.signalingHandler = undefined;
    }
  }

  private async handleFileTreeList(
    ws: WebSocket,
    payload: FileTreeListPayload
  ): Promise<void> {
    try {
      const { path, depth = 1 } = payload;
      // Use a FileTreeService rooted at the requested path to allow listing any directory
      const service = new FileTreeService(path);
      const entries = await service.list(path, depth);

      const response = createMessage(MessageType.FILETREE_DATA, {
        path,
        entries,
      });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      // Log error but don't crash - client will timeout
      console.error('Error listing file tree:', error);
    }
  }

  private async handleProjectSwitch(
    ws: WebSocket,
    payload: ProjectSwitchPayload
  ): Promise<void> {
    try {
      const project = await this.projectManager.switchProject(payload.projectId);

      // Update cwd
      this.cwd = project.path;

      // Re-create FileTreeService for the new project path
      this.fileTreeService = new FileTreeService(project.path);

      // Stop old file watcher and start a new one for the new project path
      await this.fileWatcher.stop();
      this.fileWatcher = new FileWatcher(project.path);
      this.fileWatcher.start();

      // Re-bind file change events
      this.fileWatcher.on('add', (path) => this.broadcastFileChange('add', path));
      this.fileWatcher.on('change', (path) => this.broadcastFileChange('change', path));
      this.fileWatcher.on('unlink', (path) => this.broadcastFileChange('unlink', path));
      this.fileWatcher.on('addDir', (path) => this.broadcastFileChange('addDir', path));
      this.fileWatcher.on('unlinkDir', (path) => this.broadcastFileChange('unlinkDir', path));

      // Send project:switched response
      const response = createMessage(MessageType.PROJECT_SWITCHED, { project });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Error switching project:', error);
    }
  }

  private handleProjectList(ws: WebSocket): void {
    const projects = this.projectManager.listProjects();
    const currentProject = this.projectManager.getCurrentProject();
    const response = createMessage(MessageType.PROJECT_LIST_DATA, {
      projects,
      currentProjectId: currentProject?.id ?? null,
    });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private async handleFileRead(ws: WebSocket, payload: FileReadPayload): Promise<void> {
    try {
      const result = await this.fileContentService.read(payload.filePath);
      const response = createMessage(MessageType.FILE_DATA, {
        filePath: result.filePath,
        content: result.content,
        encoding: result.encoding,
        language: result.language,
        mimeType: result.mimeType,
        size: result.size,
        readonly: result.readonly,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      const response = createMessage(MessageType.FILE_ERROR, {
        filePath: payload.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  private async handleFileWrite(ws: WebSocket, payload: FileWritePayload): Promise<void> {
    try {
      const size = await this.fileContentService.write(payload.filePath, payload.content);
      const response = createMessage(MessageType.FILE_WRITTEN, {
        filePath: payload.filePath,
        size,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      const response = createMessage(MessageType.FILE_ERROR, {
        filePath: payload.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  private handleImageStart(payload: ImageStartPayload): void {
    this.imageReceiver.startTransfer(payload.transferId, payload.filename, payload.totalSize);
    this.imageSessionMap.set(payload.transferId, payload.sessionId);
  }

  private handleImageChunk(payload: ImageChunkPayload): void {
    try {
      this.imageReceiver.addChunk(payload.transferId, payload.chunkIndex, payload.data);
    } catch {
      // Transfer not found, ignore
    }
  }

  private async handleImageComplete(ws: WebSocket, payload: ImageCompletePayload): Promise<void> {
    try {
      const filePath = await this.imageReceiver.complete(payload.transferId);
      const sessionId = this.imageSessionMap.get(payload.transferId) || 'default';
      this.imageSessionMap.delete(payload.transferId);

      const response = createMessage(MessageType.IMAGE_SAVED, {
        transferId: payload.transferId,
        sessionId,
        filePath,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Error completing image transfer:', error);
    }
  }

  private broadcastFileChange(
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir',
    path: string
  ): void {
    const message = createMessage(MessageType.FILETREE_CHANGED, {
      type,
      path,
    });

    const messageStr = JSON.stringify(message);

    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  }
}
