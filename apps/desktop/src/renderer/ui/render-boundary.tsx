import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { fallback: (reason: string) => ReactNode; children: ReactNode };
type State = { reason: string | null };

// Keeps a failure inside one area (a 3D view without WebGL, a chunk that did not load) from blanking the app.
export class RenderBoundary extends Component<Props, State> {
  override state: State = { reason: null };

  static getDerivedStateFromError(error: unknown): State {
    return { reason: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.reason === null ? this.props.children : this.props.fallback(this.state.reason);
  }
}
