// Obsidian-style embeds to MDX imports
// Syntax: ![[filename.png]] or ![[filename.png|40%]]
// Uses frontmatter `assetsDir` and imports from `~/assets/blog/<assetsDir>/<filename>`

export default function obsidianEmbeds() {
  return function transformer(tree, file) {
    const filePath = (file && (file.path || (file.history && file.history[0]))) || '';
    const isMdx = /\.mdx$/i.test(filePath);
    const isBlog = /\bsrc[\/\\]content[\/\\]blog[\/\\]/.test(filePath);
    if (!isBlog) return; // limit to blog content only
    const fm = (file && file.data && file.data.astro && file.data.astro.frontmatter) || {};
    const fileBase = filePath.split(/[/\\]/).pop() || '';
    const defaultAssetsDir = fileBase.replace(/\.(md|mdx)$/i, '');
    const assetsDir = (fm.assetsDir || defaultAssetsDir || '').toString().trim();

    // Note: This plugin injects MDX nodes; use with .mdx files
    const pattern = /!\[\[([^|\]]+?)(?:\|([0-9]{1,3})%)?\]\]/g;

    let importIndex = 0;
    const importMap = new Map();
    const importNodes = [];
    let importedYouTube = false;

    function getVarFor(filenameRaw) {
      const filename = filenameRaw.trim();
      if (importMap.has(filename)) return importMap.get(filename);
      const varName = `__img${importIndex++}`;
      // Build import path under src using the '~/assets' alias root.
      // - If assetsDir starts with '~/', use as-is.
      // - Else, import from `~/assets/${assetsDir}/${filename}` (or just `~/assets/${filename}` if empty).
      let importPath;
      if (assetsDir.startsWith('~/')) {
        importPath = `${assetsDir.replace(/\/$/, '')}/${filename}`;
      } else if (assetsDir.includes('/')) {
        importPath = `~/assets/${assetsDir}/${filename}`;
      } else if (assetsDir) {
        importPath = `~/assets/blog/${assetsDir}/${filename}`;
      } else {
        importPath = `~/assets/blog/${filename}`;
      }
      importNodes.push({
        type: 'mdxjsEsm',
        value: `import ${varName} from '${importPath.replace(/'/g, "\\'")}';`,
        data: {
          estree: {
            type: 'Program',
            sourceType: 'module',
            body: [
              {
                type: 'ImportDeclaration',
                source: {
                  type: 'Literal',
                  value: importPath,
                  raw: `'${importPath.replace(/'/g, "\\'")}'`,
                },
                specifiers: [
                  {
                    type: 'ImportDefaultSpecifier',
                    local: { type: 'Identifier', name: varName },
                  },
                ],
              },
            ],
          },
        },
      });
      importMap.set(filename, varName);
      return varName;
    }

    function toMdxFigureNode(filenameRaw, widthPct) {
      const filename = filenameRaw.trim();
      const varName = getVarFor(filename);
      const figure = {
        type: 'mdxJsxFlowElement',
        name: 'figure',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'className', value: 'blog-embed' },
        ],
        children: [
          {
            type: 'mdxJsxFlowElement',
            name: 'img',
            attributes: [
              {
                type: 'mdxJsxAttribute',
                name: 'src',
                value: {
                  type: 'mdxJsxAttributeValueExpression',
                  value: `${varName}.src`,
                  data: {
                    estree: {
                      type: 'Program',
                      sourceType: 'module',
                      body: [
                        {
                          type: 'ExpressionStatement',
                          expression: {
                            type: 'MemberExpression',
                            object: { type: 'Identifier', name: varName },
                            property: { type: 'Identifier', name: 'src' },
                            computed: false,
                            optional: false,
                          },
                        },
                      ],
                    },
                  },
                },
              },
              { type: 'mdxJsxAttribute', name: 'alt', value: filename },
            ],
            children: [],
          },
        ],
      };
      if (widthPct) {
        figure.attributes.push({
          type: 'mdxJsxAttribute',
          name: 'style',
          value: `width:${widthPct}%;`,
        });
      }
      return figure;
    }

    function isUrl(s) {
      return /^https?:\/\//i.test(s.trim());
    }

    function youtubeIdFromUrl(url) {
      try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) {
          // e.g., https://youtu.be/VIDEOID
          return u.pathname.replace(/^\//, '') || null;
        }
        if (u.hostname.includes('youtube.com')) {
          if (u.pathname.startsWith('/watch')) {
            return u.searchParams.get('v');
          }
          if (u.pathname.startsWith('/embed/')) {
            return u.pathname.split('/').pop();
          }
        }
      } catch (e) {}
      return null;
    }

    function ensureYouTubeImport() {
      if (importedYouTube) return;
      importedYouTube = true;
      const importPath = "~/components/YouTube.astro";
      importNodes.push({
        type: 'mdxjsEsm',
        value: `import YouTube from '${importPath}';`,
        data: {
          estree: {
            type: 'Program',
            sourceType: 'module',
            body: [
              {
                type: 'ImportDeclaration',
                source: { type: 'Literal', value: importPath, raw: `'${importPath}'` },
                specifiers: [
                  { type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: 'YouTube' } },
                ],
              },
            ],
          },
        },
      });
    }

    function toMdxYouTubeNode(urlRaw, widthPct) {
      ensureYouTubeImport();
      const id = youtubeIdFromUrl(urlRaw.trim());
      if (!id) return { type: 'text', value: urlRaw };
      const attrs = [
        { type: 'mdxJsxAttribute', name: 'id', value: id },
      ];
      if (widthPct) attrs.push({ type: 'mdxJsxAttribute', name: 'width', value: `${widthPct}%` });
      return {
        type: 'mdxJsxFlowElement',
        name: 'YouTube',
        attributes: attrs,
        children: [],
      };
    }

    // Transform paragraphs that contain embeds:
    if (Array.isArray(tree.children)) {
      for (let i = 0; i < tree.children.length; i++) {
        const node = tree.children[i];
        if (!node || node.type !== 'paragraph' || !Array.isArray(node.children)) continue;

        let found = false;
        const replacementNodes = [];
        let currentParaChildren = [];

        function flushPara() {
          if (currentParaChildren.length) {
            replacementNodes.push({ type: 'paragraph', children: currentParaChildren });
            currentParaChildren = [];
          }
        }

        const ch = node.children;
        let k = 0;
        while (k < ch.length) {
          const child = ch[k];
          if (child.type === 'text' && typeof child.value === 'string') {
            const value = child.value;
            pattern.lastIndex = 0;
            let lastIndex = 0;
            let match;
            while ((match = pattern.exec(value)) !== null) {
              found = true;
              const [full, target, width] = match;
              const start = match.index;
              if (start > lastIndex) {
                currentParaChildren.push({ type: 'text', value: value.slice(lastIndex, start) });
              }
              flushPara();
              const widthPct = width ? parseInt(width, 10) : undefined;
              if (isUrl(target)) {
                // YouTube support for both .md and .mdx
                if (isMdx) {
                  replacementNodes.push(toMdxYouTubeNode(target, widthPct));
                } else {
                  const id = youtubeIdFromUrl(target);
                  if (id) {
                    const src = `https://www.youtube.com/embed/${id}`;
                    const styleAttr = widthPct ? ` style=\"width:${widthPct}%;\"` : '';
                    replacementNodes.push({
                      type: 'html',
                      value: `<figure class=\"blog-embed\"${styleAttr}><iframe src=\"${src}\" title=\"YouTube video\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></figure>`,
                    });
                  } else {
                    // Not recognized, keep original text
                    currentParaChildren.push({ type: 'text', value: full });
                  }
                }
              } else {
                // Images require MDX to import from src/assets.
                if (isMdx) {
                  replacementNodes.push(toMdxFigureNode(target, widthPct));
                } else {
                  // Fallback: keep original text in non-MDX files
                  currentParaChildren.push({ type: 'text', value: full });
                }
              }
              lastIndex = start + full.length;
            }
            if (lastIndex < value.length) {
              currentParaChildren.push({ type: 'text', value: value.slice(lastIndex) });
            }
            k++;
            continue;
          }

          // Handle case: text ending with '![[', followed by link, then text starting with ']]'
          if (
            child.type === 'text' &&
            typeof child.value === 'string' &&
            child.value.includes('![[') &&
            k + 2 < ch.length &&
            ch[k + 1].type === 'link' &&
            ch[k + 2].type === 'text' &&
            typeof ch[k + 2].value === 'string'
          ) {
            const openIdx = child.value.lastIndexOf('![[');
            const before = child.value.slice(0, openIdx);
            const afterOpen = child.value.slice(openIdx + 3);
            const trailing = ch[k + 2].value;
            const closeIdx = trailing.indexOf(']]');
            if (/^\s*$/.test(afterOpen) && closeIdx !== -1) {
              found = true;
              if (before) currentParaChildren.push({ type: 'text', value: before });
              flushPara();
              let widthPct;
              const widthMatch = /^\|([0-9]{1,3})%/.exec(trailing.slice(0, closeIdx));
              if (widthMatch) widthPct = parseInt(widthMatch[1], 10);
              const url = ch[k + 1].url || (ch[k + 1].children && ch[k + 1].children[0] && ch[k + 1].children[0].value) || '';
              if (isUrl(url)) {
                if (isMdx) {
                  replacementNodes.push(toMdxYouTubeNode(url, widthPct));
                } else {
                  const id = youtubeIdFromUrl(url);
                  if (id) {
                    const src = `https://www.youtube.com/embed/${id}`;
                    const styleAttr = widthPct ? ` style=\"width:${widthPct}%;\"` : '';
                    replacementNodes.push({
                      type: 'html',
                      value: `<figure class=\"blog-embed\"${styleAttr}><iframe src=\"${src}\" title=\"YouTube video\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></figure>`,
                    });
                  }
                }
              }
              const afterClose = trailing.slice(closeIdx + 2);
              if (afterClose) currentParaChildren.push({ type: 'text', value: afterClose });
              k += 3;
              continue;
            }
          }

          // Default: keep child
          currentParaChildren.push(child);
          k++;
        }
        flushPara();

        if (found) {
          // Replace the original paragraph with the sequence (para(s) + embeds)
          tree.children.splice(i, 1, ...replacementNodes);
          // Advance index accordingly
          i += replacementNodes.length - 1;
          continue;
        }

        // Fallback: If no match yet, try a flat string parse to handle cases where other plugins split nodes
        const flat = (node.children || [])
          .map(c => {
            if (c.type === 'text') return c.value || '';
            if (c.type === 'link') return c.url || (c.children && c.children[0] && c.children[0].value) || '';
            return '';
          })
          .join('');
        if (typeof flat === 'string') {
          pattern.lastIndex = 0;
          let lastIndex = 0;
          const seq = [];
          let m;
          while ((m = pattern.exec(flat)) !== null) {
            const [full, target, width] = m;
            const start = m.index;
            if (start > lastIndex) {
              seq.push({ type: 'paragraph', children: [{ type: 'text', value: flat.slice(lastIndex, start) }] });
            }
            const widthPct = width ? parseInt(width, 10) : undefined;
            if (isUrl(target)) {
              if (isMdx) {
                seq.push(toMdxYouTubeNode(target, widthPct));
              } else {
                const id = youtubeIdFromUrl(target);
                if (id) {
                  const src = `https://www.youtube.com/embed/${id}`;
                  const styleAttr = widthPct ? ` style=\\"width:${widthPct}%;\\"` : '';
                  seq.push({
                    type: 'html',
                    value: `<figure class=\"blog-embed\"${styleAttr}><iframe src=\"${src}\" title=\"YouTube video\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></figure>`,
                  });
                } else {
                  seq.push({ type: 'paragraph', children: [{ type: 'text', value: full }] });
                }
              }
            } else {
              if (isMdx) {
                seq.push(toMdxFigureNode(target, widthPct));
              } else {
                seq.push({ type: 'paragraph', children: [{ type: 'text', value: full }] });
              }
            }
            lastIndex = start + full.length;
          }
          if (lastIndex < flat.length) {
            seq.push({ type: 'paragraph', children: [{ type: 'text', value: flat.slice(lastIndex) }] });
          }
          if (seq.length) {
            tree.children.splice(i, 1, ...seq);
            i += seq.length - 1;
          }
        }
      }
    }

    if (importNodes.length) {
      tree.children = [...importNodes, ...(tree.children || [])];
    }
  };
}
