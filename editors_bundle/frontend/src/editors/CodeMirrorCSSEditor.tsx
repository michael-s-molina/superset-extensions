import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import CodeMirror, { ReactCodeMirrorRef, ViewUpdate } from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { EditorView } from '@codemirror/view';
import { type editors, isThemeDark } from '@apache-superset/core';

type EditorProps = editors.EditorProps;
type EditorHandle = editors.EditorHandle;
type Position = editors.Position;
type Selection = editors.Selection;
type Range = editors.Range;
type EditorAnnotation = editors.EditorAnnotation;

const CodeMirrorCSSEditor = forwardRef<EditorHandle, EditorProps>(
  (
    {
      id,
      value,
      onChange,
      onBlur,
      onCursorPositionChange,
      readOnly,
      tabSize,
      lineNumbers,
      theme,
      height = '100%',
      width = '100%',
    },
    ref,
  ) => {
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    // Helper to get EditorView
    const getView = () => editorRef.current?.view;

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        focus: () => getView()?.focus(),
        getValue: () => getView()?.state.doc.toString() ?? '',
        setValue: (val: string) => {
          const view = getView();
          if (view) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: val },
            });
          }
        },
        getCursorPosition: (): Position => {
          const view = getView();
          if (!view) return { line: 0, column: 0 };
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          return { line: line.number - 1, column: pos - line.from };
        },
        moveCursorToPosition: (pos: Position) => {
          const view = getView();
          if (view) {
            const line = view.state.doc.line(pos.line + 1);
            const offset = line.from + pos.column;
            view.dispatch({ selection: { anchor: offset } });
          }
        },
        getSelections: (): Selection[] => {
          const view = getView();
          if (!view) return [];
          return view.state.selection.ranges.map(range => {
            const startLine = view.state.doc.lineAt(range.from);
            const endLine = view.state.doc.lineAt(range.to);
            return {
              start: { line: startLine.number - 1, column: range.from - startLine.from },
              end: { line: endLine.number - 1, column: range.to - endLine.from },
            };
          });
        },
        setSelection: (sel: Range) => {
          const view = getView();
          if (view) {
            const startLine = view.state.doc.line(sel.start.line + 1);
            const endLine = view.state.doc.line(sel.end.line + 1);
            const from = startLine.from + sel.start.column;
            const to = endLine.from + sel.end.column;
            view.dispatch({ selection: { anchor: from, head: to } });
          }
        },
        getSelectedText: () => {
          const view = getView();
          if (!view) return '';
          const { from, to } = view.state.selection.main;
          return view.state.sliceDoc(from, to);
        },
        insertText: (text: string) => {
          const view = getView();
          if (view) {
            const { from, to } = view.state.selection.main;
            view.dispatch({ changes: { from, to, insert: text } });
          }
        },
        executeCommand: () => {
          // CodeMirror commands are handled differently
        },
        scrollToLine: (line: number) => {
          const view = getView() as EditorView | undefined;
          if (view) {
            const lineInfo = view.state.doc.line(line + 1);
            view.dispatch({
              effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
            });
          }
        },
        setAnnotations: (_anns: EditorAnnotation[]) => {
          // CodeMirror uses a different diagnostics system
        },
        clearAnnotations: () => {
          // Clear diagnostics
        },
        registerCompletionProvider: () => {
          // Would need @codemirror/autocomplete integration
          return { dispose: () => {} };
        },
      }),
      [],
    );

    const handleChange = useCallback(
      (val: string) => {
        onChange(val);
      },
      [onChange],
    );

    const handleBlur = useCallback(() => {
      if (onBlur) {
        const view = getView();
        onBlur(view?.state.doc.toString() ?? '');
      }
    }, [onBlur]);

    const handleUpdate = useCallback(
      (viewUpdate: ViewUpdate) => {
        if (viewUpdate.selectionSet && onCursorPositionChange) {
          const pos = viewUpdate.view.state.selection.main.head;
          const line = viewUpdate.view.state.doc.lineAt(pos);
          onCursorPositionChange({
            line: line.number - 1,
            column: pos - line.from,
          });
        }
      },
      [onCursorPositionChange],
    );

    // Determine dark mode from theme object
    const isDark = theme ? isThemeDark(theme) : false;
    const cmTheme = isDark ? 'dark' : 'light';

    return (
      <CodeMirror
        ref={editorRef}
        value={value}
        height={height}
        width={width}
        theme={cmTheme}
        extensions={[css()]}
        onChange={handleChange}
        onBlur={handleBlur}
        onUpdate={handleUpdate}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: lineNumbers !== false,
          tabSize: tabSize ?? 2,
        }}
        style={{
          fontSize: theme?.fontSizeSM ?? 14,
          fontFamily: theme?.fontFamilyCode ?? 'monospace',
        }}
      />
    );
  },
);

CodeMirrorCSSEditor.displayName = 'CodeMirrorCSSEditor';

export default CodeMirrorCSSEditor;
