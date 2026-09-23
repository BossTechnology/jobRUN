"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import { sendMagicLink, signInWithPassword } from "./actions";

const TXT = {
  en: {
    title: "Sign in to jobRUN", sub: "PINCH operations team", email: "Email", password: "Password", signIn: "Sign in",
    link: "Email me a sign-in link instead", usePassword: "Use my password instead", sendLink: "Send link",
    sent: "Check your email for the sign-in link.", missing: "Enter your email and password.",
    invalid: "That email and password don't match an operator account.", linkErr: "We couldn't send a link to that address.",
    notOperator: "This account isn't on the operations team. Ask an admin to add you to operators.",
  },
  es: {
    title: "Ingresar a jobRUN", sub: "Equipo de operaciones de PINCH", email: "Correo", password: "Contraseña", signIn: "Ingresar",
    link: "Enviarme un enlace de ingreso por correo", usePassword: "Usar mi contraseña", sendLink: "Enviar enlace",
    sent: "Revisa tu correo para el enlace de ingreso.", missing: "Escribe tu correo y contraseña.",
    invalid: "Ese correo y contraseña no corresponden a una cuenta de operador.", linkErr: "No pudimos enviar un enlace a ese correo.",
    notOperator: "Esta cuenta no está en el equipo de operaciones. Pide a un administrador que te agregue a operators.",
  },
};

const readLang = () => {
  try { return localStorage.getItem("jm_lang") === "es" ? "es" : "en"; } catch { return "en"; }
};

export function LoginForm({ initialError }: { initialError?: string }) {
  const lang = useSyncExternalStore(() => () => {}, readLang, () => "en") as "en" | "es";
  const t = TXT[lang];
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, undefined);
  const [lkState, lkAction, lkPending] = useActionState(sendMagicLink, undefined);
  const state = mode === "password" ? pwState : lkState;
  const err = state?.error ?? initialError;
  const msg = err === "missing" ? t.missing : err === "invalid" ? t.invalid : err === "link" ? t.linkErr : err === "not-operator" ? t.notOperator : null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gray-bg)", padding: 16 }}>
      <div className="glob-modal" style={{ width: 380 }}>
        <div className="glob-modal-head">
          <div className="glob-modal-info">
            <h3>{t.title}</h3>
            <p>{t.sub}</p>
          </div>
          <div className="jm-brand">jobRUN</div>
        </div>
        <form action={mode === "password" ? pwAction : lkAction} className="glob-modal-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="jm-lbl" htmlFor="email">{t.email}</label>
          <input className="jm-in" id="email" name="email" type="email" autoComplete="email" required />
          {mode === "password" && (
            <>
              <label className="jm-lbl" htmlFor="password">{t.password}</label>
              <input className="jm-in" id="password" name="password" type="password" autoComplete="current-password" required />
            </>
          )}
          {msg && <div className="jm-banner warn"><span>{msg}</span></div>}
          {lkState?.sent && mode === "link" && <div className="jm-banner info"><span>{t.sent}</span></div>}
          <button className="jm-btn pri" type="submit" disabled={pwPending || lkPending}>{mode === "password" ? t.signIn : t.sendLink}</button>
          <button className="jm-btn sm" type="button" onClick={() => setMode(mode === "password" ? "link" : "password")}>
            {mode === "password" ? t.link : t.usePassword}
          </button>
        </form>
      </div>
    </div>
  );
}
