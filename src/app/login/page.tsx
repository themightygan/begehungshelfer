"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginSeite() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="text-xl font-semibold">Anmelden</h1>
      <p className="mt-1 text-sm text-stone-500">
        Zugang für den Vorstand.
      </p>
      <form action={formAction} className="mt-6 space-y-3">
        <input
          type="email"
          name="email"
          autoFocus
          required
          autoComplete="username"
          placeholder="E-Mail-Adresse"
          className="block w-full rounded border border-stone-300 px-3 py-2"
        />
        <input
          type="password"
          name="passwort"
          required
          autoComplete="current-password"
          placeholder="Passwort"
          className="block w-full rounded border border-stone-300 px-3 py-2"
        />
        {state.fehler && (
          <p className="text-sm text-red-600">{state.fehler}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-emerald-700 px-3 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Prüfe…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
