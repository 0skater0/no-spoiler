// Helpers for GitHub Actions workflow commands (::warning:: and friends).

/** Escapes the message part of a workflow command, as the runner expects it. */
export function escapeCommandData(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
