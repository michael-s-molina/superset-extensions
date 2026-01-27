import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import Editor, { OnMount, OnChange, Monaco } from '@monaco-editor/react';
import type { editor, IPosition } from 'monaco-editor';
import { type editors, isThemeDark } from '@apache-superset/core';

type EditorProps = editors.EditorProps;
type EditorHandle = editors.EditorHandle;
type Position = editors.Position;
type Selection = editors.Selection;
type Range = editors.Range;
type EditorAnnotation = editors.EditorAnnotation;
type CompletionProvider = editors.CompletionProvider;
type CompletionItem = editors.CompletionItem;
type EditorHotkey = editors.EditorHotkey;

const MonacoSQLEditor = forwardRef<EditorHandle, EditorProps>(
  (
    {
      id,
      value,
      onChange,
      onBlur,
      onCursorPositionChange,
      onSelectionChange,
      readOnly,
      tabSize,
      lineNumbers,
      wordWrap,
      theme,
      annotations,
      hotkeys,
      height = '100%',
      width = '100%',
    },
    ref,
  ) => {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    // Track mounted state to prevent onBlur during unmount
    const mountedRef = useRef(false);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorRef.current?.focus(),
        getValue: () => editorRef.current?.getValue() ?? '',
        setValue: (val: string) => editorRef.current?.setValue(val),
        getCursorPosition: (): Position => {
          const pos = editorRef.current?.getPosition();
          return { line: (pos?.lineNumber ?? 1) - 1, column: (pos?.column ?? 1) - 1 };
        },
        moveCursorToPosition: (pos: Position) => {
          editorRef.current?.setPosition({
            lineNumber: pos.line + 1,
            column: pos.column + 1,
          });
        },
        getSelections: (): Selection[] => {
          const selections = editorRef.current?.getSelections() ?? [];
          return selections.map(sel => ({
            start: { line: sel.startLineNumber - 1, column: sel.startColumn - 1 },
            end: { line: sel.endLineNumber - 1, column: sel.endColumn - 1 },
          }));
        },
        setSelection: (sel: Range) => {
          editorRef.current?.setSelection({
            startLineNumber: sel.start.line + 1,
            startColumn: sel.start.column + 1,
            endLineNumber: sel.end.line + 1,
            endColumn: sel.end.column + 1,
          });
        },
        getSelectedText: () => {
          const selection = editorRef.current?.getSelection();
          if (!selection) return '';
          return editorRef.current?.getModel()?.getValueInRange(selection) ?? '';
        },
        insertText: (text: string) => {
          const selection = editorRef.current?.getSelection();
          if (selection) {
            editorRef.current?.executeEdits('', [
              { range: selection, text, forceMoveMarkers: true },
            ]);
          }
        },
        executeCommand: (commandName: string) => {
          editorRef.current?.trigger('', commandName, null);
        },
        scrollToLine: (line: number) => {
          editorRef.current?.revealLineInCenter(line + 1);
        },
        setAnnotations: (anns: EditorAnnotation[]) => {
          const monaco = monacoRef.current;
          const model = editorRef.current?.getModel();
          if (monaco && model) {
            const markers = anns.map((ann: EditorAnnotation) => ({
              startLineNumber: ann.line + 1,
              startColumn: (ann.column ?? 0) + 1,
              endLineNumber: ann.line + 1,
              endColumn: (ann.column ?? 0) + 100,
              message: ann.message,
              severity:
                ann.severity === 'error'
                  ? monaco.MarkerSeverity.Error
                  : ann.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            }));
            monaco.editor.setModelMarkers(model, 'superset', markers);
          }
        },
        clearAnnotations: () => {
          const monaco = monacoRef.current;
          const model = editorRef.current?.getModel();
          if (monaco && model) {
            monaco.editor.setModelMarkers(model, 'superset', []);
          }
        },
        registerCompletionProvider: (provider: CompletionProvider) => {
          const monaco = monacoRef.current;
          if (!monaco) return { dispose: () => {} };

          const disposable = monaco.languages.registerCompletionItemProvider('sql', {
            triggerCharacters: provider.triggerCharacters,
            provideCompletionItems: async (model: editor.ITextModel, position: IPosition) => {
              const content = model.getValue();
              const pos: Position = {
                line: position.lineNumber - 1,
                column: position.column - 1,
              };
              const items = await provider.provideCompletions(content, pos, {
                triggerKind: 'automatic',
                language: 'sql',
              });
              return {
                suggestions: items.map((item: CompletionItem) => ({
                  label: item.label,
                  insertText: item.insertText,
                  kind: monaco.languages.CompletionItemKind.Text,
                  documentation: item.documentation,
                  detail: item.detail,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                })),
              };
            },
          });

          return { dispose: () => disposable.dispose() };
        },
      }),
      [],
    );

    const handleMount: OnMount = useCallback(
      (editorInstance, monaco) => {
        editorRef.current = editorInstance;
        monacoRef.current = monaco;

        // Register hotkeys
        if (hotkeys) {
          hotkeys.forEach((hotkey: EditorHotkey) => {
            const keybinding = parseKeybinding(hotkey.key, monaco);
            if (keybinding) {
              editorInstance.addAction({
                id: hotkey.name,
                label: hotkey.description ?? hotkey.name,
                keybindings: [keybinding],
                run: () => {
                  // Create a minimal handle for the hotkey callback
                  const handle: EditorHandle = {
                    focus: () => editorInstance.focus(),
                    getValue: () => editorInstance.getValue(),
                    setValue: (val: string) => editorInstance.setValue(val),
                    getCursorPosition: () => {
                      const pos = editorInstance.getPosition();
                      return { line: (pos?.lineNumber ?? 1) - 1, column: (pos?.column ?? 1) - 1 };
                    },
                    moveCursorToPosition: (pos: Position) => {
                      editorInstance.setPosition({ lineNumber: pos.line + 1, column: pos.column + 1 });
                    },
                    getSelections: () => [],
                    setSelection: () => {},
                    getSelectedText: () => {
                      const sel = editorInstance.getSelection();
                      if (!sel) return '';
                      return editorInstance.getModel()?.getValueInRange(sel) ?? '';
                    },
                    insertText: (text: string) => {
                      const sel = editorInstance.getSelection();
                      if (sel) {
                        editorInstance.executeEdits('', [{ range: sel, text, forceMoveMarkers: true }]);
                      }
                    },
                    executeCommand: (cmd: string) => editorInstance.trigger('', cmd, null),
                    scrollToLine: (line: number) => editorInstance.revealLineInCenter(line + 1),
                    setAnnotations: () => {},
                    clearAnnotations: () => {},
                    registerCompletionProvider: () => ({ dispose: () => {} }),
                  };
                  hotkey.exec(handle);
                },
              });
            }
          });
        }

        // Set initial annotations
        if (annotations) {
          const model = editorInstance.getModel();
          if (model) {
            const markers = annotations.map((ann: EditorAnnotation) => ({
              startLineNumber: ann.line + 1,
              startColumn: (ann.column ?? 0) + 1,
              endLineNumber: ann.line + 1,
              endColumn: (ann.column ?? 0) + 100,
              message: ann.message,
              severity:
                ann.severity === 'error'
                  ? monaco.MarkerSeverity.Error
                  : ann.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            }));
            monaco.editor.setModelMarkers(model, 'superset', markers);
          }
        }

        // Cursor position change listener
        editorInstance.onDidChangeCursorPosition(e => {
          if (onCursorPositionChange) {
            onCursorPositionChange({
              line: e.position.lineNumber - 1,
              column: e.position.column - 1,
            });
          }
        });

        // Selection change listener
        editorInstance.onDidChangeCursorSelection(e => {
          if (onSelectionChange) {
            onSelectionChange([
              {
                start: {
                  line: e.selection.startLineNumber - 1,
                  column: e.selection.startColumn - 1,
                },
                end: {
                  line: e.selection.endLineNumber - 1,
                  column: e.selection.endColumn - 1,
                },
              },
            ]);
          }
        });

        // Blur listener - guard against blur during unmount which sends empty value
        editorInstance.onDidBlurEditorText(() => {
          if (onBlur && mountedRef.current) {
            onBlur(editorInstance.getValue());
          }
        });
      },
      [annotations, hotkeys, onBlur, onCursorPositionChange, onSelectionChange],
    );

    const handleChange: OnChange = useCallback(
      (val: string | undefined) => {
        onChange(val ?? '');
      },
      [onChange],
    );

    // Determine dark mode from theme object
    const isDark = theme ? isThemeDark(theme) : false;
    const monacoTheme = isDark ? 'vs-dark' : 'vs';

    return (
      <Editor
        path={id}
        height={height}
        width={width}
        language="sql"
        theme={monacoTheme}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          readOnly,
          tabSize: tabSize ?? 2,
          lineNumbers: lineNumbers !== false ? 'on' : 'off',
          wordWrap: wordWrap ? 'on' : 'off',
          fontSize: theme?.fontSizeSM ?? 14,
          fontFamily: theme?.fontFamilyCode,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    );
  },
);

// Helper to parse key bindings like "Ctrl+Enter" to Monaco keybindings
function parseKeybinding(
  key: string,
  monaco: Monaco,
): number | undefined {
  const parts = key.split('+').map(p => p.trim().toLowerCase());
  let modifiers = 0;
  let keyCode: number | undefined;

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        modifiers |= monaco.KeyMod.CtrlCmd;
        break;
      case 'shift':
        modifiers |= monaco.KeyMod.Shift;
        break;
      case 'alt':
        modifiers |= monaco.KeyMod.Alt;
        break;
      case 'meta':
      case 'cmd':
        modifiers |= monaco.KeyMod.CtrlCmd;
        break;
      case 'enter':
        keyCode = monaco.KeyCode.Enter;
        break;
      case 'escape':
      case 'esc':
        keyCode = monaco.KeyCode.Escape;
        break;
      default:
        if (part.length === 1) {
          const code = `Key${part.toUpperCase()}` as keyof typeof monaco.KeyCode;
          keyCode = monaco.KeyCode[code];
        }
    }
  }

  if (keyCode !== undefined) {
    return modifiers | keyCode;
  }
  return undefined;
}

MonacoSQLEditor.displayName = 'MonacoSQLEditor';

export default MonacoSQLEditor;
