import { Component, lazy, Suspense, type ReactNode } from 'react';
import styles from './Markdown.module.css';

// The Markdown renderer is the largest part of a web app's bundle; most screens never show Markdown.
const MarkdownContent = lazy(() => import('./MarkdownContent.js'));

export type MarkdownProps = {
  /**
   * Markdown with GitHub tables and lists. Raw HTML in it is shown as text, never rendered; links
   * keep safe protocols only.
   */
  readonly text: string;
};

/** Shows `fallback` when the renderer fails to load, for example offline or after a deploy. */
class LoadFailure extends Component<
  { readonly fallback: ReactNode; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Text written in Markdown, such as a chat message, in the kit's typography. Until the renderer
 * has loaded, or when it cannot load, the text shows as written.
 */
export const Markdown = ({ text }: MarkdownProps) => {
  const plain = <p>{text}</p>;
  return (
    <div className={styles.markdown}>
      <LoadFailure fallback={plain}>
        <Suspense fallback={plain}>
          <MarkdownContent text={text} />
        </Suspense>
      </LoadFailure>
    </div>
  );
};
