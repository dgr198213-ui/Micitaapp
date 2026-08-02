"use client";

import { useActionState, useState } from "react";
import { sendMagicLinkAction, signInWithPasswordAction } from "./actions";

interface PasswordState {
  error?: string;
}
interface MagicLinkState {
  error?: string;
  sent: boolean;
}
const initialPasswordState: PasswordState = {};
const initialMagicLinkState: MagicLinkState = { sent: false };

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(
    async (_: typeof initialPasswordState, formData: FormData) => signInWithPasswordAction(formData),
    initialPasswordState
  );
  const [magicState, magicAction, magicPending] = useActionState(
    async (_: typeof initialMagicLinkState, formData: FormData) => {
      const result = await sendMagicLinkAction(formData);
      return { error: result.error, sent: result.sent ?? false };
    },
    initialMagicLinkState
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Acceso para negocios</h1>

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`rounded px-3 py-1 ${mode === "password" ? "bg-gray-900 text-white" : "bg-gray-100"}`}
        >
          Contraseña
        </button>
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={`rounded px-3 py-1 ${mode === "magic" ? "bg-gray-900 text-white" : "bg-gray-100"}`}
        >
          Enlace mágico
        </button>
      </div>

      {mode === "password" ? (
        <form action={passwordAction} className="flex flex-col gap-3">
          <input name="email" type="email" required placeholder="Email" className="rounded border px-3 py-2" />
          <input name="password" type="password" required placeholder="Contraseña" className="rounded border px-3 py-2" />
          {passwordState.error && <p className="text-sm text-red-600">{passwordState.error}</p>}
          <button
            type="submit"
            disabled={passwordPending}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {passwordPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      ) : (
        <form action={magicAction} className="flex flex-col gap-3">
          <input name="email" type="email" required placeholder="Email" className="rounded border px-3 py-2" />
          {magicState.error && <p className="text-sm text-red-600">{magicState.error}</p>}
          {magicState.sent && <p className="text-sm text-green-700">Revisa tu email para el enlace de acceso.</p>}
          <button
            type="submit"
            disabled={magicPending}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {magicPending ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
    </main>
  );
}
