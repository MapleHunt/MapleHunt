import { useEffect, useState } from "react";

/** A short confirmation message ("Sent to Ridge Camp", "Copied"…). */
export function useToast(durationMs = 2400) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs]);

  const toast = message ? (
    <div className="m-toast" role="status">
      {message}
    </div>
  ) : null;

  return { show: setMessage, toast };
}
