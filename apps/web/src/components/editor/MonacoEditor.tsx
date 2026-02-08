'use client';

import { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore, type EditorTab } from '@/stores/editorStore';

interface MonacoEditorProps {
  tab: EditorTab;
}

export function MonacoEditor({ tab }: MonacoEditorProps) {
  const updateContent = useEditorStore((s) => s.updateContent);
  const saveFile = useEditorStore((s) => s.saveFile);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateContent(tab.id, value);
      }
    },
    [tab.id, updateContent]
  );

  const handleMount = useCallback(
    (editor: any) => {
      // Add Ctrl+S / Cmd+S keybinding
      editor.addCommand(
        // monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS
        2048 | 49, // CtrlCmd + S
        () => {
          saveFile(tab.id);
        }
      );
    },
    [tab.id, saveFile]
  );

  return (
    <div className="h-full" data-testid="monaco-editor">
      <Editor
        height="100%"
        theme="vs-dark"
        language={tab.language || 'plaintext'}
        value={tab.content}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          readOnly: tab.readonly,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
        }}
      />
    </div>
  );
}
