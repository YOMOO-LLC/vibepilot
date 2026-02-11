import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server as HttpServer, type IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { homedir } from 'os';
import { join } from 'path';
import type { AuthProvider } from '../auth/AuthProvider.js';
import {
  MessageType,
  createMessage,
  parseMessage,
  type VPMessage,
  type TerminalCreatePayload,
  type TerminalInputPayload,
  type TerminalResizePayload,
  type TerminalDestroyPayload,
  type TerminalAttachPayload,
  type FileTreeListPayload,
  type ProjectSwitchPayload,
  type ProjectAddPayload,
  type ProjectRemovePayload,
  type ProjectUpdatePayload,
  type TerminalCwdPayload,
  type FileReadPayload,
  type FileWritePayload,
  type ImageStartPayload,
  type ImageChunkPayload,
  type ImageCompletePayload,
  type BrowserStartPayload,
  type BrowserInputPayload,
  type BrowserNavigatePayload,
  type BrowserResizePayload,
} from '@vibepilot/protocol';
import { PtyManager } from '../pty/PtyManager.js';
import { SessionPersistenceManager } from '../pty/SessionPersistenceManager.js';
import { FileTreeService } from '../fs/FileTreeService.js';
import { FileWatcher } from '../fs/FileWatcher.js';
import { SignalingHandler } from './SignalingHandler.js';
import { WebRTCPeer } from './WebRTCPeer.js';
import { ProjectManager } from '../config/ProjectManager.js';
import { FileContentService } from '../fs/FileContentService.js';
import { ImageReceiver } from '../image/ImageReceiver.js';
import { BrowserService } from '../browser/BrowserService.js';
import { McpConfigManager } from '../browser/McpConfigManager.js';

export interface VPWebSocketServerOptions {
  port: number;
  cwd?: string;
  sessionTimeoutMs?: number;
  authProvider?: AuthProvider;
}

interface ClientState {
  ws: WebSocket;
  sessionIds: Set<string>;
  signalingHandler?: SignalingHandler;
  webrtcPeer?: WebRTCPeer;
}

interface SessionOwner {
  ws: WebSocket;
  state: ClientState;
}

export class VPWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private ptyManager = new PtyManager();
  private sessionPersistence: SessionPersistenceManager;
  private fileTreeService: FileTreeService;
  private fileWatcher: FileWatcher;
  private clients = new Map<WebSocket, ClientState>();
  private cwdTrackers = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; lastCwd: string }
  >();
  private sessionOwners = new Map<string, SessionOwner>();
  private port: number;
  private cwd: string;
  private projectManager: ProjectManager;
  private fileContentService: FileContentService;
  private imageReceiver = new ImageReceiver();
  private imageSessionMap = new Map<string, string>(); // transferId → sessionId
  private browserService: BrowserService;
  private browserClient: WebSocket | null = null;
  private mcpConfigManager: McpConfigManager | null = null;
  private authProvider?: AuthProvider;

  constructor(options: VPWebSocketServerOptions) {
    this.port = options.port;
    this.cwd = options.cwd || process.cwd();
    this.fileTreeService = new FileTreeService(this.cwd);
    this.fileWatcher = new FileWatcher(this.cwd);
    this.projectManager = new ProjectManager();
    this.fileContentService = new FileContentService(this.cwd);
    this.authProvider = options.authProvider;
    this.sessionPersistence = new SessionPersistenceManager(this.ptyManager, {
      timeoutMs: options.sessionTimeoutMs,
    });
    this.browserService = new BrowserService(join(homedir(), '.vibepilot', 'browser-profiles'));

    // Forward browser frames to the client that started the browser
    this.browserService.on('frame', (frame) => {
      if (this.browserClient && this.browserClient.readyState === WebSocket.OPEN) {
        const frameMsg = createMessage(MessageType.BROWSER_FRAME, frame);
        this.browserClient.send(JSON.stringify(frameMsg));
      }
    });

    // Forward cursor changes to the browser client
    this.browserService.on('cursor', (cursor: string) => {
      if (this.browserClient && this.browserClient.readyState === WebSocket.OPEN) {
        const cursorMsg = createMessage(MessageType.BROWSER_CURSOR, { cursor });
        this.browserClient.send(JSON.stringify(cursorMsg));
      }
    });

    // Clean up env/MCP config when browser shuts down due to idle timeout
    this.browserService.on('idle-shutdown', async () => {
      await this.cleanupBrowserEnv();
    });
  }

  async start(): Promise<void> {
    await this.projectManager.load();
    await this.imageReceiver.init();

    return new Promise((resolve) => {
      this.httpServer = createServer((_req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('WebSocket connection required');
      });

      this.wss = new WebSocketServer({ noServer: true, maxPayload: 10 * 1024 * 1024 });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        this.handleUpgrade(req, socket, head);
      });

      this.httpServer.listen(this.port, () => {
        resolve();
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
    this.sessionPersistence.destroyAll();
    this.ptyManager.destroyAll();
    await this.browserService.stop();
    await this.cleanupBrowserEnv();
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
        if (this.httpServer) {
          this.httpServer.close(() => {
            this.httpServer = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  private async setupBrowserEnv(cdpPort: number): Promise<void> {
    const cdpUrl = `http://127.0.0.1:${cdpPort}`;
    process.env.CHROME_CDP_URL = cdpUrl;
    process.env.BROWSER_PREVIEW_PORT = String(cdpPort);
    process.env.PLAYWRIGHT_CDP_ENDPOINT = cdpUrl;

    const projectPath = this.projectManager.getCurrentProject()?.path ?? this.cwd;
    this.mcpConfigManager = new McpConfigManager(projectPath);
    await this.mcpConfigManager.write(cdpUrl);
  }

  private async cleanupBrowserEnv(): Promise<void> {
    delete process.env.CHROME_CDP_URL;
    delete process.env.BROWSER_PREVIEW_PORT;
    delete process.env.PLAYWRIGHT_CDP_ENDPOINT;
    if (this.mcpConfigManager) {
      await this.mcpConfigManager.clean().catch((err) => {
        console.error('Failed to clean MCP config:', err);
      });
      this.mcpConfigManager = null;
    }
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // If no auth provider, accept all connections
    if (!this.authProvider) {
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req);
      });
      return;
    }

    // Extract token from URL query parameter
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const result = await this.authProvider.verify(token);
      if (!result.success) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Auth passed — complete the WebSocket upgrade
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req);
      });
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private handleConnection(ws: WebSocket): void {
    const state: ClientState = { ws, sessionIds: new Set() };
    this.clients.set(ws, state);

    ws.on('message', (data) => {
      try {
        const msg = parseMessage(data.toString());
        this.handleMessage(ws, state, msg);
      } catch {
        // Parse or handler error — ignore (client will timeout)
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(state);
      this.clients.delete(ws);
    });

    // Eagerly start Chrome and write MCP config so Claude Code discovers servers on launch
    this.ensureBrowserAndConfig().catch((err) => {
      console.error('Failed to start browser on connection:', err);
    });
  }

  private async ensureBrowserAndConfig(): Promise<void> {
    if (!this.browserService.isRunning()) {
      const projectId = this.projectManager.getCurrentProject()?.id ?? 'default';
      await this.browserService.start(projectId);
    }
    // Always (re-)write MCP config — may have been cleaned on previous disconnect
    const cdpPort = this.browserService.getCdpPort();
    if (cdpPort) {
      await this.setupBrowserEnv(cdpPort);
    }
  }

  private async handleMessage(ws: WebSocket, state: ClientState, msg: VPMessage): Promise<void> {
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
      case MessageType.TERMINAL_ATTACH:
        this.handleTerminalAttach(ws, state, msg.payload as TerminalAttachPayload);
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
      case MessageType.PROJECT_ADD:
        this.handleProjectAdd(ws, msg.payload as ProjectAddPayload);
        break;
      case MessageType.PROJECT_REMOVE:
        this.handleProjectRemove(ws, msg.payload as ProjectRemovePayload);
        break;
      case MessageType.PROJECT_UPDATE:
        this.handleProjectUpdate(ws, msg.payload as ProjectUpdatePayload);
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

      case MessageType.BROWSER_START: {
        const payload = msg.payload as BrowserStartPayload;
        this.browserClient = ws;

        // Chrome is normally already running (started on connection).
        // Attach screencast for the Preview panel.
        if (this.browserService.isRunning()) {
          await this.browserService.attachPreview();
          const response = createMessage(MessageType.BROWSER_STARTED, {
            cdpPort: this.browserService.getCdpPort()!,
            viewportWidth: payload.width ?? 1280,
            viewportHeight: payload.height ?? 720,
          });
          ws.send(JSON.stringify(response));
          break;
        }

        // Fallback: Chrome not yet ready (race with ensureBrowserAndConfig), start now
        try {
          const projectId = this.projectManager.getCurrentProject()?.id ?? 'default';
          const info = await this.browserService.start(projectId, payload);
          await this.setupBrowserEnv(info.cdpPort);
          const response = createMessage(MessageType.BROWSER_STARTED, {
            cdpPort: info.cdpPort,
            viewportWidth: info.viewportWidth,
            viewportHeight: info.viewportHeight,
          });
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const response = createMessage(MessageType.BROWSER_ERROR, {
            error: err.message,
            code: err.message.includes('not found')
              ? ('CHROME_NOT_FOUND' as const)
              : ('LAUNCH_FAILED' as const),
          });
          ws.send(JSON.stringify(response));
        }
        break;
      }

      case MessageType.BROWSER_STOP: {
        await this.browserService.stop();
        await this.cleanupBrowserEnv();
        this.browserClient = null;
        const response = createMessage(MessageType.BROWSER_STOPPED, {});
        ws.send(JSON.stringify(response));
        break;
      }

      case MessageType.BROWSER_INPUT: {
        try {
          await this.browserService.handleInput(msg.payload as BrowserInputPayload);
        } catch {
          // Browser not started, ignore
        }
        break;
      }

      case MessageType.BROWSER_NAVIGATE: {
        const { url } = msg.payload as BrowserNavigatePayload;
        try {
          await this.browserService.navigate(url);
        } catch (err: any) {
          const response = createMessage(MessageType.BROWSER_ERROR, {
            error: err.message,
            code: 'NAVIGATE_FAILED' as const,
          });
          ws.send(JSON.stringify(response));
        }
        break;
      }

      case MessageType.BROWSER_RESIZE: {
        const { width, height } = msg.payload as BrowserResizePayload;
        try {
          await this.browserService.resize(width, height);
        } catch {
          // Browser not started, ignore
        }
        break;
      }

      case MessageType.BROWSER_FRAME_ACK: {
        const { timestamp } = msg.payload as { timestamp: number };
        this.browserService.ackFrame(timestamp).catch(() => {});
        break;
      }
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
    this.sessionOwners.set(sessionId, { ws, state });

    // Start tracking cwd changes for this session
    this.startCwdTracking(sessionId, effectiveCwd);

    // Forward PTY output to client via delegate
    this.ptyManager.onOutput(sessionId, (data) => {
      const owner = this.sessionOwners.get(sessionId);
      if (owner && owner.ws.readyState === WebSocket.OPEN) {
        const outputMsg = createMessage(MessageType.TERMINAL_OUTPUT, {
          sessionId,
          data,
        });
        owner.ws.send(JSON.stringify(outputMsg));
      }
    });

    // Handle PTY exit
    this.ptyManager.onExit(sessionId, (exitCode) => {
      // Check if orphaned
      if (this.sessionPersistence.isOrphaned(sessionId)) {
        this.sessionPersistence.handleOrphanedExit(sessionId);
        this.sessionOwners.delete(sessionId);
        return;
      }

      const owner = this.sessionOwners.get(sessionId);
      if (owner && owner.ws.readyState === WebSocket.OPEN) {
        const destroyedMsg = createMessage(MessageType.TERMINAL_DESTROYED, {
          sessionId,
          exitCode,
        });
        owner.ws.send(JSON.stringify(destroyedMsg));
      }
      owner?.state.sessionIds.delete(sessionId);
      this.sessionOwners.delete(sessionId);
    });

    // Send created response
    const response = createMessage(MessageType.TERMINAL_CREATED, {
      sessionId,
      pid,
    });
    ws.send(JSON.stringify(response));
  }

  private handleTerminalAttach(
    ws: WebSocket,
    state: ClientState,
    payload: TerminalAttachPayload
  ): void {
    const { sessionId, cols, rows } = payload;

    // Try to reclaim the orphaned session
    const orphan = this.sessionPersistence.reclaim(sessionId);

    if (!orphan || !this.ptyManager.hasSession(sessionId)) {
      // Session doesn't exist — tell client to create a new one
      const response = createMessage(MessageType.TERMINAL_DESTROYED, {
        sessionId,
        exitCode: -1,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    // Update owner mapping
    state.sessionIds.add(sessionId);
    this.sessionOwners.set(sessionId, { ws, state });

    // Resize if dimensions provided
    if (cols && rows) {
      try {
        this.ptyManager.resize(sessionId, cols, rows);
      } catch {
        // Ignore resize errors
      }
    }

    // Attach new output sink and get buffered data
    const bufferedOutput = this.ptyManager.attachOutput(sessionId, (data) => {
      const owner = this.sessionOwners.get(sessionId);
      if (owner && owner.ws.readyState === WebSocket.OPEN) {
        const outputMsg = createMessage(MessageType.TERMINAL_OUTPUT, {
          sessionId,
          data,
        });
        owner.ws.send(JSON.stringify(outputMsg));
      }
    });

    // Resume CWD tracking
    this.resumeCwdTracking(sessionId, orphan.lastCwd);

    // Send attached response with buffered output
    const pid = this.ptyManager.getPid(sessionId)!;
    const response = createMessage(MessageType.TERMINAL_ATTACHED, {
      sessionId,
      pid,
      bufferedOutput,
    });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private startCwdTracking(sessionId: string, initialCwd: string): void {
    const sendCwd = (cwd: string) => {
      const owner = this.sessionOwners.get(sessionId);
      if (owner && owner.ws.readyState === WebSocket.OPEN) {
        const msg = createMessage(MessageType.TERMINAL_CWD, {
          sessionId,
          cwd,
        } as TerminalCwdPayload);
        owner.ws.send(JSON.stringify(msg));
      }
    };

    // Send initial cwd immediately
    sendCwd(initialCwd);

    const tracker = {
      timer: setInterval(async () => {
        const cwd = await this.ptyManager.getCwd(sessionId);
        if (cwd && cwd !== tracker.lastCwd) {
          tracker.lastCwd = cwd;
          sendCwd(cwd);
        }
      }, 2000),
      lastCwd: initialCwd,
    };
    this.cwdTrackers.set(sessionId, tracker);
  }

  private pauseCwdTracking(sessionId: string): string {
    const tracker = this.cwdTrackers.get(sessionId);
    if (tracker) {
      clearInterval(tracker.timer);
      const lastCwd = tracker.lastCwd;
      this.cwdTrackers.delete(sessionId);
      return lastCwd;
    }
    return this.cwd;
  }

  private resumeCwdTracking(sessionId: string, lastCwd: string): void {
    this.startCwdTracking(sessionId, lastCwd);
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

  private handleTerminalDestroy(state: ClientState, payload: TerminalDestroyPayload): void {
    const { sessionId } = payload;
    this.stopCwdTracking(sessionId);
    this.ptyManager.destroy(sessionId);
    state.sessionIds.delete(sessionId);
    this.sessionOwners.delete(sessionId);
  }

  private handleDisconnect(state: ClientState): void {
    // Detach browser preview (starts idle timer) instead of killing Chrome immediately
    if (this.browserClient === state.ws) {
      this.browserService.detachPreview();
      this.browserClient = null;
    }

    // Clean MCP config when the last client disconnects
    // (this.clients still contains the disconnecting client at this point)
    if (this.clients.size <= 1) {
      this.cleanupBrowserEnv().catch((err) => {
        console.error('Failed to clean browser env on disconnect:', err);
      });
    }

    for (const sessionId of state.sessionIds) {
      if (this.ptyManager.hasSession(sessionId) && !this.ptyManager.isExited(sessionId)) {
        // Orphan the session instead of destroying
        const lastCwd = this.pauseCwdTracking(sessionId);
        this.ptyManager.detachOutput(sessionId);
        this.sessionPersistence.orphan(sessionId, lastCwd);
      } else {
        // Session already exited or doesn't exist, clean up
        this.stopCwdTracking(sessionId);
        this.ptyManager.destroy(sessionId);
        this.sessionOwners.delete(sessionId);
      }
    }
    state.sessionIds.clear();

    // Clean up WebRTC peer if present
    if (state.webrtcPeer) {
      state.webrtcPeer.close();
      state.webrtcPeer = undefined;
      state.signalingHandler = undefined;
    }
  }

  private async handleFileTreeList(ws: WebSocket, payload: FileTreeListPayload): Promise<void> {
    try {
      const { path, depth = 1 } = payload;
      const entries = await this.fileTreeService.list(path, depth);

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

  private async handleProjectSwitch(ws: WebSocket, payload: ProjectSwitchPayload): Promise<void> {
    try {
      const project = await this.projectManager.switchProject(payload.projectId);

      // Update cwd
      this.cwd = project.path;

      // Re-create FileTreeService and FileContentService for the new project path
      this.fileTreeService = new FileTreeService(project.path);
      this.fileContentService = new FileContentService(project.path);

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

  private async handleProjectAdd(ws: WebSocket, payload: ProjectAddPayload): Promise<void> {
    try {
      const project = await this.projectManager.addProject(payload.name, payload.path, {
        favorite: payload.favorite,
        color: payload.color,
        tags: payload.tags,
      });

      const response = createMessage(MessageType.PROJECT_ADDED, { project });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      const errorMsg = createMessage(MessageType.PROJECT_ERROR, {
        operation: 'add',
        error: error instanceof Error ? error.message : String(error),
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
    }
  }

  private async handleProjectRemove(ws: WebSocket, payload: ProjectRemovePayload): Promise<void> {
    try {
      await this.projectManager.removeProject(payload.projectId);

      const response = createMessage(MessageType.PROJECT_REMOVED, {
        projectId: payload.projectId,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      const errorMsg = createMessage(MessageType.PROJECT_ERROR, {
        operation: 'remove',
        error: error instanceof Error ? error.message : String(error),
        projectId: payload.projectId,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
    }
  }

  private async handleProjectUpdate(ws: WebSocket, payload: ProjectUpdatePayload): Promise<void> {
    try {
      const project = await this.projectManager.updateProject(payload.projectId, payload.updates);

      const response = createMessage(MessageType.PROJECT_UPDATED, { project });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      const errorMsg = createMessage(MessageType.PROJECT_ERROR, {
        operation: 'update',
        error: error instanceof Error ? error.message : String(error),
        projectId: payload.projectId,
      });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMsg));
      }
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
