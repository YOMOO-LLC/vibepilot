'use client';

import { useConnectionStore } from '@/stores/connectionStore';
import { useTerminalStore } from '@/stores/terminalStore';

const stateColor = (state: string) =>
  state === 'connected'
    ? 'bg-green-500'
    : state === 'connecting'
      ? 'bg-yellow-500'
      : state === 'failed'
        ? 'bg-red-500'
        : 'bg-zinc-500';

export function StatusBar() {
  const connectionState = useConnectionStore((s) => s.state);
  const webrtcState = useConnectionStore((s) => s.webrtcState);
  const activeTransport = useConnectionStore((s) => s.activeTransport);
  const tabCount = useTerminalStore((s) => s.tabs.length);
  const layout = useTerminalStore((s) => s.layout);

  return (
    <div
      className="flex items-center justify-between px-4 py-1 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-4">
        <span>
          {tabCount} terminal{tabCount !== 1 ? 's' : ''}
        </span>
        <span>Layout: {layout}</span>
      </div>
      <div className="flex items-center gap-4">
        {/* Active transport badge */}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
            activeTransport === 'webrtc'
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
              : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/40'
          }`}
        >
          {activeTransport}
        </span>

        {/* WS status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${stateColor(connectionState)}`} />
          <span>WS</span>
        </div>

        {/* WebRTC status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${stateColor(webrtcState)}`} />
          <span>RTC</span>
        </div>
      </div>
    </div>
  );
}
