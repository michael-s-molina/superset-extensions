import React, { useReducer, useEffect } from "react";
import {
  Modal,
  Input,
  Button,
  List,
  Empty,
  Popconfirm,
  Typography,
  Space,
  Tooltip,
  message,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  EnterOutlined,
} from "@ant-design/icons";
import { useTheme } from "@apache-superset/core";
import {
  Snippet,
  SnippetsState,
  SnippetsAction,
} from "./types";
import { loadSnippets, saveSnippets, generateId } from "./storage";

const { TextArea } = Input;

const { Text } = Typography;

interface SnippetsModalProps {
  visible: boolean;
  onClose: () => void;
  onInsert: (sql: string) => void;
}

const initialState: SnippetsState = {
  snippets: [],
  editingSnippet: null,
  isFormVisible: false,
};

function snippetsReducer(
  state: SnippetsState,
  action: SnippetsAction
): SnippetsState {
  switch (action.type) {
    case "SET_SNIPPETS":
      return { ...state, snippets: action.payload };
    case "ADD_SNIPPET":
      return { ...state, snippets: [...state.snippets, action.payload] };
    case "UPDATE_SNIPPET":
      return {
        ...state,
        snippets: state.snippets.map((s) =>
          s.id === action.payload.id ? action.payload : s
        ),
      };
    case "DELETE_SNIPPET":
      return {
        ...state,
        snippets: state.snippets.filter((s) => s.id !== action.payload),
      };
    case "SET_EDITING_SNIPPET":
      return { ...state, editingSnippet: action.payload };
    case "SET_FORM_VISIBLE":
      return { ...state, isFormVisible: action.payload };
    default:
      return state;
  }
}

export const SnippetsModal: React.FC<SnippetsModalProps> = ({
  visible,
  onClose,
  onInsert,
}) => {
  const theme = useTheme();
  const [state, dispatch] = useReducer(snippetsReducer, initialState);
  const [snippetName, setSnippetName] = React.useState("");
  const [snippetSql, setSnippetSql] = React.useState("");

  // Load snippets on mount
  useEffect(() => {
    dispatch({ type: "SET_SNIPPETS", payload: loadSnippets() });
  }, []);

  // Save snippets whenever they change
  useEffect(() => {
    if (state.snippets.length > 0 || localStorage.getItem("sqllab_snippets")) {
      saveSnippets(state.snippets);
    }
  }, [state.snippets]);

  // Reset form when editing snippet changes
  useEffect(() => {
    if (state.isFormVisible) {
      setSnippetSql(state.editingSnippet?.sql || "");
    }
  }, [state.isFormVisible, state.editingSnippet]);

  const handleCreateNew = () => {
    dispatch({ type: "SET_EDITING_SNIPPET", payload: null });
    dispatch({ type: "SET_FORM_VISIBLE", payload: true });
    setSnippetName("");
  };

  const handleEdit = (snippet: Snippet) => {
    dispatch({ type: "SET_EDITING_SNIPPET", payload: snippet });
    dispatch({ type: "SET_FORM_VISIBLE", payload: true });
    setSnippetName(snippet.name);
  };

  const handleDelete = (id: string) => {
    dispatch({ type: "DELETE_SNIPPET", payload: id });
    message.success("Snippet deleted");
  };

  const handleFormSubmit = () => {
    const sql = snippetSql.trim();
    const name = snippetName.trim();

    if (!name) {
      message.error("Please enter a snippet name");
      return;
    }

    if (!sql) {
      message.error("Please enter SQL code");
      return;
    }

    const now = Date.now();

    if (state.editingSnippet) {
      const updatedSnippet: Snippet = {
        ...state.editingSnippet,
        name,
        sql,
        updatedAt: now,
      };
      dispatch({ type: "UPDATE_SNIPPET", payload: updatedSnippet });
      message.success("Snippet updated");
    } else {
      const newSnippet: Snippet = {
        id: generateId(),
        name,
        sql,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: "ADD_SNIPPET", payload: newSnippet });
      message.success("Snippet created");
    }

    dispatch({ type: "SET_FORM_VISIBLE", payload: false });
    dispatch({ type: "SET_EDITING_SNIPPET", payload: null });
  };

  const handleFormCancel = () => {
    dispatch({ type: "SET_FORM_VISIBLE", payload: false });
    dispatch({ type: "SET_EDITING_SNIPPET", payload: null });
  };

  const handleInsert = (snippet: Snippet) => {
    onInsert(snippet.sql);
    onClose();
    message.success(`Inserted "${snippet.name}"`);
  };

  const handleCopyToClipboard = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.sql);
      message.success("Copied to clipboard");
    } catch {
      message.error("Failed to copy to clipboard");
    }
  };

  return (
    <Modal
      title="SQL Snippets"
      open={visible}
      onCancel={onClose}
      width={600}
      footer={null}
      destroyOnHidden
      styles={{ body: { paddingTop: theme.paddingSM } }}
    >
      {state.isFormVisible ? (
        <div>
          <div style={{ marginBottom: theme.marginSM }}>
            <Text
              strong
              style={{ display: "block", marginBottom: theme.marginXS }}
            >
              Name
            </Text>
            <Input
              placeholder="Snippet name"
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: theme.marginSM }}>
            <Text
              strong
              style={{ display: "block", marginBottom: theme.marginXS }}
            >
              SQL
            </Text>
            <TextArea
              value={snippetSql}
              onChange={(e) => setSnippetSql(e.target.value)}
              placeholder="Enter SQL code..."
              rows={8}
              style={{
                fontFamily: theme.fontFamilyCode,
                fontSize: theme.fontSizeSM,
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Space>
              <Button onClick={handleFormCancel}>Cancel</Button>
              <Button type="primary" onClick={handleFormSubmit}>
                {state.editingSnippet ? "Update" : "Save"}
              </Button>
            </Space>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {state.snippets.length === 0 ? (
              <Empty
                description="No snippets yet"
                style={{ padding: "40px 0" }}
              />
            ) : (
              <List
                dataSource={state.snippets}
                renderItem={(snippet) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: `${theme.paddingSM}px 0`,
                      borderBottom: `1px solid ${theme.colorBorderSecondary}`,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        marginRight: theme.marginSM,
                      }}
                    >
                      <Text strong>{snippet.name}</Text>
                      <div
                        style={{
                          fontSize: theme.fontSizeSM,
                          fontFamily: theme.fontFamilyCode,
                          color: theme.colorTextSecondary,
                          marginTop: 2,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          lineHeight: "1.4em",
                          maxHeight: "4.2em",
                        }}
                      >
                        {snippet.sql}
                      </div>
                    </div>
                    <Space size={4}>
                      <Tooltip title="Insert">
                        <Button
                          type="text"
                          size="small"
                          icon={<EnterOutlined />}
                          onClick={() => handleInsert(snippet)}
                        />
                      </Tooltip>
                      <Tooltip title="Copy">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyToClipboard(snippet)}
                        />
                      </Tooltip>
                      <Tooltip title="Edit">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEdit(snippet)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="Delete this snippet?"
                        onConfirm={() => handleDelete(snippet.id)}
                        okText="Delete"
                        cancelText="Cancel"
                      >
                        <Tooltip title="Delete">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  </div>
                )}
              />
            )}
          </div>
          <div
            style={{
              padding: `${theme.paddingSM}px ${theme.paddingLG}px`,
              borderTop: `1px solid ${theme.colorBorderSecondary}`,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Tooltip title="New Snippet">
              <Button
                type="text"
                icon={<PlusOutlined />}
                onClick={handleCreateNew}
              />
            </Tooltip>
          </div>
        </div>
      )}
    </Modal>
  );
};
