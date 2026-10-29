import type { Component } from 'vue';

/** Host context only. Each extension defines and validates its own argument/result shapes. */
export interface ToolRenderContext {
  tool: string;
  session?: string;
  arguments: unknown;
  output: unknown;
  metadata: unknown;
}
export interface ToolRenderBinding {
  component: Component;
  props: Record<string, unknown>;
}
export interface ExtensionToolPresentation {
  name: string;
  title: string;
  icon: string;
  tags: readonly string[];
  failed?(output: unknown): boolean;
  invocation?(context: ToolRenderContext): ToolRenderBinding | undefined;
  result(context: ToolRenderContext): ToolRenderBinding | undefined;
}
export interface ExtensionPresentation {
  id: string;
  tools: readonly ExtensionToolPresentation[];
}
