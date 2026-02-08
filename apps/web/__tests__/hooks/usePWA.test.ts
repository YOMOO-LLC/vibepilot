import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePWA } from '@/hooks/usePWA';

describe('usePWA', () => {
  let originalNavigator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.serviceWorker
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        serviceWorker: {
          register: vi.fn().mockResolvedValue({}),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    }
  });

  it('initial state has isInstallable = false', () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.isInstallable).toBe(false);
  });

  it('registers service worker on mount', async () => {
    renderHook(() => usePWA());

    // Wait for useEffect
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    });
  });

  it('sets isInstallable to true on beforeinstallprompt event', async () => {
    const { result } = renderHook(() => usePWA());

    // Simulate beforeinstallprompt event
    const mockEvent = new Event('beforeinstallprompt');
    Object.defineProperty(mockEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(mockEvent, 'prompt', { value: vi.fn().mockResolvedValue({}) });

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.isInstallable).toBe(true);
  });

  it('install calls prompt on deferred event', async () => {
    const { result } = renderHook(() => usePWA());

    // Simulate beforeinstallprompt event
    const mockPrompt = vi.fn().mockResolvedValue({ outcome: 'accepted' });
    const mockEvent = new Event('beforeinstallprompt');
    Object.defineProperty(mockEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(mockEvent, 'prompt', { value: mockPrompt });

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    await act(async () => {
      await result.current.install();
    });

    expect(mockPrompt).toHaveBeenCalled();
  });

  it('install does nothing when no deferred event', async () => {
    const { result } = renderHook(() => usePWA());

    // Should not throw
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.isInstallable).toBe(false);
  });
});
