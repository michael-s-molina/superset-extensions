import React, { useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import SimpleMDE from 'react-simplemde-editor';
import type EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import { type editors, isThemeDark } from '@apache-superset/core';

type EditorProps = editors.EditorProps;
type EditorHandle = editors.EditorHandle;
type Position = editors.Position;
type Selection = editors.Selection;
type Range = editors.Range;
type EditorAnnotation = editors.EditorAnnotation;

const SimpleMDEEditor = forwardRef<EditorHandle, EditorProps>(
  (
    {
      id,
      value,
      onChange,
      onBlur,
      readOnly,
      theme,
      height = '400px',
    },
    ref,
  ) => {
    const editorInstanceRef = useRef<EasyMDE | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    // Get CodeMirror instance from EasyMDE
    const getCodemirror = () => editorInstanceRef.current?.codemirror;

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        focus: () => getCodemirror()?.focus(),
        getValue: () => editorInstanceRef.current?.value() ?? valueRef.current,
        setValue: (val: string) => {
          editorInstanceRef.current?.value(val);
        },
        getCursorPosition: (): Position => {
          const cm = getCodemirror();
          if (!cm) return { line: 0, column: 0 };
          const cursor = cm.getCursor();
          return { line: cursor.line, column: cursor.ch };
        },
        moveCursorToPosition: (pos: Position) => {
          const cm = getCodemirror();
          if (cm) {
            cm.setCursor({ line: pos.line, ch: pos.column });
          }
        },
        getSelections: (): Selection[] => {
          const cm = getCodemirror();
          if (!cm) return [];
          const selections = cm.listSelections();
          return selections.map(sel => ({
            start: { line: sel.anchor.line, column: sel.anchor.ch },
            end: { line: sel.head.line, column: sel.head.ch },
          }));
        },
        setSelection: (sel: Range) => {
          const cm = getCodemirror();
          if (cm) {
            cm.setSelection(
              { line: sel.start.line, ch: sel.start.column },
              { line: sel.end.line, ch: sel.end.column },
            );
          }
        },
        getSelectedText: () => {
          const cm = getCodemirror();
          return cm?.getSelection() ?? '';
        },
        insertText: (text: string) => {
          const cm = getCodemirror();
          if (cm) {
            cm.replaceSelection(text);
          }
        },
        executeCommand: () => {
          // EasyMDE commands are handled through toolbar buttons
        },
        scrollToLine: (line: number) => {
          const cm = getCodemirror();
          if (cm) {
            cm.scrollIntoView({ line, ch: 0 }, 100);
          }
        },
        setAnnotations: (_anns: EditorAnnotation[]) => {
          // EasyMDE doesn't have built-in annotation support
        },
        clearAnnotations: () => {},
        registerCompletionProvider: () => ({ dispose: () => {} }),
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
        onBlur(editorInstanceRef.current?.value() ?? valueRef.current);
      }
    }, [onBlur]);

    // Get the editor instance when it's ready
    const getMdeInstanceCallback = useCallback((instance: EasyMDE) => {
      editorInstanceRef.current = instance;

      // Set up blur listener
      const cm = instance.codemirror;
      cm.on('blur', handleBlur);
    }, [handleBlur]);

    // Calculate numeric height
    const numericHeight = useMemo(() => {
      if (typeof height === 'string' && height.endsWith('px')) {
        return parseInt(height, 10);
      }
      return 400;
    }, [height]);

    // Determine dark mode from theme
    const isDark = theme ? isThemeDark(theme) : false;

    // EasyMDE options
    const options = useMemo(
      (): EasyMDE.Options => ({
        autofocus: false,
        spellChecker: false,
        status: false,
        toolbar: readOnly ? false : [
          'bold',
          'italic',
          'heading',
          '|',
          'quote',
          'unordered-list',
          'ordered-list',
          '|',
          'link',
          'image',
          '|',
          'preview',
          'side-by-side',
          'fullscreen',
          '|',
          'guide',
        ],
        minHeight: `${numericHeight - 50}px`,
        maxHeight: `${numericHeight - 50}px`,
        previewClass: isDark ? ['editor-preview', 'dark-mode'] : ['editor-preview'],
      }),
      [readOnly, numericHeight, isDark],
    );

    return (
      <div
        id={id}
        className={isDark ? 'simplemde-dark' : 'simplemde-light'}
        style={{
          fontSize: theme?.fontSizeSM ?? 14,
          fontFamily: theme?.fontFamilyCode,
        }}
      >
        <SimpleMDE
          value={value}
          onChange={handleChange}
          getMdeInstance={getMdeInstanceCallback}
          options={options}
        />
        {isDark && (
          <style>{`
            .simplemde-dark .EasyMDEContainer .CodeMirror {
              background-color: #1e1e1e;
              color: #d4d4d4;
              border-color: #3c3c3c;
            }
            .simplemde-dark .EasyMDEContainer .editor-toolbar {
              background-color: #252526;
              border-color: #3c3c3c;
            }
            .simplemde-dark .EasyMDEContainer .editor-toolbar button {
              color: #d4d4d4 !important;
            }
            .simplemde-dark .EasyMDEContainer .editor-toolbar button:hover {
              background-color: #3c3c3c;
            }
            .simplemde-dark .EasyMDEContainer .editor-preview {
              background-color: #1e1e1e;
              color: #d4d4d4;
            }
            .simplemde-dark .EasyMDEContainer .editor-preview-side {
              background-color: #1e1e1e;
              color: #d4d4d4;
              border-color: #3c3c3c;
            }
          `}</style>
        )}
      </div>
    );
  },
);

SimpleMDEEditor.displayName = 'SimpleMDEEditor';

export default SimpleMDEEditor;
