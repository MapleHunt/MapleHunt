export function formatWithOptions(_options: unknown, ...args: unknown[]): string {
  return args.map(String).join(" ");
}

export const types = {
  isNativeError: (value: unknown): value is Error => value instanceof Error,
};
