export type ShellNode =
  | string
  | { tag: string; props: Record<string, unknown>; children: ShellNode[] };
