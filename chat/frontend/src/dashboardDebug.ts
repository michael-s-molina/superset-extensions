import { dashboard } from "@apache-superset/core";

interface SerializedNode {
  id: string;
  type: string;
  layout?: unknown;
  props?: unknown;
  style?: unknown;
  children?: (SerializedNode | null)[];
}

function serializeNode(id: string): SerializedNode | null {
  const node = dashboard.getNode(id);
  if (!node) return null;

  const serialized: SerializedNode = { id, type: node.type };
  if (node.layout) serialized.layout = node.layout;
  if (node.props) serialized.props = node.props;
  if (node.style) serialized.style = node.style;
  if (node.children) {
    serialized.children = node.children.map(serializeNode);
  }
  return serialized;
}

/**
 * Serializes the entire dashboard node tree, starting from the root, as
 * pretty-printed JSON — for pasting into a bug report when the AI or a
 * manual drag/resize produces something wrong (overlapping widgets, a
 * container dragging along with its children, etc.), since the tree
 * itself isn't visible anywhere in the UI otherwise.
 */
export function serializeDashboardConfig(): string {
  const root = dashboard.getRoot();
  return JSON.stringify(serializeNode(root.id), null, 2);
}
