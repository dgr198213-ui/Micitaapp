"use client";

import { useTransition } from "react";

export function ToggleButton({
  serviceId,
  active,
  action,
}: {
  serviceId: string;
  active: boolean;
  action: (serviceId: string, active: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action(serviceId, !active))}
      className="text-sm text-gray-600 underline hover:text-gray-900 disabled:opacity-50"
    >
      {active ? "Desactivar" : "Activar"}
    </button>
  );
}
