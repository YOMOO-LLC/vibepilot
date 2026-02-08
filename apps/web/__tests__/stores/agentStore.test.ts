import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('agentStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset store state
    useAgentStore.setState({
      agents: [],
      selectedAgent: null,
      showSelector: false,
    });
  });

  describe('loadAgents', () => {
    it('loads agents from localStorage', () => {
      const agents = [{ id: 'a1', name: 'Home', url: 'ws://home:9800' }];
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(agents));

      useAgentStore.getState().loadAgents();

      expect(useAgentStore.getState().agents).toEqual(agents);
    });

    it('shows selector when no agents found', () => {
      useAgentStore.getState().loadAgents();

      expect(useAgentStore.getState().showSelector).toBe(true);
    });

    it('handles invalid JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('not-json');

      useAgentStore.getState().loadAgents();

      expect(useAgentStore.getState().agents).toEqual([]);
      expect(useAgentStore.getState().showSelector).toBe(true);
    });
  });

  describe('addAgent', () => {
    it('adds agent and saves to localStorage', () => {
      const agent = useAgentStore.getState().addAgent('Home Server', 'ws://home:9800');

      expect(agent.id).toBe('test-uuid-1234');
      expect(agent.name).toBe('Home Server');
      expect(agent.url).toBe('ws://home:9800');
      expect(useAgentStore.getState().agents).toHaveLength(1);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('vp:agents', expect.any(String));
    });
  });

  describe('removeAgent', () => {
    it('removes agent and updates localStorage', () => {
      useAgentStore.setState({
        agents: [{ id: 'a1', name: 'Home', url: 'ws://home:9800' }],
      });

      useAgentStore.getState().removeAgent('a1');

      expect(useAgentStore.getState().agents).toHaveLength(0);
    });

    it('clears selectedAgent if removed', () => {
      const agent = { id: 'a1', name: 'Home', url: 'ws://home:9800' };
      useAgentStore.setState({
        agents: [agent],
        selectedAgent: agent,
      });

      useAgentStore.getState().removeAgent('a1');

      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });
  });

  describe('selectAgent', () => {
    it('selects agent and closes selector', () => {
      const agent = { id: 'a1', name: 'Home', url: 'ws://home:9800' };
      useAgentStore.setState({
        agents: [agent],
        showSelector: true,
      });

      useAgentStore.getState().selectAgent('a1');

      expect(useAgentStore.getState().selectedAgent).toEqual(agent);
      expect(useAgentStore.getState().showSelector).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('vp:lastAgentId', 'a1');
    });

    it('does nothing for unknown agent id', () => {
      useAgentStore.getState().selectAgent('unknown');

      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });
  });

  describe('restoreLastAgent', () => {
    it('restores last selected agent from localStorage', () => {
      const agent = { id: 'a1', name: 'Home', url: 'ws://home:9800' };
      useAgentStore.setState({ agents: [agent] });
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'vp:lastAgentId') return 'a1';
        return null;
      });

      const result = useAgentStore.getState().restoreLastAgent();

      expect(result).toBe(true);
      expect(useAgentStore.getState().selectedAgent).toEqual(agent);
    });

    it('returns false when no last agent stored', () => {
      const result = useAgentStore.getState().restoreLastAgent();

      expect(result).toBe(false);
    });

    it('returns false when last agent not found in list', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'vp:lastAgentId') return 'nonexistent';
        return null;
      });

      const result = useAgentStore.getState().restoreLastAgent();

      expect(result).toBe(false);
    });
  });

  describe('openSelector / closeSelector', () => {
    it('toggles showSelector', () => {
      useAgentStore.getState().openSelector();
      expect(useAgentStore.getState().showSelector).toBe(true);

      useAgentStore.getState().closeSelector();
      expect(useAgentStore.getState().showSelector).toBe(false);
    });
  });
});
