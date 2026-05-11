// Mark the first paragraph as an introduction by adding a class
// Works for both .md and .mdx; ignores frontmatter and ESM/import nodes.

export default function firstParagraphIntro() {
  return function transformer(tree, file) {
    const filePath = (file && (file.path || (file.history && file.history[0]))) || '';
    const isBlog = /\bsrc[\/\\]content[\/\\]blog[\/\\]/.test(filePath);
    if (!isBlog) return; // only act on blog content
    if (!tree || !Array.isArray(tree.children)) return;
    for (const node of tree.children) {
      // Skip non-content nodes (imports, export, jsx wrappers, etc.)
      if (
        node.type === 'mdxjsEsm' ||
        node.type === 'mdxFlowExpression' ||
        node.type === 'mdxJsxFlowElement'
      ) {
        continue;
      }
      if (node.type === 'paragraph') {
        node.data = node.data || {};
        node.data.hProperties = Object.assign({}, node.data.hProperties, { class: 'intro' });
        break;
      }
    }
  };
}
