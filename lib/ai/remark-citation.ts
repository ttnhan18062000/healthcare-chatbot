export function remarkCitation() {
  return (tree: any) => {
    function walk(node: any): any {
      if (node.type === "text") {
        const regex = /\[(\d+)\]/g;
        const value = node.value;
        const nodes = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(value)) !== null) {
          // Add text before match
          if (match.index > lastIndex) {
            nodes.push({
              type: "text",
              value: value.slice(lastIndex, match.index),
            });
          }

          // Add citation node
          nodes.push({
            type: "citation",
            data: {
              hName: "citation",
              hProperties: {
                id: match[1],
              },
            },
            children: [{ type: "text", value: match[0] }],
          });

          lastIndex = regex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < value.length) {
          nodes.push({
            type: "text",
            value: value.slice(lastIndex),
          });
        }

        if (nodes.length > 0) {
          return nodes;
        }
      }

      if (node.children) {
        const newChildren = [];
        for (const child of node.children) {
          const result = walk(child);
          if (Array.isArray(result)) {
            newChildren.push(...result);
          } else {
            newChildren.push(result);
          }
        }
        node.children = newChildren;
      }

      return node;
    }

    walk(tree);
  };
}
