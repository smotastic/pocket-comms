import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** The renderer behind `Markdown`, in a module of its own so a page loads it only when it shows Markdown. */
const MarkdownContent = ({ text }: { readonly text: string }) => (
  // No images: text from elsewhere must not make the browser fetch from elsewhere.
  <ReactMarkdown remarkPlugins={[remarkGfm]} disallowedElements={['img']} unwrapDisallowed>
    {text}
  </ReactMarkdown>
);

export default MarkdownContent;
