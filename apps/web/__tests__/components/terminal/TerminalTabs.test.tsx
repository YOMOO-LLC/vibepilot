import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TerminalTabs } from '@/components/terminal/TerminalTabs';
import { useTerminalStore } from '@/stores/terminalStore';

describe('TerminalTabs', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [
        { id: 'tab-1', title: 'Terminal 1', sessionId: 'tab-1' },
        { id: 'tab-2', title: 'Terminal 2', sessionId: 'tab-2' },
      ],
      activeTabId: 'tab-1',
      layout: 'single',
      counter: 2,
    });
  });

  it('renders all tabs', () => {
    const { getByText } = render(<TerminalTabs />);

    expect(getByText('Terminal 1')).toBeDefined();
    expect(getByText('Terminal 2')).toBeDefined();
  });

  it('renders new tab button', () => {
    const { getByTestId } = render(<TerminalTabs />);

    expect(getByTestId('new-tab-button')).toBeDefined();
  });

  it('clicking tab switches active', () => {
    const { getByTestId } = render(<TerminalTabs />);

    fireEvent.click(getByTestId('tab-tab-2'));

    expect(useTerminalStore.getState().activeTabId).toBe('tab-2');
  });

  it('clicking close button removes tab', () => {
    const { getByTestId } = render(<TerminalTabs />);

    fireEvent.click(getByTestId('close-tab-tab-2'));

    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(useTerminalStore.getState().tabs[0].id).toBe('tab-1');
  });

  it('clicking + creates new tab', () => {
    const { getByTestId } = render(<TerminalTabs />);

    fireEvent.click(getByTestId('new-tab-button'));

    expect(useTerminalStore.getState().tabs).toHaveLength(3);
  });
});
